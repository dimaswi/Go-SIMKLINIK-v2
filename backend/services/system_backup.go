package services

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"starter/backend/config"
	"starter/backend/database"
	"starter/backend/models"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	psdisk "github.com/shirou/gopsutil/v3/disk"
	"gorm.io/gorm"
)

const (
	backupStatusIdle      = "idle"
	backupStatusRunning   = "running"
	backupStatusCompleted = "completed"
	backupStatusPartial   = "partial"
	backupStatusFailed    = "failed"

	backupTypeDatabase = "database"
	backupTypeUploads  = "uploads"

	triggerManual    = "manual"
	triggerScheduled = "scheduled"

	settingAutoEnabled    = "system_backup_auto_enabled"
	settingCron           = "system_backup_cron"
	settingRetentionDays  = "system_backup_retention_days"
	settingIncludeUploads = "system_backup_include_uploads"
	settingLastStartedAt  = "system_backup_last_started_at"
	settingLastFinishedAt = "system_backup_last_finished_at"
	settingLastStatus     = "system_backup_last_status"
	settingLastMessage    = "system_backup_last_message"
	settingLastDurationMs = "system_backup_last_duration_ms"
	settingLastRunKey     = "system_backup_last_run_key"
	settingLastTrigger    = "system_backup_last_trigger_source"
	settingRunning        = "system_backup_running"
	defaultFilePageSize   = 20
)

var errBackupRunning = errors.New("backup sedang berjalan")

func IsSystemBackupRunningError(err error) bool {
	return errors.Is(err, errBackupRunning)
}

type SystemBackupSettings struct {
	AutoEnabled    bool   `json:"auto_enabled"`
	CronExpression string `json:"cron_expression"`
	RetentionDays  int    `json:"retention_days"`
	IncludeUploads bool   `json:"include_uploads"`
	StoragePath    string `json:"storage_path"`
	UploadsPath    string `json:"uploads_path"`
	Running        bool   `json:"running"`
	NextRunAt      string `json:"next_run_at,omitempty"`
	LastStartedAt  string `json:"last_started_at,omitempty"`
	LastFinishedAt string `json:"last_finished_at,omitempty"`
	LastStatus     string `json:"last_status"`
	LastMessage    string `json:"last_message"`
	LastRunKey     string `json:"last_run_key,omitempty"`
	LastTrigger    string `json:"last_trigger_source,omitempty"`
	LastDurationMs int64  `json:"last_duration_ms"`
}

type StoragePathSummary struct {
	Path       string `json:"path"`
	Exists     bool   `json:"exists"`
	SizeBytes  int64  `json:"size_bytes"`
	FileCount  int64  `json:"file_count"`
	LastFileAt string `json:"last_file_at,omitempty"`
}

type DiskUsageSummary struct {
	Path        string  `json:"path"`
	Mountpoint  string  `json:"mountpoint"`
	TotalBytes  uint64  `json:"total_bytes"`
	UsedBytes   uint64  `json:"used_bytes"`
	FreeBytes   uint64  `json:"free_bytes"`
	UsedPercent float64 `json:"used_percent"`
}

type BackupRunSummary struct {
	RunKey         string `json:"run_key"`
	TriggerSource  string `json:"trigger_source"`
	Status         string `json:"status"`
	StartedAt      string `json:"started_at"`
	FinishedAt     string `json:"finished_at,omitempty"`
	DurationMs     int64  `json:"duration_ms"`
	CompletedFiles int    `json:"completed_files"`
	FailedFiles    int    `json:"failed_files"`
	IncludeUploads bool   `json:"include_uploads"`
	Message        string `json:"message"`
}

type SystemBackupOverview struct {
	Settings       SystemBackupSettings      `json:"settings"`
	DiskUsage      *DiskUsageSummary         `json:"disk_usage,omitempty"`
	BackupStorage  StoragePathSummary        `json:"backup_storage"`
	UploadsStorage StoragePathSummary        `json:"uploads_storage"`
	LatestRun      *BackupRunSummary         `json:"latest_run,omitempty"`
	RecentFiles    []models.SystemBackupFile `json:"recent_files"`
}

type backupManager struct {
	config  *config.Config
	cron    *cron.Cron
	entryID cron.EntryID
	running bool
	mu      sync.Mutex
}

var systemBackupManager *backupManager

func InitSystemBackupManager(cfg *config.Config) error {
	manager := &backupManager{config: cfg}
	if err := manager.ensureBackupDirectory(); err != nil {
		return err
	}
	if err := manager.ReloadSchedule(); err != nil {
		systemBackupManager = manager
		return err
	}
	systemBackupManager = manager
	return nil
}

func GetSystemBackupOverview() (*SystemBackupOverview, error) {
	manager := getBackupManager()
	settings, err := manager.loadSettings()
	if err != nil {
		return nil, err
	}

	backupSummary, err := summarizePath(settings.StoragePath)
	if err != nil {
		return nil, err
	}

	uploadsSummary, err := summarizePath(settings.UploadsPath)
	if err != nil {
		return nil, err
	}

	diskUsage, err := summarizeDisk(settings.StoragePath)
	if err != nil {
		log.Println("system backup disk summary warning:", err)
	}

	latestRun, err := manager.loadLatestRunSummary()
	if err != nil {
		return nil, err
	}

	recentFiles, err := listBackupFiles(1, 5)
	if err != nil {
		return nil, err
	}

	return &SystemBackupOverview{
		Settings:       settings,
		DiskUsage:      diskUsage,
		BackupStorage:  backupSummary,
		UploadsStorage: uploadsSummary,
		LatestRun:      latestRun,
		RecentFiles:    recentFiles,
	}, nil
}

func ListSystemBackupFiles(page, perPage int) ([]models.SystemBackupFile, int64, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 {
		perPage = defaultFilePageSize
	}

	var total int64
	query := database.DB.Model(&models.SystemBackupFile{})
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var files []models.SystemBackupFile
	err := database.DB.
		Preload("TriggeredByUser").
		Order("created_at DESC").
		Limit(perPage).
		Offset((page - 1) * perPage).
		Find(&files).Error
	if err != nil {
		return nil, 0, err
	}

	return files, total, nil
}

func UpdateSystemBackupSettings(payload map[string]string) (SystemBackupSettings, error) {
	manager := getBackupManager()
	settings, err := manager.loadSettings()
	if err != nil {
		return SystemBackupSettings{}, err
	}

	if cronExpression := strings.TrimSpace(payload[settingCron]); cronExpression != "" {
		if _, err := cron.ParseStandard(cronExpression); err != nil {
			return SystemBackupSettings{}, fmt.Errorf("cron expression tidak valid: %w", err)
		}
	}

	for key, value := range payload {
		if err := upsertSetting(key, value); err != nil {
			return SystemBackupSettings{}, err
		}
	}

	if payload[settingCron] == "" && settings.CronExpression == "" {
		if err := upsertSetting(settingCron, manager.config.DefaultBackupCron); err != nil {
			return SystemBackupSettings{}, err
		}
	}

	if err := manager.ReloadSchedule(); err != nil {
		return SystemBackupSettings{}, err
	}

	return manager.loadSettings()
}

func RunSystemBackupNow(triggerSource string, triggeredByUserID *uint) (*BackupRunSummary, error) {
	manager := getBackupManager()
	return manager.run(triggerSource, triggeredByUserID)
}

func ResolveSystemBackupFilePath(fileID uint) (*models.SystemBackupFile, string, error) {
	manager := getBackupManager()
	var backupFile models.SystemBackupFile
	if err := database.DB.Preload("TriggeredByUser").First(&backupFile, fileID).Error; err != nil {
		return nil, "", err
	}

	storagePath := filepath.Clean(manager.config.BackupStoragePath)
	relativePath := filepath.Clean(backupFile.RelativePath)
	absPath := filepath.Clean(filepath.Join(storagePath, relativePath))
	if !strings.HasPrefix(absPath, storagePath) {
		return nil, "", fmt.Errorf("invalid backup path")
	}

	if _, err := os.Stat(absPath); err != nil {
		return nil, "", err
	}

	return &backupFile, absPath, nil
}

func (manager *backupManager) run(triggerSource string, triggeredByUserID *uint) (*BackupRunSummary, error) {
	manager.mu.Lock()
	if manager.running {
		manager.mu.Unlock()
		return nil, errBackupRunning
	}
	manager.running = true
	manager.mu.Unlock()

	defer func() {
		manager.mu.Lock()
		manager.running = false
		manager.mu.Unlock()
		_ = upsertSetting(settingRunning, "0")
	}()

	settings, err := manager.loadSettings()
	if err != nil {
		return nil, err
	}

	if err := manager.ensureBackupDirectory(); err != nil {
		return nil, err
	}

	startedAt := time.Now()
	runKey := startedAt.Format("20060102-150405")
	_ = upsertSetting(settingRunning, "1")
	_ = upsertSetting(settingLastStartedAt, startedAt.Format(time.RFC3339))
	_ = upsertSetting(settingLastStatus, backupStatusRunning)
	_ = upsertSetting(settingLastRunKey, runKey)
	_ = upsertSetting(settingLastTrigger, triggerSource)
	_ = upsertSetting(settingLastMessage, "Backup sedang berjalan.")

	results := make([]models.SystemBackupFile, 0, 2)

	databaseResult := manager.createDatabaseBackup(runKey, triggerSource, triggeredByUserID)
	results = append(results, databaseResult)

	if settings.IncludeUploads {
		uploadsResult := manager.createUploadsBackup(runKey, triggerSource, triggeredByUserID, settings.UploadsPath)
		results = append(results, uploadsResult)
	}

	completedCount := 0
	failedCount := 0
	for _, item := range results {
		if item.Status == backupStatusCompleted {
			completedCount++
			continue
		}
		failedCount++
	}

	finishedAt := time.Now()
	duration := finishedAt.Sub(startedAt)
	status := backupStatusCompleted
	message := "Backup sistem berhasil dibuat."
	switch {
	case completedCount == 0:
		status = backupStatusFailed
		message = "Semua artefak backup gagal dibuat."
	case failedCount > 0:
		status = backupStatusPartial
		message = "Sebagian artefak backup berhasil dibuat, sebagian gagal."
	}

	_ = upsertSetting(settingLastFinishedAt, finishedAt.Format(time.RFC3339))
	_ = upsertSetting(settingLastStatus, status)
	_ = upsertSetting(settingLastMessage, message)
	_ = upsertSetting(settingLastDurationMs, strconv.FormatInt(duration.Milliseconds(), 10))

	if err := cleanupExpiredBackups(settings.RetentionDays, manager.config.BackupStoragePath); err != nil {
		log.Println("system backup cleanup warning:", err)
	}

	return &BackupRunSummary{
		RunKey:         runKey,
		TriggerSource:  triggerSource,
		Status:         status,
		StartedAt:      startedAt.Format(time.RFC3339),
		FinishedAt:     finishedAt.Format(time.RFC3339),
		DurationMs:     duration.Milliseconds(),
		CompletedFiles: completedCount,
		FailedFiles:    failedCount,
		IncludeUploads: settings.IncludeUploads,
		Message:        message,
	}, nil
}

func (manager *backupManager) createDatabaseBackup(runKey, triggerSource string, triggeredByUserID *uint) models.SystemBackupFile {
	storageDir, relativeDir, err := manager.ensureDatedStorageDir()
	if err != nil {
		return manager.persistFailure(runKey, backupTypeDatabase, triggerSource, triggeredByUserID, err)
	}

	fileName := fmt.Sprintf("simklinik-db-%s.dump", runKey)
	absPath := filepath.Join(storageDir, fileName)
	outputFile, err := os.Create(absPath)
	if err != nil {
		return manager.persistFailure(runKey, backupTypeDatabase, triggerSource, triggeredByUserID, err)
	}
	defer outputFile.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	command, err := manager.buildDatabaseDumpCommand(ctx)
	if err != nil {
		_ = outputFile.Close()
		_ = os.Remove(absPath)
		return manager.persistFailure(runKey, backupTypeDatabase, triggerSource, triggeredByUserID, err)
	}
	command.Stdout = outputFile
	command.Stderr = outputFile

	if err := command.Run(); err != nil {
		_ = outputFile.Close()
		_ = os.Remove(absPath)
		return manager.persistFailure(runKey, backupTypeDatabase, triggerSource, triggeredByUserID, fmt.Errorf("pg_dump gagal: %w", err))
	}

	fileInfo, err := os.Stat(absPath)
	if err != nil {
		return manager.persistFailure(runKey, backupTypeDatabase, triggerSource, triggeredByUserID, err)
	}

	return manager.persistSuccess(runKey, backupTypeDatabase, triggerSource, triggeredByUserID, fileName, filepath.ToSlash(filepath.Join(relativeDir, fileName)), fileInfo.Size())
}

func (manager *backupManager) buildDatabaseDumpCommand(ctx context.Context) (*exec.Cmd, error) {
	if _, err := exec.LookPath("pg_dump"); err == nil {
		command := exec.CommandContext(
			ctx,
			"pg_dump",
			"-h", manager.config.DatabaseHost,
			"-p", manager.config.DatabasePort,
			"-U", manager.config.DatabaseUser,
			"-d", manager.config.DatabaseName,
			"-Fc",
		)
		command.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", manager.config.DatabasePassword))
		return command, nil
	}

	containerName, err := resolvePostgresContainerName(manager.config.DatabaseHost)
	if err != nil {
		return nil, fmt.Errorf("pg_dump tidak ditemukan di host dan fallback docker tidak tersedia: %w", err)
	}

	command := exec.CommandContext(
		ctx,
		"docker",
		"exec",
		"-e", fmt.Sprintf("PGPASSWORD=%s", manager.config.DatabasePassword),
		containerName,
		"pg_dump",
		"-U", manager.config.DatabaseUser,
		"-d", manager.config.DatabaseName,
		"-Fc",
	)
	return command, nil
}

func resolvePostgresContainerName(databaseHost string) (string, error) {
	candidates := make([]string, 0, 4)
	trimmedHost := strings.TrimSpace(databaseHost)
	if trimmedHost != "" && trimmedHost != "localhost" && trimmedHost != "127.0.0.1" {
		candidates = append(candidates, trimmedHost)
	}
	candidates = append(candidates, "simklinik-database", "simklinik-database-dev")

	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}

		checkCommand := exec.Command("docker", "inspect", "--format", "{{.State.Running}}", candidate)
		output, err := checkCommand.CombinedOutput()
		if err != nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(string(output)), "true") {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("container postgres aktif tidak ditemukan")
}

func (manager *backupManager) createUploadsBackup(runKey, triggerSource string, triggeredByUserID *uint, uploadsPath string) models.SystemBackupFile {
	if strings.TrimSpace(uploadsPath) == "" {
		return manager.persistFailure(runKey, backupTypeUploads, triggerSource, triggeredByUserID, fmt.Errorf("uploads path tidak tersedia"))
	}

	if _, err := os.Stat(uploadsPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return manager.persistFailure(runKey, backupTypeUploads, triggerSource, triggeredByUserID, fmt.Errorf("folder uploads tidak ditemukan"))
		}
		return manager.persistFailure(runKey, backupTypeUploads, triggerSource, triggeredByUserID, err)
	}

	storageDir, relativeDir, err := manager.ensureDatedStorageDir()
	if err != nil {
		return manager.persistFailure(runKey, backupTypeUploads, triggerSource, triggeredByUserID, err)
	}

	fileName := fmt.Sprintf("simklinik-uploads-%s.tar.gz", runKey)
	absPath := filepath.Join(storageDir, fileName)
	if err := createTarGz(absPath, uploadsPath); err != nil {
		_ = os.Remove(absPath)
		return manager.persistFailure(runKey, backupTypeUploads, triggerSource, triggeredByUserID, err)
	}

	fileInfo, err := os.Stat(absPath)
	if err != nil {
		return manager.persistFailure(runKey, backupTypeUploads, triggerSource, triggeredByUserID, err)
	}

	return manager.persistSuccess(runKey, backupTypeUploads, triggerSource, triggeredByUserID, fileName, filepath.ToSlash(filepath.Join(relativeDir, fileName)), fileInfo.Size())
}

func (manager *backupManager) persistSuccess(runKey, backupType, triggerSource string, triggeredByUserID *uint, fileName, relativePath string, sizeBytes int64) models.SystemBackupFile {
	completedAt := time.Now()
	backupFile := models.SystemBackupFile{
		RunKey:            runKey,
		BackupType:        backupType,
		TriggerSource:     triggerSource,
		Status:            backupStatusCompleted,
		FileName:          fileName,
		RelativePath:      relativePath,
		SizeBytes:         sizeBytes,
		TriggeredByUserID: triggeredByUserID,
		CompletedAt:       &completedAt,
	}
	if err := database.DB.Create(&backupFile).Error; err != nil {
		log.Println("system backup save success record warning:", err)
	}
	return backupFile
}

func (manager *backupManager) persistFailure(runKey, backupType, triggerSource string, triggeredByUserID *uint, backupErr error) models.SystemBackupFile {
	message := strings.TrimSpace(backupErr.Error())
	backupFile := models.SystemBackupFile{
		RunKey:            runKey,
		BackupType:        backupType,
		TriggerSource:     triggerSource,
		Status:            backupStatusFailed,
		TriggeredByUserID: triggeredByUserID,
		ErrorMessage:      message,
	}
	if err := database.DB.Create(&backupFile).Error; err != nil {
		log.Println("system backup save failure record warning:", err)
	}
	return backupFile
}

func (manager *backupManager) ReloadSchedule() error {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	if manager.cron != nil {
		manager.cron.Stop()
		manager.cron = nil
		manager.entryID = 0
	}

	settings, err := manager.loadSettings()
	if err != nil {
		return err
	}

	if !settings.AutoEnabled {
		return nil
	}

	jobCron := cron.New(cron.WithLocation(time.Local))
	entryID, err := jobCron.AddFunc(settings.CronExpression, func() {
		if _, runErr := manager.run(triggerScheduled, nil); runErr != nil && !errors.Is(runErr, errBackupRunning) {
			log.Println("scheduled system backup error:", runErr)
		}
	})
	if err != nil {
		return err
	}

	manager.cron = jobCron
	manager.entryID = entryID
	manager.cron.Start()
	return nil
}

func (manager *backupManager) loadSettings() (SystemBackupSettings, error) {
	settingsMap, err := getSettingsMap(
		settingAutoEnabled,
		settingCron,
		settingRetentionDays,
		settingIncludeUploads,
		settingLastStartedAt,
		settingLastFinishedAt,
		settingLastStatus,
		settingLastMessage,
		settingLastDurationMs,
		settingLastRunKey,
		settingLastTrigger,
		settingRunning,
	)
	if err != nil {
		return SystemBackupSettings{}, err
	}

	settings := SystemBackupSettings{
		AutoEnabled:    parseBoolSetting(settingsMap[settingAutoEnabled], true),
		CronExpression: fallbackString(settingsMap[settingCron], manager.config.DefaultBackupCron),
		RetentionDays:  parseIntSetting(settingsMap[settingRetentionDays], manager.config.DefaultBackupRetentionDays),
		IncludeUploads: parseBoolSetting(settingsMap[settingIncludeUploads], manager.config.DefaultBackupIncludeUploads),
		StoragePath:    filepath.Clean(manager.config.BackupStoragePath),
		UploadsPath:    filepath.Clean(manager.config.UploadsPath),
		Running:        parseBoolSetting(settingsMap[settingRunning], manager.running),
		LastStartedAt:  strings.TrimSpace(settingsMap[settingLastStartedAt]),
		LastFinishedAt: strings.TrimSpace(settingsMap[settingLastFinishedAt]),
		LastStatus:     fallbackString(settingsMap[settingLastStatus], backupStatusIdle),
		LastMessage:    fallbackString(settingsMap[settingLastMessage], "Belum ada backup yang dijalankan."),
		LastRunKey:     strings.TrimSpace(settingsMap[settingLastRunKey]),
		LastTrigger:    strings.TrimSpace(settingsMap[settingLastTrigger]),
		LastDurationMs: int64(parseIntSetting(settingsMap[settingLastDurationMs], 0)),
	}

	if manager.cron != nil && manager.entryID != 0 {
		entry := manager.cron.Entry(manager.entryID)
		if !entry.Next.IsZero() {
			settings.NextRunAt = entry.Next.Format(time.RFC3339)
		}
	}

	return settings, nil
}

func (manager *backupManager) loadLatestRunSummary() (*BackupRunSummary, error) {
	var latestFile models.SystemBackupFile
	if err := database.DB.Order("created_at DESC").First(&latestFile).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	var runFiles []models.SystemBackupFile
	if err := database.DB.Where("run_key = ?", latestFile.RunKey).Find(&runFiles).Error; err != nil {
		return nil, err
	}

	completed := 0
	failed := 0
	startedAt := latestFile.CreatedAt
	finishedAt := latestFile.CreatedAt
	for _, item := range runFiles {
		if item.CreatedAt.Before(startedAt) {
			startedAt = item.CreatedAt
		}
		if item.CompletedAt != nil && item.CompletedAt.After(finishedAt) {
			finishedAt = *item.CompletedAt
		}
		if item.Status == backupStatusCompleted {
			completed++
		} else {
			failed++
		}
	}

	status := backupStatusCompleted
	message := "Backup sistem berhasil dibuat."
	if completed == 0 {
		status = backupStatusFailed
		message = "Semua artefak backup gagal dibuat."
	} else if failed > 0 {
		status = backupStatusPartial
		message = "Sebagian artefak backup berhasil dibuat, sebagian gagal."
	}

	includeUploads := false
	for _, item := range runFiles {
		if item.BackupType == backupTypeUploads {
			includeUploads = true
			break
		}
	}

	return &BackupRunSummary{
		RunKey:         latestFile.RunKey,
		TriggerSource:  latestFile.TriggerSource,
		Status:         status,
		StartedAt:      startedAt.Format(time.RFC3339),
		FinishedAt:     finishedAt.Format(time.RFC3339),
		DurationMs:     finishedAt.Sub(startedAt).Milliseconds(),
		CompletedFiles: completed,
		FailedFiles:    failed,
		IncludeUploads: includeUploads,
		Message:        message,
	}, nil
}

func (manager *backupManager) ensureBackupDirectory() error {
	return os.MkdirAll(manager.config.BackupStoragePath, 0755)
}

func (manager *backupManager) ensureDatedStorageDir() (string, string, error) {
	relativeDir := filepath.Join(time.Now().Format("2006"), time.Now().Format("01"), time.Now().Format("02"))
	absDir := filepath.Join(manager.config.BackupStoragePath, relativeDir)
	if err := os.MkdirAll(absDir, 0755); err != nil {
		return "", "", err
	}
	return absDir, relativeDir, nil
}

func getBackupManager() *backupManager {
	if systemBackupManager == nil {
		panic("system backup manager is not initialized")
	}
	return systemBackupManager
}

func getSettingsMap(keys ...string) (map[string]string, error) {
	var settings []models.Setting
	if err := database.DB.Where("key IN ?", keys).Find(&settings).Error; err != nil {
		return nil, err
	}

	settingsMap := make(map[string]string, len(keys))
	for _, setting := range settings {
		settingsMap[setting.Key] = setting.Value
	}
	return settingsMap, nil
}

func upsertSetting(key, value string) error {
	var setting models.Setting
	result := database.DB.Where("key = ?", key).First(&setting)
	if result.Error != nil {
		if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return result.Error
		}
		return database.DB.Create(&models.Setting{Key: key, Value: value}).Error
	}

	setting.Value = value
	return database.DB.Save(&setting).Error
}

func parseBoolSetting(value string, defaultValue bool) bool {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return defaultValue
	}
}

func parseIntSetting(value string, defaultValue int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return defaultValue
	}
	return parsed
}

func fallbackString(value, defaultValue string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return defaultValue
	}
	return trimmed
}

func summarizePath(path string) (StoragePathSummary, error) {
	cleanPath := filepath.Clean(path)
	info, err := os.Stat(cleanPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return StoragePathSummary{Path: cleanPath, Exists: false}, nil
		}
		return StoragePathSummary{}, err
	}

	summary := StoragePathSummary{Path: cleanPath, Exists: true}
	if !info.IsDir() {
		summary.SizeBytes = info.Size()
		summary.FileCount = 1
		summary.LastFileAt = info.ModTime().Format(time.RFC3339)
		return summary, nil
	}

	var latestTime time.Time
	err = filepath.Walk(cleanPath, func(currentPath string, currentInfo os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if currentInfo.IsDir() {
			return nil
		}
		summary.SizeBytes += currentInfo.Size()
		summary.FileCount++
		if currentInfo.ModTime().After(latestTime) {
			latestTime = currentInfo.ModTime()
		}
		return nil
	})
	if err != nil {
		return StoragePathSummary{}, err
	}

	if !latestTime.IsZero() {
		summary.LastFileAt = latestTime.Format(time.RFC3339)
	}
	return summary, nil
}

func summarizeDisk(path string) (*DiskUsageSummary, error) {
	usageTarget, err := resolveExistingPath(path)
	if err != nil {
		return nil, err
	}

	usage, err := psdisk.Usage(usageTarget)
	if err != nil {
		return nil, err
	}

	return &DiskUsageSummary{
		Path:        usageTarget,
		Mountpoint:  usage.Path,
		TotalBytes:  usage.Total,
		UsedBytes:   usage.Used,
		FreeBytes:   usage.Free,
		UsedPercent: usage.UsedPercent,
	}, nil
}

func resolveExistingPath(path string) (string, error) {
	current := filepath.Clean(path)
	for {
		if _, err := os.Stat(current); err == nil {
			return current, nil
		}

		next := filepath.Dir(current)
		if next == current {
			return "", fmt.Errorf("path tidak ditemukan: %s", path)
		}
		current = next
	}
}

func createTarGz(destinationPath, sourceDir string) error {
	destinationFile, err := os.Create(destinationPath)
	if err != nil {
		return err
	}
	defer destinationFile.Close()

	gzipWriter := gzip.NewWriter(destinationFile)
	defer gzipWriter.Close()

	tarWriter := tar.NewWriter(gzipWriter)
	defer tarWriter.Close()

	baseDir := filepath.Clean(sourceDir)
	return filepath.Walk(baseDir, func(currentPath string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if currentPath == baseDir {
			return nil
		}

		relativePath, err := filepath.Rel(baseDir, currentPath)
		if err != nil {
			return err
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(relativePath)

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		sourceFile, err := os.Open(currentPath)
		if err != nil {
			return err
		}
		defer sourceFile.Close()

		_, err = io.Copy(tarWriter, sourceFile)
		return err
	})
}

func cleanupExpiredBackups(retentionDays int, storagePath string) error {
	if retentionDays <= 0 {
		return nil
	}

	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	var expiredFiles []models.SystemBackupFile
	if err := database.DB.Where("created_at < ?", cutoff).Find(&expiredFiles).Error; err != nil {
		return err
	}

	storageRoot := filepath.Clean(storagePath)
	for _, file := range expiredFiles {
		if strings.TrimSpace(file.RelativePath) != "" {
			absPath := filepath.Clean(filepath.Join(storageRoot, file.RelativePath))
			if strings.HasPrefix(absPath, storageRoot) {
				_ = os.Remove(absPath)
			}
		}
		if err := database.DB.Delete(&file).Error; err != nil {
			return err
		}
	}

	return removeEmptyDirectories(storageRoot)
}

func removeEmptyDirectories(root string) error {
	var directories []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			directories = append(directories, path)
		}
		return nil
	})
	if err != nil {
		return err
	}

	sort.Slice(directories, func(i, j int) bool {
		return len(directories[i]) > len(directories[j])
	})

	for _, directory := range directories {
		if directory == root {
			continue
		}
		entries, err := os.ReadDir(directory)
		if err != nil {
			continue
		}
		if len(entries) == 0 {
			_ = os.Remove(directory)
		}
	}

	return nil
}

func listBackupFiles(page, perPage int) ([]models.SystemBackupFile, error) {
	files, _, err := ListSystemBackupFiles(page, perPage)
	return files, err
}
