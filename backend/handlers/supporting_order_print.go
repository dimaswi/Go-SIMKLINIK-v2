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
	GeneratedAt time.Time
	Record      models.MedicalRecord
	PrintedBy   string
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

	viewData := buildPrescriptionPrintViewData(c, record)
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
		GeneratedAt: time.Now(),
		Record:      record,
		PrintedBy:   strings.TrimSpace(c.GetString("email")),
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

func renderPharmacyTicketPDF(hospitalInfo initialAssessmentHospitalInfo, data prescriptionPrintViewData) ([]byte, string, error) {
	visit := resolvePrintVisit(data.Record)
	pdf := newInitialAssessmentStyledPDF("TIKET FARMASI", data.PrintedBy, data.GeneratedAt)
	entries := buildPharmacyTicketEntries(data)

	for index, entry := range entries {
		beginInitialAssessmentStyledSection(pdf, hospitalInfo, "ETIKET FARMASI", buildSupportingOrderSectionSubtitle(visit.VisitNumber, entry.Title))
		addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", buildPharmacyTicketDocumentFields(visit, data, entry, index+1, len(entries)), "")
		addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", buildSupportingOrderPatientFields(visit.Patient), "Data pasien tidak tersedia.")
		addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", buildInitialAssessmentVisitFields(visit), "Data kunjungan tidak tersedia.")
		addPharmacyTicketItemSection(pdf, entry)

		if strings.TrimSpace(data.BatchNotes) != "" {
			addInitialAssessmentSectionTitle(pdf, "CATATAN RESEP")
			addInitialAssessmentFullWidthRow(pdf, data.BatchNotes, false)
			addInitialAssessmentSectionSpacing(pdf)
		}

		addOrderPrintSignatureSection(pdf, hospitalInfo, data.GeneratedAt, "Petugas Cetak", data.PrintedBy, "Dokter Pemeriksa", visit.Doctor.FullName)
	}

	pdfBytes, err := outputInitialAssessmentStyledPDF(pdf)
	if err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("tiket-farmasi-%s-%s.pdf", sanitizePDFFileName(visit.Patient.FullName), sanitizePDFFileName(visit.VisitNumber))
	return pdfBytes, fileName, nil
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

	for index, item := range data.Record.LaboratoryOrderItems {
		beginInitialAssessmentStyledSection(pdf, hospitalInfo, "HASIL LABORATORIUM", buildSupportingOrderSectionSubtitle(visit.VisitNumber, resolveLaboratoryItemTitle(item)))
		addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", buildLaboratoryResultDocumentFields(data, visit, item, index+1, len(data.Record.LaboratoryOrderItems)), "")
		addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", buildSupportingOrderPatientFields(visit.Patient), "Data pasien tidak tersedia.")
		addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", buildInitialAssessmentVisitFields(visit), "Data kunjungan tidak tersedia.")
		addLaboratoryResultItemSection(pdf, item)
		addOrderPrintSignatureSection(pdf, hospitalInfo, data.GeneratedAt, "Petugas Laboratorium", resolveLaboratoryItemResultUserName(item), "Dokter Pemeriksa", visit.Doctor.FullName)
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

	for index, item := range data.Record.RadiologyOrderItems {
		beginInitialAssessmentStyledSection(pdf, hospitalInfo, "HASIL RADIOLOGI", buildSupportingOrderSectionSubtitle(visit.VisitNumber, resolveRadiologyItemTitle(item)))
		addInitialAssessmentCompactFieldSection(pdf, "INFORMASI DOKUMEN", buildRadiologyResultDocumentFields(data, visit, item, index+1, len(data.Record.RadiologyOrderItems)), "")
		addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", buildSupportingOrderPatientFields(visit.Patient), "Data pasien tidak tersedia.")
		addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", buildInitialAssessmentVisitFields(visit), "Data kunjungan tidak tersedia.")
		addRadiologyResultItemSection(pdf, item)
		addOrderPrintSignatureSection(pdf, hospitalInfo, data.GeneratedAt, "Petugas Radiologi", resolveRadiologyItemResultUserName(item), "Dokter Pemeriksa", visit.Doctor.FullName)
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
				{Title: "Parameter", WidthRatio: 0.21, Align: "L"},
				{Title: "Hasil", WidthRatio: 0.79, Align: "L"},
			},
			buildRadiologyResultTableRows(item.ParameterResults),
			"Belum ada hasil parameter radiologi.",
		)
	} else {
		addInitialAssessmentKeyValueRow(pdf, "Temuan", fallbackText(item.Findings))
		addInitialAssessmentKeyValueRow(pdf, "Kesan", fallbackText(item.Impression))
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
	ensureInitialAssessmentPDFSpace(pdf, 40)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columnGap := 12.0
	columnWidth := (contentWidth - columnGap) / 2
	leftColumnX := left
	rightColumnX := left + columnWidth + columnGap
	currentY := pdf.GetY() + 4

	datePrefix := strings.TrimSpace(hospitalInfo.City)
	dateLabel := formatDateIndonesian(generatedAt)
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
	pdf.CellFormat(columnWidth, 5, fallbackText(leftName), "", 0, "C", false, 0, "")
	pdf.SetXY(rightColumnX, pdf.GetY())
	pdf.CellFormat(columnWidth, 5, fallbackText(rightName), "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 9)
	pdf.SetY(pdf.GetY() + 4)
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
