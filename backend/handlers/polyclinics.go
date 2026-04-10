package handlers

import (
	"fmt"
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func GetPolyclinics(c *gin.Context) {
	var polyclinics []models.Polyclinic
	query := database.DB.Order("sort_order ASC, name ASC")

	if search := c.Query("q"); search != "" {
		query = query.Where("name ILIKE ? OR code ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	if err := query.Find(&polyclinics).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": polyclinics})
}

func GetPolyclinic(c *gin.Context) {
	id := c.Param("id")

	var polyclinic models.Polyclinic
	if err := database.DB.First(&polyclinic, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poliklinik tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": polyclinic})
}

type CreatePolyclinicRequest struct {
	Name        string  `json:"name" binding:"required"`
	Description string  `json:"description"`
	AdminFee    float64 `json:"admin_fee"`
	IsActive    *bool   `json:"is_active"`
	Color       string  `json:"color"`
	Icon        string  `json:"icon"`
	SortOrder   int     `json:"sort_order"`
}

func generatePolyclinicCode() string {
	var count int64
	database.DB.Model(&models.Polyclinic{}).Unscoped().Count(&count)
	return fmt.Sprintf("POL-%04d", count+1)
}

func CreatePolyclinic(c *gin.Context) {
	var req CreatePolyclinicRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AdminFee < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Biaya administrasi tidak boleh negatif"})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	polyclinic := models.Polyclinic{
		Name:        req.Name,
		Code:        generatePolyclinicCode(),
		Description: req.Description,
		AdminFee:    req.AdminFee,
		IsActive:    isActive,
		Color:       req.Color,
		Icon:        req.Icon,
		SortOrder:   req.SortOrder,
	}

	if err := database.DB.Create(&polyclinic).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": polyclinic})
}

func UpdatePolyclinic(c *gin.Context) {
	id := c.Param("id")

	var polyclinic models.Polyclinic
	if err := database.DB.First(&polyclinic, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poliklinik tidak ditemukan"})
		return
	}

	var req CreatePolyclinicRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AdminFee < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Biaya administrasi tidak boleh negatif"})
		return
	}

	polyclinic.Name = req.Name
	polyclinic.Description = req.Description
	polyclinic.AdminFee = req.AdminFee
	polyclinic.Color = req.Color
	polyclinic.Icon = req.Icon
	polyclinic.SortOrder = req.SortOrder
	if req.IsActive != nil {
		polyclinic.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&polyclinic).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": polyclinic})
}

func DeletePolyclinic(c *gin.Context) {
	id := c.Param("id")

	var polyclinic models.Polyclinic
	if err := database.DB.First(&polyclinic, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poliklinik tidak ditemukan"})
		return
	}

	if err := database.DB.Delete(&polyclinic).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Poliklinik berhasil dihapus"})
}
