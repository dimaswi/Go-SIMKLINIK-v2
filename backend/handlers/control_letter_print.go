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
		Preload("Doctor.Employee").
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

	marginLeft := 20.0
	marginRight := 20.0
	marginTop := 12.0
	marginBottom := 12.0
	contentWidth := 210.0 - marginLeft - marginRight
	startX := marginLeft
	endX := 210.0 - marginRight

	pdf.SetMargins(marginLeft, marginTop, marginRight)
	pdf.SetAutoPageBreak(false, marginBottom)
	pdf.AliasNbPages("")
	documentTitle := "SURAT KETERANGAN KONTROL"
	pdf.SetTitle(documentTitle, false)
	pdf.SetAuthor(data.PrintedByLabel, false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.AddPage()

	// 1. KOP Surat Resmi Puskesmas
	kopBottomY := drawOfficialSuratKop(pdf, hospitalInfo)

	// 2. Judul & Nomor Surat
	officialNumber := generateOfficialSuratNumber(hospitalInfo, "surat-kontrol", data.Visit, data.Visit.ID)
	pdf.SetY(kopBottomY + 3.0)
	pdf.SetFont("Arial", "BU", 13)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(contentWidth, 6.0, documentTitle, "", 1, "C", false, 0, "")

	pdf.SetFont("Arial", "", 10)
	pdf.CellFormat(contentWidth, 5.0, "Nomor : "+officialNumber, "", 1, "C", false, 0, "")

	// 3. Kalimat Pembuka
	pdf.SetY(pdf.GetY() + 4.0)
	pdf.SetFont("Arial", "", 9.5)
	instName := fallbackText(hospitalInfo.Name)
	openingText := fmt.Sprintf("Kami yang bertanda tangan dibawah ini Dokter %s, dengan ini menerangkan bahwa :", instName)
	pdf.MultiCell(contentWidth, 5.0, openingText, "", "L", false)

	// 4. Biodata Pasien
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

	// 5. Data Kontrol Ulang (Box 2 Kolom Bergaris)
	pdf.SetY(pdf.GetY() + 3.0)
	pdf.SetFont("Arial", "B", 9.5)
	pdf.SetX(indentX)
	pdf.CellFormat(contentWidth-6.0, 5.0, "Rencana Kontrol Ulang :", "", 1, "L", false, 0, "")

	boxX := indentX
	boxWidth := endX - boxX - 4.0
	boxY := pdf.GetY() + 1.0
	boxHeight := 24.0

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.3)
	pdf.Rect(boxX, boxY, boxWidth, boxHeight, "D")

	halfWidth := boxWidth / 2.0
	pdf.Line(boxX+halfWidth, boxY, boxX+halfWidth, boxY+boxHeight)

	controlSchedule := "-"
	if data.Outcome.FollowUpAt != nil && !data.Outcome.FollowUpAt.IsZero() {
		controlSchedule = formatDateTimeIndonesian(*data.Outcome.FollowUpAt)
	}

	leftColItems := []struct {
		label string
		val   string
	}{
		{"Jadwal Kontrol", controlSchedule},
		{"Poliklinik Tujuan", fallbackText(data.Visit.Polyclinic.Name)},
		{"Dokter Pemeriksa", formatDoctorOfficialName(data.Visit.Doctor.FullName)},
	}

	rightColItems := []struct {
		label string
		val   string
	}{
		{"Diagnosa / Kondisi", fallbackText(data.Outcome.DischargeCondition)},
		{"Instruksi Kontrol", fallbackText(data.Outcome.FollowUpInstruction)},
		{"Catatan", fallbackText(data.Outcome.Notes)},
	}

	rowH := 7.0
	colLabelW := 32.0
	colSepW := 3.0

	for i, item := range leftColItems {
		rY := boxY + 1.5 + (float64(i) * rowH)
		pdf.SetXY(boxX+3.0, rY)
		pdf.SetFont("Arial", "", 9.0)
		pdf.CellFormat(colLabelW, rowH-1, item.label, "", 0, "L", false, 0, "")
		pdf.CellFormat(colSepW, rowH-1, ":", "", 0, "C", false, 0, "")
		pdf.CellFormat(halfWidth-colLabelW-colSepW-6.0, rowH-1, item.val, "", 0, "L", false, 0, "")
	}

	for i, item := range rightColItems {
		rY := boxY + 1.5 + (float64(i) * rowH)
		pdf.SetXY(boxX+halfWidth+3.0, rY)
		pdf.SetFont("Arial", "", 9.0)
		pdf.CellFormat(colLabelW, rowH-1, item.label, "", 0, "L", false, 0, "")
		pdf.CellFormat(colSepW, rowH-1, ":", "", 0, "C", false, 0, "")
		pdf.CellFormat(halfWidth-colLabelW-colSepW-6.0, rowH-1, item.val, "", 0, "L", false, 0, "")
	}

	// 6. Pernyataan Penutup
	pdf.SetY(boxY + boxHeight + 4.5)
	pdf.SetFont("Arial", "", 9.5)
	pdf.MultiCell(contentWidth, 5.0, "Pasien dianjurkan untuk datang kontrol ulang sesuai dengan jadwal dan instruksi di atas dengan membawa surat ini dan dokumen pendukung yang diperlukan.", "", "L", false)

	pdf.SetY(pdf.GetY() + 4.5)
	pdf.MultiCell(contentWidth, 5.0, "Demikian surat keterangan kontrol ini kami buat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.", "", "L", false)

	// 7. Area Tanda Tangan Dokter & TTE (Rata Kanan)
	sigWidth := 75.0
	sigX := endX - sigWidth
	sigY := pdf.GetY() + 8.0
	if sigY < 170.0 {
		sigY = 170.0
	}
	if sigY > 215.0 {
		sigY = 215.0
	}
	drawOfficialDoctorSignature(pdf, sigX, sigY, sigWidth, hospitalInfo.City, data.GeneratedAt, data.Visit.Doctor, tteSignature)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("surat-kontrol-%s-%s.pdf", sanitizePDFFileName(data.Visit.Patient.FullName), sanitizePDFFileName(data.Visit.VisitNumber))
	return output.Bytes(), fileName, nil
}
