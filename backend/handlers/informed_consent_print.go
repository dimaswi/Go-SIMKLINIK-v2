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

type informedConsentPrintViewData struct {
	GeneratedAt              time.Time
	PrintedByLabel           string
	Consent                  models.InformedConsent
	Record                   models.MedicalRecord
	DocumentFields           []initialAssessmentPrintField
	PatientFields            []initialAssessmentPrintField
	VisitFields              []initialAssessmentPrintField
	ConsentGiverFields       []initialAssessmentPrintField
	ConsentFields            []initialAssessmentPrintField
	DecisionFields           []initialAssessmentPrintField
	SignatureDate            time.Time
	SignaturePatient         string
	SignaturePatientRelation string
	SignaturePatientIDNumber string
	SignatureDoctor          string
	SignatureDoctorNIP       string
	SignatureWitness         string
}

func PrintInformedConsent(c *gin.Context) {
	consentID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || consentID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID informed consent tidak valid"})
		return
	}

	var consent models.InformedConsent
	if err := database.DB.
		Preload("Patient").
		Preload("Doctor").
		First(&consent, uint(consentID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Informed consent tidak ditemukan"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.
		Preload("Visit").
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		First(&record, consent.MedicalRecordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rekam medis sumber informed consent tidak ditemukan"})
		return
	}

	viewData := buildInformedConsentPrintViewData(c, record, consent)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderInformedConsentPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF informed consent"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func buildInformedConsentPrintViewData(c *gin.Context, record models.MedicalRecord, consent models.InformedConsent) informedConsentPrintViewData {
	patient := record.Patient
	if patient.ID == 0 {
		patient = consent.Patient
	}
	doctor := record.Doctor
	if doctor.ID == 0 {
		doctor = consent.Doctor
	}
	signatureDate := consent.ConsentDate
	if signatureDate.IsZero() {
		signatureDate = time.Now()
	}
	consentGiverName := fallbackText(resolveInformedConsentConsentGiverName(consent, &patient))
	consentGiverRelation := fallbackText(resolveInformedConsentConsentGiverRelation(consent, &patient))
	consentGiverIDNumber := fallbackText(resolveInformedConsentConsentGiverIDNumber(consent, &patient))

	return informedConsentPrintViewData{
		GeneratedAt:              time.Now(),
		PrintedByLabel:           strings.TrimSpace(c.GetString("email")),
		Consent:                  consent,
		Record:                   record,
		DocumentFields:           buildInformedConsentDocumentFields(record, consent, c.GetString("email")),
		PatientFields:            buildInformedConsentPatientFields(patient),
		VisitFields:              buildInformedConsentVisitFields(record, doctor),
		ConsentGiverFields:       buildInformedConsentConsentGiverFields(consent, patient),
		ConsentFields:            buildInformedConsentNarrativeFields(consent),
		DecisionFields:           buildInformedConsentDecisionFields(consent),
		SignatureDate:            signatureDate,
		SignaturePatient:         consentGiverName,
		SignaturePatientRelation: consentGiverRelation,
		SignaturePatientIDNumber: consentGiverIDNumber,
		SignatureDoctor:          fallbackText(doctor.FullName),
		SignatureDoctorNIP:       fallbackText(doctor.NIPNumber),
		SignatureWitness:         fallbackText(consent.WitnessName),
	}
}

func buildInformedConsentDocumentFields(record models.MedicalRecord, consent models.InformedConsent, printedBy string) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "ID Consent", Value: strconv.FormatUint(uint64(consent.ID), 10)},
		{Label: "Tanggal Entri", Value: formatRecordDateTimePDF(&record.RecordDate)},
		{Label: "Tanggal Consent", Value: formatInformedConsentDateTime(consent.ConsentDate)},
		{Label: "Status Keputusan", Value: informedConsentDecisionLabel(consent.PatientDecision)},
		{Label: "Petugas Cetak", Value: fallbackText(printedBy)},
	}
}

func buildInformedConsentPatientFields(patient models.Patient) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Nama Pasien", Value: fallbackText(patient.FullName)},
		{Label: "No. Rekam Medis", Value: fallbackText(patient.MedicalRecordNumber)},
		{Label: "NIK", Value: fallbackText(patient.NIK)},
		{Label: "Jenis Kelamin", Value: genderLabelForPrint(patient.Gender)},
		{Label: "Tanggal Lahir", Value: formatDatePointer(patient.BirthDate)},
		{Label: "Umur", Value: calculatePatientAgeLabel(patient.BirthDate)},
		{Label: "Telepon", Value: fallbackText(patient.Phone)},
		{Label: "Alamat", Value: fallbackText(formatPatientAddress(patient))},
	}
}

func buildInformedConsentVisitFields(record models.MedicalRecord, doctor models.Doctor) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "No. Kunjungan", Value: fallbackText(record.Visit.VisitNumber)},
		{Label: "Tanggal Kunjungan", Value: formatInformedConsentDateTime(record.Visit.VisitDate)},
		{Label: "Poliklinik", Value: fallbackText(record.Polyclinic.Name)},
		{Label: "DPJP", Value: fallbackText(doctor.FullName)},
		{Label: "Jenis Kunjungan", Value: fallbackText(record.Visit.VisitType)},
		{Label: "Pembiayaan", Value: buildInformedConsentPaymentLabel(record.Visit)},
	}
}

func buildInformedConsentConsentGiverFields(consent models.InformedConsent, patient models.Patient) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Nama Pemberi Persetujuan", Value: fallbackText(resolveInformedConsentConsentGiverName(consent, &patient))},
		{Label: "Hubungan dengan Pasien", Value: fallbackText(resolveInformedConsentConsentGiverRelation(consent, &patient))},
		{Label: "No. Identitas", Value: fallbackText(resolveInformedConsentConsentGiverIDNumber(consent, &patient))},
	}
}

func buildInformedConsentNarrativeFields(consent models.InformedConsent) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Nama Tindakan", Value: fallbackText(consent.ActionName)},
		{Label: "Deskripsi Tindakan", Value: fallbackText(consent.ActionDescription)},
		{Label: "Manfaat", Value: fallbackText(consent.Benefits)},
		{Label: "Risiko", Value: fallbackText(consent.Risks)},
		{Label: "Catatan Tambahan", Value: fallbackText(consent.Notes)},
	}
}

func buildInformedConsentDecisionFields(consent models.InformedConsent) []initialAssessmentPrintField {
	fields := []initialAssessmentPrintField{
		{Label: "Keputusan Pasien", Value: informedConsentDecisionStatement(consent.PatientDecision)},
		{Label: "Tanggal Persetujuan", Value: formatInformedConsentDateTime(consent.ConsentDate)},
	}
	if strings.TrimSpace(consent.WitnessName) != "" {
		fields = append(fields, initialAssessmentPrintField{Label: "Saksi", Value: consent.WitnessName})
	}
	return fields
}

func buildInformedConsentPaymentLabel(visit models.Visit) string {
	parts := make([]string, 0, 2)
	if paymentType := strings.TrimSpace(visit.PaymentType); paymentType != "" {
		parts = append(parts, paymentType)
	}
	if insuranceNumber := strings.TrimSpace(visit.InsuranceNumber); insuranceNumber != "" {
		parts = append(parts, "No. "+insuranceNumber)
	}
	if len(parts) == 0 {
		return "-"
	}
	return strings.Join(parts, " / ")
}

func renderInformedConsentPDF(hospitalInfo initialAssessmentHospitalInfo, data informedConsentPrintViewData) ([]byte, string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)
	documentTitle := "INFORMED CONSENT"
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
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, documentTitle, fallbackText(data.Record.Visit.VisitNumber))
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

	addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", data.DocumentFields, "Informasi dokumen tidak tersedia.")
	addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", data.PatientFields, "Data pasien tidak tersedia.")
	addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", data.VisitFields, "Data kunjungan tidak tersedia.")
	addInformedConsentConsentGiverSection(pdf, data.ConsentGiverFields, "Data pemberi persetujuan belum dilengkapi.")
	addInitialAssessmentFieldSection(pdf, "TINDAKAN DAN PENJELASAN", data.ConsentFields, "Belum ada isi informed consent.")
	addInitialAssessmentFieldSection(pdf, "KEPUTUSAN PASIEN", data.DecisionFields, "Belum ada keputusan pasien.")
	addInformedConsentSignatureSection(pdf, hospitalInfo, data)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("informed-consent-%s-%s.pdf", sanitizePDFFileName(data.SignaturePatient), sanitizePDFFileName(data.Record.Visit.VisitNumber))
	return output.Bytes(), fileName, nil
}

func addInformedConsentConsentGiverSection(pdf *gofpdf.Fpdf, fields []initialAssessmentPrintField, emptyMessage string) {
	addInitialAssessmentSectionTitle(pdf, "PEMBERI PERSETUJUAN")
	if len(fields) == 0 {
		addInitialAssessmentFullWidthRow(pdf, firstNonEmpty(emptyMessage, "Tidak ada data."), false)
		return
	}

	for _, field := range fields {
		addInformedConsentWideKeyValueRow(pdf, field.Label, field.Value)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addInformedConsentWideKeyValueRow(pdf *gofpdf.Fpdf, label string, value string) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	labelWidth := 58.0
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

func addInformedConsentSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, data informedConsentPrintViewData) {
	const signatureBlockHeight = 36.0
	ensureInitialAssessmentPDFSpace(pdf, signatureBlockHeight+16)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columnGap := 8.0
	columnWidth := (contentWidth - (2 * columnGap)) / 3
	currentY := pdf.GetY() + 4

	signatureLocation := strings.TrimSpace(hospitalInfo.City)
	signatureDate := formatDateIndonesian(data.SignatureDate)
	locationDateLabel := signatureDate
	if signatureLocation != "" {
		locationDateLabel = signatureLocation + ", " + signatureDate
	}

	pdf.SetFont("Arial", "", 10)
	pdf.SetXY(left, currentY)
	pdf.CellFormat(contentWidth, 5, locationDateLabel, "", 1, "R", false, 0, "")

	currentY = pdf.GetY() + 3
	drawInformedConsentSignatureBlock(
		pdf,
		left,
		currentY,
		columnWidth,
		"Pemberi Persetujuan / Wali",
		data.SignaturePatient,
		"",
	)
	drawInformedConsentSignatureBlock(
		pdf,
		left+columnWidth+columnGap,
		currentY,
		columnWidth,
		"Saksi",
		data.SignatureWitness,
		"",
	)
	drawInformedConsentSignatureBlock(
		pdf,
		left+(2*(columnWidth+columnGap)),
		currentY,
		columnWidth,
		"Dokter Pemberi Penjelasan",
		data.SignatureDoctor,
		buildInformedConsentDoctorSignatureIdentity(data.SignatureDoctorNIP),
	)

	pdf.SetFont("Arial", "", 9)
	pdf.SetY(currentY + signatureBlockHeight + 4)
	addInitialAssessmentFullWidthRow(pdf, "Bubuhkan tanda tangan basah pada area yang disediakan di setiap kolom. Dokumen ini dicetak dari SIMKLINIK sebagai salinan informed consent pada kunjungan pasien.", false)
	pdf.SetY(pdf.GetY() + 2)
}

func drawInformedConsentSignatureBlock(pdf *gofpdf.Fpdf, x float64, y float64, width float64, title string, name string, detail string) {
	const totalHeight = 36.0

	pdf.SetFont("Arial", "B", 8.5)
	pdf.SetXY(x, y)
	pdf.CellFormat(width, 4.5, firstNonEmpty(sanitizePDFSingleLineText(title), "-"), "", 0, "C", false, 0, "")

	signatureLineY := y + 20.0
	lineInset := 14.0
	pdf.SetDrawColor(80, 80, 80)
	pdf.Line(x+lineInset, signatureLineY, x+width-lineInset, signatureLineY)

	pdf.SetFont("Arial", "B", 8.5)
	pdf.SetXY(x+1, signatureLineY+2.2)
	pdf.CellFormat(width-2, 4.0, firstNonEmpty(sanitizePDFSingleLineText(name), "-"), "", 0, "C", false, 0, "")

	trimmedDetail := strings.TrimSpace(sanitizePDFSingleLineText(detail))
	if trimmedDetail != "" {
		pdf.SetFont("Arial", "", 7.8)
		pdf.SetXY(x+1, signatureLineY+6.8)
		pdf.CellFormat(width-2, 3.6, trimmedDetail, "", 0, "C", false, 0, "")
	}

	pdf.SetY(maxFloat64(pdf.GetY(), y+totalHeight))
}

func buildInformedConsentDoctorSignatureIdentity(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "-" {
		return "NIP: -"
	}
	return "NIP: " + trimmed
}

func informedConsentDecisionLabel(value string) string {
	switch normalizeInformedConsentDecision(value) {
	case "approved":
		return "Disetujui"
	case "declined":
		return "Ditolak"
	default:
		return "Pending / Draft otomatis"
	}
}

func informedConsentDecisionStatement(value string) string {
	switch normalizeInformedConsentDecision(value) {
	case "approved":
		return "Pasien menyetujui tindakan setelah menerima penjelasan manfaat, risiko, dan alternatif tindakan."
	case "declined":
		return "Pasien menolak tindakan setelah menerima penjelasan manfaat, risiko, dan alternatif tindakan."
	default:
		return "Keputusan pasien belum ditetapkan. Draft informed consent masih menunggu konfirmasi akhir."
	}
}

func formatInformedConsentDateTime(value time.Time) string {
	if value.IsZero() {
		return "-"
	}
	return formatDateTimeIndonesian(value)
}
