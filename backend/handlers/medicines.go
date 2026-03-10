package handlers

import (
	"fmt"
	"net/http"
	"starter/backend/database"
	"starter/backend/models"
	"strconv"

	"github.com/gin-gonic/gin"
)

func GetMedicines(c *gin.Context) {
	var medicines []models.Medicine
	query := database.DB.Model(&models.Medicine{})

	if search := c.Query("q"); search != "" {
		query = query.Where("name ILIKE ? OR code ILIKE ? OR generic_name ILIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	if categoryID := c.Query("category_id"); categoryID != "" {
		query = query.Where("category_id = ?", categoryID)
	}

	if medType := c.Query("type"); medType != "" {
		query = query.Where("type = ?", medType)
	}

	if isActive := c.Query("is_active"); isActive != "" {
		query = query.Where("is_active = ?", isActive == "true")
	}

	// Count total before pagination
	var total int64
	query.Count(&total)

	// Pagination
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	offset := (page - 1) * perPage
	if err := query.Preload("Category").Preload("Unit").Order("name ASC").Offset(offset).Limit(perPage).Find(&medicines).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     medicines,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func GetMedicine(c *gin.Context) {
	id := c.Param("id")

	var medicine models.Medicine
	if err := database.DB.Preload("Category").Preload("Unit").First(&medicine, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Obat tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": medicine})
}

type CreateMedicineRequest struct {
	Name          string  `json:"name" binding:"required"`
	GenericName   string  `json:"generic_name"`
	CategoryID    uint    `json:"category_id" binding:"required"`
	UnitID        uint    `json:"unit_id" binding:"required"`
	Type          string  `json:"type"`
	Form          string  `json:"form"`
	Strength      string  `json:"strength"`
	Manufacturer  string  `json:"manufacturer"`
	MinStock      int     `json:"min_stock"`
	CurrentStock  int     `json:"current_stock"`
	PurchasePrice float64 `json:"purchase_price"`
	SellingPrice  float64 `json:"selling_price"`
	IsActive      *bool   `json:"is_active"`
}

func generateMedicineCode() string {
	var count int64
	database.DB.Model(&models.Medicine{}).Unscoped().Count(&count)
	return fmt.Sprintf("OBT-%04d", count+1)
}

func CreateMedicine(c *gin.Context) {
	var req CreateMedicineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	medicine := models.Medicine{
		Code:          generateMedicineCode(),
		Name:          req.Name,
		GenericName:   req.GenericName,
		CategoryID:    req.CategoryID,
		UnitID:        req.UnitID,
		Type:          req.Type,
		Form:          req.Form,
		Strength:      req.Strength,
		Manufacturer:  req.Manufacturer,
		MinStock:      req.MinStock,
		CurrentStock:  req.CurrentStock,
		PurchasePrice: req.PurchasePrice,
		SellingPrice:  req.SellingPrice,
		IsActive:      isActive,
	}

	if err := database.DB.Create(&medicine).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Category").Preload("Unit").First(&medicine, medicine.ID)
	c.JSON(http.StatusCreated, gin.H{"data": medicine})
}

func UpdateMedicine(c *gin.Context) {
	id := c.Param("id")

	var medicine models.Medicine
	if err := database.DB.First(&medicine, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Obat tidak ditemukan"})
		return
	}

	var req CreateMedicineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	medicine.Name = req.Name
	medicine.GenericName = req.GenericName
	medicine.CategoryID = req.CategoryID
	medicine.UnitID = req.UnitID
	medicine.Type = req.Type
	medicine.Form = req.Form
	medicine.Strength = req.Strength
	medicine.Manufacturer = req.Manufacturer
	medicine.MinStock = req.MinStock
	medicine.PurchasePrice = req.PurchasePrice
	medicine.SellingPrice = req.SellingPrice
	if req.IsActive != nil {
		medicine.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&medicine).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Category").Preload("Unit").First(&medicine, medicine.ID)
	c.JSON(http.StatusOK, gin.H{"data": medicine})
}

func DeleteMedicine(c *gin.Context) {
	id := c.Param("id")

	var medicine models.Medicine
	if err := database.DB.First(&medicine, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Obat tidak ditemukan"})
		return
	}

	if err := database.DB.Delete(&medicine).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Obat berhasil dihapus"})
}
