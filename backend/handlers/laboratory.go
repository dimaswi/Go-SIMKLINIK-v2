package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	supportingOrderWorkflowStatusDraft     = "draft"
	supportingOrderWorkflowStatusOrdered   = "ordered"
	supportingOrderWorkflowStatusPreparing = "preparing"
	supportingOrderWorkflowStatusCompleted = "completed"
)

var labReferenceNumberPattern = regexp.MustCompile(`[-+]?\d[\d.,]*`)

type LaboratoryOrderItemRequest struct {
	MedicalServiceID   uint   `json:"medical_service_id"`
	SpecimenTemplateID *uint  `json:"specimen_template_id"`
	Instructions       string `json:"instructions"`
}

type LaboratoryOrderResultParameterRequest struct {
	ID          uint   `json:"id" binding:"required"`
	ResultValue string `json:"result_value"`
	ResultNotes string `json:"result_notes"`
	Flag        string `json:"flag"`
}

type LaboratoryOrderResultItemRequest struct {
	ID          uint                                    `json:"id" binding:"required"`
	ResultValue string                                  `json:"result_value"`
	ResultNotes string                                  `json:"result_notes"`
	Flag        string                                  `json:"flag"`
	Parameters  []LaboratoryOrderResultParameterRequest `json:"parameters"`
}

type LaboratoryOrderResultRequest struct {
	Items []LaboratoryOrderResultItemRequest `json:"items"`
}

func normalizeSupportingOrderWorkflowStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case supportingOrderWorkflowStatusDraft:
		return supportingOrderWorkflowStatusDraft
	case supportingOrderWorkflowStatusOrdered:
		return supportingOrderWorkflowStatusOrdered
	case supportingOrderWorkflowStatusPreparing:
		return supportingOrderWorkflowStatusPreparing
	case supportingOrderWorkflowStatusCompleted:
		return supportingOrderWorkflowStatusCompleted
	default:
		return ""
	}
}

func isSupportingOrderWorkflowLocked(status string) bool {
	normalized := normalizeSupportingOrderWorkflowStatus(status)
	return normalized != "" && normalized != supportingOrderWorkflowStatusDraft
}

func loadLaboratoryRecord(recordID uint) (models.MedicalRecord, error) {
	var record models.MedicalRecord
	err := preloadMedicalRecordRelations(database.DB).
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Doctor").
		Preload("Visit.Polyclinic").
		First(&record, recordID).Error
	return record, err
}

func getLaboratoryWorkflowStatus(record models.MedicalRecord) string {
	return normalizeSupportingOrderWorkflowStatus(record.LaboratoryWorkflowStatus)
}

func ensureLaboratoryRecordWritable(record models.MedicalRecord) (string, bool) {
	if record.Status == "final" {
		return "Rekam medis sudah final", false
	}
	if record.Status == "cancelled" {
		return "Rekam medis berstatus batal", false
	}
	if normalizeMedicalRecordSection(record.SectionType) != "laboratory" {
		return "Aksi ini hanya tersedia pada entri order laboratorium", false
	}
	if isSupportingOrderWorkflowLocked(record.LaboratoryWorkflowStatus) {
		return "Order laboratorium sudah dikirim atau diproses. Buat entri baru untuk revisi", false
	}
	return "", true
}

func ensureLaboratoryRecordProcessable(record models.MedicalRecord) (string, bool) {
	if record.Status == "final" {
		return "Rekam medis sudah final", false
	}
	if record.Status == "cancelled" {
		return "Rekam medis berstatus batal", false
	}
	if normalizeMedicalRecordSection(record.SectionType) != "laboratory" {
		return "Aksi laboratorium hanya tersedia pada entri order laboratorium", false
	}
	if record.Visit.Status == "cancelled" {
		return "Kunjungan sudah dibatalkan", false
	}
	if len(record.LaboratoryOrderItems) == 0 {
		return "Order laboratorium belum memiliki item pemeriksaan", false
	}
	return "", true
}

func ensureLaboratoryRecordItemManageable(record models.MedicalRecord) (string, bool) {
	if record.Status == "final" {
		return "Rekam medis sudah final", false
	}
	if record.Status == "cancelled" {
		return "Rekam medis berstatus batal", false
	}
	if normalizeMedicalRecordSection(record.SectionType) != "laboratory" {
		return "Aksi ini hanya tersedia pada entri order laboratorium", false
	}

	switch getLaboratoryWorkflowStatus(record) {
	case "", supportingOrderWorkflowStatusDraft, supportingOrderWorkflowStatusPreparing:
		return "", true
	case supportingOrderWorkflowStatusOrdered:
		return "Terima order laboratorium terlebih dahulu sebelum mengubah item", false
	default:
		return "Order laboratorium sudah selesai dan tidak bisa diubah", false
	}
}

func isLaboratoryProcessAddedItem(record models.MedicalRecord, item models.LaboratoryOrderItem) bool {
	if record.LaboratoryOrderedAt == nil || record.LaboratoryOrderedAt.IsZero() {
		return false
	}
	if item.CreatedAt.IsZero() {
		return false
	}
	return item.CreatedAt.After(*record.LaboratoryOrderedAt)
}

func hasLaboratorySavedResults(record models.MedicalRecord) bool {
	for _, item := range record.LaboratoryOrderItems {
		if item.ResultDate != nil || item.ResultBy != nil || strings.TrimSpace(item.ResultValue) != "" {
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

func preloadLaboratoryOrderRelations(query *gorm.DB) *gorm.DB {
	return query.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		Preload("LaboratoryOrderItems").
		Preload("LaboratoryOrderItems.MedicalService").
		Preload("LaboratoryOrderItems.MedicalService.Category").
		Preload("LaboratoryOrderItems.Specimen").
		Preload("LaboratoryOrderItems.Specimen.SpecimenTemplate").
		Preload("LaboratoryOrderItems.MedicalService.Parameters", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("LaboratoryOrderItems.ParameterResults", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("LaboratoryOrderItems.ParameterResults.MedicalServiceParameter").
		Preload("LaboratoryOrderItems.ParameterResults.ResultByUser").
		Preload("LaboratoryOrderItems.ResultByUser").
		Preload("LaboratoryProcessor")
}

func selectLabReferenceValue(patientGender, maleValue, femaleValue string) string {
	switch strings.ToLower(strings.TrimSpace(patientGender)) {
	case "p", "f", "female", "perempuan":
		if strings.TrimSpace(femaleValue) != "" {
			return strings.TrimSpace(femaleValue)
		}
	}
	if strings.TrimSpace(maleValue) != "" {
		return strings.TrimSpace(maleValue)
	}
	return strings.TrimSpace(femaleValue)
}

func selectLabNormalValue(patientGender string, test models.LabTest) string {
	return selectLabReferenceValue(patientGender, test.NormalValueMale, test.NormalValueFemale)
}

func normalizeComparableReferenceText(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(value))), " ")
}

func parseFlexibleReferenceNumber(value string) (float64, bool) {
	token := strings.TrimSpace(value)
	if token == "" {
		return 0, false
	}

	token = strings.TrimLeft(token, "<>~=≤≥")
	token = strings.TrimSpace(strings.Trim(token, "%"))
	if token == "" {
		return 0, false
	}

	for _, character := range token {
		if (character < '0' || character > '9') && character != '.' && character != ',' && character != '-' && character != '+' {
			return 0, false
		}
	}

	switch {
	case strings.Contains(token, ",") && strings.Contains(token, "."):
		if strings.LastIndex(token, ",") > strings.LastIndex(token, ".") {
			token = strings.ReplaceAll(token, ".", "")
			token = strings.ReplaceAll(token, ",", ".")
		} else {
			token = strings.ReplaceAll(token, ",", "")
		}
	case strings.Count(token, ",") > 1:
		token = strings.ReplaceAll(token, ",", "")
	case strings.Count(token, ",") == 1:
		commaIndex := strings.LastIndex(token, ",")
		digitsAfter := len(token) - commaIndex - 1
		if digitsAfter == 3 {
			token = strings.ReplaceAll(token, ",", "")
		} else {
			token = strings.ReplaceAll(token, ",", ".")
		}
	case strings.Count(token, ".") > 1:
		parts := strings.Split(token, ".")
		lastPart := parts[len(parts)-1]
		if len(lastPart) <= 2 {
			token = strings.Join(parts[:len(parts)-1], "") + "." + lastPart
		} else {
			token = strings.Join(parts, "")
		}
	case strings.Count(token, ".") == 1:
		dotIndex := strings.LastIndex(token, ".")
		digitsAfter := len(token) - dotIndex - 1
		if digitsAfter == 3 {
			token = strings.ReplaceAll(token, ".", "")
		}
	}

	parsed, err := strconv.ParseFloat(token, 64)
	if err != nil {
		return 0, false
	}

	return parsed, true
}

func extractReferenceNumbers(value string) []float64 {
	matches := labReferenceNumberPattern.FindAllString(value, -1)
	numbers := make([]float64, 0, len(matches))
	for _, match := range matches {
		if parsed, ok := parseFlexibleReferenceNumber(match); ok {
			numbers = append(numbers, parsed)
		}
	}
	return numbers
}

func calculateLaboratoryFlag(resultValue, referenceValue string) string {
	normalizedResult := strings.TrimSpace(resultValue)
	normalizedReference := strings.TrimSpace(referenceValue)
	if normalizedResult == "" || normalizedReference == "" {
		return ""
	}

	resultNumber, resultIsNumber := parseFlexibleReferenceNumber(normalizedResult)
	if resultIsNumber {
		referenceNumbers := extractReferenceNumbers(normalizedReference)
		referenceText := normalizeComparableReferenceText(normalizedReference)

		if len(referenceNumbers) >= 2 && (strings.Contains(referenceText, "-") || strings.Contains(referenceText, "–") || strings.Contains(referenceText, "sampai")) {
			lowerBound := referenceNumbers[0]
			upperBound := referenceNumbers[1]
			if resultNumber < lowerBound {
				return "rendah"
			}
			if resultNumber > upperBound {
				return "tinggi"
			}
			return "normal"
		}

		if len(referenceNumbers) >= 1 {
			threshold := referenceNumbers[0]
			switch {
			case strings.HasPrefix(referenceText, "<=") || strings.HasPrefix(referenceText, "≤"):
				if resultNumber <= threshold {
					return "normal"
				}
				return "tinggi"
			case strings.HasPrefix(referenceText, "<"):
				if resultNumber < threshold {
					return "normal"
				}
				return "tinggi"
			case strings.HasPrefix(referenceText, ">=") || strings.HasPrefix(referenceText, "≥"):
				if resultNumber >= threshold {
					return "normal"
				}
				return "rendah"
			case strings.HasPrefix(referenceText, ">"):
				if resultNumber > threshold {
					return "normal"
				}
				return "rendah"
			case len(referenceNumbers) == 1:
				if resultNumber < threshold {
					return "rendah"
				}
				if resultNumber > threshold {
					return "tinggi"
				}
				return "normal"
			}
		}
	}

	if normalizeComparableReferenceText(normalizedResult) == normalizeComparableReferenceText(normalizedReference) {
		return "normal"
	}

	return "abnormal"
}

func isLaboratoryService(service models.MedicalService) bool {
	if resolveMedicalServiceDomain(service.ServiceDomain) == medicalServiceDomainLaboratory {
		return true
	}

	categoryName := strings.ToLower(strings.TrimSpace(service.Category.Name))
	return categoryName == "laboratorium" || categoryName == "laboratory"
}

func resolveLaboratorySpecimenTemplate(service models.MedicalService, requestedTemplateID *uint) (*models.SpecimenTemplate, error) {
	options := service.SpecimenOptions
	if len(options) == 0 {
		return nil, nil
	}

	if requestedTemplateID != nil && *requestedTemplateID != 0 {
		for _, option := range options {
			if option.SpecimenTemplateID == *requestedTemplateID {
				template := option.SpecimenTemplate
				return &template, nil
			}
		}
		return nil, fmt.Errorf("template specimen tidak tersedia untuk layanan laboratorium ini")
	}

	for _, option := range options {
		if option.IsDefault {
			template := option.SpecimenTemplate
			return &template, nil
		}
	}

	template := options[0].SpecimenTemplate
	return &template, nil
}

func GetLabTests(c *gin.Context) {
	var tests []models.LabTest
	query := database.DB.
		Preload("Category").
		Preload("Parameters", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Order("sort_order ASC").
		Order("name ASC")

	if search := strings.TrimSpace(c.Query("q")); search != "" {
		like := "%" + search + "%"
		query = query.Where("name ILIKE ? OR code ILIKE ?", like, like)
	}

	if categoryID := c.Query("category_id"); categoryID != "" {
		query = query.Where("category_id = ?", categoryID)
	}

	if isActive := c.Query("is_active"); isActive != "" {
		query = query.Where("is_active = ?", isActive == "true")
	}

	if err := query.Find(&tests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": tests})
}

func GetLaboratoryOrders(c *gin.Context) {
	var records []models.MedicalRecord
	query := preloadLaboratoryOrderRelations(database.DB).
		Where("medical_records.section_type = ?", "laboratory").
		Where("medical_records.laboratory_workflow_status IN ?", []string{supportingOrderWorkflowStatusOrdered, supportingOrderWorkflowStatusPreparing, supportingOrderWorkflowStatusCompleted}).
		Order("medical_records.laboratory_ordered_at DESC NULLS LAST").
		Order("medical_records.created_at DESC")

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		like := "%" + q + "%"
		query = query.Joins("JOIN patients ON patients.id = medical_records.patient_id").
			Joins("JOIN visits ON visits.id = medical_records.visit_id").
			Where("patients.full_name ILIKE ? OR patients.medical_record_number ILIKE ? OR visits.visit_number ILIKE ?", like, like, like)
	}

	if workflowStatus := normalizeSupportingOrderWorkflowStatus(c.Query("laboratory_workflow_status")); workflowStatus != "" {
		query = query.Where("medical_records.laboratory_workflow_status = ?", workflowStatus)
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

func AddLaboratoryOrderItem(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if message, ok := ensureLaboratoryRecordItemManageable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var req LaboratoryOrderItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.MedicalServiceID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pemeriksaan laboratorium wajib dipilih dari master tindakan"})
		return
	}

	var service models.MedicalService
	if err := database.DB.Preload("Category").Preload("SpecimenOptions", func(db *gorm.DB) *gorm.DB {
		return db.Order("is_default DESC").Order("sort_order ASC").Order("id ASC")
	}).Preload("SpecimenOptions.SpecimenTemplate").Preload("Parameters", func(db *gorm.DB) *gorm.DB {
		return db.Order("sort_order ASC").Order("id ASC")
	}).First(&service, req.MedicalServiceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pemeriksaan laboratorium tidak ditemukan"})
		return
	}
	if !service.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pemeriksaan laboratorium tidak aktif"})
		return
	}
	if !isLaboratoryService(service) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Layanan yang dipilih bukan layanan laboratorium"})
		return
	}

	selectedSpecimenTemplate, specimenErr := resolveLaboratorySpecimenTemplate(service, req.SpecimenTemplateID)
	if specimenErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": specimenErr.Error()})
		return
	}

	item := models.LaboratoryOrderItem{
		MedicalRecordID:     uint(recordID),
		MedicalServiceID:    req.MedicalServiceID,
		TestCodeSnapshot:    strings.TrimSpace(service.Code),
		TestNameSnapshot:    strings.TrimSpace(service.Name),
		Instructions:        strings.TrimSpace(req.Instructions),
		UnitSnapshot:        "",
		NormalValueSnapshot: "",
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

	if selectedSpecimenTemplate != nil {
		specimen := models.LaboratoryOrderSpecimen{
			LaboratoryOrderItemID:   item.ID,
			SpecimenTemplateID:      &selectedSpecimenTemplate.ID,
			TemplateCodeSnapshot:    strings.TrimSpace(selectedSpecimenTemplate.Code),
			TemplateNameSnapshot:    strings.TrimSpace(selectedSpecimenTemplate.Name),
			TypeSystem:              strings.TrimSpace(selectedSpecimenTemplate.TypeSystem),
			TypeCode:                strings.TrimSpace(selectedSpecimenTemplate.TypeCode),
			TypeDisplay:             strings.TrimSpace(selectedSpecimenTemplate.TypeDisplay),
			CollectionMethodSystem:  strings.TrimSpace(selectedSpecimenTemplate.CollectionMethodSystem),
			CollectionMethodCode:    strings.TrimSpace(selectedSpecimenTemplate.CollectionMethodCode),
			CollectionMethodDisplay: strings.TrimSpace(selectedSpecimenTemplate.CollectionMethodDisplay),
			Notes:                   strings.TrimSpace(selectedSpecimenTemplate.Description),
		}
		if err := tx.Create(&specimen).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if len(service.Parameters) > 0 {
		parameterResults := make([]models.LaboratoryOrderParameterResult, 0, len(service.Parameters))
		for _, parameter := range service.Parameters {
			parameterID := parameter.ID
			parameterResults = append(parameterResults, models.LaboratoryOrderParameterResult{
				LaboratoryOrderItemID:     item.ID,
				MedicalServiceParameterID: &parameterID,
				ParameterCodeSnapshot:     strings.TrimSpace(parameter.Code),
				ParameterNameSnapshot:     strings.TrimSpace(parameter.Name),
				InputTypeSnapshot:         strings.TrimSpace(parameter.InputType),
				UnitSnapshot:              strings.TrimSpace(parameter.Unit),
				NormalValueSnapshot:       selectLabReferenceValue(record.Patient.Gender, parameter.ReferenceValueMale, parameter.ReferenceValueFemale),
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

	updatedRecord, err := loadLaboratoryRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": updatedRecord, "message": "Item laboratorium berhasil ditambahkan"})
}

func DeleteLaboratoryOrderItem(c *gin.Context) {
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

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if message, ok := ensureLaboratoryRecordItemManageable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	var item models.LaboratoryOrderItem
	if err := database.DB.Where("id = ? AND medical_record_id = ?", itemID, recordID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item laboratorium tidak ditemukan"})
		return
	}
	if getLaboratoryWorkflowStatus(record) == supportingOrderWorkflowStatusPreparing && !isLaboratoryProcessAddedItem(record, item) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya tindakan laboratorium yang ditambahkan manual oleh petugas yang dapat dihapus pada tahap proses"})
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Where("laboratory_order_item_id = ?", item.ID).Delete(&models.LaboratoryOrderParameterResult{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Where("id = ? AND medical_record_id = ?", itemID, recordID).Delete(&models.LaboratoryOrderItem{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadLaboratoryRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Item laboratorium berhasil dihapus"})
}

func SubmitLaboratoryOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if message, ok := ensureLaboratoryRecordWritable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if len(record.LaboratoryOrderItems) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order laboratorium belum memiliki item pemeriksaan"})
		return
	}

	now := time.Now()
	currentUserID := getAuthenticatedUserID(c)
	var orderedBy interface{}
	if currentUserID != 0 {
		orderedBy = currentUserID
	}
	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"status":                     "draft",
		"laboratory_workflow_status": supportingOrderWorkflowStatusOrdered,
		"laboratory_ordered_at":      &now,
		"laboratory_ordered_by":      orderedBy,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadLaboratoryRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order laboratorium berhasil dikirim"})
}

func CancelLaboratoryOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}
	if normalizeMedicalRecordSection(record.SectionType) != "laboratory" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Aksi ini hanya tersedia pada entri order laboratorium"})
		return
	}
	if record.Visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah dibatalkan"})
		return
	}
	if !isMedicalRecordOrderRequester(record, getAuthenticatedUserID(c)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya pengorder yang dapat membatalkan order laboratorium ini"})
		return
	}

	switch getLaboratoryWorkflowStatus(record) {
	case "", supportingOrderWorkflowStatusDraft:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order laboratorium belum dikirim"})
		return
	case supportingOrderWorkflowStatusOrdered:
		// Can be cancelled.
	case supportingOrderWorkflowStatusPreparing, supportingOrderWorkflowStatusCompleted:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order laboratorium tidak dapat dibatalkan karena unit sudah mulai memproses"})
		return
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status order laboratorium tidak valid"})
		return
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"status":                     "cancelled",
		"laboratory_workflow_status": supportingOrderWorkflowStatusDraft,
		"laboratory_ordered_at":      nil,
		"laboratory_processed_at":    nil,
		"laboratory_processed_by":    nil,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadLaboratoryRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order laboratorium berhasil dibatalkan"})
}

func PrepareLaboratoryOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order laboratorium tidak ditemukan"})
		return
	}

	if message, ok := ensureLaboratoryRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if getLaboratoryWorkflowStatus(record) != supportingOrderWorkflowStatusOrdered {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order laboratorium hanya dapat diterima saat status masih menunggu"})
		return
	}

	now := time.Now()
	userID := getAuthenticatedUserID(c)
	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"laboratory_workflow_status": supportingOrderWorkflowStatusPreparing,
		"laboratory_processed_at":    &now,
		"laboratory_processed_by":    userID,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadLaboratoryRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order laboratorium masuk proses pengerjaan"})
}

func ReturnLaboratoryOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order laboratorium tidak ditemukan"})
		return
	}

	if message, ok := ensureLaboratoryRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if getLaboratoryWorkflowStatus(record) != supportingOrderWorkflowStatusPreparing {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order laboratorium hanya dapat dikembalikan saat sedang diproses"})
		return
	}
	if hasLaboratorySavedResults(record) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order laboratorium tidak dapat dikembalikan karena hasil sudah pernah disimpan"})
		return
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"laboratory_workflow_status": supportingOrderWorkflowStatusOrdered,
		"laboratory_processed_at":    nil,
		"laboratory_processed_by":    nil,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadLaboratoryRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order laboratorium dikembalikan ke antrean unit"})
}

func UpdateLaboratoryOrderResults(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order laboratorium tidak ditemukan"})
		return
	}

	if message, ok := ensureLaboratoryRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if getLaboratoryWorkflowStatus(record) != supportingOrderWorkflowStatusPreparing {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hasil laboratorium hanya dapat diisi saat order sedang diproses"})
		return
	}

	var req LaboratoryOrderResultRequest
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
	itemsByID := make(map[uint]models.LaboratoryOrderItem, len(record.LaboratoryOrderItems))
	parametersByID := make(map[uint]models.LaboratoryOrderParameterResult)
	for _, existingItem := range record.LaboratoryOrderItems {
		itemsByID[existingItem.ID] = existingItem
		for _, existingParameter := range existingItem.ParameterResults {
			parametersByID[existingParameter.ID] = existingParameter
		}
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	for _, item := range req.Items {
		existingItem, ok := itemsByID[item.ID]
		if !ok {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Item laboratorium tidak ditemukan pada order ini"})
			return
		}

		updates := map[string]interface{}{
			"result_value": strings.TrimSpace(item.ResultValue),
			"result_notes": "",
			"flag":         calculateLaboratoryFlag(item.ResultValue, existingItem.NormalValueSnapshot),
			"result_date":  &now,
			"result_by":    userID,
		}
		if err := tx.Model(&models.LaboratoryOrderItem{}).
			Where("id = ? AND medical_record_id = ?", item.ID, record.ID).
			Updates(updates).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		for _, parameter := range item.Parameters {
			existingParameter, ok := parametersByID[parameter.ID]
			if !ok {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "Parameter laboratorium tidak ditemukan pada order ini"})
				return
			}

			parameterUpdates := map[string]interface{}{
				"result_value": strings.TrimSpace(parameter.ResultValue),
				"result_notes": "",
				"flag":         calculateLaboratoryFlag(parameter.ResultValue, existingParameter.NormalValueSnapshot),
				"result_date":  &now,
				"result_by":    userID,
			}
			if err := tx.Model(&models.LaboratoryOrderParameterResult{}).
				Where("id = ? AND laboratory_order_item_id = ?", parameter.ID, item.ID).
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

	updatedRecord, err := loadLaboratoryRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Hasil laboratorium berhasil diperbarui"})
}

func CompleteLaboratoryOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order laboratorium tidak ditemukan"})
		return
	}

	if message, ok := ensureLaboratoryRecordProcessable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if getLaboratoryWorkflowStatus(record) != supportingOrderWorkflowStatusPreparing {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order laboratorium hanya dapat diselesaikan saat sedang diproses"})
		return
	}

	for _, item := range record.LaboratoryOrderItems {
		if len(item.ParameterResults) > 0 {
			for _, parameter := range item.ParameterResults {
				if parameter.IsRequired && strings.TrimSpace(parameter.ResultValue) == "" {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Lengkapi seluruh parameter hasil laboratorium sebelum menandai order selesai"})
					return
				}
			}
			continue
		}

		if strings.TrimSpace(item.ResultValue) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Lengkapi hasil seluruh item laboratorium sebelum menandai order selesai"})
			return
		}
	}

	now := time.Now()
	userID := getAuthenticatedUserID(c)
	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
		"laboratory_workflow_status": supportingOrderWorkflowStatusCompleted,
		"laboratory_processed_at":    &now,
		"laboratory_processed_by":    userID,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedRecord, err := loadLaboratoryRecord(record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": updatedRecord, "message": "Order laboratorium selesai diproses"})
}
