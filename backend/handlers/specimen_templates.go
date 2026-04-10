package handlers

import (
	"net/http"
	"strings"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

type CreateSpecimenTemplateRequest struct {
	Code                    string `json:"code" binding:"required"`
	Name                    string `json:"name" binding:"required"`
	Description             string `json:"description"`
	TypeSystem              string `json:"type_system"`
	TypeCode                string `json:"type_code" binding:"required"`
	TypeDisplay             string `json:"type_display" binding:"required"`
	CollectionMethodSystem  string `json:"collection_method_system"`
	CollectionMethodCode    string `json:"collection_method_code"`
	CollectionMethodDisplay string `json:"collection_method_display"`
	IsActive                *bool  `json:"is_active"`
}

func normalizeSpecimenCodingSystem(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "http://snomed.info/sct"
	}
	return trimmed
}

func GetSpecimenTemplates(c *gin.Context) {
	var templates []models.SpecimenTemplate
	query := database.DB.Order("name ASC")

	if search := strings.TrimSpace(c.Query("q")); search != "" {
		like := "%" + search + "%"
		query = query.Where("name ILIKE ? OR code ILIKE ?", like, like)
	}

	if isActive := strings.TrimSpace(c.Query("is_active")); isActive != "" {
		query = query.Where("is_active = ?", isActive == "true" || isActive == "1")
	}

	if err := query.Find(&templates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": templates})
}

func GetSpecimenTemplate(c *gin.Context) {
	id := c.Param("id")

	var template models.SpecimenTemplate
	if err := database.DB.First(&template, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template specimen tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": template})
}

func CreateSpecimenTemplate(c *gin.Context) {
	var req CreateSpecimenTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	template := models.SpecimenTemplate{
		Code:                    strings.TrimSpace(req.Code),
		Name:                    strings.TrimSpace(req.Name),
		Description:             strings.TrimSpace(req.Description),
		TypeSystem:              normalizeSpecimenCodingSystem(req.TypeSystem),
		TypeCode:                strings.TrimSpace(req.TypeCode),
		TypeDisplay:             strings.TrimSpace(req.TypeDisplay),
		CollectionMethodSystem:  strings.TrimSpace(req.CollectionMethodSystem),
		CollectionMethodCode:    strings.TrimSpace(req.CollectionMethodCode),
		CollectionMethodDisplay: strings.TrimSpace(req.CollectionMethodDisplay),
		IsActive:                isActive,
	}
	if template.CollectionMethodCode != "" || template.CollectionMethodDisplay != "" {
		template.CollectionMethodSystem = normalizeSpecimenCodingSystem(req.CollectionMethodSystem)
	}

	if err := database.DB.Create(&template).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": template})
}

func UpdateSpecimenTemplate(c *gin.Context) {
	id := c.Param("id")

	var template models.SpecimenTemplate
	if err := database.DB.First(&template, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template specimen tidak ditemukan"})
		return
	}

	var req CreateSpecimenTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	template.Code = strings.TrimSpace(req.Code)
	template.Name = strings.TrimSpace(req.Name)
	template.Description = strings.TrimSpace(req.Description)
	template.TypeSystem = normalizeSpecimenCodingSystem(req.TypeSystem)
	template.TypeCode = strings.TrimSpace(req.TypeCode)
	template.TypeDisplay = strings.TrimSpace(req.TypeDisplay)
	template.CollectionMethodSystem = strings.TrimSpace(req.CollectionMethodSystem)
	template.CollectionMethodCode = strings.TrimSpace(req.CollectionMethodCode)
	template.CollectionMethodDisplay = strings.TrimSpace(req.CollectionMethodDisplay)
	if template.CollectionMethodCode != "" || template.CollectionMethodDisplay != "" {
		template.CollectionMethodSystem = normalizeSpecimenCodingSystem(req.CollectionMethodSystem)
	}
	if req.IsActive != nil {
		template.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&template).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": template})
}

func DeleteSpecimenTemplate(c *gin.Context) {
	id := c.Param("id")

	var template models.SpecimenTemplate
	if err := database.DB.First(&template, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template specimen tidak ditemukan"})
		return
	}

	var serviceUsageCount int64
	database.DB.Model(&models.MedicalServiceSpecimen{}).Where("specimen_template_id = ?", id).Count(&serviceUsageCount)
	if serviceUsageCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Template specimen masih dipakai pada layanan medis"})
		return
	}

	var orderUsageCount int64
	database.DB.Model(&models.LaboratoryOrderSpecimen{}).Where("specimen_template_id = ?", id).Count(&orderUsageCount)
	if orderUsageCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Template specimen sudah dipakai pada transaksi laboratorium"})
		return
	}

	if err := database.DB.Delete(&template).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Template specimen berhasil dihapus"})
}
