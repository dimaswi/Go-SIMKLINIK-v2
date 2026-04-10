package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RadiologyOrderItemRequest struct {
	MedicalServiceID uint   `json:"medical_service_id" binding:"required"`
	Instructions     string `json:"instructions"`
}

type RadiologyOrderResultItemRequest struct {
	ID             uint                                   `json:"id" binding:"required"`
	Findings       string                                 `json:"findings"`
	Impression     string                                 `json:"impression"`
	Recommendation string                                 `json:"recommendation"`
	ResultNotes    string                                 `json:"result_notes"`
	Parameters     []RadiologyOrderResultParameterRequest `json:"parameters"`
}

type RadiologyOrderResultParameterRequest struct {
	ID          uint   `json:"id" binding:"required"`
	ResultValue string `json:"result_value"`
	ResultNotes string `json:"result_notes"`
	Flag        string `json:"flag"`
}

type RadiologyOrderResultRequest struct {
	Items []RadiologyOrderResultItemRequest `json:"items"`
}

func loadRadiologyRecord(recordID uint) (models.MedicalRecord, error) {
	var record models.MedicalRecord
	err := preloadMedicalRecordRelations(database.DB).
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Doctor").
		Preload("Visit.Polyclinic").
		First(&record, recordID).Error
	return record, err
}

func getRadiologyWorkflowStatus(record models.MedicalRecord) string {
	return normalizeSupportingOrderWorkflowStatus(record.RadiologyWorkflowStatus)
}

func ensureRadiologyRecordWritable(record models.MedicalRecord) (string, bool) {
	if record.Status == "final" {
		return "Rekam medis sudah final", false
	}
	if record.Status == "cancelled" {
		return "Rekam medis berstatus batal", false
	}
	if normalizeMedicalRecordSection(record.SectionType) != "radiology" {
		return "Aksi ini hanya tersedia pada entri order radiologi", false
	}
	if isSupportingOrderWorkflowLocked(record.RadiologyWorkflowStatus) {
		return "Order radiologi sudah dikirim atau diproses. Buat entri baru untuk revisi", false
	}
	return "", true
}

func ensureRadiologyRecordProcessable(record models.MedicalRecord) (string, bool) {
	if record.Status == "final" {
		return "Rekam medis sudah final", false
	}
	if record.Status == "cancelled" {
		return "Rekam medis berstatus batal", false
	}
	if normalizeMedicalRecordSection(record.SectionType) != "radiology" {
		return "Aksi radiologi hanya tersedia pada entri order radiologi", false
	}
	if record.Visit.Status == "cancelled" {
		return "Kunjungan sudah dibatalkan", false
	}
	if len(record.RadiologyOrderItems) == 0 {
		return "Order radiologi belum memiliki item pemeriksaan", false
	}
	return "", true
}

func ensureRadiologyRecordItemManageable(record models.MedicalRecord) (string, bool) {
	if record.Status == "final" {
		return "Rekam medis sudah final", false
	}
	if record.Status == "cancelled" {
		return "Rekam medis berstatus batal", false
	}
	if normalizeMedicalRecordSection(record.SectionType) != "radiology" {
		return "Aksi ini hanya tersedia pada entri order radiologi", false
	}

	switch getRadiologyWorkflowStatus(record) {
	case "", supportingOrderWorkflowStatusDraft, supportingOrderWorkflowStatusPreparing:
		return "", true
	case supportingOrderWorkflowStatusOrdered:
		return "Terima order radiologi terlebih dahulu sebelum mengubah item", false
	default:
		return "Order radiologi sudah selesai dan tidak bisa diubah", false
	}
}

func isRadiologyProcessAddedItem(record models.MedicalRecord, item models.RadiologyOrderItem) bool {
	if record.RadiologyOrderedAt == nil || record.RadiologyOrderedAt.IsZero() {
		return false
	}
	if item.CreatedAt.IsZero() {
		return false
	}
	return item.CreatedAt.After(*record.RadiologyOrderedAt)
}

func hasRadiologySavedResults(record models.MedicalRecord) bool {
	for _, item := range record.RadiologyOrderItems {
		if item.ResultDate != nil || item.ResultBy != nil || strings.TrimSpace(item.Findings) != "" || strings.TrimSpace(item.Impression) != "" || strings.TrimSpace(item.Recommendation) != "" {
			return true
		}

		for _, parameter := range item.ParameterResults {
			if parameter.ResultDate != nil || parameter.ResultBy != nil || strings.TrimSpace(parameter.ResultValue) != "" {
				return true
			}
		}
	}

	return false
}

func preloadRadiologyOrderRelations(query *gorm.DB) *gorm.DB {
	return query.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		Preload("RadiologyOrderItems").
		Preload("RadiologyOrderItems.MedicalService").
		Preload("RadiologyOrderItems.MedicalService.Category").
		Preload("RadiologyOrderItems.MedicalService.Parameters", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("RadiologyOrderItems.ParameterResults", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("RadiologyOrderItems.ParameterResults.MedicalServiceParameter").
		Preload("RadiologyOrderItems.ParameterResults.ResultByUser").
		Preload("RadiologyOrderItems.ResultByUser").
		Preload("RadiologyProcessor")
}

func isRadiologyService(service models.MedicalService) bool {
	if resolveMedicalServiceDomain(service.ServiceDomain) == medicalServiceDomainRadiology {
		return true
	}

	categoryName := strings.ToLower(strings.TrimSpace(service.Category.Name))
	return categoryName == "radiologi" || categoryName == "radiology"
}

func GetRadiologyOrders(c *gin.Context) {
	var records []models.MedicalRecord
	query := preloadRadiologyOrderRelations(database.DB).
		Where("medical_records.section_type = ?", "radiology").
		Where("medical_records.radiology_workflow_status IN ?", []string{supportingOrderWorkflowStatusOrdered, supportingOrderWorkflowStatusPreparing, supportingOrderWorkflowStatusCompleted}).
		Order("medical_records.radiology_ordered_at DESC NULLS LAST").
		Order("medical_records.created_at DESC")

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		like := "%" + q + "%"
		query = query.Joins("JOIN patients ON patients.id = medical_records.patient_id").
			Joins("JOIN visits ON visits.id = medical_records.visit_id").
			Where("patients.full_name ILIKE ? OR patients.medical_record_number ILIKE ? OR visits.visit_number ILIKE ?", like, like, like)
	}

	if workflowStatus := normalizeSupportingOrderWorkflowStatus(c.Query("radiology_workflow_status")); workflowStatus != "" {
		query = query.Where("medical_records.radiology_workflow_status = ?", workflowStatus)
	}

	if polyclinicID := c.Query("polyclinic_id"); polyclinicID != "" {
		query = query.Where("medical_records.polyclinic_id = ?", polyclinicID)
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

	c.JSON(http.StatusOK, gin.H{"data": records, "total": total, "page": page, "per_page": perPage})
}

func AddRadiologyOrderItem(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if message, ok := ensureRadiologyRecordItemManageable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var req RadiologyOrderItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var service models.MedicalService
	if err := database.DB.Preload("Category").Preload("Parameters", func(db *gorm.DB) *gorm.DB {
		return db.Order("sort_order ASC").Order("id ASC")
	}).First(&service, req.MedicalServiceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pemeriksaan radiologi tidak ditemukan"})
		return
	}
	if !service.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pemeriksaan radiologi tidak aktif"})
		return
	}
	if !isRadiologyService(service) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Layanan yang dipilih bukan layanan radiologi"})
		return
	}

	item := models.RadiologyOrderItem{
		MedicalRecordID:     uint(recordID),
		MedicalServiceID:    req.MedicalServiceID,
		ServiceCodeSnapshot: strings.TrimSpace(service.Code),
		ServiceNameSnapshot: strings.TrimSpace(service.Name),
		TemplateSnapshot:    strings.TrimSpace(service.Description),
		Instructions:        strings.TrimSpace(req.Instructions),
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Create(&item).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(service.Parameters) > 0 {
		parameterResults := make([]models.RadiologyOrderParameterResult, 0, len(service.Parameters))
		for _, parameter := range service.Parameters {
			parameterID := parameter.ID
			parameterResults = append(parameterResults, models.RadiologyOrderParameterResult{
				RadiologyOrderItemID:      item.ID,
				MedicalServiceParameterID: &parameterID,
				ParameterCodeSnapshot:     strings.TrimSpace(parameter.Code),
				ParameterNameSnapshot:     strings.TrimSpace(parameter.Name),
				InputTypeSnapshot:         strings.TrimSpace(parameter.InputType),
				UnitSnapshot:              strings.TrimSpace(parameter.Unit),
				ReferenceValueSnapshot:    selectLabReferenceValue(record.Patient.Gender, parameter.ReferenceValueMale, parameter.ReferenceValueFemale),
				SortOrder:                 parameter.SortOrder,
				IsRequired:                parameter.IsRequired,
			})
		}

		if len(parameterResults) > 0 {
			if err := tx.Create(&parameterResults).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadRadiologyRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": updatedRecord, "message": "Item radiologi berhasil ditambahkan"})
}

func DeleteRadiologyOrderItem(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	itemID, err := strconv.Atoi(c.Param("itemId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid item ID"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if message, ok := ensureRadiologyRecordItemManageable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var item models.RadiologyOrderItem
	if err := database.DB.Where("id = ? AND medical_record_id = ?", itemID, recordID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item radiologi tidak ditemukan"})
		return
	}
	if getRadiologyWorkflowStatus(record) == supportingOrderWorkflowStatusPreparing && !isRadiologyProcessAddedItem(record, item) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya tindakan radiologi yang ditambahkan manual oleh petugas yang dapat dihapus pada tahap proses"})
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Where("radiology_order_item_id = ?", item.ID).Delete(&models.RadiologyOrderParameterResult{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Where("id = ? AND medical_record_id = ?", itemID, recordID).Delete(&models.RadiologyOrderItem{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadRadiologyRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Item radiologi berhasil dihapus"})
}

func SubmitRadiologyOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if message, ok := ensureRadiologyRecordWritable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if len(record.RadiologyOrderItems) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order radiologi belum memiliki item pemeriksaan"})
		return
	}

	now := time.Now()
	currentUserID := getAuthenticatedUserID(c)
	var orderedBy interface{}
	if currentUserID != 0 {
		orderedBy = currentUserID
	}
	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"status":                    "draft",
		"radiology_workflow_status": supportingOrderWorkflowStatusOrdered,
		"radiology_ordered_at":      &now,
		"radiology_ordered_by":      orderedBy,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadRadiologyRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order radiologi berhasil dikirim"})
}

func CancelRadiologyOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}
	if normalizeMedicalRecordSection(record.SectionType) != "radiology" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Aksi ini hanya tersedia pada entri order radiologi"})
		return
	}
	if record.Visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah dibatalkan"})
		return
	}
	if !isMedicalRecordOrderRequester(record, getAuthenticatedUserID(c)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya pengorder yang dapat membatalkan order radiologi ini"})
		return
	}

	switch getRadiologyWorkflowStatus(record) {
	case "", supportingOrderWorkflowStatusDraft:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order radiologi belum dikirim"})
		return
	case supportingOrderWorkflowStatusOrdered:
		// Can be cancelled.
	case supportingOrderWorkflowStatusPreparing, supportingOrderWorkflowStatusCompleted:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order radiologi tidak dapat dibatalkan karena unit sudah mulai memproses"})
		return
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status order radiologi tidak valid"})
		return
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"status":                    "cancelled",
		"radiology_workflow_status": supportingOrderWorkflowStatusDraft,
		"radiology_ordered_at":      nil,
		"radiology_processed_at":    nil,
		"radiology_processed_by":    nil,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadRadiologyRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order radiologi berhasil dibatalkan"})
}

func PrepareRadiologyOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order radiologi tidak ditemukan"})
		return
	}

	if message, ok := ensureRadiologyRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if getRadiologyWorkflowStatus(record) != supportingOrderWorkflowStatusOrdered {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order radiologi hanya dapat diterima saat status masih menunggu"})
		return
	}

	now := time.Now()
	userID := getAuthenticatedUserID(c)
	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"radiology_workflow_status": supportingOrderWorkflowStatusPreparing,
		"radiology_processed_at":    &now,
		"radiology_processed_by":    userID,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadRadiologyRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order radiologi masuk proses pengerjaan"})
}

func ReturnRadiologyOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order radiologi tidak ditemukan"})
		return
	}

	if message, ok := ensureRadiologyRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if getRadiologyWorkflowStatus(record) != supportingOrderWorkflowStatusPreparing {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order radiologi hanya dapat dikembalikan saat sedang diproses"})
		return
	}
	if hasRadiologySavedResults(record) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order radiologi tidak dapat dikembalikan karena hasil sudah pernah disimpan"})
		return
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"radiology_workflow_status": supportingOrderWorkflowStatusOrdered,
		"radiology_processed_at":    nil,
		"radiology_processed_by":    nil,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadRadiologyRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order radiologi dikembalikan ke antrean unit"})
}

func UpdateRadiologyOrderResults(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order radiologi tidak ditemukan"})
		return
	}

	if message, ok := ensureRadiologyRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if getRadiologyWorkflowStatus(record) != supportingOrderWorkflowStatusPreparing {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hasil radiologi hanya dapat diisi saat order sedang diproses"})
		return
	}

	var req RadiologyOrderResultRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tidak ada hasil yang dikirim"})
		return
	}

	now := time.Now()
	userID := getAuthenticatedUserID(c)
	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	for _, item := range req.Items {
		updates := map[string]interface{}{
			"findings":       strings.TrimSpace(item.Findings),
			"impression":     strings.TrimSpace(item.Impression),
			"recommendation": strings.TrimSpace(item.Recommendation),
			"result_notes":   "",
			"result_date":    &now,
			"result_by":      userID,
		}
		if err := tx.Model(&models.RadiologyOrderItem{}).
			Where("id = ? AND medical_record_id = ?", item.ID, record.ID).
			Updates(updates).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		for _, parameter := range item.Parameters {
			parameterUpdates := map[string]interface{}{
				"result_value": strings.TrimSpace(parameter.ResultValue),
				"result_notes": "",
				"flag":         "",
				"result_date":  &now,
				"result_by":    userID,
			}
			if err := tx.Model(&models.RadiologyOrderParameterResult{}).
				Where("id = ? AND radiology_order_item_id = ?", parameter.ID, item.ID).
				Updates(parameterUpdates).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadRadiologyRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Hasil radiologi berhasil diperbarui"})
}

func CompleteRadiologyOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order radiologi tidak ditemukan"})
		return
	}

	if message, ok := ensureRadiologyRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if getRadiologyWorkflowStatus(record) != supportingOrderWorkflowStatusPreparing {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order radiologi hanya dapat diselesaikan saat sedang diproses"})
		return
	}

	for _, item := range record.RadiologyOrderItems {
		if len(item.ParameterResults) > 0 {
			for _, parameter := range item.ParameterResults {
				if parameter.IsRequired && strings.TrimSpace(parameter.ResultValue) == "" {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Lengkapi seluruh parameter hasil radiologi sebelum menandai order selesai"})
					return
				}
			}
			continue
		}

		if strings.TrimSpace(item.Findings) == "" && strings.TrimSpace(item.Impression) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Lengkapi hasil seluruh item radiologi sebelum menandai order selesai"})
			return
		}
	}

	now := time.Now()
	userID := getAuthenticatedUserID(c)
	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"radiology_workflow_status": supportingOrderWorkflowStatusCompleted,
		"radiology_processed_at":    &now,
		"radiology_processed_by":    userID,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadRadiologyRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order radiologi selesai diproses"})
}
