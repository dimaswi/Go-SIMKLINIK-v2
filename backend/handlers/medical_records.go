package handlers

import (
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ========================
// Medical Records CRUD
// ========================

var medicalRecordSections = map[string]string{
	"anamnesis":     "Anamnesis",
	"physical_exam": "Pemeriksaan Fisik",
	"assessment":    "Assessment",
	"prescription":  "Resep",
	"laboratory":    "Laboratorium",
	"radiology":     "Radiologi",
	"procedure":     "Tindakan",
	"outcome":       "Outcome",
}

const (
	medicalRecordSheetKeyInitialAssessmentMedical = "pengkajian-awal-medis"
	medicalRecordSheetKeyInitialAssessmentDental  = "pengkajian-awal-gigi"
	medicalRecordSheetKeySurat                    = "surat"
	medicalRecordEntryGroupPrefixMedical          = "pengkajian-awal"
	medicalRecordEntryGroupPrefixDental           = "pengkajian-gigi"
	medicalRecordEntryGroupPrefixSuratSakit       = "surat-sakit"
	medicalRecordEntryGroupPrefixSuratSehat       = "surat-sehat"
	medicalRecordEntryGroupPrefixSuratMCU         = "surat-mcu"
	medicalRecordEntryGroupPrefixSuratButaWarna   = "surat-buta-warna"
	medicalRecordEntryGroupPrefixSuratRujukan     = "surat-rujukan"
)

var medicalRecordInitialAssessmentSectionTypes = map[string]struct{}{
	"anamnesis":     {},
	"physical_exam": {},
	"assessment":    {},
}

var medicalRecordInitialAssessmentSheetPrefixes = map[string]string{
	medicalRecordSheetKeyInitialAssessmentMedical: medicalRecordEntryGroupPrefixMedical,
	medicalRecordSheetKeyInitialAssessmentDental:  medicalRecordEntryGroupPrefixDental,
	medicalRecordSheetKeySurat:                    medicalRecordEntryGroupPrefixSuratSakit,
}

var medicalRecordSuratTypeOrder = []string{
	medicalRecordEntryGroupPrefixSuratSakit,
	medicalRecordEntryGroupPrefixSuratSehat,
	medicalRecordEntryGroupPrefixSuratMCU,
	medicalRecordEntryGroupPrefixSuratButaWarna,
	medicalRecordEntryGroupPrefixSuratRujukan,
}

var medicalRecordSuratTypeLabels = map[string]string{
	medicalRecordEntryGroupPrefixSuratSakit:     "Surat Sakit",
	medicalRecordEntryGroupPrefixSuratSehat:     "Surat Sehat",
	medicalRecordEntryGroupPrefixSuratMCU:       "Surat MCU",
	medicalRecordEntryGroupPrefixSuratButaWarna: "Surat Buta Warna",
	medicalRecordEntryGroupPrefixSuratRujukan:   "Surat Rujukan",
}

var medicalRecordSuratTypeFileSlugs = map[string]string{
	medicalRecordEntryGroupPrefixSuratSakit:     "surat-sakit",
	medicalRecordEntryGroupPrefixSuratSehat:     "surat-sehat",
	medicalRecordEntryGroupPrefixSuratMCU:       "surat-mcu",
	medicalRecordEntryGroupPrefixSuratButaWarna: "surat-buta-warna",
	medicalRecordEntryGroupPrefixSuratRujukan:   "surat-rujukan",
}

func normalizeSuratTypeValue(value string) string {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	return strings.ReplaceAll(trimmed, " ", "-")
}

func inferSuratTypeFromEntryGroupKey(entryGroupKey string) string {
	normalized := normalizeSuratTypeValue(entryGroupKey)
	if normalized == "" {
		return ""
	}

	for _, prefix := range medicalRecordSuratTypeOrder {
		if normalized == prefix || strings.HasPrefix(normalized, prefix+"-") {
			return prefix
		}
	}

	return ""
}

func isValidSuratEntryGroupPrefix(prefix string) bool {
	normalized := normalizeSuratTypeValue(prefix)
	for _, item := range medicalRecordSuratTypeOrder {
		if normalized == item {
			return true
		}
	}

	return false
}

func getSuratTypeLabel(value string) string {
	normalized := normalizeSuratTypeValue(value)
	if !isValidSuratEntryGroupPrefix(normalized) {
		normalized = inferSuratTypeFromEntryGroupKey(value)
	}

	if label, exists := medicalRecordSuratTypeLabels[normalized]; exists {
		return label
	}

	return "Surat Keterangan"
}

func getSuratTypeFileSlug(value string) string {
	normalized := normalizeSuratTypeValue(value)
	if !isValidSuratEntryGroupPrefix(normalized) {
		normalized = inferSuratTypeFromEntryGroupKey(value)
	}

	if slug, exists := medicalRecordSuratTypeFileSlugs[normalized]; exists {
		return slug
	}

	return "surat-keterangan"
}

func normalizeMedicalRecordSection(section string) string {
	return strings.ToLower(strings.TrimSpace(section))
}

func isInitialAssessmentMedicalRecordSection(section string) bool {
	_, exists := medicalRecordInitialAssessmentSectionTypes[normalizeMedicalRecordSection(section)]
	return exists
}

func normalizeMedicalRecordSheetKey(sheetKey string) string {
	trimmedSheetKey := strings.ToLower(strings.TrimSpace(sheetKey))
	if _, exists := medicalRecordInitialAssessmentSheetPrefixes[trimmedSheetKey]; exists {
		return trimmedSheetKey
	}

	return ""
}

func inferInitialAssessmentSheetKeyFromEntryGroupKey(entryGroupKey string) string {
	trimmedEntryGroupKey := strings.ToLower(strings.TrimSpace(entryGroupKey))
	switch {
	case trimmedEntryGroupKey == "", trimmedEntryGroupKey == medicalRecordEntryGroupPrefixMedical, strings.HasPrefix(trimmedEntryGroupKey, medicalRecordEntryGroupPrefixMedical+"-"):
		return medicalRecordSheetKeyInitialAssessmentMedical
	case trimmedEntryGroupKey == medicalRecordEntryGroupPrefixDental, strings.HasPrefix(trimmedEntryGroupKey, medicalRecordEntryGroupPrefixDental+"-"):
		return medicalRecordSheetKeyInitialAssessmentDental
	case inferSuratTypeFromEntryGroupKey(trimmedEntryGroupKey) != "":
		return medicalRecordSheetKeySurat
	default:
		return ""
	}
}

func inferInitialAssessmentSheetKeyFromEntryGroupPrefix(entryGroupPrefix string) string {
	switch normalizeMedicalRecordEntryGroupPrefix(entryGroupPrefix) {
	case medicalRecordEntryGroupPrefixDental:
		return medicalRecordSheetKeyInitialAssessmentDental
	default:
		return medicalRecordSheetKeyInitialAssessmentMedical
	}
}

func resolveInitialAssessmentSheetKey(sheetKey string, entryGroupValue string) string {
	if normalizedSheetKey := normalizeMedicalRecordSheetKey(sheetKey); normalizedSheetKey != "" {
		return normalizedSheetKey
	}

	if inferredSheetKey := inferInitialAssessmentSheetKeyFromEntryGroupKey(entryGroupValue); inferredSheetKey != "" {
		return inferredSheetKey
	}

	return inferInitialAssessmentSheetKeyFromEntryGroupPrefix(entryGroupValue)
}

func resolveInitialAssessmentEntryGroupPrefix(sheetKey string, entryGroupPrefix string) string {
	normalizedEntryGroupPrefix := normalizeMedicalRecordEntryGroupPrefix(entryGroupPrefix)
	resolvedSheetKey := resolveInitialAssessmentSheetKey(sheetKey, entryGroupPrefix)
	if resolvedSheetKey == medicalRecordSheetKeySurat {
		if inferredSuratType := inferSuratTypeFromEntryGroupKey(normalizedEntryGroupPrefix); inferredSuratType != "" {
			return inferredSuratType
		}
		return medicalRecordEntryGroupPrefixSuratSakit
	}

	if prefix, exists := medicalRecordInitialAssessmentSheetPrefixes[resolvedSheetKey]; exists {
		return prefix
	}

	return normalizedEntryGroupPrefix
}

func getInitialAssessmentSheetLabel(sheetKey string) string {
	switch normalizeMedicalRecordSheetKey(sheetKey) {
	case medicalRecordSheetKeyInitialAssessmentDental:
		return "Pengkajian Awal Gigi"
	case medicalRecordSheetKeySurat:
		return "Surat"
	default:
		return "Pengkajian Awal Medis"
	}
}

func getInitialAssessmentSheetFileSlug(sheetKey string) string {
	switch normalizeMedicalRecordSheetKey(sheetKey) {
	case medicalRecordSheetKeyInitialAssessmentDental:
		return medicalRecordSheetKeyInitialAssessmentDental
	case medicalRecordSheetKeySurat:
		return medicalRecordSheetKeySurat
	default:
		return medicalRecordSheetKeyInitialAssessmentMedical
	}
}

func getMedicalRecordSectionTypesForSheet(sheetKey string) []string {
	switch normalizeMedicalRecordSheetKey(sheetKey) {
	case medicalRecordSheetKeySurat:
		return []string{"assessment", "outcome"}
	default:
		return []string{"anamnesis", "physical_exam", "assessment"}
	}
}

func isValidMedicalRecordSection(section string) bool {
	_, exists := medicalRecordSections[normalizeMedicalRecordSection(section)]
	return exists
}

func syncPatientAllergies(patientID uint, allergyNotes string) {
	trimmedAllergyNotes := strings.TrimSpace(allergyNotes)
	if patientID == 0 || trimmedAllergyNotes == "" {
		return
	}

	database.DB.Model(&models.Patient{}).
		Where("id = ?", patientID).
		Update("allergies", trimmedAllergyNotes)
}

func getPatientAllergyNotes(patientID uint) string {
	if patientID == 0 {
		return ""
	}

	var patient models.Patient
	if err := database.DB.Select("id", "allergies").First(&patient, patientID).Error; err == nil {
		if allergies := strings.TrimSpace(patient.Allergies); allergies != "" {
			return allergies
		}
	}

	var latestRecord models.MedicalRecord
	if err := database.DB.Select("allergy_notes").
		Where("patient_id = ? AND CHAR_LENGTH(TRIM(COALESCE(allergy_notes, ''))) > 0", patientID).
		Order("record_date DESC").
		Order("created_at DESC").
		First(&latestRecord).Error; err == nil {
		if allergyNotes := strings.TrimSpace(latestRecord.AllergyNotes); allergyNotes != "" {
			syncPatientAllergies(patientID, allergyNotes)
			return allergyNotes
		}
	}

	return ""
}

func parseMedicalRecordFollowUpAt(value string) (*time.Time, error) {
	trimmedFollowUpAt := strings.TrimSpace(value)
	if trimmedFollowUpAt == "" {
		return nil, nil
	}

	layouts := []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02 15:04", "2006-01-02"}
	for _, layout := range layouts {
		var (
			parsed   time.Time
			parseErr error
		)

		if layout == time.RFC3339 {
			parsed, parseErr = time.Parse(layout, trimmedFollowUpAt)
		} else {
			parsed, parseErr = time.ParseInLocation(layout, trimmedFollowUpAt, time.Local)
		}

		if parseErr == nil {
			return &parsed, nil
		}
	}

	return nil, errors.New("Format follow_up_at tidak valid")
}

func generateMedicalRecordEntryGroupKey(prefix string) string {
	trimmedPrefix := strings.TrimSpace(prefix)
	if trimmedPrefix == "" {
		trimmedPrefix = "entry"
	}

	return trimmedPrefix + "-" + strconv.FormatInt(time.Now().UnixNano(), 10)
}

func normalizeMedicalRecordEntryGroupPrefix(prefix string) string {
	trimmedPrefix := strings.ToLower(strings.TrimSpace(prefix))
	trimmedPrefix = strings.ReplaceAll(trimmedPrefix, " ", "-")
	if trimmedPrefix == "" {
		return "pengkajian-awal"
	}

	return trimmedPrefix
}

func buildMedicalRecordDraftEntry(visit models.Visit, sectionType string, allergyNotes string, entryGroupKey string, sheetKey string) models.MedicalRecord {
	record := models.MedicalRecord{
		VisitID:       visit.ID,
		PatientID:     visit.PatientID,
		DoctorID:      visit.DoctorID,
		PolyclinicID:  visit.PolyclinicID,
		SectionType:   sectionType,
		EntryGroupKey: strings.TrimSpace(entryGroupKey),
		SheetKey:      normalizeMedicalRecordSheetKey(sheetKey),
		RecordDate:    time.Now(),
		AllergyNotes:  allergyNotes,
		Status:        "draft",
	}

	if sectionType == "anamnesis" {
		record.ChiefComplaint = visit.Complaint
		if sheetKey != "pengkajian-awal-gigi" {
			record.Subjective = visit.Complaint
		}
	}

	if sectionType == "prescription" {
		record.PrescriptionWorkflowStatus = prescriptionWorkflowStatusDraft
	}

	if sectionType == "laboratory" {
		record.LaboratoryWorkflowStatus = supportingOrderWorkflowStatusDraft
	}

	if sectionType == "radiology" {
		record.RadiologyWorkflowStatus = supportingOrderWorkflowStatusDraft
	}

	return record
}

func createInitialAssessmentEntryRecords(visit models.Visit, sheetKey string, entryGroupPrefix string) ([]models.MedicalRecord, error) {
	resolvedSheetKey := resolveInitialAssessmentSheetKey(sheetKey, entryGroupPrefix)
	sections := getMedicalRecordSectionTypesForSheet(resolvedSheetKey)
	allergyNotes := getPatientAllergyNotes(visit.PatientID)
	entryGroupKey := generateMedicalRecordEntryGroupKey(resolveInitialAssessmentEntryGroupPrefix(resolvedSheetKey, entryGroupPrefix))

	tx := database.DB.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}

	createdIDs := make([]uint, 0, len(sections))
	for _, sectionType := range sections {
		record := buildMedicalRecordDraftEntry(visit, sectionType, allergyNotes, entryGroupKey, resolvedSheetKey)
		if err := tx.Create(&record).Error; err != nil {
			tx.Rollback()
			return nil, err
		}
		createdIDs = append(createdIDs, record.ID)
	}

	if err := tx.Model(&visit).Updates(map[string]interface{}{
		"status":       "in_progress",
		"queue_status": "in_consultation",
	}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	var records []models.MedicalRecord
	if err := preloadMedicalRecordRelations(database.DB).
		Where("id IN ?", createdIDs).
		Order("created_at DESC").
		Find(&records).Error; err != nil {
		return nil, err
	}

	return records, nil
}

func preloadMedicalRecordRelations(query *gorm.DB) *gorm.DB {
	return query.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Visit").
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		Preload("Prescriptions").
		Preload("Prescriptions.Medicine").
		Preload("Prescriptions.Medicine.Unit").
		Preload("PrescriptionCompounds").
		Preload("PrescriptionCompounds.Items").
		Preload("PrescriptionCompounds.Items.Medicine").
		Preload("PrescriptionCompounds.Items.Medicine.Unit").
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
		Preload("Actions", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC").Order("id DESC")
		}).
		Preload("Actions.ParameterValues", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("Actions.ParameterValues.MedicalServiceParameter").
		Preload("Actions.Targets").
		Preload("Actions.MedicalService").
		Preload("Actions.MedicalService.Parameters", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("Actions.MedicalService.Category").
		Preload("Actions.Doctor").
		Preload("PhysicalExamImages").
		Preload("PhysicalExamImages.PhysicalExamImageMaster").
		Preload("PhysicalExamImages.Markers").
		Preload("PrescriptionProcessor").
		Preload("LaboratoryProcessor").
		Preload("RadiologyProcessor").
		Preload("InformedConsents")
}

type PhysicalExamImageMarkerRequest struct {
	MarkerLabel string  `json:"marker_label"`
	PosX        float64 `json:"pos_x"`
	PosY        float64 `json:"pos_y"`
}

type PhysicalExamImagePickRequest struct {
	PhysicalExamImageMasterID uint                             `json:"physical_exam_image_master_id"`
	Notes                     string                           `json:"notes"`
	SortOrder                 int                              `json:"sort_order"`
	Markers                   []PhysicalExamImageMarkerRequest `json:"markers"`
}

func syncMedicalRecordPhysicalExamImagesTx(tx *gorm.DB, recordID uint, picks []PhysicalExamImagePickRequest) error {
	var existingPickIDs []uint
	if err := tx.Model(&models.MedicalRecordImagePick{}).
		Where("medical_record_id = ?", recordID).
		Pluck("id", &existingPickIDs).Error; err != nil {
		return err
	}

	if len(existingPickIDs) > 0 {
		if err := tx.Where("medical_record_image_pick_id IN ?", existingPickIDs).Delete(&models.MedicalRecordImagePickMarker{}).Error; err != nil {
			return err
		}
	}

	if err := tx.Where("medical_record_id = ?", recordID).Delete(&models.MedicalRecordImagePick{}).Error; err != nil {
		return err
	}

	for index, pick := range picks {
		if pick.PhysicalExamImageMasterID == 0 {
			continue
		}

		recordPick := models.MedicalRecordImagePick{
			MedicalRecordID:           recordID,
			PhysicalExamImageMasterID: pick.PhysicalExamImageMasterID,
			Notes:                     pick.Notes,
			SortOrder:                 pick.SortOrder,
		}
		if recordPick.SortOrder == 0 {
			recordPick.SortOrder = index + 1
		}

		if err := tx.Create(&recordPick).Error; err != nil {
			return err
		}

		for markerIndex, marker := range pick.Markers {
			recordMarker := models.MedicalRecordImagePickMarker{
				MedicalRecordImagePickID: recordPick.ID,
				MarkerLabel:              marker.MarkerLabel,
				PosX:                     marker.PosX,
				PosY:                     marker.PosY,
			}
			if strings.TrimSpace(recordMarker.MarkerLabel) == "" {
				recordMarker.MarkerLabel = "Titik " + strconv.Itoa(markerIndex+1)
			}
			if err := tx.Create(&recordMarker).Error; err != nil {
				return err
			}
		}
	}

	return nil
}

func GetMedicalRecords(c *gin.Context) {
	var records []models.MedicalRecord
	query := preloadMedicalRecordRelations(database.DB).
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
	if visitID := c.Query("visit_id"); visitID != "" {
		query = query.Where("medical_records.visit_id = ?", visitID)
	}
	if sectionType := normalizeMedicalRecordSection(c.Query("section_type")); sectionType != "" {
		query = query.Where("medical_records.section_type = ?", sectionType)
	}
	if sheetKey := normalizeMedicalRecordSheetKey(c.Query("sheet_key")); sheetKey != "" {
		query = query.Where("medical_records.sheet_key = ?", sheetKey)
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
	if err := preloadMedicalRecordRelations(database.DB).
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

	var records []models.MedicalRecord
	if err := preloadMedicalRecordRelations(database.DB).
		Where("visit_id = ?", visitID).
		Order("created_at DESC").
		Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": records})
}

type CreateMedicalRecordRequest struct {
	VisitID       uint   `json:"visit_id" binding:"required"`
	SectionType   string `json:"section_type" binding:"required"`
	EntryGroupKey string `json:"entry_group_key"`
	SheetKey      string `json:"sheet_key"`
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

	if visit.Status == "completed" || visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah ditutup, tidak bisa menambah entri rekam medis"})
		return
	}

	sectionType := normalizeMedicalRecordSection(req.SectionType)
	if !isValidMedicalRecordSection(sectionType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "section_type tidak valid"})
		return
	}

	allergyNotes := getPatientAllergyNotes(visit.PatientID)
	sheetKey := normalizeMedicalRecordSheetKey(req.SheetKey)
	if sheetKey == "" && isInitialAssessmentMedicalRecordSection(sectionType) {
		sheetKey = resolveInitialAssessmentSheetKey(req.SheetKey, req.EntryGroupKey)
	}

	record := models.MedicalRecord{
		VisitID:        visit.ID,
		PatientID:      visit.PatientID,
		DoctorID:       visit.DoctorID,
		PolyclinicID:   visit.PolyclinicID,
		SectionType:    sectionType,
		EntryGroupKey: strings.TrimSpace(req.EntryGroupKey),
		SheetKey:      sheetKey,
		RecordDate:    time.Now(),
		AllergyNotes:  allergyNotes,
		Status:        "draft",
	}

	if sectionType == "anamnesis" {
		record.ChiefComplaint = visit.Complaint
		if sheetKey != "pengkajian-awal-gigi" {
			record.Subjective = visit.Complaint
		}
	}

	if sectionType == "prescription" {
		record.PrescriptionWorkflowStatus = prescriptionWorkflowStatusDraft
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

type CreateInitialAssessmentEntryRequest struct {
	VisitID          uint   `json:"visit_id" binding:"required"`
	EntryGroupPrefix string `json:"entry_group_prefix"`
	SheetKey         string `json:"sheet_key"`
}

func CreateInitialAssessmentEntry(c *gin.Context) {
	var req CreateInitialAssessmentEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var visit models.Visit
	if err := database.DB.First(&visit, req.VisitID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	if visit.Status == "completed" || visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah ditutup, tidak bisa menambah entri lembar rekam medis"})
		return
	}

	records, err := createInitialAssessmentEntryRecords(visit, req.SheetKey, req.EntryGroupPrefix)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": records, "message": "Entri lembar rekam medis berhasil dibuat"})
}

type UpdateMedicalRecordRequest struct {
	ChiefComplaint              string                         `json:"chief_complaint"`
	HistoryOfPresentIllness     string                         `json:"history_of_present_illness"`
	PastMedicalHistory          string                         `json:"past_medical_history"`
	PastSurgicalHistory         string                         `json:"past_surgical_history"`
	FamilyHistory               string                         `json:"family_history"`
	MedicationHistory           string                         `json:"medication_history"`
	SocialHistory               string                         `json:"social_history"`
	ReviewOfSystems             string                         `json:"review_of_systems"`
	ClinicalAlert               string                         `json:"clinical_alert"`
	AllergyNotes                string                         `json:"allergy_notes"`
	Subjective                  string                         `json:"subjective"`
	BPSystolic                  int                            `json:"bp_systolic"`
	BPDiastolic                 int                            `json:"bp_diastolic"`
	HeartRate                   int                            `json:"heart_rate"`
	Temperature                 float64                        `json:"temperature"`
	RespiratoryRate             int                            `json:"respiratory_rate"`
	SpO2                        float64                        `json:"spo2"`
	PainScaleType               string                         `json:"pain_scale_type"`
	PainScale                   int                            `json:"pain_scale"`
	Consciousness               string                         `json:"consciousness"`
	Height                      float64                        `json:"height"`
	Weight                      float64                        `json:"weight"`
	PhysicalExamination         string                         `json:"physical_examination"`
	SupportingExamination       string                         `json:"supporting_examination"`
	PrescriptionFulfillmentMode string                         `json:"prescription_fulfillment_mode"`
	PhysicalExamImages          []PhysicalExamImagePickRequest `json:"physical_exam_images"`
	WorkingDiagnosis            string                         `json:"working_diagnosis"`
	DifferentialDiagnosis       string                         `json:"differential_diagnosis"`
	Assessment                  string                         `json:"assessment"`
	Plan                        string                         `json:"plan"`
	FollowUpInstruction         string                         `json:"follow_up_instruction"`
	FollowUpAt                  string                         `json:"follow_up_at"`
	Disposition                 string                         `json:"disposition"`
	DischargeCondition          string                         `json:"discharge_condition"`
	ReferralDestination         string                         `json:"referral_destination"`
	ReferralReason              string                         `json:"referral_reason"`
	Notes                       string                         `json:"notes"`
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
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal, tidak bisa diubah"})
		return
	}

	if normalizeMedicalRecordSection(record.SectionType) == "prescription" && isPrescriptionWorkflowLocked(record.PrescriptionWorkflowStatus) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep sudah dikirim atau diproses. Buat entri resep baru untuk revisi"})
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

	painScaleType := strings.ToLower(strings.TrimSpace(req.PainScaleType))
	if painScaleType == "" {
		painScaleType = "nrs"
	}

	followUpAt, err := parseMedicalRecordFollowUpAt(req.FollowUpAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	prescriptionFulfillmentMode := normalizePrescriptionFulfillmentMode(req.PrescriptionFulfillmentMode)

	updates := map[string]interface{}{
		"chief_complaint":               req.ChiefComplaint,
		"history_of_present_illness":    req.HistoryOfPresentIllness,
		"past_medical_history":          req.PastMedicalHistory,
		"past_surgical_history":         req.PastSurgicalHistory,
		"family_history":                req.FamilyHistory,
		"medication_history":            req.MedicationHistory,
		"social_history":                req.SocialHistory,
		"review_of_systems":             req.ReviewOfSystems,
		"clinical_alert":                req.ClinicalAlert,
		"allergy_notes":                 req.AllergyNotes,
		"subjective":                    req.Subjective,
		"bp_systolic":                   req.BPSystolic,
		"bp_diastolic":                  req.BPDiastolic,
		"heart_rate":                    req.HeartRate,
		"temperature":                   req.Temperature,
		"respiratory_rate":              req.RespiratoryRate,
		"sp_o2":                         req.SpO2,
		"pain_scale_type":               painScaleType,
		"pain_scale":                    req.PainScale,
		"consciousness":                 req.Consciousness,
		"height":                        req.Height,
		"weight":                        req.Weight,
		"bmi":                           bmi,
		"physical_examination":          req.PhysicalExamination,
		"supporting_examination":        req.SupportingExamination,
		"prescription_fulfillment_mode": prescriptionFulfillmentMode,
		"working_diagnosis":             req.WorkingDiagnosis,
		"differential_diagnosis":        req.DifferentialDiagnosis,
		"assessment":                    req.Assessment,
		"plan":                          req.Plan,
		"follow_up_instruction":         req.FollowUpInstruction,
		"follow_up_at":                  followUpAt,
		"disposition":                   req.Disposition,
		"discharge_condition":           req.DischargeCondition,
		"referral_destination":          req.ReferralDestination,
		"referral_reason":               req.ReferralReason,
		"notes":                         req.Notes,
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Model(&record).Updates(updates).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := syncMedicalRecordPhysicalExamImagesTx(tx, record.ID, req.PhysicalExamImages); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	syncPatientAllergies(record.PatientID, req.AllergyNotes)

	// Reload with relations
	preloadMedicalRecordRelations(database.DB).
		First(&record, record.ID)

	c.JSON(http.StatusOK, gin.H{"data": record, "message": "Rekam medis berhasil diperbarui"})
}

func CancelMedicalRecord(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.Preload("Visit").First(&record, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah berstatus batal"})
		return
	}
	if record.Visit.Status == "completed" || record.Visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah dikunci dan entri tidak dapat dibatalkan"})
		return
	}

	switch normalizeMedicalRecordSection(record.SectionType) {
	case "prescription":
		if isPrescriptionWorkflowLocked(record.PrescriptionWorkflowStatus) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Entri tidak dapat dibatalkan karena order resep sudah dikirim atau diproses. Batalkan order terlebih dahulu."})
			return
		}
	case "laboratory":
		if isSupportingOrderWorkflowLocked(record.LaboratoryWorkflowStatus) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Entri tidak dapat dibatalkan karena order laboratorium sudah dikirim atau diproses. Batalkan order terlebih dahulu."})
			return
		}
	case "radiology":
		if isSupportingOrderWorkflowLocked(record.RadiologyWorkflowStatus) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Entri tidak dapat dibatalkan karena order radiologi sudah dikirim atau diproses. Batalkan order terlebih dahulu."})
			return
		}
	}

	if err := database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Update("status", "cancelled").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	preloadMedicalRecordRelations(database.DB).First(&record, record.ID)

	c.JSON(http.StatusOK, gin.H{"data": record, "message": "Entri rekam medis berhasil dibatalkan"})
}

func hasMedicalRecordText(values ...string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return true
		}
	}

	return false
}

func hasObjectiveMedicalRecordData(record models.MedicalRecord) bool {
	return record.BPSystolic > 0 ||
		record.BPDiastolic > 0 ||
		record.HeartRate > 0 ||
		record.Temperature > 0 ||
		record.RespiratoryRate > 0 ||
		record.SpO2 > 0 ||
		record.Height > 0 ||
		record.Weight > 0 ||
		len(record.PhysicalExamImages) > 0 ||
		hasMedicalRecordText(record.PhysicalExamination, record.SupportingExamination)
}

func hasAssessmentMedicalRecordData(record models.MedicalRecord) bool {
	return hasMedicalRecordText(record.WorkingDiagnosis, record.DifferentialDiagnosis, record.Assessment) || len(record.Diagnoses) > 0
}

func hasPlanMedicalRecordData(record models.MedicalRecord) bool {
	return hasMedicalRecordText(record.Plan, record.FollowUpInstruction, record.Notes) || record.FollowUpAt != nil
}

func getMedicalRecordMissingFinalizeSections(record models.MedicalRecord) []string {
	missing := make([]string, 0, 4)

	switch normalizeMedicalRecordSection(record.SectionType) {
	case "anamnesis":
		if !hasMedicalRecordText(
			record.ChiefComplaint,
			record.HistoryOfPresentIllness,
			record.PastMedicalHistory,
			record.MedicationHistory,
			record.Subjective,
		) {
			missing = append(missing, "isi anamnesis")
		}
	case "physical_exam":
		if !hasObjectiveMedicalRecordData(record) {
			missing = append(missing, "pemeriksaan fisik/objektif")
		}
	case "assessment":
		if !hasAssessmentMedicalRecordData(record) {
			missing = append(missing, "assessment/diagnosis")
		}
	case "plan":
		if !hasPlanMedicalRecordData(record) {
			missing = append(missing, "plan/tindak lanjut")
		}
	case "prescription":
		if len(record.Prescriptions) == 0 && len(record.PrescriptionCompounds) == 0 {
			missing = append(missing, "item resep")
		}
		if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) == "" {
			missing = append(missing, "mode pemenuhan resep")
		}
	case "procedure":
		if len(record.Actions) == 0 && !hasMedicalRecordText(record.Notes) {
			missing = append(missing, "tindakan/catatan tindakan")
		}
	case "outcome":
		if !hasMedicalRecordText(record.Disposition) {
			missing = append(missing, "disposisi akhir")
		}
		if !hasMedicalRecordText(record.DischargeCondition) {
			missing = append(missing, "kondisi akhir kunjungan")
		}
		if normalizeMedicalRecordSection(record.Disposition) == "rujuk" && (!hasMedicalRecordText(record.ReferralDestination) || !hasMedicalRecordText(record.ReferralReason)) {
			missing = append(missing, "detail rujukan")
		}
	default:
		if !hasMedicalRecordText(
			record.ChiefComplaint,
			record.HistoryOfPresentIllness,
			record.Subjective,
			record.PhysicalExamination,
			record.Assessment,
			record.Plan,
			record.Disposition,
		) && len(record.Diagnoses) == 0 && len(record.Prescriptions) == 0 && len(record.Actions) == 0 {
			missing = append(missing, "isi entri")
		}
	}

	return missing
}

func hasCompleteMedicalRecordSection(records []models.MedicalRecord, sectionType string) bool {
	for _, record := range records {
		if normalizeMedicalRecordSection(record.SectionType) != sectionType {
			continue
		}

		if len(getMedicalRecordMissingFinalizeSections(record)) == 0 {
			return true
		}
	}

	return false
}

func getMedicalRecordVisitMissingSections(records []models.MedicalRecord) []string {
	missing := make([]string, 0, 3)

	if !hasCompleteMedicalRecordSection(records, "anamnesis") {
		missing = append(missing, "anamnesis")
	}
	if !hasCompleteMedicalRecordSection(records, "physical_exam") {
		missing = append(missing, "pemeriksaan fisik")
	}
	if !hasCompleteMedicalRecordSection(records, "assessment") {
		missing = append(missing, "assessment")
	}
	if !hasCompleteMedicalRecordSection(records, "outcome") {
		missing = append(missing, "outcome/pemulangan")
	}

	return missing
}

type FinalizeMedicalRecordVisitRequest struct {
	FollowUpInstruction string `json:"follow_up_instruction"`
	FollowUpAt          string `json:"follow_up_at"`
	Disposition         string `json:"disposition"`
	DischargeCondition  string `json:"discharge_condition"`
	ReferralDestination string `json:"referral_destination"`
	ReferralReason      string `json:"referral_reason"`
	Notes               string `json:"notes"`
}

func hasFinalizeMedicalRecordVisitPayload(req FinalizeMedicalRecordVisitRequest) bool {
	return hasMedicalRecordText(
		req.FollowUpInstruction,
		req.FollowUpAt,
		req.Disposition,
		req.DischargeCondition,
		req.ReferralDestination,
		req.ReferralReason,
		req.Notes,
	)
}

func upsertOutcomeMedicalRecordForVisit(tx *gorm.DB, visit models.Visit, req FinalizeMedicalRecordVisitRequest) error {
	followUpAt, err := parseMedicalRecordFollowUpAt(req.FollowUpAt)
	if err != nil {
		return err
	}

	if normalizeMedicalRecordSection(req.Disposition) == "kontrol" && (followUpAt == nil || followUpAt.IsZero()) {
		return errors.New("Tanggal kontrol wajib diisi untuk disposition kontrol")
	}

	var outcomeRecord models.MedicalRecord
	queryErr := tx.
		Where("visit_id = ? AND section_type = ? AND status NOT IN ?", visit.ID, "outcome", []string{"cancelled", "final"}).
		Order("updated_at DESC").
		Order("created_at DESC").
		First(&outcomeRecord).Error

	if queryErr != nil {
		if !errors.Is(queryErr, gorm.ErrRecordNotFound) {
			return queryErr
		}

		outcomeRecord = buildMedicalRecordDraftEntry(visit, "outcome", getPatientAllergyNotes(visit.PatientID), "", "")
		if err := tx.Create(&outcomeRecord).Error; err != nil {
			return err
		}
	}

	updates := map[string]interface{}{
		"follow_up_instruction": req.FollowUpInstruction,
		"follow_up_at":          followUpAt,
		"disposition":           req.Disposition,
		"discharge_condition":   req.DischargeCondition,
		"referral_destination":  req.ReferralDestination,
		"referral_reason":       req.ReferralReason,
		"notes":                 req.Notes,
	}

	return tx.Model(&outcomeRecord).Updates(updates).Error
}

type visitFinalizationActor struct {
	UserID *uint
	Email  string
	Name   string
}

func resolveVisitFinalizationActor(c *gin.Context) visitFinalizationActor {
	actor := visitFinalizationActor{
		Email: strings.TrimSpace(c.GetString("email")),
	}

	if rawUserID, exists := c.Get("user_id"); exists {
		switch value := rawUserID.(type) {
		case uint:
			actor.UserID = &value
		case int:
			if value > 0 {
				converted := uint(value)
				actor.UserID = &converted
			}
		case int64:
			if value > 0 {
				converted := uint(value)
				actor.UserID = &converted
			}
		case float64:
			if value > 0 {
				converted := uint(value)
				actor.UserID = &converted
			}
		}
	}

	if actor.UserID != nil {
		var user models.User
		if err := database.DB.Select("id", "email", "full_name").First(&user, *actor.UserID).Error; err == nil {
			if strings.TrimSpace(user.Email) != "" {
				actor.Email = strings.TrimSpace(user.Email)
			}
			actor.Name = strings.TrimSpace(user.FullName)
		}
	}

	if actor.Name == "" {
		actor.Name = actor.Email
	}

	return actor
}

func createVisitFinalizationLog(tx *gorm.DB, visitID uint, action string, actor visitFinalizationActor, visitStatusBefore string, visitStatusAfter string, queueStatusBefore string, queueStatusAfter string, notes string) error {
	logEntry := models.VisitFinalizationLog{
		VisitID:           visitID,
		Action:            strings.TrimSpace(action),
		ActorUserID:       actor.UserID,
		ActorEmail:        strings.TrimSpace(actor.Email),
		ActorName:         strings.TrimSpace(actor.Name),
		VisitStatusBefore: strings.TrimSpace(visitStatusBefore),
		VisitStatusAfter:  strings.TrimSpace(visitStatusAfter),
		QueueStatusBefore: strings.TrimSpace(queueStatusBefore),
		QueueStatusAfter:  strings.TrimSpace(queueStatusAfter),
		Notes:             strings.TrimSpace(notes),
	}

	return tx.Create(&logEntry).Error
}

func getFinalizeVisitBlockingOrders(records []models.MedicalRecord) []string {
	blockers := make([]string, 0, 3)
	hasPendingPharmacy := false
	hasPendingLaboratory := false
	hasPendingRadiology := false

	for _, record := range records {
		if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) == prescriptionFulfillmentModeInternal {
			switch normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) {
			case prescriptionWorkflowStatusOrdered, prescriptionWorkflowStatusPreparing, prescriptionWorkflowStatusReady:
				hasPendingPharmacy = true
			}
		}

		switch normalizeSupportingOrderWorkflowStatus(record.LaboratoryWorkflowStatus) {
		case supportingOrderWorkflowStatusOrdered, supportingOrderWorkflowStatusPreparing:
			hasPendingLaboratory = true
		}

		switch normalizeSupportingOrderWorkflowStatus(record.RadiologyWorkflowStatus) {
		case supportingOrderWorkflowStatusOrdered, supportingOrderWorkflowStatusPreparing:
			hasPendingRadiology = true
		}
	}

	if hasPendingPharmacy {
		blockers = append(blockers, "order farmasi internal belum selesai")
	}
	if hasPendingLaboratory {
		blockers = append(blockers, "order laboratorium belum selesai")
	}
	if hasPendingRadiology {
		blockers = append(blockers, "order radiologi belum selesai")
	}

	return blockers
}

func DeleteMedicalRecord(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.Preload("Visit").First(&record, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}

	if record.Status != "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya entri berstatus batal yang dapat dihapus"})
		return
	}

	if normalizeMedicalRecordSection(record.SectionType) == "prescription" && isPrescriptionWorkflowLocked(record.PrescriptionWorkflowStatus) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Entri tidak dapat dihapus karena order resep sudah dikirim atau diproses"})
		return
	}

	if normalizeMedicalRecordSection(record.SectionType) == "laboratory" && isSupportingOrderWorkflowLocked(record.LaboratoryWorkflowStatus) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Entri tidak dapat dihapus karena order laboratorium sudah dikirim atau diproses"})
		return
	}

	if normalizeMedicalRecordSection(record.SectionType) == "radiology" && isSupportingOrderWorkflowLocked(record.RadiologyWorkflowStatus) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Entri tidak dapat dihapus karena order radiologi sudah dikirim atau diproses"})
		return
	}

	if record.Visit.Status == "completed" || record.Visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah dikunci dan entri tidak dapat dihapus"})
		return
	}

	var prescriptionIDs []uint
	if err := database.DB.Model(&models.Prescription{}).
		Where("medical_record_id = ?", record.ID).
		Pluck("id", &prescriptionIDs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(prescriptionIDs) > 0 {
		if database.DB.Migrator().HasTable(&models.Dispensing{}) {
			var dispensingCount int64
			if err := database.DB.Model(&models.Dispensing{}).
				Where("medical_record_id = ? OR prescription_id IN ?", record.ID, prescriptionIDs).
				Count(&dispensingCount).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			if dispensingCount > 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Entri tidak dapat dihapus karena resep sudah diproses farmasi"})
				return
			}
		}
	}

	var labRequestIDs []uint
	if database.DB.Migrator().HasTable(&models.LabRequest{}) {
		if err := database.DB.Model(&models.LabRequest{}).
			Where("medical_record_id = ?", record.ID).
			Pluck("id", &labRequestIDs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.MedicalRecordDiagnosis{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.InformedConsent{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var physicalExamImagePickIDs []uint
	if err := tx.Model(&models.MedicalRecordImagePick{}).
		Where("medical_record_id = ?", record.ID).
		Pluck("id", &physicalExamImagePickIDs).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(physicalExamImagePickIDs) > 0 {
		if err := tx.Where("medical_record_image_pick_id IN ?", physicalExamImagePickIDs).Delete(&models.MedicalRecordImagePickMarker{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.MedicalRecordImagePick{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(labRequestIDs) > 0 && tx.Migrator().HasTable(&models.LabRequestItem{}) {
		if err := tx.Where("lab_request_id IN ?", labRequestIDs).Delete(&models.LabRequestItem{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if tx.Migrator().HasTable(&models.LabRequest{}) {
		if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.LabRequest{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	var medicalActionIDs []uint
	if err := tx.Model(&models.MedicalAction{}).
		Where("medical_record_id = ?", record.ID).
		Pluck("id", &medicalActionIDs).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(medicalActionIDs) > 0 {
		if err := tx.Where("medical_action_id IN ?", medicalActionIDs).Delete(&models.MedicalActionTarget{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.MedicalAction{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var laboratoryOrderItemIDs []uint
	if err := tx.Model(&models.LaboratoryOrderItem{}).
		Where("medical_record_id = ?", record.ID).
		Pluck("id", &laboratoryOrderItemIDs).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(laboratoryOrderItemIDs) > 0 {
		if err := tx.Where("laboratory_order_item_id IN ?", laboratoryOrderItemIDs).Delete(&models.LaboratoryOrderParameterResult{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.LaboratoryOrderItem{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var radiologyOrderItemIDs []uint
	if err := tx.Model(&models.RadiologyOrderItem{}).
		Where("medical_record_id = ?", record.ID).
		Pluck("id", &radiologyOrderItemIDs).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(radiologyOrderItemIDs) > 0 {
		if err := tx.Where("radiology_order_item_id IN ?", radiologyOrderItemIDs).Delete(&models.RadiologyOrderParameterResult{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.RadiologyOrderItem{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var compoundIDs []uint
	if err := tx.Model(&models.PrescriptionCompound{}).
		Where("medical_record_id = ?", record.ID).
		Pluck("id", &compoundIDs).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(compoundIDs) > 0 {
		if err := tx.Where("prescription_compound_id IN ?", compoundIDs).Delete(&models.PrescriptionCompoundItem{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.Dispensing{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.PrescriptionCompound{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Where("medical_record_id = ?", record.ID).Delete(&models.Prescription{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Delete(&record).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Entri rekam medis berhasil dihapus"})
}

func FinalizeMedicalRecord(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.
		Preload("Diagnoses").
		Preload("Prescriptions").
		Preload("PrescriptionCompounds").
		Preload("Actions").
		Preload("PhysicalExamImages").
		First(&record, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis tidak ditemukan"})
		return
	}

	if record.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal"})
		return
	}

	missingSections := getMedicalRecordMissingFinalizeSections(record)
	if len(missingSections) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":            "Rekam medis belum lengkap untuk finalisasi",
			"missing_sections": missingSections,
		})
		return
	}

	database.DB.Model(&record).Update("status", "final")

	c.JSON(http.StatusOK, gin.H{"message": "Rekam medis berhasil di-finalisasi"})
}

func FinalizeMedicalRecordVisit(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("visitId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visit ID"})
		return
	}

	var req FinalizeMedicalRecordVisitRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var visit models.Visit
	if err := database.DB.First(&visit, visitID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	if visit.Status == "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah difinalisasi"})
		return
	}

	actor := resolveVisitFinalizationActor(c)
	visitStatusBefore := visit.Status
	queueStatusBefore := visit.QueueStatus

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if hasFinalizeMedicalRecordVisitPayload(req) {
		if err := upsertOutcomeMedicalRecordForVisit(tx, visit, req); err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	var records []models.MedicalRecord
	if err := tx.
		Preload("Diagnoses").
		Preload("Prescriptions").
		Preload("PrescriptionCompounds").
		Preload("Actions").
		Preload("PhysicalExamImages").
		Where("visit_id = ?", visitID).
		Find(&records).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(records) == 0 {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": "Belum ada entri rekam medis untuk kunjungan ini"})
		return
	}

	missingSections := getMedicalRecordVisitMissingSections(records)
	if len(missingSections) > 0 {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{
			"error":            "Rekam medis kunjungan belum lengkap untuk finalisasi",
			"missing_sections": missingSections,
		})
		return
	}

	blockingOrders := getFinalizeVisitBlockingOrders(records)
	if len(blockingOrders) > 0 {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{
			"error":           "Masih ada order penunjang yang belum selesai",
			"blocking_orders": blockingOrders,
		})
		return
	}

	if err := tx.Model(&models.MedicalRecord{}).
		Where("visit_id = ?", visitID).
		Update("status", "final").Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Model(&visit).Updates(map[string]interface{}{
		"status":       "completed",
		"queue_status": "done",
	}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := createVisitFinalizationLog(tx, visit.ID, "finalized", actor, visitStatusBefore, "completed", queueStatusBefore, "done", "Kunjungan difinalisasi"); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	autoSyncResult := runSATUSEHATAutoSyncForVisit(c.Request.Context(), visit.ID, "visit-finalized")

	c.JSON(http.StatusOK, gin.H{
		"message":             "Kunjungan berhasil di-finalisasi",
		"satusehat_auto_sync": autoSyncResult,
	})
}

func CancelFinalizeMedicalRecordVisit(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("visitId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visit ID"})
		return
	}

	var visit models.Visit
	if err := database.DB.First(&visit, visitID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	if visit.Status != "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan belum difinalisasi"})
		return
	}

	actor := resolveVisitFinalizationActor(c)
	visitStatusBefore := visit.Status
	queueStatusBefore := visit.QueueStatus

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Model(&models.MedicalRecord{}).
		Where("visit_id = ? AND status = ?", visitID, "final").
		Update("status", "draft").Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Model(&visit).Updates(map[string]interface{}{
		"status":       "in_progress",
		"queue_status": "in_consultation",
	}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Model(&models.DocumentSignatureRequest{}).
		Where("visit_id = ? AND status IN ?", visit.ID, []string{"pending", "signed"}).
		Updates(map[string]any{
			"status":           "revoked",
			"responded_at":     time.Now(),
			"rejection_reason": "Finalisasi kunjungan dibatalkan sehingga request TTE harus diajukan ulang.",
		}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := createVisitFinalizationLog(tx, visit.ID, "unfinalized", actor, visitStatusBefore, "in_progress", queueStatusBefore, "in_consultation", "Finalisasi kunjungan dibatalkan"); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Finalisasi kunjungan berhasil dibatalkan"})
}

// ========================
// Diagnoses
// ========================

type DiagnosisRequest struct {
	ICD10ID               uint   `json:"icd10_id" binding:"required"`
	DiagnosisType         string `json:"diagnosis_type" binding:"required,oneof=primer sekunder"`
	WorkingDiagnosis      string `json:"working_diagnosis"`
	DifferentialDiagnosis string `json:"differential_diagnosis"`
	AssessmentNarrative   string `json:"assessment_narrative"`
	Notes                 string `json:"notes"`
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
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal"})
		return
	}

	if sectionType := normalizeMedicalRecordSection(record.SectionType); sectionType != "assessment" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Diagnosis hanya dapat ditambahkan pada entri assessment"})
		return
	}

	var req DiagnosisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var icd models.ICD10
	if err := database.DB.First(&icd, req.ICD10ID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kode diagnosis tidak ditemukan"})
		return
	}
	if strings.TrimSpace(icd.System) != "" && !strings.EqualFold(strings.TrimSpace(icd.System), "ICD10_2010_IM") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Diagnosis hanya boleh menggunakan kode ICD-10"})
		return
	}

	diagnosis := models.MedicalRecordDiagnosis{
		MedicalRecordID:       uint(recordID),
		ICD10ID:               req.ICD10ID,
		DiagnosisType:         req.DiagnosisType,
		WorkingDiagnosis:      req.WorkingDiagnosis,
		DifferentialDiagnosis: req.DifferentialDiagnosis,
		AssessmentNarrative:   req.AssessmentNarrative,
		Notes:                 req.Notes,
	}

	if err := database.DB.Create(&diagnosis).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	recordUpdates := map[string]interface{}{}
	if strings.TrimSpace(req.WorkingDiagnosis) != "" && (req.DiagnosisType == "primer" || strings.TrimSpace(record.WorkingDiagnosis) == "") {
		recordUpdates["working_diagnosis"] = req.WorkingDiagnosis
	}
	if strings.TrimSpace(req.DifferentialDiagnosis) != "" && (req.DiagnosisType == "primer" || strings.TrimSpace(record.DifferentialDiagnosis) == "") {
		recordUpdates["differential_diagnosis"] = req.DifferentialDiagnosis
	}
	if strings.TrimSpace(req.AssessmentNarrative) != "" && (req.DiagnosisType == "primer" || strings.TrimSpace(record.Assessment) == "") {
		recordUpdates["assessment"] = req.AssessmentNarrative
	}
	if len(recordUpdates) > 0 {
		database.DB.Model(&record).Updates(recordUpdates)
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
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal"})
		return
	}

	if sectionType := normalizeMedicalRecordSection(record.SectionType); sectionType != "assessment" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Diagnosis hanya dapat dihapus pada entri assessment"})
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
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal"})
		return
	}

	if sectionType := normalizeMedicalRecordSection(record.SectionType); sectionType != "prescription" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Resep hanya dapat ditambahkan pada entri resep"})
		return
	}

	if isPrescriptionWorkflowLocked(record.PrescriptionWorkflowStatus) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep sudah dikirim atau diproses. Buat entri baru untuk revisi"})
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
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal"})
		return
	}

	if sectionType := normalizeMedicalRecordSection(record.SectionType); sectionType != "prescription" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Resep hanya dapat dihapus pada entri resep"})
		return
	}

	if isPrescriptionWorkflowLocked(record.PrescriptionWorkflowStatus) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order resep sudah dikirim atau diproses. Buat entri baru untuk revisi"})
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
	MedicalServiceID uint                                 `json:"medical_service_id" binding:"required"`
	Quantity         int                                  `json:"quantity"`
	Notes            string                               `json:"notes"`
	ParameterValues  []MedicalActionParameterValueRequest `json:"parameter_values"`
	Targets          []MedicalActionTargetRequest         `json:"targets"`
	OdontogramSync   *MedicalActionOdontogramSyncRequest  `json:"odontogram_sync"`
}

type MedicalActionParameterValueRequest struct {
	MedicalServiceParameterID *uint  `json:"medical_service_parameter_id"`
	ResultValue               string `json:"result_value"`
	ResultNotes               string `json:"result_notes"`
}

type medicalActionSaveResult struct {
	OdontogramEntry          *models.OdontogramEntry
	InformedConsent          *models.InformedConsent
	RemovedInformedConsentID uint
}

func loadMedicalActionWithRelations(actionID uint) (models.MedicalAction, error) {
	var action models.MedicalAction
	err := database.DB.
		Preload("ParameterValues", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("ParameterValues.MedicalServiceParameter").
		Preload("Targets").
		Preload("MedicalService").
		Preload("MedicalService.Parameters", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("MedicalService.Category").
		Preload("Doctor").
		First(&action, actionID).Error
	return action, err
}

func syncMedicalActionParameterValuesTx(tx *gorm.DB, actionID uint, service models.MedicalService, requests []MedicalActionParameterValueRequest) ([]models.MedicalActionParameterValue, error) {
	if err := tx.Where("medical_action_id = ?", actionID).Delete(&models.MedicalActionParameterValue{}).Error; err != nil {
		return nil, err
	}

	if len(service.Parameters) == 0 {
		return []models.MedicalActionParameterValue{}, nil
	}

	requestByParameterID := make(map[uint]MedicalActionParameterValueRequest, len(requests))
	for _, request := range requests {
		if request.MedicalServiceParameterID == nil || *request.MedicalServiceParameterID == 0 {
			continue
		}
		requestByParameterID[*request.MedicalServiceParameterID] = request
	}

	parameterValues := make([]models.MedicalActionParameterValue, 0, len(service.Parameters))
	for _, parameter := range service.Parameters {
		parameterID := parameter.ID
		request, ok := requestByParameterID[parameter.ID]
		if !ok {
			request = MedicalActionParameterValueRequest{}
		}

		parameterValues = append(parameterValues, models.MedicalActionParameterValue{
			MedicalActionID:           actionID,
			MedicalServiceParameterID: &parameterID,
			ParameterCodeSnapshot:     strings.TrimSpace(parameter.Code),
			ParameterNameSnapshot:     strings.TrimSpace(parameter.Name),
			InputTypeSnapshot:         strings.TrimSpace(parameter.InputType),
			UnitSnapshot:              strings.TrimSpace(parameter.Unit),
			SortOrder:                 parameter.SortOrder,
			IsRequired:                parameter.IsRequired,
			ResultValue:               strings.TrimSpace(request.ResultValue),
			ResultNotes:               strings.TrimSpace(request.ResultNotes),
		})
	}

	if len(parameterValues) == 0 {
		return []models.MedicalActionParameterValue{}, nil
	}

	if err := tx.Create(&parameterValues).Error; err != nil {
		return nil, err
	}

	return parameterValues, nil
}

func saveMedicalAction(record models.MedicalRecord, action *models.MedicalAction, request MedicalActionRequest) (*medicalActionSaveResult, error) {
	var service models.MedicalService
	if err := database.DB.
		Preload("Category").
		Preload("Parameters", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		First(&service, request.MedicalServiceID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errMedicalActionServiceNotFound
		}
		return nil, err
	}
	if !service.IsActive {
		return nil, errMedicalActionServiceInactive
	}
	if !isProcedureEligibleMedicalService(service) {
		return nil, errMedicalActionServiceNotSupported
	}

	quantity := request.Quantity
	if quantity <= 0 {
		quantity = 1
	}

	action.MedicalRecordID = record.ID
	action.MedicalServiceID = service.ID
	action.DoctorID = record.DoctorID
	action.ServiceCodeSnapshot = strings.TrimSpace(service.Code)
	action.ServiceNameSnapshot = strings.TrimSpace(service.Name)
	action.ServiceDomainSnapshot = resolveMedicalServiceDomain(service.ServiceDomain)
	action.TargetScopeSnapshot = resolveMedicalServiceTargetScope(service.TargetScope)
	action.RequiresConsentSnapshot = service.RequiresConsent
	action.SupportsOdontogramSyncSnapshot = service.SupportsOdontogramSync
	action.Quantity = quantity
	action.Price = service.Price
	action.Notes = strings.TrimSpace(request.Notes)

	tx := database.DB.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}

	var err error
	if action.ID == 0 {
		err = tx.Create(action).Error
	} else {
		err = tx.Save(action).Error
	}
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	targets, err := syncMedicalActionTargetsTx(tx, action.ID, action.TargetScopeSnapshot, request.Targets)
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	if _, err := syncMedicalActionParameterValuesTx(tx, action.ID, service, request.ParameterValues); err != nil {
		tx.Rollback()
		return nil, err
	}

	syncedOdontogramEntry, err := applyMedicalActionOdontogramSyncTx(tx, record, service, targets, request.OdontogramSync)
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	// Auto-generate odontogram from dental action targets when no explicit sync was requested
	if syncedOdontogramEntry == nil && shouldAutoGenerateOdontogramFromTargets(service, targets) {
		autoEntry, autoErr := autoGenerateOdontogramFromDentalTargetsTx(tx, record, service, targets)
		if autoErr == nil && autoEntry != nil {
			syncedOdontogramEntry = autoEntry
		}
		// Non-fatal: do not rollback if auto-generation fails
	}

	informedConsent, removedInformedConsentID, err := syncMedicalActionInformedConsentTx(tx, record, action, service, targets)
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return &medicalActionSaveResult{
		OdontogramEntry:          syncedOdontogramEntry,
		InformedConsent:          informedConsent,
		RemovedInformedConsentID: removedInformedConsentID,
	}, nil
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
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal"})
		return
	}

	if sectionType := normalizeMedicalRecordSection(record.SectionType); sectionType != "procedure" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tindakan hanya dapat ditambahkan pada entri tindakan"})
		return
	}

	var req MedicalActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	action := models.MedicalAction{
		MedicalRecordID: uint(recordID),
	}

	saveResult, err := saveMedicalAction(record, &action, req)
	if err != nil {
		switch {
		case errors.Is(err, errMedicalActionServiceNotFound):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Layanan medis tidak ditemukan"})
		case errors.Is(err, errMedicalActionServiceInactive):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Layanan medis tidak aktif"})
		case errors.Is(err, errMedicalActionServiceNotSupported):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Layanan yang dipilih tidak dapat dicatat sebagai tindakan"})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}

	action, err = loadMedicalActionWithRelations(action.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data":                        action,
		"message":                     "Tindakan berhasil ditambahkan",
		"odontogram_entry":            saveResult.OdontogramEntry,
		"informed_consent":            saveResult.InformedConsent,
		"removed_informed_consent_id": saveResult.RemovedInformedConsentID,
	})
}

func UpdateMedicalAction(c *gin.Context) {
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
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal"})
		return
	}

	if sectionType := normalizeMedicalRecordSection(record.SectionType); sectionType != "procedure" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tindakan hanya dapat diubah pada entri tindakan"})
		return
	}

	var action models.MedicalAction
	if err := database.DB.Where("id = ? AND medical_record_id = ?", actionID, recordID).First(&action).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tindakan tidak ditemukan"})
		return
	}

	var req MedicalActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	saveResult, err := saveMedicalAction(record, &action, req)
	if err != nil {
		switch {
		case errors.Is(err, errMedicalActionServiceNotFound):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Layanan medis tidak ditemukan"})
		case errors.Is(err, errMedicalActionServiceInactive):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Layanan medis tidak aktif"})
		case errors.Is(err, errMedicalActionServiceNotSupported):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Layanan yang dipilih tidak dapat dicatat sebagai tindakan"})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}

	action, err = loadMedicalActionWithRelations(action.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":                        action,
		"message":                     "Tindakan berhasil diperbarui",
		"odontogram_entry":            saveResult.OdontogramEntry,
		"informed_consent":            saveResult.InformedConsent,
		"removed_informed_consent_id": saveResult.RemovedInformedConsentID,
	})
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
	if record.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal"})
		return
	}

	if sectionType := normalizeMedicalRecordSection(record.SectionType); sectionType != "procedure" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tindakan hanya dapat dihapus pada entri tindakan"})
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	var action models.MedicalAction
	if err := tx.Where("id = ? AND medical_record_id = ?", actionID, recordID).First(&action).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"error": "Tindakan tidak ditemukan"})
		return
	}

	// Load targets before deletion for odontogram cleanup
	var deletedTargets []models.MedicalActionTarget
	if err := tx.Where("medical_action_id = ?", action.ID).Find(&deletedTargets).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var removedInformedConsentID uint
	var informedConsent models.InformedConsent
	if err := tx.Where("medical_action_id = ?", action.ID).First(&informedConsent).Error; err != nil {
		if err != gorm.ErrRecordNotFound {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		removedInformedConsentID = informedConsent.ID
		if err := tx.Delete(&informedConsent).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Where("medical_action_id = ?", action.ID).Delete(&models.MedicalActionTarget{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Delete(&action).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Cleanup auto-generated odontogram teeth that are no longer referenced
	if len(deletedTargets) > 0 {
		if err := cleanupAutoGeneratedOdontogramOnDeleteTx(tx, record.VisitID, deletedTargets); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Tindakan berhasil dihapus", "removed_informed_consent_id": removedInformedConsentID})
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
		Preload("Prescriptions").
		Preload("Prescriptions.Medicine").
		Preload("PrescriptionCompounds").
		Preload("PrescriptionCompounds.Items").
		Preload("PrescriptionCompounds.Items.Medicine").
		Preload("Actions").
		Preload("Actions.MedicalService").
		Preload("Actions.Doctor").
		Where("patient_id = ? OR visit_id IN (SELECT id FROM visits WHERE patient_id = ?)", patientID, patientID).
		Order("record_date DESC").
		Order("created_at DESC").
		Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": records})
}
