package handlers

import (
	"math"
	"net/http"
	"strconv"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

// ========================
// Medical Records CRUD
// ========================

func GetMedicalRecords(c *gin.Context) {
	var records []models.MedicalRecord
	query := database.DB.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		Order("record_date DESC")

	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Joins("JOIN patients ON patients.id = medical_records.patient_id").
			Where("patients.full_name ILIKE ? OR patients.medical_record_number ILIKE ?", like, like)
	}
	if status := c.Query("status"); status != "" {
		query = query.Where("medical_records.status = ?", status)
	}
	if patientID := c.Query("patient_id"); patientID != "" {
		query = query.Where("medical_records.patient_id = ?", patientID)
	}
	if doctorID := c.Query("doctor_id"); doctorID != "" {
		query = query.Where("medical_records.doctor_id = ?", doctorID)
	}

	var total int64
	query.Model(&models.MedicalRecord{}).Count(&total)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * perPage

	if err := query.Offset(offset).Limit(perPage).Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     records,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func GetMedicalRecord(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		Preload("Prescriptions").
		Preload("Prescriptions.Medicine").
		Preload("Prescriptions.Medicine.Unit").
		Preload("Actions").
		Preload("Actions.MedicalService").
		Preload("Actions.Doctor").
		Preload("InformedConsents").
		First(&record, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": record})
}

func GetMedicalRecordByVisit(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("visitId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visit ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		Preload("Prescriptions").
		Preload("Prescriptions.Medicine").
		Preload("Prescriptions.Medicine.Unit").
		Preload("Actions").
		Preload("Actions.MedicalService").
		Preload("Actions.Doctor").
		Preload("InformedConsents").
		Where("visit_id = ?", visitID).
		First(&record).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": record})
}

type CreateMedicalRecordRequest struct {
	VisitID uint `json:"visit_id" binding:"required"`
}

func CreateMedicalRecord(c *gin.Context) {
	var req CreateMedicalRecordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate visit exists and load its data
	var visit models.Visit
	if err := database.DB.First(&visit, req.VisitID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	// Check if medical record already exists for this visit
	var existing models.MedicalRecord
	if err := database.DB.Where("visit_id = ?", req.VisitID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Rekam medis sudah ada untuk kunjungan ini", "data": existing})
		return
	}

	record := models.MedicalRecord{
		VisitID:      visit.ID,
		PatientID:    visit.PatientID,
		DoctorID:     visit.DoctorID,
		PolyclinicID: visit.PolyclinicID,
		RecordDate:   time.Now(),
		Subjective:   visit.Complaint,
		Status:       "draft",
	}

	if err := database.DB.Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Update visit status to in_progress
	database.DB.Model(&visit).Updates(map[string]interface{}{
		"status":       "in_progress",
		"queue_status": "in_consultation",
	})

	// Reload with relations
	database.DB.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		First(&record, record.ID)

	c.JSON(http.StatusCreated, gin.H{"data": record, "message": "Rekam medis berhasil dibuat"})
}

type UpdateMedicalRecordRequest struct {
	ChiefComplaint          string  `json:"chief_complaint"`
	HistoryOfPresentIllness string  `json:"history_of_present_illness"`
	ClinicalAlert           string  `json:"clinical_alert"`
	AllergyNotes            string  `json:"allergy_notes"`
	Subjective              string  `json:"subjective"`
	BPSystolic              int     `json:"bp_systolic"`
	BPDiastolic             int     `json:"bp_diastolic"`
	HeartRate               int     `json:"heart_rate"`
	Temperature             float64 `json:"temperature"`
	RespiratoryRate         int     `json:"respiratory_rate"`
	SpO2                    float64 `json:"spo2"`
	PainScale               int     `json:"pain_scale"`
	Consciousness           string  `json:"consciousness"`
	Height                  float64 `json:"height"`
	Weight                  float64 `json:"weight"`
	PhysicalExamination     string  `json:"physical_examination"`
	Assessment              string  `json:"assessment"`
	Plan                    string  `json:"plan"`
	FollowUpInstruction     string  `json:"follow_up_instruction"`
	FollowUpAt              string  `json:"follow_up_at"`
	Notes                   string  `json:"notes"`
}

func UpdateMedicalRecord(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.First(&record, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final, tidak bisa diubah"})
		return
	}

	var req UpdateMedicalRecordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Calculate BMI if height and weight provided
	var bmi float64
	if req.Height > 0 && req.Weight > 0 {
		heightM := req.Height / 100
		bmi = math.Round(req.Weight/(heightM*heightM)*10) / 10
	}

	var followUpAt interface{}
	if req.FollowUpAt != "" {
		parsedTime, parseErr := time.Parse(time.RFC3339, req.FollowUpAt)
		if parseErr != nil {
			parsedTime, parseErr = time.Parse("2006-01-02T15:04", req.FollowUpAt)
			if parseErr != nil {
				parsedTime, parseErr = time.Parse("2006-01-02", req.FollowUpAt)
				if parseErr != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Format follow_up_at tidak valid"})
					return
				}
			}
		}
		followUpAt = parsedTime
	} else {
		followUpAt = nil
	}

	updates := map[string]interface{}{
		"chief_complaint":            req.ChiefComplaint,
		"history_of_present_illness": req.HistoryOfPresentIllness,
		"clinical_alert":             req.ClinicalAlert,
		"allergy_notes":              req.AllergyNotes,
		"subjective":                 req.Subjective,
		"bp_systolic":                req.BPSystolic,
		"bp_diastolic":               req.BPDiastolic,
		"heart_rate":                 req.HeartRate,
		"temperature":                req.Temperature,
		"respiratory_rate":           req.RespiratoryRate,
		"spo2":                       req.SpO2,
		"pain_scale":                 req.PainScale,
		"consciousness":              req.Consciousness,
		"height":                     req.Height,
		"weight":                     req.Weight,
		"bmi":                        bmi,
		"physical_examination":       req.PhysicalExamination,
		"assessment":                 req.Assessment,
		"plan":                       req.Plan,
		"follow_up_instruction":      req.FollowUpInstruction,
		"follow_up_at":               followUpAt,
		"notes":                      req.Notes,
	}

	if err := database.DB.Model(&record).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Reload with relations
	database.DB.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		Preload("Prescriptions").
		Preload("Prescriptions.Medicine").
		Preload("Actions").
		Preload("Actions.MedicalService").
		First(&record, record.ID)

	c.JSON(http.StatusOK, gin.H{"data": record, "message": "Rekam medis berhasil diperbarui"})
}

func FinalizeMedicalRecord(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.First(&record, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}

	database.DB.Model(&record).Update("status", "final")

	// Update visit status to completed
	database.DB.Model(&models.Visit{}).Where("id = ?", record.VisitID).Updates(map[string]interface{}{
		"status":       "completed",
		"queue_status": "done",
	})

	c.JSON(http.StatusOK, gin.H{"message": "Rekam medis berhasil di-finalisasi"})
}

// ========================
// Diagnoses
// ========================

type DiagnosisRequest struct {
	ICD10ID       uint   `json:"icd10_id" binding:"required"`
	DiagnosisType string `json:"diagnosis_type" binding:"required,oneof=primer sekunder"`
	Notes         string `json:"notes"`
}

func AddDiagnosis(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}

	var req DiagnosisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	diagnosis := models.MedicalRecordDiagnosis{
		MedicalRecordID: uint(recordID),
		ICD10ID:         req.ICD10ID,
		DiagnosisType:   req.DiagnosisType,
		Notes:           req.Notes,
	}

	if err := database.DB.Create(&diagnosis).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("ICD10").First(&diagnosis, diagnosis.ID)

	c.JSON(http.StatusCreated, gin.H{"data": diagnosis, "message": "Diagnosis berhasil ditambahkan"})
}

func DeleteDiagnosis(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	diagID, err := strconv.Atoi(c.Param("diagnosisId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid diagnosis ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}

	if err := database.DB.
		Where("id = ? AND medical_record_id = ?", diagID, recordID).
		Delete(&models.MedicalRecordDiagnosis{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Diagnosis berhasil dihapus"})
}

// ========================
// Prescriptions
// ========================

type PrescriptionRequest struct {
	MedicineID   uint   `json:"medicine_id" binding:"required"`
	Quantity     int    `json:"quantity" binding:"required"`
	Dosage       string `json:"dosage"`
	Frequency    string `json:"frequency"`
	Duration     string `json:"duration"`
	Route        string `json:"route"`
	Instructions string `json:"instructions"`
	Notes        string `json:"notes"`
}

func AddPrescription(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}

	var req PrescriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	prescription := models.Prescription{
		MedicalRecordID: uint(recordID),
		MedicineID:      req.MedicineID,
		Quantity:        req.Quantity,
		Dosage:          req.Dosage,
		Frequency:       req.Frequency,
		Duration:        req.Duration,
		Route:           req.Route,
		Instructions:    req.Instructions,
		Notes:           req.Notes,
		Status:          "prescribed",
	}

	if err := database.DB.Create(&prescription).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Medicine").Preload("Medicine.Unit").First(&prescription, prescription.ID)

	c.JSON(http.StatusCreated, gin.H{"data": prescription, "message": "Resep berhasil ditambahkan"})
}

func DeletePrescription(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	prescID, err := strconv.Atoi(c.Param("prescriptionId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid prescription ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}

	if err := database.DB.
		Where("id = ? AND medical_record_id = ?", prescID, recordID).
		Delete(&models.Prescription{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Resep berhasil dihapus"})
}

// ========================
// Medical Actions
// ========================

type MedicalActionRequest struct {
	MedicalServiceID uint   `json:"medical_service_id" binding:"required"`
	Quantity         int    `json:"quantity"`
	Notes            string `json:"notes"`
}

func AddMedicalAction(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}

	var req MedicalActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get service price
	var service models.MedicalService
	if err := database.DB.First(&service, req.MedicalServiceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Layanan medis tidak ditemukan"})
		return
	}

	qty := req.Quantity
	if qty <= 0 {
		qty = 1
	}

	action := models.MedicalAction{
		MedicalRecordID:  uint(recordID),
		MedicalServiceID: req.MedicalServiceID,
		DoctorID:         record.DoctorID,
		Quantity:         qty,
		Price:            service.Price,
		Notes:            req.Notes,
	}

	if err := database.DB.Create(&action).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("MedicalService").Preload("Doctor").First(&action, action.ID)

	c.JSON(http.StatusCreated, gin.H{"data": action, "message": "Tindakan berhasil ditambahkan"})
}

func DeleteMedicalAction(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	actionID, err := strconv.Atoi(c.Param("actionId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid action ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}

	if err := database.DB.
		Where("id = ? AND medical_record_id = ?", actionID, recordID).
		Delete(&models.MedicalAction{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Tindakan berhasil dihapus"})
}

// ========================
// Patient Medical History
// ========================

func GetPatientMedicalRecords(c *gin.Context) {
	patientID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid patient ID"})
		return
	}

	var records []models.MedicalRecord
	if err := database.DB.
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		Where("patient_id = ?", patientID).
		Order("record_date DESC").
		Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": records})
}
