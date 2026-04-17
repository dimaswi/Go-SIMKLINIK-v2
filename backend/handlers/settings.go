package handlers

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"starter/backend/database"
	"starter/backend/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GetSettings returns all settings as key-value pairs
func GetSettings(c *gin.Context) {
	var settings []models.Setting
	if err := database.DB.Find(&settings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch settings"})
		return
	}

	// Convert to map for easier frontend consumption
	settingsMap := make(map[string]string)
	for _, setting := range settings {
		settingsMap[setting.Key] = setting.Value
	}

	c.JSON(http.StatusOK, gin.H{"data": settingsMap})
}

// UpdateSettings updates multiple settings at once
func UpdateSettings(c *gin.Context) {
	var input map[string]string
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update or create each setting
	for key, value := range input {
		var setting models.Setting
		result := database.DB.Where("key = ?", key).First(&setting)

		if result.Error != nil {
			// Create new setting
			setting = models.Setting{
				Key:   key,
				Value: value,
			}
			if err := database.DB.Create(&setting).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create setting"})
				return
			}
		} else {
			// Update existing setting
			setting.Value = value
			if err := database.DB.Save(&setting).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update setting"})
				return
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Settings updated successfully"})
}

// UploadLogo handles logo/icon upload
func UploadLogo(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		errText := strings.ToLower(strings.TrimSpace(err.Error()))
		switch {
		case strings.Contains(errText, "request body too large"):
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Uploaded file is too large"})
		case strings.Contains(errText, "multipart"):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid multipart upload payload"})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		}
		return
	}

	// Get upload type (logo, favicon, or print logo)
	uploadType := c.PostForm("type")
	if uploadType != "logo" && uploadType != "favicon" && uploadType != "print_logo" {
		uploadType = "logo"
	}

	// Validate file type
	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowedExts := map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".ico": true, ".svg": true}
	if !allowedExts[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type. Allowed: png, jpg, jpeg, ico, svg"})
		return
	}

	// Create uploads directory if not exists
	uploadDir := "./uploads"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	// Generate unique filename
	filename := fmt.Sprintf("%s_%d%s", uploadType, time.Now().UnixNano(), ext)
	filePath := filepath.Join(uploadDir, filename)

	// Save file
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Save to settings
	settingKey := "app_" + uploadType
	fileURL := "/uploads/" + filename
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var setting models.Setting
	result := database.DB.WithContext(ctx).Where("key = ?", settingKey).First(&setting)

	if result.Error != nil {
		setting = models.Setting{
			Key:   settingKey,
			Value: fileURL,
		}
		if err := database.DB.WithContext(ctx).Create(&setting).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save uploaded file setting"})
			return
		}
	} else {
		// Delete old file if exists
		if setting.Value != "" {
			oldPath := "." + setting.Value
			os.Remove(oldPath)
		}
		setting.Value = fileURL
		if err := database.DB.WithContext(ctx).Save(&setting).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update uploaded file setting"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "File uploaded successfully",
		"url":     fileURL,
	})
}
