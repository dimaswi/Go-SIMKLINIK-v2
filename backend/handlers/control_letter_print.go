package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
)

type controlLetterPrintViewData struct {
	GeneratedAt       time.Time
	Visit             models.Visit
	Outcome           models.MedicalRecord
	PrintedByLabel    string
	ValidationBaseURL string
	DocumentFields    []initialAssessmentPrintField
	PatientFields     []initialAssessmentPrintField
	VisitFields       []initialAssessmentPrintField
	ControlFields     []initialAssessmentPrintField
	Statement         string
}

func PrintControlLetter(c *gin.Context) {
	visitID, err := strconv.ParseUint(c.Param("visitId"), 10, 64)
	if err != nil || visitID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
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

	if !strings.EqualFold(strings.TrimSpace(visit.Status), "completed") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Surat kontrol hanya tersedia setelah kunjungan difinalisasi"})
		return
	}

	var outcome models.MedicalRecord
	if err := preloadMedicalRecordRelations(database.DB).
		Where("visit_id = ? AND section_type = ? AND status <> ?", uint(visitID), "outcome", "cancelled").
		Order("updated_at DESC").
		Order("created_at DESC").
		First(&outcome).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Outcome kunjungan tidak ditemukan"})
		return
	}

	if !strings.EqualFold(strings.TrimSpace(outcome.Disposition), "kontrol") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Surat kontrol hanya tersedia bila disposition akhir adalah kontrol"})
		return
	}
	if outcome.FollowUpAt == nil || outcome.FollowUpAt.IsZero() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jadwal kontrol belum diisi pada outcome kunjungan"})
		return
	}

	viewData := buildControlLetterPrintViewData(c, visit, outcome)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderControlLetterPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF surat kontrol"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func buildControlLetterPrintViewData(c *gin.Context, visit models.Visit, outcome models.MedicalRecord) controlLetterPrintViewData {
	generatedAt := time.Now()
	printedBy := resolvePrintedByLabel(c)

	return controlLetterPrintViewData{
		GeneratedAt:       generatedAt,
		Visit:             visit,
		Outcome:           outcome,
		PrintedByLabel:    printedBy,
		ValidationBaseURL: resolveTTEVerificationBaseURLForRequest(c),
		DocumentFields: []initialAssessmentPrintField{
			{Label: "Jenis Dokumen", Value: "Surat Kontrol"},
			{Label: "Tanggal Cetak", Value: formatDateTimeIndonesian(generatedAt)},
			{Label: "Petugas Cetak", Value: fallbackText(printedBy)},
		},
		PatientFields: buildInitialAssessmentPatientFields(visit.Patient),
		VisitFields: []initialAssessmentPrintField{
			{Label: "No. Kunjungan", Value: fallbackText(visit.VisitNumber)},
			{Label: "Tanggal Kunjungan", Value: visit.VisitDate.Format("02 Jan 2006 15:04")},
			{Label: "Poliklinik", Value: fallbackText(visit.Polyclinic.Name)},
			{Label: "Dokter Pemeriksa", Value: fallbackText(visit.Doctor.FullName)},
			{Label: "Jenis Kunjungan", Value: fallbackText(visit.VisitType)},
		},
		ControlFields: buildControlLetterFields(outcome),
		Statement:     buildControlLetterStatement(visit, outcome),
	}
}

func buildControlLetterFields(outcome models.MedicalRecord) []initialAssessmentPrintField {
	controlSchedule := "-"
	if outcome.FollowUpAt != nil && !outcome.FollowUpAt.IsZero() {
		controlSchedule = formatDateTimeIndonesian(*outcome.FollowUpAt)
	}

	return []initialAssessmentPrintField{
		{Label: "Disposition", Value: "Kontrol Ulang"},
		{Label: "Jadwal Kontrol", Value: controlSchedule},
		{Label: "Kondisi Akhir", Value: fallbackText(outcome.DischargeCondition)},
		{Label: "Instruksi Kontrol", Value: fallbackText(outcome.FollowUpInstruction)},
		{Label: "Catatan Tambahan", Value: fallbackText(outcome.Notes)},
	}
}

func buildControlLetterStatement(visit models.Visit, outcome models.MedicalRecord) string {
	patientName := fallbackText(visit.Patient.FullName)
	visitNumber := fallbackText(visit.VisitNumber)
	controlSchedule := "sesuai jadwal yang diberikan"
	if outcome.FollowUpAt != nil && !outcome.FollowUpAt.IsZero() {
		controlSchedule = formatDateTimeIndonesian(*outcome.FollowUpAt)
	}

	return "Berdasarkan evaluasi klinis pada kunjungan " + visitNumber + ", pasien atas nama " + patientName + " dianjurkan datang kontrol ulang pada " + controlSchedule + ". Pasien diminta membawa dokumen pendukung dan mengikuti instruksi dokter pada saat kunjungan kontrol berikutnya."
}

func renderControlLetterPDF(hospitalInfo initialAssessmentHospitalInfo, data controlLetterPrintViewData) ([]byte, string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)
	tteSignature := loadTTESignedSignatureByDocumentKeyWithBaseURL(buildTTEControlLetterDocumentKey(data.Visit.ID), data.ValidationBaseURL)

	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle("Surat Kontrol", false)
	pdf.SetAuthor(data.PrintedByLabel, false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetHeaderFuncMode(func() {
		if pdf.PageNo() != 1 {
			return
		}
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, "SURAT KONTROL", fallbackText(data.Visit.VisitNumber))
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

	addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", data.DocumentFields, "")
	addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", data.PatientFields, "Data pasien tidak tersedia.")
	addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", data.VisitFields, "Data kunjungan tidak tersedia.")
	addInitialAssessmentFieldSection(pdf, "PERNYATAAN KONTROL", []initialAssessmentPrintField{{Label: "Ringkasan", Value: data.Statement}}, "-")
	addInitialAssessmentFieldSection(pdf, "DETAIL KONTROL", data.ControlFields, "Detail kontrol belum diisi.")
	addOrderPrintSignatureSectionWithTTE(pdf, hospitalInfo, data.GeneratedAt, "Pasien / Keluarga", data.Visit.Patient.FullName, "Dokter Pemeriksa", data.Visit.Doctor.FullName, tteSignature)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("surat-kontrol-%s-%s.pdf", sanitizePDFFileName(data.Visit.Patient.FullName), sanitizePDFFileName(data.Visit.VisitNumber))
	return output.Bytes(), fileName, nil
}
