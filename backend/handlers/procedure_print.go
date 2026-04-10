package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"gorm.io/gorm"
)

type procedurePrintActionView struct {
	Title         string
	Code          string
	Domain        string
	TargetScope   string
	QuantityLabel string
	PriceLabel    string
	TotalLabel    string
	Notes         string
	Targets       []string
	Parameters    []initialAssessmentPrintField
}

type procedurePrintViewData struct {
	GeneratedAt     time.Time
	Record          models.MedicalRecord
	Visit           models.Visit
	PatientFields   []initialAssessmentPrintField
	VisitFields     []initialAssessmentPrintField
	EntryFields     []initialAssessmentPrintField
	Actions         []procedurePrintActionView
	EntryNotes      string
	OdontogramEntry *models.OdontogramEntry
}

func PrintProcedureRecord(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	record, err := loadProcedureRecord(uint(recordID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri tindakan tidak ditemukan"})
		return
	}

	if message, ok := ensureProcedurePrintable(record); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}

	odontogramEntry, err := findLatestProcedureOdontogramEntry(record)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat odontogram tindakan"})
		return
	}

	viewData := buildProcedurePrintViewData(c, record, odontogramEntry)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderProcedurePrintPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF tindakan"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func loadProcedureRecord(recordID uint) (models.MedicalRecord, error) {
	var record models.MedicalRecord
	err := preloadMedicalRecordRelations(database.DB).
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Doctor").
		Preload("Visit.Polyclinic").
		First(&record, recordID).Error
	return record, err
}

func ensureProcedurePrintable(record models.MedicalRecord) (string, bool) {
	if normalizeMedicalRecordSection(record.SectionType) != "procedure" {
		return "Aksi ini hanya tersedia pada entri tindakan", false
	}
	if len(record.Actions) == 0 {
		return "Entri tindakan belum memiliki item tindakan", false
	}
	return "", true
}

func findLatestProcedureOdontogramEntry(record models.MedicalRecord) (*models.OdontogramEntry, error) {
	if !procedureRecordNeedsOdontogram(record) {
		return nil, nil
	}

	var entry models.OdontogramEntry
	err := preloadOdontogramEntryRelations(database.DB).
		Where("visit_id = ?", record.VisitID).
		Where("status <> ?", odontogramStatusCancel).
		Order("updated_at DESC").
		Order("created_at DESC").
		First(&entry).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &entry, nil
}

func procedureRecordNeedsOdontogram(record models.MedicalRecord) bool {
	for _, action := range record.Actions {
		if normalizeProcedureDomainValue(firstNonEmpty(action.MedicalService.ServiceDomain, action.ServiceDomainSnapshot)) == "dental" {
			return true
		}
		for _, target := range action.Targets {
			switch normalizeProcedureTargetType(target.TargetType) {
			case "full_mouth", "arch", "quadrant", "tooth", "surface":
				return true
			}
		}
	}
	return false
}

func buildProcedurePrintViewData(c *gin.Context, record models.MedicalRecord, odontogramEntry *models.OdontogramEntry) procedurePrintViewData {
	visit := resolvePrintVisit(record)
	printedBy := strings.TrimSpace(c.GetString("email"))

	return procedurePrintViewData{
		GeneratedAt:   time.Now(),
		Record:        record,
		Visit:         visit,
		PatientFields: buildSupportingOrderPatientFields(visit.Patient),
		VisitFields: []initialAssessmentPrintField{
			{Label: "No. Kunjungan", Value: fallbackText(visit.VisitNumber)},
			{Label: "Tanggal Kunjungan", Value: formatDatePointer(&visit.VisitDate)},
			{Label: "Poliklinik", Value: fallbackText(visit.Polyclinic.Name)},
			{Label: "Dokter", Value: fallbackText(visit.Doctor.FullName)},
		},
		EntryFields: []initialAssessmentPrintField{
			{Label: "Jenis Dokumen", Value: "Lembar Tindakan"},
			{Label: "Tanggal Entri", Value: formatDateTimeIndonesian(record.RecordDate)},
			{Label: "Status Entri", Value: procedureRecordStatusLabel(record.Status)},
			{Label: "Jumlah Item", Value: fmt.Sprintf("%d tindakan", len(record.Actions))},
			{Label: "Petugas Cetak", Value: fallbackText(printedBy)},
		},
		Actions:         buildProcedurePrintActionViews(record.Actions),
		EntryNotes:      strings.TrimSpace(record.Notes),
		OdontogramEntry: odontogramEntry,
	}
}

func buildProcedurePrintActionViews(actions []models.MedicalAction) []procedurePrintActionView {
	views := make([]procedurePrintActionView, 0, len(actions))
	for _, action := range actions {
		serviceCode := firstNonEmpty(strings.TrimSpace(action.MedicalService.Code), strings.TrimSpace(action.ServiceCodeSnapshot))
		serviceName := firstNonEmpty(strings.TrimSpace(action.MedicalService.Name), strings.TrimSpace(action.ServiceNameSnapshot))
		domain := normalizeProcedureDomainValue(firstNonEmpty(action.MedicalService.ServiceDomain, action.ServiceDomainSnapshot))
		targetScope := firstNonEmpty(strings.TrimSpace(action.MedicalService.TargetScope), strings.TrimSpace(action.TargetScopeSnapshot))
		quantity := maxInt(action.Quantity, 1)

		views = append(views, procedurePrintActionView{
			Title:         fallbackText(serviceName),
			Code:          fallbackText(serviceCode),
			Domain:        procedureDomainLabel(domain),
			TargetScope:   procedureTargetTypeLabel(targetScope),
			QuantityLabel: fmt.Sprintf("%d", quantity),
			PriceLabel:    formatProcedureCurrency(action.Price),
			TotalLabel:    formatProcedureCurrency(action.Price * float64(quantity)),
			Notes:         strings.TrimSpace(action.Notes),
			Targets:       buildProcedureTargetLines(action),
			Parameters:    buildProcedureParameterFields(action.ParameterValues),
		})
	}
	return views
}

func renderProcedurePrintPDF(hospitalInfo initialAssessmentHospitalInfo, data procedurePrintViewData) ([]byte, string, error) {
	pdf := newInitialAssessmentStyledPDF("Lembar Tindakan", "SIMKLINIK", data.GeneratedAt)
	beginInitialAssessmentStyledSection(pdf, hospitalInfo, "TINDAKAN", fallbackText(data.Visit.VisitNumber))

	addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", data.PatientFields, "Data pasien tidak tersedia.")
	addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", data.VisitFields, "Data kunjungan tidak tersedia.")
	addInitialAssessmentCompactFieldSection(pdf, "DATA ENTRI TINDAKAN", data.EntryFields, "Data entri tindakan tidak tersedia.")
	addProcedurePrintActionsSection(pdf, data.Actions)

	if data.EntryNotes != "" {
		addInitialAssessmentFieldSection(pdf, "CATATAN ENTRI", []initialAssessmentPrintField{{Label: "Catatan", Value: data.EntryNotes}}, "Tidak ada catatan entri tindakan.")
	}

	if data.OdontogramEntry != nil {
		addProcedureOdontogramSection(pdf, *data.OdontogramEntry)
	}

	addProcedurePrintSignatureSection(pdf, hospitalInfo, data)
	pdfBytes, err := outputInitialAssessmentStyledPDF(pdf)
	if err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("tindakan-%s-%s.pdf", sanitizePDFFileName(data.Visit.Patient.FullName), sanitizePDFFileName(data.Visit.VisitNumber))
	return pdfBytes, fileName, nil
}

func addProcedurePrintActionsSection(pdf *gofpdf.Fpdf, actions []procedurePrintActionView) {
	addInitialAssessmentSectionTitle(pdf, "TINDAKAN YANG DIKERJAKAN")
	if len(actions) == 0 {
		addInitialAssessmentFullWidthRow(pdf, "Belum ada item tindakan pada entri ini.", false)
		addInitialAssessmentSectionSpacing(pdf)
		return
	}

	for index, action := range actions {
		addInitialAssessmentFullWidthRow(pdf, fmt.Sprintf("%d. %s", index+1, action.Title), true)
		addInitialAssessmentKeyValueRow(pdf, "Kode Layanan", action.Code)
		addInitialAssessmentKeyValueRow(pdf, "Domain", action.Domain)
		addInitialAssessmentKeyValueRow(pdf, "Cakupan Target", action.TargetScope)
		addInitialAssessmentKeyValueRow(pdf, "Jumlah", action.QuantityLabel)
		addInitialAssessmentKeyValueRow(pdf, "Tarif Satuan", action.PriceLabel)
		addInitialAssessmentKeyValueRow(pdf, "Total", action.TotalLabel)
		if len(action.Targets) > 0 {
			addInitialAssessmentKeyValueRow(pdf, "Pekerjaan / Target", strings.Join(action.Targets, "\n"))
		}
		if action.Notes != "" {
			addInitialAssessmentKeyValueRow(pdf, "Catatan Tindakan", action.Notes)
		}
		for _, parameter := range action.Parameters {
			addInitialAssessmentKeyValueRow(pdf, parameter.Label, parameter.Value)
		}
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addProcedureOdontogramSection(pdf *gofpdf.Fpdf, entry models.OdontogramEntry) {
	addInitialAssessmentSectionTitle(pdf, "ODONTOGRAM TERKAIT")
	addInitialAssessmentCompactFieldSection(pdf, "RINGKASAN ODONTOGRAM", []initialAssessmentPrintField{
		{Label: "Jenis Chart", Value: fallbackText(entry.ChartType)},
		{Label: "Status", Value: odontogramStatusLabel(entry.Status)},
		{Label: "Update Terakhir", Value: formatDateTimeIndonesian(entry.UpdatedAt)},
		{Label: "Ringkasan", Value: buildProcedureOdontogramSummary(entry)},
	}, "Data odontogram tidak tersedia.")

	toothMap := make(map[string]models.OdontogramTooth, len(entry.Teeth))
	for _, tooth := range entry.Teeth {
		toothMap[tooth.ToothNumber] = tooth
	}

	rowDefs := map[string][]odontogramPrintToothDef{
		"permanent_upper": {},
		"primary_upper":   {},
		"primary_lower":   {},
		"permanent_lower": {},
	}
	for _, def := range odontogramPrintTeethDefinitions {
		rowDefs[def.row] = append(rowDefs[def.row], def)
	}

	chartTopPadding := 3.0
	rowAdvance := odontogramPDFToothSize + odontogramPDFConditionBadgeGap + odontogramPDFConditionBadgeHeight + odontogramPDFToothLabelGap + odontogramPDFToothLabelHeight + odontogramPDFRowGap
	chartNeededHeight := chartTopPadding + odontogramPDFToothLabelHeight + odontogramPDFToothLabelGap + (3 * rowAdvance) + odontogramPDFToothSize + odontogramPDFConditionBadgeGap + odontogramPDFConditionBadgeHeight + odontogramPDFToothLabelGap + odontogramPDFToothLabelHeight + 2
	ensureInitialAssessmentPDFSpace(pdf, chartNeededHeight)

	currentY := pdf.GetY() + chartTopPadding + odontogramPDFToothLabelHeight + odontogramPDFToothLabelGap
	startX := odontogramPDFRowStartX(pdf, 16)
	drawOdontogramPDFRow(pdf, startX, currentY, rowDefs["permanent_upper"], toothMap, true)
	currentY += rowAdvance
	startX = odontogramPDFRowStartX(pdf, 10)
	drawOdontogramPDFRow(pdf, startX, currentY, rowDefs["primary_upper"], toothMap, true)
	currentY += rowAdvance
	startX = odontogramPDFRowStartX(pdf, 10)
	drawOdontogramPDFRow(pdf, startX, currentY, rowDefs["primary_lower"], toothMap, false)
	currentY += rowAdvance
	startX = odontogramPDFRowStartX(pdf, 16)
	drawOdontogramPDFRow(pdf, startX, currentY, rowDefs["permanent_lower"], toothMap, false)
	currentY += odontogramPDFToothSize + odontogramPDFConditionBadgeGap + odontogramPDFConditionBadgeHeight + odontogramPDFToothLabelGap + odontogramPDFToothLabelHeight + 2
	pdf.SetY(currentY)

	if trimmedNotes := strings.TrimSpace(entry.Notes); trimmedNotes != "" {
		addInitialAssessmentKeyValueRow(pdf, "Catatan Odontogram", trimmedNotes)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addProcedurePrintSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, data procedurePrintViewData) {
	ensureInitialAssessmentPDFSpace(pdf, 38)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columnGap := 12.0
	columnWidth := (contentWidth - columnGap) / 2
	leftColumnX := left
	rightColumnX := left + columnWidth + columnGap
	currentY := pdf.GetY() + 4

	locationDateLabel := formatDateIndonesian(data.GeneratedAt)
	if city := strings.TrimSpace(hospitalInfo.City); city != "" {
		locationDateLabel = city + ", " + locationDateLabel
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

func buildProcedureTargetLines(action models.MedicalAction) []string {
	if len(action.Targets) == 0 {
		if normalizeProcedureTargetType(firstNonEmpty(action.MedicalService.TargetScope, action.TargetScopeSnapshot)) == "full_mouth" {
			return []string{"Seluruh mulut"}
		}
		return nil
	}

	lines := make([]string, 0, len(action.Targets))
	for _, target := range action.Targets {
		line := buildProcedureTargetSummary(target)
		if notes := strings.TrimSpace(target.Notes); notes != "" {
			line += " - " + notes
		}
		lines = append(lines, line)
	}
	return lines
}

func buildProcedureTargetSummary(target models.MedicalActionTarget) string {
	switch normalizeProcedureTargetType(target.TargetType) {
	case "full_mouth":
		return "Seluruh mulut"
	case "arch":
		switch strings.TrimSpace(target.Arch) {
		case "upper":
			return "Rahang atas"
		case "lower":
			return "Rahang bawah"
		default:
			return "Rahang"
		}
	case "quadrant":
		switch strings.TrimSpace(target.Quadrant) {
		case "upper_right":
			return "Kuadran kanan atas"
		case "upper_left":
			return "Kuadran kiri atas"
		case "lower_left":
			return "Kuadran kiri bawah"
		case "lower_right":
			return "Kuadran kanan bawah"
		default:
			return "Kuadran"
		}
	case "tooth":
		return "Gigi " + fallbackText(target.ToothNumber)
	case "surface":
		surfaces := make([]string, 0, len(target.SurfaceCodes))
		for _, surfaceCode := range target.SurfaceCodes {
			surfaces = append(surfaces, odontogramSurfaceCodeLabel(surfaceCode))
		}
		if len(surfaces) == 0 {
			return "Gigi " + fallbackText(target.ToothNumber)
		}
		return fmt.Sprintf("Gigi %s - %s", fallbackText(target.ToothNumber), strings.Join(surfaces, ", "))
	default:
		return "Tanpa target"
	}
}

func buildProcedureParameterFields(parameters []models.MedicalActionParameterValue) []initialAssessmentPrintField {
	if len(parameters) == 0 {
		return nil
	}

	sortedParameters := append([]models.MedicalActionParameterValue(nil), parameters...)
	sort.SliceStable(sortedParameters, func(left, right int) bool {
		if sortedParameters[left].SortOrder != sortedParameters[right].SortOrder {
			return sortedParameters[left].SortOrder < sortedParameters[right].SortOrder
		}
		return sortedParameters[left].ID < sortedParameters[right].ID
	})

	fields := make([]initialAssessmentPrintField, 0, len(sortedParameters))
	for _, parameter := range sortedParameters {
		value := strings.TrimSpace(parameter.ResultValue)
		if value != "" && strings.TrimSpace(parameter.UnitSnapshot) != "" {
			value += " " + strings.TrimSpace(parameter.UnitSnapshot)
		}
		if value == "" {
			value = "-"
		}
		if notes := strings.TrimSpace(parameter.ResultNotes); notes != "" {
			value += "\nCatatan: " + notes
		}
		fields = append(fields, initialAssessmentPrintField{
			Label: "Parameter - " + fallbackText(parameter.ParameterNameSnapshot),
			Value: value,
		})
	}
	return fields
}

func buildProcedureOdontogramSummary(entry models.OdontogramEntry) string {
	markedTeeth := 0
	findingCount := 0
	for _, tooth := range entry.Teeth {
		if condition := strings.TrimSpace(tooth.ToothCondition); condition != "" && condition != odontogramConditionSound {
			markedTeeth++
		}
		for _, finding := range tooth.SurfaceFindings {
			if condition := strings.TrimSpace(finding.ConditionCode); condition != "" && condition != odontogramConditionSound {
				findingCount++
			}
		}
	}

	if markedTeeth == 0 && findingCount == 0 {
		return "Odontogram belum memiliki tanda klinis khusus"
	}
	return fmt.Sprintf("%d gigi bertanda, %d temuan permukaan", markedTeeth, findingCount)
}

func normalizeProcedureDomainValue(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "dental":
		return "dental"
	case "laboratory":
		return "laboratory"
	case "radiology":
		return "radiology"
	default:
		return "general"
	}
}

func procedureDomainLabel(value string) string {
	switch normalizeProcedureDomainValue(value) {
	case "dental":
		return "Dental"
	case "laboratory":
		return "Laboratorium"
	case "radiology":
		return "Radiologi"
	default:
		return "Umum"
	}
}

func normalizeProcedureTargetType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "full_mouth", "arch", "quadrant", "tooth", "surface":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "none"
	}
}

func procedureTargetTypeLabel(value string) string {
	switch normalizeProcedureTargetType(value) {
	case "full_mouth":
		return "Seluruh mulut"
	case "arch":
		return "Rahang"
	case "quadrant":
		return "Kuadran"
	case "tooth":
		return "Gigi"
	case "surface":
		return "Permukaan"
	default:
		return "Tanpa target"
	}
}

func procedureRecordStatusLabel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "final":
		return "Final"
	case "cancelled":
		return "Dibatalkan"
	default:
		return "Draft"
	}
}

func formatProcedureCurrency(value float64) string {
	return "Rp " + formatProcedureInteger(value)
}

func formatProcedureInteger(value float64) string {
	raw := strconv.FormatFloat(value, 'f', 0, 64)
	if raw == "" {
		return "0"
	}
	parts := make([]string, 0, (len(raw)+2)/3)
	for len(raw) > 3 {
		parts = append([]string{raw[len(raw)-3:]}, parts...)
		raw = raw[:len(raw)-3]
	}
	parts = append([]string{raw}, parts...)
	return strings.Join(parts, ".")
}
