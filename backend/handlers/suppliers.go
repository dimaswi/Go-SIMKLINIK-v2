package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func GetSuppliers(c *gin.Context) {
	var suppliers []models.Supplier
	query := database.DB.Order("name ASC")

	if search := c.Query("q"); search != "" {
		query = query.Where("name ILIKE ? OR contact_person ILIKE ? OR phone ILIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	if isActive := c.Query("is_active"); isActive != "" {
		query = query.Where("is_active = ?", isActive == "true")
	}

	if err := query.Find(&suppliers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": suppliers})
}

func GetSupplier(c *gin.Context) {
	id := c.Param("id")

	var supplier models.Supplier
	if err := database.DB.First(&supplier, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Supplier tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": supplier})
}

type CreateSupplierRequest struct {
	Name          string `json:"name" binding:"required"`
	ContactPerson string `json:"contact_person"`
	Phone         string `json:"phone"`
	Email         string `json:"email"`
	Address       string `json:"address"`
	IsActive      *bool  `json:"is_active"`
}

func CreateSupplier(c *gin.Context) {
	var req CreateSupplierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	supplier := models.Supplier{
		Name:          req.Name,
		ContactPerson: req.ContactPerson,
		Phone:         req.Phone,
		Email:         req.Email,
		Address:       req.Address,
		IsActive:      isActive,
	}

	if err := database.DB.Create(&supplier).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": supplier})
}

func UpdateSupplier(c *gin.Context) {
	id := c.Param("id")

	var supplier models.Supplier
	if err := database.DB.First(&supplier, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Supplier tidak ditemukan"})
		return
	}

	var req CreateSupplierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	supplier.Name = req.Name
	supplier.ContactPerson = req.ContactPerson
	supplier.Phone = req.Phone
	supplier.Email = req.Email
	supplier.Address = req.Address
	if req.IsActive != nil {
		supplier.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&supplier).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": supplier})
}

func DeleteSupplier(c *gin.Context) {
	id := c.Param("id")

	var supplier models.Supplier
	if err := database.DB.First(&supplier, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Supplier tidak ditemukan"})
		return
	}

	if err := database.DB.Delete(&supplier).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Supplier berhasil dihapus"})
}
