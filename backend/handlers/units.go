package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func GetUnits(c *gin.Context) {
	var units []models.Unit

	if err := database.DB.Order("name ASC").Find(&units).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": units})
}

func GetUnit(c *gin.Context) {
	id := c.Param("id")

	var unit models.Unit
	if err := database.DB.First(&unit, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Satuan tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": unit})
}

type CreateUnitRequest struct {
	Name string `json:"name" binding:"required"`
}

func CreateUnit(c *gin.Context) {
	var req CreateUnitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	unit := models.Unit{Name: req.Name}

	if err := database.DB.Create(&unit).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": unit})
}

func UpdateUnit(c *gin.Context) {
	id := c.Param("id")

	var unit models.Unit
	if err := database.DB.First(&unit, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Satuan tidak ditemukan"})
		return
	}

	var req CreateUnitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	unit.Name = req.Name

	if err := database.DB.Save(&unit).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": unit})
}

func DeleteUnit(c *gin.Context) {
	id := c.Param("id")

	var unit models.Unit
	if err := database.DB.First(&unit, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Satuan tidak ditemukan"})
		return
	}

	// Check if any medicine uses this unit
	var count int64
	database.DB.Model(&models.Medicine{}).Where("unit_id = ?", id).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Satuan masih digunakan oleh obat"})
		return
	}

	if err := database.DB.Delete(&unit).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Satuan berhasil dihapus"})
}
