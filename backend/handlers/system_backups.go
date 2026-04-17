package handlers

import (
	"errors"
	"net/http"
	"starter/backend/services"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetSystemBackupOverview(c *gin.Context) {
	overview, err := services.GetSystemBackupOverview()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": overview})
}

func ListSystemBackupFiles(c *gin.Context) {
	page, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("page", "1")))
	perPage, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("per_page", "20")))

	files, total, err := services.ListSystemBackupFiles(page, perPage)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 {
		perPage = 20
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     files,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func RunSystemBackup(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	var userID *uint
	if exists {
		if resolvedUserID, ok := userIDValue.(uint); ok {
			userID = &resolvedUserID
		}
	}

	summary, err := services.RunSystemBackupNow("manual", userID)
	if err != nil {
		statusCode := http.StatusInternalServerError
		if services.IsSystemBackupRunningError(err) {
			statusCode = http.StatusConflict
		}
		c.JSON(statusCode, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": summary, "message": summary.Message})
}

func UpdateSystemBackupSettings(c *gin.Context) {
	var input map[string]string
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	allowedKeys := map[string]struct{}{
		"system_backup_auto_enabled":    {},
		"system_backup_cron":            {},
		"system_backup_retention_days":  {},
		"system_backup_include_uploads": {},
	}

	payload := make(map[string]string)
	for key, value := range input {
		if _, ok := allowedKeys[key]; ok {
			payload[key] = value
		}
	}

	settings, err := services.UpdateSystemBackupSettings(payload)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": settings, "message": "Pengaturan auto backup berhasil diperbarui"})
}

func DownloadSystemBackupFile(c *gin.Context) {
	fileID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID file tidak valid"})
		return
	}

	backupFile, absPath, err := services.ResolveSystemBackupFilePath(uint(fileID))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "File backup tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.FileAttachment(absPath, backupFile.FileName)
}
