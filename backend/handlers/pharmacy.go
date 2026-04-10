package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func preloadPharmacyPrescriptionOrderRelations(query *gorm.DB) *gorm.DB {
	return query.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		Preload("Prescriptions").
		Preload("Prescriptions.Medicine").
		Preload("Prescriptions.Medicine.Unit").
		Preload("PrescriptionCompounds").
		Preload("PrescriptionCompounds.Items").
		Preload("PrescriptionCompounds.Items.Medicine").
		Preload("PrescriptionCompounds.Items.Medicine.Unit").
		Preload("PrescriptionProcessor")
}

func isPharmacyProcessAddedPrescription(record models.MedicalRecord, prescription models.Prescription) bool {
	if record.PrescriptionOrderedAt == nil || record.PrescriptionOrderedAt.IsZero() {
		return false
	}
	if prescription.CreatedAt.IsZero() {
		return false
	}
	return prescription.CreatedAt.After(*record.PrescriptionOrderedAt)
}

func GetPharmacyPrescriptionOrders(c *gin.Context) {
	var records []models.MedicalRecord
	query := preloadPharmacyPrescriptionOrderRelations(database.DB).
		Where("medical_records.section_type = ?", "prescription").
		Where("medical_records.prescription_fulfillment_mode = ?", prescriptionFulfillmentModeInternal).
		Where("medical_records.prescription_workflow_status IN ?", []string{prescriptionWorkflowStatusOrdered, prescriptionWorkflowStatusPreparing, prescriptionWorkflowStatusReady, prescriptionWorkflowStatusDispensed}).
		Order("medical_records.prescription_ordered_at DESC NULLS LAST").
		Order("medical_records.created_at DESC")

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		like := "%" + q + "%"
		query = query.Joins("JOIN patients ON patients.id = medical_records.patient_id").
			Joins("JOIN visits ON visits.id = medical_records.visit_id").
			Where(
				"patients.full_name ILIKE ? OR patients.medical_record_number ILIKE ? OR visits.visit_number ILIKE ?",
				like,
				like,
				like,
			)
	}

	if workflowStatus := normalizePrescriptionWorkflowStatus(c.Query("prescription_workflow_status")); workflowStatus != "" {
		query = query.Where("medical_records.prescription_workflow_status = ?", workflowStatus)
	}

	if polyclinicID := c.Query("polyclinic_id"); polyclinicID != "" {
		query = query.Where("medical_records.polyclinic_id = ?", polyclinicID)
	}

	if date := strings.TrimSpace(c.Query("date")); date != "" {
		query = query.Where("DATE(COALESCE(medical_records.prescription_ordered_at, medical_records.record_date)) = ?", date)
	}

	var total int64
	query.Model(&models.MedicalRecord{}).Count(&total)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 50
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

func AddPharmacyPrescription(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadPrescriptionRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if message, ok := ensurePrescriptionRecordPharmacyEditable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var req PrescriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Quantity < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jumlah obat harus lebih dari 0"})
		return
	}

	var medicine models.Medicine
	if err := database.DB.First(&medicine, req.MedicineID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Obat tidak ditemukan"})
		return
	}
	if !medicine.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Obat tidak aktif"})
		return
	}

	prescription := models.Prescription{
		MedicalRecordID: uint(recordID),
		MedicineID:      req.MedicineID,
		Quantity:        req.Quantity,
		Dosage:          strings.TrimSpace(req.Dosage),
		Frequency:       strings.TrimSpace(req.Frequency),
		Duration:        strings.TrimSpace(req.Duration),
		Route:           strings.TrimSpace(req.Route),
		Instructions:    strings.TrimSpace(req.Instructions),
		Notes:           strings.TrimSpace(req.Notes),
		Status:          "prescribed",
	}

	if prescription.Route == "" {
		prescription.Route = "oral"
	}

	if err := database.DB.Create(&prescription).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadPrescriptionRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": updatedRecord, "message": fmt.Sprintf("Obat %s berhasil ditambahkan ke proses resep", medicine.Name)})
}

func DeletePharmacyPrescription(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	prescriptionID, err := strconv.Atoi(c.Param("prescriptionId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid prescription ID"})
		return
	}

	record, err := loadPrescriptionRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if message, ok := ensurePrescriptionRecordPharmacyEditable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var prescription models.Prescription
	if err := database.DB.Where("id = ? AND medical_record_id = ?", prescriptionID, recordID).First(&prescription).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item obat tidak ditemukan"})
		return
	}
	if !isPharmacyProcessAddedPrescription(record, prescription) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya obat yang ditambahkan manual oleh petugas farmasi yang dapat dihapus pada tahap proses"})
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Where("prescription_id = ?", prescription.ID).Delete(&models.Dispensing{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Where("id = ? AND medical_record_id = ?", prescriptionID, recordID).Delete(&models.Prescription{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadPrescriptionRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Obat resep berhasil dihapus dari proses farmasi"})
}
