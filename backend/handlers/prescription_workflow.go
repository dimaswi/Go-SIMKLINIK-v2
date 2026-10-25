package handlers

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	prescriptionFulfillmentModeInternal = "internal"
	prescriptionFulfillmentModePrint    = "print"

	prescriptionWorkflowStatusDraft     = "draft"
	prescriptionWorkflowStatusOrdered   = "ordered"
	prescriptionWorkflowStatusPreparing = "preparing"
	prescriptionWorkflowStatusReady     = "ready"
	prescriptionWorkflowStatusDispensed = "dispensed"
	prescriptionWorkflowStatusPrinted   = "printed"
)

type PrescriptionCompoundIngredientRequest struct {
	MedicineID uint    `json:"medicine_id" binding:"required"`
	Quantity   float64 `json:"quantity" binding:"required"`
	Notes      string  `json:"notes"`
}

type PrescriptionCompoundRequest struct {
	Name            string                                  `json:"name" binding:"required"`
	PreparationType string                                  `json:"preparation_type"`
	OutputQuantity  int                                     `json:"output_quantity" binding:"required"`
	OutputUnit      string                                  `json:"output_unit"`
	Dosage          string                                  `json:"dosage"`
	Frequency       string                                  `json:"frequency"`
	Duration        string                                  `json:"duration"`
	Route           string                                  `json:"route"`
	Instructions    string                                  `json:"instructions"`
	Notes           string                                  `json:"notes"`
	Items           []PrescriptionCompoundIngredientRequest `json:"items"`
}

func normalizePrescriptionFulfillmentMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case prescriptionFulfillmentModeInternal:
		return prescriptionFulfillmentModeInternal
	case prescriptionFulfillmentModePrint:
		return prescriptionFulfillmentModePrint
	default:
		return ""
	}
}

func normalizePrescriptionWorkflowStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case prescriptionWorkflowStatusDraft:
		return prescriptionWorkflowStatusDraft
	case prescriptionWorkflowStatusOrdered:
		return prescriptionWorkflowStatusOrdered
	case prescriptionWorkflowStatusPreparing:
		return prescriptionWorkflowStatusPreparing
	case prescriptionWorkflowStatusReady:
		return prescriptionWorkflowStatusReady
	case prescriptionWorkflowStatusDispensed:
		return prescriptionWorkflowStatusDispensed
	case prescriptionWorkflowStatusPrinted:
		return prescriptionWorkflowStatusPrinted
	default:
		return ""
	}
}

func isPrescriptionWorkflowLocked(status string) bool {
	normalized := normalizePrescriptionWorkflowStatus(status)
	return normalized != "" && normalized != prescriptionWorkflowStatusDraft
}

func countPrescriptionOrderLines(record models.MedicalRecord) int {
	return len(record.Prescriptions) + len(record.PrescriptionCompounds)
}

func loadPrescriptionRecord(recordID uint) (models.MedicalRecord, error) {
	var record models.MedicalRecord
	err := preloadMedicalRecordRelations(database.DB).
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Doctor").
		Preload("Visit.Polyclinic").
		First(&record, recordID).Error
	return record, err
}

func getAuthenticatedUserID(c *gin.Context) uint {
	userID, _ := c.Get("user_id")
	if value, ok := userID.(uint); ok {
		return value
	}
	return 0
}

func getMedicalRecordDoctorUserID(record models.MedicalRecord) uint {
	if record.Doctor.UserID != nil && *record.Doctor.UserID != 0 {
		return *record.Doctor.UserID
	}
	if record.DoctorID == 0 {
		return 0
	}

	var doctor models.Doctor
	if err := database.DB.Select("id", "user_id").First(&doctor, record.DoctorID).Error; err != nil {
		return 0
	}
	if doctor.UserID == nil {
		return 0
	}

	return *doctor.UserID
}

func getMedicalRecordOrderedByUserID(record models.MedicalRecord) uint {
	switch normalizeMedicalRecordSection(record.SectionType) {
	case "prescription":
		if record.PrescriptionOrderedBy != nil {
			return *record.PrescriptionOrderedBy
		}
	case "laboratory":
		if record.LaboratoryOrderedBy != nil {
			return *record.LaboratoryOrderedBy
		}
	case "radiology":
		if record.RadiologyOrderedBy != nil {
			return *record.RadiologyOrderedBy
		}
	}

	return getMedicalRecordDoctorUserID(record)
}

func isOnlyActiveUser(userID uint) bool {
	if userID == 0 {
		return false
	}

	var activeUserCount int64
	if err := database.DB.Model(&models.User{}).Where("is_active = ?", true).Count(&activeUserCount).Error; err != nil {
		return false
	}
	if activeUserCount != 1 {
		return false
	}

	var matchingUserCount int64
	if err := database.DB.Model(&models.User{}).Where("id = ? AND is_active = ?", userID, true).Count(&matchingUserCount).Error; err != nil {
		return false
	}

	return matchingUserCount == 1
}

func isMedicalRecordOrderRequester(record models.MedicalRecord, userID uint) bool {
	if userID == 0 {
		return false
	}

	requesterUserID := getMedicalRecordOrderedByUserID(record)
	if requesterUserID == userID {
		return true
	}

	return isOnlyActiveUser(userID)
}

func ensurePrescriptionRecordWritable(record models.MedicalRecord) (string, bool) {
	if record.Status == "final" {
		return "Rekam medis sudah final", false
	}
	if record.Status == "cancelled" {
		return "Rekam medis berstatus batal", false
	}
	if normalizeMedicalRecordSection(record.SectionType) != "prescription" {
		return "Aksi ini hanya tersedia pada entri resep", false
	}
	if isPrescriptionWorkflowLocked(record.PrescriptionWorkflowStatus) {
		return "Order resep sudah dikirim atau diproses. Buat entri resep baru untuk revisi", false
	}
	return "", true
}

func ensurePrescriptionRecordProcessable(record models.MedicalRecord) (string, bool) {
	if record.Status == "final" {
		return "Rekam medis sudah final", false
	}
	if record.Status == "cancelled" {
		return "Rekam medis berstatus batal", false
	}
	if normalizeMedicalRecordSection(record.SectionType) != "prescription" {
		return "Aksi farmasi hanya tersedia pada entri resep", false
	}
	if record.Visit.Status == "cancelled" {
		return "Kunjungan sudah dibatalkan", false
	}
	if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) != prescriptionFulfillmentModeInternal {
		return "Mode resep ini bukan order internal", false
	}
	if countPrescriptionOrderLines(record) == 0 {
		return "Order resep belum memiliki item obat", false
	}

	workflowStatus := normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus)
	if workflowStatus == prescriptionWorkflowStatusPrinted {
		return "Order resep ini sudah dicetak sebagai resep luar", false
	}
	if workflowStatus == prescriptionWorkflowStatusDispensed {
		return "Order resep ini sudah selesai diproses", false
	}

	return "", true
}

func ensurePrescriptionRecordPharmacyEditable(record models.MedicalRecord) (string, bool) {
	if message, ok := ensurePrescriptionRecordProcessable(record); !ok {
		return message, false
	}

	if normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) != prescriptionWorkflowStatusPreparing {
		return "Item resep hanya dapat diubah saat resep sedang diproses farmasi", false
	}

	return "", true
}

func collectPrescriptionStockIssues(record models.MedicalRecord) []string {
	issues := make([]string, 0)

	for _, prescription := range record.Prescriptions {
		medicineName := fallbackText(prescription.Medicine.Name)
		availableStock := prescription.Medicine.CurrentStock
		if availableStock < prescription.Quantity {
			issues = append(issues, fmt.Sprintf("stok %s tidak mencukupi. Tersedia %d", medicineName, availableStock))
		}
	}

	for _, compound := range record.PrescriptionCompounds {
		compoundName := fallbackText(compound.Name)
		for _, ingredient := range compound.Items {
			medicineName := fallbackText(ingredient.Medicine.Name)
			availableStock := ingredient.Medicine.CurrentStock
			if availableStock < ingredient.Quantity {
				issues = append(issues, fmt.Sprintf("stok bahan %s untuk racikan %s tidak mencukupi. Tersedia %d", medicineName, compoundName, availableStock))
			}
		}
	}

	return issues
}

func AddPrescriptionCompound(c *gin.Context) {
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

	if message, ok := ensurePrescriptionRecordWritable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var req PrescriptionCompoundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama racikan wajib diisi"})
		return
	}
	if req.OutputQuantity < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jumlah hasil racikan harus lebih dari 0"})
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Minimal satu bahan racikan harus diisi"})
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	compound := models.PrescriptionCompound{
		MedicalRecordID: uint(recordID),
		Name:            strings.TrimSpace(req.Name),
		PreparationType: strings.TrimSpace(req.PreparationType),
		OutputQuantity:  req.OutputQuantity,
		OutputUnit:      strings.TrimSpace(req.OutputUnit),
		Dosage:          strings.TrimSpace(req.Dosage),
		Frequency:       strings.TrimSpace(req.Frequency),
		Duration:        strings.TrimSpace(req.Duration),
		Route:           strings.TrimSpace(req.Route),
		Instructions:    strings.TrimSpace(req.Instructions),
		Notes:           req.Notes,
		Status:          "prescribed",
	}

	if compound.Route == "" {
		compound.Route = "oral"
	}

	if err := tx.Create(&compound).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, item := range req.Items {
		if item.MedicineID == 0 || item.Quantity < 1 {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Bahan racikan tidak valid"})
			return
		}

		var medicine models.Medicine
		if err := tx.First(&medicine, item.MedicineID).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Salah satu bahan racikan tidak ditemukan"})
			return
		}
		if !medicine.IsActive {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Salah satu bahan racikan tidak aktif"})
			return
		}

		qty := int(math.Ceil(item.Quantity))
		if qty < 1 {
			qty = 1
		}
		compoundItem := models.PrescriptionCompoundItem{
			PrescriptionCompoundID: compound.ID,
			MedicineID:             item.MedicineID,
			Quantity:               qty,
			Notes:                  item.Notes,
		}
		if err := tx.Create(&compoundItem).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.
		Preload("Items").
		Preload("Items.Medicine").
		Preload("Items.Medicine.Unit").
		First(&compound, compound.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": compound, "message": "Obat racikan berhasil ditambahkan"})
}

func DeletePrescriptionCompound(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	compoundID, err := strconv.Atoi(c.Param("compoundId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid compound ID"})
		return
	}

	record, err := loadPrescriptionRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if message, ok := ensurePrescriptionRecordWritable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Where("prescription_compound_id = ?", compoundID).Delete(&models.PrescriptionCompoundItem{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Where("id = ? AND medical_record_id = ?", compoundID, recordID).Delete(&models.PrescriptionCompound{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Obat racikan berhasil dihapus"})
}

func SubmitPrescriptionOrder(c *gin.Context) {
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

	if normalizeMedicalRecordSection(record.SectionType) != "prescription" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep hanya tersedia pada entri resep"})
		return
	}
	if record.Visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah dibatalkan"})
		return
	}
	if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) != prescriptionFulfillmentModeInternal {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mode order ini bukan order internal farmasi"})
		return
	}
	if countPrescriptionOrderLines(record) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tambahkan obat non-racikan atau racikan terlebih dahulu"})
		return
	}
	if normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) == prescriptionWorkflowStatusDispensed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep ini sudah selesai diproses"})
		return
	}
	if normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) == prescriptionWorkflowStatusPrinted {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep ini sudah dicetak sebagai resep luar"})
		return
	}
	if currentStatus := normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus); currentStatus == prescriptionWorkflowStatusOrdered || currentStatus == prescriptionWorkflowStatusPreparing || currentStatus == prescriptionWorkflowStatusReady {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep ini sudah dikirim ke farmasi"})
		return
	}

	now := time.Now()
	currentUserID := getAuthenticatedUserID(c)
	var orderedBy interface{}
	if currentUserID != 0 {
		orderedBy = currentUserID
	}
	updates := map[string]interface{}{
		"status":                       "draft",
		"prescription_workflow_status": prescriptionWorkflowStatusOrdered,
		"prescription_ordered_at":      &now,
		"prescription_ordered_by":      orderedBy,
		"prescription_processed_at":    nil,
		"prescription_processed_by":    nil,
	}
	if err := database.DB.Model(&record).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadPrescriptionRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order resep berhasil dikirim ke farmasi"})
}

func CancelPrescriptionOrder(c *gin.Context) {
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

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}
	if normalizeMedicalRecordSection(record.SectionType) != "prescription" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep hanya tersedia pada entri resep"})
		return
	}
	if record.Visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah dibatalkan"})
		return
	}
	if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) != prescriptionFulfillmentModeInternal {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mode order ini bukan order internal farmasi"})
		return
	}
	if !isMedicalRecordOrderRequester(record, getAuthenticatedUserID(c)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya pengorder yang dapat membatalkan order resep ini"})
		return
	}

	switch normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) {
	case "", prescriptionWorkflowStatusDraft:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep belum dikirim ke farmasi"})
		return
	case prescriptionWorkflowStatusOrdered:
		// Can be cancelled.
	case prescriptionWorkflowStatusPreparing, prescriptionWorkflowStatusReady:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep tidak dapat dibatalkan karena farmasi sudah mulai memproses"})
		return
	case prescriptionWorkflowStatusDispensed:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep ini sudah selesai diproses"})
		return
	case prescriptionWorkflowStatusPrinted:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep luar yang sudah dicetak tidak dapat dibatalkan"})
		return
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status order resep tidak valid"})
		return
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"status":                       "cancelled",
		"prescription_workflow_status": prescriptionWorkflowStatusDraft,
		"prescription_ordered_at":      nil,
		"prescription_processed_at":    nil,
		"prescription_processed_by":    nil,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadPrescriptionRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order resep berhasil dibatalkan"})
}

func PreparePrescriptionOrder(c *gin.Context) {
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

	if message, ok := ensurePrescriptionRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	workflowStatus := normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus)
	if workflowStatus == prescriptionWorkflowStatusDraft {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep belum dikirim ke farmasi"})
		return
	}
	if workflowStatus == prescriptionWorkflowStatusPreparing {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep ini sedang disiapkan"})
		return
	}
	if workflowStatus == prescriptionWorkflowStatusReady {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep ini sudah siap diambil"})
		return
	}

	var req struct {
		PrescriptionReviewInitial string `json:"prescription_review_initial"`
	}
	_ = c.ShouldBindJSON(&req)

	// Simpan snapshot resep dokter asli saat resep pertama kali diterima/diproses farmasi
	_ = ensureDoctorPrescriptionSnapshot(&record, nil)

	now := time.Now()
	updates := map[string]interface{}{
		"prescription_workflow_status": prescriptionWorkflowStatusPreparing,
		"prescription_ordered_at":      gorm.Expr("COALESCE(prescription_ordered_at, ?)", now),
	}
	if strings.TrimSpace(req.PrescriptionReviewInitial) != "" {
		updates["prescription_review_initial"] = strings.TrimSpace(req.PrescriptionReviewInitial)
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadPrescriptionRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order resep masuk proses penyiapan"})
}

func ReturnPrescriptionOrder(c *gin.Context) {
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

	if message, ok := ensurePrescriptionRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) != prescriptionWorkflowStatusPreparing {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep hanya dapat dikembalikan saat sedang disiapkan farmasi"})
		return
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"prescription_workflow_status": prescriptionWorkflowStatusOrdered,
		"prescription_processed_at":    nil,
		"prescription_processed_by":    nil,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadPrescriptionRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order resep dikembalikan ke antrean farmasi"})
}

func ReadyPrescriptionOrder(c *gin.Context) {
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

	if message, ok := ensurePrescriptionRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	workflowStatus := normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus)
	if workflowStatus == prescriptionWorkflowStatusDraft {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep belum dikirim ke farmasi"})
		return
	}
	if workflowStatus == prescriptionWorkflowStatusOrdered {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mulai penyiapan obat terlebih dahulu"})
		return
	}
	if workflowStatus == prescriptionWorkflowStatusReady {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep ini sudah siap diambil"})
		return
	}

	stockIssues := collectPrescriptionStockIssues(record)
	if len(stockIssues) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": stockIssues[0]})
		return
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Update("prescription_workflow_status", prescriptionWorkflowStatusReady).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadPrescriptionRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order resep siap diambil pasien"})
}

func dispenseMedicineStockTx(tx *gorm.DB, medicineID uint, quantity int, referenceType string, referenceID uint, notes string, userID uint) (models.Medicine, error) {
	var medicine models.Medicine
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&medicine, medicineID).Error; err != nil {
		return medicine, err
	}
	if !medicine.IsActive {
		return medicine, fmt.Errorf("obat %s tidak aktif", medicine.Name)
	}
	if quantity < 1 {
		return medicine, fmt.Errorf("jumlah obat tidak valid")
	}
	if medicine.CurrentStock < quantity {
		return medicine, fmt.Errorf("stok %s tidak mencukupi. Tersedia %d", medicine.Name, medicine.CurrentStock)
	}

	previousStock := medicine.CurrentStock
	medicine.CurrentStock -= quantity
	if err := tx.Model(&medicine).Update("current_stock", medicine.CurrentStock).Error; err != nil {
		return medicine, err
	}

	movement := models.StockMovement{
		MedicineID:    medicine.ID,
		Type:          "out",
		Quantity:      quantity,
		PreviousStock: previousStock,
		NewStock:      medicine.CurrentStock,
		ReferenceType: referenceType,
		ReferenceID:   referenceID,
		Notes:         notes,
		CreatedBy:     userID,
	}
	if err := tx.Create(&movement).Error; err != nil {
		return medicine, err
	}

	return medicine, nil
}

func DispensePrescriptionOrder(c *gin.Context) {
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

	if message, ok := ensurePrescriptionRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	workflowStatus := normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus)
	if workflowStatus == prescriptionWorkflowStatusDraft {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep belum dikirim ke farmasi"})
		return
	}
	if workflowStatus == prescriptionWorkflowStatusOrdered {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep masih menunggu penyiapan farmasi"})
		return
	}
	if workflowStatus == prescriptionWorkflowStatusPreparing {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep belum ditandai siap diambil"})
		return
	}
	if workflowStatus != prescriptionWorkflowStatusReady {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status order resep belum siap untuk dispensing"})
		return
	}

	var req struct {
		PrescriptionReviewFinal string                   `json:"prescription_review_final"`
		CompoundDeductions      []CompoundDeductionInput `json:"compound_deductions"`
	}
	_ = c.ShouldBindJSON(&req)

	compoundDeductionMap := make(map[uint]int)
	for _, cd := range req.CompoundDeductions {
		if cd.CompoundItemID > 0 && cd.Quantity >= 0 {
			compoundDeductionMap[cd.CompoundItemID] = cd.Quantity
		}
	}

	userID := getAuthenticatedUserID(c)
	now := time.Now()
	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	var existingDispensingCount int64
	if err := tx.Model(&models.Dispensing{}).Where("medical_record_id = ?", record.ID).Count(&existingDispensingCount).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if existingDispensingCount > 0 {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep ini sudah pernah diproses farmasi"})
		return
	}

	for _, prescription := range record.Prescriptions {
		medicine, err := dispenseMedicineStockTx(
			tx,
			prescription.MedicineID,
			prescription.Quantity,
			"prescription",
			prescription.ID,
			fmt.Sprintf("Dispensing resep %s - %s", fallbackText(record.Visit.VisitNumber), fallbackText(record.Patient.FullName)),
			userID,
		)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		medicineID := medicine.ID
		prescriptionID := prescription.ID
		dispensing := models.Dispensing{
			VisitID:         record.VisitID,
			MedicalRecordID: record.ID,
			PrescriptionID:  &prescriptionID,
			MedicineID:      &medicineID,
			Quantity:        prescription.Quantity,
			DispensedBy:     userID,
			DispensedAt:     &now,
			Status:          "dispensed",
			Notes:           strings.TrimSpace(prescription.Instructions),
		}
		if err := tx.Create(&dispensing).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := tx.Model(&models.Prescription{}).Where("id = ?", prescription.ID).Update("status", "dispensed").Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	for _, compound := range record.PrescriptionCompounds {
		for _, ingredient := range compound.Items {
			qtyToDeduct := ingredient.Quantity
			if customQty, found := compoundDeductionMap[ingredient.ID]; found {
				qtyToDeduct = customQty
			}

			// Update kuantitas riil di item racikan bila farmasi mengubahnya
			if qtyToDeduct != ingredient.Quantity {
				if err := tx.Model(&models.PrescriptionCompoundItem{}).
					Where("id = ?", ingredient.ID).
					Update("quantity", qtyToDeduct).Error; err != nil {
					tx.Rollback()
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
			}

			if qtyToDeduct > 0 {
				if _, err := dispenseMedicineStockTx(
					tx,
					ingredient.MedicineID,
					qtyToDeduct,
					"prescription_compound",
					compound.ID,
					fmt.Sprintf("Dispensing racikan %s (%d dipotong) - %s", fallbackText(compound.Name), qtyToDeduct, fallbackText(record.Patient.FullName)),
					userID,
				); err != nil {
					tx.Rollback()
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
			}
		}

		compoundID := compound.ID
		dispensing := models.Dispensing{
			VisitID:                record.VisitID,
			MedicalRecordID:        record.ID,
			PrescriptionCompoundID: &compoundID,
			Quantity:               compound.OutputQuantity,
			DispensedBy:            userID,
			DispensedAt:            &now,
			Status:                 "dispensed",
			Notes:                  strings.TrimSpace(compound.Instructions),
		}
		if err := tx.Create(&dispensing).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := tx.Model(&models.PrescriptionCompound{}).Where("id = ?", compound.ID).Update("status", "dispensed").Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	recordUpdates := map[string]interface{}{
		"prescription_workflow_status": prescriptionWorkflowStatusDispensed,
		"prescription_ordered_at":      gorm.Expr("COALESCE(prescription_ordered_at, ?)", now),
		"prescription_processed_at":    &now,
		"prescription_processed_by":    userID,
	}
	if strings.TrimSpace(req.PrescriptionReviewFinal) != "" {
		recordUpdates["prescription_review_final"] = strings.TrimSpace(req.PrescriptionReviewFinal)
	}

	if err := tx.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(recordUpdates).Error; err != nil {
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

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Dispensing resep berhasil diproses"})
}

type CompoundDeductionInput struct {
	CompoundItemID uint `json:"compound_item_id"`
	Quantity       int  `json:"quantity"`
}

type UpdateCompoundDeductionsRequest struct {
	Items []CompoundDeductionInput `json:"items"`
}

func UpdatePrescriptionCompoundDeductions(c *gin.Context) {
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

	if message, ok := ensurePrescriptionRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	workflowStatus := normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus)
	if workflowStatus == prescriptionWorkflowStatusDispensed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep ini sudah selesai diproses (dispensed)"})
		return
	}

	var req UpdateCompoundDeductionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format data pengurangan stok tidak valid"})
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	for _, item := range req.Items {
		if item.CompoundItemID == 0 || item.Quantity < 0 {
			continue
		}
		if err := tx.Model(&models.PrescriptionCompoundItem{}).
			Where("id = ?", item.CompoundItemID).
			Update("quantity", item.Quantity).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
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

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Jumlah pemotongan bahan racikan berhasil diperbarui"})
}

type UpdatePrescriptionReviewRequest struct {
	PrescriptionReviewInitial *string `json:"prescription_review_initial"`
	PrescriptionReviewFinal   *string `json:"prescription_review_final"`
}

func UpdatePrescriptionReview(c *gin.Context) {
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

	var req UpdatePrescriptionReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.PrescriptionReviewInitial != nil {
		updates["prescription_review_initial"] = strings.TrimSpace(*req.PrescriptionReviewInitial)
	}
	if req.PrescriptionReviewFinal != nil {
		updates["prescription_review_final"] = strings.TrimSpace(*req.PrescriptionReviewFinal)
	}

	if len(updates) > 0 {
		if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	updatedRecord, err := loadPrescriptionRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Telaah resep berhasil disimpan"})
}
