package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"starter/backend/database"
	"starter/backend/models"
	"starter/backend/services/satusehat"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type satusehatAutoSyncResourceResult struct {
	ResourceType     string   `json:"resource_type"`
	MedicalRecordID  *uint    `json:"medical_record_id,omitempty"`
	Status           string   `json:"status"`
	Message          string   `json:"message"`
	ResourceID       string   `json:"resource_id,omitempty"`
	ExistingResource string   `json:"existing_resource_id,omitempty"`
	Warnings         []string `json:"warnings,omitempty"`
}

type satusehatVisitAutoSyncResult struct {
	VisitID         uint                              `json:"visit_id"`
	Trigger         string                            `json:"trigger"`
	Mode            string                            `json:"mode,omitempty"`
	ExecutedAt      time.Time                         `json:"executed_at"`
	JobStatus       string                            `json:"job_status,omitempty"`
	Error           string                            `json:"error,omitempty"`
	SentCount       int                               `json:"sent_count"`
	UnsentCount     int                               `json:"unsent_count"`
	SentResources   []satusehatAutoSyncResourceResult `json:"sent_resources"`
	UnsentResources []satusehatAutoSyncResourceResult `json:"unsent_resources"`
	Resources       []satusehatAutoSyncResourceResult `json:"resources"`
}

var satusehatAutoSyncInFlight sync.Map

var satusehatAutoSyncManagedResourceTypes = []string{
	"Organization",
	"Location",
	"Patient",
	"Practitioner",
	"Encounter",
	"Observation",
	"Condition",
	"ClinicalImpression",
	"LaboratoryOrderItem",
	"RadiologyOrderItem",
	"Procedure",
	"MedicationRequest",
	"MedicationDispense",
	"CarePlan",
	"Goal",
	"AllergyIntolerance",
	"Composition",
	"FamilyMemberHistory",
}

func parseTruthyFlag(value string) bool {
	normalized := strings.TrimSpace(strings.ToLower(value))
	return normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "y"
}

func acquireSATUSEHATAutoSyncJob(visitID uint) bool {
	if visitID == 0 {
		return false
	}
	_, loaded := satusehatAutoSyncInFlight.LoadOrStore(visitID, time.Now())
	return !loaded
}

func releaseSATUSEHATAutoSyncJob(visitID uint) {
	if visitID == 0 {
		return
	}
	satusehatAutoSyncInFlight.Delete(visitID)
}

func buildQueuedSATUSEHATAutoSyncResult(visitID uint, trigger, mode string) satusehatVisitAutoSyncResult {
	return satusehatVisitAutoSyncResult{
		VisitID:         visitID,
		Trigger:         strings.TrimSpace(trigger),
		Mode:            strings.TrimSpace(mode),
		ExecutedAt:      time.Now(),
		JobStatus:       "queued",
		SentCount:       0,
		UnsentCount:     0,
		SentResources:   []satusehatAutoSyncResourceResult{},
		UnsentResources: []satusehatAutoSyncResourceResult{},
		Resources:       []satusehatAutoSyncResourceResult{},
	}
}

func buildSATUSEHATAutoSyncSkippedResources(message string) []satusehatAutoSyncResourceResult {
	resources := make([]satusehatAutoSyncResourceResult, 0, len(satusehatAutoSyncManagedResourceTypes))
	for _, resourceType := range satusehatAutoSyncManagedResourceTypes {
		resources = append(resources, satusehatAutoSyncResourceResult{
			ResourceType: resourceType,
			Status:       "skipped",
			Message:      message,
		})
	}

	return resources
}

var satusehatAutoSyncResourceOrder = map[string]int{
	"organization":        10,
	"location":            20,
	"patient":             30,
	"practitioner":        40,
	"encounter":           50,
	"observation":         60,
	"condition":           70,
	"clinicalimpression":  80,
	"laboratoryorderitem": 90,
	"radiologyorderitem":  100,
	"procedure":           110,
	"medicationrequest":   120,
	"medicationdispense":  130,
	"careplan":            140,
	"goal":                150,
	"allergyintolerance":  160,
	"composition":         170,
	"familymemberhistory": 180,
}

func satusehatAutoSyncResourceRank(resourceType string) int {
	normalized := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(resourceType), " ", ""))
	normalized = strings.ReplaceAll(normalized, "-", "")
	normalized = strings.ReplaceAll(normalized, "_", "")
	if rank, ok := satusehatAutoSyncResourceOrder[normalized]; ok {
		return rank
	}
	return 999
}

func isSATUSEHATAutoSyncResourceReady(item satusehatAutoSyncResourceResult) bool {
	status := strings.TrimSpace(strings.ToLower(item.Status))
	if status == "synced" {
		return true
	}

	if strings.TrimSpace(item.ResourceID) != "" {
		return true
	}

	return strings.TrimSpace(item.ExistingResource) != ""
}

func resolveSATUSEHATAutoSyncResourceID(item satusehatAutoSyncResourceResult) string {
	if value := strings.TrimSpace(item.ResourceID); value != "" {
		return value
	}
	return strings.TrimSpace(item.ExistingResource)
}

func normalizeSATUSEHATAutoSyncResourceResult(item satusehatAutoSyncResourceResult) satusehatAutoSyncResourceResult {
	status := strings.TrimSpace(strings.ToLower(item.Status))
	if status != "failed" && status != "synced" && isSATUSEHATAutoSyncResourceReady(item) {
		item.Status = "synced"
		resourceID := resolveSATUSEHATAutoSyncResourceID(item)
		if resourceID != "" {
			resourceType := strings.TrimSpace(item.ResourceType)
			if resourceType == "" {
				resourceType = "Resource"
			}
			item.Message = fmt.Sprintf("%s sudah tersedia di SATUSEHAT (ID: %s)", resourceType, resourceID)
		}
	}

	return item
}

func hasSATUSEHATAutoSyncReadyItem(items []satusehatAutoSyncResourceResult) bool {
	for _, item := range items {
		if isSATUSEHATAutoSyncResourceReady(item) {
			return true
		}
	}

	return false
}

func buildSATUSEHATDependencySkipped(resourceType, prerequisite string) satusehatAutoSyncResourceResult {
	prerequisite = strings.TrimSpace(prerequisite)
	if prerequisite == "" {
		prerequisite = "resource prasyarat"
	}

	return satusehatAutoSyncResourceResult{
		ResourceType: resourceType,
		Status:       "skipped",
		Message:      fmt.Sprintf("%s di-skip karena prasyarat %s belum siap", resourceType, prerequisite),
		Warnings: []string{
			fmt.Sprintf("Lengkapi sinkronisasi %s terlebih dahulu", prerequisite),
		},
	}
}

func isSATUSEHATDuplicateError(errMessage string) bool {
	normalized := strings.ToLower(strings.TrimSpace(errMessage))
	if normalized == "" {
		return false
	}

	return strings.Contains(normalized, "duplicate") ||
		strings.Contains(normalized, "duplikat") ||
		strings.Contains(normalized, "already exists") ||
		strings.Contains(normalized, "sudah ada") ||
		strings.Contains(normalized, "telah terdaftar") ||
		strings.Contains(normalized, "konflik")
}

func summarizeSATUSEHATError(err error) string {
	if err == nil {
		return ""
	}

	text := strings.TrimSpace(err.Error())
	if text == "" {
		return ""
	}

	text = strings.Join(strings.Fields(text), " ")
	const maxLen = 180
	if len(text) > maxLen {
		return strings.TrimSpace(text[:maxLen]) + "..."
	}

	return text
}

func patientNIKLookupCandidates(rawNIK string) ([]string, []string) {
	normalized := satusehat.NormalizeIndonesianNIK(rawNIK)
	if normalized == "" {
		return nil, []string{"NIK pasien kosong, GET by NIK dilewati."}
	}

	warnings := make([]string, 0, 1)
	if satusehat.LooksLikeIndonesianNIK(normalized) {
		return []string{normalized}, warnings
	}

	warnings = append(warnings, "NIK pasien tidak valid (harus 16 digit), GET by NIK dilewati agar tidak memicu Invalid identifier value.")
	return nil, warnings
}

func resolveExistingSATUSEHATPatientID(ctx context.Context, config satusehat.Config, patient models.Patient) (string, []string) {
	warnings := make([]string, 0, 4)
	rawStoredResourceID := strings.TrimSpace(patient.SatusehatPatientID)
	if rawStoredResourceID != "" {
		warnings = append(warnings, "SATUSEHAT Patient ID sudah tersedia di data lokal, lookup ke SATUSEHAT dilewati.")
		return rawStoredResourceID, warnings
	}

	nikCandidates, nikWarnings := patientNIKLookupCandidates(patient.NIK)
	warnings = append(warnings, nikWarnings...)
	for _, candidateNIK := range nikCandidates {
		lookupByNIK, lookupByNIKErr := satusehat.LookupPatientByNIKWithName(ctx, config, candidateNIK, patient.FullName)
		if lookupByNIKErr != nil {
			warnings = append(warnings, fmt.Sprintf("GET Patient by NIK (%s) gagal: %s", candidateNIK, lookupByNIKErr.Error()))
			continue
		}
		if lookupByNIK.Found && strings.TrimSpace(lookupByNIK.ResourceID) != "" {
			return strings.TrimSpace(lookupByNIK.ResourceID), warnings
		}
	}
	if len(nikCandidates) > 0 {
		warnings = append(warnings, "Patient tidak ditemukan melalui GET by NIK.")
	}

	return "", warnings
}

func persistResolvedSATUSEHATPatientID(patientID uint, resourceID string) error {
	resolvedID := strings.TrimSpace(resourceID)
	if resolvedID == "" {
		return fmt.Errorf("SATUSEHAT Patient ID kosong")
	}

	now := time.Now()
	return database.DB.Model(&models.Patient{}).Where("id = ?", patientID).Updates(map[string]any{
		"satusehat_synced_at":  now,
		"satusehat_patient_id": resolvedID,
	}).Error
}

func persistSATUSEHATAutoSyncSnapshot(result satusehatVisitAutoSyncResult) {
	if result.VisitID == 0 {
		return
	}

	payloadBytes, err := json.Marshal(result)
	if err != nil {
		return
	}

	now := time.Now()
	snapshot := models.SATUSEHATAutoSyncSnapshot{
		VisitID:     result.VisitID,
		Trigger:     strings.TrimSpace(result.Trigger),
		Mode:        strings.TrimSpace(result.Mode),
		ExecutedAt:  result.ExecutedAt,
		SentCount:   result.SentCount,
		UnsentCount: result.UnsentCount,
		Payload:     string(payloadBytes),
	}

	_ = database.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "visit_id"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"trigger":      snapshot.Trigger,
			"mode":         snapshot.Mode,
			"executed_at":  snapshot.ExecutedAt,
			"sent_count":   snapshot.SentCount,
			"unsent_count": snapshot.UnsentCount,
			"payload":      snapshot.Payload,
			"updated_at":   now,
		}),
	}).Create(&snapshot).Error
}

func GetSATUSEHATStatus(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": config.PublicStatus()})
}

func GetSATUSEHATLogs(c *gin.Context) {
	limit, err := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("limit", "50")))
	if err != nil || limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	resourceType := strings.TrimSpace(c.Query("resource_type"))
	operation := strings.TrimSpace(c.Query("operation"))
	successFilter := strings.TrimSpace(strings.ToLower(c.Query("success")))

	var logs []models.SATUSEHATLog
	query := database.DB.Order("created_at DESC")
	if resourceType != "" && !strings.EqualFold(resourceType, "all") {
		query = query.Where("resource_type = ?", resourceType)
	}
	if operation != "" && !strings.EqualFold(operation, "all") {
		query = query.Where("operation = ?", operation)
	}
	if successFilter == "true" || successFilter == "1" {
		query = query.Where("success = ?", true)
	} else if successFilter == "false" || successFilter == "0" {
		query = query.Where("success = ?", false)
	}
	if err := query.Limit(limit).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat log SATUSEHAT"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": logs})
}

func RetrySATUSEHATLog(c *gin.Context) {
	logID, err := strconv.Atoi(c.Param("id"))
	if err != nil || logID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID log SATUSEHAT tidak valid"})
		return
	}

	var activityLog models.SATUSEHATLog
	if err := database.DB.First(&activityLog, logID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Log SATUSEHAT tidak ditemukan"})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat log SATUSEHAT"})
		return
	}

	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	result, err := satusehat.RetryFailedSyncLog(c.Request.Context(), config, activityLog)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error":  err.Error(),
			"log_id": activityLog.ID,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Retry log SATUSEHAT berhasil diproses",
		"data": gin.H{
			"log_id": activityLog.ID,
			"result": result,
		},
	})
}

func SyncSATUSEHATAutoByVisit(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("id"))
	if err != nil || visitID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	var visit models.Visit
	if err := database.DB.Select("id").First(&visit, visitID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat data kunjungan"})
		return
	}

	if !acquireSATUSEHATAutoSyncJob(visit.ID) {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Auto sync SATUSEHAT untuk kunjungan ini masih berjalan",
		})
		return
	}

	isAsync := parseTruthyFlag(c.Query("async"))
	config, _ := satusehat.LoadConfig()
	activeMode := ""
	if config.ActiveMode != "" {
		activeMode = config.ActiveMode
	}

	if isAsync {
		queuedResult := buildQueuedSATUSEHATAutoSyncResult(visit.ID, "manual", activeMode)
		persistSATUSEHATAutoSyncSnapshot(queuedResult)

		go func(visitID uint) {
			defer releaseSATUSEHATAutoSyncJob(visitID)

			backgroundCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			defer cancel()

			runSATUSEHATAutoSyncForVisit(backgroundCtx, visitID, "manual")
		}(visit.ID)

		c.JSON(http.StatusAccepted, gin.H{
			"message": "Auto sync SATUSEHAT diproses di background",
			"data":    queuedResult,
		})
		return
	}

	defer releaseSATUSEHATAutoSyncJob(visit.ID)

	result := runSATUSEHATAutoSyncForVisit(c.Request.Context(), visit.ID, "manual")

	c.JSON(http.StatusOK, gin.H{
		"message": "Auto sync SATUSEHAT per kunjungan selesai diproses",
		"data":    result,
	})
}

func GetSATUSEHATAutoByVisit(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("id"))
	if err != nil || visitID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	var snapshot models.SATUSEHATAutoSyncSnapshot
	if err := database.DB.Where("visit_id = ?", visitID).First(&snapshot).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Belum ada hasil auto sync SATUSEHAT untuk kunjungan ini"})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat snapshot auto sync SATUSEHAT"})
		return
	}

	var result satusehatVisitAutoSyncResult
	if err := json.Unmarshal([]byte(snapshot.Payload), &result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Snapshot auto sync SATUSEHAT tidak valid"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Snapshot auto sync SATUSEHAT terakhir berhasil dimuat",
		"data":    result,
	})
}

func TestSATUSEHATConnection(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	tokenResponse, err := satusehat.RequestAccessToken(c.Request.Context(), config)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error":  err.Error(),
			"config": config.PublicStatus(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Koneksi SATUSEHAT berhasil",
		"data": gin.H{
			"active_mode": config.ActiveMode,
			"auth_url":    config.AuthURL,
			"fhir_url":    config.FHIRURL,
			"token_type":  tokenResponse.TokenType,
			"expires_in":  tokenResponse.ExpiresIn,
			"scope":       tokenResponse.Scope,
		},
	})
}

func PreviewSATUSEHATOrganization(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	polyclinicID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID poli tidak valid"})
		return
	}

	polyclinic, err := loadPolyclinicForSATUSEHAT(polyclinicID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poli tidak ditemukan"})
		return
	}

	preview := satusehat.BuildPolyclinicOrganizationPreview(polyclinic, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATOrganization(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	polyclinicID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID poli tidak valid"})
		return
	}

	polyclinic, err := loadPolyclinicForSATUSEHAT(polyclinicID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poli tidak ditemukan"})
		return
	}

	preview := satusehat.BuildPolyclinicOrganizationPreview(polyclinic, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Organization poli belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "Organization", preview.Resource, polyclinic.SatusehatOrganizationID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_organization_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_organization_id"] = result.ResourceID
	}
	if err := database.DB.Model(&polyclinic).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi organization poli"})
		return
	}

	if result.ResourceID != "" {
		polyclinic.SatusehatOrganizationID = result.ResourceID
	}
	polyclinic.SatusehatOrganizationSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Organization poli berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"polyclinic": polyclinic,
			"sync":       result,
		},
	})
}

func PreviewSATUSEHATLocation(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	polyclinicID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID poli tidak valid"})
		return
	}

	polyclinic, err := loadPolyclinicForSATUSEHAT(polyclinicID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poli tidak ditemukan"})
		return
	}

	preview := satusehat.BuildPolyclinicLocationPreview(polyclinic, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATLocation(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	polyclinicID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID poli tidak valid"})
		return
	}

	polyclinic, err := loadPolyclinicForSATUSEHAT(polyclinicID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poli tidak ditemukan"})
		return
	}

	preview := satusehat.BuildPolyclinicLocationPreview(polyclinic, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Location poli belum siap dikirim ke SATUSEHAT. Pastikan Organization poli sudah tersinkron lebih dulu.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "Location", preview.Resource, polyclinic.SatusehatLocationID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_location_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_location_id"] = result.ResourceID
	}
	if err := database.DB.Model(&polyclinic).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi location poli"})
		return
	}

	if result.ResourceID != "" {
		polyclinic.SatusehatLocationID = result.ResourceID
	}
	polyclinic.SatusehatLocationSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Location poli berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"polyclinic": polyclinic,
			"sync":       result,
		},
	})
}

func PreviewSATUSEHATVitalSigns(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.Preload("Patient").Preload("Visit").Preload("Doctor").Preload("Doctor.Employee").First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildVitalSignsPreview(record, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATVitalSigns(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.Preload("Patient").Preload("Visit").Preload("Doctor").Preload("Doctor.Employee").First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildVitalSignsPreview(record, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Observation vital signs belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	resourceIDs := satusehat.ParseResourceIDMap(record.SatusehatVitalSignIDs)
	results := make([]satusehat.ResourceOperationResult, 0, len(preview.Resources))
	for _, item := range preview.Resources {
		result, syncErr := satusehat.UpsertResource(c.Request.Context(), config, "Observation", item.Resource, item.ExistingResourceID)
		if syncErr != nil {
			_ = persistSATUSEHATVitalSignIDs(record.ID, resourceIDs)
			c.JSON(http.StatusBadGateway, gin.H{
				"error":           syncErr.Error(),
				"data":            preview,
				"partial_results": results,
				"config":          config.PublicStatus(),
			})
			return
		}
		if result.ResourceID != "" {
			resourceIDs[item.Key] = result.ResourceID
		}
		results = append(results, result)
	}

	now := time.Now()
	serializedIDs, err := satusehat.MarshalResourceIDMap(resourceIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyusun ID observation SATUSEHAT"})
		return
	}

	if err := database.DB.Model(&record).Updates(map[string]any{
		"satusehat_vital_sign_ids":        serializedIDs,
		"satusehat_vital_signs_synced_at": now,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi vital signs"})
		return
	}

	record.SatusehatVitalSignIDs = serializedIDs
	record.SatusehatVitalSignsSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Vital signs berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"medical_record": record,
			"sync_results":   results,
		},
	})
}

func PreviewSATUSEHATDiagnosis(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	diagnosisID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID diagnosis tidak valid"})
		return
	}

	diagnosis, err := loadDiagnosisForSATUSEHAT(diagnosisID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Diagnosis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildDiagnosisPreview(diagnosis, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATDiagnosis(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	diagnosisID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID diagnosis tidak valid"})
		return
	}

	diagnosis, err := loadDiagnosisForSATUSEHAT(diagnosisID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Diagnosis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildDiagnosisPreview(diagnosis, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Condition diagnosis belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "Condition", preview.Resource, diagnosis.SatusehatConditionID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_condition_id"] = result.ResourceID
	}
	if err := database.DB.Model(&diagnosis).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi diagnosis"})
		return
	}

	if result.ResourceID != "" {
		diagnosis.SatusehatConditionID = result.ResourceID
	}
	diagnosis.SatusehatSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Diagnosis berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"diagnosis": diagnosis,
			"sync":      result,
		},
	})
}

func persistSATUSEHATVitalSignIDs(recordID uint, resourceIDs map[string]string) error {
	serializedIDs, err := satusehat.MarshalResourceIDMap(resourceIDs)
	if err != nil {
		return err
	}

	return database.DB.Model(&models.MedicalRecord{}).Where("id = ?", recordID).Update("satusehat_vital_sign_ids", serializedIDs).Error
}

func loadDiagnosisForSATUSEHAT(diagnosisID int) (models.MedicalRecordDiagnosis, error) {
	var diagnosis models.MedicalRecordDiagnosis
	err := database.DB.
		Preload("ICD10").
		Preload("MedicalRecord").
		Preload("MedicalRecord.Patient").
		Preload("MedicalRecord.Visit").
		Preload("MedicalRecord.Doctor").
		First(&diagnosis, diagnosisID).Error
	return diagnosis, err
}

func PreviewSATUSEHATClinicalImpression(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForClinicalImpression(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildClinicalImpressionPreview(record, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATClinicalImpression(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForClinicalImpression(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildClinicalImpressionPreview(record, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload ClinicalImpression belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "ClinicalImpression", preview.Resource, record.SatusehatClinicalImpressionID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_clinical_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_clinical_impression_id"] = result.ResourceID
	}
	if err := database.DB.Model(&record).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi ClinicalImpression"})
		return
	}

	if result.ResourceID != "" {
		record.SatusehatClinicalImpressionID = result.ResourceID
	}
	record.SatusehatClinicalSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "ClinicalImpression berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"medical_record": record,
			"sync":           result,
		},
	})
}

func loadMedicalRecordForClinicalImpression(recordID int) (models.MedicalRecord, error) {
	var record models.MedicalRecord
	err := database.DB.
		Preload("Patient").
		Preload("Visit").
		Preload("Doctor").
		Preload("Doctor.Employee").
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		First(&record, recordID).Error
	return record, err
}

func PreviewSATUSEHATLaboratoryItem(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	itemID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID item laboratorium tidak valid"})
		return
	}

	item, err := loadLaboratoryItemForSATUSEHAT(itemID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item laboratorium tidak ditemukan"})
		return
	}

	preview := satusehat.BuildLaboratoryItemPreview(item, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATLaboratoryItem(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	itemID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID item laboratorium tidak valid"})
		return
	}

	item, err := loadLaboratoryItemForSATUSEHAT(itemID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item laboratorium tidak ditemukan"})
		return
	}

	preview := satusehat.BuildLaboratoryItemPreview(item, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload laboratorium belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	serviceRequestResult, err := satusehat.UpsertResource(c.Request.Context(), config, "ServiceRequest", preview.ServiceRequest.Resource, preview.ServiceRequest.ExistingResourceID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	serviceRequestReference := preview.ServiceRequest.ExistingResourceID
	if serviceRequestResult.ResourceID != "" {
		serviceRequestReference = serviceRequestResult.ResourceID
	}

	var specimenResult *satusehat.ResourceOperationResult
	specimenReference := ""
	if preview.Specimen != nil {
		resource := clonePreviewResource(preview.Specimen.Resource)
		resource["request"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}

		result, syncErr := satusehat.UpsertResource(c.Request.Context(), config, "Specimen", resource, preview.Specimen.ExistingResourceID)
		if syncErr != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error":           syncErr.Error(),
				"data":            preview,
				"service_request": serviceRequestResult,
				"config":          config.PublicStatus(),
			})
			return
		}

		specimenResult = &result
		specimenReference = preview.Specimen.ExistingResourceID
		if result.ResourceID != "" {
			specimenReference = result.ResourceID
		}
	}

	observationResults := make([]satusehat.ResourceOperationResult, 0, len(preview.Observations))
	observationIDsByKey := make(map[string]string)
	for _, observation := range preview.Observations {
		resource := clonePreviewResource(observation.Resource)
		resource["basedOn"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}
		if specimenReference != "" {
			resource["specimen"] = map[string]any{"reference": "Specimen/" + specimenReference}
		}

		result, syncErr := satusehat.UpsertResource(c.Request.Context(), config, "Observation", resource, observation.ExistingResourceID)
		if syncErr != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error":             syncErr.Error(),
				"data":              preview,
				"service_request":   serviceRequestResult,
				"observation_syncs": observationResults,
				"config":            config.PublicStatus(),
			})
			return
		}
		if result.ResourceID != "" {
			observationIDsByKey[observation.Key] = result.ResourceID
		}
		observationResults = append(observationResults, result)
	}

	var diagnosticReportResult *satusehat.ResourceOperationResult
	if preview.DiagnosticReport != nil {
		resource := clonePreviewResource(preview.DiagnosticReport.Resource)
		resource["basedOn"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}
		if specimenReference != "" {
			resource["specimen"] = []map[string]any{{
				"reference": "Specimen/" + specimenReference,
			}}
		}

		resultRefs := make([]map[string]any, 0, len(preview.Observations))
		for _, observation := range preview.Observations {
			observationID := observation.ExistingResourceID
			if syncedID := observationIDsByKey[observation.Key]; syncedID != "" {
				observationID = syncedID
			}
			if observationID == "" {
				continue
			}
			resultRefs = append(resultRefs, map[string]any{"reference": "Observation/" + observationID})
		}
		if len(resultRefs) > 0 {
			resource["result"] = resultRefs
		}

		result, syncErr := satusehat.UpsertResource(c.Request.Context(), config, "DiagnosticReport", resource, preview.DiagnosticReport.ExistingResourceID)
		if syncErr != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error":             syncErr.Error(),
				"data":              preview,
				"service_request":   serviceRequestResult,
				"observation_syncs": observationResults,
				"config":            config.PublicStatus(),
			})
			return
		}
		diagnosticReportResult = &result
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if serviceRequestResult.ResourceID != "" {
		updates["satusehat_service_request_id"] = serviceRequestResult.ResourceID
	}
	if observationID := observationIDsByKey["item_result"]; observationID != "" {
		updates["satusehat_observation_id"] = observationID
	}
	if diagnosticReportResult != nil && diagnosticReportResult.ResourceID != "" {
		updates["satusehat_diagnostic_report_id"] = diagnosticReportResult.ResourceID
	}
	if err := database.DB.Model(&item).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi item laboratorium"})
		return
	}

	if item.Specimen != nil {
		specimenUpdates := map[string]any{}
		if specimenResult != nil && specimenResult.ResourceID != "" {
			specimenUpdates["satusehat_specimen_id"] = specimenResult.ResourceID
		}
		if specimenResult != nil {
			specimenUpdates["satusehat_synced_at"] = now
		}
		if len(specimenUpdates) > 0 {
			if err := database.DB.Model(item.Specimen).Updates(specimenUpdates).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi specimen laboratorium"})
				return
			}
		}
	}

	for _, parameter := range item.ParameterResults {
		observationID := observationIDsByKey[fmt.Sprintf("parameter_%d", parameter.ID)]
		if observationID == "" {
			continue
		}
		if err := database.DB.Model(&parameter).Updates(map[string]any{
			"satusehat_observation_id": observationID,
			"satusehat_synced_at":      now,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi parameter laboratorium"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Item laboratorium berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"service_request":   serviceRequestResult,
			"specimen":          specimenResult,
			"observation_syncs": observationResults,
			"diagnostic_report": diagnosticReportResult,
		},
	})
}

func loadLaboratoryItemForSATUSEHAT(itemID int) (models.LaboratoryOrderItem, error) {
	var item models.LaboratoryOrderItem
	err := database.DB.
		Preload("MedicalService").
		Preload("Specimen").
		Preload("Specimen.SpecimenTemplate").
		Preload("ParameterResults", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("ResultByUser").
		Preload("ResultByUser.Employee").
		Preload("MedicalRecord").
		Preload("MedicalRecord.Patient").
		Preload("MedicalRecord.Visit").
		Preload("MedicalRecord.Doctor").
		Preload("MedicalRecord.Doctor.Employee").
		Preload("MedicalRecord.LaboratoryProcessor").
		Preload("MedicalRecord.LaboratoryProcessor.Employee").
		First(&item, itemID).Error
	return item, err
}

func PreviewSATUSEHATRadiologyItem(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	itemID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID item radiologi tidak valid"})
		return
	}

	item, err := loadRadiologyItemForSATUSEHAT(itemID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item radiologi tidak ditemukan"})
		return
	}

	preview := satusehat.BuildRadiologyItemPreview(item, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATRadiologyItem(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	itemID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID item radiologi tidak valid"})
		return
	}

	item, err := loadRadiologyItemForSATUSEHAT(itemID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item radiologi tidak ditemukan"})
		return
	}

	preview := satusehat.BuildRadiologyItemPreview(item, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload radiologi belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	serviceRequestResult, err := satusehat.UpsertResource(c.Request.Context(), config, "ServiceRequest", preview.ServiceRequest.Resource, preview.ServiceRequest.ExistingResourceID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	serviceRequestReference := preview.ServiceRequest.ExistingResourceID
	if serviceRequestResult.ResourceID != "" {
		serviceRequestReference = serviceRequestResult.ResourceID
	}

	observationResults := make([]satusehat.ResourceOperationResult, 0, len(preview.Observations))
	observationIDsByKey := make(map[string]string)
	for _, observation := range preview.Observations {
		resource := clonePreviewResource(observation.Resource)
		resource["basedOn"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}

		result, syncErr := satusehat.UpsertResource(c.Request.Context(), config, "Observation", resource, observation.ExistingResourceID)
		if syncErr != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error":             syncErr.Error(),
				"data":              preview,
				"service_request":   serviceRequestResult,
				"observation_syncs": observationResults,
				"config":            config.PublicStatus(),
			})
			return
		}
		if result.ResourceID != "" {
			observationIDsByKey[observation.Key] = result.ResourceID
		}
		observationResults = append(observationResults, result)
	}

	var diagnosticReportResult *satusehat.ResourceOperationResult
	if preview.DiagnosticReport != nil {
		resource := clonePreviewResource(preview.DiagnosticReport.Resource)
		resource["basedOn"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}

		resultRefs := make([]map[string]any, 0, len(preview.Observations))
		for _, observation := range preview.Observations {
			observationID := observation.ExistingResourceID
			if syncedID := observationIDsByKey[observation.Key]; syncedID != "" {
				observationID = syncedID
			}
			if observationID == "" {
				continue
			}
			resultRefs = append(resultRefs, map[string]any{"reference": "Observation/" + observationID})
		}
		if len(resultRefs) > 0 {
			resource["result"] = resultRefs
		}

		result, syncErr := satusehat.UpsertResource(c.Request.Context(), config, "DiagnosticReport", resource, preview.DiagnosticReport.ExistingResourceID)
		if syncErr != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error":             syncErr.Error(),
				"data":              preview,
				"service_request":   serviceRequestResult,
				"observation_syncs": observationResults,
				"config":            config.PublicStatus(),
			})
			return
		}
		diagnosticReportResult = &result
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if serviceRequestResult.ResourceID != "" {
		updates["satusehat_service_request_id"] = serviceRequestResult.ResourceID
	}
	if diagnosticReportResult != nil && diagnosticReportResult.ResourceID != "" {
		updates["satusehat_diagnostic_report_id"] = diagnosticReportResult.ResourceID
	}
	if err := database.DB.Model(&item).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi item radiologi"})
		return
	}

	for _, parameter := range item.ParameterResults {
		observationID := observationIDsByKey[fmt.Sprintf("parameter_%d", parameter.ID)]
		if observationID == "" {
			continue
		}
		if err := database.DB.Model(&parameter).Updates(map[string]any{
			"satusehat_observation_id": observationID,
			"satusehat_synced_at":      now,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi parameter radiologi"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Item radiologi berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"service_request":   serviceRequestResult,
			"observation_syncs": observationResults,
			"diagnostic_report": diagnosticReportResult,
		},
	})
}

func loadRadiologyItemForSATUSEHAT(itemID int) (models.RadiologyOrderItem, error) {
	var item models.RadiologyOrderItem
	err := database.DB.
		Preload("MedicalService").
		Preload("ParameterResults", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("ResultByUser").
		Preload("ResultByUser.Employee").
		Preload("MedicalRecord").
		Preload("MedicalRecord.Patient").
		Preload("MedicalRecord.Visit").
		Preload("MedicalRecord.Doctor").
		Preload("MedicalRecord.Doctor.Employee").
		Preload("MedicalRecord.RadiologyProcessor").
		Preload("MedicalRecord.RadiologyProcessor.Employee").
		First(&item, itemID).Error
	return item, err
}

func PreviewSATUSEHATProcedure(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	actionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tindakan tidak valid"})
		return
	}

	action, err := loadMedicalActionForSATUSEHAT(actionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tindakan medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildProcedurePreview(action, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATProcedure(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	actionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tindakan tidak valid"})
		return
	}

	action, err := loadMedicalActionForSATUSEHAT(actionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tindakan medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildProcedurePreview(action, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Procedure belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "Procedure", preview.Resource, action.SatusehatProcedureID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_procedure_id"] = result.ResourceID
	}
	if err := database.DB.Model(&action).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi tindakan"})
		return
	}

	if result.ResourceID != "" {
		action.SatusehatProcedureID = result.ResourceID
	}
	action.SatusehatSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Procedure berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"action": action,
			"sync":   result,
		},
	})
}

func PreviewSATUSEHATCarePlan(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildCarePlanPreview(record, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATCarePlan(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildCarePlanPreview(record, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload CarePlan belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "CarePlan", preview.Resource, record.SatusehatCarePlanID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_care_plan_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_care_plan_id"] = result.ResourceID
	}
	if err := database.DB.Model(&record).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi CarePlan"})
		return
	}

	if result.ResourceID != "" {
		record.SatusehatCarePlanID = result.ResourceID
	}
	record.SatusehatCarePlanSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "CarePlan berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"medical_record": record,
			"sync":           result,
		},
	})
}

func PreviewSATUSEHATGoal(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildGoalPreview(record, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATGoal(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildGoalPreview(record, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Goal belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "Goal", preview.Resource, record.SatusehatGoalID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_goal_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_goal_id"] = result.ResourceID
	}
	if err := database.DB.Model(&record).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi Goal"})
		return
	}

	if result.ResourceID != "" {
		record.SatusehatGoalID = result.ResourceID
	}
	record.SatusehatGoalSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Goal berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"medical_record": record,
			"sync":           result,
		},
	})
}

func PreviewSATUSEHATAllergyIntolerance(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildAllergyIntolerancePreview(record, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATAllergyIntolerance(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildAllergyIntolerancePreview(record, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload AllergyIntolerance belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "AllergyIntolerance", preview.Resource, record.SatusehatAllergyIntoleranceID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_allergy_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_allergy_intolerance_id"] = result.ResourceID
	}
	if err := database.DB.Model(&record).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi AllergyIntolerance"})
		return
	}

	if result.ResourceID != "" {
		record.SatusehatAllergyIntoleranceID = result.ResourceID
	}
	record.SatusehatAllergySyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "AllergyIntolerance berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"medical_record": record,
			"sync":           result,
		},
	})
}

func PreviewSATUSEHATComposition(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildCompositionPreview(record, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATComposition(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildCompositionPreview(record, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Composition belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "Composition", preview.Resource, record.SatusehatCompositionID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_composition_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_composition_id"] = result.ResourceID
	}
	if err := database.DB.Model(&record).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi Composition"})
		return
	}

	if result.ResourceID != "" {
		record.SatusehatCompositionID = result.ResourceID
	}
	record.SatusehatCompositionSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Composition berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"medical_record": record,
			"sync":           result,
		},
	})
}

func PreviewSATUSEHATFamilyMemberHistory(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildFamilyMemberHistoryPreview(record, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATFamilyMemberHistory(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadMedicalRecordForSATUSEHAT(recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	preview := satusehat.BuildFamilyMemberHistoryPreview(record, config)
	if !preview.Ready {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload FamilyMemberHistory belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "FamilyMemberHistory", preview.Resource, record.SatusehatFamilyHistoryID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_family_history_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_family_history_id"] = result.ResourceID
	}
	if err := database.DB.Model(&record).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi FamilyMemberHistory"})
		return
	}

	if result.ResourceID != "" {
		record.SatusehatFamilyHistoryID = result.ResourceID
	}
	record.SatusehatFamilyHistorySyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "FamilyMemberHistory berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"medical_record": record,
			"sync":           result,
		},
	})
}

func loadMedicalActionForSATUSEHAT(actionID int) (models.MedicalAction, error) {
	var action models.MedicalAction
	err := database.DB.
		Preload("MedicalService").
		Preload("MedicalRecord").
		Preload("MedicalRecord.Patient").
		Preload("MedicalRecord.Visit").
		Preload("MedicalRecord.Doctor").
		Preload("MedicalRecord.Doctor.Employee").
		First(&action, actionID).Error
	return action, err
}

func loadMedicalRecordForSATUSEHAT(recordID int) (models.MedicalRecord, error) {
	var record models.MedicalRecord
	err := database.DB.
		Preload("Patient").
		Preload("Visit").
		Preload("Doctor").
		Preload("Doctor.Employee").
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		Preload("LaboratoryOrderItems").
		Preload("LaboratoryOrderItems.ResultByUser").
		Preload("LaboratoryOrderItems.ResultByUser.Employee").
		Preload("RadiologyOrderItems").
		Preload("RadiologyOrderItems.ResultByUser").
		Preload("RadiologyOrderItems.ResultByUser.Employee").
		Preload("Actions").
		Preload("Actions.MedicalService").
		Preload("Prescriptions").
		Preload("Prescriptions.Medicine").
		Preload("PrescriptionProcessor").
		Preload("PrescriptionProcessor.Employee").
		Preload("LaboratoryProcessor").
		Preload("LaboratoryProcessor.Employee").
		Preload("RadiologyProcessor").
		Preload("RadiologyProcessor.Employee").
		First(&record, recordID).Error
	return record, err
}

func loadMedicalRecordsForSATUSEHATVisit(visitID uint) ([]models.MedicalRecord, error) {
	var records []models.MedicalRecord
	err := database.DB.
		Preload("Patient").
		Preload("Visit").
		Preload("Doctor").
		Preload("Doctor.Employee").
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		Preload("LaboratoryOrderItems").
		Preload("LaboratoryOrderItems.ResultByUser").
		Preload("LaboratoryOrderItems.ResultByUser.Employee").
		Preload("RadiologyOrderItems").
		Preload("RadiologyOrderItems.ResultByUser").
		Preload("RadiologyOrderItems.ResultByUser.Employee").
		Preload("Actions").
		Preload("Actions.MedicalService").
		Preload("Prescriptions").
		Preload("Prescriptions.Medicine").
		Preload("PrescriptionProcessor").
		Preload("PrescriptionProcessor.Employee").
		Preload("LaboratoryProcessor").
		Preload("LaboratoryProcessor.Employee").
		Preload("RadiologyProcessor").
		Preload("RadiologyProcessor.Employee").
		Where("visit_id = ? AND status <> ?", visitID, "cancelled").
		Order("updated_at DESC").
		Order("created_at DESC").
		Find(&records).Error

	return records, err
}

func runSATUSEHATAutoSyncForVisit(ctx context.Context, visitID uint, trigger string) satusehatVisitAutoSyncResult {
	ctx = satusehat.WithSkipExistingResource(ctx)

	result := satusehatVisitAutoSyncResult{
		VisitID:         visitID,
		Trigger:         strings.TrimSpace(trigger),
		ExecutedAt:      time.Now(),
		JobStatus:       "running",
		SentResources:   make([]satusehatAutoSyncResourceResult, 0, 12),
		UnsentResources: make([]satusehatAutoSyncResourceResult, 0, 20),
		Resources:       make([]satusehatAutoSyncResourceResult, 0, 32),
	}

	defer func() {
		if strings.TrimSpace(result.JobStatus) == "" || strings.EqualFold(result.JobStatus, "running") {
			if strings.TrimSpace(result.Error) != "" {
				result.JobStatus = "failed"
			} else {
				result.JobStatus = "completed"
			}
		}
		persistSATUSEHATAutoSyncSnapshot(result)
	}()

	config, err := satusehat.LoadConfig()
	if err != nil {
		result.Error = "Gagal memuat konfigurasi SATUSEHAT"
		result.Resources = append(result.Resources, buildSATUSEHATAutoSyncSkippedResources("Konfigurasi SATUSEHAT belum siap")...)
		summarizeSATUSEHATAutoSyncResult(&result)
		return result
	}

	if err := config.EnsureEnabled(); err != nil {
		result.Mode = config.ActiveMode
		result.JobStatus = "disabled"
		result.Error = err.Error()
		result.Resources = append(result.Resources, buildSATUSEHATAutoSyncSkippedResources(err.Error())...)
		summarizeSATUSEHATAutoSyncResult(&result)
		return result
	}

	result.Mode = config.ActiveMode

	var visit models.Visit
	if err := database.DB.Preload("Patient").Preload("Doctor").Preload("Doctor.Employee").Preload("Polyclinic").First(&visit, visitID).Error; err != nil {
		result.Error = "Gagal memuat data kunjungan"
		result.Resources = append(result.Resources,
			satusehatAutoSyncResourceResult{ResourceType: "Organization", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Location", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Patient", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Practitioner", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Encounter", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Observation", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Condition", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "ClinicalImpression", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "LaboratoryOrderItem", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "RadiologyOrderItem", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Procedure", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "MedicationRequest", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "MedicationDispense", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "CarePlan", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Goal", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "AllergyIntolerance", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Composition", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "FamilyMemberHistory", Status: "failed", Message: "Data kunjungan tidak dapat dimuat"},
		)
		summarizeSATUSEHATAutoSyncResult(&result)
		return result
	}

	organizationResult := autoSyncOrganizationForVisit(ctx, config, visit.Polyclinic)
	if strings.TrimSpace(organizationResult.ResourceID) != "" {
		visit.Polyclinic.SatusehatOrganizationID = strings.TrimSpace(organizationResult.ResourceID)
	}
	organizationReady := strings.TrimSpace(visit.Polyclinic.SatusehatOrganizationID) != "" || isSATUSEHATAutoSyncResourceReady(organizationResult)

	locationResult := autoSyncLocationForVisit(ctx, config, visit.Polyclinic)
	if strings.TrimSpace(locationResult.ResourceID) != "" {
		visit.Polyclinic.SatusehatLocationID = strings.TrimSpace(locationResult.ResourceID)
	}
	locationReady := strings.TrimSpace(visit.Polyclinic.SatusehatLocationID) != "" || isSATUSEHATAutoSyncResourceReady(locationResult)

	patientResult := autoSyncPatientForVisit(ctx, config, visit.Patient)
	if strings.TrimSpace(patientResult.ResourceID) != "" {
		visit.Patient.SatusehatPatientID = strings.TrimSpace(patientResult.ResourceID)
	}
	patientReady := strings.TrimSpace(visit.Patient.SatusehatPatientID) != "" || isSATUSEHATAutoSyncResourceReady(patientResult)

	practitionerResult := autoSyncPractitionerForVisit(ctx, config, visit.Doctor)
	if strings.TrimSpace(practitionerResult.ResourceID) != "" {
		visit.Doctor.SatusehatPractitionerID = strings.TrimSpace(practitionerResult.ResourceID)
		if visit.Doctor.EmployeeID != nil && *visit.Doctor.EmployeeID != 0 {
			visit.Doctor.Employee.SatusehatPractitionerID = strings.TrimSpace(practitionerResult.ResourceID)
		}
	}
	practitionerReady := satusehat.ResolveDoctorPractitionerActor(visit.Doctor).Ready() || isSATUSEHATAutoSyncResourceReady(practitionerResult)

	// Persist intermediate progress after foundation resources
	result.Resources = append(result.Resources, organizationResult, locationResult, patientResult, practitionerResult)
	summarizeSATUSEHATAutoSyncResult(&result)
	persistSATUSEHATAutoSyncSnapshot(result)
	result.Resources = result.Resources[:0]

	encounterPrerequisites := make([]string, 0, 4)
	if !patientReady {
		encounterPrerequisites = append(encounterPrerequisites, "Patient")
	}
	if !practitionerReady {
		encounterPrerequisites = append(encounterPrerequisites, "Practitioner")
	}
	if !organizationReady {
		encounterPrerequisites = append(encounterPrerequisites, "Organization")
	}
	if !locationReady {
		encounterPrerequisites = append(encounterPrerequisites, "Location")
	}

	encounterResult := satusehatAutoSyncResourceResult{}
	if len(encounterPrerequisites) > 0 {
		encounterResult = buildSATUSEHATDependencySkipped("Encounter", strings.Join(encounterPrerequisites, ", "))
	} else {
		encounterResult = autoSyncEncounterForVisit(ctx, config, visit)
	}
	if strings.TrimSpace(encounterResult.ResourceID) != "" {
		visit.SatusehatEncounterID = strings.TrimSpace(encounterResult.ResourceID)
	}
	encounterReady := strings.TrimSpace(visit.SatusehatEncounterID) != "" || isSATUSEHATAutoSyncResourceReady(encounterResult)

	records, err := loadMedicalRecordsForSATUSEHATVisit(visitID)
	if err != nil {
		result.Error = "Gagal memuat rekam medis kunjungan"
		result.Resources = append(result.Resources,
			organizationResult,
			locationResult,
			patientResult,
			practitionerResult,
			encounterResult,
			satusehatAutoSyncResourceResult{ResourceType: "Observation", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Condition", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "ClinicalImpression", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "LaboratoryOrderItem", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "RadiologyOrderItem", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Procedure", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "MedicationRequest", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "MedicationDispense", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "CarePlan", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Goal", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "AllergyIntolerance", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "Composition", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
			satusehatAutoSyncResourceResult{ResourceType: "FamilyMemberHistory", Status: "failed", Message: "Data rekam medis tidak dapat dimuat"},
		)
		summarizeSATUSEHATAutoSyncResult(&result)
		return result
	}

	// Persist intermediate progress after Encounter phase
	result.Resources = append(result.Resources,
		organizationResult,
		locationResult,
		patientResult,
		practitionerResult,
		encounterResult,
	)
	summarizeSATUSEHATAutoSyncResult(&result)
	persistSATUSEHATAutoSyncSnapshot(result)

	if encounterReady {
		result.Resources = append(result.Resources,
			autoSyncVitalSignsFromVisitRecords(ctx, config, records),
		)

		diagnosisResults := autoSyncDiagnosesFromVisitRecords(ctx, config, records)
		result.Resources = append(result.Resources, diagnosisResults...)

		// Always finalize Encounter via PUT after Conditions phase:
		// - Updates status from "in-progress" to "finished"
		// - Attaches diagnosis[] references for synced Condition resources
		// This resolves the chicken-and-egg: initial POST uses "in-progress" (no diagnosis required),
		// then this PUT sets "finished" + diagnosis after Conditions are synced.
		if strings.TrimSpace(visit.SatusehatEncounterID) != "" {
			// Use a fresh context without skip-existing so the Encounter is actually PUT-updated
			encounterUpdateResult := autoSyncEncounterForVisit(context.Background(), config, visit)
			encounterUpdateResult.ResourceType = "Encounter"
			encounterUpdateResult.Message = strings.Replace(encounterUpdateResult.Message, "auto-sync", "auto-sync (finalize)", 1)
			result.Resources = append(result.Resources, encounterUpdateResult)
		}

		// Persist after diagnosis + encounter finalize
		summarizeSATUSEHATAutoSyncResult(&result)
		persistSATUSEHATAutoSyncSnapshot(result)

		if hasSATUSEHATAutoSyncReadyItem(diagnosisResults) {
			result.Resources = append(result.Resources,
				autoSyncClinicalImpressionFromVisitRecords(ctx, config, records),
			)
		} else {
			result.Resources = append(result.Resources,
				buildSATUSEHATDependencySkipped("ClinicalImpression", "Condition"),
			)
		}

		result.Resources = append(result.Resources, autoSyncLaboratoryItemsFromVisitRecords(ctx, config, records)...)
		result.Resources = append(result.Resources, autoSyncRadiologyItemsFromVisitRecords(ctx, config, records)...)
		result.Resources = append(result.Resources, autoSyncProceduresFromVisitRecords(ctx, config, records)...)

		medicationRequestResults := autoSyncMedicationRequestsFromVisitRecords(ctx, config, records)
		result.Resources = append(result.Resources, medicationRequestResults...)
		if hasSATUSEHATAutoSyncReadyItem(medicationRequestResults) {
			result.Resources = append(result.Resources, autoSyncDispensingsForVisit(ctx, config, visit.ID)...)
		} else {
			result.Resources = append(result.Resources,
				buildSATUSEHATDependencySkipped("MedicationDispense", "MedicationRequest"),
			)
		}

		carePlanResult := autoSyncCarePlanFromVisitRecords(ctx, config, records)
		result.Resources = append(result.Resources, carePlanResult)
		carePlanReady := isSATUSEHATAutoSyncResourceReady(carePlanResult)
		conditionReady := hasSATUSEHATAutoSyncReadyItem(diagnosisResults)

		if carePlanReady && conditionReady {
			// Reload records so in-memory Diagnoses carry freshly-synced SatusehatConditionID
			if refreshed, refreshErr := loadMedicalRecordsForSATUSEHATVisit(visitID); refreshErr == nil {
				records = refreshed
			}
			result.Resources = append(result.Resources,
				autoSyncGoalFromVisitRecords(ctx, config, records),
			)
		} else {
			missingDeps := make([]string, 0, 2)
			if !carePlanReady {
				missingDeps = append(missingDeps, "CarePlan")
			}
			if !conditionReady {
				missingDeps = append(missingDeps, "Condition")
			}
			result.Resources = append(result.Resources,
				buildSATUSEHATDependencySkipped("Goal", strings.Join(missingDeps, ", ")),
			)
		}

		result.Resources = append(result.Resources,
			autoSyncCompositionFromVisitRecords(ctx, config, records),
		)

		// Persist after remaining clinical resources
		summarizeSATUSEHATAutoSyncResult(&result)
		persistSATUSEHATAutoSyncSnapshot(result)
	} else {
		result.Resources = append(result.Resources,
			buildSATUSEHATDependencySkipped("Observation", "Encounter"),
			buildSATUSEHATDependencySkipped("Condition", "Encounter"),
			buildSATUSEHATDependencySkipped("ClinicalImpression", "Encounter"),
			buildSATUSEHATDependencySkipped("LaboratoryOrderItem", "Encounter"),
			buildSATUSEHATDependencySkipped("RadiologyOrderItem", "Encounter"),
			buildSATUSEHATDependencySkipped("Procedure", "Encounter"),
			buildSATUSEHATDependencySkipped("MedicationRequest", "Encounter"),
			buildSATUSEHATDependencySkipped("MedicationDispense", "MedicationRequest"),
			buildSATUSEHATDependencySkipped("CarePlan", "Encounter"),
			buildSATUSEHATDependencySkipped("Goal", "CarePlan"),
			buildSATUSEHATDependencySkipped("Composition", "Encounter"),
		)
	}

	if patientReady {
		result.Resources = append(result.Resources,
			autoSyncAllergyIntoleranceFromVisitRecords(ctx, config, records),
			autoSyncFamilyHistoryFromVisitRecords(ctx, config, records),
		)
	} else {
		result.Resources = append(result.Resources,
			buildSATUSEHATDependencySkipped("AllergyIntolerance", "Patient"),
			buildSATUSEHATDependencySkipped("FamilyMemberHistory", "Patient"),
		)
	}

	summarizeSATUSEHATAutoSyncResult(&result)

	return result
}

func summarizeSATUSEHATAutoSyncResult(result *satusehatVisitAutoSyncResult) {
	sort.SliceStable(result.Resources, func(i, j int) bool {
		left := result.Resources[i]
		right := result.Resources[j]

		leftRank := satusehatAutoSyncResourceRank(left.ResourceType)
		rightRank := satusehatAutoSyncResourceRank(right.ResourceType)
		if leftRank != rightRank {
			return leftRank < rightRank
		}

		leftRecordID := uint(0)
		rightRecordID := uint(0)
		if left.MedicalRecordID != nil {
			leftRecordID = *left.MedicalRecordID
		}
		if right.MedicalRecordID != nil {
			rightRecordID = *right.MedicalRecordID
		}
		if leftRecordID != rightRecordID {
			return leftRecordID < rightRecordID
		}

		return strings.ToLower(left.ResourceType) < strings.ToLower(right.ResourceType)
	})

	result.SentResources = result.SentResources[:0]
	result.UnsentResources = result.UnsentResources[:0]

	for index := range result.Resources {
		item := normalizeSATUSEHATAutoSyncResourceResult(result.Resources[index])
		result.Resources[index] = item

		if strings.EqualFold(strings.TrimSpace(item.Status), "failed") {
			result.UnsentResources = append(result.UnsentResources, item)
			continue
		}

		if isSATUSEHATAutoSyncResourceReady(item) {
			result.SentResources = append(result.SentResources, item)
			continue
		}

		result.UnsentResources = append(result.UnsentResources, item)
	}

	result.SentCount = len(result.SentResources)
	result.UnsentCount = len(result.UnsentResources)
}

func autoSyncOrganizationForVisit(ctx context.Context, config satusehat.Config, polyclinic models.Polyclinic) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{
		ResourceType:     "Organization",
		Status:           "skipped",
		Message:          "Organization belum siap disinkronkan",
		ExistingResource: strings.TrimSpace(polyclinic.SatusehatOrganizationID),
	}

	preview := satusehat.BuildPolyclinicOrganizationPreview(polyclinic, config)
	if !preview.Ready {
		output.Message = "Organization poli belum siap dikirim ke SATUSEHAT"
		output.Warnings = preview.Warnings
		return output
	}

	result, err := satusehat.UpsertResource(ctx, config, "Organization", preview.Resource, polyclinic.SatusehatOrganizationID)
	if err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi Organization gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_organization_synced_at": now}
	if strings.TrimSpace(result.ResourceID) != "" {
		updates["satusehat_organization_id"] = result.ResourceID
	}

	if err := database.DB.Model(&models.Polyclinic{}).Where("id = ?", polyclinic.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "Organization berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(result.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(result.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "Organization berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(result.ResourceID)
	return output
}

func autoSyncLocationForVisit(ctx context.Context, config satusehat.Config, polyclinic models.Polyclinic) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{
		ResourceType:     "Location",
		Status:           "skipped",
		Message:          "Location belum siap disinkronkan",
		ExistingResource: strings.TrimSpace(polyclinic.SatusehatLocationID),
	}

	preview := satusehat.BuildPolyclinicLocationPreview(polyclinic, config)
	if !preview.Ready {
		output.Message = "Location poli belum siap dikirim ke SATUSEHAT"
		output.Warnings = preview.Warnings
		return output
	}

	result, err := satusehat.UpsertResource(ctx, config, "Location", preview.Resource, polyclinic.SatusehatLocationID)
	if err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi Location gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_location_synced_at": now}
	if strings.TrimSpace(result.ResourceID) != "" {
		updates["satusehat_location_id"] = result.ResourceID
	}

	if err := database.DB.Model(&models.Polyclinic{}).Where("id = ?", polyclinic.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "Location berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(result.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(result.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "Location berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(result.ResourceID)
	return output
}

func autoSyncPatientForVisit(ctx context.Context, config satusehat.Config, patient models.Patient) satusehatAutoSyncResourceResult {
	rawStoredResourceID := strings.TrimSpace(patient.SatusehatPatientID)
	output := satusehatAutoSyncResourceResult{
		ResourceType:     "Patient",
		Status:           "skipped",
		Message:          "Patient belum siap disinkronkan",
		ExistingResource: rawStoredResourceID,
	}

	if rawStoredResourceID != "" {
		if saveErr := persistResolvedSATUSEHATPatientID(patient.ID, rawStoredResourceID); saveErr != nil {
			output.Warnings = append(output.Warnings, fmt.Sprintf("SATUSEHAT Patient ID lokal ditemukan, tetapi gagal sinkronkan metadata lokal: %s", saveErr.Error()))
		}

		output.Status = "synced"
		output.Message = "SATUSEHAT Patient ID sudah ada di data lokal, auto-sync dilewati"
		output.ResourceID = rawStoredResourceID
		output.ExistingResource = rawStoredResourceID
		return output
	}

	resolvedPatientID, resolveWarnings := resolveExistingSATUSEHATPatientID(ctx, config, patient)
	output.Warnings = append(output.Warnings, resolveWarnings...)
	if resolvedPatientID != "" {
		if saveErr := persistResolvedSATUSEHATPatientID(patient.ID, resolvedPatientID); saveErr != nil {
			output.Warnings = append(output.Warnings, fmt.Sprintf("Patient ditemukan via GET, tetapi pembaruan ID lokal gagal: %s", saveErr.Error()))
		}

		output.Status = "synced"
		output.Message = "Patient sudah ada di SATUSEHAT (GET by NIK), menggunakan ID existing"
		output.ResourceID = resolvedPatientID
		output.ExistingResource = resolvedPatientID
		return output
	}

	preview := satusehat.BuildPatientPreview(patient, config)
	if !preview.Ready {
		output.Message = "Patient belum siap dikirim ke SATUSEHAT"
		output.Warnings = preview.Warnings
		return output
	}

	result, err := satusehat.UpsertResource(ctx, config, "Patient", preview.Resource, "")
	if err != nil {
		errMessage := strings.TrimSpace(err.Error())
		if isSATUSEHATDuplicateError(errMessage) {
			resolvedAfterDuplicate, duplicateResolveWarnings := resolveExistingSATUSEHATPatientID(ctx, config, patient)
			output.Warnings = append(output.Warnings, duplicateResolveWarnings...)
			if resolvedAfterDuplicate != "" {
				if saveErr := persistResolvedSATUSEHATPatientID(patient.ID, resolvedAfterDuplicate); saveErr != nil {
					output.Warnings = append(output.Warnings, fmt.Sprintf("Patient duplikat terdeteksi, tetapi pembaruan ID lokal gagal: %s", saveErr.Error()))
				}

				output.Status = "synced"
				output.Message = "Patient sudah terdaftar di SATUSEHAT (duplikat), menggunakan ID existing hasil GET"
				output.ResourceID = resolvedAfterDuplicate
				output.ExistingResource = resolvedAfterDuplicate
				output.Warnings = append(output.Warnings, "Permintaan auto-sync Patient terdeteksi duplikat, sistem resolve dengan GET by ID/IHS/NIK.")
				return output
			}

			fallbackStoredID := strings.TrimSpace(patient.SatusehatPatientID)
			if fallbackStoredID != "" {
				if saveErr := persistResolvedSATUSEHATPatientID(patient.ID, fallbackStoredID); saveErr != nil {
					output.Warnings = append(output.Warnings, fmt.Sprintf("Patient duplikat terdeteksi, fallback ke ID lokal berhasil dipilih tetapi gagal disimpan ulang: %s", saveErr.Error()))
				}

				output.Status = "synced"
				output.Message = "Patient terdeteksi duplikat, menggunakan SATUSEHAT Patient ID lokal yang sudah ada"
				output.ResourceID = fallbackStoredID
				output.ExistingResource = fallbackStoredID
				output.Warnings = append(output.Warnings, "Lookup by ID/IHS/NIK belum menemukan resource, namun server SATUSEHAT mendeteksi data duplikat; ID lokal dipakai sebagai fallback.")
				return output
			}

			output.Status = "failed"
			output.Message = "Sinkronisasi Patient gagal karena duplikat dan SATUSEHAT Patient ID existing belum ditemukan"
			output.Warnings = append(output.Warnings,
				errMessage,
				"Jalankan GET Patient by ID/IHS/NIK lalu pastikan field master pasien satusehat_patient_id terisi dengan ID SATUSEHAT yang valid.",
			)
			return output
		}

		output.Status = "failed"
		output.Message = "Sinkronisasi Patient gagal"
		output.Warnings = append(output.Warnings, errMessage)
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if strings.TrimSpace(result.ResourceID) != "" {
		updates["satusehat_patient_id"] = result.ResourceID
	}

	if err := database.DB.Model(&models.Patient{}).Where("id = ?", patient.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "Patient berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(result.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(result.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "Patient berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(result.ResourceID)
	return output
}

func autoSyncPractitionerForVisit(ctx context.Context, config satusehat.Config, doctor models.Doctor) satusehatAutoSyncResourceResult {
	practitionerActor := satusehat.ResolveDoctorPractitionerActor(doctor)
	output := satusehatAutoSyncResourceResult{
		ResourceType:     "Practitioner",
		Status:           "skipped",
		Message:          "Practitioner belum siap disinkronkan",
		ExistingResource: strings.TrimSpace(practitionerActor.ResourceID),
	}

	preview := satusehat.BuildPractitionerPreview(doctor, config)
	if !preview.Ready {
		output.Message = "Practitioner belum siap dicari dari SATUSEHAT"
		output.Warnings = preview.Warnings
		return output
	}

	lookup, err := satusehat.LookupPractitionerByNIK(ctx, config, doctor.NIKNumber)
	if err != nil {
		output.Status = "failed"
		output.Message = "Lookup Practitioner SATUSEHAT gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	if !lookup.Found || strings.TrimSpace(lookup.ResourceID) == "" {
		output.Status = "failed"
		output.Message = "Practitioner SATUSEHAT tidak ditemukan untuk NIK dokter"
		output.Warnings = append(output.Warnings, preview.Warnings...)
		return output
	}

	now := time.Now()
	updates := map[string]any{
		"satusehat_practitioner_id": strings.TrimSpace(lookup.ResourceID),
		"satusehat_synced_at":       now,
	}
	if err := database.DB.Model(&models.Doctor{}).Where("id = ?", doctor.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "Lookup Practitioner berhasil, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		output.ResourceID = strings.TrimSpace(lookup.ResourceID)
		return output
	}
	if doctor.EmployeeID != nil && *doctor.EmployeeID != 0 {
		if err := database.DB.Model(&models.Employee{}).Where("id = ?", *doctor.EmployeeID).Updates(updates).Error; err != nil {
			output.Warnings = append(output.Warnings, fmt.Sprintf("Practitioner berhasil disimpan ke dokter, tetapi master pegawai gagal diperbarui: %s", err.Error()))
		}
	}

	output.Status = "synced"
	output.Message = "Practitioner berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(lookup.ResourceID)
	return output
}

func autoSyncEncounterForVisit(ctx context.Context, config satusehat.Config, visit models.Visit) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{ResourceType: "Encounter", Status: "skipped", Message: "Encounter belum siap disinkronkan"}
	output.ExistingResource = strings.TrimSpace(visit.SatusehatEncounterID)

	// Use initial preview (in-progress status, no diagnosis) for first POST;
	// use full preview (finished status + diagnosis) for PUT updates.
	var preview satusehat.ResourcePreview
	if strings.TrimSpace(visit.SatusehatEncounterID) == "" {
		preview = satusehat.BuildEncounterInitialPreview(visit, config)
	} else {
		preview = satusehat.BuildEncounterPreview(visit, config)
	}
	if !preview.Ready {
		output.Message = "Encounter belum siap dikirim ke SATUSEHAT"
		output.Warnings = preview.Warnings
		return output
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "Encounter", preview.Resource, visit.SatusehatEncounterID)
	if err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi Encounter gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_encounter_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.Visit{}).Where("id = ?", visit.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi Encounter berhasil, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "Encounter berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	return output
}

func autoSyncVitalSignsFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{ResourceType: "Observation", Status: "skipped", Message: "Tidak ada data vital signs yang siap disinkronkan"}

	var candidate *models.MedicalRecord
	var candidatePreview satusehat.BatchResourcePreview

	for i := range records {
		record := &records[i]
		if !hasObjectiveMedicalRecordData(*record) {
			continue
		}

		preview := satusehat.BuildVitalSignsPreview(*record, config)
		if preview.Ready {
			candidate = record
			candidatePreview = preview
			break
		}

		if candidate == nil {
			candidate = record
			candidatePreview = preview
		}
	}

	if candidate == nil {
		return output
	}

	candidateID := candidate.ID
	output.MedicalRecordID = &candidateID

	if !candidatePreview.Ready {
		output.Message = "Vital signs ditemukan tetapi prasyarat belum lengkap"
		output.Warnings = candidatePreview.Warnings
		return output
	}

	resourceIDs := satusehat.ParseResourceIDMap(candidate.SatusehatVitalSignIDs)
	for _, item := range candidatePreview.Resources {
		result, err := satusehat.UpsertResource(ctx, config, "Observation", item.Resource, item.ExistingResourceID)
		if err != nil {
			output.Status = "failed"
			output.Message = "Sinkronisasi Observation vital signs gagal"
			output.Warnings = append(output.Warnings, err.Error())
			return output
		}
		if strings.TrimSpace(result.ResourceID) != "" {
			resourceIDs[item.Key] = strings.TrimSpace(result.ResourceID)
		}
	}

	now := time.Now()
	serializedIDs, err := satusehat.MarshalResourceIDMap(resourceIDs)
	if err != nil {
		output.Status = "failed"
		output.Message = "Observation vital signs berhasil, tetapi penyusunan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", candidate.ID).Updates(map[string]any{
		"satusehat_vital_sign_ids":        serializedIDs,
		"satusehat_vital_signs_synced_at": now,
	}).Error; err != nil {
		output.Status = "failed"
		output.Message = "Observation vital signs berhasil, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	output.Status = "synced"
	output.Message = "Observation vital signs berhasil auto-sync"
	output.ResourceID = serializedIDs
	return output
}

func autoSyncDiagnosesFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) []satusehatAutoSyncResourceResult {
	outputs := make([]satusehatAutoSyncResourceResult, 0, 8)
	seenDiagnosisIDs := make(map[uint]struct{})

	for _, record := range records {
		for _, diagnosisRef := range record.Diagnoses {
			if diagnosisRef.ID == 0 {
				continue
			}
			if _, exists := seenDiagnosisIDs[diagnosisRef.ID]; exists {
				continue
			}
			seenDiagnosisIDs[diagnosisRef.ID] = struct{}{}

			diagnosis, err := loadDiagnosisForSATUSEHAT(int(diagnosisRef.ID))
			if err != nil {
				item := satusehatAutoSyncResourceResult{
					ResourceType: "Condition",
					Status:       "failed",
					Message:      fmt.Sprintf("Diagnosis #%d gagal dimuat untuk auto-sync", diagnosisRef.ID),
					Warnings:     []string{err.Error()},
				}
				if diagnosisRef.MedicalRecordID != 0 {
					mrID := diagnosisRef.MedicalRecordID
					item.MedicalRecordID = &mrID
				}
				outputs = append(outputs, item)
				continue
			}

			outputs = append(outputs, autoSyncDiagnosisCondition(ctx, config, diagnosis))
		}
	}

	if len(outputs) == 0 {
		outputs = append(outputs, satusehatAutoSyncResourceResult{
			ResourceType: "Condition",
			Status:       "skipped",
			Message:      "Belum ada diagnosis pada kunjungan ini",
		})
	}

	return outputs
}

func autoSyncDiagnosisCondition(ctx context.Context, config satusehat.Config, diagnosis models.MedicalRecordDiagnosis) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{
		ResourceType:     "Condition",
		Status:           "skipped",
		Message:          fmt.Sprintf("Condition diagnosis #%d belum siap disinkronkan", diagnosis.ID),
		ExistingResource: strings.TrimSpace(diagnosis.SatusehatConditionID),
	}
	if diagnosis.MedicalRecordID != 0 {
		mrID := diagnosis.MedicalRecordID
		output.MedicalRecordID = &mrID
	}

	preview := satusehat.BuildDiagnosisPreview(diagnosis, config)
	if !preview.Ready {
		output.Message = fmt.Sprintf("Condition diagnosis #%d belum siap dikirim ke SATUSEHAT", diagnosis.ID)
		output.Warnings = preview.Warnings
		return output
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "Condition", preview.Resource, diagnosis.SatusehatConditionID)
	if err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Sinkronisasi Condition diagnosis #%d gagal", diagnosis.ID)
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_condition_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.MedicalRecordDiagnosis{}).Where("id = ?", diagnosis.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Condition diagnosis #%d berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal", diagnosis.ID)
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = fmt.Sprintf("Condition diagnosis #%d berhasil auto-sync", diagnosis.ID)
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	return output
}

func autoSyncClinicalImpressionFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{ResourceType: "ClinicalImpression", Status: "skipped", Message: "Tidak ada data ClinicalImpression yang siap disinkronkan"}

	var candidate *models.MedicalRecord
	var candidatePreview satusehat.ResourcePreview

	for i := range records {
		record := &records[i]
		if !hasAssessmentMedicalRecordData(*record) {
			continue
		}

		preview := satusehat.BuildClinicalImpressionPreview(*record, config)
		if preview.Ready {
			candidate = record
			candidatePreview = preview
			break
		}

		if candidate == nil {
			candidate = record
			candidatePreview = preview
		}
	}

	if candidate == nil {
		return output
	}

	candidateID := candidate.ID
	output.MedicalRecordID = &candidateID
	output.ExistingResource = strings.TrimSpace(candidate.SatusehatClinicalImpressionID)

	if !candidatePreview.Ready {
		output.Message = "ClinicalImpression ditemukan tetapi prasyarat belum lengkap"
		output.Warnings = candidatePreview.Warnings
		return output
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "ClinicalImpression", candidatePreview.Resource, candidate.SatusehatClinicalImpressionID)
	if err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi ClinicalImpression gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_clinical_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_clinical_impression_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", candidate.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "ClinicalImpression berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "ClinicalImpression berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	return output
}

func autoSyncCarePlanFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{ResourceType: "CarePlan", Status: "skipped", Message: "Tidak ada data CarePlan yang siap disinkronkan"}

	var candidate *models.MedicalRecord
	var candidatePreview satusehat.ResourcePreview

	for i := range records {
		record := &records[i]
		if !hasPlanMedicalRecordData(*record) {
			continue
		}

		preview := satusehat.BuildCarePlanPreview(*record, config)
		if preview.Ready {
			candidate = record
			candidatePreview = preview
			break
		}

		if candidate == nil {
			candidate = record
			candidatePreview = preview
		}
	}

	if candidate == nil {
		return output
	}

	candidateID := candidate.ID
	output.MedicalRecordID = &candidateID
	output.ExistingResource = strings.TrimSpace(candidate.SatusehatCarePlanID)

	if !candidatePreview.Ready {
		output.Message = "CarePlan ditemukan tetapi prasyarat belum lengkap"
		output.Warnings = candidatePreview.Warnings
		return output
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "CarePlan", candidatePreview.Resource, candidate.SatusehatCarePlanID)
	if err != nil {
		output.Status = "failed"
		detail := summarizeSATUSEHATError(err)
		if detail != "" {
			output.Message = fmt.Sprintf("Sinkronisasi CarePlan gagal: %s", detail)
		} else {
			output.Message = "Sinkronisasi CarePlan gagal"
		}
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_care_plan_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_care_plan_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", candidate.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "CarePlan berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "CarePlan berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	return output
}

func autoSyncAllergyIntoleranceFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{ResourceType: "AllergyIntolerance", Status: "skipped", Message: "Tidak ada data alergi yang siap disinkronkan"}

	var candidate *models.MedicalRecord
	var candidatePreview satusehat.ResourcePreview

	for i := range records {
		record := &records[i]
		if !hasMedicalRecordText(record.AllergyNotes, record.Patient.Allergies) {
			continue
		}

		preview := satusehat.BuildAllergyIntolerancePreview(*record, config)
		if preview.Ready {
			candidate = record
			candidatePreview = preview
			break
		}

		if candidate == nil {
			candidate = record
			candidatePreview = preview
		}
	}

	if candidate == nil {
		return output
	}

	candidateID := candidate.ID
	output.MedicalRecordID = &candidateID
	output.ExistingResource = strings.TrimSpace(candidate.SatusehatAllergyIntoleranceID)

	if !candidatePreview.Ready {
		output.Message = "AllergyIntolerance ditemukan tetapi prasyarat belum lengkap"
		output.Warnings = candidatePreview.Warnings
		return output
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "AllergyIntolerance", candidatePreview.Resource, candidate.SatusehatAllergyIntoleranceID)
	if err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi AllergyIntolerance gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_allergy_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_allergy_intolerance_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", candidate.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "AllergyIntolerance berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "AllergyIntolerance berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	return output
}

func autoSyncCompositionFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{ResourceType: "Composition", Status: "skipped", Message: "Tidak ada data Composition yang siap disinkronkan"}

	var candidate *models.MedicalRecord
	var candidatePreview satusehat.ResourcePreview

	for i := range records {
		record := &records[i]
		if !hasMedicalRecordText(record.Subjective, record.Assessment, record.Plan, record.WorkingDiagnosis, record.Disposition, record.Notes) {
			continue
		}

		preview := satusehat.BuildCompositionPreview(*record, config)
		if preview.Ready {
			candidate = record
			candidatePreview = preview
			break
		}

		if candidate == nil {
			candidate = record
			candidatePreview = preview
		}
	}

	if candidate == nil {
		return output
	}

	candidateID := candidate.ID
	output.MedicalRecordID = &candidateID
	output.ExistingResource = strings.TrimSpace(candidate.SatusehatCompositionID)

	if !candidatePreview.Ready {
		output.Message = "Composition ditemukan tetapi prasyarat belum lengkap"
		output.Warnings = candidatePreview.Warnings
		return output
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "Composition", candidatePreview.Resource, candidate.SatusehatCompositionID)
	if err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi Composition gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_composition_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_composition_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", candidate.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "Composition berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "Composition berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	return output
}

func autoSyncLaboratoryItemsFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) []satusehatAutoSyncResourceResult {
	outputs := make([]satusehatAutoSyncResourceResult, 0, 8)
	seenItemIDs := make(map[uint]uint)

	for _, record := range records {
		for _, itemRef := range record.LaboratoryOrderItems {
			if itemRef.ID == 0 {
				continue
			}
			if _, exists := seenItemIDs[itemRef.ID]; exists {
				continue
			}
			seenItemIDs[itemRef.ID] = itemRef.MedicalRecordID

			item, err := loadLaboratoryItemForSATUSEHAT(int(itemRef.ID))
			if err != nil {
				entry := satusehatAutoSyncResourceResult{
					ResourceType: "LaboratoryOrderItem",
					Status:       "failed",
					Message:      fmt.Sprintf("Item laboratorium #%d gagal dimuat untuk auto-sync", itemRef.ID),
					Warnings:     []string{err.Error()},
				}
				if itemRef.MedicalRecordID != 0 {
					mrID := itemRef.MedicalRecordID
					entry.MedicalRecordID = &mrID
				}
				outputs = append(outputs, entry)
				continue
			}

			outputs = append(outputs, autoSyncLaboratoryItem(ctx, config, item))
		}
	}

	if len(outputs) == 0 {
		outputs = append(outputs, satusehatAutoSyncResourceResult{
			ResourceType: "LaboratoryOrderItem",
			Status:       "skipped",
			Message:      "Belum ada item laboratorium pada kunjungan ini",
		})
	}

	return outputs
}

func autoSyncLaboratoryItem(ctx context.Context, config satusehat.Config, item models.LaboratoryOrderItem) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{
		ResourceType: "LaboratoryOrderItem",
		Status:       "skipped",
		Message:      fmt.Sprintf("Item laboratorium #%d belum siap disinkronkan", item.ID),
	}
	if item.MedicalRecordID != 0 {
		mrID := item.MedicalRecordID
		output.MedicalRecordID = &mrID
	}

	preview := satusehat.BuildLaboratoryItemPreview(item, config)
	if !preview.Ready {
		output.Message = fmt.Sprintf("Item laboratorium #%d belum siap dikirim ke SATUSEHAT", item.ID)
		output.Warnings = preview.Warnings
		return output
	}

	serviceRequestResult, err := satusehat.UpsertResource(ctx, config, "ServiceRequest", preview.ServiceRequest.Resource, preview.ServiceRequest.ExistingResourceID)
	if err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Sinkronisasi ServiceRequest item laboratorium #%d gagal", item.ID)
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	serviceRequestReference := preview.ServiceRequest.ExistingResourceID
	if strings.TrimSpace(serviceRequestResult.ResourceID) != "" {
		serviceRequestReference = strings.TrimSpace(serviceRequestResult.ResourceID)
	}

	var specimenResult *satusehat.ResourceOperationResult
	specimenReference := ""
	if preview.Specimen != nil {
		resource := clonePreviewResource(preview.Specimen.Resource)
		resource["request"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}

		result, syncErr := satusehat.UpsertResource(ctx, config, "Specimen", resource, preview.Specimen.ExistingResourceID)
		if syncErr != nil {
			output.Status = "failed"
			output.Message = fmt.Sprintf("Sinkronisasi Specimen item laboratorium #%d gagal", item.ID)
			output.Warnings = append(output.Warnings, syncErr.Error())
			return output
		}

		specimenResult = &result
		specimenReference = preview.Specimen.ExistingResourceID
		if strings.TrimSpace(result.ResourceID) != "" {
			specimenReference = strings.TrimSpace(result.ResourceID)
		}
	}

	observationIDsByKey := make(map[string]string)
	for _, observation := range preview.Observations {
		resource := clonePreviewResource(observation.Resource)
		resource["basedOn"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}
		if specimenReference != "" {
			resource["specimen"] = map[string]any{"reference": "Specimen/" + specimenReference}
		}

		result, syncErr := satusehat.UpsertResource(ctx, config, "Observation", resource, observation.ExistingResourceID)
		if syncErr != nil {
			output.Status = "failed"
			detail := summarizeSATUSEHATError(syncErr)
			if detail != "" {
				output.Message = fmt.Sprintf("Sinkronisasi Observation item laboratorium #%d gagal: %s", item.ID, detail)
			} else {
				output.Message = fmt.Sprintf("Sinkronisasi Observation item laboratorium #%d gagal", item.ID)
			}
			output.Warnings = append(output.Warnings, syncErr.Error())
			return output
		}
		if strings.TrimSpace(result.ResourceID) != "" {
			observationIDsByKey[observation.Key] = strings.TrimSpace(result.ResourceID)
		}
	}

	var diagnosticReportResult *satusehat.ResourceOperationResult
	if preview.DiagnosticReport != nil {
		resource := clonePreviewResource(preview.DiagnosticReport.Resource)
		resource["basedOn"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}
		if specimenReference != "" {
			resource["specimen"] = []map[string]any{{
				"reference": "Specimen/" + specimenReference,
			}}
		}

		resultRefs := make([]map[string]any, 0, len(preview.Observations))
		for _, observation := range preview.Observations {
			observationID := observation.ExistingResourceID
			if syncedID := observationIDsByKey[observation.Key]; syncedID != "" {
				observationID = syncedID
			}
			if observationID == "" {
				continue
			}
			resultRefs = append(resultRefs, map[string]any{"reference": "Observation/" + observationID})
		}
		if len(resultRefs) > 0 {
			resource["result"] = resultRefs
		}

		result, syncErr := satusehat.UpsertResource(ctx, config, "DiagnosticReport", resource, preview.DiagnosticReport.ExistingResourceID)
		if syncErr != nil {
			output.Status = "failed"
			detail := summarizeSATUSEHATError(syncErr)
			if detail != "" {
				output.Message = fmt.Sprintf("Sinkronisasi DiagnosticReport item laboratorium #%d gagal: %s", item.ID, detail)
			} else {
				output.Message = fmt.Sprintf("Sinkronisasi DiagnosticReport item laboratorium #%d gagal", item.ID)
			}
			output.Warnings = append(output.Warnings, syncErr.Error())
			return output
		}
		diagnosticReportResult = &result
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if strings.TrimSpace(serviceRequestResult.ResourceID) != "" {
		updates["satusehat_service_request_id"] = strings.TrimSpace(serviceRequestResult.ResourceID)
	}
	if observationID := observationIDsByKey["item_result"]; observationID != "" {
		updates["satusehat_observation_id"] = observationID
	}
	if diagnosticReportResult != nil && strings.TrimSpace(diagnosticReportResult.ResourceID) != "" {
		updates["satusehat_diagnostic_report_id"] = strings.TrimSpace(diagnosticReportResult.ResourceID)
	}
	if err := database.DB.Model(&models.LaboratoryOrderItem{}).Where("id = ?", item.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Sinkronisasi item laboratorium #%d berhasil, tetapi penyimpanan ID lokal gagal", item.ID)
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	if item.Specimen != nil {
		specimenUpdates := map[string]any{}
		if specimenResult != nil && strings.TrimSpace(specimenResult.ResourceID) != "" {
			specimenUpdates["satusehat_specimen_id"] = strings.TrimSpace(specimenResult.ResourceID)
		}
		if specimenResult != nil {
			specimenUpdates["satusehat_synced_at"] = now
		}
		if len(specimenUpdates) > 0 {
			if err := database.DB.Model(item.Specimen).Updates(specimenUpdates).Error; err != nil {
				output.Status = "failed"
				output.Message = fmt.Sprintf("Sinkronisasi item laboratorium #%d gagal menyimpan specimen", item.ID)
				output.Warnings = append(output.Warnings, err.Error())
				return output
			}
		}
	}

	for _, parameter := range item.ParameterResults {
		observationID := observationIDsByKey[fmt.Sprintf("parameter_%d", parameter.ID)]
		if observationID == "" {
			continue
		}
		if err := database.DB.Model(&parameter).Updates(map[string]any{
			"satusehat_observation_id": observationID,
			"satusehat_synced_at":      now,
		}).Error; err != nil {
			output.Status = "failed"
			output.Message = fmt.Sprintf("Sinkronisasi item laboratorium #%d gagal menyimpan observation parameter", item.ID)
			output.Warnings = append(output.Warnings, err.Error())
			return output
		}
	}

	output.Status = "synced"
	output.Message = fmt.Sprintf("Item laboratorium #%d berhasil auto-sync", item.ID)
	output.ResourceID = strings.TrimSpace(serviceRequestResult.ResourceID)
	return output
}

func autoSyncRadiologyItemsFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) []satusehatAutoSyncResourceResult {
	outputs := make([]satusehatAutoSyncResourceResult, 0, 8)
	seenItemIDs := make(map[uint]uint)

	for _, record := range records {
		for _, itemRef := range record.RadiologyOrderItems {
			if itemRef.ID == 0 {
				continue
			}
			if _, exists := seenItemIDs[itemRef.ID]; exists {
				continue
			}
			seenItemIDs[itemRef.ID] = itemRef.MedicalRecordID

			item, err := loadRadiologyItemForSATUSEHAT(int(itemRef.ID))
			if err != nil {
				entry := satusehatAutoSyncResourceResult{
					ResourceType: "RadiologyOrderItem",
					Status:       "failed",
					Message:      fmt.Sprintf("Item radiologi #%d gagal dimuat untuk auto-sync", itemRef.ID),
					Warnings:     []string{err.Error()},
				}
				if itemRef.MedicalRecordID != 0 {
					mrID := itemRef.MedicalRecordID
					entry.MedicalRecordID = &mrID
				}
				outputs = append(outputs, entry)
				continue
			}

			outputs = append(outputs, autoSyncRadiologyItem(ctx, config, item))
		}
	}

	if len(outputs) == 0 {
		outputs = append(outputs, satusehatAutoSyncResourceResult{
			ResourceType: "RadiologyOrderItem",
			Status:       "skipped",
			Message:      "Belum ada item radiologi pada kunjungan ini",
		})
	}

	return outputs
}

func autoSyncRadiologyItem(ctx context.Context, config satusehat.Config, item models.RadiologyOrderItem) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{
		ResourceType: "RadiologyOrderItem",
		Status:       "skipped",
		Message:      fmt.Sprintf("Item radiologi #%d belum siap disinkronkan", item.ID),
	}
	if item.MedicalRecordID != 0 {
		mrID := item.MedicalRecordID
		output.MedicalRecordID = &mrID
	}

	preview := satusehat.BuildRadiologyItemPreview(item, config)
	if !preview.Ready {
		output.Message = fmt.Sprintf("Item radiologi #%d belum siap dikirim ke SATUSEHAT", item.ID)
		output.Warnings = preview.Warnings
		return output
	}

	serviceRequestResult, err := satusehat.UpsertResource(ctx, config, "ServiceRequest", preview.ServiceRequest.Resource, preview.ServiceRequest.ExistingResourceID)
	if err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Sinkronisasi ServiceRequest item radiologi #%d gagal", item.ID)
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	serviceRequestReference := preview.ServiceRequest.ExistingResourceID
	if strings.TrimSpace(serviceRequestResult.ResourceID) != "" {
		serviceRequestReference = strings.TrimSpace(serviceRequestResult.ResourceID)
	}

	observationIDsByKey := make(map[string]string)
	for _, observation := range preview.Observations {
		resource := clonePreviewResource(observation.Resource)
		resource["basedOn"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}

		result, syncErr := satusehat.UpsertResource(ctx, config, "Observation", resource, observation.ExistingResourceID)
		if syncErr != nil {
			output.Status = "failed"
			detail := summarizeSATUSEHATError(syncErr)
			if detail != "" {
				output.Message = fmt.Sprintf("Sinkronisasi Observation item radiologi #%d gagal: %s", item.ID, detail)
			} else {
				output.Message = fmt.Sprintf("Sinkronisasi Observation item radiologi #%d gagal", item.ID)
			}
			output.Warnings = append(output.Warnings, syncErr.Error())
			return output
		}
		if strings.TrimSpace(result.ResourceID) != "" {
			observationIDsByKey[observation.Key] = strings.TrimSpace(result.ResourceID)
		}
	}

	var diagnosticReportResult *satusehat.ResourceOperationResult
	if preview.DiagnosticReport != nil {
		resource := clonePreviewResource(preview.DiagnosticReport.Resource)
		resource["basedOn"] = []map[string]any{{
			"reference": "ServiceRequest/" + serviceRequestReference,
		}}

		resultRefs := make([]map[string]any, 0, len(preview.Observations))
		for _, observation := range preview.Observations {
			observationID := observation.ExistingResourceID
			if syncedID := observationIDsByKey[observation.Key]; syncedID != "" {
				observationID = syncedID
			}
			if observationID == "" {
				continue
			}
			resultRefs = append(resultRefs, map[string]any{"reference": "Observation/" + observationID})
		}
		if len(resultRefs) > 0 {
			resource["result"] = resultRefs
		}

		result, syncErr := satusehat.UpsertResource(ctx, config, "DiagnosticReport", resource, preview.DiagnosticReport.ExistingResourceID)
		if syncErr != nil {
			output.Status = "failed"
			detail := summarizeSATUSEHATError(syncErr)
			if detail != "" {
				output.Message = fmt.Sprintf("Sinkronisasi DiagnosticReport item radiologi #%d gagal: %s", item.ID, detail)
			} else {
				output.Message = fmt.Sprintf("Sinkronisasi DiagnosticReport item radiologi #%d gagal", item.ID)
			}
			output.Warnings = append(output.Warnings, syncErr.Error())
			return output
		}
		diagnosticReportResult = &result
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if strings.TrimSpace(serviceRequestResult.ResourceID) != "" {
		updates["satusehat_service_request_id"] = strings.TrimSpace(serviceRequestResult.ResourceID)
	}
	if diagnosticReportResult != nil && strings.TrimSpace(diagnosticReportResult.ResourceID) != "" {
		updates["satusehat_diagnostic_report_id"] = strings.TrimSpace(diagnosticReportResult.ResourceID)
	}
	if err := database.DB.Model(&models.RadiologyOrderItem{}).Where("id = ?", item.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Sinkronisasi item radiologi #%d berhasil, tetapi penyimpanan ID lokal gagal", item.ID)
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	for _, parameter := range item.ParameterResults {
		observationID := observationIDsByKey[fmt.Sprintf("parameter_%d", parameter.ID)]
		if observationID == "" {
			continue
		}
		if err := database.DB.Model(&parameter).Updates(map[string]any{
			"satusehat_observation_id": observationID,
			"satusehat_synced_at":      now,
		}).Error; err != nil {
			output.Status = "failed"
			output.Message = fmt.Sprintf("Sinkronisasi item radiologi #%d gagal menyimpan observation parameter", item.ID)
			output.Warnings = append(output.Warnings, err.Error())
			return output
		}
	}

	output.Status = "synced"
	output.Message = fmt.Sprintf("Item radiologi #%d berhasil auto-sync", item.ID)
	output.ResourceID = strings.TrimSpace(serviceRequestResult.ResourceID)
	return output
}

func autoSyncDispensingsForVisit(ctx context.Context, config satusehat.Config, visitID uint) []satusehatAutoSyncResourceResult {
	outputs := make([]satusehatAutoSyncResourceResult, 0, 8)

	var dispensingIDs []uint
	if err := database.DB.Model(&models.Dispensing{}).Where("visit_id = ?", visitID).Pluck("id", &dispensingIDs).Error; err != nil {
		outputs = append(outputs, satusehatAutoSyncResourceResult{
			ResourceType: "MedicationDispense",
			Status:       "failed",
			Message:      "Gagal memuat daftar dispensing untuk auto-sync",
			Warnings:     []string{err.Error()},
		})
		return outputs
	}

	if len(dispensingIDs) == 0 {
		outputs = append(outputs, satusehatAutoSyncResourceResult{
			ResourceType: "MedicationDispense",
			Status:       "skipped",
			Message:      "Belum ada dispensing pada kunjungan ini",
		})
		return outputs
	}

	for _, dispensingID := range dispensingIDs {
		dispensing, err := loadDispensingForSATUSEHAT(int(dispensingID))
		if err != nil {
			outputs = append(outputs, satusehatAutoSyncResourceResult{
				ResourceType: "MedicationDispense",
				Status:       "failed",
				Message:      fmt.Sprintf("Dispensing #%d gagal dimuat untuk auto-sync", dispensingID),
				Warnings:     []string{err.Error()},
			})
			continue
		}

		outputs = append(outputs, autoSyncDispensingItem(ctx, config, dispensing))
	}

	return outputs
}

func autoSyncDispensingItem(ctx context.Context, config satusehat.Config, dispensing models.Dispensing) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{
		ResourceType:     "MedicationDispense",
		Status:           "skipped",
		Message:          fmt.Sprintf("Dispensing #%d belum siap disinkronkan", dispensing.ID),
		ExistingResource: strings.TrimSpace(dispensing.SatusehatMedicationDispenseID),
	}
	if dispensing.MedicalRecordID != 0 {
		mrID := dispensing.MedicalRecordID
		output.MedicalRecordID = &mrID
	}

	medicine := resolveDispensingMedicineSnapshot(dispensing)
	kfaDetail, kfaErr := resolveMedicineKFADetail(ctx, config, medicine)
	preview := satusehat.BuildMedicationDispensePreview(dispensing, kfaDetail, config)
	if kfaErr != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Lookup KFA dispensing #%d gagal", dispensing.ID)
		output.Warnings = append(output.Warnings, kfaErr.Error())
		output.Warnings = append(output.Warnings, preview.Warnings...)
		return output
	}

	if !preview.Ready {
		output.Message = fmt.Sprintf("Dispensing #%d belum siap dikirim ke SATUSEHAT", dispensing.ID)
		output.Warnings = preview.Warnings
		return output
	}

	if medicationPreview := findRelatedResourcePreview(preview.RelatedResources, "medication"); medicationPreview != nil {
		result, err := satusehat.UpsertResource(ctx, config, "Medication", medicationPreview.Resource, medicine.SatusehatMedicationID)
		if err != nil {
			output.Status = "failed"
			output.Message = fmt.Sprintf("Sinkronisasi Medication untuk dispensing #%d gagal", dispensing.ID)
			output.Warnings = append(output.Warnings, err.Error())
			return output
		}

		medicineUpdates := map[string]any{"satusehat_medication_synced_at": time.Now()}
		if strings.TrimSpace(result.ResourceID) != "" {
			medicineUpdates["satusehat_medication_id"] = strings.TrimSpace(result.ResourceID)
			medicine.SatusehatMedicationID = strings.TrimSpace(result.ResourceID)
		}
		if err := database.DB.Model(&models.Medicine{}).Where("id = ?", medicine.ID).Updates(medicineUpdates).Error; err != nil {
			output.Warnings = append(output.Warnings, fmt.Sprintf("Gagal menyimpan ID Medication lokal: %s", err.Error()))
		}

		setMedicationReferenceOnResource(preview.Resource, result.ResourceID, resolveMedicationDisplayNameSnapshot(medicine, kfaDetail))
	}

	result, err := satusehat.UpsertResource(ctx, config, "MedicationDispense", preview.Resource, dispensing.SatusehatMedicationDispenseID)
	if err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Sinkronisasi MedicationDispense dispensing #%d gagal", dispensing.ID)
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if strings.TrimSpace(result.ResourceID) != "" {
		updates["satusehat_medication_dispense_id"] = strings.TrimSpace(result.ResourceID)
	}

	if err := database.DB.Model(&models.Dispensing{}).Where("id = ?", dispensing.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("MedicationDispense dispensing #%d berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal", dispensing.ID)
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(result.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(result.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = fmt.Sprintf("MedicationDispense dispensing #%d berhasil auto-sync", dispensing.ID)
	output.ResourceID = strings.TrimSpace(result.ResourceID)
	output.Warnings = append(output.Warnings, preview.Warnings...)
	return output
}

func autoSyncProceduresFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) []satusehatAutoSyncResourceResult {
	outputs := make([]satusehatAutoSyncResourceResult, 0, 8)
	seenActionIDs := make(map[uint]struct{})

	for _, record := range records {
		for _, actionRef := range record.Actions {
			if actionRef.ID == 0 {
				continue
			}
			if _, exists := seenActionIDs[actionRef.ID]; exists {
				continue
			}
			seenActionIDs[actionRef.ID] = struct{}{}

			action, err := loadMedicalActionForSATUSEHAT(int(actionRef.ID))
			if err != nil {
				item := satusehatAutoSyncResourceResult{
					ResourceType: "Procedure",
					Status:       "failed",
					Message:      fmt.Sprintf("Tindakan #%d gagal dimuat untuk auto-sync", actionRef.ID),
					Warnings:     []string{err.Error()},
				}
				if actionRef.MedicalRecordID != 0 {
					mrID := actionRef.MedicalRecordID
					item.MedicalRecordID = &mrID
				}
				outputs = append(outputs, item)
				continue
			}

			outputs = append(outputs, autoSyncProcedureAction(ctx, config, action))
		}
	}

	if len(outputs) == 0 {
		outputs = append(outputs, satusehatAutoSyncResourceResult{
			ResourceType: "Procedure",
			Status:       "skipped",
			Message:      "Belum ada tindakan pada kunjungan ini",
		})
	}

	return outputs
}

func autoSyncProcedureAction(ctx context.Context, config satusehat.Config, action models.MedicalAction) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{
		ResourceType:     "Procedure",
		Status:           "skipped",
		Message:          fmt.Sprintf("Procedure tindakan #%d belum siap disinkronkan", action.ID),
		ExistingResource: strings.TrimSpace(action.SatusehatProcedureID),
	}
	if action.MedicalRecordID != 0 {
		mrID := action.MedicalRecordID
		output.MedicalRecordID = &mrID
	}

	preview := satusehat.BuildProcedurePreview(action, config)
	if !preview.Ready {
		output.Message = fmt.Sprintf("Procedure tindakan #%d belum siap dikirim ke SATUSEHAT", action.ID)
		output.Warnings = preview.Warnings
		return output
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "Procedure", preview.Resource, action.SatusehatProcedureID)
	if err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Sinkronisasi Procedure tindakan #%d gagal", action.ID)
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_procedure_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.MedicalAction{}).Where("id = ?", action.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Procedure tindakan #%d berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal", action.ID)
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = fmt.Sprintf("Procedure tindakan #%d berhasil auto-sync", action.ID)
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	return output
}

func autoSyncMedicationRequestsFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) []satusehatAutoSyncResourceResult {
	outputs := make([]satusehatAutoSyncResourceResult, 0, 8)
	seenPrescriptionIDs := make(map[uint]struct{})

	for _, record := range records {
		for _, prescriptionRef := range record.Prescriptions {
			if prescriptionRef.ID == 0 {
				continue
			}
			if _, exists := seenPrescriptionIDs[prescriptionRef.ID]; exists {
				continue
			}
			seenPrescriptionIDs[prescriptionRef.ID] = struct{}{}

			prescription, err := loadPrescriptionForSATUSEHAT(int(prescriptionRef.ID))
			if err != nil {
				item := satusehatAutoSyncResourceResult{
					ResourceType: "MedicationRequest",
					Status:       "failed",
					Message:      fmt.Sprintf("Prescription #%d gagal dimuat untuk auto-sync obat", prescriptionRef.ID),
					Warnings:     []string{err.Error()},
				}
				if prescriptionRef.MedicalRecordID != 0 {
					mrID := prescriptionRef.MedicalRecordID
					item.MedicalRecordID = &mrID
				}
				outputs = append(outputs, item)
				continue
			}

			outputs = append(outputs, autoSyncPrescriptionMedicationRequest(ctx, config, prescription))
		}
	}

	if len(outputs) == 0 {
		outputs = append(outputs, satusehatAutoSyncResourceResult{
			ResourceType: "MedicationRequest",
			Status:       "skipped",
			Message:      "Belum ada resep obat pada kunjungan ini",
		})
	}

	return outputs
}

func autoSyncPrescriptionMedicationRequest(ctx context.Context, config satusehat.Config, prescription models.Prescription) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{
		ResourceType:     "MedicationRequest",
		Status:           "skipped",
		Message:          fmt.Sprintf("MedicationRequest prescription #%d belum siap disinkronkan", prescription.ID),
		ExistingResource: strings.TrimSpace(prescription.SatusehatMedicationRequestID),
	}
	if prescription.MedicalRecordID != 0 {
		mrID := prescription.MedicalRecordID
		output.MedicalRecordID = &mrID
	}

	kfaDetail, kfaErr := resolveMedicineKFADetail(ctx, config, prescription.Medicine)
	preview := satusehat.BuildMedicationRequestPreview(prescription, kfaDetail, config)
	if kfaErr != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Lookup KFA prescription #%d gagal", prescription.ID)
		output.Warnings = append(output.Warnings, kfaErr.Error())
		output.Warnings = append(output.Warnings, preview.Warnings...)
		return output
	}

	if !preview.Ready {
		output.Message = fmt.Sprintf("MedicationRequest prescription #%d belum siap dikirim ke SATUSEHAT", prescription.ID)
		output.Warnings = preview.Warnings
		return output
	}

	medicationSynced := false
	if medicationPreview := findRelatedResourcePreview(preview.RelatedResources, "medication"); medicationPreview != nil {
		medicationResult, err := satusehat.UpsertResource(ctx, config, "Medication", medicationPreview.Resource, prescription.Medicine.SatusehatMedicationID)
		if err != nil {
			output.Status = "failed"
			output.Message = fmt.Sprintf("Sinkronisasi Medication untuk prescription #%d gagal", prescription.ID)
			output.Warnings = append(output.Warnings, err.Error())
			return output
		}

		medicationSynced = true
		medicineUpdates := map[string]any{"satusehat_medication_synced_at": time.Now()}
		if strings.TrimSpace(medicationResult.ResourceID) != "" {
			medicineUpdates["satusehat_medication_id"] = medicationResult.ResourceID
		}
		if err := database.DB.Model(&models.Medicine{}).Where("id = ?", prescription.Medicine.ID).Updates(medicineUpdates).Error; err != nil {
			output.Warnings = append(output.Warnings, fmt.Sprintf("Gagal menyimpan ID Medication lokal: %s", err.Error()))
		}

		setMedicationReferenceOnResource(preview.Resource, medicationResult.ResourceID, resolveMedicationDisplayNameSnapshot(prescription.Medicine, kfaDetail))
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "MedicationRequest", preview.Resource, prescription.SatusehatMedicationRequestID)
	if err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("Sinkronisasi MedicationRequest prescription #%d gagal", prescription.ID)
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_medication_request_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.Prescription{}).Where("id = ?", prescription.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = fmt.Sprintf("MedicationRequest prescription #%d berhasil di SATUSEHAT, tetapi penyimpanan ID lokal gagal", prescription.ID)
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	if medicationSynced {
		output.Message = fmt.Sprintf("Medication + MedicationRequest prescription #%d berhasil auto-sync", prescription.ID)
	} else {
		output.Message = fmt.Sprintf("MedicationRequest prescription #%d berhasil auto-sync", prescription.ID)
	}
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	output.Warnings = append(output.Warnings, preview.Warnings...)
	return output
}

func autoSyncGoalFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{ResourceType: "Goal", Status: "skipped", Message: "Tidak ada data Goal yang siap disinkronkan"}

	var candidate *models.MedicalRecord
	var candidatePreview satusehat.ResourcePreview

	for i := range records {
		record := &records[i]
		if !hasMedicalRecordText(record.Plan, record.FollowUpInstruction, record.Assessment) {
			continue
		}

		preview := satusehat.BuildGoalPreview(*record, config)
		if preview.Ready {
			candidate = record
			candidatePreview = preview
			break
		}

		if candidate == nil {
			candidate = record
			candidatePreview = preview
		}
	}

	if candidate == nil {
		output.Message = "Belum ada plan/tindak lanjut untuk membuat Goal"
		return output
	}

	candidateID := candidate.ID
	output.MedicalRecordID = &candidateID
	output.ExistingResource = strings.TrimSpace(candidate.SatusehatGoalID)

	if !candidatePreview.Ready {
		output.Message = "Goal ditemukan tetapi prasyarat belum lengkap"
		output.Warnings = candidatePreview.Warnings
		return output
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "Goal", candidatePreview.Resource, candidate.SatusehatGoalID)
	if err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi Goal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_goal_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_goal_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", candidate.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi Goal berhasil, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "Goal berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	return output
}

func autoSyncFamilyHistoryFromVisitRecords(ctx context.Context, config satusehat.Config, records []models.MedicalRecord) satusehatAutoSyncResourceResult {
	output := satusehatAutoSyncResourceResult{ResourceType: "FamilyMemberHistory", Status: "skipped", Message: "Tidak ada data FamilyMemberHistory yang siap disinkronkan"}

	var candidate *models.MedicalRecord
	var candidatePreview satusehat.ResourcePreview

	for i := range records {
		record := &records[i]
		if !hasMedicalRecordText(record.FamilyHistory) {
			continue
		}

		preview := satusehat.BuildFamilyMemberHistoryPreview(*record, config)
		if preview.Ready {
			candidate = record
			candidatePreview = preview
			break
		}

		if candidate == nil {
			candidate = record
			candidatePreview = preview
		}
	}

	if candidate == nil {
		output.Message = "Belum ada family history untuk membuat FamilyMemberHistory"
		return output
	}

	candidateID := candidate.ID
	output.MedicalRecordID = &candidateID
	output.ExistingResource = strings.TrimSpace(candidate.SatusehatFamilyHistoryID)

	if !candidatePreview.Ready {
		output.Message = "FamilyMemberHistory ditemukan tetapi prasyarat belum lengkap"
		output.Warnings = candidatePreview.Warnings
		return output
	}

	upsertResult, err := satusehat.UpsertResource(ctx, config, "FamilyMemberHistory", candidatePreview.Resource, candidate.SatusehatFamilyHistoryID)
	if err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi FamilyMemberHistory gagal"
		output.Warnings = append(output.Warnings, err.Error())
		return output
	}

	now := time.Now()
	updates := map[string]any{"satusehat_family_history_synced_at": now}
	if strings.TrimSpace(upsertResult.ResourceID) != "" {
		updates["satusehat_family_history_id"] = upsertResult.ResourceID
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", candidate.ID).Updates(updates).Error; err != nil {
		output.Status = "failed"
		output.Message = "Sinkronisasi FamilyMemberHistory berhasil, tetapi penyimpanan ID lokal gagal"
		output.Warnings = append(output.Warnings, err.Error())
		if strings.TrimSpace(upsertResult.ResourceID) != "" {
			output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
		}
		return output
	}

	output.Status = "synced"
	output.Message = "FamilyMemberHistory berhasil auto-sync"
	output.ResourceID = strings.TrimSpace(upsertResult.ResourceID)
	return output
}

func PreviewSATUSEHATPrescription(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	prescriptionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID prescription tidak valid"})
		return
	}

	prescription, err := loadPrescriptionForSATUSEHAT(prescriptionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Prescription tidak ditemukan"})
		return
	}

	kfaDetail, kfaErr := resolveMedicineKFADetail(c.Request.Context(), config, prescription.Medicine)
	preview := satusehat.BuildMedicationRequestPreview(prescription, kfaDetail, config)
	if kfaErr != nil {
		preview.Warnings = append(preview.Warnings, fmt.Sprintf("Lookup KFA gagal: %s", kfaErr.Error()))
		preview.Ready = false
	}
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATPrescription(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:    "sync",
			ResourceType: "MedicationRequest",
			Method:       http.MethodPost,
			Endpoint:     satusehatLogEndpoint(c),
			StatusCode:   http.StatusInternalServerError,
			Success:      false,
			ErrorMessage: "Gagal memuat konfigurasi SATUSEHAT",
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	prescriptionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID prescription tidak valid"})
		return
	}

	prescription, err := loadPrescriptionForSATUSEHAT(prescriptionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Prescription tidak ditemukan"})
		return
	}

	kfaDetail, kfaErr := resolveMedicineKFADetail(c.Request.Context(), config, prescription.Medicine)
	preview := satusehat.BuildMedicationRequestPreview(prescription, kfaDetail, config)
	if kfaErr != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "sync",
			ResourceType:   "MedicationRequest",
			Mode:           config.ActiveMode,
			Method:         http.MethodPost,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusBadGateway,
			Success:        false,
			ErrorMessage:   kfaErr.Error(),
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":         kfaErr.Error(),
				"warnings":      preview.Warnings,
				"prerequisites": preview.Prerequisites,
				"kfa_code":      prescription.Medicine.KFACode,
			},
			ResourceID: prescription.SatusehatMedicationRequestID,
		})
		c.JSON(http.StatusBadGateway, gin.H{"error": kfaErr.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}
	if !preview.Ready {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "sync",
			ResourceType:   "MedicationRequest",
			Mode:           config.ActiveMode,
			Method:         http.MethodPost,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusUnprocessableEntity,
			Success:        false,
			ErrorMessage:   "Payload MedicationRequest belum siap dikirim ke SATUSEHAT.",
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":         "Payload MedicationRequest belum siap dikirim ke SATUSEHAT.",
				"warnings":      preview.Warnings,
				"prerequisites": preview.Prerequisites,
				"kfa_code":      prescription.Medicine.KFACode,
			},
			ResourceID: prescription.SatusehatMedicationRequestID,
		})
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload MedicationRequest belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	var medicationResult *satusehat.ResourceOperationResult
	if medicationPreview := findRelatedResourcePreview(preview.RelatedResources, "medication"); medicationPreview != nil {
		result, err := satusehat.UpsertResource(c.Request.Context(), config, "Medication", medicationPreview.Resource, prescription.Medicine.SatusehatMedicationID)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
			return
		}
		medicationResult = &result
		medicineUpdates := map[string]any{"satusehat_medication_synced_at": time.Now()}
		if result.ResourceID != "" {
			medicineUpdates["satusehat_medication_id"] = result.ResourceID
			prescription.Medicine.SatusehatMedicationID = result.ResourceID
		}
		_ = database.DB.Model(&models.Medicine{}).Where("id = ?", prescription.Medicine.ID).Updates(medicineUpdates).Error
		setMedicationReferenceOnResource(preview.Resource, result.ResourceID, resolveMedicationDisplayNameSnapshot(prescription.Medicine, kfaDetail))
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "MedicationRequest", preview.Resource, prescription.SatusehatMedicationRequestID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_medication_request_id"] = result.ResourceID
	}
	if err := database.DB.Model(&prescription).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi prescription"})
		return
	}

	if result.ResourceID != "" {
		prescription.SatusehatMedicationRequestID = result.ResourceID
	}
	prescription.SatusehatSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "MedicationRequest berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"prescription": prescription,
			"medication":   medicationResult,
			"sync":         result,
		},
	})
}

func PreviewSATUSEHATDispensing(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	dispensingID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID dispensing tidak valid"})
		return
	}

	dispensing, err := loadDispensingForSATUSEHAT(dispensingID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dispensing tidak ditemukan"})
		return
	}

	medicine := resolveDispensingMedicineSnapshot(dispensing)
	kfaDetail, kfaErr := resolveMedicineKFADetail(c.Request.Context(), config, medicine)
	preview := satusehat.BuildMedicationDispensePreview(dispensing, kfaDetail, config)
	if kfaErr != nil {
		preview.Warnings = append(preview.Warnings, fmt.Sprintf("Lookup KFA gagal: %s", kfaErr.Error()))
		preview.Ready = false
	}
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATDispensing(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:    "sync",
			ResourceType: "MedicationDispense",
			Method:       http.MethodPost,
			Endpoint:     satusehatLogEndpoint(c),
			StatusCode:   http.StatusInternalServerError,
			Success:      false,
			ErrorMessage: "Gagal memuat konfigurasi SATUSEHAT",
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	dispensingID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID dispensing tidak valid"})
		return
	}

	dispensing, err := loadDispensingForSATUSEHAT(dispensingID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dispensing tidak ditemukan"})
		return
	}

	medicine := resolveDispensingMedicineSnapshot(dispensing)
	kfaDetail, kfaErr := resolveMedicineKFADetail(c.Request.Context(), config, medicine)
	preview := satusehat.BuildMedicationDispensePreview(dispensing, kfaDetail, config)
	if kfaErr != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "sync",
			ResourceType:   "MedicationDispense",
			Mode:           config.ActiveMode,
			Method:         http.MethodPost,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusBadGateway,
			Success:        false,
			ErrorMessage:   kfaErr.Error(),
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":         kfaErr.Error(),
				"warnings":      preview.Warnings,
				"prerequisites": preview.Prerequisites,
				"kfa_code":      medicine.KFACode,
			},
			ResourceID: dispensing.SatusehatMedicationDispenseID,
		})
		c.JSON(http.StatusBadGateway, gin.H{"error": kfaErr.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}
	if !preview.Ready {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "sync",
			ResourceType:   "MedicationDispense",
			Mode:           config.ActiveMode,
			Method:         http.MethodPost,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusUnprocessableEntity,
			Success:        false,
			ErrorMessage:   "Payload MedicationDispense belum siap dikirim ke SATUSEHAT.",
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":         "Payload MedicationDispense belum siap dikirim ke SATUSEHAT.",
				"warnings":      preview.Warnings,
				"prerequisites": preview.Prerequisites,
				"kfa_code":      medicine.KFACode,
			},
			ResourceID: dispensing.SatusehatMedicationDispenseID,
		})
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload MedicationDispense belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	var medicationResult *satusehat.ResourceOperationResult
	if medicationPreview := findRelatedResourcePreview(preview.RelatedResources, "medication"); medicationPreview != nil {
		result, err := satusehat.UpsertResource(c.Request.Context(), config, "Medication", medicationPreview.Resource, medicine.SatusehatMedicationID)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
			return
		}
		medicationResult = &result
		medicineUpdates := map[string]any{"satusehat_medication_synced_at": time.Now()}
		if result.ResourceID != "" {
			medicineUpdates["satusehat_medication_id"] = result.ResourceID
			medicine.SatusehatMedicationID = result.ResourceID
		}
		_ = database.DB.Model(&models.Medicine{}).Where("id = ?", medicine.ID).Updates(medicineUpdates).Error
		setMedicationReferenceOnResource(preview.Resource, result.ResourceID, resolveMedicationDisplayNameSnapshot(medicine, kfaDetail))
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "MedicationDispense", preview.Resource, dispensing.SatusehatMedicationDispenseID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_medication_dispense_id"] = result.ResourceID
	}
	if err := database.DB.Model(&dispensing).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi dispensing"})
		return
	}

	if result.ResourceID != "" {
		dispensing.SatusehatMedicationDispenseID = result.ResourceID
	}
	dispensing.SatusehatSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "MedicationDispense berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"dispensing": dispensing,
			"medication": medicationResult,
			"sync":       result,
		},
	})
}

func SyncSATUSEHATMedicine(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:    "sync",
			ResourceType: "Medication",
			Method:       http.MethodPost,
			Endpoint:     satusehatLogEndpoint(c),
			StatusCode:   http.StatusInternalServerError,
			Success:      false,
			ErrorMessage: "Gagal memuat konfigurasi SATUSEHAT",
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	medicineID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID obat tidak valid"})
		return
	}

	medicine, err := loadMedicineForSATUSEHAT(medicineID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Obat tidak ditemukan"})
		return
	}

	kfaDetail, kfaErr := resolveMedicineKFADetail(c.Request.Context(), config, medicine)
	preview := satusehat.BuildMedicationMasterPreviewForMedicine(medicine, kfaDetail, config)
	if kfaErr != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "sync",
			ResourceType:   "Medication",
			Mode:           config.ActiveMode,
			Method:         http.MethodPost,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusBadGateway,
			Success:        false,
			ErrorMessage:   kfaErr.Error(),
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":         kfaErr.Error(),
				"warnings":      preview.Warnings,
				"prerequisites": preview.Prerequisites,
				"kfa_code":      medicine.KFACode,
			},
			ResourceID: medicine.SatusehatMedicationID,
		})
		c.JSON(http.StatusBadGateway, gin.H{"error": kfaErr.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}
	if !preview.Ready {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "sync",
			ResourceType:   "Medication",
			Mode:           config.ActiveMode,
			Method:         http.MethodPost,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusUnprocessableEntity,
			Success:        false,
			ErrorMessage:   "Payload Medication master belum siap dikirim ke SATUSEHAT.",
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":         "Payload Medication master belum siap dikirim ke SATUSEHAT.",
				"warnings":      preview.Warnings,
				"prerequisites": preview.Prerequisites,
				"kfa_code":      medicine.KFACode,
			},
			ResourceID: medicine.SatusehatMedicationID,
		})
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Medication master belum siap dikirim ke SATUSEHAT.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "Medication", preview.Resource, medicine.SatusehatMedicationID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_medication_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_medication_id"] = result.ResourceID
	}
	if err := database.DB.Model(&medicine).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi medication"})
		return
	}

	if result.ResourceID != "" {
		medicine.SatusehatMedicationID = result.ResourceID
	}
	medicine.SatusehatMedicationSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Medication master berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"medicine": medicine,
			"sync":     result,
		},
	})
}

func loadPrescriptionForSATUSEHAT(prescriptionID int) (models.Prescription, error) {
	var prescription models.Prescription
	err := database.DB.
		Preload("Medicine").
		Preload("Medicine.Unit").
		Preload("MedicalRecord").
		Preload("MedicalRecord.Patient").
		Preload("MedicalRecord.Visit").
		Preload("MedicalRecord.Doctor").
		Preload("MedicalRecord.Doctor.Employee").
		First(&prescription, prescriptionID).Error
	return prescription, err
}

func loadDispensingForSATUSEHAT(dispensingID int) (models.Dispensing, error) {
	var dispensing models.Dispensing
	err := database.DB.
		Preload("Medicine").
		Preload("Medicine.Unit").
		Preload("Prescription").
		Preload("Prescription.Medicine").
		Preload("Prescription.Medicine.Unit").
		Preload("Dispenser").
		Preload("Dispenser.Employee").
		Preload("MedicalRecord").
		Preload("MedicalRecord.Patient").
		Preload("MedicalRecord.Visit").
		Preload("MedicalRecord.Doctor").
		Preload("MedicalRecord.Doctor.Employee").
		Preload("MedicalRecord.PrescriptionProcessor").
		Preload("MedicalRecord.PrescriptionProcessor.Employee").
		First(&dispensing, dispensingID).Error
	return dispensing, err
}

func loadMedicineForSATUSEHAT(medicineID int) (models.Medicine, error) {
	var medicine models.Medicine
	err := database.DB.
		Preload("Category").
		Preload("Unit").
		First(&medicine, medicineID).Error
	return medicine, err
}

func loadPolyclinicForSATUSEHAT(polyclinicID int) (models.Polyclinic, error) {
	var polyclinic models.Polyclinic
	err := database.DB.First(&polyclinic, polyclinicID).Error
	return polyclinic, err
}

func recordSATUSEHATPreflightFailure(c *gin.Context, entry satusehat.ActivityLogEntry) {
	if strings.TrimSpace(entry.Endpoint) == "" {
		entry.Endpoint = satusehatLogEndpoint(c)
	}
	if strings.TrimSpace(entry.Method) == "" {
		entry.Method = http.MethodPost
	}
	satusehat.RecordActivityLog(entry)
}

func satusehatLogEndpoint(c *gin.Context) string {
	if c == nil {
		return ""
	}
	if fullPath := strings.TrimSpace(c.FullPath()); fullPath != "" {
		return fullPath
	}
	if c.Request != nil && c.Request.URL != nil {
		return strings.TrimSpace(c.Request.URL.Path)
	}
	return ""
}

func clonePreviewResource(source map[string]any) map[string]any {
	clone := make(map[string]any, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}

func resolveMedicineKFADetail(ctx context.Context, config satusehat.Config, medicine models.Medicine) (*satusehat.KFAProductDetail, error) {
	if strings.TrimSpace(medicine.KFACode) == "" {
		return nil, nil
	}
	return satusehat.GetKFAProductDetail(ctx, config, medicine.KFACode)
}

func findRelatedResourcePreview(resources []satusehat.NamedResourcePreview, key string) *satusehat.NamedResourcePreview {
	for index := range resources {
		if strings.EqualFold(strings.TrimSpace(resources[index].Key), strings.TrimSpace(key)) {
			return &resources[index]
		}
	}
	return nil
}

func setMedicationReferenceOnResource(resource map[string]any, medicationID, display string) {
	if resource == nil {
		return
	}
	reference := map[string]any{"display": display}
	if strings.TrimSpace(medicationID) != "" {
		reference["reference"] = fmt.Sprintf("Medication/%s", strings.TrimSpace(medicationID))
	}
	resource["medicationReference"] = reference
}

func resolveDispensingMedicineSnapshot(dispensing models.Dispensing) models.Medicine {
	if dispensing.MedicineID != nil && dispensing.Medicine.ID != 0 {
		return dispensing.Medicine
	}
	if dispensing.Prescription.Medicine.ID != 0 {
		return dispensing.Prescription.Medicine
	}
	return models.Medicine{}
}

func resolveMedicationDisplayNameSnapshot(medicine models.Medicine, detail *satusehat.KFAProductDetail) string {
	if detail != nil {
		for _, value := range []string{detail.Name, medicine.KFAName, medicine.Name, medicine.GenericName} {
			if trimmed := strings.TrimSpace(value); trimmed != "" {
				return trimmed
			}
		}
		return ""
	}
	for _, value := range []string{medicine.KFAName, medicine.Name, medicine.GenericName} {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func PreviewSATUSEHATPatient(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	patientID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID pasien tidak valid"})
		return
	}

	var patient models.Patient
	if err := database.DB.First(&patient, patientID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pasien tidak ditemukan"})
		return
	}

	preview := satusehat.BuildPatientPreview(patient, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func PreviewSATUSEHATPatientResolve(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	patientID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID pasien tidak valid"})
		return
	}

	var patient models.Patient
	if err := database.DB.First(&patient, patientID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pasien tidak ditemukan"})
		return
	}

	rawStoredID := strings.TrimSpace(patient.SatusehatPatientID)
	normalizedStoredID := satusehat.NormalizeFHIRResourceUUID(rawStoredID)
	normalizedNIK := satusehat.NormalizeIndonesianNIK(patient.NIK)
	nikCandidates, nikWarnings := patientNIKLookupCandidates(patient.NIK)

	byID := gin.H{
		"attempted":     false,
		"input":         rawStoredID,
		"normalized_id": normalizedStoredID,
		"status":        "skipped",
		"found":         false,
		"resource_id":   "",
		"endpoint":      "",
		"error":         "",
		"reason":        "SATUSEHAT Patient ID lokal kosong",
	}

	if rawStoredID != "" && normalizedStoredID == "" {
		byID["reason"] = "SATUSEHAT Patient ID lokal bukan UUID valid"
	}

	byIHS := gin.H{
		"attempted":   false,
		"input":       rawStoredID,
		"status":      "skipped",
		"found":       false,
		"resource_id": "",
		"endpoint":    "",
		"error":       "",
		"reason":      "GET by IHS Number tidak diperlukan",
	}

	resolvedID := ""
	if normalizedStoredID != "" {
		byID["attempted"] = true
		lookupByID, lookupByIDErr := satusehat.LookupPatientByID(c.Request.Context(), config, normalizedStoredID)
		byID["endpoint"] = lookupByID.Endpoint
		if lookupByIDErr != nil {
			byID["status"] = "error"
			byID["error"] = lookupByIDErr.Error()
			byID["reason"] = "GET by ID gagal"
		} else if lookupByID.Found && strings.TrimSpace(lookupByID.ResourceID) != "" {
			resolvedID = strings.TrimSpace(lookupByID.ResourceID)
			byID["status"] = "found"
			byID["found"] = true
			byID["resource_id"] = resolvedID
			byID["reason"] = "Patient ditemukan dengan GET by ID"
		} else {
			byID["status"] = "not_found"
			byID["reason"] = "Patient tidak ditemukan dengan GET by ID"
		}
	} else if rawStoredID != "" {
		byIHS["attempted"] = true
		lookupByIHS, lookupByIHSErr := satusehat.LookupPatientByIHSNumber(c.Request.Context(), config, rawStoredID)
		byIHS["endpoint"] = lookupByIHS.Endpoint
		if lookupByIHSErr != nil {
			byIHS["status"] = "error"
			byIHS["error"] = lookupByIHSErr.Error()
			byIHS["reason"] = "GET by IHS Number gagal"
		} else if lookupByIHS.Found && strings.TrimSpace(lookupByIHS.ResourceID) != "" {
			resolvedID = strings.TrimSpace(lookupByIHS.ResourceID)
			byIHS["status"] = "found"
			byIHS["found"] = true
			byIHS["resource_id"] = resolvedID
			byIHS["reason"] = "Patient ditemukan dengan GET by IHS Number"
		} else {
			byIHS["status"] = "not_found"
			byIHS["reason"] = "Patient tidak ditemukan dengan GET by IHS Number"
		}
	}

	byNIK := gin.H{
		"attempted":            false,
		"attempted_candidates": []string{},
		"lookup_candidates":    nikCandidates,
		"candidate_warnings":   nikWarnings,
		"input":                patient.NIK,
		"normalized_nik":       normalizedNIK,
		"status":               "skipped",
		"found":                false,
		"resource_id":          "",
		"endpoint":             "",
		"error":                "",
		"reason":               "GET by NIK tidak diperlukan karena GET by ID sudah menemukan data",
	}

	if resolvedID == "" {
		if len(nikCandidates) > 0 {
			attemptedCandidates := make([]string, 0, len(nikCandidates))
			byNIK["attempted"] = true
			for _, candidateNIK := range nikCandidates {
				attemptedCandidates = append(attemptedCandidates, candidateNIK)
				lookupByNIK, lookupByNIKErr := satusehat.LookupPatientByNIKWithName(c.Request.Context(), config, candidateNIK, patient.FullName)
				byNIK["endpoint"] = lookupByNIK.Endpoint
				if lookupByNIKErr != nil {
					byNIK["status"] = "error"
					byNIK["error"] = lookupByNIKErr.Error()
					byNIK["reason"] = fmt.Sprintf("GET by NIK (%s) gagal", candidateNIK)
					continue
				}

				if lookupByNIK.Found && strings.TrimSpace(lookupByNIK.ResourceID) != "" {
					resolvedID = strings.TrimSpace(lookupByNIK.ResourceID)
					byNIK["status"] = "found"
					byNIK["found"] = true
					byNIK["resource_id"] = resolvedID
					byNIK["reason"] = fmt.Sprintf("Patient ditemukan dengan GET by NIK (%s)", candidateNIK)
					break
				}

				byNIK["status"] = "not_found"
				byNIK["reason"] = fmt.Sprintf("Patient tidak ditemukan dengan GET by NIK (%s)", candidateNIK)
			}
			byNIK["attempted_candidates"] = attemptedCandidates
		} else {
			if len(nikWarnings) > 0 {
				byNIK["reason"] = strings.Join(nikWarnings, " ")
			} else {
				byNIK["reason"] = "NIK pasien tidak valid (harus 16 digit)"
			}
		}
	}

	decision := "POST create Patient"
	if resolvedID != "" {
		decision = "Use existing Patient ID"
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Preview resolve Patient SATUSEHAT berhasil dibuat",
		"data": gin.H{
			"patient": gin.H{
				"id":                          patient.ID,
				"name":                        patient.FullName,
				"nik":                         patient.NIK,
				"stored_satusehat_patient_id": rawStoredID,
			},
			"resolve_steps": gin.H{
				"get_by_id":  byID,
				"get_by_ihs": byIHS,
				"get_by_nik": byNIK,
			},
			"decision":            decision,
			"resolved_patient_id": resolvedID,
		},
		"config": config.PublicStatus(),
	})
}

func PreviewSATUSEHATPractitioner(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	doctorID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID dokter tidak valid"})
		return
	}

	var doctor models.Doctor
	if err := database.DB.Preload("Employee").Preload("Polyclinics").First(&doctor, doctorID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dokter tidak ditemukan"})
		return
	}

	preview := satusehat.BuildPractitionerPreview(doctor, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func PreviewSATUSEHATEmployeePractitioner(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	employeeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID pegawai tidak valid"})
		return
	}

	var employee models.Employee
	if err := database.DB.Preload("User").First(&employee, employeeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pegawai tidak ditemukan"})
		return
	}

	preview := satusehat.BuildEmployeePractitionerPreview(employee, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func PreviewSATUSEHATEncounter(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	visitID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	var visit models.Visit
	if err := database.DB.Preload("Patient").Preload("Doctor").Preload("Doctor.Employee").Preload("Polyclinic").First(&visit, visitID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	preview := satusehat.BuildEncounterPreview(visit, config)
	c.JSON(http.StatusOK, gin.H{"data": preview, "config": config.PublicStatus()})
}

func SyncSATUSEHATPatient(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:    "sync",
			ResourceType: "Patient",
			Method:       http.MethodPost,
			Endpoint:     satusehatLogEndpoint(c),
			StatusCode:   http.StatusInternalServerError,
			Success:      false,
			ErrorMessage: "Gagal memuat konfigurasi SATUSEHAT",
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	patientID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID pasien tidak valid"})
		return
	}

	var patient models.Patient
	if err := database.DB.First(&patient, patientID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pasien tidak ditemukan"})
		return
	}

	rawStoredResourceID := strings.TrimSpace(patient.SatusehatPatientID)
	if rawStoredResourceID != "" {
		if err := persistResolvedSATUSEHATPatientID(patient.ID, rawStoredResourceID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "SATUSEHAT Patient ID lokal ditemukan, tetapi gagal memperbarui metadata sinkronisasi", "details": err.Error()})
			return
		}

		now := time.Now()
		patient.SatusehatPatientID = rawStoredResourceID
		patient.SatusehatSyncedAt = &now

		c.JSON(http.StatusOK, gin.H{
			"message": "SATUSEHAT Patient ID sudah ada di data lokal, sinkronisasi dilewati",
			"data": gin.H{
				"patient":    patient,
				"warnings":   []string{"SATUSEHAT Patient ID lokal digunakan tanpa lookup tambahan."},
				"resolvedBy": "local satusehat_patient_id",
				"sync": satusehat.ResourceOperationResult{
					Method:       http.MethodGet,
					StatusCode:   http.StatusOK,
					ResourceType: "Patient",
					ResourceID:   rawStoredResourceID,
				},
			},
		})
		return
	}

	resolvedPatientID, resolveWarnings := resolveExistingSATUSEHATPatientID(c.Request.Context(), config, patient)
	if resolvedPatientID != "" {
		if err := persistResolvedSATUSEHATPatientID(patient.ID, resolvedPatientID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Patient ditemukan di SATUSEHAT, tetapi gagal menyimpan ID lokal", "details": err.Error()})
			return
		}

		now := time.Now()
		patient.SatusehatPatientID = resolvedPatientID
		patient.SatusehatSyncedAt = &now

		c.JSON(http.StatusOK, gin.H{
			"message": "Pasien sudah terdaftar di SATUSEHAT (GET by NIK), menggunakan ID existing",
			"data": gin.H{
				"patient":    patient,
				"warnings":   resolveWarnings,
				"resolvedBy": "GET by NIK",
				"sync": satusehat.ResourceOperationResult{
					Method:       http.MethodGet,
					StatusCode:   http.StatusOK,
					ResourceType: "Patient",
					ResourceID:   resolvedPatientID,
				},
			},
		})
		return
	}

	preview := satusehat.BuildPatientPreview(patient, config)
	if !preview.Ready {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "sync",
			ResourceType:   "Patient",
			Mode:           config.ActiveMode,
			Method:         http.MethodPost,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusUnprocessableEntity,
			Success:        false,
			ErrorMessage:   "Payload Patient belum siap dikirim ke SATUSEHAT",
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":    "Payload Patient belum siap dikirim ke SATUSEHAT",
				"warnings": preview.Warnings,
			},
			ResourceID: patient.SatusehatPatientID,
		})
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Patient belum siap dikirim ke SATUSEHAT",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "Patient", preview.Resource, "")
	if err != nil {
		errMessage := strings.TrimSpace(err.Error())
		if isSATUSEHATDuplicateError(errMessage) {
			resolvedAfterDuplicate, duplicateResolveWarnings := resolveExistingSATUSEHATPatientID(c.Request.Context(), config, patient)
			if resolvedAfterDuplicate != "" {
				if saveErr := persistResolvedSATUSEHATPatientID(patient.ID, resolvedAfterDuplicate); saveErr != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Patient duplikat ditemukan, tetapi gagal menyimpan ID lokal", "details": saveErr.Error()})
					return
				}

				now := time.Now()
				patient.SatusehatPatientID = resolvedAfterDuplicate
				patient.SatusehatSyncedAt = &now

				c.JSON(http.StatusOK, gin.H{
					"message": "Patient duplikat terdeteksi, ID existing berhasil di-resolve via GET by ID/IHS/NIK",
					"data": gin.H{
						"patient":    patient,
						"warnings":   duplicateResolveWarnings,
						"resolvedBy": "GET by ID/IHS/NIK",
						"sync": satusehat.ResourceOperationResult{
							Method:       http.MethodGet,
							StatusCode:   http.StatusOK,
							ResourceType: "Patient",
							ResourceID:   resolvedAfterDuplicate,
						},
					},
				})
				return
			}

			fallbackStoredID := strings.TrimSpace(patient.SatusehatPatientID)
			if fallbackStoredID != "" {
				if saveErr := persistResolvedSATUSEHATPatientID(patient.ID, fallbackStoredID); saveErr != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Patient duplikat terdeteksi, fallback ID lokal tersedia tetapi gagal disimpan", "details": saveErr.Error()})
					return
				}

				now := time.Now()
				patient.SatusehatPatientID = fallbackStoredID
				patient.SatusehatSyncedAt = &now

				c.JSON(http.StatusOK, gin.H{
					"message": "Patient duplikat terdeteksi, menggunakan SATUSEHAT Patient ID lokal yang sudah ada",
					"data": gin.H{
						"patient": patient,
						"warnings": append(duplicateResolveWarnings,
							"Lookup by ID/IHS/NIK belum menemukan resource, namun server SATUSEHAT mendeteksi data duplikat; ID lokal dipakai sebagai fallback.",
						),
						"resolvedBy": "local fallback after duplicate",
						"sync": satusehat.ResourceOperationResult{
							Method:       http.MethodGet,
							StatusCode:   http.StatusOK,
							ResourceType: "Patient",
							ResourceID:   fallbackStoredID,
						},
					},
				})
				return
			}
		}

		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_patient_id"] = result.ResourceID
	}
	if err := database.DB.Model(&patient).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi pasien"})
		return
	}

	if result.ResourceID != "" {
		patient.SatusehatPatientID = result.ResourceID
	}
	patient.SatusehatSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Pasien berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"patient": patient,
			"sync":    result,
		},
	})
}

func SyncSATUSEHATPractitioner(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:    "lookup",
			ResourceType: "Practitioner",
			Method:       http.MethodGet,
			Endpoint:     satusehatLogEndpoint(c),
			StatusCode:   http.StatusInternalServerError,
			Success:      false,
			ErrorMessage: "Gagal memuat konfigurasi SATUSEHAT",
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	doctorID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID dokter tidak valid"})
		return
	}

	var doctor models.Doctor
	if err := database.DB.Preload("Employee").Preload("Polyclinics").First(&doctor, doctorID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dokter tidak ditemukan"})
		return
	}

	preview := satusehat.BuildPractitionerPreview(doctor, config)
	if !preview.Ready {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "lookup",
			ResourceType:   "Practitioner",
			Mode:           config.ActiveMode,
			Method:         http.MethodGet,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusUnprocessableEntity,
			Success:        false,
			ErrorMessage:   "Data dokter belum siap untuk pencarian Practitioner SATUSEHAT",
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":    "Data dokter belum siap untuk pencarian Practitioner SATUSEHAT. Isi NIK dokter 16 digit.",
				"warnings": preview.Warnings,
			},
			ResourceID: doctor.SatusehatPractitionerID,
		})
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Data dokter belum siap untuk pencarian Practitioner SATUSEHAT. Isi NIK dokter 16 digit.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	lookup, err := satusehat.LookupPractitionerByNIK(c.Request.Context(), config, doctor.NIKNumber)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": gin.H{"preview": preview}, "config": config.PublicStatus()})
		return
	}

	if !lookup.Found || strings.TrimSpace(lookup.ResourceID) == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error": "Practitioner SATUSEHAT tidak ditemukan dari NIK dokter. Pastikan NIK dokter valid dan terdaftar di Master Nakes Index.",
			"data": gin.H{
				"preview": preview,
				"lookup":  lookup,
			},
			"config": config.PublicStatus(),
		})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now, "satusehat_practitioner_id": lookup.ResourceID}
	if err := database.DB.Model(&doctor).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi dokter"})
		return
	}
	if doctor.EmployeeID != nil && *doctor.EmployeeID != 0 {
		_ = database.DB.Model(&models.Employee{}).Where("id = ?", *doctor.EmployeeID).Updates(updates).Error
	}

	doctor.SatusehatPractitionerID = lookup.ResourceID
	doctor.SatusehatSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Practitioner IHS number dokter berhasil ditemukan dan disimpan",
		"data": gin.H{
			"doctor": doctor,
			"lookup": lookup,
		},
	})
}

func SyncSATUSEHATEmployeePractitioner(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:    "lookup",
			ResourceType: "Practitioner",
			Method:       http.MethodGet,
			Endpoint:     satusehatLogEndpoint(c),
			StatusCode:   http.StatusInternalServerError,
			Success:      false,
			ErrorMessage: "Gagal memuat konfigurasi SATUSEHAT",
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	employeeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID pegawai tidak valid"})
		return
	}

	var employee models.Employee
	if err := database.DB.Preload("User").First(&employee, employeeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pegawai tidak ditemukan"})
		return
	}

	preview := satusehat.BuildEmployeePractitionerPreview(employee, config)
	if !preview.Ready {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "lookup",
			ResourceType:   "Practitioner",
			Mode:           config.ActiveMode,
			Method:         http.MethodGet,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusUnprocessableEntity,
			Success:        false,
			ErrorMessage:   "Data pegawai belum siap untuk pencarian Practitioner SATUSEHAT",
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":    "Data pegawai belum siap untuk pencarian Practitioner SATUSEHAT. Isi NIK pegawai 16 digit.",
				"warnings": preview.Warnings,
			},
			ResourceID: employee.SatusehatPractitionerID,
		})
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Data pegawai belum siap untuk pencarian Practitioner SATUSEHAT. Isi NIK pegawai 16 digit.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	lookup, err := satusehat.LookupPractitionerByNIK(c.Request.Context(), config, employee.NIKNumber)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": gin.H{"preview": preview}, "config": config.PublicStatus()})
		return
	}

	if !lookup.Found || strings.TrimSpace(lookup.ResourceID) == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error": "Practitioner SATUSEHAT tidak ditemukan dari NIK pegawai. Pastikan NIK pegawai valid dan terdaftar di Master Nakes Index.",
			"data": gin.H{
				"preview": preview,
				"lookup":  lookup,
			},
			"config": config.PublicStatus(),
		})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now, "satusehat_practitioner_id": lookup.ResourceID}
	if err := database.DB.Model(&employee).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi pegawai"})
		return
	}
	_ = database.DB.Model(&models.Doctor{}).Where("employee_id = ?", employee.ID).Updates(updates).Error

	employee.SatusehatPractitionerID = lookup.ResourceID
	employee.SatusehatSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Practitioner IHS number pegawai berhasil ditemukan dan disimpan",
		"data": gin.H{
			"employee": employee,
			"lookup":   lookup,
		},
	})
}

func SyncSATUSEHATEncounter(c *gin.Context) {
	config, err := satusehat.LoadConfig()
	if err != nil {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:    "sync",
			ResourceType: "Encounter",
			Method:       http.MethodPost,
			Endpoint:     satusehatLogEndpoint(c),
			StatusCode:   http.StatusInternalServerError,
			Success:      false,
			ErrorMessage: "Gagal memuat konfigurasi SATUSEHAT",
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
		return
	}

	visitID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	var visit models.Visit
	if err := database.DB.Preload("Patient").Preload("Doctor").Preload("Doctor.Employee").Preload("Polyclinic").First(&visit, visitID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	preview := satusehat.BuildEncounterPreview(visit, config)
	if !preview.Ready {
		recordSATUSEHATPreflightFailure(c, satusehat.ActivityLogEntry{
			Operation:      "sync",
			ResourceType:   "Encounter",
			Mode:           config.ActiveMode,
			Method:         http.MethodPost,
			Endpoint:       satusehatLogEndpoint(c),
			StatusCode:     http.StatusUnprocessableEntity,
			Success:        false,
			ErrorMessage:   "Payload Encounter belum siap dikirim ke SATUSEHAT",
			RequestPayload: preview.Resource,
			ResponseBody: map[string]any{
				"error":    "Payload Encounter belum siap dikirim ke SATUSEHAT. Pastikan Patient, Practitioner, Organization, dan Location sudah siap.",
				"warnings": preview.Warnings,
			},
			ResourceID: visit.SatusehatEncounterID,
		})
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  "Payload Encounter belum siap dikirim ke SATUSEHAT. Pastikan Patient, Practitioner, Organization, dan Location sudah siap.",
			"data":   preview,
			"config": config.PublicStatus(),
		})
		return
	}

	result, err := satusehat.UpsertResource(c.Request.Context(), config, "Encounter", preview.Resource, visit.SatusehatEncounterID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "data": preview, "config": config.PublicStatus()})
		return
	}

	now := time.Now()
	updates := map[string]any{"satusehat_synced_at": now}
	if result.ResourceID != "" {
		updates["satusehat_encounter_id"] = result.ResourceID
	}
	if err := database.DB.Model(&visit).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan hasil sinkronisasi kunjungan"})
		return
	}

	if result.ResourceID != "" {
		visit.SatusehatEncounterID = result.ResourceID
	}
	visit.SatusehatSyncedAt = &now

	c.JSON(http.StatusOK, gin.H{
		"message": "Encounter berhasil disinkronkan ke SATUSEHAT",
		"data": gin.H{
			"visit": visit,
			"sync":  result,
		},
	})
}
