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
			{Label: "Tanggal Kunjungan", Value: formatVisitDateForPrint(visit.VisitDate)},
			{Label: "Poliklinik", Value: fallbackText(visit.Polyclinic.Name)},
			{Label: "Dokter Pemeriksa", Value: fallbackText(visit.Doctor.FullName)},
			{Label: "Jenis Kunjungan", Value: formatVisitTypeForPrint(visit.VisitType)},
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
	documentTitle := "SURAT KETERANGAN KONTROL"
	pdf.SetTitle(documentTitle, false)
	pdf.SetAuthor(data.PrintedByLabel, false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.AddPage()

	// 1. KOP Surat Resmi Indonesia
	kopBottomY := drawOfficialSuratKop(pdf, hospitalInfo)

	// 2. Judul & Nomor Surat
	officialNumber := generateOfficialSuratNumber(hospitalInfo, "surat-kontrol", data.Visit, data.Visit.ID)
	pdf.SetY(kopBottomY + 2.0)
	pdf.SetFont("Arial", "B", 12.5)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(contentWidth, 5.8, documentTitle, "", 1, "C", false, 0, "")

	pdf.SetFont("Arial", "", 9.2)
	pdf.CellFormat(contentWidth, 4.6, "Nomor : "+officialNumber, "", 1, "C", false, 0, "")

	// 3. Kalimat Pembuka
	pdf.SetY(pdf.GetY() + 4.5)
	pdf.SetFont("Arial", "", 9.5)
	instName := fallbackText(hospitalInfo.Name)
	openingText := fmt.Sprintf("Yang bertanda tangan di bawah ini, Dokter %s, dengan ini menerangkan bahwa :", instName)
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
		pdf.SetTextColor(0, 0, 0)
		pdf.SetFont("Arial", "", 9.2)
		pdf.CellFormat(labelWidth, 4.8, item.label, "", 0, "L", false, 0, "")
		pdf.CellFormat(sepWidth, 4.8, ":", "", 0, "C", false, 0, "")

		if item.isBold {
			pdf.SetFont("Arial", "B", 9.5)
		} else {
			pdf.SetFont("Arial", "", 9.2)
		}
		if item.label == "Alamat" {
			pdf.MultiCell(valWidth, 4.8, sanitizePDFText(item.value), "", "L", false)
		} else {
			pdf.CellFormat(valWidth, 4.8, sanitizePDFSingleLineText(item.value), "", 1, "L", false, 0, "")
		}
	}

	// 5. Data Kontrol Ulang (Box 2 Kolom Hitam Putih Dinamis tanpa terpotong)
	pdf.SetY(pdf.GetY() + 3.5)
	pdf.SetFont("Arial", "B", 9.5)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetX(indentX)
	pdf.CellFormat(contentWidth-6.0, 5.0, "Rencana Kontrol Ulang :", "", 1, "L", false, 0, "")

	boxX := indentX
	boxWidth := endX - boxX - 4.0
	boxY := pdf.GetY() + 1.0
	halfWidth := boxWidth / 2.0

	controlSchedule := "-"
	if data.Outcome.FollowUpAt != nil && !data.Outcome.FollowUpAt.IsZero() {
		controlSchedule = formatDateTimeIndonesian(*data.Outcome.FollowUpAt)
	}

	type ctrlItem struct {
		label string
		val   string
	}
	leftColItems := []ctrlItem{
		{"Jadwal Kontrol", controlSchedule},
		{"Poliklinik Tujuan", fallbackText(data.Visit.Polyclinic.Name)},
		{"Dokter Pemeriksa", formatDoctorOfficialName(data.Visit.Doctor.FullName)},
	}
	rightColItems := []ctrlItem{
		{"Diagnosa / Kondisi", fallbackText(data.Outcome.DischargeCondition)},
		{"Instruksi Kontrol", fallbackText(data.Outcome.FollowUpInstruction)},
		{"Catatan", fallbackText(data.Outcome.Notes)},
	}

	colLabelW := 30.0
	colSepW := 3.0
	colValW := halfWidth - colLabelW - colSepW - 5.0
	lineH := 4.4

	measureCol := func(items []ctrlItem) (float64, []float64) {
		heights := make([]float64, len(items))
		total := 2.0
		pdf.SetFont("Arial", "", 8.8)
		for i, item := range items {
			lines := pdf.SplitLines([]byte(sanitizePDFText(item.val)), colValW)
			lc := len(lines)
			if lc < 1 {
				lc = 1
			}
			h := float64(lc)*lineH + 1.4
			heights[i] = h
			total += h
		}
		return total + 1.2, heights
	}

	leftH, leftRowHeights := measureCol(leftColItems)
	rightH, rightRowHeights := measureCol(rightColItems)
	boxHeight := maxFloat64(leftH, rightH)

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(boxX, boxY, boxWidth, boxHeight, "D")
	pdf.SetLineWidth(0.2)
	pdf.Line(boxX+halfWidth, boxY, boxX+halfWidth, boxY+boxHeight)

	pdf.SetTextColor(0, 0, 0)
	curLeftY := boxY + 1.8
	for i, item := range leftColItems {
		pdf.SetXY(boxX+2.5, curLeftY)
		pdf.SetFont("Arial", "", 8.6)
		pdf.CellFormat(colLabelW, lineH, item.label, "", 0, "L", false, 0, "")
		pdf.CellFormat(colSepW, lineH, ":", "", 0, "C", false, 0, "")
		if i == 0 {
			pdf.SetFont("Arial", "B", 8.8)
		} else {
			pdf.SetFont("Arial", "", 8.8)
		}
		pdf.MultiCell(colValW, lineH, sanitizePDFText(item.val), "", "L", false)
		curLeftY += leftRowHeights[i]
	}

	curRightY := boxY + 1.8
	for i, item := range rightColItems {
		pdf.SetXY(boxX+halfWidth+2.5, curRightY)
		pdf.SetFont("Arial", "", 8.6)
		pdf.CellFormat(colLabelW, lineH, item.label, "", 0, "L", false, 0, "")
		pdf.CellFormat(colSepW, lineH, ":", "", 0, "C", false, 0, "")
		pdf.SetFont("Arial", "", 8.8)
		pdf.MultiCell(colValW, lineH, sanitizePDFText(item.val), "", "L", false)
		curRightY += rightRowHeights[i]
	}

	// 6. Pernyataan Penutup
	pdf.SetY(boxY + boxHeight + 5.0)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Arial", "", 9.4)
	pdf.MultiCell(contentWidth, 5.0, "Pasien dianjurkan untuk datang kontrol ulang sesuai jadwal dan instruksi di atas dengan membawa surat ini serta dokumen pendukung yang diperlukan.", "", "L", false)

	pdf.SetY(pdf.GetY() + 4.0)
	pdf.MultiCell(contentWidth, 5.0, "Demikian surat keterangan kontrol ini kami buat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.", "", "L", false)

	// 7. Area Tanda Tangan Dokter & TTE (Rata Kanan)
	sigWidth := 75.0
	sigX := endX - sigWidth
	hasTTE := tteSignature != nil && hasTTEQRCode(tteSignature)
	targetSigY := 222.0
	if hasTTE {
		targetSigY = 216.0
	}
	sigY := maxFloat64(pdf.GetY()+10.0, targetSigY)
	maxSigY := 238.0
	if hasTTE {
		maxSigY = 228.0
	}
	if sigY > maxSigY {
		sigY = maxSigY
	}
	drawOfficialDoctorSignature(pdf, sigX, sigY, sigWidth, hospitalInfo.City, data.GeneratedAt, data.Visit.Doctor, tteSignature)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("surat-kontrol-%s-%s.pdf", sanitizePDFFileName(data.Visit.Patient.FullName), sanitizePDFFileName(data.Visit.VisitNumber))
	return output.Bytes(), fileName, nil
}
