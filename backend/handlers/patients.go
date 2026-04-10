package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func normalizeRegionLookupText(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	trimmed = strings.TrimPrefix(trimmed, "kabupaten ")
	trimmed = strings.TrimPrefix(trimmed, "kab. ")
	trimmed = strings.TrimPrefix(trimmed, "kota ")
	trimmed = strings.NewReplacer(".", "", `"`, "", `'`, "").Replace(trimmed)
	return strings.Join(strings.Fields(trimmed), " ")
}

func normalizeBirthPlace(tx *gorm.DB, birthPlace string) (string, error) {
	trimmedBirthPlace := strings.TrimSpace(birthPlace)
	if trimmedBirthPlace == "" {
		return "", nil
	}

	if !tx.Migrator().HasTable(&models.Regency{}) {
		return trimmedBirthPlace, nil
	}

	var regencies []models.Regency
	if err := tx.Select("id", "name").Find(&regencies).Error; err != nil {
		return "", err
	}

	normalizedBirthPlace := normalizeRegionLookupText(trimmedBirthPlace)
	for _, regency := range regencies {
		if normalizeRegionLookupText(regency.Name) == normalizedBirthPlace {
			return regency.Name, nil
		}
	}

	return trimmedBirthPlace, nil
}

func reservePatientIdentity(tx *gorm.DB) (uint, string, error) {
	var nextID int64
	if err := tx.Raw(`SELECT nextval(pg_get_serial_sequence('patients', 'id'))`).Scan(&nextID).Error; err != nil {
		return 0, "", err
	}

	if nextID < 1 {
		return 0, "", fmt.Errorf("invalid next patient id: %d", nextID)
	}

	return uint(nextID), fmt.Sprintf("%06d", nextID), nil
}

func GetPatients(c *gin.Context) {
	var patients []models.Patient
	query := database.DB.Order("created_at DESC")

	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Where("full_name ILIKE ? OR nik ILIKE ? OR medical_record_number ILIKE ? OR phone ILIKE ?", like, like, like, like)
	}
	if active := c.Query("is_active"); active != "" {
		query = query.Where("is_active = ?", active == "true")
	}

	var total int64
	query.Model(&models.Patient{}).Count(&total)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * perPage

	if err := query.Offset(offset).Limit(perPage).Find(&patients).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     patients,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func GetPatient(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var patient models.Patient
	if err := database.DB.First(&patient, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Patient not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": patient})
}

type CreatePatientRequest struct {
	NIK                      string  `json:"nik"`
	FullName                 string  `json:"full_name" binding:"required"`
	BirthDate                *string `json:"birth_date"`
	BirthPlace               string  `json:"birth_place"`
	Gender                   string  `json:"gender" binding:"required,oneof=L P"`
	BloodType                string  `json:"blood_type"`
	MaritalStatus            string  `json:"marital_status"`
	Religion                 string  `json:"religion"`
	Education                string  `json:"education"`
	Occupation               string  `json:"occupation"`
	Address                  string  `json:"address"`
	RT                       string  `json:"rt"`
	RW                       string  `json:"rw"`
	Kelurahan                string  `json:"kelurahan"`
	Kecamatan                string  `json:"kecamatan"`
	City                     string  `json:"city"`
	Province                 string  `json:"province"`
	PostalCode               string  `json:"postal_code"`
	Phone                    string  `json:"phone"`
	Email                    string  `json:"email"`
	EmergencyContactName     string  `json:"emergency_contact_name"`
	EmergencyContactPhone    string  `json:"emergency_contact_phone"`
	EmergencyContactRelation string  `json:"emergency_contact_relation"`
	InsuranceType            string  `json:"insurance_type"`
	InsuranceNumber          string  `json:"insurance_number"`
	Allergies                string  `json:"allergies"`
	Notes                    string  `json:"notes"`
}

func CreatePatient(c *gin.Context) {
	var req CreatePatientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check NIK uniqueness if provided
	if req.NIK != "" {
		var count int64
		database.DB.Model(&models.Patient{}).Where("nik = ?", req.NIK).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "NIK sudah terdaftar"})
			return
		}
	}

	var patient models.Patient

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		normalizedBirthPlace, err := normalizeBirthPlace(tx, req.BirthPlace)
		if err != nil {
			return err
		}

		patientID, medicalRecordNumber, err := reservePatientIdentity(tx)
		if err != nil {
			return err
		}

		patient = models.Patient{
			ID:                       patientID,
			MedicalRecordNumber:      medicalRecordNumber,
			NIK:                      req.NIK,
			FullName:                 req.FullName,
			BirthPlace:               normalizedBirthPlace,
			Gender:                   req.Gender,
			BloodType:                req.BloodType,
			MaritalStatus:            req.MaritalStatus,
			Religion:                 req.Religion,
			Education:                req.Education,
			Occupation:               req.Occupation,
			Address:                  req.Address,
			RT:                       req.RT,
			RW:                       req.RW,
			Kelurahan:                req.Kelurahan,
			Kecamatan:                req.Kecamatan,
			City:                     req.City,
			Province:                 req.Province,
			PostalCode:               req.PostalCode,
			Phone:                    req.Phone,
			Email:                    req.Email,
			EmergencyContactName:     req.EmergencyContactName,
			EmergencyContactPhone:    req.EmergencyContactPhone,
			EmergencyContactRelation: req.EmergencyContactRelation,
			InsuranceType:            req.InsuranceType,
			InsuranceNumber:          req.InsuranceNumber,
			Allergies:                req.Allergies,
			Notes:                    req.Notes,
			IsActive:                 true,
		}

		if req.BirthDate != nil && *req.BirthDate != "" {
			t, err := time.ParseInLocation("2006-01-02", *req.BirthDate, time.Local)
			if err == nil {
				patient.BirthDate = &t
			}
		}

		return tx.Create(&patient).Error
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": patient, "message": "Pasien berhasil didaftarkan"})
}

func UpdatePatient(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var patient models.Patient
	if err := database.DB.First(&patient, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Patient not found"})
		return
	}

	var req CreatePatientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check NIK uniqueness if changed
	if req.NIK != "" && req.NIK != patient.NIK {
		var count int64
		database.DB.Model(&models.Patient{}).Where("nik = ? AND id != ?", req.NIK, id).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "NIK sudah terdaftar"})
			return
		}
	}

	normalizedBirthPlace, err := normalizeBirthPlace(database.DB, req.BirthPlace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"nik":                        req.NIK,
		"full_name":                  req.FullName,
		"birth_place":                normalizedBirthPlace,
		"gender":                     req.Gender,
		"blood_type":                 req.BloodType,
		"marital_status":             req.MaritalStatus,
		"religion":                   req.Religion,
		"education":                  req.Education,
		"occupation":                 req.Occupation,
		"address":                    req.Address,
		"rt":                         req.RT,
		"rw":                         req.RW,
		"kelurahan":                  req.Kelurahan,
		"kecamatan":                  req.Kecamatan,
		"city":                       req.City,
		"province":                   req.Province,
		"postal_code":                req.PostalCode,
		"phone":                      req.Phone,
		"email":                      req.Email,
		"emergency_contact_name":     req.EmergencyContactName,
		"emergency_contact_phone":    req.EmergencyContactPhone,
		"emergency_contact_relation": req.EmergencyContactRelation,
		"insurance_type":             req.InsuranceType,
		"insurance_number":           req.InsuranceNumber,
		"allergies":                  req.Allergies,
		"notes":                      req.Notes,
	}

	if req.BirthDate != nil && *req.BirthDate != "" {
		t, err := time.ParseInLocation("2006-01-02", *req.BirthDate, time.Local)
		if err == nil {
			updates["birth_date"] = t
		}
	} else if req.BirthDate != nil && *req.BirthDate == "" {
		updates["birth_date"] = nil
	}

	if err := database.DB.Model(&patient).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": patient, "message": "Data pasien berhasil diperbarui"})
}

func DeletePatient(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var patient models.Patient
	if err := database.DB.First(&patient, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Patient not found"})
		return
	}

	// Check if patient has visits
	var visitCount int64
	database.DB.Model(&models.Visit{}).Where("patient_id = ?", id).Count(&visitCount)
	if visitCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Pasien memiliki riwayat kunjungan, tidak dapat dihapus"})
		return
	}

	database.DB.Delete(&patient)
	c.JSON(http.StatusOK, gin.H{"message": "Pasien berhasil dihapus"})
}

func GetPatientHistory(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var visits []models.Visit
	if err := database.DB.
		Preload("Polyclinic").
		Preload("Doctor").
		Where("patient_id = ?", id).
		Order("visit_date DESC").
		Find(&visits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": visits})
}
