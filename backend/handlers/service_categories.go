package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func GetServiceCategories(c *gin.Context) {
	var categories []models.ServiceCategory

	if err := database.DB.Order("name ASC").Find(&categories).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": categories})
}

func GetServiceCategory(c *gin.Context) {
	id := c.Param("id")

	var category models.ServiceCategory
	if err := database.DB.First(&category, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kategori layanan tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": category})
}

type CreateServiceCategoryRequest struct {
	Name string `json:"name" binding:"required"`
}

func CreateServiceCategory(c *gin.Context) {
	var req CreateServiceCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	category := models.ServiceCategory{Name: req.Name}

	if err := database.DB.Create(&category).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": category})
}

func UpdateServiceCategory(c *gin.Context) {
	id := c.Param("id")

	var category models.ServiceCategory
	if err := database.DB.First(&category, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kategori layanan tidak ditemukan"})
		return
	}

	var req CreateServiceCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	category.Name = req.Name

	if err := database.DB.Save(&category).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": category})
}

func DeleteServiceCategory(c *gin.Context) {
	id := c.Param("id")

	var category models.ServiceCategory
	if err := database.DB.First(&category, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kategori layanan tidak ditemukan"})
		return
	}

	// Check if any service uses this category
	var count int64
	database.DB.Model(&models.MedicalService{}).Where("category_id = ?", id).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kategori masih digunakan oleh layanan medis"})
		return
	}

	if err := database.DB.Delete(&category).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Kategori layanan berhasil dihapus"})
}
