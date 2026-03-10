package handlers

import (
	"fmt"
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func GetMedicalServices(c *gin.Context) {
	var services []models.MedicalService
	query := database.DB.Preload("Category").Preload("Polyclinic").Order("name ASC")

	if search := c.Query("q"); search != "" {
		query = query.Where("name ILIKE ? OR code ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	if categoryID := c.Query("category_id"); categoryID != "" {
		query = query.Where("category_id = ?", categoryID)
	}

	if polyclinicID := c.Query("polyclinic_id"); polyclinicID != "" {
		query = query.Where("polyclinic_id = ?", polyclinicID)
	}

	if isActive := c.Query("is_active"); isActive != "" {
		query = query.Where("is_active = ?", isActive == "true")
	}

	if err := query.Find(&services).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": services})
}

func GetMedicalService(c *gin.Context) {
	id := c.Param("id")

	var service models.MedicalService
	if err := database.DB.Preload("Category").Preload("Polyclinic").First(&service, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Layanan medis tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": service})
}

type CreateMedicalServiceRequest struct {
	Name         string  `json:"name" binding:"required"`
	CategoryID   uint    `json:"category_id" binding:"required"`
	PolyclinicID *uint   `json:"polyclinic_id"`
	Price        float64 `json:"price"`
	IsActive     *bool   `json:"is_active"`
	Description  string  `json:"description"`
}

func generateMedicalServiceCode() string {
	var count int64
	database.DB.Model(&models.MedicalService{}).Unscoped().Count(&count)
	return fmt.Sprintf("SRV-%04d", count+1)
}

func CreateMedicalService(c *gin.Context) {
	var req CreateMedicalServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	service := models.MedicalService{
		Code:         generateMedicalServiceCode(),
		Name:         req.Name,
		CategoryID:   req.CategoryID,
		PolyclinicID: req.PolyclinicID,
		Price:        req.Price,
		IsActive:     isActive,
		Description:  req.Description,
	}

	if err := database.DB.Create(&service).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Category").Preload("Polyclinic").First(&service, service.ID)
	c.JSON(http.StatusCreated, gin.H{"data": service})
}

func UpdateMedicalService(c *gin.Context) {
	id := c.Param("id")

	var service models.MedicalService
	if err := database.DB.First(&service, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Layanan medis tidak ditemukan"})
		return
	}

	var req CreateMedicalServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	service.Name = req.Name
	service.CategoryID = req.CategoryID
	service.PolyclinicID = req.PolyclinicID
	service.Price = req.Price
	service.Description = req.Description
	if req.IsActive != nil {
		service.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&service).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Category").Preload("Polyclinic").First(&service, service.ID)
	c.JSON(http.StatusOK, gin.H{"data": service})
}

func DeleteMedicalService(c *gin.Context) {
	id := c.Param("id")

	var service models.MedicalService
	if err := database.DB.First(&service, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Layanan medis tidak ditemukan"})
		return
	}

	if err := database.DB.Delete(&service).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Layanan medis berhasil dihapus"})
}
