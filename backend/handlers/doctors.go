package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func GetDoctors(c *gin.Context) {
	var doctors []models.Doctor
	query := database.DB.Preload("User").Preload("Polyclinics").Preload("Schedules").Preload("Schedules.Polyclinic")

	if search := c.Query("q"); search != "" {
		query = query.Where("full_name ILIKE ? OR sip_number ILIKE ? OR specialization ILIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	if polyclinicID := c.Query("polyclinic_id"); polyclinicID != "" {
		query = query.Joins("JOIN doctor_polyclinics ON doctor_polyclinics.doctor_id = doctors.id").
			Where("doctor_polyclinics.polyclinic_id = ?", polyclinicID)
	}

	if err := query.Find(&doctors).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": doctors})
}

func GetDoctor(c *gin.Context) {
	id := c.Param("id")

	var doctor models.Doctor
	if err := database.DB.Preload("User").Preload("Polyclinics").Preload("Schedules").Preload("Schedules.Polyclinic").First(&doctor, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dokter tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": doctor})
}

type CreateDoctorRequest struct {
	UserID         *uint  `json:"user_id"`
	FullName       string `json:"full_name" binding:"required"`
	SIPNumber      string `json:"sip_number"`
	Specialization string `json:"specialization"`
	Phone          string `json:"phone"`
	Photo          string `json:"photo"`
	IsActive       *bool  `json:"is_active"`
	PolyclinicIDs  []uint `json:"polyclinic_ids"`
}

func CreateDoctor(c *gin.Context) {
	var req CreateDoctorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	doctor := models.Doctor{
		UserID:         req.UserID,
		FullName:       req.FullName,
		SIPNumber:      req.SIPNumber,
		Specialization: req.Specialization,
		Phone:          req.Phone,
		Photo:          req.Photo,
		IsActive:       isActive,
	}

	if err := database.DB.Create(&doctor).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Assign polyclinics
	if len(req.PolyclinicIDs) > 0 {
		var polyclinics []models.Polyclinic
		database.DB.Where("id IN ?", req.PolyclinicIDs).Find(&polyclinics)
		database.DB.Model(&doctor).Association("Polyclinics").Replace(polyclinics)
	}

	database.DB.Preload("User").Preload("Polyclinics").First(&doctor, doctor.ID)
	c.JSON(http.StatusCreated, gin.H{"data": doctor})
}

func UpdateDoctor(c *gin.Context) {
	id := c.Param("id")

	var doctor models.Doctor
	if err := database.DB.First(&doctor, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dokter tidak ditemukan"})
		return
	}

	var req CreateDoctorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	doctor.UserID = req.UserID
	doctor.FullName = req.FullName
	doctor.SIPNumber = req.SIPNumber
	doctor.Specialization = req.Specialization
	doctor.Phone = req.Phone
	doctor.Photo = req.Photo
	if req.IsActive != nil {
		doctor.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&doctor).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Update polyclinics
	if req.PolyclinicIDs != nil {
		var polyclinics []models.Polyclinic
		database.DB.Where("id IN ?", req.PolyclinicIDs).Find(&polyclinics)
		database.DB.Model(&doctor).Association("Polyclinics").Replace(polyclinics)
	}

	database.DB.Preload("User").Preload("Polyclinics").Preload("Schedules").First(&doctor, doctor.ID)
	c.JSON(http.StatusOK, gin.H{"data": doctor})
}

func DeleteDoctor(c *gin.Context) {
	id := c.Param("id")

	var doctor models.Doctor
	if err := database.DB.First(&doctor, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dokter tidak ditemukan"})
		return
	}

	// Clear polyclinic associations
	database.DB.Model(&doctor).Association("Polyclinics").Clear()

	if err := database.DB.Delete(&doctor).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Dokter berhasil dihapus"})
}
