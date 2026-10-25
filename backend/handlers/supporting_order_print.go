package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
)

type orderPrintBaseViewData struct {
	GeneratedAt       time.Time
	Record            models.MedicalRecord
	PrintedBy         string
	ValidationBaseURL string
}

type pharmacyTicketEntryView struct {
	ItemType      string
	Title         string
	QuantityLine  string
	RuleLine      string
	Instructions  string
	Notes         string
	IngredientSet []string
}

type supportingOrderResultTableColumn struct {
	Title      string
	WidthRatio float64
	Align      string
}

type supportingOrderResultTableRow struct {
	Flag   string
	Values []string
}

func PrintPharmacyTicket(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadPrescriptionRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri resep tidak ditemukan"})
		return
	}

	if message, ok := ensurePharmacyTicketPrintable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	viewData := buildPrescriptionPrintViewData(c, record, "pharmacy")
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderPharmacyTicketPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF tiket farmasi"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func PrintLaboratoryTicket(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order laboratorium tidak ditemukan"})
		return
	}

	if message, ok := ensureLaboratoryTicketPrintable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	viewData := buildOrderPrintBaseViewData(c, record)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderLaboratoryTicketPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF tiket laboratorium"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func PrintLaboratoryResult(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadLaboratoryRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order laboratorium tidak ditemukan"})
		return
	}

	if message, ok := ensureLaboratoryResultPrintable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	viewData := buildOrderPrintBaseViewData(c, record)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderLaboratoryResultPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF hasil laboratorium"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func PrintRadiologyTicket(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order radiologi tidak ditemukan"})
		return
	}

	if message, ok := ensureRadiologyTicketPrintable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	viewData := buildOrderPrintBaseViewData(c, record)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderRadiologyTicketPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF tiket radiologi"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func PrintRadiologyResult(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadRadiologyRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order radiologi tidak ditemukan"})
		return
	}

	if message, ok := ensureRadiologyResultPrintable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	viewData := buildOrderPrintBaseViewData(c, record)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderRadiologyResultPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF hasil radiologi"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func buildOrderPrintBaseViewData(c *gin.Context, record models.MedicalRecord) orderPrintBaseViewData {
	return orderPrintBaseViewData{
		GeneratedAt:       time.Now(),
		Record:            record,
		PrintedBy:         resolvePrintedByLabel(c),
		ValidationBaseURL: resolveTTEVerificationBaseURLForRequest(c),
	}
}

func ensurePharmacyTicketPrintable(record models.MedicalRecord) (string, bool) {
	if normalizeMedicalRecordSection(record.SectionType) != "prescription" {
		return "Aksi ini hanya tersedia pada entri resep", false
	}
	if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) != prescriptionFulfillmentModeInternal {
		return "Tiket farmasi hanya tersedia untuk resep internal", false
	}
	if countPrescriptionOrderLines(record) == 0 {
		return "Entri resep belum memiliki item obat", false
	}
	if normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) == prescriptionWorkflowStatusDraft {
		return "Tiket farmasi tersedia setelah order resep dikirim ke farmasi", false
	}
	return "", true
}

func ensureLaboratoryTicketPrintable(record models.MedicalRecord) (string, bool) {
	if normalizeMedicalRecordSection(record.SectionType) != "laboratory" {
		return "Aksi ini hanya tersedia pada entri order laboratorium", false
	}
	if len(record.LaboratoryOrderItems) == 0 {
		return "Order laboratorium belum memiliki item pemeriksaan", false
	}
	if workflowStatus := getLaboratoryWorkflowStatus(record); workflowStatus == "" || workflowStatus == supportingOrderWorkflowStatusDraft {
		return "Tiket laboratorium tersedia setelah order dikirim ke unit laboratorium", false
	}
	return "", true
}

func ensureLaboratoryResultPrintable(record models.MedicalRecord) (string, bool) {
	if normalizeMedicalRecordSection(record.SectionType) != "laboratory" {
		return "Aksi ini hanya tersedia pada entri order laboratorium", false
	}
	if len(record.LaboratoryOrderItems) == 0 {
		return "Order laboratorium belum memiliki item pemeriksaan", false
	}
	if getLaboratoryWorkflowStatus(record) != supportingOrderWorkflowStatusCompleted {
		return "Hasil laboratorium tersedia setelah order selesai diproses", false
	}
	if !hasLaboratoryResultData(record) {
		return "Belum ada hasil laboratorium yang dapat dicetak", false
	}
	return "", true
}

func ensureRadiologyTicketPrintable(record models.MedicalRecord) (string, bool) {
	if normalizeMedicalRecordSection(record.SectionType) != "radiology" {
		return "Aksi ini hanya tersedia pada entri order radiologi", false
	}
	if len(record.RadiologyOrderItems) == 0 {
		return "Order radiologi belum memiliki item pemeriksaan", false
	}
	if workflowStatus := getRadiologyWorkflowStatus(record); workflowStatus == "" || workflowStatus == supportingOrderWorkflowStatusDraft {
		return "Tiket radiologi tersedia setelah order dikirim ke unit radiologi", false
	}
	return "", true
}

func ensureRadiologyResultPrintable(record models.MedicalRecord) (string, bool) {
	if normalizeMedicalRecordSection(record.SectionType) != "radiology" {
		return "Aksi ini hanya tersedia pada entri order radiologi", false
	}
	if len(record.RadiologyOrderItems) == 0 {
		return "Order radiologi belum memiliki item pemeriksaan", false
	}
	if getRadiologyWorkflowStatus(record) != supportingOrderWorkflowStatusCompleted {
		return "Hasil radiologi tersedia setelah order selesai diproses", false
	}
	if !hasRadiologyResultData(record) {
		return "Belum ada hasil radiologi yang dapat dicetak", false
	}
	return "", true
}

func hasLaboratoryResultData(record models.MedicalRecord) bool {
	for _, item := range record.LaboratoryOrderItems {
		if strings.TrimSpace(item.ResultValue) != "" {
			return true
		}
		for _, parameter := range item.ParameterResults {
			if strings.TrimSpace(parameter.ResultValue) != "" {
				return true
			}
		}
	}
	return false
}

func hasRadiologyResultData(record models.MedicalRecord) bool {
	for _, item := range record.RadiologyOrderItems {
		if strings.TrimSpace(item.Findings) != "" || strings.TrimSpace(item.Impression) != "" || strings.TrimSpace(item.Recommendation) != "" {
			return true
		}
		for _, parameter := range item.ParameterResults {
			if strings.TrimSpace(parameter.ResultValue) != "" {
				return true
			}
		}
	}
	return false
}

func formatEtiketSigna(signa string) string {
	trimmed := strings.TrimSpace(signa)
	if trimmed == "" {
		return "-"
	}
	trimmed = initialAssessmentPDFTextReplacer.Replace(trimmed)
	trimmed = signaMultiplierRegex.ReplaceAllString(trimmed, "${1}x${2}")
	trimmed = strings.Join(strings.Fields(trimmed), " ")
	if strings.HasPrefix(strings.ToUpper(trimmed), "S. ") {
		trimmed = strings.TrimSpace(trimmed[3:])
	} else if strings.HasPrefix(strings.ToUpper(trimmed), "S ") {
		trimmed = strings.TrimSpace(trimmed[2:])
	}
	if trimmed == "" {
		return "-"
	}
	return trimmed
}

func formatCompoundPreparationUnit(prepType string) string {
	lower := strings.ToLower(strings.TrimSpace(prepType))
	switch {
	case strings.Contains(lower, "kapsul") || strings.Contains(lower, "capsul"):
		return "Kapsul"
	case strings.Contains(lower, "pulveres") || strings.Contains(lower, "puyer") || strings.Contains(lower, "serbuk_bagi"):
		return "Bungkus"
	case strings.Contains(lower, "sirup") || strings.Contains(lower, "potio") || strings.Contains(lower, "suspensi") ||
		strings.Contains(lower, "emulsi") || strings.Contains(lower, "larutan") || strings.Contains(lower, "solution") ||
		strings.Contains(lower, "guttae") || strings.Contains(lower, "tetes") || strings.Contains(lower, "kumur") ||
		strings.Contains(lower, "pulvis"):
		return "Botol"
	case strings.Contains(lower, "salep") || strings.Contains(lower, "krim") || strings.Contains(lower, "cream") ||
		strings.Contains(lower, "pasta"):
		return "Pot"
	case strings.Contains(lower, "gel"):
		return "Tube"
	case strings.Contains(lower, "supp"):
		return "Supp"
	case strings.Contains(lower, "ovula"):
		return "Butir"
	default:
		cleaned := strings.ReplaceAll(prepType, "_", " ")
		words := strings.Fields(cleaned)
		for i, w := range words {
			words[i] = strings.Title(strings.ToLower(w))
		}
		res := strings.Join(words, " ")
		if res == "" {
			return "Bungkus"
		}
		return res
	}
}

func renderPharmacyTicketPDF(hospitalInfo initialAssessmentHospitalInfo, data prescriptionPrintViewData) ([]byte, string, error) {
	visit := resolvePrintVisit(data.Record)
	resolvedInfo := resolvePrescriptionHospitalInfo(hospitalInfo)

	// Etiket ukuran lebar 80 mm x tinggi 40 mm
	// Orientation "P" pada SizeType{Wd: 80, Ht: 40} di gofpdf menghasilkan Lebar: 80mm, Tinggi: 40mm
	pdf := gofpdf.NewCustom(&gofpdf.InitType{
		OrientationStr: "P",
		UnitStr:        "mm",
		Size:           gofpdf.SizeType{Wd: 80, Ht: 40},
	})
	pdf.SetMargins(0, 0, 0)
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetTitle("Etiket Obat", false)
	pdf.SetAuthor(fallbackText(data.PrintedBy), false)
	pdf.SetCreator("SIMKLINIK", false)

	type etiketEntry struct {
		MedName      string
		QuantityStr  string
		Instructions string
		Notes        string
	}

	entries := make([]etiketEntry, 0, len(data.Items)+len(data.Compounds))

	// 1. Obat Non-Racikan
	for _, item := range data.Items {
		qtyStr := strings.TrimSpace(item.QuantityLine)
		if idx := strings.Index(qtyStr, "-"); idx != -1 {
			qtyStr = strings.TrimSpace(qtyStr[:idx])
		}
		if qtyStr == "" {
			qtyStr = fmt.Sprintf("%d", item.Quantity)
		}
		inst := strings.TrimSpace(item.Instructions)
		if inst == "" {
			inst = strings.TrimSpace(item.RuleLine)
		}
		entries = append(entries, etiketEntry{
			MedName:      fallbackText(item.Name),
			QuantityStr:  fallbackText(qtyStr),
			Instructions: inst,
			Notes:        strings.TrimSpace(item.Notes),
		})
	}

	// 2. Obat Racikan (Etiket tanpa bahan racikan, hanya nama racikan saja dengan satuan kemasan yang rapi)
	for _, compound := range data.Compounds {
		prep := formatCompoundPreparationUnit(compound.PreparationType)
		qtyStr := ""
		if compound.OutputQuantity > 0 {
			qtyStr = fmt.Sprintf("%d %s", compound.OutputQuantity, prep)
		} else {
			qtyStr = prep
		}
		inst := strings.TrimSpace(compound.Instructions)
		if inst == "" {
			inst = strings.TrimSpace(compound.RuleLine)
		}
		entries = append(entries, etiketEntry{
			MedName:      fallbackText(compound.Name),
			QuantityStr:  fallbackText(qtyStr),
			Instructions: inst,
			Notes:        strings.TrimSpace(compound.Notes),
		})
	}

	if len(entries) == 0 {
		entries = append(entries, etiketEntry{
			MedName:      "-",
			QuantityStr:  "-",
			Instructions: "-",
		})
	}

	// Format tanggal resep DD/MM/YYYY
	tglStr := data.Record.RecordDate.Format("02/01/2006")
	if data.Record.PrescriptionOrderedAt != nil && !data.Record.PrescriptionOrderedAt.IsZero() {
		tglStr = data.Record.PrescriptionOrderedAt.Format("02/01/2006")
	}

	boxX := 2.0
	boxY := 2.0
	boxW := 76.0
	boxH := 36.0

	for _, entry := range entries {
		pdf.AddPage()

		// 1. Border Luar
		pdf.SetLineWidth(0.35)
		pdf.SetDrawColor(0, 0, 0)
		pdf.Rect(boxX, boxY, boxW, boxH, "D")

		// 2. Header KOP Etiket
		kopH := 8.2
		line1Y := boxY + kopH

		logoSize := 6.6
		logoX := boxX + 1.5
		logoY := boxY + (kopH-logoSize)/2
		textX := boxX + 1.5
		textW := boxW - 3.0

		if resolvedInfo.LogoPath != "" && resolvedInfo.LogoType != "" {
			pdf.ImageOptions(resolvedInfo.LogoPath, logoX, logoY, logoSize, logoSize, false, gofpdf.ImageOptions{ImageType: resolvedInfo.LogoType}, 0, "")
			textX = logoX + logoSize + 2.0
			textW = (boxX + boxW) - textX - 1.5
		}

		// Nama Klinik (Bold)
		pdf.SetFont("Arial", "B", 7.2)
		pdf.SetTextColor(0, 0, 0)
		hospName := strings.TrimSpace(resolvedInfo.Name)
		if hospName == "" {
			hospName = "KLINIK UTAMA"
		}
		pdf.SetXY(textX, boxY+0.6)
		pdf.CellFormat(textW, 2.9, fitTextToWidth(pdf, sanitizePDFText(hospName), textW), "", 0, "L", false, 0, "")

		// Alamat Ringkas
		pdf.SetFont("Arial", "", 4.4)
		addrParts := []string{strings.TrimSpace(resolvedInfo.Address), strings.TrimSpace(resolvedInfo.City)}
		addrStr := strings.Trim(strings.Join(filterEmptyStrings(addrParts), ", "), ", ")
		if addrStr != "" {
			pdf.SetXY(textX, boxY+3.6)
			pdf.CellFormat(textW, 2.0, fitTextToWidth(pdf, sanitizePDFText(addrStr), textW), "", 0, "L", false, 0, "")
		}

		// Telepon / Kontak
		contactStr := ""
		if strings.TrimSpace(resolvedInfo.Phone) != "" {
			contactStr = "Telp: " + strings.TrimSpace(resolvedInfo.Phone)
		}
		if email := strings.TrimSpace(resolvedInfo.Email); email != "" {
			if contactStr != "" {
				contactStr += " | " + email
			} else {
				contactStr = email
			}
		}
		if contactStr != "" {
			pdf.SetXY(textX, boxY+5.7)
			pdf.CellFormat(textW, 2.0, fitTextToWidth(pdf, sanitizePDFText(contactStr), textW), "", 0, "L", false, 0, "")
		}

		// Garis Pemisah KOP Tebal
		pdf.SetLineWidth(0.35)
		pdf.Line(boxX, line1Y, boxX+boxW, line1Y)

		// 3. Body Data Pasien & Obat
		startBodyY := line1Y + 0.7
		rowH := 3.1
		labelW := 10.5
		colonW := 2.0
		valW := 40.0

		// Baris 1: Nama & Tgl
		pdf.SetXY(boxX+1.5, startBodyY)
		pdf.SetFont("Arial", "", 6.2)
		pdf.CellFormat(labelW, rowH, "Nama", "", 0, "L", false, 0, "")
		pdf.CellFormat(colonW, rowH, ":", "", 0, "C", false, 0, "")
		pdf.SetFont("Arial", "B", 6.8)
		pdf.CellFormat(valW, rowH, fitTextToWidth(pdf, sanitizePDFText(strings.ToUpper(data.PatientName)), valW), "", 0, "L", false, 0, "")
		pdf.SetFont("Arial", "", 5.8)
		tglW := (boxX + boxW) - (boxX + 1.5 + labelW + colonW + valW) - 1.5
		pdf.CellFormat(tglW, rowH, "Tgl: "+tglStr, "", 0, "R", false, 0, "")

		// Baris 2: No. RM
		pdf.SetXY(boxX+1.5, startBodyY+rowH)
		pdf.SetFont("Arial", "", 6.2)
		pdf.CellFormat(labelW, rowH, "No. RM", "", 0, "L", false, 0, "")
		pdf.CellFormat(colonW, rowH, ":", "", 0, "C", false, 0, "")
		pdf.SetFont("Arial", "B", 6.8)
		pdf.CellFormat(valW, rowH, sanitizePDFText(data.PatientRM), "", 0, "L", false, 0, "")

		// Baris 3: Obat (Nama obat / racikan bersih)
		pdf.SetXY(boxX+1.5, startBodyY+2*rowH)
		pdf.SetFont("Arial", "", 6.2)
		pdf.CellFormat(labelW, rowH, "Obat", "", 0, "L", false, 0, "")
		pdf.CellFormat(colonW, rowH, ":", "", 0, "C", false, 0, "")
		pdf.SetFont("Arial", "B", 6.8)
		medW := boxW - labelW - colonW - 3.5
		pdf.CellFormat(medW, rowH, fitTextToWidth(pdf, sanitizePDFText(entry.MedName), medW), "", 0, "L", false, 0, "")

		// Baris 4: Jumlah & ED
		pdf.SetXY(boxX+1.5, startBodyY+3*rowH)
		pdf.SetFont("Arial", "", 6.2)
		pdf.CellFormat(labelW, rowH, "Jumlah", "", 0, "L", false, 0, "")
		pdf.CellFormat(colonW, rowH, ":", "", 0, "C", false, 0, "")
		pdf.SetFont("Arial", "B", 6.8)
		qtyW := 28.0
		pdf.CellFormat(qtyW, rowH, fitTextToWidth(pdf, sanitizePDFText(entry.QuantityStr), qtyW), "", 0, "L", false, 0, "")
		pdf.SetFont("Arial", "", 5.8)
		edW := (boxX + boxW) - (boxX + 1.5 + labelW + colonW + qtyW) - 1.5
		pdf.CellFormat(edW, rowH, "ED    :  -", "", 0, "R", false, 0, "")

		// Garis Pemisah Tipis
		line2Y := startBodyY + 4*rowH + 0.5
		pdf.SetLineWidth(0.25)
		pdf.Line(boxX, line2Y, boxX+boxW, line2Y)

		// 4. Aturan Pakai (Signa)
		aturanY := line2Y + 1.2
		pdf.SetXY(boxX+1.5, aturanY)
		pdf.SetFont("Arial", "B", 6.8)
		pdf.CellFormat(16.0, 3.4, "Aturan Pakai", "", 0, "L", false, 0, "")
		pdf.CellFormat(2.0, 3.4, ":", "", 0, "C", false, 0, "")

		cleanSigna := formatEtiketSigna(entry.Instructions)
		pdf.SetFont("Arial", "B", 7.6)
		signaW := boxW - 1.5 - 16.0 - 2.0 - 1.5
		pdf.CellFormat(signaW, 3.4, fitTextToWidth(pdf, sanitizePDFText(cleanSigna), signaW), "", 0, "L", false, 0, "")
	}

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("etiket-farmasi-%s-%s.pdf", sanitizePDFFileName(visit.Patient.FullName), sanitizePDFFileName(visit.VisitNumber))
	return output.Bytes(), fileName, nil
}

func renderLaboratoryTicketPDF(hospitalInfo initialAssessmentHospitalInfo, data orderPrintBaseViewData) ([]byte, string, error) {
	visit := resolvePrintVisit(data.Record)
	pdf := newInitialAssessmentStyledPDF("TIKET LABORATORIUM", data.PrintedBy, data.GeneratedAt)

	for index, item := range data.Record.LaboratoryOrderItems {
		beginInitialAssessmentStyledSection(pdf, hospitalInfo, "TIKET LABORATORIUM", buildSupportingOrderSectionSubtitle(visit.VisitNumber, resolveLaboratoryItemTitle(item)))
		addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", buildLaboratoryTicketDocumentFields(data, visit, item, index+1, len(data.Record.LaboratoryOrderItems)), "")
		addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", buildSupportingOrderPatientFields(visit.Patient), "Data pasien tidak tersedia.")
		addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", buildInitialAssessmentVisitFields(visit), "Data kunjungan tidak tersedia.")
		addLaboratoryTicketItemSection(pdf, item)

		if strings.TrimSpace(data.Record.Notes) != "" {
			addInitialAssessmentSectionTitle(pdf, "CATATAN ORDER")
			addInitialAssessmentFullWidthRow(pdf, data.Record.Notes, false)
			addInitialAssessmentSectionSpacing(pdf)
		}

		addOrderPrintSignatureSection(pdf, hospitalInfo, data.GeneratedAt, "Petugas Cetak", data.PrintedBy, "Dokter Pemeriksa", visit.Doctor.FullName)
	}

	pdfBytes, err := outputInitialAssessmentStyledPDF(pdf)
	if err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("tiket-laboratorium-%s-%s.pdf", sanitizePDFFileName(visit.Patient.FullName), sanitizePDFFileName(visit.VisitNumber))
	return pdfBytes, fileName, nil
}

func renderLaboratoryResultPDF(hospitalInfo initialAssessmentHospitalInfo, data orderPrintBaseViewData) ([]byte, string, error) {
	visit := resolvePrintVisit(data.Record)
	pdf := newInitialAssessmentStyledPDF("HASIL LABORATORIUM", data.PrintedBy, data.GeneratedAt)
	doctorTTESignature := loadTTESignedSignatureByDocumentKeyWithBaseURL(fmt.Sprintf("laboratory_result:%d", data.Record.ID), data.ValidationBaseURL)
	staffTTESignature := loadTTESignedSignatureByDocumentKeyWithBaseURL(fmt.Sprintf("laboratory_result_staff:%d", data.Record.ID), data.ValidationBaseURL)

	for index, item := range data.Record.LaboratoryOrderItems {
		beginInitialAssessmentStyledSection(pdf, hospitalInfo, "HASIL LABORATORIUM", buildSupportingOrderSectionSubtitle(visit.VisitNumber, resolveLaboratoryItemTitle(item)))
		addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", buildLaboratoryResultDocumentFields(data, visit, item, index+1, len(data.Record.LaboratoryOrderItems)), "")
		addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", buildSupportingOrderPatientFields(visit.Patient), "Data pasien tidak tersedia.")
		addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", buildInitialAssessmentVisitFields(visit), "Data kunjungan tidak tersedia.")
		addLaboratoryResultItemSection(pdf, item)
		addOrderPrintSignatureSectionWithDualTTE(pdf, hospitalInfo, data.GeneratedAt, "Petugas Laboratorium", resolveLaboratoryItemResultUserName(item), staffTTESignature, "Dokter Pemeriksa", visit.Doctor.FullName, doctorTTESignature)
	}

	pdfBytes, err := outputInitialAssessmentStyledPDF(pdf)
	if err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("hasil-laboratorium-%s-%s.pdf", sanitizePDFFileName(visit.Patient.FullName), sanitizePDFFileName(visit.VisitNumber))
	return pdfBytes, fileName, nil
}

func renderRadiologyTicketPDF(hospitalInfo initialAssessmentHospitalInfo, data orderPrintBaseViewData) ([]byte, string, error) {
	visit := resolvePrintVisit(data.Record)
	pdf := newInitialAssessmentStyledPDF("TIKET RADIOLOGI", data.PrintedBy, data.GeneratedAt)

	for index, item := range data.Record.RadiologyOrderItems {
		beginInitialAssessmentStyledSection(pdf, hospitalInfo, "TIKET RADIOLOGI", buildSupportingOrderSectionSubtitle(visit.VisitNumber, resolveRadiologyItemTitle(item)))
		addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", buildRadiologyTicketDocumentFields(data, visit, item, index+1, len(data.Record.RadiologyOrderItems)), "")
		addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", buildSupportingOrderPatientFields(visit.Patient), "Data pasien tidak tersedia.")
		addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", buildInitialAssessmentVisitFields(visit), "Data kunjungan tidak tersedia.")
		addRadiologyTicketItemSection(pdf, item)

		if strings.TrimSpace(data.Record.Notes) != "" {
			addInitialAssessmentSectionTitle(pdf, "CATATAN ORDER")
			addInitialAssessmentFullWidthRow(pdf, data.Record.Notes, false)
			addInitialAssessmentSectionSpacing(pdf)
		}

		addOrderPrintSignatureSection(pdf, hospitalInfo, data.GeneratedAt, "Petugas Cetak", data.PrintedBy, "Dokter Pemeriksa", visit.Doctor.FullName)
	}

	pdfBytes, err := outputInitialAssessmentStyledPDF(pdf)
	if err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("tiket-radiologi-%s-%s.pdf", sanitizePDFFileName(visit.Patient.FullName), sanitizePDFFileName(visit.VisitNumber))
	return pdfBytes, fileName, nil
}

func renderRadiologyResultPDF(hospitalInfo initialAssessmentHospitalInfo, data orderPrintBaseViewData) ([]byte, string, error) {
	visit := resolvePrintVisit(data.Record)
	pdf := newInitialAssessmentStyledPDF("HASIL RADIOLOGI", data.PrintedBy, data.GeneratedAt)
	doctorTTESignature := loadTTESignedSignatureByDocumentKeyWithBaseURL(fmt.Sprintf("radiology_result:%d", data.Record.ID), data.ValidationBaseURL)
	staffTTESignature := loadTTESignedSignatureByDocumentKeyWithBaseURL(fmt.Sprintf("radiology_result_staff:%d", data.Record.ID), data.ValidationBaseURL)

	for index, item := range data.Record.RadiologyOrderItems {
		beginInitialAssessmentStyledSection(pdf, hospitalInfo, "HASIL RADIOLOGI", buildSupportingOrderSectionSubtitle(visit.VisitNumber, resolveRadiologyItemTitle(item)))
		addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", buildRadiologyResultDocumentFields(data, visit, item, index+1, len(data.Record.RadiologyOrderItems)), "")
		addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", buildSupportingOrderPatientFields(visit.Patient), "Data pasien tidak tersedia.")
		addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", buildInitialAssessmentVisitFields(visit), "Data kunjungan tidak tersedia.")
		addRadiologyResultItemSection(pdf, item)
		addOrderPrintSignatureSectionWithDualTTE(pdf, hospitalInfo, data.GeneratedAt, "Petugas Radiologi", resolveRadiologyItemResultUserName(item), staffTTESignature, "Dokter Pemeriksa", visit.Doctor.FullName, doctorTTESignature)
	}

	pdfBytes, err := outputInitialAssessmentStyledPDF(pdf)
	if err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("hasil-radiologi-%s-%s.pdf", sanitizePDFFileName(visit.Patient.FullName), sanitizePDFFileName(visit.VisitNumber))
	return pdfBytes, fileName, nil
}

func newInitialAssessmentStyledPDF(title string, author string, generatedAt time.Time) *gofpdf.Fpdf {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle(sanitizePDFText(title), false)
	pdf.SetAuthor(sanitizePDFText(author), false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-8)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(90, 90, 90)
		pdf.CellFormat(90, 4, "Dicetak: "+formatDateTimeIndonesian(generatedAt), "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	return pdf
}

func beginInitialAssessmentStyledSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, title string, subtitle string) {
	sectionFirstPage := pdf.PageNo() + 1
	setInitialAssessmentPDFPageContentStartOverride(pdf, sectionFirstPage, initialAssessmentPDFContentStart)
	pdf.SetHeaderFuncMode(func() {
		if pdf.PageNo() != sectionFirstPage {
			return
		}
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, title, fallbackText(subtitle))
	}, true)
	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
}

func outputInitialAssessmentStyledPDF(pdf *gofpdf.Fpdf) ([]byte, error) {
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func resolvePrintVisit(record models.MedicalRecord) models.Visit {
	visit := record.Visit
	if visit.ID == 0 {
		visit.ID = record.VisitID
	}
	if visit.Patient.ID == 0 {
		visit.Patient = record.Patient
	}
	if visit.Doctor.ID == 0 {
		visit.Doctor = record.Doctor
	}
	if visit.Polyclinic.ID == 0 {
		visit.Polyclinic = record.Polyclinic
	}
	return visit
}

func buildSupportingOrderPatientFields(patient models.Patient) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "No. Rekam Medis", Value: fallbackText(patient.MedicalRecordNumber)},
		{Label: "Nama Pasien", Value: fallbackText(patient.FullName)},
		{Label: "Umur", Value: fallbackText(calculatePatientAgeLabel(patient.BirthDate))},
		{Label: "Jenis Kelamin", Value: fallbackText(genderLabelForPrint(patient.Gender))},
		{Label: "No. Telepon", Value: fallbackText(patient.Phone)},
		{Label: "Alamat", Value: formatPatientAddress(patient)},
	}
}

func buildPharmacyTicketDocumentFields(_ models.Visit, data prescriptionPrintViewData, entry pharmacyTicketEntryView, itemIndex int, totalItems int) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Jenis Dokumen", Value: "Etiket Farmasi"},
		{Label: "Item", Value: fmt.Sprintf("%d dari %d", itemIndex, totalItems)},
		{Label: "Jenis Obat", Value: entry.ItemType},
		{Label: "Mode Pemenuhan", Value: data.ModeLabel},
		{Label: "Status Order", Value: prescriptionWorkflowStatusLabel(data.Record.PrescriptionWorkflowStatus)},
		{Label: "Tanggal Order", Value: resolveOrderDateLabel(data.Record.PrescriptionOrderedAt, data.Record.RecordDate)},
		{Label: "Tanggal Cetak", Value: formatDateTimeIndonesian(data.GeneratedAt)},
		{Label: "Petugas Cetak", Value: fallbackText(data.PrintedBy)},
	}
}

func buildSupportingTicketDocumentFields(data orderPrintBaseViewData, _ models.Visit, documentLabel string, workflowLabel string, orderedAt *time.Time, itemTitle string, itemCode string, itemIndex int, totalItems int) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Jenis Dokumen", Value: documentLabel},
		{Label: "Item", Value: fmt.Sprintf("%d dari %d", itemIndex, totalItems)},
		{Label: "Pemeriksaan", Value: fallbackText(itemTitle)},
		{Label: "Kode", Value: fallbackText(itemCode)},
		{Label: "Status Order", Value: fallbackText(workflowLabel)},
		{Label: "Tanggal Order", Value: resolveOrderDateLabel(orderedAt, data.Record.RecordDate)},
		{Label: "Tanggal Cetak", Value: formatDateTimeIndonesian(data.GeneratedAt)},
		{Label: "Petugas Cetak", Value: fallbackText(data.PrintedBy)},
	}
}

func buildSupportingResultDocumentFields(data orderPrintBaseViewData, _ models.Visit, documentLabel string, workflowLabel string, orderedAt *time.Time, processedAt *time.Time, itemTitle string, itemCode string, itemIndex int, totalItems int, processedBy string) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "Jenis Dokumen", Value: documentLabel},
		{Label: "Item", Value: fmt.Sprintf("%d dari %d", itemIndex, totalItems)},
		{Label: "Pemeriksaan", Value: fallbackText(itemTitle)},
		{Label: "Kode", Value: fallbackText(itemCode)},
		{Label: "Status Order", Value: fallbackText(workflowLabel)},
		{Label: "Tanggal Order", Value: resolveOrderDateLabel(orderedAt, data.Record.RecordDate)},
		{Label: "Tanggal Selesai", Value: formatRecordDateTimePDF(processedAt)},
		{Label: "Petugas Hasil", Value: fallbackText(processedBy)},
		{Label: "Tanggal Cetak", Value: formatDateTimeIndonesian(data.GeneratedAt)},
		{Label: "Petugas Cetak", Value: fallbackText(data.PrintedBy)},
	}
}

func addPharmacyTicketItemSection(pdf *gofpdf.Fpdf, entry pharmacyTicketEntryView) {
	addInitialAssessmentSectionTitle(pdf, "DETAIL ETIKET")
	addInitialAssessmentFullWidthRow(pdf, entry.Title, true)
	addInitialAssessmentKeyValueRow(pdf, "Jumlah", fallbackText(entry.QuantityLine))
	addInitialAssessmentKeyValueRow(pdf, "Aturan", fallbackText(entry.RuleLine))
	if strings.TrimSpace(entry.Instructions) != "" {
		addInitialAssessmentKeyValueRow(pdf, "Instruksi", entry.Instructions)
	}
	if strings.TrimSpace(entry.Notes) != "" {
		addInitialAssessmentKeyValueRow(pdf, "Catatan", entry.Notes)
	}
	if len(entry.IngredientSet) > 0 {
		addInitialAssessmentKeyValueRow(pdf, "Kandungan", strings.Join(entry.IngredientSet, "\n"))
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addLaboratoryTicketItemSection(pdf *gofpdf.Fpdf, item models.LaboratoryOrderItem) {
	addInitialAssessmentSectionTitle(pdf, "PEMERIKSAAN DIMINTA")
	addInitialAssessmentFullWidthRow(pdf, resolveLaboratoryItemTitle(item), true)
	if len(item.ParameterResults) > 0 {
		addInitialAssessmentKeyValueRow(pdf, "Jumlah Parameter", fmt.Sprintf("%d parameter", len(item.ParameterResults)))
	} else {
		if strings.TrimSpace(item.UnitSnapshot) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Unit", item.UnitSnapshot)
		}
		if strings.TrimSpace(item.NormalValueSnapshot) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Nilai Rujukan", item.NormalValueSnapshot)
		}
	}
	if strings.TrimSpace(item.Instructions) != "" {
		addInitialAssessmentKeyValueRow(pdf, "Instruksi", item.Instructions)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addLaboratoryResultItemSection(pdf *gofpdf.Fpdf, item models.LaboratoryOrderItem) {

	if len(item.ParameterResults) > 0 {
		addSupportingOrderResultTable(
			pdf,
			"HASIL PEMERIKSAAN ",
			[]supportingOrderResultTableColumn{
				{Title: "Parameter", WidthRatio: 0.30, Align: "L"},
				{Title: "Rujukan", WidthRatio: 0.26, Align: "L"},
				{Title: "Hasil", WidthRatio: 0.26, Align: "L"},
				{Title: "Flag", WidthRatio: 0.18, Align: "C"},
			},
			buildLaboratoryResultTableRows(item.ParameterResults),
			"Belum ada hasil parameter laboratorium.",
		)
	} else {
		addInitialAssessmentKeyValueRow(pdf, "Hasil", buildLaboratorySingleResultValue(item))
		if strings.TrimSpace(item.NormalValueSnapshot) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Nilai Rujukan", item.NormalValueSnapshot)
		}
		if strings.TrimSpace(item.Flag) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Flag", item.Flag)
		}
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addRadiologyTicketItemSection(pdf *gofpdf.Fpdf, item models.RadiologyOrderItem) {
	addInitialAssessmentSectionTitle(pdf, "PEMERIKSAAN DIMINTA")
	addInitialAssessmentFullWidthRow(pdf, resolveRadiologyItemTitle(item), true)
	if len(item.ParameterResults) > 0 {
		addInitialAssessmentKeyValueRow(pdf, "Jumlah Parameter", fmt.Sprintf("%d parameter", len(item.ParameterResults)))
	}
	if strings.TrimSpace(item.Instructions) != "" {
		addInitialAssessmentKeyValueRow(pdf, "Instruksi", item.Instructions)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addRadiologyResultItemSection(pdf *gofpdf.Fpdf, item models.RadiologyOrderItem) {
	if len(item.ParameterResults) > 0 {
		addSupportingOrderResultTable(
			pdf,
			"HASIL PEMERIKSAAN",
			[]supportingOrderResultTableColumn{
				{Title: "Parameter", WidthRatio: 0.25, Align: "L"},
				{Title: "Hasil", WidthRatio: 0.75, Align: "L"},
			},
			buildRadiologyResultTableRows(item.ParameterResults),
			"Belum ada hasil parameter radiologi.",
		)
	} else {
		if strings.TrimSpace(item.Findings) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Temuan", item.Findings)
		}
		if strings.TrimSpace(item.Impression) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Kesan", item.Impression)
		}
		if strings.TrimSpace(item.Recommendation) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Rekomendasi", item.Recommendation)
		}
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func buildLaboratoryParameterResultValue(parameter models.LaboratoryOrderParameterResult) string {
	resultValue := strings.TrimSpace(parameter.ResultValue)
	if resultValue == "" {
		resultValue = "-"
	}
	if strings.TrimSpace(parameter.UnitSnapshot) != "" && resultValue != "-" {
		resultValue += " " + strings.TrimSpace(parameter.UnitSnapshot)
	}

	lines := []string{"Hasil: " + resultValue}
	if strings.TrimSpace(parameter.NormalValueSnapshot) != "" {
		lines = append(lines, "Rujukan: "+strings.TrimSpace(parameter.NormalValueSnapshot))
	}
	if strings.TrimSpace(parameter.Flag) != "" {
		lines = append(lines, "Flag: "+strings.TrimSpace(parameter.Flag))
	}
	return strings.Join(lines, "\n")
}

func buildLaboratorySingleResultValue(item models.LaboratoryOrderItem) string {
	resultValue := strings.TrimSpace(item.ResultValue)
	if resultValue == "" {
		resultValue = "-"
	}
	if strings.TrimSpace(item.UnitSnapshot) != "" && resultValue != "-" {
		resultValue += " " + strings.TrimSpace(item.UnitSnapshot)
	}
	return resultValue
}

func buildRadiologyParameterResultValue(parameter models.RadiologyOrderParameterResult) string {
	resultValue := strings.TrimSpace(parameter.ResultValue)
	if resultValue == "" {
		resultValue = "-"
	}
	if strings.TrimSpace(parameter.UnitSnapshot) != "" && resultValue != "-" {
		resultValue += " " + strings.TrimSpace(parameter.UnitSnapshot)
	}

	lines := []string{"Hasil: " + resultValue}
	if strings.TrimSpace(parameter.ReferenceValueSnapshot) != "" {
		lines = append(lines, "Rujukan: "+strings.TrimSpace(parameter.ReferenceValueSnapshot))
	}
	return strings.Join(lines, "\n")
}

func buildLaboratoryResultTableRows(parameters []models.LaboratoryOrderParameterResult) []supportingOrderResultTableRow {
	rows := make([]supportingOrderResultTableRow, 0, len(parameters))
	for _, parameter := range parameters {
		resultValue := strings.TrimSpace(parameter.ResultValue)
		if resultValue == "" {
			resultValue = "-"
		}
		if strings.TrimSpace(parameter.UnitSnapshot) != "" && resultValue != "-" {
			resultValue += " " + strings.TrimSpace(parameter.UnitSnapshot)
		}

		flag := strings.TrimSpace(parameter.Flag)
		flagLabel := "-"
		if flag != "" {
			flagLabel = strings.ToUpper(flag)
		}

		rows = append(rows, supportingOrderResultTableRow{
			Flag: flag,
			Values: []string{
				fallbackText(resolveLaboratoryParameterName(parameter)),
				fallbackText(parameter.NormalValueSnapshot),
				resultValue,
				flagLabel,
			},
		})
	}
	return rows
}

func buildRadiologyResultTableRows(parameters []models.RadiologyOrderParameterResult) []supportingOrderResultTableRow {
	rows := make([]supportingOrderResultTableRow, 0, len(parameters))
	for _, parameter := range parameters {
		resultValue := strings.TrimSpace(parameter.ResultValue)
		if resultValue == "" {
			resultValue = "-"
		}
		if strings.TrimSpace(parameter.UnitSnapshot) != "" && resultValue != "-" {
			resultValue += " " + strings.TrimSpace(parameter.UnitSnapshot)
		}

		rows = append(rows, supportingOrderResultTableRow{
			Flag: "",
			Values: []string{
				fallbackText(resolveRadiologyParameterName(parameter)),
				resultValue,
			},
		})
	}
	return rows
}

func addSupportingOrderResultTable(pdf *gofpdf.Fpdf, title string, columns []supportingOrderResultTableColumn, rows []supportingOrderResultTableRow, emptyMessage string) {
	addInitialAssessmentSectionTitle(pdf, title)
	if len(rows) == 0 {
		addInitialAssessmentFullWidthRow(pdf, firstNonEmpty(emptyMessage, "Tidak ada data hasil parameter."), false)
		addInitialAssessmentSectionSpacing(pdf)
		return
	}

	drawHeader := func() {
		drawSupportingOrderResultTableHeader(pdf, columns)
	}

	drawHeader()
	for _, row := range rows {
		rowHeight := measureSupportingOrderResultTableRowHeight(pdf, columns, row)
		_, pageHeight := pdf.GetPageSize()
		if pdf.GetY()+rowHeight > pageHeight-initialAssessmentPDFMarginBottom {
			pdf.AddPage()
			pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
			drawHeader()
		}
		drawSupportingOrderResultTableRow(pdf, columns, row, rowHeight)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func drawSupportingOrderResultTableHeader(pdf *gofpdf.Fpdf, columns []supportingOrderResultTableColumn) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	headerHeight := 6.0
	ensureInitialAssessmentPDFSpace(pdf, headerHeight)

	x := left
	y := pdf.GetY()
	pdf.SetFont("Arial", "B", 8)
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetFillColor(225, 225, 225)
	for index, column := range columns {
		width := resolveSupportingOrderResultTableColumnWidth(contentWidth, columns, index)
		pdf.Rect(x, y, width, headerHeight, "DF")
		pdf.SetXY(x+1, y+0.35)
		pdf.CellFormat(width-2, headerHeight-0.7, strings.ToUpper(sanitizePDFSingleLineText(column.Title)), "", 0, "C", false, 0, "")
		x += width
	}
	pdf.SetY(y + headerHeight)
	pdf.SetFont("Arial", "", 9)
}

func drawSupportingOrderResultTableRow(pdf *gofpdf.Fpdf, columns []supportingOrderResultTableColumn, row supportingOrderResultTableRow, rowHeight float64) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	x := left
	y := pdf.GetY()
	fillR, fillG, fillB, useFill := resolveSupportingOrderFlagFillColor(row.Flag)
	pdf.SetDrawColor(120, 120, 120)

	for index, column := range columns {
		width := resolveSupportingOrderResultTableColumnWidth(contentWidth, columns, index)
		style := "D"
		if useFill {
			style = "DF"
			pdf.SetFillColor(fillR, fillG, fillB)
		}
		pdf.Rect(x, y, width, rowHeight, style)

		textValue := "-"
		if index < len(row.Values) && strings.TrimSpace(row.Values[index]) != "" {
			textValue = sanitizePDFSingleLineText(row.Values[index])
		}

		fontStyle := ""
		if strings.EqualFold(column.Title, "Flag") {
			fontStyle = "B"
		}
		pdf.SetXY(x+1.2, y+0.35)
		pdf.SetFont("Arial", fontStyle, 8.2)
		pdf.MultiCell(width-3, 4, textValue, "", column.Align, false)
		x += width
	}

	pdf.SetFont("Arial", "", 9)
	pdf.SetY(y + rowHeight)
}

func measureSupportingOrderResultTableRowHeight(pdf *gofpdf.Fpdf, columns []supportingOrderResultTableColumn, row supportingOrderResultTableRow) float64 {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	maxHeight := 6.0

	for index := range columns {
		width := resolveSupportingOrderResultTableColumnWidth(contentWidth, columns, index)
		textValue := "-"
		if index < len(row.Values) && strings.TrimSpace(row.Values[index]) != "" {
			textValue = sanitizePDFSingleLineText(row.Values[index])
		}
		height := measureInitialAssessmentTextRowHeight(pdf, textValue, width-3, 8.5, 4)
		if height > maxHeight {
			maxHeight = height
		}
	}

	return maxHeight + 0.5
}

func resolveSupportingOrderResultTableColumnWidth(contentWidth float64, columns []supportingOrderResultTableColumn, index int) float64 {
	if index == len(columns)-1 {
		usedWidth := 0.0
		for i := 0; i < index; i++ {
			usedWidth += contentWidth * columns[i].WidthRatio
		}
		return contentWidth - usedWidth
	}
	return contentWidth * columns[index].WidthRatio
}

func resolveSupportingOrderFlagFillColor(flag string) (int, int, int, bool) {
	switch strings.ToLower(strings.TrimSpace(flag)) {
	case "normal":
		return 235, 247, 237, true
	case "rendah":
		return 255, 248, 225, true
	case "tinggi":
		return 255, 235, 235, true
	case "abnormal":
		return 255, 242, 230, true
	default:
		return 255, 255, 255, false
	}
}

func buildPharmacyTicketEntries(data prescriptionPrintViewData) []pharmacyTicketEntryView {
	entries := make([]pharmacyTicketEntryView, 0, len(data.Items)+len(data.Compounds))

	for _, item := range data.Items {
		entries = append(entries, pharmacyTicketEntryView{
			ItemType:     "Non-Racikan",
			Title:        fallbackText(item.Name),
			QuantityLine: fallbackText(item.QuantityLine),
			RuleLine:     fallbackText(item.RuleLine),
			Instructions: strings.TrimSpace(item.Instructions),
			Notes:        strings.TrimSpace(item.Notes),
		})
	}

	for _, compound := range data.Compounds {
		ingredients := make([]string, 0, len(compound.Ingredients))
		for ingredientIndex, ingredient := range compound.Ingredients {
			label := fmt.Sprintf("%d. %s", ingredientIndex+1, strings.TrimSpace(ingredient.Label))
			if strings.TrimSpace(ingredient.Notes) != "" {
				label += " (" + strings.TrimSpace(ingredient.Notes) + ")"
			}
			ingredients = append(ingredients, label)
		}

		entries = append(entries, pharmacyTicketEntryView{
			ItemType:      "Racikan",
			Title:         fallbackText(compound.Name),
			QuantityLine:  fallbackText(compound.OutputLine),
			RuleLine:      fallbackText(compound.RuleLine),
			Instructions:  strings.TrimSpace(compound.Instructions),
			Notes:         strings.TrimSpace(compound.Notes),
			IngredientSet: ingredients,
		})
	}

	return entries
}

func buildSupportingOrderSectionSubtitle(visitNumber string, itemTitle string) string {
	parts := []string{strings.TrimSpace(visitNumber), strings.TrimSpace(itemTitle)}
	filtered := make([]string, 0, len(parts))
	for _, part := range parts {
		if part != "" {
			filtered = append(filtered, part)
		}
	}
	if len(filtered) == 0 {
		return "-"
	}
	return strings.Join(filtered, " - ")
}

func resolveLaboratoryItemTitle(item models.LaboratoryOrderItem) string {
	return fallbackText(firstNonEmpty(item.TestNameSnapshot, item.MedicalService.Name))
}

func resolveRadiologyItemTitle(item models.RadiologyOrderItem) string {
	return fallbackText(firstNonEmpty(item.ServiceNameSnapshot, item.MedicalService.Name))
}

func buildLaboratoryTicketDocumentFields(data orderPrintBaseViewData, visit models.Visit, item models.LaboratoryOrderItem, itemIndex int, totalItems int) []initialAssessmentPrintField {
	return buildSupportingTicketDocumentFields(
		data,
		visit,
		"Tiket Laboratorium",
		supportingOrderWorkflowStatusLabel(data.Record.LaboratoryWorkflowStatus),
		data.Record.LaboratoryOrderedAt,
		resolveLaboratoryItemTitle(item),
		item.TestCodeSnapshot,
		itemIndex,
		totalItems,
	)
}

func buildLaboratoryResultDocumentFields(data orderPrintBaseViewData, visit models.Visit, item models.LaboratoryOrderItem, itemIndex int, totalItems int) []initialAssessmentPrintField {
	return buildSupportingResultDocumentFields(
		data,
		visit,
		"Hasil Laboratorium",
		supportingOrderWorkflowStatusLabel(data.Record.LaboratoryWorkflowStatus),
		data.Record.LaboratoryOrderedAt,
		item.ResultDate,
		resolveLaboratoryItemTitle(item),
		item.TestCodeSnapshot,
		itemIndex,
		totalItems,
		resolveLaboratoryItemResultUserName(item),
	)
}

func buildRadiologyTicketDocumentFields(data orderPrintBaseViewData, visit models.Visit, item models.RadiologyOrderItem, itemIndex int, totalItems int) []initialAssessmentPrintField {
	return buildSupportingTicketDocumentFields(
		data,
		visit,
		"Tiket Radiologi",
		supportingOrderWorkflowStatusLabel(data.Record.RadiologyWorkflowStatus),
		data.Record.RadiologyOrderedAt,
		resolveRadiologyItemTitle(item),
		item.ServiceCodeSnapshot,
		itemIndex,
		totalItems,
	)
}

func buildRadiologyResultDocumentFields(data orderPrintBaseViewData, visit models.Visit, item models.RadiologyOrderItem, itemIndex int, totalItems int) []initialAssessmentPrintField {
	return buildSupportingResultDocumentFields(
		data,
		visit,
		"Hasil Radiologi",
		supportingOrderWorkflowStatusLabel(data.Record.RadiologyWorkflowStatus),
		data.Record.RadiologyOrderedAt,
		item.ResultDate,
		resolveRadiologyItemTitle(item),
		item.ServiceCodeSnapshot,
		itemIndex,
		totalItems,
		resolveRadiologyItemResultUserName(item),
	)
}

func resolveLaboratoryParameterName(parameter models.LaboratoryOrderParameterResult) string {
	if strings.TrimSpace(parameter.ParameterNameSnapshot) != "" {
		return strings.TrimSpace(parameter.ParameterNameSnapshot)
	}
	if parameter.MedicalServiceParameter != nil && strings.TrimSpace(parameter.MedicalServiceParameter.Name) != "" {
		return strings.TrimSpace(parameter.MedicalServiceParameter.Name)
	}
	return "-"
}

func resolveRadiologyParameterName(parameter models.RadiologyOrderParameterResult) string {
	if strings.TrimSpace(parameter.ParameterNameSnapshot) != "" {
		return strings.TrimSpace(parameter.ParameterNameSnapshot)
	}
	if parameter.MedicalServiceParameter != nil && strings.TrimSpace(parameter.MedicalServiceParameter.Name) != "" {
		return strings.TrimSpace(parameter.MedicalServiceParameter.Name)
	}
	return "-"
}

func addOrderPrintSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, leftLabel string, leftName string, rightLabel string, rightName string) {
	addOrderPrintSignatureSectionWithDualTTE(pdf, hospitalInfo, generatedAt, leftLabel, leftName, nil, rightLabel, rightName, nil)
}

func addOrderPrintSignatureSectionWithTTE(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, leftLabel string, leftName string, rightLabel string, rightName string, rightSignature *ttePrintSignatureInfo) {
	addOrderPrintSignatureSectionWithDualTTE(pdf, hospitalInfo, generatedAt, leftLabel, leftName, nil, rightLabel, rightName, rightSignature)
}

func addOrderPrintSignatureSectionWithDualTTE(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, leftLabel string, leftName string, leftSignature *ttePrintSignatureInfo, rightLabel string, rightName string, rightSignature *ttePrintSignatureInfo) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columnGap := 12.0
	columnWidth := (contentWidth - columnGap) / 2
	requiresQRCodeSpace := hasTTEQRCode(leftSignature) || hasTTEQRCode(rightSignature)
	requiredHeight := 40.0
	if requiresQRCodeSpace {
		requiredHeight = 52.0 + maxFloat64(resolveTTESignatureAnnotationReservedHeight(columnWidth, leftSignature), resolveTTESignatureAnnotationReservedHeight(columnWidth, rightSignature))
	}
	ensureInitialAssessmentPDFSpace(pdf, requiredHeight)
	leftColumnX := left
	rightColumnX := left + columnWidth + columnGap
	currentY := pdf.GetY() + 4

	datePrefix := strings.TrimSpace(hospitalInfo.City)
	dateLabel := formatDateIndonesian(resolveTTEPrintSignatureTime(firstNonNilTTESignature(rightSignature, leftSignature), generatedAt))
	if datePrefix != "" {
		dateLabel = datePrefix + ", " + dateLabel
	}

	pdf.SetFont("Arial", "", 10)
	pdf.SetXY(rightColumnX, currentY)
	pdf.CellFormat(columnWidth, 5, dateLabel, "", 1, "C", false, 0, "")

	currentY = pdf.GetY() + 3
	pdf.SetXY(leftColumnX, currentY)
	pdf.CellFormat(columnWidth, 5, fallbackText(leftLabel), "", 0, "C", false, 0, "")
	pdf.SetXY(rightColumnX, currentY)
	pdf.CellFormat(columnWidth, 5, fallbackText(rightLabel), "", 1, "C", false, 0, "")
	annotationY := currentY + 5.2
	drawTTESignatureAnnotation(pdf, leftColumnX, annotationY, columnWidth, leftSignature)
	drawTTESignatureAnnotation(pdf, rightColumnX, annotationY, columnWidth, rightSignature)

	lineWidth := minFloat64(52, columnWidth-26)
	leftLineX := leftColumnX + ((columnWidth - lineWidth) / 2)
	rightLineX := rightColumnX + ((columnWidth - lineWidth) / 2)
	signatureLineY := pdf.GetY() + 16.0
	if requiresQRCodeSpace {
		signatureLineY = annotationY + maxFloat64(resolveTTESignatureAnnotationReservedHeight(columnWidth, leftSignature), resolveTTESignatureAnnotationReservedHeight(columnWidth, rightSignature)) + 0.55
	}
	pdf.SetDrawColor(60, 60, 60)
	pdf.Line(leftLineX, signatureLineY, leftLineX+lineWidth, signatureLineY)
	pdf.Line(rightLineX, signatureLineY, rightLineX+lineWidth, signatureLineY)

	pdf.SetFont("Arial", "B", 10)
	pdf.SetY(signatureLineY + 2.5)
	pdf.SetXY(leftColumnX, pdf.GetY())
	pdf.CellFormat(columnWidth, 5, fallbackText(resolveTTEPrintSignatureName(leftSignature, leftName)), "", 0, "C", false, 0, "")
	pdf.SetXY(rightColumnX, pdf.GetY())
	pdf.CellFormat(columnWidth, 5, fallbackText(resolveTTEPrintSignatureName(rightSignature, rightName)), "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 9)
	pdf.SetY(pdf.GetY() + 4)
}

func firstNonNilTTESignature(values ...*ttePrintSignatureInfo) *ttePrintSignatureInfo {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func resolveOrderDateLabel(value *time.Time, fallback time.Time) string {
	if value != nil && !value.IsZero() {
		return formatDateTimeIndonesian(*value)
	}
	if fallback.IsZero() {
		return "-"
	}
	return formatDateTimeIndonesian(fallback)
}

func prescriptionWorkflowStatusLabel(value string) string {
	switch normalizePrescriptionWorkflowStatus(value) {
	case prescriptionWorkflowStatusDraft:
		return "Draft"
	case prescriptionWorkflowStatusOrdered:
		return "Ordered"
	case prescriptionWorkflowStatusPreparing:
		return "Preparing"
	case prescriptionWorkflowStatusReady:
		return "Ready"
	case prescriptionWorkflowStatusDispensed:
		return "Dispensed"
	case prescriptionWorkflowStatusPrinted:
		return "Printed"
	default:
		return "-"
	}
}

func supportingOrderWorkflowStatusLabel(value string) string {
	switch normalizeSupportingOrderWorkflowStatus(value) {
	case supportingOrderWorkflowStatusDraft:
		return "Draft"
	case supportingOrderWorkflowStatusOrdered:
		return "Ordered"
	case supportingOrderWorkflowStatusPreparing:
		return "Preparing"
	case supportingOrderWorkflowStatusCompleted:
		return "Completed"
	default:
		return "-"
	}
}

func resolveLaboratoryProcessorName(record models.MedicalRecord) string {
	if record.LaboratoryProcessor != nil && strings.TrimSpace(record.LaboratoryProcessor.FullName) != "" {
		return strings.TrimSpace(record.LaboratoryProcessor.FullName)
	}

	names := make([]string, 0, len(record.LaboratoryOrderItems))
	for _, item := range record.LaboratoryOrderItems {
		if name := resolveLaboratoryItemResultUserName(item); name != "" {
			names = append(names, name)
		}
	}

	return joinUniqueNonEmpty(names)
}

func resolveRadiologyProcessorName(record models.MedicalRecord) string {
	if record.RadiologyProcessor != nil && strings.TrimSpace(record.RadiologyProcessor.FullName) != "" {
		return strings.TrimSpace(record.RadiologyProcessor.FullName)
	}

	names := make([]string, 0, len(record.RadiologyOrderItems))
	for _, item := range record.RadiologyOrderItems {
		if name := resolveRadiologyItemResultUserName(item); name != "" {
			names = append(names, name)
		}
	}

	return joinUniqueNonEmpty(names)
}

func resolveLaboratoryItemResultUserName(item models.LaboratoryOrderItem) string {
	if item.ResultByUser != nil && strings.TrimSpace(item.ResultByUser.FullName) != "" {
		return strings.TrimSpace(item.ResultByUser.FullName)
	}

	names := make([]string, 0, len(item.ParameterResults))
	for _, parameter := range item.ParameterResults {
		if parameter.ResultByUser != nil && strings.TrimSpace(parameter.ResultByUser.FullName) != "" {
			names = append(names, strings.TrimSpace(parameter.ResultByUser.FullName))
		}
	}

	return joinUniqueNonEmpty(names)
}

func resolveRadiologyItemResultUserName(item models.RadiologyOrderItem) string {
	if item.ResultByUser != nil && strings.TrimSpace(item.ResultByUser.FullName) != "" {
		return strings.TrimSpace(item.ResultByUser.FullName)
	}

	names := make([]string, 0, len(item.ParameterResults))
	for _, parameter := range item.ParameterResults {
		if parameter.ResultByUser != nil && strings.TrimSpace(parameter.ResultByUser.FullName) != "" {
			names = append(names, strings.TrimSpace(parameter.ResultByUser.FullName))
		}
	}

	return joinUniqueNonEmpty(names)
}

func joinUniqueNonEmpty(values []string) string {
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, trimmed)
	}
	return strings.Join(unique, ", ")
}
