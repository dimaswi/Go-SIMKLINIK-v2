package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
)

const (
	initialAssessmentPDFMarginLeft   = 10.0
	initialAssessmentPDFMarginTop    = 8.0
	initialAssessmentPDFMarginRight  = 10.0
	initialAssessmentPDFMarginBottom = 10.0
	initialAssessmentPDFContentStart = 36.0
	initialAssessmentPDFPageStart    = 10.0
)

var initialAssessmentPDFPageStartOverrides sync.Map

var initialAssessmentPDFTextReplacer = strings.NewReplacer(
	"\u00a0", " ",
	"·", " - ",
	"•", " - ",
	"–", "-",
	"—", "-",
	"−", "-",
	"≤", "<=",
	"≥", ">=",
	"≠", "!=",
	"≈", "~",
	"“", "\"",
	"”", "\"",
	"‘", "'",
	"’", "'",
	"…", "...",
	"×", "x",
	"✕", "x",
	"✖", "x",
	"⨯", "x",
	"±", "+/-",
	"°C", " C",
	"°c", " C",
	"°", " ",
	"µ", "u",
	"μ", "u",
)

type initialAssessmentHospitalInfo struct {
	Name     string
	Address  string
	City     string
	Phone    string
	Fax      string
	Email    string
	Website  string
	LogoPath string
	LogoType string
}

type printHeaderPreviewRequest struct {
	AppName         string `json:"app_name"`
	HospitalName    string `json:"hospital_name"`
	HospitalAddress string `json:"hospital_address"`
	HospitalCity    string `json:"hospital_city"`
	HospitalPhone   string `json:"hospital_phone"`
	HospitalFax     string `json:"hospital_fax"`
	HospitalEmail   string `json:"hospital_email"`
	HospitalWebsite string `json:"hospital_website"`
	PrintLogo       string `json:"app_print_logo"`
	AppLogo         string `json:"app_logo"`
}

type initialAssessmentPrintField struct {
	Label string
	Value string
}

type initialAssessmentPrintMarkerView struct {
	Number int
	Label  string
	PosX   float64
	PosY   float64
}

type initialAssessmentPrintImageView struct {
	Name        string
	Category    string
	Location    string
	Description string
	Notes       string
	FilePath    string
	ImageType   string
	Markers     []initialAssessmentPrintMarkerView
}

type initialAssessmentPrintDiagnosisView struct {
	Type                  string
	Code                  string
	Name                  string
	WorkingDiagnosis      string
	DifferentialDiagnosis string
	AssessmentNarrative   string
	Notes                 string
}

type initialAssessmentPrintViewData struct {
	GeneratedAt        time.Time
	SheetKey           string
	Visit              models.Visit
	EntryLabel         string
	EntryRecordDate    *time.Time
	PatientAge         string
	PatientAddress     string
	VisitFields        []initialAssessmentPrintField
	PatientFields      []initialAssessmentPrintField
	AnamnesisFields    []initialAssessmentPrintField
	PhysicalExamFields []initialAssessmentPrintField
	AssessmentFields   []initialAssessmentPrintField
	PhysicalExamImages []initialAssessmentPrintImageView
	Diagnoses          []initialAssessmentPrintDiagnosisView
	HasAnamnesis       bool
	HasPhysicalExam    bool
	HasAssessment      bool
	PrintedByLabel     string
}

var initialAssessmentSectionOrder = []string{"anamnesis", "physical_exam", "assessment"}
var suratSectionOrder = []string{"assessment", "outcome"}

type suratPrintViewData struct {
	GeneratedAt        time.Time
	Visit              models.Visit
	EntryGroupKey      string
	EntryRecordDate    *time.Time
	SuratType          string
	SuratTypeLabel     string
	OfficialNumber     string
	PrintedByLabel     string
	ValidationBaseURL  string
	AssessmentRecord   *models.MedicalRecord
	OutcomeRecord      *models.MedicalRecord
	PhysicalExamRecord *models.MedicalRecord
	DocumentFields     []initialAssessmentPrintField
	PatientFields      []initialAssessmentPrintField
	VisitFields        []initialAssessmentPrintField
	AssessmentFields   []initialAssessmentPrintField
	OutcomeFields      []initialAssessmentPrintField
	StatementTemplate  string
}

func PreviewPrintHeaderPDF(c *gin.Context) {
	var request printHeaderPreviewRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hospitalInfo := buildInitialAssessmentHospitalInfoFromPreview(request)
	pdfBytes, fileName, err := renderPrintHeaderPreviewPDF(hospitalInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat contoh PDF KOP"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func PrintInitialAssessmentEntry(c *gin.Context) {
	visitID, err := strconv.ParseUint(c.Param("visitId"), 10, 64)
	if err != nil || visitID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	requestedSheetKey := normalizeMedicalRecordSheetKey(c.Query("sheet_key"))
	entryGroupKey := strings.TrimSpace(c.Query("entry_group_key"))
	recordIDs := parseMedicalRecordPrintIDs(c.Query("record_ids"))
	if entryGroupKey == "" && len(recordIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parameter entri cetak tidak lengkap"})
		return
	}

	var visit models.Visit
	if err := database.DB.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		First(&visit, uint(visitID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	records, err := getInitialAssessmentRecordsForPrint(uint(visitID), entryGroupKey, recordIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(records) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri pengkajian awal tidak ditemukan"})
		return
	}

	resolvedSheetKey := requestedSheetKey
	if resolvedSheetKey == "" {
		for _, record := range records {
			resolvedSheetKey = resolveInitialAssessmentSheetKey(record.SheetKey, record.EntryGroupKey)
			if resolvedSheetKey != "" {
				break
			}
		}
	}
	if resolvedSheetKey == "" {
		resolvedSheetKey = resolveInitialAssessmentSheetKey("", entryGroupKey)
	}

	viewData := buildInitialAssessmentPrintViewData(c, visit, resolvedSheetKey, entryGroupKey, records)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderInitialAssessmentEntryPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF pengkajian awal"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func PrintSuratEntry(c *gin.Context) {
	visitID, err := strconv.ParseUint(c.Param("visitId"), 10, 64)
	if err != nil || visitID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	entryGroupKey := strings.TrimSpace(c.Query("entry_group_key"))
	recordIDs := parseMedicalRecordPrintIDs(c.Query("record_ids"))
	if entryGroupKey == "" && len(recordIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parameter entri cetak tidak lengkap"})
		return
	}

	var visit models.Visit
	if err := database.DB.
		Preload("Patient").
		Preload("Doctor.Employee").
		Preload("Doctor").
		Preload("Polyclinic").
		First(&visit, uint(visitID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	records, err := getSuratRecordsForPrint(uint(visitID), entryGroupKey, recordIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(records) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri surat tidak ditemukan"})
		return
	}

	resolvedEntryGroupKey := strings.TrimSpace(entryGroupKey)
	if resolvedEntryGroupKey == "" {
		for _, record := range records {
			if trimmed := strings.TrimSpace(record.EntryGroupKey); trimmed != "" {
				resolvedEntryGroupKey = trimmed
				break
			}
		}
	}

	hospitalInfo := getInitialAssessmentHospitalInfo()
	viewData := buildSuratPrintViewData(c, visit, resolvedEntryGroupKey, records, hospitalInfo)
	pdfBytes, fileName, err := renderSuratEntryPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF surat"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func parseMedicalRecordPrintIDs(rawValue string) []uint {
	trimmed := strings.TrimSpace(rawValue)
	if trimmed == "" {
		return nil
	}

	parts := strings.Split(trimmed, ",")
	ids := make([]uint, 0, len(parts))
	for _, part := range parts {
		parsed, err := strconv.ParseUint(strings.TrimSpace(part), 10, 64)
		if err != nil || parsed == 0 {
			continue
		}
		ids = append(ids, uint(parsed))
	}

	return ids
}

func getInitialAssessmentRecordsForPrint(visitID uint, entryGroupKey string, recordIDs []uint) ([]models.MedicalRecord, error) {
	query := preloadMedicalRecordRelations(database.DB).
		Where("visit_id = ?", visitID).
		Where("section_type IN ?", initialAssessmentSectionOrder).
		Order("record_date ASC").
		Order("created_at ASC")

	if entryGroupKey != "" && !strings.HasPrefix(entryGroupKey, "legacy-") {
		query = query.Where("entry_group_key = ?", entryGroupKey)
	} else if len(recordIDs) > 0 {
		query = query.Where("id IN ?", recordIDs)
	} else {
		return nil, fmt.Errorf("parameter entri cetak tidak valid")
	}

	var records []models.MedicalRecord
	if err := query.Find(&records).Error; err != nil {
		return nil, err
	}

	return records, nil
}

func getSuratRecordsForPrint(visitID uint, entryGroupKey string, recordIDs []uint) ([]models.MedicalRecord, error) {
	query := preloadMedicalRecordRelations(database.DB).
		Where("visit_id = ?", visitID).
		Where("sheet_key = ?", medicalRecordSheetKeySurat).
		Where("section_type IN ?", suratSectionOrder).
		Order("record_date ASC").
		Order("created_at ASC")

	if entryGroupKey != "" {
		query = query.Where("entry_group_key = ?", entryGroupKey)
	} else if len(recordIDs) > 0 {
		query = query.Where("id IN ?", recordIDs)
	} else {
		return nil, fmt.Errorf("parameter entri cetak tidak valid")
	}

	var records []models.MedicalRecord
	if err := query.Find(&records).Error; err != nil {
		return nil, err
	}

	return records, nil
}

func buildInitialAssessmentPrintViewData(c *gin.Context, visit models.Visit, sheetKey string, entryGroupKey string, records []models.MedicalRecord) initialAssessmentPrintViewData {
	bySection := make(map[string]*models.MedicalRecord, len(initialAssessmentSectionOrder))
	for index := range records {
		record := &records[index]
		sectionKey := normalizeMedicalRecordSection(record.SectionType)
		if bySection[sectionKey] == nil {
			bySection[sectionKey] = record
		}
	}

	anamnesis := bySection["anamnesis"]
	physicalExam := bySection["physical_exam"]
	assessment := bySection["assessment"]
	entryRecordDate := firstNonZeroRecordDate(anamnesis, physicalExam, assessment)
	resolvedEntryLabel := resolveInitialAssessmentEntryLabel(entryGroupKey, records)
	printedBy := resolvePrintedByLabel(c)

	return initialAssessmentPrintViewData{
		GeneratedAt:        time.Now(),
		SheetKey:           normalizeMedicalRecordSheetKey(sheetKey),
		Visit:              visit,
		EntryLabel:         resolvedEntryLabel,
		EntryRecordDate:    entryRecordDate,
		PatientAge:         calculatePatientAgeLabel(visit.Patient.BirthDate),
		PatientAddress:     formatPatientAddress(visit.Patient),
		VisitFields:        buildInitialAssessmentVisitFields(visit),
		PatientFields:      buildInitialAssessmentPatientFields(visit.Patient),
		AnamnesisFields:    buildInitialAssessmentAnamnesisFields(anamnesis),
		PhysicalExamFields: buildInitialAssessmentPhysicalExamFields(physicalExam),
		AssessmentFields:   buildInitialAssessmentAssessmentFields(assessment),
		PhysicalExamImages: buildInitialAssessmentImageViews(physicalExam),
		Diagnoses:          buildInitialAssessmentDiagnosisViews(assessment),
		HasAnamnesis:       anamnesis != nil,
		HasPhysicalExam:    physicalExam != nil,
		HasAssessment:      assessment != nil,
		PrintedByLabel:     printedBy,
	}
}

func buildSuratPrintViewData(c *gin.Context, visit models.Visit, entryGroupKey string, records []models.MedicalRecord, hospitalInfo initialAssessmentHospitalInfo) suratPrintViewData {
	bySection := make(map[string]*models.MedicalRecord, len(suratSectionOrder))
	for index := range records {
		record := &records[index]
		sectionKey := normalizeMedicalRecordSection(record.SectionType)
		if bySection[sectionKey] == nil {
			bySection[sectionKey] = record
		}
	}

	assessmentRecord := bySection["assessment"]
	outcomeRecord := bySection["outcome"]
	suratType := inferSuratTypeFromEntryGroupKey(entryGroupKey)
	if suratType == "" {
		for _, record := range records {
			if inferred := inferSuratTypeFromEntryGroupKey(record.EntryGroupKey); inferred != "" {
				suratType = inferred
				break
			}
		}
	}

	// Ambil pemeriksaan fisik / tanda vital terbaru pada kunjungan ini
	var physicalExamRecord *models.MedicalRecord
	var exam models.MedicalRecord
	if err := database.DB.Where("visit_id = ? AND (bp_systolic > 0 OR weight > 0 OR section_type = 'physical_exam')", visit.ID).
		Order("updated_at DESC").Order("created_at DESC").First(&exam).Error; err == nil {
		physicalExamRecord = &exam
	}

	// Jika assessmentRecord sendiri memiliki tanda vital spesifik yang diinput untuk surat, gunakan/gabungkan
	if assessmentRecord != nil && (assessmentRecord.BPSystolic > 0 || assessmentRecord.Weight > 0 || assessmentRecord.Height > 0) {
		if physicalExamRecord == nil {
			physicalExamRecord = assessmentRecord
		} else {
			merged := *physicalExamRecord
			if assessmentRecord.BPSystolic > 0 {
				merged.BPSystolic = assessmentRecord.BPSystolic
				merged.BPDiastolic = assessmentRecord.BPDiastolic
			}
			if assessmentRecord.HeartRate > 0 {
				merged.HeartRate = assessmentRecord.HeartRate
			}
			if assessmentRecord.Weight > 0 {
				merged.Weight = assessmentRecord.Weight
			}
			if assessmentRecord.Height > 0 {
				merged.Height = assessmentRecord.Height
			}
			physicalExamRecord = &merged
		}
	}

	officialNumber := generateOfficialSuratNumber(hospitalInfo, suratType, visit, visit.ID)
	generatedAt := time.Now()
	printedBy := resolvePrintedByLabel(c)

	return suratPrintViewData{
		GeneratedAt:        generatedAt,
		Visit:              visit,
		EntryGroupKey:      entryGroupKey,
		EntryRecordDate:    firstNonZeroRecordDate(assessmentRecord, outcomeRecord),
		SuratType:          suratType,
		SuratTypeLabel:     getSuratTypeLabel(suratType),
		OfficialNumber:     officialNumber,
		PrintedByLabel:     printedBy,
		ValidationBaseURL:  resolveTTEVerificationBaseURLForRequest(c),
		AssessmentRecord:   assessmentRecord,
		OutcomeRecord:      outcomeRecord,
		PhysicalExamRecord: physicalExamRecord,
		DocumentFields:     buildSuratDocumentFields(generatedAt, printedBy, suratType, entryGroupKey),
		PatientFields:      buildInitialAssessmentPatientFields(visit.Patient),
		VisitFields:        buildSuratVisitFields(visit),
		AssessmentFields:   buildSuratAssessmentFields(assessmentRecord, suratType),
		OutcomeFields:      buildSuratOutcomeFields(outcomeRecord, suratType),
		StatementTemplate:  buildSuratStatementTemplate(visit, suratType),
	}
}

func buildSuratVisitFields(visit models.Visit) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "No. Kunjungan", Value: fallbackText(visit.VisitNumber)},
		{Label: "Tanggal Kunjungan", Value: formatVisitDateForPrint(visit.VisitDate)},
		{Label: "Poliklinik", Value: fallbackText(visit.Polyclinic.Name)},
		{Label: "Dokter", Value: fallbackText(visit.Doctor.FullName)},
		{Label: "Jenis Kunjungan", Value: formatVisitTypeForPrint(visit.VisitType)},
		{Label: "Pembiayaan", Value: formatPaymentTypeForPrint(visit.PaymentType)},
	}
}

type suratPrintFieldLabels struct {
	assessmentSummaryLabel string
	purposeLabel           string
	assessmentNoteLabel    string
	outcomeSummaryLabel    string
	validityLabel          string
	outcomeNoteLabel       string
}

func buildSuratPrintFieldLabels(suratType string) suratPrintFieldLabels {
	switch normalizeSuratTypeValue(suratType) {
	case medicalRecordEntryGroupPrefixSuratSakit:
		return suratPrintFieldLabels{
			assessmentSummaryLabel: "Keterangan",
			purposeLabel:           "Kebutuhan Administratif",
			assessmentNoteLabel:    "Catatan Tambahan",
			outcomeSummaryLabel:    "Kalimat Keterangan",
			validityLabel:          "Durasi / Instruksi Istirahat",
			outcomeNoteLabel:       "Catatan Administratif",
		}
	case medicalRecordEntryGroupPrefixSuratSehat:
		return suratPrintFieldLabels{
			assessmentSummaryLabel: "Dasar Pernyataan Sehat",
			purposeLabel:           "Peruntukan Surat Sehat",
			assessmentNoteLabel:    "Catatan Tambahan",
			outcomeSummaryLabel:    "Kalimat Keterangan",
			validityLabel:          "Masa Berlaku Keterangan",
			outcomeNoteLabel:       "Catatan Administratif",
		}
	case medicalRecordEntryGroupPrefixSuratMCU:
		return suratPrintFieldLabels{
			assessmentSummaryLabel: "Ringkasan Hasil MCU",
			purposeLabel:           "Ruang Lingkup MCU",
			assessmentNoteLabel:    "Catatan Tambahan",
			outcomeSummaryLabel:    "Kalimat Keterangan",
			validityLabel:          "Masa Berlaku Hasil MCU",
			outcomeNoteLabel:       "Catatan Administratif",
		}
	case medicalRecordEntryGroupPrefixSuratButaWarna:
		return suratPrintFieldLabels{
			assessmentSummaryLabel: "Ringkasan Pemeriksaan Buta Warna",
			purposeLabel:           "Kebutuhan Surat Buta Warna",
			assessmentNoteLabel:    "Catatan Tambahan Skrining",
			outcomeSummaryLabel:    "Kalimat Hasil Skrining",
			validityLabel:          "Masa Berlaku Surat",
			outcomeNoteLabel:       "Catatan Administratif",
		}
	case medicalRecordEntryGroupPrefixSuratRujukan:
		return suratPrintFieldLabels{
			assessmentSummaryLabel: "Diagnosis / Temuan Klinis",
			purposeLabel:           "Rumah Sakit / Faskes Tujuan",
			assessmentNoteLabel:    "Terapi / Tindakan Diberikan",
			outcomeSummaryLabel:    "Alasan / Permohonan Rujukan",
			validityLabel:          "Poli / Spesialis Tujuan",
			outcomeNoteLabel:       "Catatan Tambahan Rujukan",
		}
	default:
		return suratPrintFieldLabels{
			assessmentSummaryLabel: "Dasar Pertimbangan Dokter",
			purposeLabel:           "Peruntukan / Keperluan Surat",
			assessmentNoteLabel:    "Catatan Tambahan",
			outcomeSummaryLabel:    "Kalimat Keterangan",
			validityLabel:          "Masa Berlaku / Instruksi",
			outcomeNoteLabel:       "Catatan Administratif",
		}
	}
}

func buildSuratAssessmentFields(record *models.MedicalRecord, suratType string) []initialAssessmentPrintField {
	if record == nil {
		return nil
	}

	labels := buildSuratPrintFieldLabels(suratType)

	return []initialAssessmentPrintField{
		{Label: labels.assessmentSummaryLabel, Value: fallbackText(record.Assessment)},
		{Label: labels.purposeLabel, Value: fallbackText(record.Plan)},
		{Label: labels.assessmentNoteLabel, Value: fallbackText(record.Notes)},
	}
}

func buildSuratOutcomeFields(record *models.MedicalRecord, suratType string) []initialAssessmentPrintField {
	if record == nil {
		return nil
	}

	labels := buildSuratPrintFieldLabels(suratType)
	validityPeriod := formatSuratValidityPeriod(record.ReferralDestination, record.ReferralReason)
	validityDescription := strings.TrimSpace(record.FollowUpInstruction)
	if validityDescription == "" {
		validityDescription = "-"
	}

	return []initialAssessmentPrintField{
		{Label: "Status Surat", Value: formatSuratDisposition(record.Disposition)},
		{Label: labels.outcomeSummaryLabel, Value: fallbackText(record.DischargeCondition)},
		{Label: "Periode Berlaku", Value: validityPeriod},
		{Label: labels.validityLabel, Value: validityDescription},
		{Label: labels.outcomeNoteLabel, Value: fallbackText(record.Notes)},
	}
}

func formatSuratValidityPeriod(startDate string, endDate string) string {
	start := strings.TrimSpace(startDate)
	end := strings.TrimSpace(endDate)

	if start == "" && end == "" {
		return "-"
	}

	startLabel := start
	if parsedStart, err := time.Parse("2006-01-02", start); err == nil {
		startLabel = formatDateIndonesian(parsedStart)
	}

	endLabel := end
	if parsedEnd, err := time.Parse("2006-01-02", end); err == nil {
		endLabel = formatDateIndonesian(parsedEnd)
	}

	if startLabel == "" {
		return endLabel
	}
	if endLabel == "" {
		return startLabel
	}

	return startLabel + " s/d " + endLabel
}

func formatSuratDisposition(value string) string {
	normalized := strings.TrimSpace(strings.ToLower(value))
	switch normalized {
	case "surat_diterbitkan":
		return "Surat Diterbitkan"
	case "surat_ditunda":
		return "Surat Ditunda"
	case "surat_tidak_diterbitkan":
		return "Surat Tidak Diterbitkan"
	default:
		return fallbackText(value)
	}
}

func buildSuratDocumentFields(generatedAt time.Time, printedBy string, suratType string, _ string) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Jenis Dokumen", Value: getSuratTypeLabel(suratType)},
		{Label: "Tanggal Cetak", Value: formatDateTimeIndonesian(generatedAt)},
		{Label: "Petugas Cetak", Value: fallbackText(printedBy)},
	}
}

func buildSuratStatementTemplate(visit models.Visit, suratType string) string {
	patientName := fallbackText(visit.Patient.FullName)
	visitNumber := fallbackText(visit.VisitNumber)

	switch suratType {
	case medicalRecordEntryGroupPrefixSuratSakit:
		return "Berdasarkan pemeriksaan klinis pada kunjungan " + visitNumber + ", pasien atas nama " + patientName + " dianjurkan beristirahat sesuai evaluasi dokter pemeriksa."
	case medicalRecordEntryGroupPrefixSuratSehat:
		return "Berdasarkan pemeriksaan klinis pada kunjungan " + visitNumber + ", pasien atas nama " + patientName + " dinyatakan dalam kondisi sehat sesuai hasil evaluasi dokter pemeriksa."
	case medicalRecordEntryGroupPrefixSuratMCU:
		return "Dokumen ini merupakan ringkasan surat MCU pasien atas nama " + patientName + " pada kunjungan " + visitNumber + ". Detail pemeriksaan mengikuti hasil penilaian klinis dokter."
	case medicalRecordEntryGroupPrefixSuratButaWarna:
		return "Dokumen ini merupakan surat hasil skrining buta warna pasien atas nama " + patientName + " pada kunjungan " + visitNumber + ". Hasil akhir mengikuti pemeriksaan dokter."
	case medicalRecordEntryGroupPrefixSuratRujukan:
		return "Bersama ini kami hadapkan pasien atas nama " + patientName + " pada kunjungan " + visitNumber + " untuk mendapatkan pemeriksaan dan penanganan spesialis lebih lanjut."
	default:
		return "Dokumen ini merupakan surat keterangan medis pasien atas nama " + patientName + " pada kunjungan " + visitNumber + "."
	}
}

type suratPDFSectionMeta struct {
	assessmentTitle string
	assessmentEmpty string
	outcomeTitle    string
	outcomeEmpty    string
}

func buildSuratPDFSectionMeta(suratType string) suratPDFSectionMeta {
	switch normalizeSuratTypeValue(suratType) {
	case medicalRecordEntryGroupPrefixSuratSakit:
		return suratPDFSectionMeta{
			assessmentTitle: "PERTIMBANGAN SURAT SAKIT",
			assessmentEmpty: "Pertimbangan surat sakit belum diisi.",
			outcomeTitle:    "KETERANGAN SURAT SAKIT",
			outcomeEmpty:    "Keterangan surat sakit belum diisi.",
		}
	case medicalRecordEntryGroupPrefixSuratSehat:
		return suratPDFSectionMeta{
			assessmentTitle: "PERTIMBANGAN SURAT SEHAT",
			assessmentEmpty: "Pertimbangan surat sehat belum diisi.",
			outcomeTitle:    "KETERANGAN SURAT SEHAT",
			outcomeEmpty:    "Keterangan surat sehat belum diisi.",
		}
	case medicalRecordEntryGroupPrefixSuratMCU:
		return suratPDFSectionMeta{
			assessmentTitle: "PERTIMBANGAN SURAT MCU",
			assessmentEmpty: "Pertimbangan surat MCU belum diisi.",
			outcomeTitle:    "KETERANGAN SURAT MCU",
			outcomeEmpty:    "Keterangan surat MCU belum diisi.",
		}
	case medicalRecordEntryGroupPrefixSuratButaWarna:
		return suratPDFSectionMeta{
			assessmentTitle: "PERTIMBANGAN SKRINING BUTA WARNA",
			assessmentEmpty: "Pertimbangan skrining buta warna belum diisi.",
			outcomeTitle:    "HASIL SKRINING BUTA WARNA",
			outcomeEmpty:    "Hasil skrining buta warna belum diisi.",
		}
	case medicalRecordEntryGroupPrefixSuratRujukan:
		return suratPDFSectionMeta{
			assessmentTitle: "PERTIMBANGAN SURAT RUJUKAN",
			assessmentEmpty: "Pertimbangan surat rujukan belum diisi.",
			outcomeTitle:    "KETERANGAN SURAT RUJUKAN",
			outcomeEmpty:    "Keterangan surat rujukan belum diisi.",
		}
	default:
		return suratPDFSectionMeta{
			assessmentTitle: "PERTIMBANGAN SURAT",
			assessmentEmpty: "Pertimbangan surat belum diisi.",
			outcomeTitle:    "KETERANGAN SURAT",
			outcomeEmpty:    "Keterangan surat belum diisi.",
		}
	}
}

func getSuratClassificationCode(suratType string) string {
	switch normalizeSuratTypeValue(suratType) {
	case medicalRecordEntryGroupPrefixSuratSakit:
		return "SKS"
	case medicalRecordEntryGroupPrefixSuratSehat:
		return "SKD"
	case medicalRecordEntryGroupPrefixSuratMCU:
		return "MCU"
	case medicalRecordEntryGroupPrefixSuratButaWarna:
		return "SKBW"
	case medicalRecordEntryGroupPrefixSuratRujukan:
		return "SRK"
	case "kontrol", "surat-kontrol":
		return "SKK"
	default:
		return "SKD"
	}
}

func getRomanMonthNumber(month time.Month) string {
	romans := []string{"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}
	if month >= 1 && int(month) < len(romans) {
		return romans[month]
	}
	return "I"
}

func generateOfficialSuratNumber(hospitalInfo initialAssessmentHospitalInfo, suratType string, visit models.Visit, sequence uint) string {
	year := visit.VisitDate.Year()
	if year == 0 {
		year = time.Now().Year()
	}
	month := visit.VisitDate.Month()
	if month == 0 {
		month = time.Now().Month()
	}
	seq := sequence
	if seq == 0 {
		seq = visit.ID
	}

	suratCode := getSuratClassificationCode(suratType)
	romanMonth := getRomanMonthNumber(month)

	return fmt.Sprintf("%04d / %s / %s / %d", seq, suratCode, romanMonth, year)
}

func getOfficialSuratTitle(suratType string) string {
	switch normalizeSuratTypeValue(suratType) {
	case medicalRecordEntryGroupPrefixSuratSakit:
		return "SURAT KETERANGAN SAKIT"
	case medicalRecordEntryGroupPrefixSuratSehat:
		return "SURAT SEHAT"
	case medicalRecordEntryGroupPrefixSuratMCU:
		return "SURAT KETERANGAN DOKTER (MCU)"
	case medicalRecordEntryGroupPrefixSuratButaWarna:
		return "SURAT KETERANGAN BUTA WARNA"
	case medicalRecordEntryGroupPrefixSuratRujukan:
		return "SURAT RUJUKAN PASIEN"
	default:
		return "SURAT KETERANGAN DOKTER"
	}
}

func formatGenderIndonesian(gender string) string {
	normalized := strings.TrimSpace(strings.ToUpper(gender))
	switch normalized {
	case "L", "M", "LAKI-LAKI", "MALE":
		return "Laki-laki"
	case "P", "F", "PEREMPUAN", "FEMALE":
		return "Perempuan"
	default:
		if normalized != "" {
			return normalized
		}
		return "-"
	}
}

func formatTitleCase(s string) string {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return ""
	}
	words := strings.Fields(trimmed)
	for i, w := range words {
		lower := strings.ToLower(w)
		if lower == "kab." || lower == "kab" {
			words[i] = "Kab."
		} else if lower == "kec." || lower == "kec" {
			words[i] = "Kec."
		} else if lower == "kel." || lower == "kel" {
			words[i] = "Kel."
		} else if lower == "rt" || lower == "rt." {
			words[i] = "RT"
		} else if lower == "rw" || lower == "rw." {
			words[i] = "RW"
		} else if lower == "dki" || lower == "di" {
			words[i] = strings.ToUpper(lower)
		} else if len(w) > 0 {
			r := []rune(lower)
			r[0] = unicode.ToUpper(r[0])
			words[i] = string(r)
		}
	}
	return strings.Join(words, " ")
}

func formatReligionIndonesian(religion string) string {
	normalized := strings.TrimSpace(strings.ToLower(religion))
	switch normalized {
	case "islam":
		return "Islam"
	case "kristen", "protestan", "kristen protestan":
		return "Kristen"
	case "katolik", "kristen katolik":
		return "Katolik"
	case "hindu":
		return "Hindu"
	case "buddha", "budha":
		return "Buddha"
	case "konghucu", "khonghucu":
		return "Konghucu"
	default:
		if normalized == "" {
			return "-"
		}
		return formatTitleCase(normalized)
	}
}

func formatOccupationIndonesian(occupation string) string {
	trimmed := strings.TrimSpace(occupation)
	if trimmed == "" {
		return "-"
	}
	normalized := strings.ToLower(trimmed)
	normalized = strings.ReplaceAll(normalized, "_", " ")
	switch normalized {
	case "pns", "asn":
		return "PNS / ASN"
	case "tni":
		return "TNI"
	case "polri":
		return "POLRI"
	case "wiraswasta":
		return "Wiraswasta"
	case "belum bekerja", "belum/tidak bekerja":
		return "Belum / Tidak Bekerja"
	case "pelajar", "mahasiswa", "pelajar/mahasiswa":
		return "Pelajar / Mahasiswa"
	case "ibu rumah tangga", "irt":
		return "Ibu Rumah Tangga"
	default:
		return formatTitleCase(normalized)
	}
}

func cleanSakitDuration(instruction string) string {
	trimmed := strings.TrimSpace(instruction)
	if trimmed == "" {
		return "beberapa hari"
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "istirahat ") {
		trimmed = strings.TrimSpace(trimmed[10:])
	}
	if idx := strings.Index(trimmed, "("); idx > 0 {
		trimmed = strings.TrimSpace(trimmed[:idx])
	}
	if trimmed == "" {
		return "beberapa hari"
	}
	return trimmed
}

func formatPatientOfficialAddress(patient models.Patient) string {
	parts := make([]string, 0, 5)
	if trimmed := strings.TrimSpace(patient.Address); trimmed != "" {
		parts = append(parts, formatTitleCase(trimmed))
	}
	rtrw := ""
	if trimmed := strings.TrimSpace(patient.RT); trimmed != "" {
		rtrw += "RT " + trimmed
	}
	if trimmed := strings.TrimSpace(patient.RW); trimmed != "" {
		if rtrw != "" {
			rtrw += " / "
		}
		rtrw += "RW " + trimmed
	}
	if rtrw != "" {
		parts = append(parts, rtrw)
	}
	if trimmed := strings.TrimSpace(patient.Kelurahan); trimmed != "" {
		parts = append(parts, "Desa/Kel. "+formatTitleCase(trimmed))
	}
	if trimmed := strings.TrimSpace(patient.Kecamatan); trimmed != "" {
		parts = append(parts, "Kec. "+formatTitleCase(trimmed))
	}
	if trimmed := strings.TrimSpace(patient.City); trimmed != "" {
		parts = append(parts, formatTitleCase(trimmed))
	}
	if len(parts) == 0 {
		return "-"
	}
	return strings.Join(parts, ", ")
}

func formatDoctorOfficialName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "Dokter Pemeriksa"
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "dr.") || strings.HasPrefix(lower, "dr ") || strings.HasPrefix(lower, "drg.") || strings.HasPrefix(lower, "drg ") {
		return trimmed
	}
	return "dr. " + trimmed
}

func drawOfficialSuratKop(pdf *gofpdf.Fpdf, info initialAssessmentHospitalInfo) float64 {
	left, top, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	currentY := top + 1.0
	hasLogo := info.LogoPath != "" && info.LogoType != ""
	logoMaxHeight := 17.5
	logoMaxWidth := 20.0
	logoGap := 3.5

	logoWidth := 0.0
	logoHeight := 0.0
	if hasLogo {
		logoWidth, logoHeight = measureInitialAssessmentHeaderLogo(info.LogoPath, logoMaxHeight, logoMaxWidth)
	}

	textStartX := left
	if hasLogo && logoWidth > 0 {
		textStartX = left + logoWidth + logoGap
	}
	textWidth := (pageWidth - right) - textStartX

	type headerLine struct {
		text       string
		fontStyle  string
		fontSize   float64
		lineHeight float64
		r, g, b    int
	}

	lines := []headerLine{{
		text:       strings.ToUpper(fallbackText(info.Name)),
		fontStyle:  "B",
		fontSize:   13.5,
		lineHeight: 5.2,
		r:          0, g: 0, b: 0,
	}}

	addressParts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Address)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.City)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	if len(addressParts) > 0 {
		lines = append(lines, headerLine{
			text:       strings.Join(addressParts, ", "),
			fontStyle:  "",
			fontSize:   8.2,
			lineHeight: 3.7,
			r:          0, g: 0, b: 0,
		})
	}

	contactParts := make([]string, 0, 4)
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Phone)); trimmed != "" {
		contactParts = append(contactParts, "Telp: "+trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Fax)); trimmed != "" {
		contactParts = append(contactParts, "Fax: "+trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Email)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Website)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if len(contactParts) > 0 {
		lines = append(lines, headerLine{
			text:       strings.Join(contactParts, "  |  "),
			fontStyle:  "",
			fontSize:   8.0,
			lineHeight: 3.7,
			r:          0, g: 0, b: 0,
		})
	}

	textBlockHeight := 0.0
	for _, line := range lines {
		trimmedText := strings.TrimSpace(sanitizePDFText(line.text))
		if trimmedText == "" {
			continue
		}
		pdf.SetFont("Arial", line.fontStyle, line.fontSize)
		lineParts := pdf.SplitLines([]byte(trimmedText), textWidth)
		lineCount := len(lineParts)
		if lineCount < 1 {
			lineCount = 1
		}
		textBlockHeight += float64(lineCount) * line.lineHeight
	}

	headerBlockHeight := maxFloat64(textBlockHeight, logoHeight)

	if hasLogo && logoWidth > 0 {
		logoX := left
		logoY := currentY + ((headerBlockHeight - logoHeight) / 2)
		if logoY < top {
			logoY = top
		}
		drawInitialAssessmentHeaderLogo(pdf, info.LogoPath, info.LogoType, logoX, logoY, logoMaxHeight, logoMaxWidth)
	}

	textY := currentY + ((headerBlockHeight - textBlockHeight) / 2)
	pdf.SetXY(textStartX, textY)
	for _, line := range lines {
		trimmedText := strings.TrimSpace(sanitizePDFText(line.text))
		if trimmedText == "" {
			continue
		}
		pdf.SetX(textStartX)
		pdf.SetTextColor(line.r, line.g, line.b)
		pdf.SetFont("Arial", line.fontStyle, line.fontSize)
		pdf.MultiCell(textWidth, line.lineHeight, trimmedText, "", "L", false)
	}
	pdf.SetTextColor(0, 0, 0)

	// Garis pembatas Kop Resmi RS/Klinik Indonesia (1 garis tegas bersih, tidak mepet)
	lineY := currentY + headerBlockHeight + 2.2
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.5)
	pdf.Line(left, lineY, pageWidth-right, lineY)
	pdf.SetLineWidth(0.2)

	return lineY + 3.5
}

func drawOfficialDoctorSignature(pdf *gofpdf.Fpdf, x float64, y float64, width float64, city string, date time.Time, doctor models.Doctor, tteSignature *ttePrintSignatureInfo) {
	datePrefix := strings.TrimSpace(city)
	dateLabel := formatDateIndonesian(date)
	if datePrefix != "" {
		dateLabel = datePrefix + ", " + dateLabel
	}

	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Arial", "", 9.2)
	pdf.SetXY(x, y)
	pdf.CellFormat(width, 4.4, dateLabel, "", 1, "C", false, 0, "")

	pdf.SetXY(x, pdf.GetY())
	pdf.CellFormat(width, 4.4, "Dokter Pemeriksa,", "", 1, "C", false, 0, "")

	hasTTE := tteSignature != nil && hasTTEQRCode(tteSignature)
	if hasTTE {
		qrY := pdf.GetY() + 1.2
		drawTTESignatureAnnotation(pdf, x, qrY, width, tteSignature)
		qrSize := resolveTTESignatureQRCodeSize(width)
		pdf.SetY(qrY + qrSize + 1.5)
	} else {
		pdf.SetY(pdf.GetY() + 15.0)
	}

	pdf.SetTextColor(0, 0, 0)
	rawDoctorName := strings.TrimSpace(resolveTTEPrintSignatureName(tteSignature, doctor.FullName))
	docName := "( .................................................. )"
	if rawDoctorName != "" && rawDoctorName != "-" {
		docName = formatDoctorOfficialName(rawDoctorName)
		pdf.SetFont("Arial", "B", 9.5)
	} else {
		pdf.SetFont("Arial", "", 9.5)
	}

	pdf.SetXY(x, pdf.GetY())
	pdf.CellFormat(width, 4.5, docName, "", 1, "C", false, 0, "")

	nipOrSip := ""
	if nip := strings.TrimSpace(doctor.NIPNumber); nip != "" {
		nipOrSip = "NIP. " + nip
	} else if sip := strings.TrimSpace(doctor.SIPNumber); sip != "" {
		nipOrSip = "SIP. " + sip
	} else if nip := strings.TrimSpace(doctor.Employee.NIPNumber); nip != "" {
		nipOrSip = "NIP. " + nip
	} else if lic := strings.TrimSpace(doctor.Employee.LicenseNumber); lic != "" {
		nipOrSip = "SIP. " + lic
	}

	if nipOrSip != "" {
		pdf.SetFont("Arial", "", 8.5)
		pdf.SetXY(x, pdf.GetY())
		pdf.CellFormat(width, 3.8, nipOrSip, "", 1, "C", false, 0, "")
	}
	pdf.SetTextColor(0, 0, 0)
}

func renderSuratEntryPDF(hospitalInfo initialAssessmentHospitalInfo, data suratPrintViewData) ([]byte, string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)

	documentTitle := getOfficialSuratTitle(data.SuratType)
	tteSignature := (*ttePrintSignatureInfo)(nil)
	if strings.TrimSpace(data.EntryGroupKey) != "" {
		tteSignature = loadTTESignedSignatureByDocumentKeyWithBaseURL(buildTTESuratDocumentKey(data.Visit.ID, data.EntryGroupKey), data.ValidationBaseURL)
	}

	marginLeft := 16.0
	marginRight := 16.0
	marginTop := 10.0
	marginBottom := 10.0
	contentWidth := 210.0 - marginLeft - marginRight
	startX := marginLeft
	endX := 210.0 - marginRight

	pdf.SetMargins(marginLeft, marginTop, marginRight)
	pdf.SetAutoPageBreak(false, marginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle(documentTitle, false)
	pdf.SetAuthor(data.PrintedByLabel, false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.AddPage()

	kopBottomY := drawOfficialSuratKop(pdf, hospitalInfo)

	pdf.SetY(kopBottomY + 2.0)
	pdf.SetFont("Arial", "B", 12.5)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(contentWidth, 5.8, documentTitle, "", 1, "C", false, 0, "")

	pdf.SetFont("Arial", "", 9.2)
	pdf.CellFormat(contentWidth, 4.6, "Nomor : "+data.OfficialNumber, "", 1, "C", false, 0, "")

	suratTypeVal := normalizeSuratTypeValue(data.SuratType)
	isSuratRujukan := suratTypeVal == medicalRecordEntryGroupPrefixSuratRujukan
	isSuratSakit := suratTypeVal == medicalRecordEntryGroupPrefixSuratSakit
	isSuratButaWarna := suratTypeVal == medicalRecordEntryGroupPrefixSuratButaWarna

	destHospital := ""
	specialistPoli := ""
	if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.ReferralDestination) != "" {
		destHospital = strings.TrimSpace(data.OutcomeRecord.ReferralDestination)
	} else if data.AssessmentRecord != nil && strings.TrimSpace(data.AssessmentRecord.Plan) != "" {
		destHospital = strings.TrimSpace(data.AssessmentRecord.Plan)
	}

	if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.FollowUpInstruction) != "" {
		specialistPoli = strings.TrimSpace(data.OutcomeRecord.FollowUpInstruction)
	} else if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.ReferralReason) != "" {
		specialistPoli = strings.TrimSpace(data.OutcomeRecord.ReferralReason)
	}

	diagnosis := "-"
	if data.AssessmentRecord != nil && strings.TrimSpace(data.AssessmentRecord.Assessment) != "" {
		diagnosis = strings.TrimSpace(data.AssessmentRecord.Assessment)
	}

	alasanRujukan := "-"
	if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.DischargeCondition) != "" {
		alasanRujukan = strings.TrimSpace(data.OutcomeRecord.DischargeCondition)
	} else if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.ReferralReason) != "" {
		alasanRujukan = strings.TrimSpace(data.OutcomeRecord.ReferralReason)
	}

	terapiDiberikan := "-"
	if data.AssessmentRecord != nil && strings.TrimSpace(data.AssessmentRecord.Notes) != "" {
		terapiDiberikan = strings.TrimSpace(data.AssessmentRecord.Notes)
	} else if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.Notes) != "" {
		terapiDiberikan = strings.TrimSpace(data.OutcomeRecord.Notes)
	}

	pdf.SetY(pdf.GetY() + 4.0)
	pdf.SetFont("Arial", "", 9.5)
	if isSuratRujukan {
		ythTarget := "Dokter Pemeriksa"
		if specialistPoli != "" {
			trimmedLower := strings.ToLower(strings.TrimSpace(specialistPoli))
			if strings.Contains(trimmedLower, "ugd") || strings.Contains(trimmedLower, "igd") {
				ythTarget = "Dokter Jaga " + strings.ToUpper(specialistPoli)
			} else if strings.HasPrefix(trimmedLower, "dr.") || strings.HasPrefix(trimmedLower, "dr ") || strings.HasPrefix(trimmedLower, "dokter") {
				ythTarget = specialistPoli
			} else if strings.HasPrefix(trimmedLower, "spesialis") || strings.HasPrefix(trimmedLower, "sp.") {
				ythTarget = "Dokter " + specialistPoli
			} else if strings.HasPrefix(trimmedLower, "poli") {
				ythTarget = "Dokter " + specialistPoli
			} else {
				ythTarget = "Dokter Spesialis / " + specialistPoli
			}
		}
		pdf.CellFormat(contentWidth, 4.6, "Kepada Yth.", "", 1, "L", false, 0, "")
		pdf.SetFont("Arial", "B", 9.5)
		pdf.CellFormat(contentWidth, 4.6, ythTarget, "", 1, "L", false, 0, "")
		if destHospital != "" {
			pdf.SetFont("Arial", "", 9.5)
			pdf.CellFormat(contentWidth, 4.6, destHospital, "", 1, "L", false, 0, "")
		}
		pdf.SetFont("Arial", "", 9.5)
		pdf.CellFormat(contentWidth, 4.6, "di Tempat", "", 1, "L", false, 0, "")
		pdf.SetY(pdf.GetY() + 2.5)
		pdf.MultiCell(contentWidth, 4.8, "Dengan hormat,\nBersama ini kami hadapkan pasien dengan identitas sebagai berikut :", "", "L", false)
	} else {
		instName := fallbackText(hospitalInfo.Name)
		openingText := fmt.Sprintf("Kami yang bertanda tangan dibawah ini Dokter %s, dengan ini menerangkan bahwa :", instName)
		pdf.MultiCell(contentWidth, 5.0, openingText, "", "L", false)
	}

	pdf.SetY(pdf.GetY() + 2.5)
	indentX := startX + 6.0
	labelWidth := 40.0
	sepWidth := 4.0
	valWidth := endX - indentX - labelWidth - sepWidth

	patient := data.Visit.Patient
	birthDateStr := "-"
	if patient.BirthDate != nil && !patient.BirthDate.IsZero() {
		birthDateStr = patient.BirthDate.Format("02-01-2006")
	}
	birthPlaceDate := birthDateStr
	if strings.TrimSpace(patient.BirthPlace) != "" {
		birthPlaceDate = formatTitleCase(patient.BirthPlace) + ", " + birthDateStr
	}

	biodataItems := []struct {
		label  string
		value  string
		isBold bool
	}{
		{"Nama", strings.ToUpper(fallbackText(patient.FullName)), true},
		{"No. Rekam Medis", fallbackText(patient.MedicalRecordNumber), false},
		{"Jenis Kelamin", formatGenderIndonesian(patient.Gender), false},
		{"Tempat, Tgl Lahir", birthPlaceDate, false},
		{"Warga Negara", "Indonesia", false},
		{"Agama", formatReligionIndonesian(patient.Religion), false},
		{"Pekerjaan", formatOccupationIndonesian(patient.Occupation), false},
		{"Alamat", formatPatientOfficialAddress(patient), false},
	}

	for _, item := range biodataItems {
		currY := pdf.GetY()
		pdf.SetXY(indentX, currY)
		pdf.SetFont("Arial", "", 9.5)
		pdf.CellFormat(labelWidth, 4.8, item.label, "", 0, "L", false, 0, "")
		pdf.CellFormat(sepWidth, 4.8, ":", "", 0, "C", false, 0, "")

		if item.isBold {
			pdf.SetFont("Arial", "B", 9.5)
		} else {
			pdf.SetFont("Arial", "", 9.5)
		}
		if item.label == "Alamat" {
			pdf.MultiCell(valWidth, 4.8, item.value, "", "L", false)
		} else {
			pdf.CellFormat(valWidth, 4.8, item.value, "", 1, "L", false, 0, "")
		}
	}

	pdf.SetY(pdf.GetY() + 3.5)
	pdf.SetFont("Arial", "B", 9.5)
	pdf.SetX(indentX)
	pdf.CellFormat(contentWidth-6.0, 5.0, "Data Pemeriksaan :", "", 1, "L", false, 0, "")

	bpStr := "-"
	hrStr := "-"
	tempStr := "-"
	rrStr := "-"
	consciousnessStr := "Compos Mentis"
	weightStr := "-"
	heightStr := "-"
	if data.PhysicalExamRecord != nil {
		if data.PhysicalExamRecord.BPSystolic > 0 {
			bpStr = fmt.Sprintf("%d / %d mmHg", data.PhysicalExamRecord.BPSystolic, data.PhysicalExamRecord.BPDiastolic)
		}
		if data.PhysicalExamRecord.HeartRate > 0 {
			hrStr = fmt.Sprintf("%d x/menit", data.PhysicalExamRecord.HeartRate)
		}
		if data.PhysicalExamRecord.Temperature > 0 {
			tempStr = fmt.Sprintf("%.1f C", data.PhysicalExamRecord.Temperature)
		}
		if data.PhysicalExamRecord.RespiratoryRate > 0 {
			rrStr = fmt.Sprintf("%d x/menit", data.PhysicalExamRecord.RespiratoryRate)
		}
		if strings.TrimSpace(data.PhysicalExamRecord.Consciousness) != "" {
			consciousnessStr = formatTitleCase(strings.TrimSpace(data.PhysicalExamRecord.Consciousness))
		}
		if data.PhysicalExamRecord.Weight > 0 {
			weightStr = fmt.Sprintf("%.0f Kg", data.PhysicalExamRecord.Weight)
		}
		if data.PhysicalExamRecord.Height > 0 {
			heightStr = fmt.Sprintf("%.0f cm", data.PhysicalExamRecord.Height)
		}
	}

	mataStr := "Baik"
	telingaStr := "Baik"
	butaWarnaStr := "Tidak"
	keteranganLainStr := "Dalam batas normal"

	// Parse JSON atau teks pemeriksaan fisik dari berbagai sumber (AssessmentRecord, PhysicalExamRecord, Notes)
	type SuratSehatExamPayload struct {
		Mata           string `json:"mata"`
		Telinga        string `json:"telinga"`
		ButaWarna      string `json:"buta_warna"`
		KeteranganLain string `json:"keterangan_lain"`
	}

	var examCandidates []string
	if data.AssessmentRecord != nil {
		if s := strings.TrimSpace(data.AssessmentRecord.PhysicalExamination); s != "" {
			examCandidates = append(examCandidates, s)
		}
		if s := strings.TrimSpace(data.AssessmentRecord.Notes); s != "" {
			examCandidates = append(examCandidates, s)
		}
	}
	if data.PhysicalExamRecord != nil {
		if s := strings.TrimSpace(data.PhysicalExamRecord.PhysicalExamination); s != "" {
			examCandidates = append(examCandidates, s)
		}
		if s := strings.TrimSpace(data.PhysicalExamRecord.Notes); s != "" {
			examCandidates = append(examCandidates, s)
		}
	}

	foundSpecificKeterangan := false
	for _, raw := range examCandidates {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		// Cek jika candidate berupa JSON string
		if strings.HasPrefix(raw, "{") {
			var payload SuratSehatExamPayload
			if err := json.Unmarshal([]byte(raw), &payload); err == nil {
				if strings.TrimSpace(payload.Mata) != "" {
					mataStr = strings.TrimSpace(payload.Mata)
				}
				if strings.TrimSpace(payload.Telinga) != "" {
					telingaStr = strings.TrimSpace(payload.Telinga)
				}
				if strings.TrimSpace(payload.ButaWarna) != "" {
					butaWarnaStr = strings.TrimSpace(payload.ButaWarna)
				}
				if strings.TrimSpace(payload.KeteranganLain) != "" {
					keteranganLainStr = strings.TrimSpace(payload.KeteranganLain)
					foundSpecificKeterangan = true
				}
				continue
			}
		}

		// Jika teks biasa (bukan JSON)
		if !strings.HasPrefix(raw, "{") && !foundSpecificKeterangan {
			keteranganLainStr = raw
			foundSpecificKeterangan = true
		}
	}

	// Proteksi mutlak: keteranganLainStr TIDAK BOLEH berupa JSON mentah
	if strings.Contains(keteranganLainStr, "{") {
		var payload SuratSehatExamPayload
		if err := json.Unmarshal([]byte(keteranganLainStr), &payload); err == nil && strings.TrimSpace(payload.KeteranganLain) != "" {
			keteranganLainStr = strings.TrimSpace(payload.KeteranganLain)
		} else {
			keteranganLainStr = "Dalam batas normal"
		}
	}
	if strings.Contains(keteranganLainStr, "{") || strings.Contains(keteranganLainStr, "}") {
		keteranganLainStr = "Dalam batas normal"
	}

	if isSuratButaWarna {
		if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.DischargeCondition) != "" {
			butaWarnaStr = strings.TrimSpace(data.OutcomeRecord.DischargeCondition)
		} else if data.AssessmentRecord != nil && strings.TrimSpace(data.AssessmentRecord.Assessment) != "" {
			butaWarnaStr = strings.TrimSpace(data.AssessmentRecord.Assessment)
		}
	}

	type examItem struct {
		label string
		val   string
	}

	var leftColItems []examItem
	var rightColItems []examItem
	bottomLabel := "Keterangan Lain"

	if isSuratSakit {
		// Pada Surat Keterangan Sakit: fokus pada tanda vital klinis (Tensi, Nadi, Suhu, Respirasi, BB, TB)
		bottomLabel = "Catatan Pemeriksaan"
		leftColItems = []examItem{
			{"Tekanan Darah", bpStr},
			{"Frekuensi Nadi", hrStr},
			{"Suhu Tubuh", tempStr},
		}
		rightColItems = []examItem{
			{"Pernapasan", rrStr},
			{"Berat Badan", weightStr},
			{"Tinggi Badan", heightStr},
		}
	} else if isSuratRujukan {
		bottomLabel = "Pemeriksaan Fisik"
		leftColItems = []examItem{
			{"Tekanan Darah", bpStr},
			{"Frekuensi Nadi", hrStr},
			{"Suhu Tubuh", tempStr},
			{"Berat Badan", weightStr},
		}
		rightColItems = []examItem{
			{"Kesadaran", consciousnessStr},
			{"Pernapasan", rrStr},
			{"Tinggi Badan", heightStr},
		}
	} else if isSuratButaWarna {
		bottomLabel = "Keterangan Lain"
		leftColItems = []examItem{
			{"Tensi", bpStr},
			{"Nadi", hrStr},
			{"Berat Badan", weightStr},
			{"Tinggi Badan", heightStr},
		}
		rightColItems = []examItem{
			{"Mata Ka/Ki", mataStr},
			{"Tes Buta Warna", butaWarnaStr},
			{"Suhu Tubuh", tempStr},
		}
	} else {
		// Surat Sehat / MCU
		bottomLabel = "Keterangan Lain"
		leftColItems = []examItem{
			{"Tensi", bpStr},
			{"Nadi", hrStr},
			{"Berat Badan", weightStr},
			{"Tinggi Badan", heightStr},
		}
		rightColItems = []examItem{
			{"Mata Ka/Ki", mataStr},
			{"Telinga Ka/Ki", telingaStr},
			{"Buta Warna", butaWarnaStr},
		}
	}

	boxX := indentX
	boxWidth := endX - boxX - 4.0
	boxY := pdf.GetY() + 1.2
	halfWidth := boxWidth / 2.0
	colLabelW := 28.0
	colSepW := 3.0
	rowH := 5.2

	maxRows := len(leftColItems)
	if len(rightColItems) > maxRows {
		maxRows = len(rightColItems)
	}
	gridHeight := (float64(maxRows) * rowH) + 2.0

	ketValW := boxWidth - colLabelW - colSepW - 8.0
	pdf.SetFont("Arial", "", 9.0)
	ketLines := pdf.SplitLines([]byte(keteranganLainStr), ketValW)
	ketLineCount := len(ketLines)
	if ketLineCount < 1 {
		ketLineCount = 1
	}
	ketLineH := 4.4
	ketBlockH := float64(ketLineCount)*ketLineH + 3.0
	boxHeight := gridHeight + ketBlockH

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetFillColor(255, 255, 255)
	pdf.SetLineWidth(0.25)
	pdf.Rect(boxX, boxY, boxWidth, boxHeight, "D")
	pdf.SetLineWidth(0.2)
	pdf.Line(boxX+halfWidth, boxY, boxX+halfWidth, boxY+gridHeight)
	pdf.Line(boxX, boxY+gridHeight, boxX+boxWidth, boxY+gridHeight)

	pdf.SetTextColor(0, 0, 0)
	for i, item := range leftColItems {
		rY := boxY + 1.2 + (float64(i) * rowH)
		pdf.SetXY(boxX+3.0, rY)
		pdf.SetFont("Arial", "", 8.8)
		pdf.CellFormat(colLabelW, rowH, item.label, "", 0, "L", false, 0, "")
		pdf.CellFormat(colSepW, rowH, ":", "", 0, "C", false, 0, "")
		pdf.SetFont("Arial", "B", 8.8)
		pdf.CellFormat(halfWidth-colLabelW-colSepW-6.0, rowH, fitTextToWidth(pdf, sanitizePDFSingleLineText(item.val), halfWidth-colLabelW-colSepW-6.0), "", 0, "L", false, 0, "")
	}

	for i, item := range rightColItems {
		rY := boxY + 1.2 + (float64(i) * rowH)
		pdf.SetXY(boxX+halfWidth+3.0, rY)
		pdf.SetFont("Arial", "", 8.8)
		pdf.CellFormat(colLabelW+4.0, rowH, item.label, "", 0, "L", false, 0, "")
		pdf.CellFormat(colSepW, rowH, ":", "", 0, "C", false, 0, "")
		pdf.SetFont("Arial", "B", 8.8)
		pdf.CellFormat(halfWidth-colLabelW-colSepW-10.0, rowH, fitTextToWidth(pdf, sanitizePDFSingleLineText(item.val), halfWidth-colLabelW-colSepW-10.0), "", 0, "L", false, 0, "")
	}

	ketY := boxY + gridHeight + 1.6
	pdf.SetXY(boxX+3.0, ketY)
	pdf.SetFont("Arial", "", 8.8)
	pdf.CellFormat(colLabelW, ketLineH, bottomLabel, "", 0, "L", false, 0, "")
	pdf.CellFormat(colSepW, ketLineH, ":", "", 0, "C", false, 0, "")
	pdf.MultiCell(ketValW, ketLineH, sanitizePDFText(keteranganLainStr), "", "L", false)
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.2)


	pdf.SetY(boxY + boxHeight + 4.5)

	purposeText := ""
	if data.AssessmentRecord != nil && strings.TrimSpace(data.AssessmentRecord.Plan) != "" {
		purposeText = strings.TrimSpace(data.AssessmentRecord.Plan)
	} else if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.Notes) != "" {
		purposeText = strings.TrimSpace(data.OutcomeRecord.Notes)
	}
	if purposeText == "" {
		purposeText = "Persyaratan Administrasi"
	}

	switch normalizeSuratTypeValue(data.SuratType) {
	case medicalRecordEntryGroupPrefixSuratRujukan:
		pdf.SetFont("Arial", "B", 9.5)
		pdf.CellFormat(contentWidth, 5.0, "Keterangan Klinis & Rujukan :", "", 1, "L", false, 0, "")

		rujukanDetails := []struct {
			label string
			val   string
		}{
			{"Diagnosis Kerja", diagnosis},
			{"Alasan Rujukan", alasanRujukan},
			{"Terapi / Tindakan Diberikan", terapiDiberikan},
			{"RS / Faskes Rujukan", destHospital},
			{"Poli / Unit Tujuan", specialistPoli},
		}

		rLabelW := 46.0
		rSepW := 4.0
		rValW := endX - indentX - rLabelW - rSepW
		for _, rd := range rujukanDetails {
			cY := pdf.GetY()
			pdf.SetXY(indentX, cY)
			pdf.SetFont("Arial", "B", 9.0)
			pdf.CellFormat(rLabelW, 4.8, rd.label, "", 0, "L", false, 0, "")
			pdf.CellFormat(rSepW, 4.8, ":", "", 0, "C", false, 0, "")
			pdf.SetFont("Arial", "", 9.0)
			pdf.MultiCell(rValW, 4.8, rd.val, "", "L", false)
		}

	case medicalRecordEntryGroupPrefixSuratSakit:
		sickDays := "beberapa hari"
		if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.FollowUpInstruction) != "" {
			sickDays = cleanSakitDuration(data.OutcomeRecord.FollowUpInstruction)
		}
		periodText := ""
		if data.OutcomeRecord != nil {
			periodText = formatSuratValidityPeriod(data.OutcomeRecord.ReferralDestination, data.OutcomeRecord.ReferralReason)
		}
		pdf.SetFont("Arial", "", 9.5)
		sakitStatement := "Setelah kami lakukan pemeriksaan dengan seksama, yang bersangkutan pada saat ini dalam kondisi SAKIT dan memerlukan istirahat selama " + sickDays
		if periodText != "-" && periodText != "" {
			sakitStatement += ", terhitung mulai tanggal " + periodText + "."
		} else {
			sakitStatement += "."
		}
		pdf.MultiCell(contentWidth, 5.0, sakitStatement, "", "L", false)

	case medicalRecordEntryGroupPrefixSuratButaWarna:
		pdf.SetFont("Arial", "", 9.5)
		pdf.MultiCell(contentWidth, 5.0, "Setelah kami lakukan pemeriksaan tes buta warna dengan seksama, yang bersangkutan pada saat ini kami nyatakan :", "", "L", false)
		pdf.SetY(pdf.GetY() + 1.0)
		pdf.SetFont("Arial", "B", 10.5)
		resultStr := "TIDAK BUTA WARNA"
		if butaWarnaStr != "Tidak" && butaWarnaStr != "" {
			resultStr = strings.ToUpper(butaWarnaStr)
		}
		pdf.CellFormat(contentWidth, 5.5, resultStr, "", 1, "L", false, 0, "")

	case medicalRecordEntryGroupPrefixSuratMCU:
		pdf.SetFont("Arial", "", 9.5)
		pdf.MultiCell(contentWidth, 5.0, "Setelah kami lakukan serangkaian pemeriksaan kesehatan secara menyeluruh (Medical Check Up), yang bersangkutan pada saat ini dinyatakan :", "", "L", false)
		pdf.SetY(pdf.GetY() + 1.0)
		pdf.SetFont("Arial", "B", 10.5)
		mcuResult := "SEHAT / MEMENUHI SYARAT KESEHATAN"
		if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.DischargeCondition) != "" {
			mcuResult = strings.ToUpper(strings.TrimSpace(data.OutcomeRecord.DischargeCondition))
		}
		pdf.MultiCell(contentWidth, 5.2, mcuResult, "", "L", false)

	default:
		pdf.SetFont("Arial", "", 9.5)
		pdf.MultiCell(contentWidth, 5.0, "Setelah kami lakukan pemeriksaan dengan seksama, yang bersangkutan pada saat ini kami nyatakan :", "", "L", false)
		pdf.SetY(pdf.GetY() + 1.0)
		pdf.SetFont("Arial", "B", 10.5)
		sehatResult := "Baik / Sehat."
		if data.OutcomeRecord != nil && strings.TrimSpace(data.OutcomeRecord.DischargeCondition) != "" {
			sehatResult = strings.TrimSpace(data.OutcomeRecord.DischargeCondition)
		}
		pdf.MultiCell(contentWidth, 5.2, sehatResult, "", "L", false)
	}

	pdf.SetY(pdf.GetY() + 4.5)
	pdf.SetFont("Arial", "", 9.5)
	if isSuratRujukan {
		pdf.MultiCell(contentWidth, 5.0, "Demikian surat rujukan ini kami buat untuk mendapatkan penanganan lebih lanjut. Atas bantuan dan kerja sama teman sejawat, kami ucapkan terima kasih.", "", "L", false)
	} else {
		pdf.MultiCell(contentWidth, 5.0, "Surat Keterangan ini digunakan untuk : "+purposeText, "", "L", false)
		pdf.SetY(pdf.GetY() + 4.5)
		pdf.MultiCell(contentWidth, 5.0, "Demikian surat keterangan ini kami buat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.", "", "L", false)
	}

	sigWidth := 75.0
	sigX := endX - sigWidth
	hasTTE := tteSignature != nil && hasTTEQRCode(tteSignature)

	// Posisikan TTD dokter lebih ke bawah agar rapi dan proporsional di bagian bawah halaman
	targetSigY := 232.0
	if hasTTE {
		targetSigY = 224.0
	}
	sigY := maxFloat64(pdf.GetY()+10.0, targetSigY)
	maxSigY := 242.0
	if hasTTE {
		maxSigY = 232.0
	}
	if sigY > maxSigY {
		sigY = maxSigY
	}
	drawOfficialDoctorSignature(pdf, sigX, sigY, sigWidth, hospitalInfo.City, data.GeneratedAt, data.Visit.Doctor, tteSignature)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("%s-%s-%s.pdf", getSuratTypeFileSlug(data.SuratType), sanitizePDFFileName(data.Visit.Patient.FullName), sanitizePDFFileName(data.Visit.VisitNumber))
	return output.Bytes(), fileName, nil
}

func getInitialAssessmentHospitalInfo() initialAssessmentHospitalInfo {
	var settings []models.Setting
	database.DB.Find(&settings)

	settingsMap := make(map[string]string, len(settings))
	for _, setting := range settings {
		settingsMap[setting.Key] = strings.TrimSpace(setting.Value)
	}

	logoPath, logoType, _ := resolveLocalPDFImage(firstNonEmpty(settingsMap["app_print_logo"], settingsMap["app_logo"]))

	return initialAssessmentHospitalInfo{
		Name:     firstNonEmpty(settingsMap["hospital_name"], settingsMap["app_name"], "SIMKLINIK"),
		Address:  settingsMap["hospital_address"],
		City:     settingsMap["hospital_city"],
		Phone:    settingsMap["hospital_phone"],
		Fax:      settingsMap["hospital_fax"],
		Email:    settingsMap["hospital_email"],
		Website:  settingsMap["hospital_website"],
		LogoPath: logoPath,
		LogoType: logoType,
	}
}

func buildInitialAssessmentHospitalInfoFromPreview(request printHeaderPreviewRequest) initialAssessmentHospitalInfo {
	logoPath, logoType, _ := resolveLocalPDFImage(firstNonEmpty(request.PrintLogo, request.AppLogo))

	return initialAssessmentHospitalInfo{
		Name:     firstNonEmpty(request.HospitalName, request.AppName, "SIMKLINIK"),
		Address:  strings.TrimSpace(request.HospitalAddress),
		City:     strings.TrimSpace(request.HospitalCity),
		Phone:    strings.TrimSpace(request.HospitalPhone),
		Fax:      strings.TrimSpace(request.HospitalFax),
		Email:    strings.TrimSpace(request.HospitalEmail),
		Website:  strings.TrimSpace(request.HospitalWebsite),
		LogoPath: logoPath,
		LogoType: logoType,
	}
}

func renderInitialAssessmentEntryPDF(hospitalInfo initialAssessmentHospitalInfo, data initialAssessmentPrintViewData) ([]byte, string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)
	documentTitle := getInitialAssessmentSheetLabel(data.SheetKey)
	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle(documentTitle, false)
	pdf.SetAuthor(data.PrintedByLabel, false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetHeaderFuncMode(func() {
		if pdf.PageNo() != 1 {
			return
		}
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, strings.ToUpper(documentTitle), "No. Kunjungan : "+fallbackText(data.Visit.VisitNumber))
	}, true)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-7.5)
		pdf.SetFont("Arial", "", 7.5)
		pdf.SetTextColor(70, 70, 70)
		pdf.CellFormat(110, 4, "Dicetak: "+formatDateTimeIndonesian(data.GeneratedAt)+" | Petugas: "+fallbackText(data.PrintedByLabel), "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	identityFields := mergePatientVisitPrintFields(data.Visit.Patient, data.Visit,
		initialAssessmentPrintField{Label: "Tanggal Entri", Value: formatRecordDateTimePDF(data.EntryRecordDate)},
	)
	addInitialAssessmentCompactFieldSection(pdf, "IDENTITAS PASIEN & KUNJUNGAN", identityFields, "Data pasien tidak tersedia.")

	anamnesisFields := filterNonEmptyPrintFields(data.AnamnesisFields)
	if len(anamnesisFields) > 0 {
		addInitialAssessmentFieldSection(pdf, "ANAMNESIS", anamnesisFields, "Tidak ada data anamnesis.")
	}

	physicalFields := filterNonEmptyPrintFields(data.PhysicalExamFields)
	if len(physicalFields) > 0 {
		addInitialAssessmentFieldSection(pdf, "PEMERIKSAAN FISIK & TANDA VITAL", physicalFields, "Tidak ada data pemeriksaan fisik.")
	}

	if len(data.PhysicalExamImages) > 0 {
		addInitialAssessmentImagesSection(pdf, data.PhysicalExamImages)
	}

	assessmentFields := filterNonEmptyPrintFields(data.AssessmentFields)
	if len(assessmentFields) > 0 {
		addInitialAssessmentFieldSection(pdf, "ASSESSMENT", assessmentFields, "Tidak ada data assessment.")
	}

	if len(data.Diagnoses) > 0 {
		addInitialAssessmentDiagnosisSection(pdf, data.Diagnoses)
	}

	addInitialAssessmentSignatureSection(pdf, hospitalInfo, data)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("%s-%s-%s.pdf", getInitialAssessmentSheetFileSlug(data.SheetKey), sanitizePDFFileName(data.Visit.Patient.FullName), sanitizePDFFileName(data.Visit.VisitNumber))
	return output.Bytes(), fileName, nil
}

func renderPrintHeaderPreviewPDF(hospitalInfo initialAssessmentHospitalInfo) ([]byte, string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)
	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle("Contoh KOP PDF", false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetHeaderFuncMode(func() {
		if pdf.PageNo() != 1 {
			return
		}
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, "CONTOH KOP PDF", "Preview Pengaturan KOP")
	}, true)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-7.5)
		pdf.SetFont("Arial", "", 7.5)
		pdf.SetTextColor(70, 70, 70)
		pdf.CellFormat(100, 4, "Preview pengaturan KOP | SIMKLINIK", "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	addInitialAssessmentCompactFieldSection(pdf, "RINGKASAN KOP", []initialAssessmentPrintField{
		{Label: "Nama Fasilitas", Value: hospitalInfo.Name},
		{Label: "Telepon", Value: hospitalInfo.Phone},
		{Label: "Fax", Value: hospitalInfo.Fax},
		{Label: "Email", Value: hospitalInfo.Email},
		{Label: "Website", Value: hospitalInfo.Website},
		{Label: "Alamat", Value: strings.Trim(strings.Join([]string{hospitalInfo.Address, hospitalInfo.City}, ", "), ", ")},
	}, "Belum ada data KOP.")

	addInitialAssessmentSectionTitle(pdf, "CATATAN PREVIEW")
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	noteStartY := pdf.GetY()
	pdf.SetY(noteStartY + 1.2)
	addInitialAssessmentFullWidthRow(pdf, "Preview ini menggunakan nilai yang sedang ada di form settings. Dokumen rekam medis resmi seperti pengkajian awal, resume medis, hasil penunjang, dan lembar lainnya akan memakai standar KOP yang sama.", false)
	noteEndY := pdf.GetY() + 1.2
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(left, noteStartY, contentWidth, noteEndY-noteStartY, "D")
	pdf.SetY(noteEndY)

	sigStartY := pdf.GetY()
	sigH := 26.0
	colW := contentWidth / 2
	splitX := left + colW
	pdf.Rect(left, sigStartY, contentWidth, sigH, "D")
	pdf.Line(splitX, sigStartY, splitX, sigStartY+sigH)
	pdf.SetLineWidth(0.2)
	pdf.SetFont("Arial", "", 8.6)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(left, sigStartY+3.0)
	pdf.CellFormat(colW, 4.4, "Petugas Administrasi", "", 0, "C", false, 0, "")
	pdf.SetXY(splitX, sigStartY+3.0)
	pdf.CellFormat(colW, 4.4, "Penanggung Jawab Dokumen", "", 1, "C", false, 0, "")
	pdf.SetXY(left, sigStartY+sigH-6.0)
	pdf.CellFormat(colW, 4.4, "( ________________________ )", "", 0, "C", false, 0, "")
	pdf.SetXY(splitX, sigStartY+sigH-6.0)
	pdf.CellFormat(colW, 4.4, "( ________________________ )", "", 1, "C", false, 0, "")
	pdf.SetY(sigStartY + sigH)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	return output.Bytes(), "contoh-kop-pdf.pdf", nil
}

func addInitialAssessmentPDFHeader(pdf *gofpdf.Fpdf, info initialAssessmentHospitalInfo, title string, subtitle string) {
	left, top, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	currentY := top
	hasLogo := info.LogoPath != "" && info.LogoType != ""
	logoMaxHeight := 15.0
	logoMaxWidth := 18.0
	logoGap := 3.2

	logoWidth := 0.0
	logoHeight := 0.0
	if hasLogo {
		logoWidth, logoHeight = measureInitialAssessmentHeaderLogo(info.LogoPath, logoMaxHeight, logoMaxWidth)
	}

	textStartX := left
	if hasLogo && logoWidth > 0 {
		textStartX = left + logoWidth + logoGap
	}
	textWidth := (pageWidth - right) - textStartX

	type headerLine struct {
		text       string
		fontStyle  string
		fontSize   float64
		lineHeight float64
	}

	lines := []headerLine{{
		text:       strings.ToUpper(fallbackText(info.Name)),
		fontStyle:  "B",
		fontSize:   12.5,
		lineHeight: 4.8,
	}}

	addressParts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Address)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.City)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	if len(addressParts) > 0 {
		lines = append(lines, headerLine{
			text:       strings.Join(addressParts, ", "),
			fontStyle:  "",
			fontSize:   7.8,
			lineHeight: 3.4,
		})
	}

	contactParts := make([]string, 0, 4)
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Phone)); trimmed != "" {
		contactParts = append(contactParts, "Telp: "+trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Fax)); trimmed != "" {
		contactParts = append(contactParts, "Fax: "+trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Email)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Website)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if len(contactParts) > 0 {
		lines = append(lines, headerLine{
			text:       strings.Join(contactParts, "  |  "),
			fontStyle:  "",
			fontSize:   7.6,
			lineHeight: 3.4,
		})
	}

	textBlockHeight := 0.0
	for _, line := range lines {
		trimmedText := strings.TrimSpace(sanitizePDFText(line.text))
		if trimmedText == "" {
			continue
		}
		pdf.SetFont("Arial", line.fontStyle, line.fontSize)
		lineParts := pdf.SplitLines([]byte(trimmedText), textWidth)
		lineCount := len(lineParts)
		if lineCount < 1 {
			lineCount = 1
		}
		textBlockHeight += float64(lineCount) * line.lineHeight
	}

	headerBlockHeight := maxFloat64(textBlockHeight, logoHeight)

	if hasLogo && logoWidth > 0 {
		logoX := left
		logoY := currentY + ((headerBlockHeight - logoHeight) / 2)
		if logoY < top {
			logoY = top
		}
		drawInitialAssessmentHeaderLogo(pdf, info.LogoPath, info.LogoType, logoX, logoY, logoMaxHeight, logoMaxWidth)
	}

	textY := currentY + ((headerBlockHeight - textBlockHeight) / 2)
	pdf.SetXY(textStartX, textY)
	pdf.SetTextColor(0, 0, 0)
	for _, line := range lines {
		trimmedText := strings.TrimSpace(sanitizePDFText(line.text))
		if trimmedText == "" {
			continue
		}
		pdf.SetX(textStartX)
		pdf.SetFont("Arial", line.fontStyle, line.fontSize)
		pdf.MultiCell(textWidth, line.lineHeight, trimmedText, "", "L", false)
	}

	// Garis pembatas Kop Resmi RS/Klinik Indonesia (1 garis tegas bersih, tidak mepet)
	lineY := currentY + headerBlockHeight + 1.6
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.6)
	pdf.Line(left, lineY, pageWidth-right, lineY)

	// Kotak Judul Dokumen menyatu langsung sebagai bagian atas bingkai besar (gaya Resep)
	cleanTitle := strings.ToUpper(firstNonEmpty(sanitizePDFSingleLineText(title), "-"))
	cleanSubtitle := strings.TrimSpace(sanitizePDFSingleLineText(subtitle))
	hasSubtitle := cleanSubtitle != "" && cleanSubtitle != "-"

	titleBoxY := lineY + 1.8
	titleBoxH := 6.4
	if hasSubtitle {
		titleBoxH = 10.2
	}

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(left, titleBoxY, contentWidth, titleBoxH, "D")

	pdf.SetTextColor(0, 0, 0)
	if hasSubtitle {
		pdf.SetXY(left, titleBoxY+0.8)
		pdf.SetFont("Arial", "B", 10.8)
		pdf.CellFormat(contentWidth, 4.8, cleanTitle, "", 1, "C", false, 0, "")
		pdf.SetXY(left, titleBoxY+5.4)
		pdf.SetFont("Arial", "", 8.2)
		pdf.CellFormat(contentWidth, 4.0, cleanSubtitle, "", 1, "C", false, 0, "")
	} else {
		pdf.SetXY(left, titleBoxY+0.8)
		pdf.SetFont("Arial", "B", 10.8)
		pdf.CellFormat(contentWidth, 4.8, cleanTitle, "", 1, "C", false, 0, "")
	}

	pdf.SetLineWidth(0.2)
	contentStartY := titleBoxY + titleBoxH
	setInitialAssessmentPDFPageContentStartOverride(pdf, pdf.PageNo(), contentStartY)
	pdf.SetY(contentStartY)
}

func measureInitialAssessmentHeaderLogo(filePath string, maxHeight float64, maxWidth float64) (float64, float64) {
	widthPx, heightPx, err := readLocalImageDimensions(filePath)
	if err != nil || widthPx <= 0 || heightPx <= 0 {
		return maxWidth, maxHeight
	}

	scale := minFloat64(maxWidth/float64(widthPx), maxHeight/float64(heightPx))
	return float64(widthPx) * scale, float64(heightPx) * scale
}

func drawInitialAssessmentHeaderLogo(pdf *gofpdf.Fpdf, filePath string, imageType string, x float64, y float64, maxHeight float64, maxWidth float64) (float64, float64) {
	displayWidth, displayHeight := measureInitialAssessmentHeaderLogo(filePath, maxHeight, maxWidth)

	pdf.ImageOptions(filePath, x, y, displayWidth, displayHeight, false, gofpdf.ImageOptions{ImageType: imageType}, 0, "")
	return displayWidth, displayHeight
}

func addInitialAssessmentMetadata(pdf *gofpdf.Fpdf, data initialAssessmentPrintViewData) {
	rows := []initialAssessmentPrintField{
		{Label: "Tanggal Entri", Value: formatRecordDateTimePDF(data.EntryRecordDate)},
		{Label: "Tanggal Cetak", Value: formatDateTimeIndonesian(data.GeneratedAt)},
		{Label: "Petugas Cetak", Value: fallbackText(data.PrintedByLabel)},
	}
	addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", rows, "")
}

func humanizeSnakeCaseIndonesian(value string) string {
	trimmed := strings.TrimSpace(sanitizePDFSingleLineText(value))
	if trimmed == "" || trimmed == "-" {
		return "-"
	}
	cleaned := strings.ReplaceAll(trimmed, "_", " ")
	cleaned = strings.ReplaceAll(cleaned, "-", " ")
	words := strings.Fields(cleaned)
	for i, w := range words {
		lower := strings.ToLower(w)
		switch lower {
		case "bpjs", "igd", "ugd", "mcu", "rm", "nik", "sip", "nip", "tte", "icd", "bmi", "spo2":
			words[i] = strings.ToUpper(lower)
		default:
			runes := []rune(lower)
			if len(runes) > 0 {
				runes[0] = unicode.ToUpper(runes[0])
				words[i] = string(runes)
			}
		}
	}
	return strings.Join(words, " ")
}

func formatPaymentTypeForPrint(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "-":
		return "-"
	case "umum", "general", "pribadi", "mandiri":
		return "Umum"
	case "cash", "tunai":
		return "Tunai"
	case "bpjs", "bpjs_kesehatan", "jkn":
		return "BPJS Kesehatan"
	case "asuransi", "insurance", "asuransi_swasta":
		return "Asuransi"
	case "perusahaan", "corporate":
		return "Perusahaan"
	default:
		return humanizeSnakeCaseIndonesian(value)
	}
}

func formatVisitTypeForPrint(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "-":
		return "-"
	case "baru", "new":
		return "Pasien Baru"
	case "lama", "old":
		return "Pasien Lama"
	case "kontrol", "follow_up":
		return "Kontrol"
	case "rujukan", "referral":
		return "Rujukan"
	case "igd", "ugd", "emergency":
		return "IGD"
	case "rawat_jalan", "outpatient":
		return "Rawat Jalan"
	default:
		return humanizeSnakeCaseIndonesian(value)
	}
}

func formatConsciousnessForPrint(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "-" {
		return "-"
	}
	switch strings.ToLower(strings.ReplaceAll(trimmed, "_", " ")) {
	case "compos mentis", "composmentis", "cm":
		return "Compos Mentis"
	case "apatis":
		return "Apatis"
	case "somnolen", "somnolence":
		return "Somnolen"
	case "sopor", "stupor":
		return "Sopor"
	case "koma", "coma":
		return "Koma"
	default:
		return humanizeSnakeCaseIndonesian(trimmed)
	}
}

func formatVisitDateForPrint(value time.Time) string {
	if value.IsZero() {
		return "-"
	}
	if value.Hour() == 0 && value.Minute() == 0 {
		return formatDateIndonesian(value)
	}
	return formatDateTimeIndonesian(value)
}

func filterNonEmptyPrintFields(fields []initialAssessmentPrintField) []initialAssessmentPrintField {
	filtered := make([]initialAssessmentPrintField, 0, len(fields))
	for _, field := range fields {
		val := strings.TrimSpace(sanitizePDFText(field.Value))
		if val == "" || val == "-" {
			continue
		}
		filtered = append(filtered, field)
	}
	return filtered
}

func mergePatientVisitPrintFields(patient models.Patient, visit models.Visit, extra ...initialAssessmentPrintField) []initialAssessmentPrintField {
	genderAge := genderLabelForPrint(patient.Gender)
	if age := calculatePatientAgeLabel(patient.BirthDate); age != "-" && age != "" {
		if genderAge != "-" {
			genderAge = genderAge + " / " + age
		} else {
			genderAge = age
		}
	}

	visitDateStr := formatVisitDateForPrint(visit.VisitDate)

	fields := []initialAssessmentPrintField{
		{Label: "No. Rekam Medis", Value: fallbackText(patient.MedicalRecordNumber)},
		{Label: "No. Kunjungan", Value: fallbackText(visit.VisitNumber)},
		{Label: "Nama Pasien", Value: fallbackText(patient.FullName)},
		{Label: "Tgl. Kunjungan", Value: visitDateStr},
		{Label: "JK / Umur", Value: fallbackText(genderAge)},
		{Label: "Poliklinik", Value: fallbackText(visit.Polyclinic.Name)},
		{Label: "Dokter Pemeriksa", Value: fallbackText(visit.Doctor.FullName)},
	}
	if birthDateStr := formatDatePointer(patient.BirthDate); birthDateStr != "" && birthDateStr != "-" {
		fields = append(fields, initialAssessmentPrintField{Label: "Tgl. Lahir", Value: birthDateStr})
	}

	if phone := strings.TrimSpace(patient.Phone); phone != "" && phone != "-" {
		fields = append(fields, initialAssessmentPrintField{Label: "No. Telepon", Value: phone})
	}
	if pay := formatPaymentTypeForPrint(visit.PaymentType); pay != "" && pay != "-" {
		payLabel := pay
		if ins := strings.TrimSpace(visit.InsuranceNumber); ins != "" {
			payLabel += " (" + ins + ")"
		}
		fields = append(fields, initialAssessmentPrintField{Label: "Pembiayaan", Value: payLabel})
	}
	for _, item := range extra {
		val := strings.TrimSpace(sanitizePDFText(item.Value))
		if val != "" && val != "-" {
			fields = append(fields, item)
		}
	}
	if addr := strings.TrimSpace(formatPatientAddress(patient)); addr != "" && addr != "-" {
		fields = append(fields, initialAssessmentPrintField{Label: "Alamat", Value: addr})
	}
	return fields
}

func addInitialAssessmentFieldSection(pdf *gofpdf.Fpdf, title string, fields []initialAssessmentPrintField, emptyMessage string) {
	addInitialAssessmentCompactFieldSection(pdf, title, fields, emptyMessage)
}

func resolveCompactGridColumnCount(contentWidth float64) int {
	if contentWidth >= 230.0 {
		return 3
	}
	return 2
}

// addInitialAssessmentCompactFieldSection merender blok informasi bergaya Resep (bingkai luar menyatu tanpa putus,
// pembagi vertikal tengah untuk baris 2-kolom, dan titik dua (:) berjarak lega).
func addInitialAssessmentCompactFieldSection(pdf *gofpdf.Fpdf, title string, fields []initialAssessmentPrintField, emptyMessage string) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right

	if len(fields) == 0 {
		ensureInitialAssessmentPDFSpace(pdf, 12.5)
		addInitialAssessmentSectionTitle(pdf, title)
		boxStartY := pdf.GetY()
		pdf.SetY(boxStartY + 1.2)
		addInitialAssessmentFullWidthRow(pdf, firstNonEmpty(emptyMessage, "Tidak ada data."), false)
		boxEndY := pdf.GetY() + 1.2
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetLineWidth(0.25)
		pdf.Rect(left, boxStartY, contentWidth, boxEndY-boxStartY, "D")
		pdf.SetLineWidth(0.2)
		pdf.SetY(boxEndY)
		addInitialAssessmentSectionSpacing(pdf)
		return
	}

	maxCols := resolveCompactGridColumnCount(contentWidth)

	type compactRenderRow struct {
		isMultiCol bool
		fields     []initialAssessmentPrintField
		height     float64
	}

	rows := make([]compactRenderRow, 0, (len(fields)+1)/2)
	pending := make([]initialAssessmentPrintField, 0, maxCols)

	colPad := 2.5
	colWidth := (contentWidth / float64(maxCols)) - (colPad * 2)
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(colWidth)

	flushPending := func() {
		if len(pending) == 0 {
			return
		}
		rowCopy := make([]initialAssessmentPrintField, len(pending))
		copy(rowCopy, pending)
		pending = pending[:0]

		if len(rowCopy) == 1 && (len(fields) == 1 || len(rows) == 0 || !rows[len(rows)-1].isMultiCol) {
			h := measureInitialAssessmentSingleRowHeight(pdf, rowCopy[0].Label, rowCopy[0].Value)
			rows = append(rows, compactRenderRow{isMultiCol: false, fields: rowCopy, height: h})
			return
		}

		rowH := 4.4
		for _, f := range rowCopy {
			h := measureInitialAssessmentCompactFieldBoxHeight(pdf, colWidth, labelWidth, f)
			if h > rowH {
				rowH = h
			}
		}
		rows = append(rows, compactRenderRow{isMultiCol: true, fields: rowCopy, height: rowH})
	}

	for _, field := range fields {
		if len(fields) == 1 || !isInitialAssessmentFieldCompactFriendly(pdf, field, maxCols) {
			flushPending()
			h := measureInitialAssessmentSingleRowHeight(pdf, field.Label, field.Value)
			rows = append(rows, compactRenderRow{
				isMultiCol: false,
				fields:     []initialAssessmentPrintField{field},
				height:     h,
			})
			continue
		}

		pending = append(pending, field)
		if len(pending) == maxCols {
			flushPending()
		}
	}
	flushPending()

	totalBoxH := 2.4
	for _, r := range rows {
		totalBoxH += r.height
	}
	_, pageHeight := pdf.GetPageSize()
	if totalBoxH+5.0 <= 110.0 && pdf.GetY()+5.0+totalBoxH > pageHeight-initialAssessmentPDFMarginBottom {
		pdf.AddPage()
		pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
	} else if len(rows) > 0 {
		ensureInitialAssessmentPDFSpace(pdf, 5.0+rows[0].height+2.4)
	}

	addInitialAssessmentSectionTitle(pdf, title)

	boxStartY := pdf.GetY()
	pdf.SetY(boxStartY + 1.2)
	multiColSpanStartY := -1.0

	closeBoxOnCurrentPage := func(endY float64, lastWasMultiCol bool) {
		pdf.SetDrawColor(0, 0, 0)
		if lastWasMultiCol && multiColSpanStartY >= 0 {
			pdf.SetLineWidth(0.25)
			for c := 1; c < maxCols; c++ {
				splitX := left + (contentWidth*float64(c))/float64(maxCols)
				pdf.Line(splitX, multiColSpanStartY, splitX, endY)
			}
			multiColSpanStartY = -1.0
		}
		pdf.SetLineWidth(0.25)
		pdf.Rect(left, boxStartY, contentWidth, endY-boxStartY, "D")
		pdf.SetLineWidth(0.2)
	}

	for idx, r := range rows {
		if pdf.GetY()+r.height+1.2 > pageHeight-initialAssessmentPDFMarginBottom {
			prevMulti := idx > 0 && rows[idx-1].isMultiCol
			closeBoxOnCurrentPage(pdf.GetY()+1.2, prevMulti)
			pdf.AddPage()
			pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
			boxStartY = pdf.GetY()
			pdf.SetY(boxStartY + 1.2)
			if r.isMultiCol {
				multiColSpanStartY = boxStartY
			}
		}

		rowY := pdf.GetY()
		if r.isMultiCol {
			if multiColSpanStartY < 0 {
				if idx == 0 || rowY <= boxStartY+1.5 {
					multiColSpanStartY = boxStartY
				} else {
					pdf.SetDrawColor(0, 0, 0)
					pdf.SetLineWidth(0.25)
					pdf.Line(left, rowY, left+contentWidth, rowY)
					multiColSpanStartY = rowY
				}
			}
			drawInitialAssessmentCompactFieldRowAt(pdf, rowY, r.height, r.fields, maxCols)
			pdf.SetY(rowY + r.height)
		} else {
			if multiColSpanStartY >= 0 {
				divY := rowY + 0.3
				pdf.SetDrawColor(0, 0, 0)
				pdf.SetLineWidth(0.25)
				for c := 1; c < maxCols; c++ {
					splitX := left + (contentWidth*float64(c))/float64(maxCols)
					pdf.Line(splitX, multiColSpanStartY, splitX, divY)
				}
				pdf.Line(left, divY, left+contentWidth, divY)
				multiColSpanStartY = -1.0
				rowY = divY + 0.6
				pdf.SetY(rowY)
			} else if idx > 0 && !rows[idx-1].isMultiCol {
				// Baris full-width berturut-turut dalam 1 kotak
			}
			drawInitialAssessmentKeyValueRowAtY(pdf, rowY, r.height, r.fields[0].Label, r.fields[0].Value)
			pdf.SetY(rowY + r.height)
		}
	}

	boxEndY := pdf.GetY() + 1.2
	lastMulti := len(rows) > 0 && rows[len(rows)-1].isMultiCol
	closeBoxOnCurrentPage(boxEndY, lastMulti)
	pdf.SetY(boxEndY)
	addInitialAssessmentSectionSpacing(pdf)
}

func isInitialAssessmentFieldCompactFriendly(pdf *gofpdf.Fpdf, field initialAssessmentPrintField, cols int) bool {
	trimmedLabel := sanitizePDFSingleLineText(field.Label)
	rawValue := strings.TrimSpace(sanitizePDFText(field.Value))
	if strings.Contains(rawValue, "\n") {
		return false
	}
	lowerLabel := strings.ToLower(trimmedLabel)
	if strings.Contains(lowerLabel, "keputusan") {
		return false
	}
	trimmedValue := sanitizePDFSingleLineText(rawValue)
	if trimmedLabel == "" || trimmedValue == "" {
		return true
	}

	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	colWidth := (contentWidth / float64(cols)) - 5.0
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(colWidth)
	valueWidth := colWidth - labelWidth - 5.5

	pdf.SetFont("Arial", "", 8.2)
	labelFits := len(pdf.SplitLines([]byte(trimmedLabel), labelWidth-1.0)) <= 2
	valueFits := len(pdf.SplitLines([]byte(trimmedValue), valueWidth-1.0)) <= 4
	return labelFits && valueFits
}

func drawInitialAssessmentCompactFieldRowAt(pdf *gofpdf.Fpdf, y float64, rowHeight float64, rowFields []initialAssessmentPrintField, maxCols int) {
	if len(rowFields) == 0 {
		return
	}
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	cellSpanW := contentWidth / float64(maxCols)
	colPad := 2.5
	colWidth := cellSpanW - (colPad * 2)
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(colWidth)

	for i, field := range rowFields {
		x := left + float64(i)*cellSpanW + colPad
		drawInitialAssessmentCompactFieldBox(pdf, x, y, colWidth, rowHeight, labelWidth, field)
	}
}

func measureInitialAssessmentSingleRowHeight(pdf *gofpdf.Fpdf, label string, value string) float64 {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	cols := resolveCompactGridColumnCount(contentWidth)
	innerWidth := contentWidth - 5.0
	colWidth := (contentWidth / float64(cols)) - 5.0
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(colWidth)
	colonW := 4.0
	valGap := 1.2
	valueWidth := innerWidth - labelWidth - colonW - valGap - 1.0

	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")
	pdf.SetFont("Arial", "", 8.2)
	labelLines := pdf.SplitLines([]byte(trimmedLabel), labelWidth-1.0)
	valueLines := pdf.SplitLines([]byte(trimmedValue), valueWidth)
	lineCount := maxInt(len(labelLines), len(valueLines))
	if lineCount < 1 {
		lineCount = 1
	}
	return maxFloat64(4.6, float64(lineCount)*3.8+0.8)
}

func drawInitialAssessmentKeyValueRowAtY(pdf *gofpdf.Fpdf, y float64, rowHeight float64, label string, value string) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	cols := resolveCompactGridColumnCount(contentWidth)
	innerLeft := left + 2.5
	innerWidth := contentWidth - 5.0
	colWidth := (contentWidth / float64(cols)) - 5.0
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(colWidth)
	colonW := 4.0
	valGap := 1.2
	valueWidth := innerWidth - labelWidth - colonW - valGap - 1.0

	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")

	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(innerLeft, y+0.4)
	pdf.SetFont("Arial", "", 8.2)
	pdf.MultiCell(labelWidth-1.0, 3.8, trimmedLabel, "", "L", false)

	pdf.SetXY(innerLeft+labelWidth, y+0.4)
	pdf.CellFormat(colonW, 3.8, ":", "", 0, "C", false, 0, "")

	pdf.SetXY(innerLeft+labelWidth+colonW+valGap, y+0.4)
	pdf.SetFont("Arial", "", 8.2)
	pdf.MultiCell(valueWidth, 3.8, trimmedValue, "", "L", false)
	pdf.SetXY(left, y+rowHeight)
}

func drawInitialAssessmentCompactFieldBox(pdf *gofpdf.Fpdf, x float64, y float64, totalWidth float64, _ float64, labelWidth float64, field initialAssessmentPrintField) {
	colonW := 4.0
	valGap := 1.2
	valueWidth := totalWidth - labelWidth - colonW - valGap - 1.0
	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(field.Label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(field.Value)), "-")

	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Arial", "", 8.2)
	pdf.SetXY(x, y+0.4)
	pdf.MultiCell(labelWidth-1.0, 3.8, trimmedLabel, "", "L", false)

	pdf.SetXY(x+labelWidth, y+0.4)
	pdf.CellFormat(colonW, 3.8, ":", "", 0, "C", false, 0, "")

	isEmphasized := strings.EqualFold(trimmedLabel, "Nama Pasien") ||
		strings.EqualFold(trimmedLabel, "No. Rekam Medis") ||
		strings.EqualFold(trimmedLabel, "No. Kunjungan")
	if isEmphasized {
		pdf.SetFont("Arial", "B", 8.2)
	} else {
		pdf.SetFont("Arial", "", 8.2)
	}
	pdf.SetXY(x+labelWidth+colonW+valGap, y+0.4)
	pdf.MultiCell(valueWidth, 3.8, trimmedValue, "", "L", false)
}

func measureInitialAssessmentCompactFieldBoxHeight(pdf *gofpdf.Fpdf, totalWidth float64, labelWidth float64, field initialAssessmentPrintField) float64 {
	colonW := 4.0
	valGap := 1.2
	valueWidth := totalWidth - labelWidth - colonW - valGap - 1.0
	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(field.Label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(field.Value)), "-")

	pdf.SetFont("Arial", "", 8.2)
	labelLines := pdf.SplitLines([]byte(trimmedLabel), labelWidth-1.0)
	valueLines := pdf.SplitLines([]byte(trimmedValue), valueWidth)
	lineCount := maxInt(len(labelLines), len(valueLines))
	if lineCount < 1 {
		lineCount = 1
	}

	return float64(lineCount)*3.8 + 0.8
}

func resolveInitialAssessmentCompactFieldLabelWidth(columnWidth float64) float64 {
	labelWidth := columnWidth * 0.36
	if labelWidth < 31 {
		labelWidth = 31
	}
	if labelWidth > 37 {
		labelWidth = 37
	}
	return labelWidth
}

func addInitialAssessmentImagesSection(pdf *gofpdf.Fpdf, images []initialAssessmentPrintImageView) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	addInitialAssessmentSectionTitle(pdf, "GAMBAR PEMERIKSAAN FISIK")
	if len(images) == 0 {
		boxStartY := pdf.GetY()
		pdf.SetY(boxStartY + 1.2)
		addInitialAssessmentFullWidthRow(pdf, "Tidak ada gambar pemeriksaan fisik pada entri ini.", false)
		boxEndY := pdf.GetY() + 1.2
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetLineWidth(0.25)
		pdf.Rect(left, boxStartY, contentWidth, boxEndY-boxStartY, "D")
		pdf.SetLineWidth(0.2)
		pdf.SetY(boxEndY)
		addInitialAssessmentSectionSpacing(pdf)
		return
	}

	for _, imageView := range images {
		blockHeight := measureInitialAssessmentImageBlockHeight(pdf, imageView)
		ensureInitialAssessmentPDFSpace(pdf, blockHeight+2)
		addInitialAssessmentPhysicalExamImageBlock(pdf, imageView)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addInitialAssessmentDiagnosisSection(pdf *gofpdf.Fpdf, diagnoses []initialAssessmentPrintDiagnosisView) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	addInitialAssessmentSectionTitle(pdf, "DIAGNOSIS")
	if len(diagnoses) == 0 {
		boxStartY := pdf.GetY()
		pdf.SetY(boxStartY + 1.2)
		addInitialAssessmentFullWidthRow(pdf, "Tidak ada diagnosis tercatat.", false)
		boxEndY := pdf.GetY() + 1.2
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetLineWidth(0.25)
		pdf.Rect(left, boxStartY, contentWidth, boxEndY-boxStartY, "D")
		pdf.SetLineWidth(0.2)
		pdf.SetY(boxEndY)
		addInitialAssessmentSectionSpacing(pdf)
		return
	}
	colWidths := []float64{
		contentWidth * 0.05, // No
		contentWidth * 0.12, // Jenis
		contentWidth * 0.12, // Kode ICD-10
		contentWidth * 0.38, // Nama Diagnosa
		contentWidth * 0.33, // Keterangan Klinis
	}
	colWidths[4] = contentWidth - (colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3])
	headers := []string{"NO", "JENIS", "KODE ICD", "DIAGNOSA / ICD-10", "KETERANGAN KLINIS"}

	drawHeader := func() {
		headerH := 5.6
		ensureInitialAssessmentPDFSpace(pdf, headerH+5.0)
		x := left
		y := pdf.GetY()
		pdf.SetFont("Arial", "B", 7.8)
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetLineWidth(0.25)
		for i, h := range headers {
			pdf.Rect(x, y, colWidths[i], headerH, "D")
			pdf.SetXY(x+1.0, y+0.4)
			pdf.CellFormat(colWidths[i]-2.0, headerH-0.8, h, "", 0, "C", false, 0, "")
			x += colWidths[i]
		}
		pdf.SetLineWidth(0.2)
		pdf.SetY(y + headerH)
	}

	drawHeader()

	for index, diag := range diagnoses {
		noteParts := make([]string, 0, 4)
		if v := strings.TrimSpace(diag.WorkingDiagnosis); v != "" && v != "-" {
			noteParts = append(noteParts, "Kerja: "+v)
		}
		if v := strings.TrimSpace(diag.DifferentialDiagnosis); v != "" && v != "-" {
			noteParts = append(noteParts, "Banding: "+v)
		}
		if v := strings.TrimSpace(diag.AssessmentNarrative); v != "" && v != "-" {
			noteParts = append(noteParts, v)
		}
		if v := strings.TrimSpace(diag.Notes); v != "" && v != "-" {
			noteParts = append(noteParts, "Catatan: "+v)
		}
		clinicalNote := "-"
		if len(noteParts) > 0 {
			clinicalNote = strings.Join(noteParts, "; ")
		}

		cells := []string{
			strconv.Itoa(index + 1),
			fallbackText(diag.Type),
			fallbackText(diag.Code),
			fallbackText(diag.Name),
			clinicalNote,
		}
		aligns := []string{"C", "C", "C", "L", "L"}

		pdf.SetFont("Arial", "", 8.0)
		maxLines := 1
		for i, cell := range cells {
			lines := pdf.SplitLines([]byte(sanitizePDFText(cell)), colWidths[i]-2.8)
			if len(lines) > maxLines {
				maxLines = len(lines)
			}
		}
		rowH := maxFloat64(5.4, float64(maxLines)*3.8+1.6)
		_, pageHeight := pdf.GetPageSize()
		if pdf.GetY()+rowH > pageHeight-initialAssessmentPDFMarginBottom {
			pdf.AddPage()
			pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
			drawHeader()
		}

		x := left
		y := pdf.GetY()
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetLineWidth(0.2)
		pdf.SetTextColor(0, 0, 0)
		for i, cell := range cells {
			pdf.Rect(x, y, colWidths[i], rowH, "D")
			pdf.SetXY(x+1.4, y+0.8)
			if i == 2 {
				pdf.SetFont("Arial", "B", 8.0)
			} else {
				pdf.SetFont("Arial", "", 8.0)
			}
			pdf.MultiCell(colWidths[i]-2.8, 3.8, sanitizePDFText(cell), "", aligns[i], false)
			x += colWidths[i]
		}
		pdf.SetY(y + rowH)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addInitialAssessmentSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, data initialAssessmentPrintViewData) {
	boxH := 28.0
	ensureInitialAssessmentPDFSpace(pdf, boxH)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columnWidth := contentWidth / 2
	splitX := left + columnWidth
	boxStartY := pdf.GetY()

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(left, boxStartY, contentWidth, boxH, "D")
	pdf.Line(splitX, boxStartY, splitX, boxStartY+boxH)
	pdf.SetLineWidth(0.2)

	signatureLocation := strings.TrimSpace(hospitalInfo.City)
	signatureDate := formatDateIndonesian(data.GeneratedAt)
	locationDateLabel := signatureDate
	if signatureLocation != "" {
		locationDateLabel = signatureLocation + ", " + signatureDate
	}

	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Arial", "", 8.4)
	pdf.SetXY(splitX, boxStartY+2.0)
	pdf.CellFormat(columnWidth, 4.0, locationDateLabel, "", 1, "C", false, 0, "")

	labelY := boxStartY + 6.0
	pdf.SetXY(left, labelY)
	pdf.CellFormat(columnWidth, 4.0, "Pasien / Keluarga", "", 0, "C", false, 0, "")
	pdf.SetXY(splitX, labelY)
	pdf.CellFormat(columnWidth, 4.0, "Dokter Pemeriksa", "", 1, "C", false, 0, "")

	nameY := boxStartY + boxH - 6.0
	pdf.SetFont("Arial", "B", 8.6)
	pdf.SetXY(left, nameY)
	pdf.CellFormat(columnWidth, 4.2, "( "+fallbackText(data.Visit.Patient.FullName)+" )", "", 0, "C", false, 0, "")
	pdf.SetXY(splitX, nameY)
	pdf.CellFormat(columnWidth, 4.2, "( "+fallbackText(data.Visit.Doctor.FullName)+" )", "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 8.2)
	pdf.SetY(boxStartY + boxH)
}

// addInitialAssessmentSectionTitle merender bar judul seksi berbingkai menyatu penuh (gaya Resep: TELAAH RESEP / PIO).
func addInitialAssessmentSectionTitle(pdf *gofpdf.Fpdf, title string) {
	barH := 5.0
	ensureInitialAssessmentPDFSpace(pdf, barH+9.0)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	title = firstNonEmpty(sanitizePDFSingleLineText(title), "-")

	y := pdf.GetY()
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(left, y, contentWidth, barH, "D")
	pdf.SetLineWidth(0.2)

	pdf.SetXY(left+2.5, y+0.3)
	pdf.SetFont("Arial", "B", 8.2)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(contentWidth-5.0, barH-0.6, strings.ToUpper(title), "", 0, "C", false, 0, "")
	pdf.SetY(y + barH)
	pdf.SetFont("Arial", "", 8.2)
}

func addInitialAssessmentKeyValueRow(pdf *gofpdf.Fpdf, label string, value string) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	cols := resolveCompactGridColumnCount(contentWidth)
	innerLeft := left + 2.5
	innerWidth := contentWidth - 5.0
	colGap := 6.0
	colWidth := (innerWidth - float64(cols-1)*colGap) / float64(cols)
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(colWidth)
	colonW := 4.0
	valGap := 1.2
	valueWidth := innerWidth - labelWidth - colonW - valGap - 1.0

	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")
	pdf.SetFont("Arial", "", 8.2)
	labelLines := pdf.SplitLines([]byte(trimmedLabel), labelWidth-1.0)
	valueLines := pdf.SplitLines([]byte(trimmedValue), valueWidth)
	lineCount := maxInt(len(labelLines), len(valueLines))
	if lineCount == 0 {
		lineCount = 1
	}
	rowHeight := maxFloat64(4.6, float64(lineCount)*3.8+0.8)
	ensureInitialAssessmentPDFSpace(pdf, rowHeight)

	y := pdf.GetY()
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(innerLeft, y+0.4)
	pdf.SetFont("Arial", "", 8.2)
	pdf.MultiCell(labelWidth-1.0, 3.8, trimmedLabel, "", "L", false)

	pdf.SetXY(innerLeft+labelWidth, y+0.4)
	pdf.CellFormat(colonW, 3.8, ":", "", 0, "C", false, 0, "")

	pdf.SetXY(innerLeft+labelWidth+colonW+valGap, y+0.4)
	pdf.SetFont("Arial", "", 8.2)
	pdf.MultiCell(valueWidth, 3.8, trimmedValue, "", "L", false)
	pdf.SetXY(left, y+rowHeight)
}

func addInitialAssessmentFullWidthRow(pdf *gofpdf.Fpdf, value string, bold bool) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")
	rowHeight := maxFloat64(4.8, measureInitialAssessmentTextRowHeight(pdf, trimmedValue, contentWidth-5.0, 8.2, 3.8))
	ensureInitialAssessmentPDFSpace(pdf, rowHeight)

	style := ""
	if bold {
		style = "B"
	}

	y := pdf.GetY()
	pdf.SetXY(left+2.5, y+0.4)
	pdf.SetFont("Arial", style, 8.2)
	pdf.SetTextColor(0, 0, 0)
	pdf.MultiCell(contentWidth-5.0, 3.8, trimmedValue, "", "L", false)
	pdf.SetXY(left, y+rowHeight)
}

func addInitialAssessmentPhysicalExamImageBlock(pdf *gofpdf.Fpdf, imageView initialAssessmentPrintImageView) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	imageColumnWidth := minFloat64(76, contentWidth*0.42)
	detailColumnWidth := contentWidth - imageColumnWidth
	imageBoxHeight := imageColumnWidth * 0.72
	detailRows := buildInitialAssessmentImageDetailRows(imageView)
	detailHeight := measureInitialAssessmentDetailRowsHeight(pdf, detailRows, detailColumnWidth)
	blockHeight := maxFloat64(imageBoxHeight, detailHeight)

	ensureInitialAssessmentPDFSpace(pdf, blockHeight+1.5)

	x := left
	y := pdf.GetY()
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.2)
	pdf.Rect(x, y, contentWidth, blockHeight, "D")
	pdf.Line(x+imageColumnWidth, y, x+imageColumnWidth, y+blockHeight)

	imageY := y + ((blockHeight - imageBoxHeight) / 2)
	drawInitialAssessmentPhysicalExamImageBox(pdf, x, imageY, imageColumnWidth, imageBoxHeight, imageView)
	drawInitialAssessmentDetailRows(pdf, x+imageColumnWidth, y, detailColumnWidth, detailRows)
	pdf.SetY(y + blockHeight)
}

func addInitialAssessmentSectionSpacing(_ *gofpdf.Fpdf) {
	// Zero spacing agar seluruh kotak seksi menyatu menjadi 1 bingkai besar utuh seperti Resep
}

func ensureInitialAssessmentPDFSpace(pdf *gofpdf.Fpdf, neededHeight float64) {
	_, pageHeight := pdf.GetPageSize()
	if pdf.GetY()+neededHeight > pageHeight-initialAssessmentPDFMarginBottom {
		pdf.AddPage()
		pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
	}
}

func setInitialAssessmentPDFPageContentStartOverride(pdf *gofpdf.Fpdf, pageNumber int, startY float64) {
	if pdf == nil || pageNumber < 1 {
		return
	}

	rawOverrides, loaded := initialAssessmentPDFPageStartOverrides.Load(pdf)
	if !loaded {
		initialAssessmentPDFPageStartOverrides.Store(pdf, map[int]float64{pageNumber: startY})
		return
	}

	overrides, ok := rawOverrides.(map[int]float64)
	if !ok {
		initialAssessmentPDFPageStartOverrides.Store(pdf, map[int]float64{pageNumber: startY})
		return
	}

	overrides[pageNumber] = startY
}

func clearInitialAssessmentPDFPageContentStartOverrides(pdf *gofpdf.Fpdf) {
	if pdf == nil {
		return
	}
	initialAssessmentPDFPageStartOverrides.Delete(pdf)
}

func initialAssessmentPDFPageContentStartForPDF(pdf *gofpdf.Fpdf, pageNumber int) float64 {
	if pdf != nil {
		if rawOverrides, ok := initialAssessmentPDFPageStartOverrides.Load(pdf); ok {
			if overrides, typeOK := rawOverrides.(map[int]float64); typeOK {
				if startY, exists := overrides[pageNumber]; exists {
					return startY
				}
			}
		}
	}

	return initialAssessmentPDFPageContentStart(pageNumber)
}

func initialAssessmentPDFPageContentStart(pageNumber int) float64 {
	if pageNumber <= 1 {
		return initialAssessmentPDFContentStart
	}

	return initialAssessmentPDFPageStart
}

func measureInitialAssessmentTextRowHeight(pdf *gofpdf.Fpdf, value string, width float64, fontSize float64, lineHeight float64) float64 {
	pdf.SetFont("Arial", "", fontSize)
	valueLines := pdf.SplitLines([]byte(firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")), width)
	lineCount := len(valueLines)
	if lineCount == 0 {
		lineCount = 1
	}

	return float64(lineCount)*lineHeight + 1.2
}

func measureInitialAssessmentFullWidthRowHeight(pdf *gofpdf.Fpdf, value string) float64 {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	return measureInitialAssessmentTextRowHeight(pdf, value, contentWidth-2.6, 8.0, 3.6)
}

func buildInitialAssessmentImageDetailRows(imageView initialAssessmentPrintImageView) []initialAssessmentPrintField {
	detailRows := make([]initialAssessmentPrintField, 0, 3)
	categoryValue := strings.Trim(strings.Join([]string{strings.TrimSpace(imageView.Category), strings.TrimSpace(imageView.Location)}, " | "), " |")
	if categoryValue != "" {
		detailRows = append(detailRows, initialAssessmentPrintField{Label: "Kategori", Value: categoryValue})
	}

	if trimmedNotes := strings.TrimSpace(imageView.Notes); trimmedNotes != "" {
		detailRows = append(detailRows, initialAssessmentPrintField{Label: "Catatan", Value: trimmedNotes})
	}

	detailRows = append(detailRows, initialAssessmentPrintField{Label: "Temuan", Value: buildInitialAssessmentMarkerSummary(imageView.Markers)})

	return detailRows
}

func measureInitialAssessmentDetailRowsHeight(pdf *gofpdf.Fpdf, fields []initialAssessmentPrintField, totalWidth float64) float64 {
	labelWidth := minFloat64(28, totalWidth*0.32)
	valueWidth := totalWidth - labelWidth
	totalHeight := 0.0
	for _, field := range fields {
		totalHeight += measureInitialAssessmentKeyValueRowHeight(pdf, field.Label, field.Value, labelWidth, valueWidth)
	}

	return totalHeight
}

func measureInitialAssessmentKeyValueRowHeight(pdf *gofpdf.Fpdf, label string, value string, labelWidth float64, valueWidth float64) float64 {
	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")
	pdf.SetFont("Arial", "", 7.8)
	labelLines := pdf.SplitLines([]byte(trimmedLabel), labelWidth-2.6)
	pdf.SetFont("Arial", "", 8.0)
	valueLines := pdf.SplitLines([]byte(trimmedValue), valueWidth-2.6)
	lineCount := maxInt(len(labelLines), len(valueLines))
	if lineCount == 0 {
		lineCount = 1
	}

	return maxFloat64(4.8, float64(lineCount)*3.6+1.2)
}

func drawInitialAssessmentDetailRows(pdf *gofpdf.Fpdf, x float64, y float64, totalWidth float64, fields []initialAssessmentPrintField) {
	labelWidth := minFloat64(28, totalWidth*0.32)
	valueWidth := totalWidth - labelWidth
	currentY := y
	for _, field := range fields {
		rowHeight := measureInitialAssessmentKeyValueRowHeight(pdf, field.Label, field.Value, labelWidth, valueWidth)
		drawInitialAssessmentKeyValueRowAt(pdf, x, currentY, labelWidth, valueWidth, rowHeight, field.Label, field.Value)
		currentY += rowHeight
	}
}

func drawInitialAssessmentKeyValueRowAt(pdf *gofpdf.Fpdf, x float64, y float64, labelWidth float64, valueWidth float64, rowHeight float64, label string, value string) {
	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.2)
	pdf.Rect(x, y, labelWidth, rowHeight, "D")
	pdf.Rect(x+labelWidth, y, valueWidth, rowHeight, "D")

	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(x+1.3, y+0.6)
	pdf.SetFont("Arial", "", 7.8)
	pdf.MultiCell(labelWidth-2.6, 3.6, trimmedLabel, "", "L", false)
	pdf.SetXY(x+labelWidth+1.3, y+0.6)
	pdf.SetFont("Arial", "", 8.0)
	pdf.MultiCell(valueWidth-2.6, 3.6, trimmedValue, "", "L", false)
}

func measureInitialAssessmentImageBlockHeight(pdf *gofpdf.Fpdf, imageView initialAssessmentPrintImageView) float64 {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	imageColumnWidth := minFloat64(82, contentWidth*0.46)
	columnGap := 4.0
	detailColumnWidth := contentWidth - imageColumnWidth - columnGap
	imageBoxHeight := imageColumnWidth * 0.75
	detailHeight := measureInitialAssessmentDetailRowsHeight(pdf, buildInitialAssessmentImageDetailRows(imageView), detailColumnWidth)

	return maxFloat64(imageBoxHeight, detailHeight)
}

func drawInitialAssessmentPhysicalExamImageBox(pdf *gofpdf.Fpdf, x float64, y float64, width float64, height float64, imageView initialAssessmentPrintImageView) {
	if imageView.FilePath == "" || imageView.ImageType == "" {
		drawInitialAssessmentImagePlaceholder(pdf, x, y, width, height, "Format gambar tidak didukung untuk dicetak.")
		return
	}

	widthPx, heightPx, err := readLocalImageDimensions(imageView.FilePath)
	if err != nil || widthPx == 0 || heightPx == 0 {
		drawInitialAssessmentImagePlaceholder(pdf, x, y, width, height, "Gambar tidak dapat dibaca saat render PDF.")
		return
	}

	displayWidth, displayHeight, offsetX, offsetY := calculateContainedImageBox(float64(widthPx), float64(heightPx), width, height)
	pdf.ImageOptions(imageView.FilePath, x+offsetX, y+offsetY, displayWidth, displayHeight, false, gofpdf.ImageOptions{ImageType: imageView.ImageType}, 0, "")

	for _, marker := range imageView.Markers {
		markerX := x + (marker.PosX/100.0)*width
		markerY := y + (marker.PosY/100.0)*height
		pdf.SetFillColor(220, 38, 38)
		pdf.SetDrawColor(255, 255, 255)
		pdf.Circle(markerX, markerY, 2.4, "FD")
		pdf.SetTextColor(255, 255, 255)
		pdf.SetFont("Arial", "B", 5.5)
		markerNumber := strconv.Itoa(marker.Number)
		textWidth := pdf.GetStringWidth(markerNumber)
		pdf.Text(markerX-(textWidth/2), markerY+0.9, markerNumber)
	}

	pdf.SetTextColor(0, 0, 0)
}

func buildInitialAssessmentMarkerSummary(markers []initialAssessmentPrintMarkerView) string {
	if len(markers) == 0 {
		return "-"
	}

	lines := make([]string, 0, len(markers))
	for _, marker := range markers {
		lines = append(lines, fmt.Sprintf("%d. %s", marker.Number, firstNonEmpty(strings.TrimSpace(marker.Label), "-")))
	}

	return strings.Join(lines, "\n")
}

func calculateContainedImageBox(imageWidth float64, imageHeight float64, containerWidth float64, containerHeight float64) (float64, float64, float64, float64) {
	if imageWidth <= 0 || imageHeight <= 0 {
		return containerWidth, containerHeight, 0, 0
	}

	scale := minFloat64(containerWidth/imageWidth, containerHeight/imageHeight)
	displayWidth := imageWidth * scale
	displayHeight := imageHeight * scale
	offsetX := (containerWidth - displayWidth) / 2
	offsetY := (containerHeight - displayHeight) / 2

	return displayWidth, displayHeight, offsetX, offsetY
}

func drawInitialAssessmentImagePlaceholder(pdf *gofpdf.Fpdf, x float64, y float64, width float64, height float64, message string) {
	pdf.SetXY(x+3, y+(height/2)-4)
	pdf.SetFont("Arial", "", 8)
	pdf.SetTextColor(110, 110, 110)
	pdf.MultiCell(width-6, 4, message, "", "C", false)
	pdf.SetTextColor(0, 0, 0)
}

func firstNonZeroRecordDate(records ...*models.MedicalRecord) *time.Time {
	for _, record := range records {
		if record != nil && !record.RecordDate.IsZero() {
			value := record.RecordDate
			return &value
		}
	}

	return nil
}

func resolveInitialAssessmentEntryLabel(entryGroupKey string, records []models.MedicalRecord) string {
	trimmed := strings.TrimSpace(entryGroupKey)
	if trimmed != "" && !strings.HasPrefix(trimmed, "legacy-") {
		return trimmed
	}

	ids := make([]string, 0, len(records))
	for _, record := range records {
		ids = append(ids, strconv.FormatUint(uint64(record.ID), 10))
	}

	return "Entri #" + strings.Join(ids, ", ")
}

func calculatePatientAgeLabel(birthDate *time.Time) string {
	if birthDate == nil || birthDate.IsZero() {
		return "-"
	}

	now := time.Now()
	age := now.Year() - birthDate.Year()
	if now.Month() < birthDate.Month() || (now.Month() == birthDate.Month() && now.Day() < birthDate.Day()) {
		age--
	}
	if age < 0 {
		return "-"
	}

	return strconv.Itoa(age) + " tahun"
}

func formatPatientAddress(patient models.Patient) string {
	streetLine := compactAddressStreetText(normalizeAddressDisplayCase(patient.Address))
	rtRw := strings.Trim(strings.Join([]string{normalizeAddressPart(patient.RT), normalizeAddressPart(patient.RW)}, "/"), "/")
	if rtRw != "" && !hasRTRWFragment(streetLine) {
		if streetLine == "" {
			streetLine = "RT " + strings.ReplaceAll(rtRw, "/", "/RW ")
		} else {
			streetLine = streetLine + ", RT " + strings.ReplaceAll(rtRw, "/", "/RW ")
		}
	}

	areaParts := make([]string, 0, 2)
	if kelurahan := normalizeAddressDisplayCase(patient.Kelurahan); kelurahan != "" {
		areaParts = append(areaParts, "Kel. "+kelurahan)
	}
	if kecamatan := normalizeAddressDisplayCase(patient.Kecamatan); kecamatan != "" {
		areaParts = append(areaParts, "Kec. "+kecamatan)
	}

	regionParts := make([]string, 0, 3)
	if city := normalizeAddressDisplayCase(patient.City); city != "" {
		regionParts = append(regionParts, formatCityAddressPart(city))
	}
	if province := normalizeAddressDisplayCase(patient.Province); province != "" {
		regionParts = append(regionParts, formatProvinceAddressPart(province))
	}
	if postalCode := normalizeAddressPart(patient.PostalCode); postalCode != "" {
		regionParts = append(regionParts, "Kode Pos "+postalCode)
	}

	parts := make([]string, 0, 3)
	if streetLine != "" {
		parts = append(parts, streetLine)
	}
	if len(areaParts) > 0 {
		parts = append(parts, strings.Join(deduplicateAddressParts(areaParts), ", "))
	}
	if len(regionParts) > 0 {
		parts = append(parts, strings.Join(deduplicateAddressParts(regionParts), ", "))
	}

	parts = deduplicateAddressParts(parts)
	if len(parts) == 0 {
		return "-"
	}

	return strings.Join(parts, ", ")
}

func compactAddressStreetText(value string) string {
	if value == "" {
		return ""
	}

	replacer := strings.NewReplacer(
		"Jalan ", "Jl. ",
		"jalan ", "Jl. ",
		"Nomor ", "No. ",
		"nomor ", "No. ",
		"Gang ", "Gg. ",
		"gang ", "Gg. ",
		"Perumahan ", "Perum. ",
		"perumahan ", "Perum. ",
	)

	return replacer.Replace(value)
}

func normalizeAddressPart(value string) string {
	cleaned := strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	return strings.Trim(cleaned, ",;/")
}

func normalizeAddressDisplayCase(value string) string {
	normalized := normalizeAddressPart(value)
	if normalized == "" || !looksMostlyUppercase(normalized) {
		return normalized
	}

	words := strings.Fields(strings.ToLower(normalized))
	for index, word := range words {
		if word == "" {
			continue
		}
		runes := []rune(word)
		runes[0] = unicode.ToUpper(runes[0])
		words[index] = string(runes)
	}

	return strings.Join(words, " ")
}

func looksMostlyUppercase(value string) bool {
	letterCount := 0
	upperCount := 0
	for _, r := range value {
		if !unicode.IsLetter(r) {
			continue
		}
		letterCount++
		if unicode.IsUpper(r) {
			upperCount++
		}
	}

	if letterCount == 0 {
		return false
	}

	return upperCount*100/letterCount >= 80
}

func hasRTRWFragment(value string) bool {
	upper := strings.ToUpper(normalizeAddressPart(value))
	if upper == "" {
		return false
	}

	return strings.Contains(upper, "RT/RW") || (strings.Contains(upper, "RT") && strings.Contains(upper, "RW"))
}

func formatCityAddressPart(value string) string {
	normalized := normalizeAddressPart(value)
	lower := strings.ToLower(normalized)
	if normalized == "" {
		return ""
	}
	if strings.Contains(lower, "kab") || strings.Contains(lower, "kota") {
		return normalized
	}
	return "Kab/Kota " + normalized
}

func formatProvinceAddressPart(value string) string {
	normalized := normalizeAddressPart(value)
	if normalized == "" {
		return ""
	}
	if strings.Contains(strings.ToLower(normalized), "prov") {
		return normalized
	}
	return "Prov. " + normalized
}

func deduplicateAddressParts(parts []string) []string {
	if len(parts) == 0 {
		return nil
	}

	filtered := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		normalized := normalizeAddressPart(part)
		if normalized == "" {
			continue
		}

		key := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(normalized, ".", ""), " ", ""))
		if _, exists := seen[key]; exists {
			continue
		}

		seen[key] = struct{}{}
		filtered = append(filtered, normalized)
	}

	return filtered
}

func buildInitialAssessmentVisitFields(visit models.Visit) []initialAssessmentPrintField {
	fields := []initialAssessmentPrintField{
		{Label: "No. Kunjungan", Value: fallbackText(visit.VisitNumber)},
		{Label: "Tanggal Kunjungan", Value: formatVisitDateForPrint(visit.VisitDate)},
		{Label: "Poliklinik", Value: fallbackText(visit.Polyclinic.Name)},
		{Label: "Dokter", Value: fallbackText(visit.Doctor.FullName)},
		{Label: "Jenis Kunjungan", Value: formatVisitTypeForPrint(visit.VisitType)},
		{Label: "Pembiayaan", Value: formatPaymentTypeForPrint(visit.PaymentType)},
		{Label: "Keluhan Awal", Value: fallbackText(visit.Complaint)},
	}

	return fields
}

func buildInitialAssessmentPatientFields(patient models.Patient) []initialAssessmentPrintField {
	fields := []initialAssessmentPrintField{
		{Label: "No. Rekam Medis", Value: fallbackText(patient.MedicalRecordNumber)},
		{Label: "Nama Pasien", Value: fallbackText(patient.FullName)},
		{Label: "Tanggal Lahir", Value: formatDatePointer(patient.BirthDate)},
		{Label: "Jenis Kelamin", Value: fallbackText(genderLabelForPrint(patient.Gender))},
		{Label: "No. Telepon", Value: fallbackText(patient.Phone)},
		{Label: "Alamat", Value: formatPatientAddress(patient)},
	}

	return fields
}

func buildInitialAssessmentAnamnesisFields(record *models.MedicalRecord) []initialAssessmentPrintField {
	if record == nil {
		return nil
	}

	return []initialAssessmentPrintField{
		{Label: "Keluhan Utama", Value: fallbackText(record.ChiefComplaint)},
		{Label: "Subjektif", Value: fallbackText(record.Subjective)},
		{Label: "Riwayat Penyakit Sekarang", Value: fallbackText(record.HistoryOfPresentIllness)},
		{Label: "Riwayat Penyakit Dahulu", Value: fallbackText(record.PastMedicalHistory)},
		{Label: "Riwayat Operasi", Value: fallbackText(record.PastSurgicalHistory)},
		{Label: "Riwayat Keluarga", Value: fallbackText(record.FamilyHistory)},
		{Label: "Riwayat Pengobatan", Value: fallbackText(record.MedicationHistory)},
		{Label: "Riwayat Sosial", Value: fallbackText(record.SocialHistory)},
		{Label: "Review of Systems", Value: fallbackText(record.ReviewOfSystems)},
		{Label: "Clinical Alert", Value: fallbackText(record.ClinicalAlert)},
		{Label: "Alergi", Value: fallbackText(record.AllergyNotes)},
	}
}

func buildInitialAssessmentPhysicalExamFields(record *models.MedicalRecord) []initialAssessmentPrintField {
	if record == nil {
		return nil
	}

	fields := []initialAssessmentPrintField{}
	if record.BPSystolic > 0 || record.BPDiastolic > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "Tekanan Darah", Value: fmt.Sprintf("%d/%d mmHg", record.BPSystolic, record.BPDiastolic)})
	}
	if record.HeartRate > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "Nadi", Value: fmt.Sprintf("%d x/menit", record.HeartRate)})
	}
	if record.RespiratoryRate > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "Respirasi", Value: fmt.Sprintf("%d x/menit", record.RespiratoryRate)})
	}
	if record.Temperature > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "Suhu", Value: fmt.Sprintf("%.1f C", record.Temperature)})
	}
	if record.SpO2 > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "SpO2", Value: fmt.Sprintf("%.0f%%", record.SpO2)})
	}
	if trimmed := strings.TrimSpace(record.Consciousness); trimmed != "" {
		fields = append(fields, initialAssessmentPrintField{Label: "Kesadaran", Value: formatConsciousnessForPrint(trimmed)})
	}
	if record.Height > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "Tinggi Badan", Value: fmt.Sprintf("%.0f cm", record.Height)})
	}
	if record.Weight > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "Berat Badan", Value: fmt.Sprintf("%.0f kg", record.Weight)})
	}
	if record.BMI > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "BMI", Value: fmt.Sprintf("%.1f", record.BMI)})
	}
	if record.PainScale > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "Skala Nyeri", Value: fmt.Sprintf("%d (%s)", record.PainScale, strings.ToUpper(fallbackText(record.PainScaleType)))})
	}
	fields = append(fields,
		initialAssessmentPrintField{Label: "Pemeriksaan Fisik", Value: fallbackText(record.PhysicalExamination)},
		initialAssessmentPrintField{Label: "Pemeriksaan Penunjang", Value: fallbackText(record.SupportingExamination)},
	)

	return fields
}

func buildInitialAssessmentAssessmentFields(record *models.MedicalRecord) []initialAssessmentPrintField {
	if record == nil {
		return nil
	}

	return []initialAssessmentPrintField{
		{Label: "Diagnosis Kerja", Value: fallbackText(record.WorkingDiagnosis)},
		{Label: "Diagnosis Banding", Value: fallbackText(record.DifferentialDiagnosis)},
		{Label: "Assessment", Value: fallbackText(record.Assessment)},
		{Label: "Catatan", Value: fallbackText(record.Notes)},
	}
}

func buildInitialAssessmentImageViews(record *models.MedicalRecord) []initialAssessmentPrintImageView {
	if record == nil || len(record.PhysicalExamImages) == 0 {
		return nil
	}

	imageViews := make([]initialAssessmentPrintImageView, 0, len(record.PhysicalExamImages))
	imagePicks := append([]models.MedicalRecordImagePick(nil), record.PhysicalExamImages...)
	sort.SliceStable(imagePicks, func(left, right int) bool {
		if imagePicks[left].SortOrder == imagePicks[right].SortOrder {
			return imagePicks[left].ID < imagePicks[right].ID
		}
		return imagePicks[left].SortOrder < imagePicks[right].SortOrder
	})

	for _, imagePick := range imagePicks {
		markers := append([]models.MedicalRecordImagePickMarker(nil), imagePick.Markers...)
		sort.SliceStable(markers, func(left, right int) bool {
			return markers[left].ID < markers[right].ID
		})

		markerViews := make([]initialAssessmentPrintMarkerView, 0, len(markers))
		for index, marker := range markers {
			markerViews = append(markerViews, initialAssessmentPrintMarkerView{
				Number: index + 1,
				Label:  fallbackText(marker.MarkerLabel),
				PosX:   marker.PosX,
				PosY:   marker.PosY,
			})
		}

		filePath, imageType, _ := resolveLocalPDFImage(imagePick.PhysicalExamImageMaster.ImageURL)

		imageViews = append(imageViews, initialAssessmentPrintImageView{
			Name:        fallbackText(imagePick.PhysicalExamImageMaster.Name),
			Category:    fallbackText(imagePick.PhysicalExamImageMaster.Category),
			Location:    fallbackText(imagePick.PhysicalExamImageMaster.Location),
			Description: fallbackText(imagePick.PhysicalExamImageMaster.Description),
			Notes:       fallbackText(imagePick.Notes),
			FilePath:    filePath,
			ImageType:   imageType,
			Markers:     markerViews,
		})
	}

	return imageViews
}

func buildInitialAssessmentDiagnosisViews(record *models.MedicalRecord) []initialAssessmentPrintDiagnosisView {
	if record == nil || len(record.Diagnoses) == 0 {
		return nil
	}

	diagnoses := append([]models.MedicalRecordDiagnosis(nil), record.Diagnoses...)
	sort.SliceStable(diagnoses, func(left, right int) bool {
		leftRank := diagnosisTypeRank(diagnoses[left].DiagnosisType)
		rightRank := diagnosisTypeRank(diagnoses[right].DiagnosisType)
		if leftRank == rightRank {
			return diagnoses[left].ID < diagnoses[right].ID
		}
		return leftRank < rightRank
	})

	views := make([]initialAssessmentPrintDiagnosisView, 0, len(diagnoses))
	for _, diagnosis := range diagnoses {
		views = append(views, initialAssessmentPrintDiagnosisView{
			Type:                  fallbackText(formatDiagnosisTypeLabel(diagnosis.DiagnosisType)),
			Code:                  fallbackText(diagnosis.ICD10.Code),
			Name:                  fallbackText(diagnosis.ICD10.Name),
			WorkingDiagnosis:      fallbackText(diagnosis.WorkingDiagnosis),
			DifferentialDiagnosis: fallbackText(diagnosis.DifferentialDiagnosis),
			AssessmentNarrative:   fallbackText(diagnosis.AssessmentNarrative),
			Notes:                 fallbackText(diagnosis.Notes),
		})
	}

	return views
}

func formatDiagnosisTypeLabel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "primer":
		return "Primer"
	case "sekunder":
		return "Sekunder"
	default:
		return fallbackText(value)
	}
}

func diagnosisTypeRank(value string) int {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "primer":
		return 0
	case "sekunder":
		return 1
	default:
		return 2
	}
}

func resolveLocalPDFImage(rawValue string) (string, string, bool) {
	trimmed := strings.TrimSpace(rawValue)
	if trimmed == "" || strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		return "", "", false
	}

	relativePath := strings.TrimPrefix(trimmed, "/")
	localPath := filepath.Clean(filepath.Join(".", filepath.FromSlash(relativePath)))
	if _, err := os.Stat(localPath); err != nil {
		return "", "", false
	}

	switch strings.ToLower(filepath.Ext(localPath)) {
	case ".png":
		return localPath, "PNG", true
	case ".jpg", ".jpeg":
		return localPath, "JPG", true
	default:
		return "", "", false
	}
}

func readLocalImageDimensions(filePath string) (int, int, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()

	config, _, err := image.DecodeConfig(file)
	if err != nil {
		return 0, 0, err
	}

	return config.Width, config.Height, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func sanitizePDFFileName(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	if trimmed == "" {
		return "dokumen"
	}

	replacer := strings.NewReplacer(" ", "-", "/", "-", "\\", "-", ":", "-", "*", "", "?", "", "\"", "", "<", "", ">", "", "|", "")
	trimmed = replacer.Replace(trimmed)
	trimmed = strings.Trim(trimmed, "-.")
	if trimmed == "" {
		return "dokumen"
	}
	return trimmed
}

func formatRecordDateTimePDF(value *time.Time) string {
	if value == nil || value.IsZero() {
		return "-"
	}
	return formatDateTimeIndonesian(*value)
}

func formatDateIndonesian(t time.Time) string {
	months := []string{"", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}
	return fmt.Sprintf("%d %s %d", t.Day(), months[t.Month()], t.Year())
}

func formatDateTimeIndonesian(t time.Time) string {
	months := []string{"", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}
	return fmt.Sprintf("%d %s %d %02d:%02d", t.Day(), months[t.Month()], t.Year(), t.Hour(), t.Minute())
}

func maxFloat64(left float64, right float64) float64 {
	if left > right {
		return left
	}
	return right
}

func minFloat64(left float64, right float64) float64 {
	if left < right {
		return left
	}
	return right
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func formatDatePointer(value *time.Time) string {
	if value == nil || value.IsZero() {
		return "-"
	}
	return value.Format("02 Jan 2006")
}

func genderLabelForPrint(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "L", "M":
		return "Laki-laki"
	case "P", "F":
		return "Perempuan"
	default:
		return "-"
	}
}

func fallbackText(value string) string {
	trimmed := strings.TrimSpace(sanitizePDFText(value))
	if trimmed == "" {
		return "-"
	}
	return trimmed
}

func sanitizePDFText(value string) string {
	normalized := initialAssessmentPDFTextReplacer.Replace(value)
	normalized = strings.Map(func(r rune) rune {
		switch r {
		case '\n':
			return '\n'
		case '\r':
			return '\n'
		case '\t':
			return ' '
		case 'À', 'Á', 'Â', 'Ã', 'Ä', 'Å', 'Ā', 'Ă', 'Ą':
			return 'A'
		case 'à', 'á', 'â', 'ã', 'ä', 'å', 'ā', 'ă', 'ą':
			return 'a'
		case 'Ç', 'Ć', 'Č':
			return 'C'
		case 'ç', 'ć', 'č':
			return 'c'
		case 'È', 'É', 'Ê', 'Ë', 'Ē', 'Ė', 'Ę':
			return 'E'
		case 'è', 'é', 'ê', 'ë', 'ē', 'ė', 'ę':
			return 'e'
		case 'Ì', 'Í', 'Î', 'Ï', 'Ī', 'Į':
			return 'I'
		case 'ì', 'í', 'î', 'ï', 'ī', 'į':
			return 'i'
		case 'Ñ', 'Ń':
			return 'N'
		case 'ñ', 'ń':
			return 'n'
		case 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Ø', 'Ō':
			return 'O'
		case 'ò', 'ó', 'ô', 'õ', 'ö', 'ø', 'ō':
			return 'o'
		case 'Ù', 'Ú', 'Û', 'Ü', 'Ū':
			return 'U'
		case 'ù', 'ú', 'û', 'ü', 'ū':
			return 'u'
		case 'Ý', 'Ÿ':
			return 'Y'
		case 'ý', 'ÿ':
			return 'y'
		case 'Ž':
			return 'Z'
		case 'ž':
			return 'z'
		case 'Ł':
			return 'L'
		case 'ł':
			return 'l'
		case 'Đ':
			return 'D'
		case 'đ':
			return 'd'
		case 'ß':
			return 's'
		case '×', '✕', '✖', '⨯':
			return 'x'
		}

		if r >= 32 && r <= 126 {
			return r
		}

		return ' '
	}, normalized)

	lines := strings.Split(normalized, "\n")
	for index, line := range lines {
		lines[index] = strings.Join(strings.Fields(line), " ")
	}

	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func sanitizePDFSingleLineText(value string) string {
	normalized := strings.ReplaceAll(sanitizePDFText(value), "\n", " ")
	return strings.Join(strings.Fields(normalized), " ")
}
