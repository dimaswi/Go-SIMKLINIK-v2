package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func GetDoctorSchedules(c *gin.Context) {
	var schedules []models.DoctorSchedule
	query := database.DB.Preload("Doctor").Preload("Polyclinic")

	if doctorID := c.Query("doctor_id"); doctorID != "" {
		query = query.Where("doctor_id = ?", doctorID)
	}

	if polyclinicID := c.Query("polyclinic_id"); polyclinicID != "" {
		query = query.Where("polyclinic_id = ?", polyclinicID)
	}

	if dayOfWeek := c.Query("day_of_week"); dayOfWeek != "" {
		query = query.Where("day_of_week = ?", dayOfWeek)
	}

	if err := query.Find(&schedules).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": schedules})
}

func GetDoctorSchedule(c *gin.Context) {
	id := c.Param("id")

	var schedule models.DoctorSchedule
	if err := database.DB.Preload("Doctor").Preload("Polyclinic").First(&schedule, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Jadwal tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": schedule})
}

type CreateDoctorScheduleRequest struct {
	DoctorID     uint   `json:"doctor_id" binding:"required"`
	PolyclinicID uint   `json:"polyclinic_id" binding:"required"`
	DayOfWeek    int    `json:"day_of_week" binding:"min=0,max=6"`
	StartTime    string `json:"start_time" binding:"required"`
	EndTime      string `json:"end_time" binding:"required"`
	MaxPatients  int    `json:"max_patients"`
	IsActive     *bool  `json:"is_active"`
}

func CreateDoctorSchedule(c *gin.Context) {
	var req CreateDoctorScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate doctor exists
	var doctor models.Doctor
	if err := database.DB.First(&doctor, req.DoctorID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dokter tidak ditemukan"})
		return
	}

	// Validate polyclinic exists
	var polyclinic models.Polyclinic
	if err := database.DB.First(&polyclinic, req.PolyclinicID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Poliklinik tidak ditemukan"})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	maxPatients := 30
	if req.MaxPatients > 0 {
		maxPatients = req.MaxPatients
	}

	schedule := models.DoctorSchedule{
		DoctorID:     req.DoctorID,
		PolyclinicID: req.PolyclinicID,
		DayOfWeek:    req.DayOfWeek,
		StartTime:    req.StartTime,
		EndTime:      req.EndTime,
		MaxPatients:  maxPatients,
		IsActive:     isActive,
	}

	if err := database.DB.Create(&schedule).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Doctor").Preload("Polyclinic").First(&schedule, schedule.ID)
	c.JSON(http.StatusCreated, gin.H{"data": schedule})
}

func UpdateDoctorSchedule(c *gin.Context) {
	id := c.Param("id")

	var schedule models.DoctorSchedule
	if err := database.DB.First(&schedule, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Jadwal tidak ditemukan"})
		return
	}

	var req CreateDoctorScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	schedule.DoctorID = req.DoctorID
	schedule.PolyclinicID = req.PolyclinicID
	schedule.DayOfWeek = req.DayOfWeek
	schedule.StartTime = req.StartTime
	schedule.EndTime = req.EndTime
	if req.MaxPatients > 0 {
		schedule.MaxPatients = req.MaxPatients
	}
	if req.IsActive != nil {
		schedule.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&schedule).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Doctor").Preload("Polyclinic").First(&schedule, schedule.ID)
	c.JSON(http.StatusOK, gin.H{"data": schedule})
}

func DeleteDoctorSchedule(c *gin.Context) {
	id := c.Param("id")

	var schedule models.DoctorSchedule
	if err := database.DB.First(&schedule, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Jadwal tidak ditemukan"})
		return
	}

	if err := database.DB.Delete(&schedule).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Jadwal berhasil dihapus"})
}
