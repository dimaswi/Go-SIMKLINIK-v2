package handlers

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
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
	SignatureNurse           string
	SignatureWitness         string
	DoctorTTESignature       *ttePrintSignatureInfo
	NurseTTESignature        *ttePrintSignatureInfo
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
	printedBy := resolvePrintedByLabel(c)

	baseURL := resolveTTEVerificationBaseURLForRequest(c)
	return informedConsentPrintViewData{
		GeneratedAt:              time.Now(),
		PrintedByLabel:           printedBy,
		Consent:                  consent,
		Record:                   record,
		DocumentFields:           buildInformedConsentDocumentFields(record, consent, printedBy),
		PatientFields:            buildInformedConsentPatientFields(patient),
		VisitFields:              buildInformedConsentVisitFields(record, doctor),
		ConsentGiverFields:       buildInformedConsentConsentGiverFields(consent, patient, doctor),
		ConsentFields:            buildInformedConsentNarrativeFields(consent),
		DecisionFields:           buildInformedConsentDecisionFields(consent),
		SignatureDate:            signatureDate,
		SignaturePatient:         consentGiverName,
		SignaturePatientRelation: consentGiverRelation,
		SignaturePatientIDNumber: consentGiverIDNumber,
		SignatureDoctor:          fallbackText(doctor.FullName),
		SignatureDoctorNIP:       fallbackText(doctor.NIPNumber),
		SignatureNurse:           fallbackText(consent.NurseName),
		SignatureWitness:         fallbackText(consent.WitnessName),
		DoctorTTESignature:       loadTTESignedSignatureByDocumentKeyWithBaseURL(fmt.Sprintf("informed_consent:%d", consent.ID), baseURL),
		NurseTTESignature:        loadTTESignedSignatureByDocumentKeyWithBaseURL(fmt.Sprintf("informed_consent_nurse:%d", consent.ID), baseURL),
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
		{Label: "Tanggal Kunjungan", Value: formatVisitDateForPrint(record.Visit.VisitDate)},
		{Label: "Poliklinik", Value: fallbackText(record.Polyclinic.Name)},
		{Label: "DPJP", Value: fallbackText(doctor.FullName)},
		{Label: "Jenis Kunjungan", Value: formatVisitTypeForPrint(record.Visit.VisitType)},
		{Label: "Pembiayaan", Value: buildInformedConsentPaymentLabel(record.Visit)},
	}
}

func buildInformedConsentConsentGiverFields(consent models.InformedConsent, patient models.Patient, doctor models.Doctor) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Pemberi Persetujuan", Value: fallbackText(resolveInformedConsentConsentGiverName(consent, &patient))},
		{Label: "Hubungan dgn Pasien", Value: fallbackText(resolveInformedConsentConsentGiverRelation(consent, &patient))},
		{Label: "No. Identitas (NIK)", Value: fallbackText(resolveInformedConsentConsentGiverIDNumber(consent, &patient))},
		{Label: "Dokter Pelaksana", Value: fallbackText(doctor.FullName)},
		{Label: "Perawat Pendamping", Value: fallbackText(consent.NurseName)},
		{Label: "Saksi", Value: fallbackText(consent.WitnessName)},
	}
}

func buildInformedConsentNarrativeFields(consent models.InformedConsent) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Tindakan Kedokteran", Value: fallbackText(consent.ActionName)},
		{Label: "Diagnosis / Indikasi", Value: fallbackText(consent.Diagnosis)},
		{Label: "Tata Cara / Deskripsi", Value: fallbackText(consent.ActionDescription)},
		{Label: "Tujuan & Manfaat", Value: fallbackText(consent.Benefits)},
		{Label: "Risiko & Komplikasi", Value: fallbackText(consent.Risks)},
		{Label: "Alternatif Tindakan", Value: fallbackText(consent.Alternatives)},
		{Label: "Prognosis", Value: fallbackText(consent.Prognosis)},
		{Label: "Catatan Tambahan", Value: fallbackText(consent.Notes)},
	}
}

func buildInformedConsentDecisionFields(consent models.InformedConsent) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Pernyataan Keputusan", Value: informedConsentDecisionStatement(consent.PatientDecision, consent.ActionName)},
		{Label: "Waktu Persetujuan", Value: formatInformedConsentDateTime(consent.ConsentDate)},
	}
}

func buildInformedConsentPaymentLabel(visit models.Visit) string {
	parts := make([]string, 0, 2)
	if paymentType := formatPaymentTypeForPrint(visit.PaymentType); paymentType != "" && paymentType != "-" {
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
	documentTitle := "PERSETUJUAN TINDAKAN KEDOKTERAN (INFORMED CONSENT)"
	if normalizeInformedConsentDecision(data.Consent.PatientDecision) == "declined" {
		documentTitle = "PENOLAKAN TINDAKAN KEDOKTERAN (INFORMED CONSENT)"
	}
	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle("Informed Consent", false)
	pdf.SetAuthor(data.PrintedByLabel, false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetHeaderFuncMode(func() {
		if pdf.PageNo() != 1 {
			return
		}
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, documentTitle, "No. Kunjungan : "+fallbackText(data.Record.Visit.VisitNumber))
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

	patient := data.Record.Patient
	if patient.ID == 0 {
		patient = data.Consent.Patient
	}
	visit := data.Record.Visit
	if visit.Polyclinic.Name == "" {
		visit.Polyclinic = data.Record.Polyclinic
	}
	if visit.Doctor.FullName == "" {
		visit.Doctor = data.Record.Doctor
	}

	identityFields := mergePatientVisitPrintFields(patient, visit,
		initialAssessmentPrintField{Label: "Tgl. Consent", Value: formatInformedConsentDateTime(data.Consent.ConsentDate)},
		initialAssessmentPrintField{Label: "Status Keputusan", Value: informedConsentDecisionLabel(data.Consent.PatientDecision)},
	)
	addInitialAssessmentCompactFieldSection(pdf, "IDENTITAS PASIEN & KUNJUNGAN", identityFields, "Data pasien tidak tersedia.")
	addInitialAssessmentCompactFieldSection(pdf, "PENERIMA INFORMASI / PEMBERI PERSETUJUAN", data.ConsentGiverFields, "Data pemberi persetujuan belum dilengkapi.")
	addInitialAssessmentCompactFieldSection(pdf, "PEMBERIAN INFORMASI TINDAKAN KEDOKTERAN", filterNonEmptyPrintFields(data.ConsentFields), "Belum ada isi informed consent.")
	addInitialAssessmentCompactFieldSection(pdf, "PERNYATAAN KEPUTUSAN", data.DecisionFields, "Belum ada keputusan pasien.")
	addInformedConsentSignatureSection(pdf, hospitalInfo, data)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("informed-consent-%s-%s.pdf", sanitizePDFFileName(data.SignaturePatient), sanitizePDFFileName(data.Record.Visit.VisitNumber))
	return output.Bytes(), fileName, nil
}

func addInformedConsentSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, data informedConsentPrintViewData) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columnWidth := contentWidth / 4.0

	hasDoctorQR := hasTTEQRCode(data.DoctorTTESignature)
	hasNurseQR := hasTTEQRCode(data.NurseTTESignature)
	hasPatientWetSig := strings.HasPrefix(strings.TrimSpace(data.Consent.PatientSignature), "data:image/png;base64,")
	hasWitnessWetSig := strings.HasPrefix(strings.TrimSpace(data.Consent.WitnessSignature), "data:image/png;base64,")
	requiresTallBox := hasDoctorQR || hasNurseQR || hasPatientWetSig || hasWitnessWetSig
	reservedQRHeight := maxFloat64(
		resolveTTESignatureAnnotationReservedHeight(columnWidth, data.DoctorTTESignature),
		resolveTTESignatureAnnotationReservedHeight(columnWidth, data.NurseTTESignature),
	)

	signatureLineOffset := 19.0
	if requiresTallBox {
		signatureLineOffset = maxFloat64(23.0, 5.2+reservedQRHeight+3.8)
	}
	signatureBlockHeight := signatureLineOffset + 9.2
	dateBarH := 5.0
	boxH := dateBarH + signatureBlockHeight + 2.4
	ensureInitialAssessmentPDFSpace(pdf, boxH+4.0)
	boxStartY := pdf.GetY()
	sigGridTopY := boxStartY + dateBarH

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(left, boxStartY, contentWidth, boxH, "D")
	pdf.Line(left, sigGridTopY, left+contentWidth, sigGridTopY)
	pdf.Line(left+columnWidth, sigGridTopY, left+columnWidth, boxStartY+boxH)
	pdf.Line(left+(2*columnWidth), sigGridTopY, left+(2*columnWidth), boxStartY+boxH)
	pdf.Line(left+(3*columnWidth), sigGridTopY, left+(3*columnWidth), boxStartY+boxH)
	pdf.SetLineWidth(0.2)

	signatureLocation := strings.TrimSpace(hospitalInfo.City)
	signatureDate := formatDateIndonesian(data.SignatureDate)
	locationDateLabel := signatureDate
	if signatureLocation != "" {
		locationDateLabel = signatureLocation + ", " + signatureDate
	}

	col1X := left
	col2X := left + columnWidth
	col3X := left + (2 * columnWidth)
	col4X := left + (3 * columnWidth)

	pdf.SetFont("Arial", "", 7.8)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(left+2.5, boxStartY+0.7)
	pdf.CellFormat(contentWidth-5.0, 3.6, locationDateLabel, "", 1, "R", false, 0, "")

	currentY := sigGridTopY + 1.4
	// 1. TTD Pasien / Wali
	drawInformedConsentSignatureBlock(
		pdf,
		col1X,
		currentY,
		columnWidth,
		signatureLineOffset,
		"Pasien / Wali",
		data.SignaturePatient,
		"",
	)
	// 2. TTD Saksi
	drawInformedConsentSignatureBlock(
		pdf,
		col2X,
		currentY,
		columnWidth,
		signatureLineOffset,
		"Saksi",
		data.SignatureWitness,
		"",
	)
	// 3. TTD Dokter
	drawInformedConsentSignatureBlock(
		pdf,
		col3X,
		currentY,
		columnWidth,
		signatureLineOffset,
		"Dokter",
		resolveTTEPrintSignatureName(data.DoctorTTESignature, data.SignatureDoctor),
		"",
	)
	// 4. TTD Perawat
	drawInformedConsentSignatureBlock(
		pdf,
		col4X,
		currentY,
		columnWidth,
		signatureLineOffset,
		"Perawat",
		resolveTTEPrintSignatureName(data.NurseTTESignature, data.SignatureNurse),
		"",
	)

	if hasPatientWetSig {
		drawInformedConsentWetSignatureImage(pdf, col1X, currentY+4.4, columnWidth, signatureLineOffset-4.6, data.Consent.PatientSignature)
	}
	if hasWitnessWetSig {
		drawInformedConsentWetSignatureImage(pdf, col2X, currentY+4.4, columnWidth, signatureLineOffset-4.6, data.Consent.WitnessSignature)
	}
	if data.DoctorTTESignature != nil {
		drawTTESignatureAnnotation(pdf, col3X, currentY+4.6, columnWidth, data.DoctorTTESignature)
	}
	if data.NurseTTESignature != nil {
		drawTTESignatureAnnotation(pdf, col4X, currentY+4.6, columnWidth, data.NurseTTESignature)
	}

	pdf.SetY(boxStartY + boxH)
}

func drawInformedConsentWetSignatureImage(pdf *gofpdf.Fpdf, x float64, y float64, width float64, availHeight float64, dataURL string) {
	trimmed := strings.TrimSpace(dataURL)
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(trimmed, prefix) {
		return
	}
	rawBase64 := strings.TrimPrefix(trimmed, prefix)
	decoded, err := base64.StdEncoding.DecodeString(rawBase64)
	if err != nil || len(decoded) == 0 {
		return
	}

	tempFile, err := os.CreateTemp("", "ic-wet-sig-*.png")
	if err != nil {
		return
	}
	tempPath := tempFile.Name()
	if _, writeErr := tempFile.Write(decoded); writeErr != nil {
		_ = tempFile.Close()
		_ = os.Remove(tempPath)
		return
	}
	_ = tempFile.Close()
	defer os.Remove(tempPath)

	maxW := width - 6.0
	maxH := maxFloat64(12.0, availHeight-0.8)
	imgW := maxW
	imgH := maxH

	if wPx, hPx, dimErr := readLocalImageDimensions(tempPath); dimErr == nil && wPx > 0 && hPx > 0 {
		imgW, imgH, _, _ = calculateContainedImageBox(float64(wPx), float64(hPx), maxW, maxH)
	}
	imgX := x + ((width - imgW) / 2.0)
	imgY := y + ((availHeight - imgH) / 2.0)
	pdf.ImageOptions(tempPath, imgX, imgY, imgW, imgH, false, gofpdf.ImageOptions{ImageType: "PNG"}, 0, "")
}

func drawInformedConsentSignatureBlock(pdf *gofpdf.Fpdf, x float64, y float64, width float64, signatureLineOffset float64, title string, name string, detail string) {
	totalHeight := signatureLineOffset + 9.5

	pdf.SetFont("Arial", "B", 8.2)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(x, y)
	pdf.CellFormat(width, 4.2, firstNonEmpty(sanitizePDFSingleLineText(title), "-"), "", 0, "C", false, 0, "")

	signatureLineY := y + signatureLineOffset
	cleanName := strings.TrimSpace(sanitizePDFSingleLineText(name))
	displayName := "( ____________________ )"
	if cleanName != "" && cleanName != "-" {
		displayName = "( " + cleanName + " )"
	}

	pdf.SetFont("Arial", "B", 8.0)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetXY(x+1, signatureLineY+1.2)
	pdf.CellFormat(width-2, 3.8, fitTextToWidth(pdf, displayName, width-2), "", 0, "C", false, 0, "")

	trimmedDetail := strings.TrimSpace(sanitizePDFSingleLineText(detail))
	if trimmedDetail != "" && trimmedDetail != "-" {
		pdf.SetFont("Arial", "", 7.2)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetXY(x+1, signatureLineY+5.0)
		pdf.CellFormat(width-2, 3.4, fitTextToWidth(pdf, trimmedDetail, width-2), "", 0, "C", false, 0, "")
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
		return "Disetujui (Setuju)"
	case "declined":
		return "Ditolak (Menolak)"
	default:
		return "Draft / Belum Ditetapkan"
	}
}

func informedConsentDecisionStatement(value string, actionName string) string {
	actLabel := strings.TrimSpace(actionName)
	if actLabel == "" {
		actLabel = "tindakan kedokteran yang dijelaskan"
	}
	switch normalizeInformedConsentDecision(value) {
	case "approved":
		return "Setelah menerima penjelasan secara lengkap mengenai diagnosis, tata cara tindakan, tujuan/manfaat, risiko/komplikasi, alternatif, dan prognosis, maka dengan ini saya menyatakan SETUJU untuk dilakukan tindakan kedokteran berupa: " + actLabel + "."
	case "declined":
		return "Setelah menerima penjelasan secara lengkap mengenai diagnosis, tata cara tindakan, tujuan/manfaat, risiko/komplikasi, alternatif, dan prognosis, maka dengan ini saya menyatakan MENOLAK untuk dilakukan tindakan kedokteran berupa: " + actLabel + " dan memahami risiko medis atas penolakan tersebut."
	default:
		return "Keputusan pasien/wali atas tindakan " + actLabel + " masih dalam tahap konfirmasi."
	}
}

func formatInformedConsentDateTime(value time.Time) string {
	if value.IsZero() {
		return "-"
	}
	return formatDateTimeIndonesian(value)
}
