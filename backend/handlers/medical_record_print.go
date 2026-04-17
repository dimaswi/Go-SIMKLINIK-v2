package handlers

import (
	"bytes"
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
	initialAssessmentPDFMarginLeft   = 15.0
	initialAssessmentPDFMarginTop    = 10.0
	initialAssessmentPDFMarginRight  = 15.0
	initialAssessmentPDFMarginBottom = 12.0
	initialAssessmentPDFContentStart = 50.0
	initialAssessmentPDFPageStart    = 12.0
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
	GeneratedAt       time.Time
	Visit             models.Visit
	EntryGroupKey     string
	EntryRecordDate   *time.Time
	SuratType         string
	SuratTypeLabel    string
	PrintedByLabel    string
	ValidationBaseURL string
	DocumentFields    []initialAssessmentPrintField
	PatientFields     []initialAssessmentPrintField
	VisitFields       []initialAssessmentPrintField
	AssessmentFields  []initialAssessmentPrintField
	OutcomeFields     []initialAssessmentPrintField
	StatementTemplate string
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

	viewData := buildSuratPrintViewData(c, visit, resolvedEntryGroupKey, records)
	hospitalInfo := getInitialAssessmentHospitalInfo()
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

func buildSuratPrintViewData(c *gin.Context, visit models.Visit, entryGroupKey string, records []models.MedicalRecord) suratPrintViewData {
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

	generatedAt := time.Now()
	printedBy := resolvePrintedByLabel(c)

	return suratPrintViewData{
		GeneratedAt:       generatedAt,
		Visit:             visit,
		EntryGroupKey:     entryGroupKey,
		EntryRecordDate:   firstNonZeroRecordDate(assessmentRecord, outcomeRecord),
		SuratType:         suratType,
		SuratTypeLabel:    getSuratTypeLabel(suratType),
		PrintedByLabel:    printedBy,
		ValidationBaseURL: resolveTTEVerificationBaseURLForRequest(c),
		DocumentFields:    buildSuratDocumentFields(generatedAt, printedBy, suratType, entryGroupKey),
		PatientFields:     buildInitialAssessmentPatientFields(visit.Patient),
		VisitFields:       buildSuratVisitFields(visit),
		AssessmentFields:  buildSuratAssessmentFields(assessmentRecord, suratType),
		OutcomeFields:     buildSuratOutcomeFields(outcomeRecord, suratType),
		StatementTemplate: buildSuratStatementTemplate(visit, suratType),
	}
}

func buildSuratVisitFields(visit models.Visit) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "No. Kunjungan", Value: fallbackText(visit.VisitNumber)},
		{Label: "Tanggal Kunjungan", Value: visit.VisitDate.Format("02 Jan 2006 15:04")},
		{Label: "Poliklinik", Value: fallbackText(visit.Polyclinic.Name)},
		{Label: "Dokter", Value: fallbackText(visit.Doctor.FullName)},
		{Label: "Jenis Kunjungan", Value: fallbackText(visit.VisitType)},
		{Label: "Pembiayaan", Value: fallbackText(visit.PaymentType)},
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
	default:
		return suratPDFSectionMeta{
			assessmentTitle: "PERTIMBANGAN SURAT",
			assessmentEmpty: "Pertimbangan surat belum diisi.",
			outcomeTitle:    "KETERANGAN SURAT",
			outcomeEmpty:    "Keterangan surat belum diisi.",
		}
	}
}

func renderSuratEntryPDF(hospitalInfo initialAssessmentHospitalInfo, data suratPrintViewData) ([]byte, string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)
	documentTitle := data.SuratTypeLabel
	sectionMeta := buildSuratPDFSectionMeta(data.SuratType)
	tteSignature := (*ttePrintSignatureInfo)(nil)
	if strings.TrimSpace(data.EntryGroupKey) != "" {
		tteSignature = loadTTESignedSignatureByDocumentKeyWithBaseURL(buildTTESuratDocumentKey(data.Visit.ID, data.EntryGroupKey), data.ValidationBaseURL)
	}
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
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, strings.ToUpper(documentTitle), fallbackText(data.Visit.VisitNumber))
	}, true)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-8)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(90, 90, 90)
		pdf.CellFormat(90, 4, "Dicetak: "+formatDateTimeIndonesian(data.GeneratedAt), "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	addInitialAssessmentCompactFieldSection(pdf, "INFORMASI SURAT", data.DocumentFields, "")
	addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", data.PatientFields, "Data pasien tidak tersedia.")
	addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", data.VisitFields, "Data kunjungan tidak tersedia.")
	addInitialAssessmentFieldSection(pdf, "PERNYATAAN", []initialAssessmentPrintField{{Label: "Ringkasan", Value: data.StatementTemplate}}, "-")
	addInitialAssessmentFieldSection(pdf, sectionMeta.assessmentTitle, data.AssessmentFields, sectionMeta.assessmentEmpty)
	addInitialAssessmentFieldSection(pdf, sectionMeta.outcomeTitle, data.OutcomeFields, sectionMeta.outcomeEmpty)
	addOrderPrintSignatureSectionWithTTE(pdf, hospitalInfo, data.GeneratedAt, "Pasien / Keluarga", data.Visit.Patient.FullName, "Dokter Pemeriksa", data.Visit.Doctor.FullName, tteSignature)

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
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, strings.ToUpper(documentTitle), fallbackText(data.Visit.VisitNumber))
	}, true)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-8)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(90, 90, 90)
		pdf.CellFormat(90, 4, "Dicetak: "+formatDateTimeIndonesian(data.GeneratedAt), "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	addInitialAssessmentMetadata(pdf, data)
	addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", data.PatientFields, "Data pasien tidak tersedia.")
	addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", data.VisitFields, "Data kunjungan tidak tersedia.")
	addInitialAssessmentFieldSection(pdf, "ANAMNESIS", data.AnamnesisFields, "Tidak ada data anamnesis.")
	addInitialAssessmentFieldSection(pdf, "PEMERIKSAAN FISIK", data.PhysicalExamFields, "Tidak ada data pemeriksaan fisik.")
	addInitialAssessmentImagesSection(pdf, data.PhysicalExamImages)
	addInitialAssessmentFieldSection(pdf, "ASSESSMENT", data.AssessmentFields, "Tidak ada data assessment.")
	addInitialAssessmentDiagnosisSection(pdf, data.Diagnoses)
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
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, "CONTOH KOP PDF", "Preview dari halaman settings")
	}, true)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-8)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(90, 90, 90)
		pdf.CellFormat(90, 4, "Preview pengaturan KOP", "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	addInitialAssessmentFieldSection(pdf, "RINGKASAN KOP", []initialAssessmentPrintField{
		{Label: "Nama Fasilitas", Value: hospitalInfo.Name},
		{Label: "Alamat", Value: strings.Trim(strings.Join([]string{hospitalInfo.Address, hospitalInfo.City}, ", "), ", ")},
		{Label: "Telepon", Value: hospitalInfo.Phone},
		{Label: "Fax", Value: hospitalInfo.Fax},
		{Label: "Email", Value: hospitalInfo.Email},
		{Label: "Website", Value: hospitalInfo.Website},
	}, "Belum ada data KOP.")

	addInitialAssessmentFullWidthRow(pdf, "Preview ini menggunakan nilai yang sedang ada di form settings. Jadi Anda bisa mengecek tampilan KOP PDF sebelum menyimpan perubahan.", false)
	pdf.SetY(pdf.GetY() + 3)

	addInitialAssessmentFieldSection(pdf, "CONTOH ISI DOKUMEN", []initialAssessmentPrintField{
		{Label: "Tujuan", Value: "Bagian ini hanya simulasi konten untuk melihat posisi dan proporsi KOP pada PDF."},
		{Label: "Catatan", Value: "Dokumen rekam medis asli seperti pengkajian awal, resume medis, dan lembar lain akan memakai KOP yang sama."},
	}, "")

	pdf.SetFont("Arial", "", 10)
	pdf.SetY(pdf.GetY() + 6)
	pdf.CellFormat(90, 5, "Petugas Administrasi", "", 0, "C", false, 0, "")
	pdf.CellFormat(0, 5, "Penanggung Jawab Dokumen", "", 1, "C", false, 0, "")
	pdf.SetY(pdf.GetY() + 16)
	pdf.CellFormat(90, 5, "(____________________)", "", 0, "C", false, 0, "")
	pdf.CellFormat(0, 5, "(____________________)", "", 1, "C", false, 0, "")

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
	currentY := top + 2.5
	hasLogo := info.LogoPath != "" && info.LogoType != ""
	logoSlotWidth := 0.0
	logoGap := 0.0
	logoMaxHeight := 22.0
	logoMaxWidth := 24.0
	if hasLogo {
		logoSlotWidth = 28.0
		logoGap = 4.0
	}

	textStartX := left
	textWidth := contentWidth
	if hasLogo {
		symmetricReserve := logoSlotWidth + logoGap
		textStartX = left + symmetricReserve
		textWidth = contentWidth - (2 * symmetricReserve)
		if textWidth < 110 {
			textStartX = left + logoSlotWidth + logoGap
			textWidth = contentWidth - logoSlotWidth - logoGap
		}
	}

	type headerLine struct {
		text       string
		fontStyle  string
		fontSize   float64
		lineHeight float64
	}

	lines := []headerLine{{
		text:       strings.ToUpper(fallbackText(info.Name)),
		fontStyle:  "B",
		fontSize:   16,
		lineHeight: 6,
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
			fontSize:   8.5,
			lineHeight: 4.0,
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
	if len(contactParts) > 0 {
		lines = append(lines, headerLine{
			text:       strings.Join(contactParts, " | "),
			fontStyle:  "",
			fontSize:   8.5,
			lineHeight: 4.0,
		})
	}

	if trimmed := strings.TrimSpace(sanitizePDFText(info.Website)); trimmed != "" {
		lines = append(lines, headerLine{
			text:       trimmed,
			fontStyle:  "",
			fontSize:   8.5,
			lineHeight: 4.0,
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

	logoWidth := 0.0
	logoHeight := 0.0
	if hasLogo {
		logoWidth, logoHeight = measureInitialAssessmentHeaderLogo(info.LogoPath, logoMaxHeight, logoMaxWidth)
	}

	headerBlockHeight := maxFloat64(textBlockHeight, logoHeight)
	if !hasLogo {
		headerBlockHeight = textBlockHeight
	}

	if hasLogo {
		logoX := left + ((logoSlotWidth - logoWidth) / 2)
		logoY := currentY + ((textBlockHeight - logoHeight) / 2) - 0.8
		if logoY < top {
			logoY = top
		}
		drawInitialAssessmentHeaderLogo(pdf, info.LogoPath, info.LogoType, logoX, logoY, logoMaxHeight, logoMaxWidth)
	}

	pdf.SetXY(textStartX, currentY)
	for _, line := range lines {
		trimmedText := strings.TrimSpace(sanitizePDFText(line.text))
		if trimmedText == "" {
			continue
		}
		pdf.SetX(textStartX)
		pdf.SetFont("Arial", line.fontStyle, line.fontSize)
		pdf.MultiCell(textWidth, line.lineHeight, trimmedText, "", "C", false)
	}

	lineY := currentY + headerBlockHeight
	pdf.SetLineWidth(0.7)
	pdf.Line(left, lineY, pageWidth-right, lineY)
	pdf.SetLineWidth(0.2)
	pdf.Line(left, lineY+0.8, pageWidth-right, lineY+0.8)

	pdf.SetY(lineY + 2.8)
	pdf.SetFont("Arial", "B", 14)
	pdf.CellFormat(contentWidth, 6, firstNonEmpty(sanitizePDFText(title), "-"), "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 10)
	pdf.CellFormat(contentWidth, 4.5, firstNonEmpty(sanitizePDFText(subtitle), "-"), "", 1, "C", false, 0, "")

	contentStartY := maxFloat64(initialAssessmentPDFContentStart, pdf.GetY()+2)
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

func addInitialAssessmentFieldSection(pdf *gofpdf.Fpdf, title string, fields []initialAssessmentPrintField, emptyMessage string) {
	addInitialAssessmentSectionTitle(pdf, title)
	if len(fields) == 0 {
		addInitialAssessmentFullWidthRow(pdf, firstNonEmpty(emptyMessage, "Tidak ada data."), false)
		return
	}

	for _, field := range fields {
		addInitialAssessmentKeyValueRow(pdf, field.Label, field.Value)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addInitialAssessmentCompactFieldSection(pdf *gofpdf.Fpdf, title string, fields []initialAssessmentPrintField, emptyMessage string) {
	addInitialAssessmentSectionTitle(pdf, title)
	if len(fields) == 0 {
		addInitialAssessmentFullWidthRow(pdf, firstNonEmpty(emptyMessage, "Tidak ada data."), false)
		return
	}

	pending := make([]initialAssessmentPrintField, 0, 2)
	flushPending := func() {
		if len(pending) == 0 {
			return
		}
		if len(pending) == 1 {
			drawInitialAssessmentCompactSingleFieldRow(pdf, pending[0])
			pending = pending[:0]
			return
		}
		drawInitialAssessmentCompactFieldPair(pdf, pending[0], pending[1])
		pending = pending[:0]
	}

	for _, field := range fields {
		if !isInitialAssessmentFieldCompactFriendly(pdf, field) {
			flushPending()
			addInitialAssessmentKeyValueRow(pdf, field.Label, field.Value)
			continue
		}

		pending = append(pending, field)
		if len(pending) == 2 {
			flushPending()
		}
	}

	flushPending()
	addInitialAssessmentSectionSpacing(pdf)
}

func isInitialAssessmentFieldCompactFriendly(pdf *gofpdf.Fpdf, field initialAssessmentPrintField) bool {
	trimmedLabel := sanitizePDFSingleLineText(field.Label)
	trimmedValue := sanitizePDFSingleLineText(field.Value)
	if strings.EqualFold(trimmedLabel, "Alamat") {
		return false
	}
	if trimmedLabel == "" || trimmedValue == "" {
		return true
	}

	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	halfWidth := contentWidth / 2
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(halfWidth)
	valueWidth := halfWidth - labelWidth

	pdf.SetFont("Arial", "", 9)
	labelFits := len(pdf.SplitLines([]byte(trimmedLabel), labelWidth-4)) <= 1
	valueFits := len(pdf.SplitLines([]byte(trimmedValue), valueWidth-4)) <= 1
	return labelFits && valueFits
}

func drawInitialAssessmentCompactFieldPair(pdf *gofpdf.Fpdf, leftField initialAssessmentPrintField, rightField initialAssessmentPrintField) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	halfWidth := contentWidth / 2
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(halfWidth)
	rowHeight := maxFloat64(
		measureInitialAssessmentCompactFieldBoxHeight(pdf, halfWidth, labelWidth, leftField),
		measureInitialAssessmentCompactFieldBoxHeight(pdf, halfWidth, labelWidth, rightField),
	)
	ensureInitialAssessmentPDFSpace(pdf, rowHeight)

	y := pdf.GetY()
	drawInitialAssessmentCompactFieldBox(pdf, left, y, halfWidth, rowHeight, labelWidth, leftField)
	drawInitialAssessmentCompactFieldBox(pdf, left+halfWidth, y, halfWidth, rowHeight, labelWidth, rightField)
	pdf.SetY(y + rowHeight)
}

func drawInitialAssessmentCompactSingleFieldRow(pdf *gofpdf.Fpdf, field initialAssessmentPrintField) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	halfWidth := contentWidth / 2
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(halfWidth)
	rowHeight := maxFloat64(
		measureInitialAssessmentCompactFieldBoxHeight(pdf, halfWidth, labelWidth, field),
		6.5,
	)
	ensureInitialAssessmentPDFSpace(pdf, rowHeight)

	y := pdf.GetY()
	drawInitialAssessmentCompactFieldBox(pdf, left, y, halfWidth, rowHeight, labelWidth, field)
	drawInitialAssessmentCompactBlankFieldBox(pdf, left+halfWidth, y, halfWidth, rowHeight, labelWidth)
	pdf.SetY(y + rowHeight)
}

func drawInitialAssessmentCompactFieldBox(pdf *gofpdf.Fpdf, x float64, y float64, totalWidth float64, rowHeight float64, labelWidth float64, field initialAssessmentPrintField) {
	valueWidth := totalWidth - labelWidth
	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(field.Label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(field.Value)), "-")

	pdf.SetDrawColor(120, 120, 120)
	pdf.SetFillColor(245, 245, 245)
	pdf.Rect(x, y, labelWidth, rowHeight, "DF")
	pdf.Rect(x+labelWidth, y, valueWidth, rowHeight, "D")

	pdf.SetFont("Arial", "", 9)
	pdf.SetXY(x+1.5, y+0.4)
	pdf.MultiCell(labelWidth-3, 4.5, trimmedLabel, "", "L", false)
	pdf.SetXY(x+labelWidth+1.5, y+0.4)
	pdf.MultiCell(valueWidth-3, 4.5, trimmedValue, "", "L", false)
}

func measureInitialAssessmentCompactFieldBoxHeight(pdf *gofpdf.Fpdf, totalWidth float64, labelWidth float64, field initialAssessmentPrintField) float64 {
	valueWidth := totalWidth - labelWidth
	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(field.Label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(field.Value)), "-")

	pdf.SetFont("Arial", "", 9)
	labelLines := pdf.SplitLines([]byte(trimmedLabel), labelWidth-3)
	valueLines := pdf.SplitLines([]byte(trimmedValue), valueWidth-3)
	lineCount := maxInt(len(labelLines), len(valueLines))
	if lineCount < 1 {
		lineCount = 1
	}

	return float64(lineCount)*4.5 + 1.6
}

func drawInitialAssessmentCompactBlankFieldBox(pdf *gofpdf.Fpdf, x float64, y float64, totalWidth float64, rowHeight float64, labelWidth float64) {
	valueWidth := totalWidth - labelWidth
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetFillColor(245, 245, 245)
	pdf.Rect(x, y, labelWidth, rowHeight, "DF")
	pdf.Rect(x+labelWidth, y, valueWidth, rowHeight, "D")
}

func resolveInitialAssessmentCompactFieldLabelWidth(columnWidth float64) float64 {
	labelWidth := columnWidth * 0.42
	if labelWidth < 36 {
		labelWidth = 36
	}
	if labelWidth > 40 {
		labelWidth = 40
	}
	return labelWidth
}

func addInitialAssessmentImagesSection(pdf *gofpdf.Fpdf, images []initialAssessmentPrintImageView) {
	addInitialAssessmentSectionTitle(pdf, "GAMBAR PEMERIKSAAN FISIK")
	if len(images) == 0 {
		addInitialAssessmentFullWidthRow(pdf, "Tidak ada gambar pemeriksaan fisik pada entri ini.", false)
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
	addInitialAssessmentSectionTitle(pdf, "DIAGNOSIS")
	if len(diagnoses) == 0 {
		addInitialAssessmentFullWidthRow(pdf, "Tidak ada diagnosis.", false)
		addInitialAssessmentSectionSpacing(pdf)
		return
	}

	for index, diagnosis := range diagnoses {
		addInitialAssessmentFullWidthRow(pdf, fmt.Sprintf("%d. %s", index+1, strings.TrimSpace(strings.Join([]string{diagnosis.Type, diagnosis.Code}, " - "))), true)
		addInitialAssessmentKeyValueRow(pdf, "Nama ICD", diagnosis.Name)
		addInitialAssessmentKeyValueRow(pdf, "Diagnosis Kerja", diagnosis.WorkingDiagnosis)
		addInitialAssessmentKeyValueRow(pdf, "Diagnosis Banding", diagnosis.DifferentialDiagnosis)
		addInitialAssessmentKeyValueRow(pdf, "Assessment", diagnosis.AssessmentNarrative)
		addInitialAssessmentKeyValueRow(pdf, "Catatan", diagnosis.Notes)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addInitialAssessmentSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, data initialAssessmentPrintViewData) {
	ensureInitialAssessmentPDFSpace(pdf, 38)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columnGap := 12.0
	columnWidth := (contentWidth - columnGap) / 2
	leftColumnX := left
	rightColumnX := left + columnWidth + columnGap
	currentY := pdf.GetY() + 4

	signatureLocation := strings.TrimSpace(hospitalInfo.City)
	signatureDate := formatDateIndonesian(data.GeneratedAt)
	locationDateLabel := signatureDate
	if signatureLocation != "" {
		locationDateLabel = signatureLocation + ", " + signatureDate
	}

	pdf.SetFont("Arial", "", 10)
	pdf.SetXY(rightColumnX, currentY)
	pdf.CellFormat(columnWidth, 5, locationDateLabel, "", 1, "C", false, 0, "")

	currentY = pdf.GetY() + 3
	pdf.SetXY(leftColumnX, currentY)
	pdf.CellFormat(columnWidth, 5, "Pasien / Keluarga", "", 0, "C", false, 0, "")
	pdf.SetXY(rightColumnX, currentY)
	pdf.CellFormat(columnWidth, 5, "Dokter Pemeriksa", "", 1, "C", false, 0, "")

	lineWidth := minFloat64(52, columnWidth-26)
	leftLineX := leftColumnX + ((columnWidth - lineWidth) / 2)
	rightLineX := rightColumnX + ((columnWidth - lineWidth) / 2)
	signatureLineY := pdf.GetY() + 16
	pdf.SetDrawColor(60, 60, 60)
	pdf.Line(leftLineX, signatureLineY, leftLineX+lineWidth, signatureLineY)
	pdf.Line(rightLineX, signatureLineY, rightLineX+lineWidth, signatureLineY)

	pdf.SetFont("Arial", "B", 10)
	pdf.SetY(signatureLineY + 2.5)
	pdf.SetXY(leftColumnX, pdf.GetY())
	pdf.CellFormat(columnWidth, 5, fallbackText(data.Visit.Patient.FullName), "", 0, "C", false, 0, "")
	pdf.SetXY(rightColumnX, pdf.GetY())
	pdf.CellFormat(columnWidth, 5, fallbackText(data.Visit.Doctor.FullName), "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 9)
	pdf.SetY(pdf.GetY() + 4)
}

func addInitialAssessmentSectionTitle(pdf *gofpdf.Fpdf, title string) {
	ensureInitialAssessmentPDFSpace(pdf, 8)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	title = firstNonEmpty(sanitizePDFText(title), "-")
	pdf.SetFont("Arial", "B", 11)
	pdf.SetFillColor(220, 220, 220)
	pdf.SetDrawColor(120, 120, 120)
	pdf.CellFormat(contentWidth, 6.5, " "+strings.ToUpper(title), "1", 1, "L", true, 0, "")
	pdf.SetFont("Arial", "", 9)
}

func addInitialAssessmentKeyValueRow(pdf *gofpdf.Fpdf, label string, value string) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	halfWidth := contentWidth / 2
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(halfWidth)
	valueWidth := contentWidth - labelWidth

	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")
	labelLines := pdf.SplitLines([]byte(trimmedLabel), labelWidth-4)
	valueLines := pdf.SplitLines([]byte(trimmedValue), valueWidth-4)
	lineCount := maxInt(len(labelLines), len(valueLines))
	if lineCount == 0 {
		lineCount = 1
	}
	rowHeight := float64(lineCount)*4.5 + 2
	ensureInitialAssessmentPDFSpace(pdf, rowHeight)

	x := left
	y := pdf.GetY()
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetFillColor(245, 245, 245)
	pdf.Rect(x, y, labelWidth, rowHeight, "DF")
	pdf.Rect(x+labelWidth, y, valueWidth, rowHeight, "D")

	pdf.SetXY(x+2, y+1.5)
	pdf.SetFont("Arial", "", 9)
	pdf.MultiCell(labelWidth-4, 4.5, trimmedLabel, "", "L", false)
	pdf.SetXY(x+labelWidth+2, y+1.5)
	pdf.SetFont("Arial", "", 9)
	pdf.MultiCell(valueWidth-4, 4.5, trimmedValue, "", "L", false)
	pdf.SetXY(left, y+rowHeight)
}

func addInitialAssessmentFullWidthRow(pdf *gofpdf.Fpdf, value string, bold bool) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")
	rowHeight := measureInitialAssessmentTextRowHeight(pdf, trimmedValue, contentWidth-4, 9, 4.5)
	ensureInitialAssessmentPDFSpace(pdf, rowHeight)

	style := ""
	if bold {
		style = "B"
	}

	x := left
	y := pdf.GetY()
	pdf.SetDrawColor(120, 120, 120)
	pdf.Rect(x, y, contentWidth, rowHeight, "D")
	pdf.SetXY(x+2, y+1.5)
	pdf.SetFont("Arial", style, 9)
	pdf.MultiCell(contentWidth-4, 4.5, trimmedValue, "", "L", false)
	pdf.SetXY(left, y+rowHeight)
}

func addInitialAssessmentPhysicalExamImageBlock(pdf *gofpdf.Fpdf, imageView initialAssessmentPrintImageView) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	imageColumnWidth := minFloat64(82, contentWidth*0.46)
	detailColumnWidth := contentWidth - imageColumnWidth
	imageBoxHeight := imageColumnWidth * 0.75
	detailRows := buildInitialAssessmentImageDetailRows(imageView)
	detailHeight := measureInitialAssessmentDetailRowsHeight(pdf, detailRows, detailColumnWidth)
	blockHeight := maxFloat64(imageBoxHeight, detailHeight)

	ensureInitialAssessmentPDFSpace(pdf, blockHeight+2)

	x := left
	y := pdf.GetY()
	pdf.SetDrawColor(120, 120, 120)
	pdf.Rect(x, y, contentWidth, blockHeight, "D")
	pdf.Line(x+imageColumnWidth, y, x+imageColumnWidth, y+blockHeight)

	imageY := y + ((blockHeight - imageBoxHeight) / 2)
	drawInitialAssessmentPhysicalExamImageBox(pdf, x, imageY, imageColumnWidth, imageBoxHeight, imageView)
	drawInitialAssessmentDetailRows(pdf, x+imageColumnWidth, y, detailColumnWidth, detailRows)
	pdf.SetY(y + blockHeight + 2)
}

func addInitialAssessmentSectionSpacing(pdf *gofpdf.Fpdf) {
	pdf.SetY(pdf.GetY() + 2)
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

	return float64(lineCount)*lineHeight + 2
}

func measureInitialAssessmentFullWidthRowHeight(pdf *gofpdf.Fpdf, value string) float64 {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	return measureInitialAssessmentTextRowHeight(pdf, value, contentWidth-4, 9, 4.5)
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
	labelWidth := minFloat64(32, totalWidth*0.36)
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
	pdf.SetFont("Arial", "", 9)
	labelLines := pdf.SplitLines([]byte(trimmedLabel), labelWidth-4)
	valueLines := pdf.SplitLines([]byte(trimmedValue), valueWidth-4)
	lineCount := maxInt(len(labelLines), len(valueLines))
	if lineCount == 0 {
		lineCount = 1
	}

	return float64(lineCount)*4.5 + 2
}

func drawInitialAssessmentDetailRows(pdf *gofpdf.Fpdf, x float64, y float64, totalWidth float64, fields []initialAssessmentPrintField) {
	labelWidth := minFloat64(32, totalWidth*0.36)
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
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetFillColor(245, 245, 245)
	pdf.Rect(x, y, labelWidth, rowHeight, "DF")
	pdf.Rect(x+labelWidth, y, valueWidth, rowHeight, "D")

	pdf.SetXY(x+2, y+1.5)
	pdf.SetFont("Arial", "", 9)
	pdf.MultiCell(labelWidth-4, 4.5, trimmedLabel, "", "L", false)
	pdf.SetXY(x+labelWidth+2, y+1.5)
	pdf.SetFont("Arial", "", 9)
	pdf.MultiCell(valueWidth-4, 4.5, trimmedValue, "", "L", false)
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
		{Label: "Tanggal Kunjungan", Value: visit.VisitDate.Format("02 Jan 2006 15:04")},
		{Label: "Poliklinik", Value: fallbackText(visit.Polyclinic.Name)},
		{Label: "Dokter", Value: fallbackText(visit.Doctor.FullName)},
		{Label: "Jenis Kunjungan", Value: fallbackText(visit.VisitType)},
		{Label: "Pembiayaan", Value: fallbackText(visit.PaymentType)},
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
		fields = append(fields, initialAssessmentPrintField{Label: "Kesadaran", Value: trimmed})
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
