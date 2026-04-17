package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"github.com/xuri/excelize/v2"
)

type dashboardReportSummary struct {
	PeriodLabel      string
	TotalVisits      int64
	CompletedVisits  int64
	InProgressVisits int64
	RegisteredVisits int64
	CancelledVisits  int64
	UniquePatients   int64
	NewPatients      int64
	QueueWaiting     int64
	QueueCalled      int64
	QueueProcessing  int64
	QueueDone        int64
	InvoiceCount     int64
	PaidInvoices     int64
	UnpaidInvoices   int64
	InvoiceTotal     float64
	RevenueTotal     float64
	RxOrdered        int64
	RxPreparing      int64
	RxReady          int64
	RxDispensed      int64
	LabOrdered       int64
	LabPreparing     int64
	LabCompleted     int64
	RadOrdered       int64
	RadCompleted     int64
}

type dashboardReportVisitRow struct {
	VisitDate          string
	VisitNumber        string
	PatientName        string
	DoctorName         string
	PolyclinicName     string
	VisitStatus        string
	QueueStatus        string
	PaymentType        string
	InvoiceNumber      string
	InvoiceStatus      string
	InvoiceTotal       float64
	PaidAmount         float64
	PrescriptionStatus string
	LaboratoryStatus   string
	RadiologyStatus    string
}

type dashboardReportVisitRowRaw struct {
	VisitDate          time.Time `gorm:"column:visit_date"`
	VisitNumber        string    `gorm:"column:visit_number"`
	PatientName        string    `gorm:"column:patient_name"`
	DoctorName         string    `gorm:"column:doctor_name"`
	PolyclinicName     string    `gorm:"column:polyclinic_name"`
	VisitStatus        string    `gorm:"column:visit_status"`
	QueueStatus        string    `gorm:"column:queue_status"`
	PaymentType        string    `gorm:"column:payment_type"`
	InvoiceNumber      string    `gorm:"column:invoice_number"`
	InvoiceStatus      string    `gorm:"column:invoice_status"`
	InvoiceTotal       float64   `gorm:"column:invoice_total"`
	PaidAmount         float64   `gorm:"column:paid_amount"`
	PrescriptionStatus string    `gorm:"column:prescription_status"`
	LaboratoryStatus   string    `gorm:"column:laboratory_status"`
	RadiologyStatus    string    `gorm:"column:radiology_status"`
}

type dashboardOperationalReportData struct {
	GeneratedAt    time.Time
	StartDate      time.Time
	EndDate        time.Time
	Summary        dashboardReportSummary
	TopPolyclinics []dashboardTopPolyclinic
	TopDiagnoses   []dashboardTopDiagnosis
	LowStock       []dashboardLowStockMedicine
	Visits         []dashboardReportVisitRow
}

func GetDashboardReportPDF(c *gin.Context) {
	startDate, endDate, err := parseDashboardReportRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	report, err := buildDashboardOperationalReportData(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyiapkan laporan operasional"})
		return
	}

	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderDashboardOperationalReportPDF(hospitalInfo, report)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF laporan operasional"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func GetDashboardReportExcel(c *gin.Context) {
	startDate, endDate, err := parseDashboardReportRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	report, err := buildDashboardOperationalReportData(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyiapkan laporan operasional"})
		return
	}

	excelBytes, fileName, err := renderDashboardOperationalReportExcel(report)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat Excel laporan operasional"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", excelBytes)
}

func parseDashboardReportRange(c *gin.Context) (time.Time, time.Time, error) {
	now := time.Now()
	defaultStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	defaultEnd := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	parseDate := func(raw string, fallback time.Time) (time.Time, error) {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			return fallback, nil
		}

		parsed, err := time.ParseInLocation("2006-01-02", trimmed, now.Location())
		if err != nil {
			return time.Time{}, fmt.Errorf("format tanggal harus YYYY-MM-DD")
		}
		return parsed, nil
	}

	startDate, err := parseDate(c.Query("start_date"), defaultStart)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	endDate, err := parseDate(c.Query("end_date"), defaultEnd)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if endDate.Before(startDate) {
		return time.Time{}, time.Time{}, fmt.Errorf("tanggal akhir tidak boleh lebih kecil dari tanggal mulai")
	}

	return startDate, endDate, nil
}

func buildDashboardOperationalReportData(startDate time.Time, endDate time.Time) (dashboardOperationalReportData, error) {
	generatedAt := time.Now()
	endExclusive := endDate.AddDate(0, 0, 1)
	report := dashboardOperationalReportData{
		GeneratedAt: generatedAt,
		StartDate:   startDate,
		EndDate:     endDate,
		Summary: dashboardReportSummary{
			PeriodLabel: fmt.Sprintf("%s s/d %s", formatDateIndonesian(startDate), formatDateIndonesian(endDate)),
		},
	}

	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ?", startDate, endExclusive).Count(&report.Summary.TotalVisits)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", startDate, endExclusive, "completed").Count(&report.Summary.CompletedVisits)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", startDate, endExclusive, "in_progress").Count(&report.Summary.InProgressVisits)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", startDate, endExclusive, "registered").Count(&report.Summary.RegisteredVisits)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", startDate, endExclusive, "cancelled").Count(&report.Summary.CancelledVisits)
	database.DB.Model(&models.Visit{}).Distinct("patient_id").Where("visit_date >= ? AND visit_date < ?", startDate, endExclusive).Count(&report.Summary.UniquePatients)
	database.DB.Model(&models.Patient{}).Where("created_at >= ? AND created_at < ?", startDate, endExclusive).Count(&report.Summary.NewPatients)

	database.DB.Model(&models.RegistrationQueue{}).Where("queue_date >= ? AND queue_date < ? AND status = ?", startDate, endExclusive, "waiting").Count(&report.Summary.QueueWaiting)
	database.DB.Model(&models.RegistrationQueue{}).Where("queue_date >= ? AND queue_date < ? AND status = ?", startDate, endExclusive, "called").Count(&report.Summary.QueueCalled)
	database.DB.Model(&models.RegistrationQueue{}).Where("queue_date >= ? AND queue_date < ? AND status = ?", startDate, endExclusive, "processing").Count(&report.Summary.QueueProcessing)
	database.DB.Model(&models.RegistrationQueue{}).Where("queue_date >= ? AND queue_date < ? AND status = ?", startDate, endExclusive, "completed").Count(&report.Summary.QueueDone)

	database.DB.Model(&models.Invoice{}).Where("invoice_date >= ? AND invoice_date < ?", startDate, endExclusive).Count(&report.Summary.InvoiceCount)
	database.DB.Model(&models.Invoice{}).Where("invoice_date >= ? AND invoice_date < ? AND status = ?", startDate, endExclusive, "lunas").Count(&report.Summary.PaidInvoices)
	database.DB.Model(&models.Invoice{}).Where("invoice_date >= ? AND invoice_date < ? AND status IN ?", startDate, endExclusive, []string{"belum_bayar", "sebagian"}).Count(&report.Summary.UnpaidInvoices)
	database.DB.Model(&models.Invoice{}).Select("COALESCE(SUM(total_amount), 0)").Where("invoice_date >= ? AND invoice_date < ?", startDate, endExclusive).Scan(&report.Summary.InvoiceTotal)
	database.DB.Model(&models.Payment{}).Select("COALESCE(SUM(amount), 0)").Where("payment_date >= ? AND payment_date < ?", startDate, endExclusive).Scan(&report.Summary.RevenueTotal)

	database.DB.Model(&models.MedicalRecord{}).Where("prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status = ?", startDate, endExclusive, "ordered").Count(&report.Summary.RxOrdered)
	database.DB.Model(&models.MedicalRecord{}).Where("prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status = ?", startDate, endExclusive, "preparing").Count(&report.Summary.RxPreparing)
	database.DB.Model(&models.MedicalRecord{}).Where("prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status = ?", startDate, endExclusive, "ready").Count(&report.Summary.RxReady)
	database.DB.Model(&models.MedicalRecord{}).Where("prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status = ?", startDate, endExclusive, "dispensed").Count(&report.Summary.RxDispensed)

	database.DB.Model(&models.MedicalRecord{}).Where("laboratory_ordered_at >= ? AND laboratory_ordered_at < ? AND laboratory_workflow_status = ?", startDate, endExclusive, "ordered").Count(&report.Summary.LabOrdered)
	database.DB.Model(&models.MedicalRecord{}).Where("laboratory_ordered_at >= ? AND laboratory_ordered_at < ? AND laboratory_workflow_status = ?", startDate, endExclusive, "preparing").Count(&report.Summary.LabPreparing)
	database.DB.Model(&models.MedicalRecord{}).Where("laboratory_ordered_at >= ? AND laboratory_ordered_at < ? AND laboratory_workflow_status = ?", startDate, endExclusive, "completed").Count(&report.Summary.LabCompleted)

	database.DB.Model(&models.MedicalRecord{}).Where("radiology_ordered_at >= ? AND radiology_ordered_at < ? AND radiology_workflow_status = ?", startDate, endExclusive, "ordered").Count(&report.Summary.RadOrdered)
	database.DB.Model(&models.MedicalRecord{}).Where("radiology_ordered_at >= ? AND radiology_ordered_at < ? AND radiology_workflow_status = ?", startDate, endExclusive, "completed").Count(&report.Summary.RadCompleted)

	database.DB.Model(&models.Visit{}).
		Select("polyclinics.name as name, COUNT(*) as visits").
		Joins("JOIN polyclinics ON polyclinics.id = visits.polyclinic_id").
		Where("visits.visit_date >= ? AND visits.visit_date < ?", startDate, endExclusive).
		Group("polyclinics.name").
		Order("visits DESC").
		Limit(10).
		Scan(&report.TopPolyclinics)

	database.DB.Model(&models.MedicalRecordDiagnosis{}).
		Select("icd10.code as code, icd10.name as name, COUNT(*) as count").
		Joins("JOIN icd10 ON icd10.id = medical_record_diagnoses.icd10_id").
		Joins("JOIN medical_records ON medical_records.id = medical_record_diagnoses.medical_record_id").
		Where("medical_records.record_date >= ? AND medical_records.record_date < ? AND medical_record_diagnoses.deleted_at IS NULL AND medical_records.deleted_at IS NULL", startDate, endExclusive).
		Group("icd10.code, icd10.name").
		Order("count DESC").
		Limit(10).
		Scan(&report.TopDiagnoses)

	database.DB.Model(&models.Medicine{}).
		Select("id, code, name, current_stock, min_stock").
		Where("is_active = ? AND current_stock <= min_stock", true).
		Order("current_stock ASC").
		Limit(15).
		Scan(&report.LowStock)

	var rawRows []dashboardReportVisitRowRaw
	visitDetailQuery := `
		SELECT
			visits.visit_date,
			visits.visit_number,
			patients.full_name AS patient_name,
			doctors.full_name AS doctor_name,
			polyclinics.name AS polyclinic_name,
			visits.status AS visit_status,
			visits.queue_status,
			COALESCE(visits.payment_type, '') AS payment_type,
			COALESCE(invoices.invoice_number, '') AS invoice_number,
			COALESCE(invoices.status, '') AS invoice_status,
			COALESCE(invoices.total_amount, 0) AS invoice_total,
			COALESCE((
				SELECT SUM(payments.amount)
				FROM payments
				WHERE payments.invoice_id = invoices.id
			), 0) AS paid_amount,
			COALESCE((
				SELECT mr.prescription_workflow_status
				FROM medical_records mr
				WHERE mr.visit_id = visits.id AND mr.deleted_at IS NULL AND mr.prescription_ordered_at IS NOT NULL
				ORDER BY COALESCE(mr.prescription_processed_at, mr.prescription_ordered_at, mr.created_at) DESC
				LIMIT 1
			), '') AS prescription_status,
			COALESCE((
				SELECT mr.laboratory_workflow_status
				FROM medical_records mr
				WHERE mr.visit_id = visits.id AND mr.deleted_at IS NULL AND mr.laboratory_ordered_at IS NOT NULL
				ORDER BY COALESCE(mr.laboratory_processed_at, mr.laboratory_ordered_at, mr.created_at) DESC
				LIMIT 1
			), '') AS laboratory_status,
			COALESCE((
				SELECT mr.radiology_workflow_status
				FROM medical_records mr
				WHERE mr.visit_id = visits.id AND mr.deleted_at IS NULL AND mr.radiology_ordered_at IS NOT NULL
				ORDER BY COALESCE(mr.radiology_processed_at, mr.radiology_ordered_at, mr.created_at) DESC
				LIMIT 1
			), '') AS radiology_status
		FROM visits
		JOIN patients ON patients.id = visits.patient_id
		JOIN doctors ON doctors.id = visits.doctor_id
		JOIN polyclinics ON polyclinics.id = visits.polyclinic_id
		LEFT JOIN invoices ON invoices.visit_id = visits.id AND invoices.deleted_at IS NULL
		WHERE visits.deleted_at IS NULL
		  AND visits.visit_date >= ?
		  AND visits.visit_date < ?
		ORDER BY visits.visit_date DESC, visits.visit_number DESC`

	if err := database.DB.Raw(visitDetailQuery, startDate, endExclusive).Scan(&rawRows).Error; err != nil {
		return dashboardOperationalReportData{}, err
	}

	report.Visits = make([]dashboardReportVisitRow, 0, len(rawRows))
	for _, row := range rawRows {
		report.Visits = append(report.Visits, dashboardReportVisitRow{
			VisitDate:          row.VisitDate.Format("2006-01-02 15:04"),
			VisitNumber:        row.VisitNumber,
			PatientName:        row.PatientName,
			DoctorName:         row.DoctorName,
			PolyclinicName:     row.PolyclinicName,
			VisitStatus:        dashboardReportVisitStatusLabel(row.VisitStatus),
			QueueStatus:        dashboardReportQueueStatusLabel(row.QueueStatus),
			PaymentType:        dashboardReportPaymentTypeLabel(row.PaymentType),
			InvoiceNumber:      firstNonEmpty(strings.TrimSpace(row.InvoiceNumber), "-"),
			InvoiceStatus:      dashboardReportInvoiceStatusLabel(row.InvoiceStatus),
			InvoiceTotal:       row.InvoiceTotal,
			PaidAmount:         row.PaidAmount,
			PrescriptionStatus: dashboardReportWorkflowStatusLabel(row.PrescriptionStatus),
			LaboratoryStatus:   dashboardReportWorkflowStatusLabel(row.LaboratoryStatus),
			RadiologyStatus:    dashboardReportWorkflowStatusLabel(row.RadiologyStatus),
		})
	}

	return report, nil
}

func renderDashboardOperationalReportPDF(hospitalInfo initialAssessmentHospitalInfo, report dashboardOperationalReportData) ([]byte, string, error) {
	pdf := gofpdf.New("L", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)

	documentTitle := "LAPORAN OPERASIONAL KLINIK"
	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle(documentTitle, false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetHeaderFuncMode(func() {
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, documentTitle, report.Summary.PeriodLabel)
	}, true)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-8)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(90, 90, 90)
		pdf.CellFormat(90, 4, "Dicetak: "+formatDateTimeIndonesian(report.GeneratedAt), "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})

	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	summaryFields := []initialAssessmentPrintField{
		{Label: "Periode", Value: report.Summary.PeriodLabel},
		{Label: "Total Kunjungan", Value: formatDashboardReportInt(report.Summary.TotalVisits)},
		{Label: "Kunjungan Selesai", Value: formatDashboardReportInt(report.Summary.CompletedVisits)},
		{Label: "Kunjungan Berlangsung", Value: formatDashboardReportInt(report.Summary.InProgressVisits)},
		{Label: "Kunjungan Terdaftar", Value: formatDashboardReportInt(report.Summary.RegisteredVisits)},
		{Label: "Kunjungan Batal", Value: formatDashboardReportInt(report.Summary.CancelledVisits)},
		{Label: "Pasien Unik", Value: formatDashboardReportInt(report.Summary.UniquePatients)},
		{Label: "Pasien Baru", Value: formatDashboardReportInt(report.Summary.NewPatients)},
		{Label: "Total Invoice", Value: formatDashboardReportInt(report.Summary.InvoiceCount)},
		{Label: "Invoice Lunas", Value: formatDashboardReportInt(report.Summary.PaidInvoices)},
		{Label: "Invoice Belum Lunas", Value: formatDashboardReportInt(report.Summary.UnpaidInvoices)},
		{Label: "Nilai Tagihan", Value: formatDashboardReportCurrency(report.Summary.InvoiceTotal)},
		{Label: "Pendapatan Tercatat", Value: formatDashboardReportCurrency(report.Summary.RevenueTotal)},
	}
	addInitialAssessmentCompactFieldSection(pdf, "RINGKASAN LAPORAN", summaryFields, "-")

	workflowFields := []initialAssessmentPrintField{
		{Label: "Antrian Menunggu", Value: formatDashboardReportInt(report.Summary.QueueWaiting)},
		{Label: "Antrian Dipanggil", Value: formatDashboardReportInt(report.Summary.QueueCalled)},
		{Label: "Antrian Diproses", Value: formatDashboardReportInt(report.Summary.QueueProcessing)},
		{Label: "Antrian Selesai", Value: formatDashboardReportInt(report.Summary.QueueDone)},
		{Label: "Resep Ordered", Value: formatDashboardReportInt(report.Summary.RxOrdered)},
		{Label: "Resep Preparing", Value: formatDashboardReportInt(report.Summary.RxPreparing)},
		{Label: "Resep Ready", Value: formatDashboardReportInt(report.Summary.RxReady)},
		{Label: "Resep Dispensed", Value: formatDashboardReportInt(report.Summary.RxDispensed)},
		{Label: "Lab Ordered", Value: formatDashboardReportInt(report.Summary.LabOrdered)},
		{Label: "Lab Preparing", Value: formatDashboardReportInt(report.Summary.LabPreparing)},
		{Label: "Lab Completed", Value: formatDashboardReportInt(report.Summary.LabCompleted)},
		{Label: "Rad Ordered", Value: formatDashboardReportInt(report.Summary.RadOrdered)},
		{Label: "Rad Completed", Value: formatDashboardReportInt(report.Summary.RadCompleted)},
	}
	addInitialAssessmentCompactFieldSection(pdf, "RINGKASAN OPERASIONAL", workflowFields, "-")

	addDashboardReportSimpleTable(
		pdf,
		"TOP POLIKLINIK",
		[]string{"Poliklinik", "Kunjungan"},
		[]float64{185, 35},
		buildDashboardReportTopPolyclinicRows(report.TopPolyclinics),
	)
	addDashboardReportSimpleTable(
		pdf,
		"TOP DIAGNOSA",
		[]string{"Kode", "Diagnosa", "Jumlah"},
		[]float64{28, 165, 27},
		buildDashboardReportTopDiagnosisRows(report.TopDiagnoses),
	)
	addDashboardReportSimpleTable(
		pdf,
		"STOK OBAT RENDAH",
		[]string{"Kode", "Nama Obat", "Stok", "Min. Stok"},
		[]float64{28, 145, 22, 25},
		buildDashboardReportLowStockRows(report.LowStock),
	)
	addDashboardReportVisitsTable(pdf, report.Visits)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("laporan-operasional-%s-sd-%s.pdf", report.StartDate.Format("20060102"), report.EndDate.Format("20060102"))
	return output.Bytes(), fileName, nil
}

func renderDashboardOperationalReportExcel(report dashboardOperationalReportData) ([]byte, string, error) {
	f := excelize.NewFile()
	defer func() {
		_ = f.Close()
	}()

	summarySheet := "Ringkasan"
	f.SetSheetName("Sheet1", summarySheet)
	visitsSheet := "Kunjungan"
	topPoliSheet := "Top Poliklinik"
	topDiagnosisSheet := "Top Diagnosa"
	lowStockSheet := "Stok Rendah"
	f.NewSheet(visitsSheet)
	f.NewSheet(topPoliSheet)
	f.NewSheet(topDiagnosisSheet)
	f.NewSheet(lowStockSheet)

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "#FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#0F172A"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center"},
	})
	currencyStyle, _ := f.NewStyle(&excelize.Style{NumFmt: 3})

	summaryRows := [][]any{
		{"Laporan", "Laporan Operasional Klinik"},
		{"Periode", report.Summary.PeriodLabel},
		{"Dicetak", formatDateTimeIndonesian(report.GeneratedAt)},
		{"Total Kunjungan", report.Summary.TotalVisits},
		{"Kunjungan Selesai", report.Summary.CompletedVisits},
		{"Kunjungan Berlangsung", report.Summary.InProgressVisits},
		{"Kunjungan Terdaftar", report.Summary.RegisteredVisits},
		{"Kunjungan Batal", report.Summary.CancelledVisits},
		{"Pasien Unik", report.Summary.UniquePatients},
		{"Pasien Baru", report.Summary.NewPatients},
		{"Antrian Menunggu", report.Summary.QueueWaiting},
		{"Antrian Dipanggil", report.Summary.QueueCalled},
		{"Antrian Diproses", report.Summary.QueueProcessing},
		{"Antrian Selesai", report.Summary.QueueDone},
		{"Total Invoice", report.Summary.InvoiceCount},
		{"Invoice Lunas", report.Summary.PaidInvoices},
		{"Invoice Belum Lunas", report.Summary.UnpaidInvoices},
		{"Nilai Tagihan", report.Summary.InvoiceTotal},
		{"Pendapatan Tercatat", report.Summary.RevenueTotal},
		{"Resep Ordered", report.Summary.RxOrdered},
		{"Resep Preparing", report.Summary.RxPreparing},
		{"Resep Ready", report.Summary.RxReady},
		{"Resep Dispensed", report.Summary.RxDispensed},
		{"Lab Ordered", report.Summary.LabOrdered},
		{"Lab Preparing", report.Summary.LabPreparing},
		{"Lab Completed", report.Summary.LabCompleted},
		{"Radiologi Ordered", report.Summary.RadOrdered},
		{"Radiologi Completed", report.Summary.RadCompleted},
	}
	for index, row := range summaryRows {
		cellA, _ := excelize.CoordinatesToCellName(1, index+1)
		cellB, _ := excelize.CoordinatesToCellName(2, index+1)
		f.SetCellValue(summarySheet, cellA, row[0])
		f.SetCellValue(summarySheet, cellB, row[1])
	}
	f.SetColWidth(summarySheet, "A", "A", 28)
	f.SetColWidth(summarySheet, "B", "B", 24)
	f.SetCellStyle(summarySheet, "B18", "B19", currencyStyle)

	visitHeaders := []string{"Tanggal", "No Visit", "Pasien", "Dokter", "Poliklinik", "Status Visit", "Status Antrian", "Tipe Bayar", "Invoice", "Status Invoice", "Tagihan", "Terbayar", "Resep", "Lab", "Radiologi"}
	writeDashboardReportSheetHeader(f, visitsSheet, visitHeaders, headerStyle)
	for index, row := range report.Visits {
		rowNumber := index + 2
		values := []any{row.VisitDate, row.VisitNumber, row.PatientName, row.DoctorName, row.PolyclinicName, row.VisitStatus, row.QueueStatus, row.PaymentType, row.InvoiceNumber, row.InvoiceStatus, row.InvoiceTotal, row.PaidAmount, row.PrescriptionStatus, row.LaboratoryStatus, row.RadiologyStatus}
		writeDashboardReportSheetRow(f, visitsSheet, rowNumber, values)
	}
	f.SetColWidth(visitsSheet, "A", "O", 18)
	f.SetColWidth(visitsSheet, "C", "E", 24)
	f.SetCellStyle(visitsSheet, "K2", fmt.Sprintf("L%d", len(report.Visits)+1), currencyStyle)

	topPoliHeaders := []string{"Poliklinik", "Kunjungan"}
	writeDashboardReportSheetHeader(f, topPoliSheet, topPoliHeaders, headerStyle)
	for index, item := range report.TopPolyclinics {
		writeDashboardReportSheetRow(f, topPoliSheet, index+2, []any{item.Name, item.Visits})
	}
	f.SetColWidth(topPoliSheet, "A", "A", 30)
	f.SetColWidth(topPoliSheet, "B", "B", 14)

	topDiagnosisHeaders := []string{"Kode", "Diagnosa", "Jumlah"}
	writeDashboardReportSheetHeader(f, topDiagnosisSheet, topDiagnosisHeaders, headerStyle)
	for index, item := range report.TopDiagnoses {
		writeDashboardReportSheetRow(f, topDiagnosisSheet, index+2, []any{item.Code, item.Name, item.Count})
	}
	f.SetColWidth(topDiagnosisSheet, "A", "A", 14)
	f.SetColWidth(topDiagnosisSheet, "B", "B", 48)
	f.SetColWidth(topDiagnosisSheet, "C", "C", 14)

	lowStockHeaders := []string{"Kode", "Nama Obat", "Stok Saat Ini", "Min. Stok"}
	writeDashboardReportSheetHeader(f, lowStockSheet, lowStockHeaders, headerStyle)
	for index, item := range report.LowStock {
		writeDashboardReportSheetRow(f, lowStockSheet, index+2, []any{item.Code, item.Name, item.CurrentStock, item.MinStock})
	}
	f.SetColWidth(lowStockSheet, "A", "A", 14)
	f.SetColWidth(lowStockSheet, "B", "B", 42)
	f.SetColWidth(lowStockSheet, "C", "D", 14)

	f.SetActiveSheet(0)

	var output bytes.Buffer
	if err := f.Write(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("laporan-operasional-%s-sd-%s.xlsx", report.StartDate.Format("20060102"), report.EndDate.Format("20060102"))
	return output.Bytes(), fileName, nil
}

func addDashboardReportSimpleTable(pdf *gofpdf.Fpdf, title string, headers []string, widths []float64, rows [][]string) {
	addInitialAssessmentSectionTitle(pdf, title)
	dashboardDrawTableHeader := func() {
		pdf.SetFont("Arial", "B", 9)
		pdf.SetFillColor(30, 41, 59)
		pdf.SetTextColor(255, 255, 255)
		for index, header := range headers {
			pdf.CellFormat(widths[index], 7, sanitizePDFSingleLineText(header), "1", 0, "C", true, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetTextColor(0, 0, 0)
	}

	dashboardDrawTableHeader()
	pdf.SetFont("Arial", "", 8.5)
	for _, row := range rows {
		dashboardEnsureTableRowSpace(pdf, 6.5, func() {
			addInitialAssessmentSectionTitle(pdf, title)
			dashboardDrawTableHeader()
		})
		for index, cell := range row {
			align := "L"
			if index == len(row)-1 {
				align = "R"
			}
			pdf.CellFormat(widths[index], 6.5, sanitizePDFSingleLineText(dashboardReportEllipsis(cell, 72)), "1", 0, align, false, 0, "")
		}
		pdf.Ln(-1)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addDashboardReportVisitsTable(pdf *gofpdf.Fpdf, rows []dashboardReportVisitRow) {
	addInitialAssessmentSectionTitle(pdf, "DETAIL KUNJUNGAN")
	headers := []string{"Tanggal", "No Visit", "Pasien", "Dokter", "Poli", "Visit", "Queue", "Invoice", "Tagihan", "Bayar"}
	widths := []float64{23, 24, 46, 36, 24, 18, 18, 24, 22, 22}
	drawHeader := func() {
		pdf.SetFont("Arial", "B", 8)
		pdf.SetFillColor(30, 41, 59)
		pdf.SetTextColor(255, 255, 255)
		for index, header := range headers {
			pdf.CellFormat(widths[index], 7, sanitizePDFSingleLineText(header), "1", 0, "C", true, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetTextColor(0, 0, 0)
	}

	drawHeader()
	pdf.SetFont("Arial", "", 7.8)
	for _, row := range rows {
		dashboardEnsureTableRowSpace(pdf, 6.2, func() {
			addInitialAssessmentSectionTitle(pdf, "DETAIL KUNJUNGAN")
			drawHeader()
		})
		cells := []string{
			dashboardReportShortDate(row.VisitDate),
			row.VisitNumber,
			row.PatientName,
			row.DoctorName,
			row.PolyclinicName,
			row.VisitStatus,
			row.QueueStatus,
			row.InvoiceNumber,
			formatDashboardReportCurrency(row.InvoiceTotal),
			formatDashboardReportCurrency(row.PaidAmount),
		}
		for index, cell := range cells {
			align := "L"
			if index >= len(cells)-2 {
				align = "R"
			}
			pdf.CellFormat(widths[index], 6.2, sanitizePDFSingleLineText(dashboardReportEllipsis(cell, 28)), "1", 0, align, false, 0, "")
		}
		pdf.Ln(-1)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func dashboardEnsureTableRowSpace(pdf *gofpdf.Fpdf, rowHeight float64, onNewPage func()) {
	pageWidth, pageHeight := pdf.GetPageSize()
	_, _, _, bottom := pdf.GetMargins()
	_ = pageWidth
	if pdf.GetY()+rowHeight <= pageHeight-bottom {
		return
	}
	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
	onNewPage()
}

func buildDashboardReportTopPolyclinicRows(items []dashboardTopPolyclinic) [][]string {
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{item.Name, formatDashboardReportInt(item.Visits)})
	}
	if len(rows) == 0 {
		rows = append(rows, []string{"-", "0"})
	}
	return rows
}

func buildDashboardReportTopDiagnosisRows(items []dashboardTopDiagnosis) [][]string {
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{item.Code, item.Name, formatDashboardReportInt(item.Count)})
	}
	if len(rows) == 0 {
		rows = append(rows, []string{"-", "Belum ada data diagnosa", "0"})
	}
	return rows
}

func buildDashboardReportLowStockRows(items []dashboardLowStockMedicine) [][]string {
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{item.Code, item.Name, formatDashboardReportInt(int64(item.CurrentStock)), formatDashboardReportInt(int64(item.MinStock))})
	}
	if len(rows) == 0 {
		rows = append(rows, []string{"-", "Semua stok obat aman", "0", "0"})
	}
	return rows
}

func writeDashboardReportSheetHeader(f *excelize.File, sheet string, headers []string, style int) {
	for index, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(index+1, 1)
		f.SetCellValue(sheet, cell, header)
	}
	f.SetCellStyle(sheet, "A1", dashboardReportColumnName(len(headers))+"1", style)
}

func writeDashboardReportSheetRow(f *excelize.File, sheet string, rowNumber int, values []any) {
	for index, value := range values {
		cell, _ := excelize.CoordinatesToCellName(index+1, rowNumber)
		f.SetCellValue(sheet, cell, value)
	}
}

func dashboardReportColumnName(index int) string {
	name, _ := excelize.ColumnNumberToName(index)
	return name
}

func formatDashboardReportInt(value int64) string {
	return fmt.Sprintf("%d", value)
}

func formatDashboardReportCurrency(value float64) string {
	return fmt.Sprintf("Rp%s", formatNumberWithThousandSeparator(value))
}

func formatNumberWithThousandSeparator(value float64) string {
	negative := value < 0
	if negative {
		value *= -1
	}
	raw := fmt.Sprintf("%.0f", value)
	if len(raw) <= 3 {
		if negative {
			return "-" + raw
		}
		return raw
	}

	parts := make([]string, 0, (len(raw)+2)/3)
	for len(raw) > 3 {
		parts = append([]string{raw[len(raw)-3:]}, parts...)
		raw = raw[:len(raw)-3]
	}
	parts = append([]string{raw}, parts...)
	joined := strings.Join(parts, ".")
	if negative {
		return "-" + joined
	}
	return joined
}

func dashboardReportShortDate(value string) string {
	parsed, err := time.ParseInLocation("2006-01-02 15:04", value, time.Local)
	if err != nil {
		return dashboardReportEllipsis(value, 16)
	}
	return parsed.Format("02/01 15:04")
}

func dashboardReportVisitStatusLabel(status string) string {
	switch strings.TrimSpace(status) {
	case "registered":
		return "Terdaftar"
	case "in_progress":
		return "Berlangsung"
	case "completed":
		return "Selesai"
	case "cancelled":
		return "Batal"
	default:
		return firstNonEmpty(status, "-")
	}
}

func dashboardReportQueueStatusLabel(status string) string {
	switch strings.TrimSpace(status) {
	case "waiting":
		return "Menunggu"
	case "called":
		return "Dipanggil"
	case "processing":
		return "Diproses"
	case "completed", "done":
		return "Selesai"
	case "cancelled":
		return "Batal"
	default:
		return firstNonEmpty(status, "-")
	}
}

func dashboardReportInvoiceStatusLabel(status string) string {
	switch strings.TrimSpace(status) {
	case "lunas":
		return "Lunas"
	case "sebagian":
		return "Sebagian"
	case "belum_bayar":
		return "Belum Bayar"
	default:
		return firstNonEmpty(status, "-")
	}
}

func dashboardReportWorkflowStatusLabel(status string) string {
	switch strings.TrimSpace(status) {
	case "ordered":
		return "Ordered"
	case "preparing":
		return "Preparing"
	case "ready":
		return "Ready"
	case "dispensed":
		return "Dispensed"
	case "completed":
		return "Completed"
	case "draft":
		return "Draft"
	default:
		return firstNonEmpty(status, "-")
	}
}

func dashboardReportPaymentTypeLabel(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "cash":
		return "Tunai"
	case "insurance":
		return "Asuransi"
	case "bpjs":
		return "BPJS"
	case "credit":
		return "Kredit"
	default:
		return firstNonEmpty(value, "-")
	}
}

func dashboardReportEllipsis(value string, maxLen int) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || len([]rune(trimmed)) <= maxLen {
		return firstNonEmpty(trimmed, "-")
	}
	runes := []rune(trimmed)
	if maxLen <= 3 {
		return string(runes[:maxLen])
	}
	return string(runes[:maxLen-3]) + "..."
}
