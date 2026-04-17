package handlers

import (
	"errors"
	"net/http"
	"starter/backend/database"
	"starter/backend/models"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type doctorSummaryResponse struct {
	TotalCount             int64 `json:"total_count"`
	ActiveCount            int64 `json:"active_count"`
	InactiveCount          int64 `json:"inactive_count"`
	SATUSEHATRequiredCount int64 `json:"satusehat_required_count"`
	SATUSEHATOptionalCount int64 `json:"satusehat_optional_count"`
	UnlinkedEmployeeCount  int64 `json:"unlinked_employee_count"`
}

func GetDoctors(c *gin.Context) {
	var doctors []models.Doctor
	query := database.DB.Preload("Employee").Preload("Employee.User").Preload("Employee.User.Role").Preload("User").Preload("User.Role").Preload("Polyclinics").Preload("Schedules").Preload("Schedules.Polyclinic")

	if search := c.Query("q"); search != "" {
		query = query.Where("full_name ILIKE ? OR nik_number ILIKE ? OR nip_number ILIKE ? OR sip_number ILIKE ? OR specialization ILIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	if polyclinicID := c.Query("polyclinic_id"); polyclinicID != "" {
		query = query.Joins("JOIN doctor_polyclinics ON doctor_polyclinics.doctor_id = doctors.id").
			Where("doctor_polyclinics.polyclinic_id = ?", polyclinicID)
	}

	if employeeLinked, ok := parseOptionalQueryBool(c.Query("employee_linked")); ok {
		if employeeLinked {
			query = query.Where("doctors.employee_id IS NOT NULL")
		} else {
			query = query.Where("doctors.employee_id IS NULL")
		}
	}

	if requiresSATUSEHAT, ok := parseOptionalQueryBool(c.Query("requires_satusehat")); ok {
		query = query.Joins("LEFT JOIN employees ON employees.id = doctors.employee_id")
		if requiresSATUSEHAT {
			query = query.Where("doctors.employee_id IS NULL OR employees.requires_satusehat = ?", true)
		} else {
			query = query.Where("doctors.employee_id IS NOT NULL AND employees.requires_satusehat = ?", false)
		}
	}

	if isActive, ok := parseOptionalQueryBool(c.Query("is_active")); ok {
		query = query.Where("doctors.is_active = ?", isActive)
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
	if err := database.DB.Preload("Employee").Preload("Employee.User").Preload("Employee.User.Role").Preload("User").Preload("User.Role").Preload("Polyclinics").Preload("Schedules").Preload("Schedules.Polyclinic").First(&doctor, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dokter tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": doctor})
}

func GetDoctorsSummary(c *gin.Context) {
	summary := doctorSummaryResponse{}

	if err := database.DB.Model(&models.Doctor{}).Count(&summary.TotalCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&models.Doctor{}).Where("employee_id IS NULL").Count(&summary.UnlinkedEmployeeCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&models.Doctor{}).Where("is_active = ?", true).Count(&summary.ActiveCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	summary.InactiveCount = summary.TotalCount - summary.ActiveCount

	if err := database.DB.Model(&models.Doctor{}).
		Joins("LEFT JOIN employees ON employees.id = doctors.employee_id").
		Where("doctors.employee_id IS NULL OR employees.requires_satusehat = ?", true).
		Count(&summary.SATUSEHATRequiredCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&models.Doctor{}).
		Joins("JOIN employees ON employees.id = doctors.employee_id").
		Where("employees.requires_satusehat = ?", false).
		Count(&summary.SATUSEHATOptionalCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": summary})
}

type CreateDoctorRequest struct {
	EmployeeID     *uint  `json:"employee_id"`
	UserID         *uint  `json:"user_id"`
	FullName       string `json:"full_name" binding:"required"`
	NIKNumber      string `json:"nik_number"`
	NIPNumber      string `json:"nip_number"`
	SIPNumber      string `json:"sip_number"`
	Specialization string `json:"specialization"`
	Phone          string `json:"phone"`
	Photo          string `json:"photo"`
	IsActive       *bool  `json:"is_active"`
	PolyclinicIDs  []uint `json:"polyclinic_ids"`
	BpjsDoctorCode string `json:"bpjs_doctor_code"`
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
		EmployeeID:     req.EmployeeID,
		UserID:         req.UserID,
		FullName:       req.FullName,
		NIKNumber:      req.NIKNumber,
		NIPNumber:      req.NIPNumber,
		SIPNumber:      req.SIPNumber,
		Specialization: req.Specialization,
		Phone:          req.Phone,
		Photo:          req.Photo,
		BpjsDoctorCode: req.BpjsDoctorCode,
		IsActive:       isActive,
	}

	if err := applyEmployeeToDoctorRequest(&doctor, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
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

	database.DB.Preload("Employee").Preload("Employee.User").Preload("Employee.User.Role").Preload("User").Preload("User.Role").Preload("Polyclinics").First(&doctor, doctor.ID)
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
	doctor.EmployeeID = req.EmployeeID
	doctor.FullName = req.FullName
	doctor.NIKNumber = req.NIKNumber
	doctor.NIPNumber = req.NIPNumber
	doctor.SIPNumber = req.SIPNumber
	doctor.Specialization = req.Specialization
	doctor.Phone = req.Phone
	doctor.Photo = req.Photo
	doctor.BpjsDoctorCode = req.BpjsDoctorCode
	if req.IsActive != nil {
		doctor.IsActive = *req.IsActive
	}

	if err := applyEmployeeToDoctorRequest(&doctor, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
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

	database.DB.Preload("Employee").Preload("Employee.User").Preload("Employee.User.Role").Preload("User").Preload("User.Role").Preload("Polyclinics").Preload("Schedules").First(&doctor, doctor.ID)
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

func applyEmployeeToDoctorRequest(doctor *models.Doctor, req CreateDoctorRequest) error {
	if req.EmployeeID == nil || *req.EmployeeID == 0 {
		return nil
	}

	var employee models.Employee
	if err := database.DB.Preload("User").First(&employee, *req.EmployeeID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("Pegawai dokter tidak ditemukan")
		}
		return err
	}
	if normalizeEmployeeProfession(employee.Profession) != "doctor" {
		return errors.New("Pegawai yang dipilih bukan profesi dokter")
	}
	if req.UserID != nil && employee.UserID != nil && *req.UserID != *employee.UserID {
		return errors.New("Akun dokter harus mengikuti akun yang tertaut pada data pegawai")
	}

	doctor.EmployeeID = &employee.ID
	doctor.UserID = employee.UserID
	doctor.FullName = strings.TrimSpace(employee.FullName)
	doctor.NIKNumber = strings.TrimSpace(employee.NIKNumber)
	doctor.NIPNumber = strings.TrimSpace(employee.NIPNumber)
	doctor.Phone = strings.TrimSpace(employee.Phone)
	doctor.SatusehatPractitionerID = strings.TrimSpace(employee.SatusehatPractitionerID)
	doctor.SatusehatSyncedAt = employee.SatusehatSyncedAt
	return nil
}
