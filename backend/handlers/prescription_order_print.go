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

type prescriptionPrintItemView struct {
	Name         string
	QuantityLine string
	RuleLine     string
	Dosage       string
	Frequency    string
	Duration     string
	Route        string
	Instructions string
	Notes        string
}

type prescriptionPrintCompoundIngredientView struct {
	Label string
	Notes string
}

type prescriptionPrintCompoundView struct {
	Name         string
	OutputLine   string
	RuleLine     string
	Dosage       string
	Frequency    string
	Duration     string
	Route        string
	Instructions string
	Notes        string
	Ingredients  []prescriptionPrintCompoundIngredientView
}

type prescriptionPrintMedicationTableRow struct {
	Values []string
}

type prescriptionPrintViewData struct {
	GeneratedAt       time.Time
	Record            models.MedicalRecord
	PatientAge        string
	PatientAddress    string
	ModeLabel         string
	BatchNotes        string
	Items             []prescriptionPrintItemView
	Compounds         []prescriptionPrintCompoundView
	PrintedBy         string
	ValidationBaseURL string
}

func PrintPrescriptionOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	var record models.MedicalRecord
	if err := preloadMedicalRecordRelations(database.DB).
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Doctor").
		Preload("Visit.Polyclinic").
		First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri resep tidak ditemukan"})
		return
	}

	if normalizeMedicalRecordSection(record.SectionType) != "prescription" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cetak resep hanya tersedia pada entri resep"})
		return
	}
	if countPrescriptionOrderLines(record) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Entri resep belum memiliki item obat"})
		return
	}

	viewData := buildPrescriptionPrintViewData(c, record)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderPrescriptionOrderPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF resep"})
		return
	}

	if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) == prescriptionFulfillmentModePrint && normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) == prescriptionWorkflowStatusDraft {
		now := time.Now()
		_ = database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
			"prescription_workflow_status": prescriptionWorkflowStatusPrinted,
			"prescription_processed_at":    &now,
		}).Error
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func buildPrescriptionPrintViewData(c *gin.Context, record models.MedicalRecord) prescriptionPrintViewData {
	items := make([]prescriptionPrintItemView, 0, len(record.Prescriptions))
	for _, item := range record.Prescriptions {
		quantityLine := fmt.Sprintf("%d %s", item.Quantity, fallbackText(item.Medicine.Unit.Name))
		ruleParts := []string{strings.TrimSpace(item.Dosage), strings.TrimSpace(item.Frequency), strings.TrimSpace(item.Duration)}
		items = append(items, prescriptionPrintItemView{
			Name:         fallbackText(item.Medicine.Name),
			QuantityLine: strings.TrimSpace(quantityLine),
			RuleLine:     strings.Join(filterEmptyStrings(ruleParts), " - "),
			Dosage:       strings.TrimSpace(item.Dosage),
			Frequency:    strings.TrimSpace(item.Frequency),
			Duration:     strings.TrimSpace(item.Duration),
			Route:        strings.TrimSpace(item.Route),
			Instructions: strings.TrimSpace(item.Instructions),
			Notes:        strings.TrimSpace(item.Notes),
		})
	}

	compounds := make([]prescriptionPrintCompoundView, 0, len(record.PrescriptionCompounds))
	for _, compound := range record.PrescriptionCompounds {
		ingredients := make([]prescriptionPrintCompoundIngredientView, 0, len(compound.Items))
		for _, ingredient := range compound.Items {
			ingredientLabel := fmt.Sprintf("%d %s %s", ingredient.Quantity, fallbackText(ingredient.Medicine.Unit.Name), fallbackText(ingredient.Medicine.Name))
			ingredients = append(ingredients, prescriptionPrintCompoundIngredientView{
				Label: strings.TrimSpace(ingredientLabel),
				Notes: strings.TrimSpace(ingredient.Notes),
			})
		}

		ruleParts := []string{strings.TrimSpace(compound.Dosage), strings.TrimSpace(compound.Frequency), strings.TrimSpace(compound.Duration)}
		outputLine := fmt.Sprintf("%d %s", compound.OutputQuantity, fallbackText(compound.OutputUnit))
		if strings.TrimSpace(compound.PreparationType) != "" {
			outputLine = strings.TrimSpace(outputLine + " - " + compound.PreparationType)
		}

		compounds = append(compounds, prescriptionPrintCompoundView{
			Name:         fallbackText(compound.Name),
			OutputLine:   strings.TrimSpace(outputLine),
			RuleLine:     strings.Join(filterEmptyStrings(ruleParts), " - "),
			Dosage:       strings.TrimSpace(compound.Dosage),
			Frequency:    strings.TrimSpace(compound.Frequency),
			Duration:     strings.TrimSpace(compound.Duration),
			Route:        strings.TrimSpace(compound.Route),
			Instructions: strings.TrimSpace(compound.Instructions),
			Notes:        strings.TrimSpace(compound.Notes),
			Ingredients:  ingredients,
		})
	}

	modeLabel := "Resep Internal"
	if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) == prescriptionFulfillmentModePrint {
		modeLabel = "Resep Luar / Cetak"
	}

	visit := record.Visit
	if visit.ID == 0 {
		visit.Patient = record.Patient
		visit.Doctor = record.Doctor
		visit.Polyclinic = record.Polyclinic
	}

	return prescriptionPrintViewData{
		GeneratedAt:       time.Now(),
		Record:            record,
		PatientAge:        calculatePatientAgeLabel(visit.Patient.BirthDate),
		PatientAddress:    formatPatientAddress(visit.Patient),
		ModeLabel:         modeLabel,
		BatchNotes:        strings.TrimSpace(record.Notes),
		Items:             items,
		Compounds:         compounds,
		PrintedBy:         resolvePrintedByLabel(c),
		ValidationBaseURL: resolveTTEVerificationBaseURLForRequest(c),
	}
}

func renderPrescriptionOrderPDF(hospitalInfo initialAssessmentHospitalInfo, data prescriptionPrintViewData) ([]byte, string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)
	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle(sanitizePDFText("Resep & Terapi"), false)
	pdf.SetAuthor(sanitizePDFText(data.PrintedBy), false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetHeaderFuncMode(func() {
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, "RESEP & TERAPI", fallbackText(data.Record.Visit.VisitNumber))
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

	addInitialAssessmentCompactFieldSection(pdf, "INFORMASI RESEP", []initialAssessmentPrintField{
		{Label: "Mode Pemenuhan", Value: data.ModeLabel},
		{Label: "No. Kunjungan", Value: fallbackText(data.Record.Visit.VisitNumber)},
		{Label: "Tanggal Kunjungan", Value: formatDateIndonesian(data.Record.Visit.VisitDate)},
		{Label: "Dokter", Value: fallbackText(data.Record.Visit.Doctor.FullName)},
		{Label: "Poliklinik", Value: fallbackText(data.Record.Visit.Polyclinic.Name)},
		{Label: "Tanggal Cetak", Value: formatDateTimeIndonesian(data.GeneratedAt)},
	}, "")

	addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", []initialAssessmentPrintField{
		{Label: "Nama Pasien", Value: fallbackText(data.Record.Visit.Patient.FullName)},
		{Label: "No. RM", Value: fallbackText(data.Record.Visit.Patient.MedicalRecordNumber)},
		{Label: "Umur", Value: fallbackText(data.PatientAge)},
		{Label: "Alamat", Value: fallbackText(data.PatientAddress)},
	}, "")

	addPrescriptionMedicationTable(pdf, buildPrescriptionMedicationTableRows(data))
	if len(data.Compounds) > 0 {
		addPrescriptionCompoundCompositionSection(pdf, data.Compounds)
	}

	if data.BatchNotes != "" {
		addInitialAssessmentSectionSpacing(pdf)
		addInitialAssessmentSectionTitle(pdf, "CATATAN RESEP")
		addInitialAssessmentFullWidthRow(pdf, data.BatchNotes, false)
	}

	addInitialAssessmentSectionSpacing(pdf)
	addPrescriptionSignatureSection(pdf, hospitalInfo, data)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("resep-%s-%s.pdf", sanitizePDFFileName(data.Record.Visit.Patient.FullName), sanitizePDFFileName(data.Record.Visit.VisitNumber))
	return output.Bytes(), fileName, nil
}

func addPrescriptionMedicationTable(pdf *gofpdf.Fpdf, rows []prescriptionPrintMedicationTableRow) {
	columns := []supportingOrderResultTableColumn{
		{Title: "Jenis", WidthRatio: 0.09, Align: "L"},
		{Title: "Item Obat", WidthRatio: 0.20, Align: "L"},
		{Title: "Qty", WidthRatio: 0.11, Align: "L"},
		{Title: "Dosis", WidthRatio: 0.11, Align: "L"},
		{Title: "Frekuensi", WidthRatio: 0.14, Align: "L"},
		{Title: "Durasi", WidthRatio: 0.10, Align: "L"},
		{Title: "Rute", WidthRatio: 0.10, Align: "L"},
		{Title: "Keterangan", WidthRatio: 0.15, Align: "L"},
	}

	resultRows := make([]supportingOrderResultTableRow, 0, len(rows))
	for _, row := range rows {
		resultRows = append(resultRows, supportingOrderResultTableRow{Values: row.Values})
	}

	addSupportingOrderResultTable(pdf, "DAFTAR OBAT", columns, resultRows, "Tidak ada item obat.")
}

func buildPrescriptionMedicationTableRows(data prescriptionPrintViewData) []prescriptionPrintMedicationTableRow {
	rows := make([]prescriptionPrintMedicationTableRow, 0, len(data.Items)+len(data.Compounds))

	for _, item := range data.Items {
		rows = append(rows, prescriptionPrintMedicationTableRow{
			Values: []string{
				"Non-R",
				fallbackText(item.Name),
				fallbackText(item.QuantityLine),
				fallbackText(item.Dosage),
				fallbackText(item.Frequency),
				fallbackText(item.Duration),
				fallbackText(item.Route),
				buildPrescriptionMedicationDetail(item.Instructions),
			},
		})
	}

	for _, compound := range data.Compounds {
		rows = append(rows, prescriptionPrintMedicationTableRow{
			Values: []string{
				"R",
				fallbackText(compound.Name),
				fallbackText(compound.OutputLine),
				fallbackText(compound.Dosage),
				fallbackText(compound.Frequency),
				fallbackText(compound.Duration),
				fallbackText(compound.Route),
				buildPrescriptionCompoundDetail(compound),
			},
		})
	}

	return rows
}

func buildPrescriptionMedicationDetail(instructions string) string {
	parts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(instructions); trimmed != "" {
		parts = append(parts, trimmed)
	}
	return firstNonEmpty(strings.Join(parts, ""), "-")
}

func buildPrescriptionCompoundDetail(compound prescriptionPrintCompoundView) string {
	parts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(compound.Instructions); trimmed != "" {
		parts = append(parts, trimmed)
	}
	if trimmed := strings.TrimSpace(compound.Notes); trimmed != "" {
		parts = append(parts, trimmed)
	}
	return firstNonEmpty(strings.Join(parts, " | "), "-")
}

func buildPrescriptionCompoundComposition(ingredients []prescriptionPrintCompoundIngredientView) string {
	labels := make([]string, 0, len(ingredients))
	for _, ingredient := range ingredients {
		label := strings.TrimSpace(ingredient.Label)
		if label == "" {
			continue
		}
		if strings.TrimSpace(ingredient.Notes) != "" {
			label += " (" + strings.TrimSpace(ingredient.Notes) + ")"
		}
		labels = append(labels, label)
	}
	return strings.Join(labels, "; ")
}

func addPrescriptionCompoundCompositionSection(pdf *gofpdf.Fpdf, compounds []prescriptionPrintCompoundView) {
	addInitialAssessmentSectionSpacing(pdf)
	addInitialAssessmentSectionTitle(pdf, "DETAIL RACIKAN")

	for index, compound := range compounds {
		if index > 0 {
			addInitialAssessmentSectionSpacing(pdf)
		}

		addInitialAssessmentFullWidthRow(pdf, fallbackText(compound.Name), true)
		addInitialAssessmentKeyValueRow(pdf, "Hasil Jadi", fallbackText(compound.OutputLine))
		if composition := buildPrescriptionCompoundComposition(compound.Ingredients); composition != "" {
			addInitialAssessmentKeyValueRow(pdf, "Komposisi", composition)
		}
		if strings.TrimSpace(compound.Instructions) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Instruksi", compound.Instructions)
		}
		if strings.TrimSpace(compound.Notes) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Catatan", compound.Notes)
		}
	}
}

func addPrescriptionSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, data prescriptionPrintViewData) {
	tteSignature := loadTTESignedSignatureByDocumentKeyWithBaseURL(fmt.Sprintf("prescription:%d", data.Record.ID), data.ValidationBaseURL)
	addOrderPrintSignatureSectionWithTTE(pdf, hospitalInfo, data.GeneratedAt, "Pasien / Wali", data.Record.Visit.Patient.FullName, "Dokter Pemeriksa", data.Record.Visit.Doctor.FullName, tteSignature)
}

func filterEmptyStrings(values []string) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		filtered = append(filtered, strings.TrimSpace(value))
	}
	return filtered
}
