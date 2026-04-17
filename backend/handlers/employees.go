package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var allowedEmployeeProfessions = map[string]struct{}{
	"doctor":         {},
	"pharmacist":     {},
	"pharmacy":       {},
	"nurse":          {},
	"midwife":        {},
	"administration": {},
	"cashier":        {},
	"analyst":        {},
	"radiology":      {},
	"other":          {},
}

type employeeRequest struct {
	UserID                  *uint  `json:"user_id"`
	FullName                string `json:"full_name" binding:"required"`
	EmployeeCode            string `json:"employee_code"`
	NIKNumber               string `json:"nik_number"`
	NIPNumber               string `json:"nip_number"`
	Profession              string `json:"profession" binding:"required"`
	LicenseNumber           string `json:"license_number"`
	Phone                   string `json:"phone"`
	RequiresSATUSEHAT       *bool  `json:"requires_satusehat"`
	SatusehatPractitionerID string `json:"satusehat_practitioner_id"`
	IsActive                *bool  `json:"is_active"`
}

type employeeSummaryResponse struct {
	TotalCount             int64 `json:"total_count"`
	ActiveCount            int64 `json:"active_count"`
	InactiveCount          int64 `json:"inactive_count"`
	SATUSEHATRequiredCount int64 `json:"satusehat_required_count"`
	SATUSEHATOptionalCount int64 `json:"satusehat_optional_count"`
	LinkedAccountCount     int64 `json:"linked_account_count"`
}

func GetEmployees(c *gin.Context) {
	var employees []models.Employee
	query := database.DB.Preload("User").Preload("User.Role")

	if search := strings.TrimSpace(c.Query("q")); search != "" {
		like := "%" + search + "%"
		query = query.Where(
			"full_name ILIKE ? OR employee_code ILIKE ? OR nik_number ILIKE ? OR nip_number ILIKE ? OR profession ILIKE ?",
			like, like, like, like, like,
		)
	}

	if profession := normalizeEmployeeProfession(c.Query("profession")); profession != "" {
		query = query.Where("profession = ?", profession)
	}

	if requiresSATUSEHAT, ok := parseOptionalQueryBool(c.Query("requires_satusehat")); ok {
		query = query.Where("requires_satusehat = ?", requiresSATUSEHAT)
	}

	if isActive, ok := parseOptionalQueryBool(c.Query("is_active")); ok {
		query = query.Where("is_active = ?", isActive)
	}

	if err := query.Order("full_name ASC").Find(&employees).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": employees})
}

func GetEmployee(c *gin.Context) {
	var employee models.Employee
	if err := database.DB.Preload("User").Preload("User.Role").First(&employee, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pegawai tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": employee})
}

func GetEmployeesSummary(c *gin.Context) {
	summary := employeeSummaryResponse{}

	if err := database.DB.Model(&models.Employee{}).Count(&summary.TotalCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&models.Employee{}).Where("requires_satusehat = ?", true).Count(&summary.SATUSEHATRequiredCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&models.Employee{}).Where("is_active = ?", true).Count(&summary.ActiveCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	summary.InactiveCount = summary.TotalCount - summary.ActiveCount

	summary.SATUSEHATOptionalCount = summary.TotalCount - summary.SATUSEHATRequiredCount

	if err := database.DB.Model(&models.Employee{}).Where("user_id IS NOT NULL").Count(&summary.LinkedAccountCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": summary})
}

func CreateEmployee(c *gin.Context) {
	var req employeeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	profession, err := validateEmployeeRequest(req, 0)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	requiresSATUSEHAT := false
	if req.RequiresSATUSEHAT != nil {
		requiresSATUSEHAT = *req.RequiresSATUSEHAT
	}

	employee := models.Employee{
		UserID:                  req.UserID,
		FullName:                strings.TrimSpace(req.FullName),
		NIKNumber:               strings.TrimSpace(req.NIKNumber),
		NIPNumber:               strings.TrimSpace(req.NIPNumber),
		Profession:              profession,
		LicenseNumber:           strings.TrimSpace(req.LicenseNumber),
		Phone:                   strings.TrimSpace(req.Phone),
		RequiresSATUSEHAT:       requiresSATUSEHAT,
		SatusehatPractitionerID: strings.TrimSpace(req.SatusehatPractitionerID),
		IsActive:                isActive,
	}

	generatedCode, err := generateEmployeeCode()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	employee.EmployeeCode = generatedCode

	if err := database.DB.Create(&employee).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Preload("User").Preload("User.Role").First(&employee, employee.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": employee})
}

func UpdateEmployee(c *gin.Context) {
	var employee models.Employee
	if err := database.DB.First(&employee, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pegawai tidak ditemukan"})
		return
	}

	var req employeeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	profession, err := validateEmployeeRequest(req, employee.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	employee.UserID = req.UserID
	employee.FullName = strings.TrimSpace(req.FullName)
	employee.NIKNumber = strings.TrimSpace(req.NIKNumber)
	employee.NIPNumber = strings.TrimSpace(req.NIPNumber)
	employee.Profession = profession
	employee.LicenseNumber = strings.TrimSpace(req.LicenseNumber)
	employee.Phone = strings.TrimSpace(req.Phone)
	employee.SatusehatPractitionerID = strings.TrimSpace(req.SatusehatPractitionerID)
	if strings.TrimSpace(employee.EmployeeCode) == "" {
		generatedCode, err := generateEmployeeCode()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		employee.EmployeeCode = generatedCode
	}
	if req.RequiresSATUSEHAT != nil {
		employee.RequiresSATUSEHAT = *req.RequiresSATUSEHAT
	}
	if req.IsActive != nil {
		employee.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&employee).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := syncDoctorProfilesFromEmployee(employee); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Preload("User").Preload("User.Role").First(&employee, employee.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": employee})
}

func DeleteEmployee(c *gin.Context) {
	var employee models.Employee
	if err := database.DB.First(&employee, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pegawai tidak ditemukan"})
		return
	}

	var linkedDoctors int64
	if err := database.DB.Model(&models.Doctor{}).Where("employee_id = ?", employee.ID).Count(&linkedDoctors).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if linkedDoctors > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pegawai masih dipakai oleh profil dokter dan tidak bisa dihapus"})
		return
	}

	if err := database.DB.Delete(&employee).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Pegawai berhasil dihapus"})
}

func validateEmployeeRequest(req employeeRequest, currentEmployeeID uint) (string, error) {
	profession := normalizeEmployeeProfession(req.Profession)
	if _, ok := allowedEmployeeProfessions[profession]; !ok {
		return "", errEmployeeValidation("Profesi pegawai tidak valid")
	}

	if req.UserID != nil && *req.UserID != 0 {
		var user models.User
		if err := database.DB.First(&user, *req.UserID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return "", errEmployeeValidation("User akun pegawai tidak ditemukan")
			}
			return "", err
		}

		var existing models.Employee
		err := database.DB.Where("user_id = ?", *req.UserID).First(&existing).Error
		if err == nil && existing.ID != currentEmployeeID {
			return "", errEmployeeValidation("Akun user tersebut sudah terhubung ke pegawai lain")
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			return "", err
		}
	}

	if strings.TrimSpace(req.FullName) == "" {
		return "", errEmployeeValidation("Nama pegawai wajib diisi")
	}

	return profession, nil
}

func normalizeEmployeeProfession(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func parseOptionalQueryBool(value string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes":
		return true, true
	case "0", "false", "no":
		return false, true
	default:
		return false, false
	}
}

func errEmployeeValidation(message string) error {
	return errors.New(message)
}

func generateEmployeeCode() (string, error) {
	now := time.Now()
	prefix := fmt.Sprintf("EMP-%s-", now.Format("20060102"))

	var count int64
	if err := database.DB.Model(&models.Employee{}).Unscoped().
		Where("DATE(created_at) = ?", now.Format("2006-01-02")).
		Count(&count).Error; err != nil {
		return "", err
	}

	for offset := int64(1); offset <= 9999; offset++ {
		candidate := fmt.Sprintf("%s%04d", prefix, count+offset)

		var exists int64
		if err := database.DB.Model(&models.Employee{}).Unscoped().Where("employee_code = ?", candidate).Count(&exists).Error; err != nil {
			return "", err
		}
		if exists == 0 {
			return candidate, nil
		}
	}

	return "", errors.New("gagal membuat kode pegawai otomatis")
}

func syncDoctorProfilesFromEmployee(employee models.Employee) error {
	if normalizeEmployeeProfession(employee.Profession) != "doctor" {
		return nil
	}

	updates := map[string]any{}

	if database.DB.Migrator().HasColumn(&models.Doctor{}, "user_id") {
		updates["user_id"] = employee.UserID
	}
	if database.DB.Migrator().HasColumn(&models.Doctor{}, "full_name") {
		updates["full_name"] = strings.TrimSpace(employee.FullName)
	}
	if database.DB.Migrator().HasColumn(&models.Doctor{}, "nik_number") {
		updates["nik_number"] = strings.TrimSpace(employee.NIKNumber)
	}
	if database.DB.Migrator().HasColumn(&models.Doctor{}, "nip_number") {
		updates["nip_number"] = strings.TrimSpace(employee.NIPNumber)
	}
	if database.DB.Migrator().HasColumn(&models.Doctor{}, "phone") {
		updates["phone"] = strings.TrimSpace(employee.Phone)
	}
	if database.DB.Migrator().HasColumn(&models.Doctor{}, "satusehat_practitioner_id") {
		updates["satusehat_practitioner_id"] = strings.TrimSpace(employee.SatusehatPractitionerID)
	}
	if database.DB.Migrator().HasColumn(&models.Doctor{}, "satusehat_synced_at") {
		updates["satusehat_synced_at"] = employee.SatusehatSyncedAt
	}

	if len(updates) == 0 {
		return nil
	}

	return database.DB.Model(&models.Doctor{}).Where("employee_id = ?", employee.ID).Updates(updates).Error
}
