package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"time"

	"starter/backend/database"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"github.com/xuri/excelize/v2"
)

type financeReportSummary struct {
	PeriodLabel      string
	InvoiceCount     int64
	PaidInvoices     int64
	PartialInvoices  int64
	UnpaidInvoices   int64
	SubTotal         float64
	DiscountTotal    float64
	TaxTotal         float64
	InvoiceTotal     float64
	PaymentTotal     float64
	OutstandingTotal float64
	AverageInvoice   float64
}

type financeReportPaymentMethodRow struct {
	MethodName       string  `gorm:"column:method_name"`
	TransactionCount int64   `gorm:"column:transaction_count"`
	AmountTotal      float64 `gorm:"column:amount_total"`
}

type financeReportInvoiceStatusRow struct {
	StatusName       string  `gorm:"column:status_name"`
	InvoiceCount     int64   `gorm:"column:invoice_count"`
	InvoiceTotal     float64 `gorm:"column:invoice_total"`
	PaidTotal        float64 `gorm:"column:paid_total"`
	OutstandingTotal float64 `gorm:"column:outstanding_total"`
}

type financeReportTopItemRow struct {
	Description   string  `gorm:"column:description"`
	QuantityTotal int64   `gorm:"column:quantity_total"`
	RevenueTotal  float64 `gorm:"column:revenue_total"`
}

type financeReportInvoiceRow struct {
	InvoiceDate      string
	InvoiceNumber    string
	VisitNumber      string
	PatientName      string
	InvoiceStatus    string
	SubTotal         float64
	Discount         float64
	Tax              float64
	TotalAmount      float64
	PaidAmount       float64
	OutstandingTotal float64
}

type financeReportInvoiceRowRaw struct {
	InvoiceDate      time.Time `gorm:"column:invoice_date"`
	InvoiceNumber    string    `gorm:"column:invoice_number"`
	VisitNumber      string    `gorm:"column:visit_number"`
	PatientName      string    `gorm:"column:patient_name"`
	InvoiceStatus    string    `gorm:"column:invoice_status"`
	SubTotal         float64   `gorm:"column:sub_total"`
	Discount         float64   `gorm:"column:discount"`
	Tax              float64   `gorm:"column:tax"`
	TotalAmount      float64   `gorm:"column:total_amount"`
	PaidAmount       float64   `gorm:"column:paid_amount"`
	OutstandingTotal float64   `gorm:"column:outstanding_total"`
}

type financeReportData struct {
	GeneratedAt     time.Time
	StartDate       time.Time
	EndDate         time.Time
	Summary         financeReportSummary
	PaymentMethods  []financeReportPaymentMethodRow
	InvoiceStatuses []financeReportInvoiceStatusRow
	TopItems        []financeReportTopItemRow
	Invoices        []financeReportInvoiceRow
}

func GetFinanceReportPDF(c *gin.Context) {
	startDate, endDate, err := parseDashboardReportRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	report, err := buildFinanceReportData(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyiapkan laporan keuangan"})
		return
	}

	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderFinanceReportPDF(hospitalInfo, report)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF laporan keuangan"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func GetFinanceReportExcel(c *gin.Context) {
	startDate, endDate, err := parseDashboardReportRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	report, err := buildFinanceReportData(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyiapkan laporan keuangan"})
		return
	}

	xlsxBytes, fileName, err := renderFinanceReportExcel(report)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat Excel laporan keuangan"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBytes)
}

func buildFinanceReportData(startDate time.Time, endDate time.Time) (financeReportData, error) {
	generatedAt := time.Now()
	endExclusive := endDate.AddDate(0, 0, 1)
	report := financeReportData{
		GeneratedAt: generatedAt,
		StartDate:   startDate,
		EndDate:     endDate,
		Summary: financeReportSummary{
			PeriodLabel: fmt.Sprintf("%s s/d %s", formatDateIndonesian(startDate), formatDateIndonesian(endDate)),
		},
	}

	database.DB.Table("invoices").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ?", startDate, endExclusive).Count(&report.Summary.InvoiceCount)
	database.DB.Table("invoices").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ? AND status = ?", startDate, endExclusive, "lunas").Count(&report.Summary.PaidInvoices)
	database.DB.Table("invoices").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ? AND status = ?", startDate, endExclusive, "sebagian").Count(&report.Summary.PartialInvoices)
	database.DB.Table("invoices").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ? AND status = ?", startDate, endExclusive, "belum_bayar").Count(&report.Summary.UnpaidInvoices)
	database.DB.Table("invoices").Select("COALESCE(SUM(sub_total), 0)").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ?", startDate, endExclusive).Scan(&report.Summary.SubTotal)
	database.DB.Table("invoices").Select("COALESCE(SUM(discount), 0)").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ?", startDate, endExclusive).Scan(&report.Summary.DiscountTotal)
	database.DB.Table("invoices").Select("COALESCE(SUM(tax), 0)").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ?", startDate, endExclusive).Scan(&report.Summary.TaxTotal)
	database.DB.Table("invoices").Select("COALESCE(SUM(total_amount), 0)").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ?", startDate, endExclusive).Scan(&report.Summary.InvoiceTotal)
	database.DB.Table("payments").Select("COALESCE(SUM(amount), 0)").Where("payment_date >= ? AND payment_date < ?", startDate, endExclusive).Scan(&report.Summary.PaymentTotal)

	outstandingQuery := `
		SELECT COALESCE(SUM(GREATEST(inv.total_amount - COALESCE(pay.total_paid, 0), 0)), 0)
		FROM invoices inv
		LEFT JOIN (
			SELECT invoice_id, SUM(amount) AS total_paid
			FROM payments
			GROUP BY invoice_id
		) pay ON pay.invoice_id = inv.id
		WHERE inv.deleted_at IS NULL AND inv.invoice_date >= ? AND inv.invoice_date < ?`
	database.DB.Raw(outstandingQuery, startDate, endExclusive).Scan(&report.Summary.OutstandingTotal)
	if report.Summary.InvoiceCount > 0 {
		report.Summary.AverageInvoice = report.Summary.InvoiceTotal / float64(report.Summary.InvoiceCount)
	}

	paymentMethodQuery := `
		SELECT
			COALESCE(payment_methods.name, 'Tanpa Metode') AS method_name,
			COUNT(payments.id) AS transaction_count,
			COALESCE(SUM(payments.amount), 0) AS amount_total
		FROM payments
		LEFT JOIN payment_methods ON payment_methods.id = payments.payment_method_id
		WHERE payments.payment_date >= ? AND payments.payment_date < ?
		GROUP BY payment_methods.name
		ORDER BY amount_total DESC, transaction_count DESC`
	if err := database.DB.Raw(paymentMethodQuery, startDate, endExclusive).Scan(&report.PaymentMethods).Error; err != nil {
		return financeReportData{}, err
	}

	invoiceStatusQuery := `
		SELECT
			CASE inv.status
				WHEN 'lunas' THEN 'Lunas'
				WHEN 'sebagian' THEN 'Sebagian'
				WHEN 'belum_bayar' THEN 'Belum Bayar'
				ELSE COALESCE(inv.status, '-')
			END AS status_name,
			COUNT(inv.id) AS invoice_count,
			COALESCE(SUM(inv.total_amount), 0) AS invoice_total,
			COALESCE(SUM(COALESCE(pay.total_paid, 0)), 0) AS paid_total,
			COALESCE(SUM(GREATEST(inv.total_amount - COALESCE(pay.total_paid, 0), 0)), 0) AS outstanding_total
		FROM invoices inv
		LEFT JOIN (
			SELECT invoice_id, SUM(amount) AS total_paid
			FROM payments
			GROUP BY invoice_id
		) pay ON pay.invoice_id = inv.id
		WHERE inv.deleted_at IS NULL AND inv.invoice_date >= ? AND inv.invoice_date < ?
		GROUP BY inv.status
		ORDER BY invoice_total DESC, invoice_count DESC`
	if err := database.DB.Raw(invoiceStatusQuery, startDate, endExclusive).Scan(&report.InvoiceStatuses).Error; err != nil {
		return financeReportData{}, err
	}

	topItemsQuery := `
		SELECT
			COALESCE(invoice_items.description, 'Tanpa Deskripsi') AS description,
			COALESCE(SUM(invoice_items.quantity), 0) AS quantity_total,
			COALESCE(SUM(invoice_items.total_price), 0) AS revenue_total
		FROM invoice_items
		JOIN invoices ON invoices.id = invoice_items.invoice_id
		WHERE invoices.deleted_at IS NULL AND invoices.invoice_date >= ? AND invoices.invoice_date < ?
		GROUP BY invoice_items.description
		ORDER BY revenue_total DESC, quantity_total DESC
		LIMIT 15`
	if err := database.DB.Raw(topItemsQuery, startDate, endExclusive).Scan(&report.TopItems).Error; err != nil {
		return financeReportData{}, err
	}

	invoiceRowsQuery := `
		SELECT
			inv.invoice_date,
			inv.invoice_number,
			COALESCE(v.visit_number, '-') AS visit_number,
			COALESCE(p.full_name, '-') AS patient_name,
			COALESCE(inv.status, '') AS invoice_status,
			COALESCE(inv.sub_total, 0) AS sub_total,
			COALESCE(inv.discount, 0) AS discount,
			COALESCE(inv.tax, 0) AS tax,
			COALESCE(inv.total_amount, 0) AS total_amount,
			COALESCE(pay.total_paid, 0) AS paid_amount,
			GREATEST(COALESCE(inv.total_amount, 0) - COALESCE(pay.total_paid, 0), 0) AS outstanding_total
		FROM invoices inv
		LEFT JOIN visits v ON v.id = inv.visit_id
		LEFT JOIN patients p ON p.id = inv.patient_id
		LEFT JOIN (
			SELECT invoice_id, SUM(amount) AS total_paid
			FROM payments
			GROUP BY invoice_id
		) pay ON pay.invoice_id = inv.id
		WHERE inv.deleted_at IS NULL AND inv.invoice_date >= ? AND inv.invoice_date < ?
		ORDER BY inv.invoice_date DESC, inv.invoice_number DESC`
	var rawRows []financeReportInvoiceRowRaw
	if err := database.DB.Raw(invoiceRowsQuery, startDate, endExclusive).Scan(&rawRows).Error; err != nil {
		return financeReportData{}, err
	}
	report.Invoices = make([]financeReportInvoiceRow, 0, len(rawRows))
	for _, row := range rawRows {
		report.Invoices = append(report.Invoices, financeReportInvoiceRow{
			InvoiceDate:      row.InvoiceDate.Format("2006-01-02 15:04"),
			InvoiceNumber:    row.InvoiceNumber,
			VisitNumber:      row.VisitNumber,
			PatientName:      row.PatientName,
			InvoiceStatus:    dashboardReportInvoiceStatusLabel(row.InvoiceStatus),
			SubTotal:         row.SubTotal,
			Discount:         row.Discount,
			Tax:              row.Tax,
			TotalAmount:      row.TotalAmount,
			PaidAmount:       row.PaidAmount,
			OutstandingTotal: row.OutstandingTotal,
		})
	}

	return report, nil
}

func renderFinanceReportPDF(hospitalInfo initialAssessmentHospitalInfo, report financeReportData) ([]byte, string, error) {
	pdf := gofpdf.New("L", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)

	documentTitle := "LAPORAN KEUANGAN KLINIK"
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
		{Label: "Total Invoice", Value: formatDashboardReportInt(report.Summary.InvoiceCount)},
		{Label: "Invoice Lunas", Value: formatDashboardReportInt(report.Summary.PaidInvoices)},
		{Label: "Invoice Sebagian", Value: formatDashboardReportInt(report.Summary.PartialInvoices)},
		{Label: "Invoice Belum Bayar", Value: formatDashboardReportInt(report.Summary.UnpaidInvoices)},
		{Label: "Subtotal", Value: formatDashboardReportCurrency(report.Summary.SubTotal)},
		{Label: "Diskon", Value: formatDashboardReportCurrency(report.Summary.DiscountTotal)},
		{Label: "Pajak", Value: formatDashboardReportCurrency(report.Summary.TaxTotal)},
		{Label: "Total Tagihan", Value: formatDashboardReportCurrency(report.Summary.InvoiceTotal)},
		{Label: "Total Pembayaran", Value: formatDashboardReportCurrency(report.Summary.PaymentTotal)},
		{Label: "Sisa Piutang", Value: formatDashboardReportCurrency(report.Summary.OutstandingTotal)},
		{Label: "Rata-rata Invoice", Value: formatDashboardReportCurrency(report.Summary.AverageInvoice)},
	}
	addInitialAssessmentCompactFieldSection(pdf, "RINGKASAN KEUANGAN", summaryFields, "-")

	addDashboardReportSimpleTable(
		pdf,
		"REKAP METODE PEMBAYARAN",
		[]string{"Metode Pembayaran", "Transaksi", "Total"},
		[]float64{145, 35, 40},
		buildFinanceReportPaymentMethodRows(report.PaymentMethods),
	)
	addDashboardReportSimpleTable(
		pdf,
		"REKAP STATUS INVOICE",
		[]string{"Status", "Jumlah", "Tagihan", "Terbayar", "Piutang"},
		[]float64{55, 25, 45, 45, 45},
		buildFinanceReportInvoiceStatusRows(report.InvoiceStatuses),
	)
	addDashboardReportSimpleTable(
		pdf,
		"ITEM TAGIHAN TERATAS",
		[]string{"Deskripsi", "Qty", "Nilai"},
		[]float64{155, 25, 40},
		buildFinanceReportTopItemRows(report.TopItems),
	)
	addFinanceReportInvoicesTable(pdf, report.Invoices)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("laporan-keuangan-%s-sd-%s.pdf", report.StartDate.Format("20060102"), report.EndDate.Format("20060102"))
	return output.Bytes(), fileName, nil
}

func renderFinanceReportExcel(report financeReportData) ([]byte, string, error) {
	f := excelize.NewFile()
	defer func() {
		_ = f.Close()
	}()

	summarySheet := "Ringkasan"
	f.SetSheetName("Sheet1", summarySheet)
	invoiceSheet := "Invoice"
	paymentMethodSheet := "Metode Bayar"
	statusSheet := "Status Invoice"
	topItemSheet := "Top Item"
	f.NewSheet(invoiceSheet)
	f.NewSheet(paymentMethodSheet)
	f.NewSheet(statusSheet)
	f.NewSheet(topItemSheet)

	headerStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Color: "#FFFFFF"}, Fill: excelize.Fill{Type: "pattern", Color: []string{"#14532D"}, Pattern: 1}, Alignment: &excelize.Alignment{Horizontal: "center"}})
	currencyStyle, _ := f.NewStyle(&excelize.Style{NumFmt: 3})

	summaryRows := [][]any{
		{"Laporan", "Laporan Keuangan Klinik"},
		{"Periode", report.Summary.PeriodLabel},
		{"Dicetak", formatDateTimeIndonesian(report.GeneratedAt)},
		{"Total Invoice", report.Summary.InvoiceCount},
		{"Invoice Lunas", report.Summary.PaidInvoices},
		{"Invoice Sebagian", report.Summary.PartialInvoices},
		{"Invoice Belum Bayar", report.Summary.UnpaidInvoices},
		{"Subtotal", report.Summary.SubTotal},
		{"Diskon", report.Summary.DiscountTotal},
		{"Pajak", report.Summary.TaxTotal},
		{"Total Tagihan", report.Summary.InvoiceTotal},
		{"Total Pembayaran", report.Summary.PaymentTotal},
		{"Sisa Piutang", report.Summary.OutstandingTotal},
		{"Rata-rata Invoice", report.Summary.AverageInvoice},
	}
	for index, row := range summaryRows {
		cellA, _ := excelize.CoordinatesToCellName(1, index+1)
		cellB, _ := excelize.CoordinatesToCellName(2, index+1)
		f.SetCellValue(summarySheet, cellA, row[0])
		f.SetCellValue(summarySheet, cellB, row[1])
	}
	f.SetColWidth(summarySheet, "A", "A", 28)
	f.SetColWidth(summarySheet, "B", "B", 24)
	f.SetCellStyle(summarySheet, "B8", "B14", currencyStyle)

	writeDashboardReportSheetHeader(f, paymentMethodSheet, []string{"Metode Pembayaran", "Transaksi", "Total"}, headerStyle)
	for index, row := range report.PaymentMethods {
		writeDashboardReportSheetRow(f, paymentMethodSheet, index+2, []any{row.MethodName, row.TransactionCount, row.AmountTotal})
	}
	f.SetColWidth(paymentMethodSheet, "A", "A", 28)
	f.SetColWidth(paymentMethodSheet, "B", "C", 16)
	f.SetCellStyle(paymentMethodSheet, "C2", fmt.Sprintf("C%d", len(report.PaymentMethods)+1), currencyStyle)

	writeDashboardReportSheetHeader(f, statusSheet, []string{"Status", "Jumlah", "Tagihan", "Terbayar", "Piutang"}, headerStyle)
	for index, row := range report.InvoiceStatuses {
		writeDashboardReportSheetRow(f, statusSheet, index+2, []any{row.StatusName, row.InvoiceCount, row.InvoiceTotal, row.PaidTotal, row.OutstandingTotal})
	}
	f.SetColWidth(statusSheet, "A", "A", 20)
	f.SetColWidth(statusSheet, "B", "E", 18)
	f.SetCellStyle(statusSheet, "C2", fmt.Sprintf("E%d", len(report.InvoiceStatuses)+1), currencyStyle)

	writeDashboardReportSheetHeader(f, topItemSheet, []string{"Deskripsi", "Qty", "Nilai"}, headerStyle)
	for index, row := range report.TopItems {
		writeDashboardReportSheetRow(f, topItemSheet, index+2, []any{row.Description, row.QuantityTotal, row.RevenueTotal})
	}
	f.SetColWidth(topItemSheet, "A", "A", 44)
	f.SetColWidth(topItemSheet, "B", "C", 16)
	f.SetCellStyle(topItemSheet, "C2", fmt.Sprintf("C%d", len(report.TopItems)+1), currencyStyle)

	writeDashboardReportSheetHeader(f, invoiceSheet, []string{"Tanggal", "Invoice", "Visit", "Pasien", "Status", "Subtotal", "Diskon", "Pajak", "Total", "Terbayar", "Piutang"}, headerStyle)
	for index, row := range report.Invoices {
		writeDashboardReportSheetRow(f, invoiceSheet, index+2, []any{row.InvoiceDate, row.InvoiceNumber, row.VisitNumber, row.PatientName, row.InvoiceStatus, row.SubTotal, row.Discount, row.Tax, row.TotalAmount, row.PaidAmount, row.OutstandingTotal})
	}
	f.SetColWidth(invoiceSheet, "A", "K", 18)
	f.SetColWidth(invoiceSheet, "D", "D", 28)
	f.SetCellStyle(invoiceSheet, "F2", fmt.Sprintf("K%d", len(report.Invoices)+1), currencyStyle)

	f.SetActiveSheet(0)
	var output bytes.Buffer
	if err := f.Write(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("laporan-keuangan-%s-sd-%s.xlsx", report.StartDate.Format("20060102"), report.EndDate.Format("20060102"))
	return output.Bytes(), fileName, nil
}

func buildFinanceReportPaymentMethodRows(items []financeReportPaymentMethodRow) [][]string {
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{item.MethodName, formatDashboardReportInt(item.TransactionCount), formatDashboardReportCurrency(item.AmountTotal)})
	}
	if len(rows) == 0 {
		rows = append(rows, []string{"-", "0", formatDashboardReportCurrency(0)})
	}
	return rows
}

func buildFinanceReportInvoiceStatusRows(items []financeReportInvoiceStatusRow) [][]string {
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{item.StatusName, formatDashboardReportInt(item.InvoiceCount), formatDashboardReportCurrency(item.InvoiceTotal), formatDashboardReportCurrency(item.PaidTotal), formatDashboardReportCurrency(item.OutstandingTotal)})
	}
	if len(rows) == 0 {
		rows = append(rows, []string{"-", "0", formatDashboardReportCurrency(0), formatDashboardReportCurrency(0), formatDashboardReportCurrency(0)})
	}
	return rows
}

func buildFinanceReportTopItemRows(items []financeReportTopItemRow) [][]string {
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{item.Description, formatDashboardReportInt(item.QuantityTotal), formatDashboardReportCurrency(item.RevenueTotal)})
	}
	if len(rows) == 0 {
		rows = append(rows, []string{"Belum ada item", "0", formatDashboardReportCurrency(0)})
	}
	return rows
}

func addFinanceReportInvoicesTable(pdf *gofpdf.Fpdf, rows []financeReportInvoiceRow) {
	addInitialAssessmentSectionTitle(pdf, "DETAIL INVOICE")
	headers := []string{"Tanggal", "Invoice", "Visit", "Pasien", "Status", "Total", "Terbayar", "Piutang"}
	widths := []float64{24, 31, 24, 56, 25, 28, 28, 28}
	drawHeader := func() {
		pdf.SetFont("Arial", "B", 8)
		pdf.SetFillColor(20, 83, 45)
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
			addInitialAssessmentSectionTitle(pdf, "DETAIL INVOICE")
			drawHeader()
		})
		cells := []string{
			dashboardReportShortDate(row.InvoiceDate),
			row.InvoiceNumber,
			row.VisitNumber,
			row.PatientName,
			row.InvoiceStatus,
			formatDashboardReportCurrency(row.TotalAmount),
			formatDashboardReportCurrency(row.PaidAmount),
			formatDashboardReportCurrency(row.OutstandingTotal),
		}
		for index, cell := range cells {
			align := "L"
			if index >= 5 {
				align = "R"
			}
			pdf.CellFormat(widths[index], 6.2, sanitizePDFSingleLineText(dashboardReportEllipsis(cell, 30)), "1", 0, align, false, 0, "")
		}
		pdf.Ln(-1)
	}
	addInitialAssessmentSectionSpacing(pdf)
}
