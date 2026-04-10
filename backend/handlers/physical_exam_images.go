package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

var allowedPhysicalExamImageExts = map[string]bool{
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".webp": true,
	".svg":  true,
}

func savePhysicalExamImageFile(c *gin.Context, fileField string) (string, error) {
	file, err := c.FormFile(fileField)
	if err != nil {
		return "", err
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedPhysicalExamImageExts[ext] {
		return "", fmt.Errorf("invalid file type. Allowed: png, jpg, jpeg, webp, svg")
	}

	uploadDir := "./uploads/physical-exam-images"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return "", err
	}

	filename := fmt.Sprintf("physical_exam_%d%s", time.Now().UnixNano(), ext)
	filePath := filepath.Join(uploadDir, filename)
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		return "", err
	}

	return "/uploads/physical-exam-images/" + filename, nil
}

func removeUploadedPhysicalExamImage(fileURL string) {
	trimmed := strings.TrimSpace(fileURL)
	if trimmed == "" || !strings.HasPrefix(trimmed, "/uploads/") {
		return
	}

	_ = os.Remove("." + trimmed)
}

func parsePhysicalExamImageActive(value string, fallback bool) bool {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	if trimmed == "" {
		return fallback
	}

	return trimmed == "true" || trimmed == "1" || trimmed == "yes"
}

func GetPhysicalExamImageMasters(c *gin.Context) {
	var items []models.PhysicalExamImageMaster
	query := database.DB.Order("category ASC").Order("location ASC").Order("sort_order ASC").Order("name ASC")

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		like := "%" + q + "%"
		query = query.Where("name ILIKE ? OR category ILIKE ? OR location ILIKE ?", like, like, like)
	}

	if category := strings.TrimSpace(c.Query("category")); category != "" {
		query = query.Where("category = ?", category)
	}

	if isActive := strings.TrimSpace(c.Query("is_active")); isActive != "" {
		query = query.Where("is_active = ?", parsePhysicalExamImageActive(isActive, true))
	}

	if err := query.Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": items})
}

func GetPhysicalExamImageMaster(c *gin.Context) {
	id := c.Param("id")

	var item models.PhysicalExamImageMaster
	if err := database.DB.First(&item, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template gambar pemeriksaan fisik tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": item})
}

func CreatePhysicalExamImageMaster(c *gin.Context) {
	imageURL, err := savePhysicalExamImageFile(c, "file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sortOrder, _ := strconv.Atoi(strings.TrimSpace(c.PostForm("sort_order")))
	item := models.PhysicalExamImageMaster{
		Name:        strings.TrimSpace(c.PostForm("name")),
		Category:    strings.TrimSpace(c.PostForm("category")),
		Location:    strings.TrimSpace(c.PostForm("location")),
		Description: strings.TrimSpace(c.PostForm("description")),
		ImageURL:    imageURL,
		IsActive:    parsePhysicalExamImageActive(c.PostForm("is_active"), true),
		SortOrder:   sortOrder,
	}

	if item.Name == "" || item.Category == "" {
		removeUploadedPhysicalExamImage(imageURL)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama dan kategori wajib diisi"})
		return
	}

	if err := database.DB.Create(&item).Error; err != nil {
		removeUploadedPhysicalExamImage(imageURL)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": item})
}

func UpdatePhysicalExamImageMaster(c *gin.Context) {
	id := c.Param("id")

	var item models.PhysicalExamImageMaster
	if err := database.DB.First(&item, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template gambar pemeriksaan fisik tidak ditemukan"})
		return
	}

	newImageURL := ""
	if _, err := c.FormFile("file"); err == nil {
		newImageURL, err = savePhysicalExamImageFile(c, "file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	sortOrder, _ := strconv.Atoi(strings.TrimSpace(c.PostForm("sort_order")))
	name := strings.TrimSpace(c.PostForm("name"))
	category := strings.TrimSpace(c.PostForm("category"))
	if name == "" || category == "" {
		removeUploadedPhysicalExamImage(newImageURL)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama dan kategori wajib diisi"})
		return
	}

	oldImageURL := item.ImageURL
	item.Name = name
	item.Category = category
	item.Location = strings.TrimSpace(c.PostForm("location"))
	item.Description = strings.TrimSpace(c.PostForm("description"))
	item.IsActive = parsePhysicalExamImageActive(c.PostForm("is_active"), item.IsActive)
	item.SortOrder = sortOrder
	if newImageURL != "" {
		item.ImageURL = newImageURL
	}

	if err := database.DB.Save(&item).Error; err != nil {
		removeUploadedPhysicalExamImage(newImageURL)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if newImageURL != "" && oldImageURL != newImageURL {
		removeUploadedPhysicalExamImage(oldImageURL)
	}

	c.JSON(http.StatusOK, gin.H{"data": item})
}

func DeletePhysicalExamImageMaster(c *gin.Context) {
	id := c.Param("id")

	var item models.PhysicalExamImageMaster
	if err := database.DB.First(&item, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template gambar pemeriksaan fisik tidak ditemukan"})
		return
	}

	var usageCount int64
	if err := database.DB.Model(&models.MedicalRecordImagePick{}).
		Where("physical_exam_image_master_id = ?", item.ID).
		Count(&usageCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if usageCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Template masih dipakai di rekam medis dan tidak dapat dihapus"})
		return
	}

	if err := database.DB.Delete(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	removeUploadedPhysicalExamImage(item.ImageURL)

	c.JSON(http.StatusOK, gin.H{"message": "Template gambar pemeriksaan fisik berhasil dihapus"})
}
