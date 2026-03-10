package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func GetPaymentMethods(c *gin.Context) {
	var methods []models.PaymentMethod

	if err := database.DB.Order("name ASC").Find(&methods).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": methods})
}

func GetPaymentMethod(c *gin.Context) {
	id := c.Param("id")

	var method models.PaymentMethod
	if err := database.DB.First(&method, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Metode pembayaran tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": method})
}

type CreatePaymentMethodRequest struct {
	Name     string `json:"name" binding:"required"`
	IsActive *bool  `json:"is_active"`
}

func CreatePaymentMethod(c *gin.Context) {
	var req CreatePaymentMethodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	method := models.PaymentMethod{
		Name:     req.Name,
		IsActive: isActive,
	}

	if err := database.DB.Create(&method).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": method})
}

func UpdatePaymentMethod(c *gin.Context) {
	id := c.Param("id")

	var method models.PaymentMethod
	if err := database.DB.First(&method, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Metode pembayaran tidak ditemukan"})
		return
	}

	var req CreatePaymentMethodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	method.Name = req.Name
	if req.IsActive != nil {
		method.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&method).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": method})
}

func DeletePaymentMethod(c *gin.Context) {
	id := c.Param("id")

	var method models.PaymentMethod
	if err := database.DB.First(&method, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Metode pembayaran tidak ditemukan"})
		return
	}

	if err := database.DB.Delete(&method).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Metode pembayaran berhasil dihapus"})
}
