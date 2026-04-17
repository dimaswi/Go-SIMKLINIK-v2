package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"github.com/xuri/excelize/v2"
)

type reportCenterColumn struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Kind  string `json:"kind"`
}

type reportCenterMetric struct {
	Label  string `json:"label"`
	Value  string `json:"value"`
	Helper string `json:"helper,omitempty"`
}

type reportCenterDataset struct {
	ReportType  string               `json:"report_type"`
	Title       string               `json:"title"`
	Subtitle    string               `json:"subtitle"`
	Columns     []reportCenterColumn `json:"columns"`
	Metrics     []reportCenterMetric `json:"metrics"`
	Rows        []map[string]any     `json:"rows"`
	GeneratedAt time.Time            `json:"generated_at"`
	StartDate   time.Time            `json:"start_date"`
	EndDate     time.Time            `json:"end_date"`
	PeriodText  string               `json:"period_text"`
	ExportName  string               `json:"-"`
}

type reportCenterBuilder func(startDate time.Time, endDate time.Time) (reportCenterDataset, error)

type reportCenterDefinition struct {
	Title     string
	ExportKey string
	Builder   reportCenterBuilder
}

var reportCenterDefinitions = map[string]reportCenterDefinition{
	"kunjungan": {
		Title:     "Laporan Kunjungan",
		ExportKey: "laporan-kunjungan",
		Builder:   buildVisitReportDataset,
	},
	"keuangan": {
		Title:     "Laporan Keuangan",
		ExportKey: "laporan-keuangan",
		Builder:   buildFinanceSummaryReportDataset,
	},
	"pasien": {
		Title:     "Laporan Demografi Pasien",
		ExportKey: "laporan-demografi-pasien",
		Builder:   buildPatientDemographyReportDataset,
	},
	"diagnosa": {
		Title:     "Laporan Diagnosa",
		ExportKey: "laporan-diagnosa",
		Builder:   buildDiagnosisReportDataset,
	},
	"farmasi": {
		Title:     "Laporan Farmasi",
		ExportKey: "laporan-farmasi",
		Builder:   buildPharmacyReportDataset,
	},
	"penunjang": {
		Title:     "Laporan Lab dan Radiologi",
		ExportKey: "laporan-penunjang",
		Builder:   buildAncillaryReportDataset,
	},
	"kinerja": {
		Title:     "Laporan Kinerja Dokter dan Poliklinik",
		ExportKey: "laporan-kinerja",
		Builder:   buildPerformanceReportDataset,
	},
	"rl-rawat-jalan": {
		Title:     "RL Rawat Jalan",
		ExportKey: "laporan-rl-rawat-jalan",
		Builder:   buildRLOutpatientReportDataset,
	},
}

func GetReportCenterPreview(c *gin.Context) {
	startDate, endDate, err := parseDashboardReportRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reportType := normalizeReportCenterType(c.Query("type"))
	def, ok := reportCenterDefinitions[reportType]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jenis laporan tidak dikenali"})
		return
	}

	dataset, err := def.Builder(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyiapkan preview laporan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": dataset})
}

func ExportReportCenterPDF(c *gin.Context) {
	startDate, endDate, err := parseDashboardReportRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reportType := normalizeReportCenterType(c.Query("type"))
	def, ok := reportCenterDefinitions[reportType]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jenis laporan tidak dikenali"})
		return
	}

	dataset, err := def.Builder(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyiapkan export PDF"})
		return
	}

	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderReportCenterPDF(hospitalInfo, dataset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF laporan"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func ExportReportCenterExcel(c *gin.Context) {
	startDate, endDate, err := parseDashboardReportRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reportType := normalizeReportCenterType(c.Query("type"))
	def, ok := reportCenterDefinitions[reportType]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jenis laporan tidak dikenali"})
		return
	}

	dataset, err := def.Builder(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyiapkan export Excel"})
		return
	}

	xlsxBytes, fileName, err := renderReportCenterExcel(dataset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat Excel laporan"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBytes)
}

func normalizeReportCenterType(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	if trimmed == "" {
		return "kunjungan"
	}
	return trimmed
}

func newReportCenterDataset(reportType, title, subtitle, exportName string, startDate time.Time, endDate time.Time) reportCenterDataset {
	return reportCenterDataset{
		ReportType:  reportType,
		Title:       title,
		Subtitle:    subtitle,
		GeneratedAt: time.Now(),
		StartDate:   startDate,
		EndDate:     endDate,
		PeriodText:  fmt.Sprintf("%s s/d %s", formatDateIndonesian(startDate), formatDateIndonesian(endDate)),
		ExportName:  exportName,
		Rows:        make([]map[string]any, 0),
	}
}

func buildVisitReportDataset(startDate time.Time, endDate time.Time) (reportCenterDataset, error) {
	endExclusive := endDate.AddDate(0, 0, 1)
	dataset := newReportCenterDataset(
		"kunjungan",
		"Laporan Kunjungan",
		"Ringkasan lalu lintas kunjungan rawat jalan, antrian, dan status layanan per visit.",
		"laporan-kunjungan",
		startDate,
		endDate,
	)
	dataset.Columns = []reportCenterColumn{
		{Key: "visit_date", Label: "Tanggal", Kind: "date"},
		{Key: "visit_number", Label: "No Visit", Kind: "text"},
		{Key: "patient_name", Label: "Pasien", Kind: "text"},
		{Key: "doctor_name", Label: "Dokter", Kind: "text"},
		{Key: "polyclinic_name", Label: "Poliklinik", Kind: "text"},
		{Key: "visit_status", Label: "Status Visit", Kind: "badge"},
		{Key: "queue_status", Label: "Status Antrian", Kind: "badge"},
		{Key: "payment_type", Label: "Pembayaran", Kind: "text"},
		{Key: "invoice_number", Label: "Invoice", Kind: "text"},
		{Key: "invoice_total", Label: "Tagihan", Kind: "currency"},
	}

	var visitCount, completedCount, cancelledCount, uniquePatients int64
	var revenueTotal float64
	database.DB.Table("visits").Where("deleted_at IS NULL AND visit_date >= ? AND visit_date < ?", startDate, endExclusive).Count(&visitCount)
	database.DB.Table("visits").Where("deleted_at IS NULL AND visit_date >= ? AND visit_date < ? AND status = ?", startDate, endExclusive, "completed").Count(&completedCount)
	database.DB.Table("visits").Where("deleted_at IS NULL AND visit_date >= ? AND visit_date < ? AND status = ?", startDate, endExclusive, "cancelled").Count(&cancelledCount)
	database.DB.Table("visits").Distinct("patient_id").Where("deleted_at IS NULL AND visit_date >= ? AND visit_date < ?", startDate, endExclusive).Count(&uniquePatients)
	database.DB.Table("payments").Select("COALESCE(SUM(amount), 0)").Where("payment_date >= ? AND payment_date < ?", startDate, endExclusive).Scan(&revenueTotal)
	dataset.Metrics = []reportCenterMetric{
		{Label: "Total Kunjungan", Value: formatDashboardReportInt(visitCount), Helper: "Semua status kunjungan pada periode aktif"},
		{Label: "Kunjungan Selesai", Value: formatDashboardReportInt(completedCount), Helper: "Visit yang sudah selesai dilayani"},
		{Label: "Pasien Unik", Value: formatDashboardReportInt(uniquePatients), Helper: "Pasien berbeda yang datang pada periode ini"},
		{Label: "Pendapatan Masuk", Value: formatDashboardReportCurrency(revenueTotal), Helper: "Pembayaran tercatat pada periode aktif"},
	}

	query := `
		SELECT
			to_char(v.visit_date, 'YYYY-MM-DD') AS visit_date,
			v.visit_number,
			p.full_name AS patient_name,
			d.full_name AS doctor_name,
			poly.name AS polyclinic_name,
			COALESCE(v.status, '-') AS visit_status,
			COALESCE(v.queue_status, '-') AS queue_status,
			COALESCE(v.payment_type, '-') AS payment_type,
			COALESCE(inv.invoice_number, '-') AS invoice_number,
			COALESCE(inv.total_amount, 0) AS invoice_total
		FROM visits v
		JOIN patients p ON p.id = v.patient_id
		JOIN doctors d ON d.id = v.doctor_id
		JOIN polyclinics poly ON poly.id = v.polyclinic_id
		LEFT JOIN invoices inv ON inv.visit_id = v.id AND inv.deleted_at IS NULL
		WHERE v.deleted_at IS NULL AND v.visit_date >= ? AND v.visit_date < ?
		ORDER BY v.visit_date DESC, v.visit_number DESC`
	if err := database.DB.Raw(query, startDate, endExclusive).Scan(&dataset.Rows).Error; err != nil {
		return reportCenterDataset{}, err
	}
	dataset.Rows = normalizeReportCenterRows(dataset.Rows)
	return dataset, nil
}

func buildFinanceSummaryReportDataset(startDate time.Time, endDate time.Time) (reportCenterDataset, error) {
	endExclusive := endDate.AddDate(0, 0, 1)
	dataset := newReportCenterDataset(
		"keuangan",
		"Laporan Keuangan dan Pembayaran",
		"Rekap invoice, diskon, pajak, status pembayaran, dan piutang pasien.",
		"laporan-keuangan",
		startDate,
		endDate,
	)
	dataset.Columns = []reportCenterColumn{
		{Key: "invoice_date", Label: "Tanggal", Kind: "date"},
		{Key: "invoice_number", Label: "Invoice", Kind: "text"},
		{Key: "visit_number", Label: "No Visit", Kind: "text"},
		{Key: "patient_name", Label: "Pasien", Kind: "text"},
		{Key: "invoice_status", Label: "Status", Kind: "badge"},
		{Key: "sub_total", Label: "Subtotal", Kind: "currency"},
		{Key: "discount", Label: "Diskon", Kind: "currency"},
		{Key: "tax", Label: "Pajak", Kind: "currency"},
		{Key: "total_amount", Label: "Total", Kind: "currency"},
		{Key: "paid_amount", Label: "Terbayar", Kind: "currency"},
		{Key: "outstanding_total", Label: "Piutang", Kind: "currency"},
	}

	var invoiceCount, paidInvoices, unpaidInvoices int64
	var billedTotal, paymentTotal, outstandingTotal float64
	database.DB.Table("invoices").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ?", startDate, endExclusive).Count(&invoiceCount)
	database.DB.Table("invoices").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ? AND status = ?", startDate, endExclusive, "lunas").Count(&paidInvoices)
	database.DB.Table("invoices").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ? AND status IN ?", startDate, endExclusive, []string{"belum_bayar", "sebagian"}).Count(&unpaidInvoices)
	database.DB.Table("invoices").Select("COALESCE(SUM(total_amount), 0)").Where("deleted_at IS NULL AND invoice_date >= ? AND invoice_date < ?", startDate, endExclusive).Scan(&billedTotal)
	database.DB.Table("payments").Select("COALESCE(SUM(amount), 0)").Where("payment_date >= ? AND payment_date < ?", startDate, endExclusive).Scan(&paymentTotal)
	outstandingQuery := `
		SELECT COALESCE(SUM(GREATEST(inv.total_amount - COALESCE(pay.total_paid, 0), 0)), 0)
		FROM invoices inv
		LEFT JOIN (
			SELECT invoice_id, SUM(amount) AS total_paid
			FROM payments
			GROUP BY invoice_id
		) pay ON pay.invoice_id = inv.id
		WHERE inv.deleted_at IS NULL AND inv.invoice_date >= ? AND inv.invoice_date < ?`
	database.DB.Raw(outstandingQuery, startDate, endExclusive).Scan(&outstandingTotal)
	dataset.Metrics = []reportCenterMetric{
		{Label: "Total Invoice", Value: formatDashboardReportInt(invoiceCount), Helper: "Semua tagihan pada periode aktif"},
		{Label: "Invoice Lunas", Value: formatDashboardReportInt(paidInvoices), Helper: "Invoice yang sudah lunas"},
		{Label: "Total Tagihan", Value: formatDashboardReportCurrency(billedTotal), Helper: "Nilai invoice sebelum piutang"},
		{Label: "Sisa Piutang", Value: formatDashboardReportCurrency(outstandingTotal), Helper: "Tagihan yang belum tertutup pembayaran"},
	}

	query := `
		SELECT
			to_char(inv.invoice_date, 'YYYY-MM-DD') AS invoice_date,
			inv.invoice_number,
			COALESCE(v.visit_number, '-') AS visit_number,
			COALESCE(p.full_name, '-') AS patient_name,
			COALESCE(inv.status, '-') AS invoice_status,
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
	if err := database.DB.Raw(query, startDate, endExclusive).Scan(&dataset.Rows).Error; err != nil {
		return reportCenterDataset{}, err
	}
	dataset.Rows = normalizeReportCenterRows(dataset.Rows)
	_ = paymentTotal
	return dataset, nil
}

func buildPatientDemographyReportDataset(startDate time.Time, endDate time.Time) (reportCenterDataset, error) {
	endExclusive := endDate.AddDate(0, 0, 1)
	dataset := newReportCenterDataset(
		"pasien",
		"Laporan Demografi Pasien",
		"Komposisi pasien berdasarkan gender, kelompok umur, jenis penjamin, dan wilayah domisili.",
		"laporan-demografi-pasien",
		startDate,
		endDate,
	)
	dataset.Columns = []reportCenterColumn{
		{Key: "segment_group", Label: "Kelompok", Kind: "text"},
		{Key: "segment_name", Label: "Kategori", Kind: "text"},
		{Key: "patient_count", Label: "Jumlah Pasien", Kind: "number"},
		{Key: "visit_count", Label: "Jumlah Kunjungan", Kind: "number"},
		{Key: "invoice_total", Label: "Tagihan", Kind: "currency"},
	}

	var totalPatients, newPatients int64
	database.DB.Table("patients").Where("deleted_at IS NULL").Count(&totalPatients)
	database.DB.Table("patients").Where("deleted_at IS NULL AND created_at >= ? AND created_at < ?", startDate, endExclusive).Count(&newPatients)
	var activePatients int64
	database.DB.Table("visits").Distinct("patient_id").Where("deleted_at IS NULL AND visit_date >= ? AND visit_date < ?", startDate, endExclusive).Count(&activePatients)
	dataset.Metrics = []reportCenterMetric{
		{Label: "Total Pasien", Value: formatDashboardReportInt(totalPatients), Helper: "Seluruh pasien aktif di master data"},
		{Label: "Pasien Baru", Value: formatDashboardReportInt(newPatients), Helper: "Registrasi pasien baru pada periode aktif"},
		{Label: "Pasien Berkunjung", Value: formatDashboardReportInt(activePatients), Helper: "Pasien unik yang benar-benar datang"},
		{Label: "Cakupan Kunjungan", Value: formatPercent(activePatients, totalPatients), Helper: "Proporsi pasien aktif yang datang"},
	}

	rows := make([]map[string]any, 0)
	appendQueryRows := func(group string, query string, args ...any) error {
		var result []map[string]any
		if err := database.DB.Raw(query, args...).Scan(&result).Error; err != nil {
			return err
		}
		for _, row := range normalizeReportCenterRows(result) {
			row["segment_group"] = group
			rows = append(rows, row)
		}
		return nil
	}

	genderQuery := `
		SELECT
			CASE p.gender WHEN 'L' THEN 'Laki-laki' WHEN 'P' THEN 'Perempuan' ELSE 'Tidak Diisi' END AS segment_name,
			COUNT(DISTINCT p.id) AS patient_count,
			COUNT(v.id) AS visit_count,
			COALESCE(SUM(inv.total_amount), 0) AS invoice_total
		FROM patients p
		LEFT JOIN visits v ON v.patient_id = p.id AND v.deleted_at IS NULL AND v.visit_date >= ? AND v.visit_date < ?
		LEFT JOIN invoices inv ON inv.visit_id = v.id AND inv.deleted_at IS NULL
		WHERE p.deleted_at IS NULL
		GROUP BY p.gender
		ORDER BY patient_count DESC, segment_name ASC`
	if err := appendQueryRows("Gender", genderQuery, startDate, endExclusive); err != nil {
		return reportCenterDataset{}, err
	}

	ageQuery := `
		SELECT
			CASE
				WHEN p.birth_date IS NULL THEN 'Tidak Diisi'
				WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) < 18 THEN '0-17 tahun'
				WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) < 45 THEN '18-44 tahun'
				WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) < 65 THEN '45-64 tahun'
				ELSE '65+ tahun'
			END AS segment_name,
			COUNT(DISTINCT p.id) AS patient_count,
			COUNT(v.id) AS visit_count,
			COALESCE(SUM(inv.total_amount), 0) AS invoice_total
		FROM patients p
		LEFT JOIN visits v ON v.patient_id = p.id AND v.deleted_at IS NULL AND v.visit_date >= ? AND v.visit_date < ?
		LEFT JOIN invoices inv ON inv.visit_id = v.id AND inv.deleted_at IS NULL
		WHERE p.deleted_at IS NULL
		GROUP BY 1
		ORDER BY patient_count DESC, segment_name ASC`
	if err := appendQueryRows("Kelompok Umur", ageQuery, startDate, endExclusive); err != nil {
		return reportCenterDataset{}, err
	}

	insuranceQuery := `
		SELECT
			COALESCE(NULLIF(TRIM(p.insurance_type), ''), 'Umum / Tidak Diisi') AS segment_name,
			COUNT(DISTINCT p.id) AS patient_count,
			COUNT(v.id) AS visit_count,
			COALESCE(SUM(inv.total_amount), 0) AS invoice_total
		FROM patients p
		LEFT JOIN visits v ON v.patient_id = p.id AND v.deleted_at IS NULL AND v.visit_date >= ? AND v.visit_date < ?
		LEFT JOIN invoices inv ON inv.visit_id = v.id AND inv.deleted_at IS NULL
		WHERE p.deleted_at IS NULL
		GROUP BY 1
		ORDER BY patient_count DESC, segment_name ASC
		LIMIT 10`
	if err := appendQueryRows("Penjamin", insuranceQuery, startDate, endExclusive); err != nil {
		return reportCenterDataset{}, err
	}

	cityQuery := `
		SELECT
			COALESCE(NULLIF(TRIM(p.city), ''), 'Tidak Diisi') AS segment_name,
			COUNT(DISTINCT p.id) AS patient_count,
			COUNT(v.id) AS visit_count,
			COALESCE(SUM(inv.total_amount), 0) AS invoice_total
		FROM patients p
		LEFT JOIN visits v ON v.patient_id = p.id AND v.deleted_at IS NULL AND v.visit_date >= ? AND v.visit_date < ?
		LEFT JOIN invoices inv ON inv.visit_id = v.id AND inv.deleted_at IS NULL
		WHERE p.deleted_at IS NULL
		GROUP BY 1
		ORDER BY patient_count DESC, segment_name ASC
		LIMIT 10`
	if err := appendQueryRows("Wilayah Kota", cityQuery, startDate, endExclusive); err != nil {
		return reportCenterDataset{}, err
	}

	dataset.Rows = rows
	return dataset, nil
}

func buildDiagnosisReportDataset(startDate time.Time, endDate time.Time) (reportCenterDataset, error) {
	endExclusive := endDate.AddDate(0, 0, 1)
	dataset := newReportCenterDataset(
		"diagnosa",
		"Laporan Diagnosa dan Pola Penyakit",
		"Frekuensi diagnosa ICD-10 lengkap dengan komposisi gender dan kelompok umur pasien.",
		"laporan-diagnosa",
		startDate,
		endDate,
	)
	dataset.Columns = []reportCenterColumn{
		{Key: "code", Label: "Kode ICD-10", Kind: "text"},
		{Key: "diagnosis_name", Label: "Diagnosa", Kind: "text"},
		{Key: "case_count", Label: "Kasus", Kind: "number"},
		{Key: "male_count", Label: "Laki-laki", Kind: "number"},
		{Key: "female_count", Label: "Perempuan", Kind: "number"},
		{Key: "child_count", Label: "0-17", Kind: "number"},
		{Key: "adult_count", Label: "18-44", Kind: "number"},
		{Key: "senior_count", Label: "45+", Kind: "number"},
	}

	var diagnosisCount int64
	database.DB.Table("medical_record_diagnoses mrd").Joins("JOIN medical_records mr ON mr.id = mrd.medical_record_id").Where("mrd.deleted_at IS NULL AND mr.deleted_at IS NULL AND mr.record_date >= ? AND mr.record_date < ?", startDate, endExclusive).Count(&diagnosisCount)
	var uniqueCodes int64
	database.DB.Table("medical_record_diagnoses mrd").Distinct("mrd.icd10_id").Joins("JOIN medical_records mr ON mr.id = mrd.medical_record_id").Where("mrd.deleted_at IS NULL AND mr.deleted_at IS NULL AND mr.record_date >= ? AND mr.record_date < ?", startDate, endExclusive).Count(&uniqueCodes)
	dataset.Metrics = []reportCenterMetric{
		{Label: "Total Entri Diagnosa", Value: formatDashboardReportInt(diagnosisCount), Helper: "Semua diagnosis pada periode aktif"},
		{Label: "Kode ICD Aktif", Value: formatDashboardReportInt(uniqueCodes), Helper: "Jumlah kode ICD-10 yang muncul"},
		{Label: "Periode", Value: dataset.PeriodText, Helper: "Rentang evaluasi laporan"},
	}

	query := `
		SELECT
			COALESCE(i.code, '-') AS code,
			COALESCE(i.name, '-') AS diagnosis_name,
			COUNT(*) AS case_count,
			SUM(CASE WHEN p.gender = 'L' THEN 1 ELSE 0 END) AS male_count,
			SUM(CASE WHEN p.gender = 'P' THEN 1 ELSE 0 END) AS female_count,
			SUM(CASE WHEN p.birth_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(mr.record_date, p.birth_date)) < 18 THEN 1 ELSE 0 END) AS child_count,
			SUM(CASE WHEN p.birth_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(mr.record_date, p.birth_date)) BETWEEN 18 AND 44 THEN 1 ELSE 0 END) AS adult_count,
			SUM(CASE WHEN p.birth_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(mr.record_date, p.birth_date)) >= 45 THEN 1 ELSE 0 END) AS senior_count
		FROM medical_record_diagnoses mrd
		JOIN medical_records mr ON mr.id = mrd.medical_record_id
		JOIN icd10 i ON i.id = mrd.icd10_id
		JOIN patients p ON p.id = mr.patient_id
		WHERE mrd.deleted_at IS NULL AND mr.deleted_at IS NULL AND mr.record_date >= ? AND mr.record_date < ?
		GROUP BY i.code, i.name
		ORDER BY case_count DESC, diagnosis_name ASC
		LIMIT 100`
	if err := database.DB.Raw(query, startDate, endExclusive).Scan(&dataset.Rows).Error; err != nil {
		return reportCenterDataset{}, err
	}
	dataset.Rows = normalizeReportCenterRows(dataset.Rows)
	return dataset, nil
}

func buildPharmacyReportDataset(startDate time.Time, endDate time.Time) (reportCenterDataset, error) {
	endExclusive := endDate.AddDate(0, 0, 1)
	dataset := newReportCenterDataset(
		"farmasi",
		"Laporan Pengobatan dan Farmasi",
		"Monitoring obat yang diresepkan, tingkat dispensing, dan posisi stok farmasi.",
		"laporan-farmasi",
		startDate,
		endDate,
	)
	dataset.Columns = []reportCenterColumn{
		{Key: "medicine_code", Label: "Kode Obat", Kind: "text"},
		{Key: "medicine_name", Label: "Nama Obat", Kind: "text"},
		{Key: "category_name", Label: "Kategori", Kind: "text"},
		{Key: "prescription_count", Label: "Jumlah Resep", Kind: "number"},
		{Key: "quantity_total", Label: "Qty Diresepkan", Kind: "number"},
		{Key: "dispensed_total", Label: "Qty Diserahkan", Kind: "number"},
		{Key: "current_stock", Label: "Stok", Kind: "number"},
		{Key: "min_stock", Label: "Min Stok", Kind: "number"},
	}

	var rxOrdered, rxDispensed int64
	database.DB.Table("medical_records").Where("deleted_at IS NULL AND prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status IN ?", startDate, endExclusive, []string{"ordered", "preparing", "ready", "dispensed"}).Count(&rxOrdered)
	database.DB.Table("medical_records").Where("deleted_at IS NULL AND prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status = ?", startDate, endExclusive, "dispensed").Count(&rxDispensed)
	var lowStockCount int64
	database.DB.Table("medicines").Where("deleted_at IS NULL AND is_active = ? AND current_stock <= min_stock", true).Count(&lowStockCount)
	dataset.Metrics = []reportCenterMetric{
		{Label: "Order Resep", Value: formatDashboardReportInt(rxOrdered), Helper: "Medical record yang mengeluarkan resep"},
		{Label: "Resep Terserah", Value: formatDashboardReportInt(rxDispensed), Helper: "Resep yang sampai status dispensed"},
		{Label: "Obat Low Stock", Value: formatDashboardReportInt(lowStockCount), Helper: "Master obat di bawah batas minimum"},
	}

	query := `
		SELECT
			m.code AS medicine_code,
			m.name AS medicine_name,
			COALESCE(mc.name, '-') AS category_name,
			COUNT(pr.id) AS prescription_count,
			COALESCE(SUM(pr.quantity), 0) AS quantity_total,
			COALESCE(SUM(d.quantity), 0) AS dispensed_total,
			COALESCE(m.current_stock, 0) AS current_stock,
			COALESCE(m.min_stock, 0) AS min_stock
		FROM prescriptions pr
		JOIN medical_records mr ON mr.id = pr.medical_record_id
		JOIN medicines m ON m.id = pr.medicine_id
		LEFT JOIN medicine_categories mc ON mc.id = m.category_id
		LEFT JOIN dispensings d ON d.prescription_id = pr.id AND d.deleted_at IS NULL
		WHERE pr.deleted_at IS NULL AND mr.deleted_at IS NULL AND mr.prescription_ordered_at >= ? AND mr.prescription_ordered_at < ?
		GROUP BY m.code, m.name, mc.name, m.current_stock, m.min_stock
		ORDER BY quantity_total DESC, prescription_count DESC
		LIMIT 100`
	if err := database.DB.Raw(query, startDate, endExclusive).Scan(&dataset.Rows).Error; err != nil {
		return reportCenterDataset{}, err
	}
	dataset.Rows = normalizeReportCenterRows(dataset.Rows)
	return dataset, nil
}

func buildAncillaryReportDataset(startDate time.Time, endDate time.Time) (reportCenterDataset, error) {
	endExclusive := endDate.AddDate(0, 0, 1)
	dataset := newReportCenterDataset(
		"penunjang",
		"Laporan Lab dan Radiologi",
		"Monitoring order penunjang, hasil, flag abnormal, dan rata-rata penyelesaian layanan.",
		"laporan-penunjang",
		startDate,
		endDate,
	)
	dataset.Columns = []reportCenterColumn{
		{Key: "service_type", Label: "Jenis", Kind: "badge"},
		{Key: "service_name", Label: "Pemeriksaan", Kind: "text"},
		{Key: "ordered_count", Label: "Ordered", Kind: "number"},
		{Key: "completed_count", Label: "Selesai", Kind: "number"},
		{Key: "abnormal_count", Label: "Abnormal", Kind: "number"},
		{Key: "avg_tat_hours", Label: "Rerata TAT (jam)", Kind: "number"},
	}

	var labOrdered, labCompleted, radOrdered, radCompleted int64
	database.DB.Table("medical_records").Where("deleted_at IS NULL AND laboratory_ordered_at >= ? AND laboratory_ordered_at < ? AND laboratory_workflow_status IN ?", startDate, endExclusive, []string{"ordered", "preparing", "completed"}).Count(&labOrdered)
	database.DB.Table("medical_records").Where("deleted_at IS NULL AND laboratory_ordered_at >= ? AND laboratory_ordered_at < ? AND laboratory_workflow_status = ?", startDate, endExclusive, "completed").Count(&labCompleted)
	database.DB.Table("medical_records").Where("deleted_at IS NULL AND radiology_ordered_at >= ? AND radiology_ordered_at < ? AND radiology_workflow_status IN ?", startDate, endExclusive, []string{"ordered", "preparing", "completed"}).Count(&radOrdered)
	database.DB.Table("medical_records").Where("deleted_at IS NULL AND radiology_ordered_at >= ? AND radiology_ordered_at < ? AND radiology_workflow_status = ?", startDate, endExclusive, "completed").Count(&radCompleted)
	dataset.Metrics = []reportCenterMetric{
		{Label: "Lab Ordered", Value: formatDashboardReportInt(labOrdered), Helper: "Medical record dengan order laboratorium"},
		{Label: "Lab Selesai", Value: formatDashboardReportInt(labCompleted), Helper: "Order laboratorium yang selesai"},
		{Label: "Rad Ordered", Value: formatDashboardReportInt(radOrdered), Helper: "Medical record dengan order radiologi"},
		{Label: "Rad Selesai", Value: formatDashboardReportInt(radCompleted), Helper: "Order radiologi yang selesai"},
	}

	query := `
		SELECT * FROM (
			SELECT
				'Laboratorium' AS service_type,
				COALESCE(loi.test_name_snapshot, '-') AS service_name,
				COUNT(loi.id) AS ordered_count,
				SUM(CASE WHEN loi.result_date IS NOT NULL THEN 1 ELSE 0 END) AS completed_count,
				SUM(CASE WHEN COALESCE(loi.flag, '') IN ('high', 'low', 'critical', 'abnormal') THEN 1 ELSE 0 END) AS abnormal_count,
				ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (loi.result_date - mr.laboratory_ordered_at)) / 3600), 0)::numeric, 2) AS avg_tat_hours
			FROM laboratory_order_items loi
			JOIN medical_records mr ON mr.id = loi.medical_record_id
			WHERE mr.deleted_at IS NULL AND mr.laboratory_ordered_at >= ? AND mr.laboratory_ordered_at < ?
			GROUP BY loi.test_name_snapshot
			UNION ALL
			SELECT
				'Radiologi' AS service_type,
				COALESCE(roi.service_name_snapshot, '-') AS service_name,
				COUNT(roi.id) AS ordered_count,
				SUM(CASE WHEN roi.result_date IS NOT NULL THEN 1 ELSE 0 END) AS completed_count,
				0 AS abnormal_count,
				ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (roi.result_date - mr.radiology_ordered_at)) / 3600), 0)::numeric, 2) AS avg_tat_hours
			FROM radiology_order_items roi
			JOIN medical_records mr ON mr.id = roi.medical_record_id
			WHERE mr.deleted_at IS NULL AND mr.radiology_ordered_at >= ? AND mr.radiology_ordered_at < ?
			GROUP BY roi.service_name_snapshot
		) items
		ORDER BY ordered_count DESC, service_name ASC
		LIMIT 100`
	if err := database.DB.Raw(query, startDate, endExclusive, startDate, endExclusive).Scan(&dataset.Rows).Error; err != nil {
		return reportCenterDataset{}, err
	}
	dataset.Rows = normalizeReportCenterRows(dataset.Rows)
	return dataset, nil
}

func buildPerformanceReportDataset(startDate time.Time, endDate time.Time) (reportCenterDataset, error) {
	endExclusive := endDate.AddDate(0, 0, 1)
	dataset := newReportCenterDataset(
		"kinerja",
		"Laporan Kinerja Dokter dan Poliklinik",
		"Perbandingan volume kunjungan, penyelesaian layanan, dan kontribusi pendapatan tiap unit layanan.",
		"laporan-kinerja",
		startDate,
		endDate,
	)
	dataset.Columns = []reportCenterColumn{
		{Key: "entity_type", Label: "Jenis", Kind: "badge"},
		{Key: "entity_name", Label: "Nama", Kind: "text"},
		{Key: "descriptor", Label: "Keterangan", Kind: "text"},
		{Key: "total_visits", Label: "Kunjungan", Kind: "number"},
		{Key: "completed_visits", Label: "Selesai", Kind: "number"},
		{Key: "cancelled_visits", Label: "Batal", Kind: "number"},
		{Key: "revenue_total", Label: "Revenue", Kind: "currency"},
	}

	var activeDoctors, activePolyclinics int64
	database.DB.Table("doctors").Where("deleted_at IS NULL AND is_active = ?", true).Count(&activeDoctors)
	database.DB.Table("polyclinics").Where("deleted_at IS NULL AND is_active = ?", true).Count(&activePolyclinics)
	var totalVisits int64
	database.DB.Table("visits").Where("deleted_at IS NULL AND visit_date >= ? AND visit_date < ?", startDate, endExclusive).Count(&totalVisits)
	dataset.Metrics = []reportCenterMetric{
		{Label: "Dokter Aktif", Value: formatDashboardReportInt(activeDoctors), Helper: "Dokter dengan status aktif"},
		{Label: "Poliklinik Aktif", Value: formatDashboardReportInt(activePolyclinics), Helper: "Unit layanan aktif"},
		{Label: "Visit Tercatat", Value: formatDashboardReportInt(totalVisits), Helper: "Semua kunjungan pada periode aktif"},
	}

	query := `
		SELECT * FROM (
			SELECT
				'Dokter' AS entity_type,
				COALESCE(d.full_name, '-') AS entity_name,
				COALESCE(NULLIF(TRIM(d.specialization), ''), '-') AS descriptor,
				COUNT(v.id) AS total_visits,
				SUM(CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END) AS completed_visits,
				SUM(CASE WHEN v.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_visits,
				COALESCE(SUM(inv.total_amount), 0) AS revenue_total
			FROM visits v
			JOIN doctors d ON d.id = v.doctor_id
			LEFT JOIN invoices inv ON inv.visit_id = v.id AND inv.deleted_at IS NULL
			WHERE v.deleted_at IS NULL AND v.visit_date >= ? AND v.visit_date < ?
			GROUP BY d.full_name, d.specialization
			UNION ALL
			SELECT
				'Poliklinik' AS entity_type,
				COALESCE(poly.name, '-') AS entity_name,
				COALESCE(poly.code, '-') AS descriptor,
				COUNT(v.id) AS total_visits,
				SUM(CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END) AS completed_visits,
				SUM(CASE WHEN v.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_visits,
				COALESCE(SUM(inv.total_amount), 0) AS revenue_total
			FROM visits v
			JOIN polyclinics poly ON poly.id = v.polyclinic_id
			LEFT JOIN invoices inv ON inv.visit_id = v.id AND inv.deleted_at IS NULL
			WHERE v.deleted_at IS NULL AND v.visit_date >= ? AND v.visit_date < ?
			GROUP BY poly.name, poly.code
		) perf
		ORDER BY total_visits DESC, entity_name ASC
		LIMIT 100`
	if err := database.DB.Raw(query, startDate, endExclusive, startDate, endExclusive).Scan(&dataset.Rows).Error; err != nil {
		return reportCenterDataset{}, err
	}
	dataset.Rows = normalizeReportCenterRows(dataset.Rows)
	return dataset, nil
}

func buildRLOutpatientReportDataset(startDate time.Time, endDate time.Time) (reportCenterDataset, error) {
	endExclusive := endDate.AddDate(0, 0, 1)
	dataset := newReportCenterDataset(
		"rl-rawat-jalan",
		"RL Rawat Jalan",
		"Pendekatan RL rawat jalan berbasis morbiditas ICD-10, gender, dan kelompok umur pasien rawat jalan.",
		"laporan-rl-rawat-jalan",
		startDate,
		endDate,
	)
	dataset.Columns = []reportCenterColumn{
		{Key: "code", Label: "Kode ICD-10", Kind: "text"},
		{Key: "diagnosis_name", Label: "Diagnosa", Kind: "text"},
		{Key: "male_count", Label: "L", Kind: "number"},
		{Key: "female_count", Label: "P", Kind: "number"},
		{Key: "age_0_17", Label: "0-17", Kind: "number"},
		{Key: "age_18_44", Label: "18-44", Kind: "number"},
		{Key: "age_45_64", Label: "45-64", Kind: "number"},
		{Key: "age_65_plus", Label: "65+", Kind: "number"},
		{Key: "total_cases", Label: "Total", Kind: "number"},
	}

	var totalCases, distinctCodes int64
	database.DB.Table("medical_record_diagnoses mrd").Joins("JOIN medical_records mr ON mr.id = mrd.medical_record_id").Where("mrd.deleted_at IS NULL AND mr.deleted_at IS NULL AND mr.record_date >= ? AND mr.record_date < ?", startDate, endExclusive).Count(&totalCases)
	database.DB.Table("medical_record_diagnoses mrd").Distinct("mrd.icd10_id").Joins("JOIN medical_records mr ON mr.id = mrd.medical_record_id").Where("mrd.deleted_at IS NULL AND mr.deleted_at IS NULL AND mr.record_date >= ? AND mr.record_date < ?", startDate, endExclusive).Count(&distinctCodes)
	dataset.Metrics = []reportCenterMetric{
		{Label: "Kasus RL", Value: formatDashboardReportInt(totalCases), Helper: "Total diagnosis rawat jalan pada periode aktif"},
		{Label: "Kode Morbiditas", Value: formatDashboardReportInt(distinctCodes), Helper: "Jumlah kode ICD yang masuk RL"},
		{Label: "Periode RL", Value: dataset.PeriodText, Helper: "Sesuai filter report center"},
	}

	query := `
		SELECT
			COALESCE(i.code, '-') AS code,
			COALESCE(i.name, '-') AS diagnosis_name,
			SUM(CASE WHEN p.gender = 'L' THEN 1 ELSE 0 END) AS male_count,
			SUM(CASE WHEN p.gender = 'P' THEN 1 ELSE 0 END) AS female_count,
			SUM(CASE WHEN p.birth_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(mr.record_date, p.birth_date)) < 18 THEN 1 ELSE 0 END) AS age_0_17,
			SUM(CASE WHEN p.birth_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(mr.record_date, p.birth_date)) BETWEEN 18 AND 44 THEN 1 ELSE 0 END) AS age_18_44,
			SUM(CASE WHEN p.birth_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(mr.record_date, p.birth_date)) BETWEEN 45 AND 64 THEN 1 ELSE 0 END) AS age_45_64,
			SUM(CASE WHEN p.birth_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(mr.record_date, p.birth_date)) >= 65 THEN 1 ELSE 0 END) AS age_65_plus,
			COUNT(*) AS total_cases
		FROM medical_record_diagnoses mrd
		JOIN medical_records mr ON mr.id = mrd.medical_record_id
		JOIN patients p ON p.id = mr.patient_id
		JOIN icd10 i ON i.id = mrd.icd10_id
		WHERE mrd.deleted_at IS NULL AND mr.deleted_at IS NULL AND mr.record_date >= ? AND mr.record_date < ?
		GROUP BY i.code, i.name
		ORDER BY total_cases DESC, diagnosis_name ASC
		LIMIT 100`
	if err := database.DB.Raw(query, startDate, endExclusive).Scan(&dataset.Rows).Error; err != nil {
		return reportCenterDataset{}, err
	}
	dataset.Rows = normalizeReportCenterRows(dataset.Rows)
	return dataset, nil
}

func renderReportCenterPDF(hospitalInfo initialAssessmentHospitalInfo, dataset reportCenterDataset) ([]byte, string, error) {
	pdf := gofpdf.New("L", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)

	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle(strings.ToUpper(dataset.Title), false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetHeaderFuncMode(func() {
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, strings.ToUpper(dataset.Title), dataset.PeriodText)
	}, true)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-8)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(90, 90, 90)
		pdf.CellFormat(90, 4, "Dicetak: "+formatDateTimeIndonesian(dataset.GeneratedAt), "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})

	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	if strings.TrimSpace(dataset.Subtitle) != "" {
		addInitialAssessmentFullWidthRow(pdf, dataset.Subtitle, false)
		addInitialAssessmentSectionSpacing(pdf)
	}

	if len(dataset.Metrics) > 0 {
		fields := make([]initialAssessmentPrintField, 0, len(dataset.Metrics))
		for _, metric := range dataset.Metrics {
			value := metric.Value
			if strings.TrimSpace(metric.Helper) != "" {
				value = value + " (" + metric.Helper + ")"
			}
			fields = append(fields, initialAssessmentPrintField{Label: metric.Label, Value: value})
		}
		addInitialAssessmentCompactFieldSection(pdf, "RINGKASAN", fields, "-")
	}

	addReportCenterTableToPDF(pdf, dataset)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}
	fileName := fmt.Sprintf("%s-%s-sd-%s.pdf", dataset.ExportName, dataset.StartDate.Format("20060102"), dataset.EndDate.Format("20060102"))
	return output.Bytes(), fileName, nil
}

func renderReportCenterExcel(dataset reportCenterDataset) ([]byte, string, error) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	summarySheet := "Ringkasan"
	dataSheet := "Data"
	f.SetSheetName("Sheet1", summarySheet)
	f.NewSheet(dataSheet)

	headerStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Color: "#FFFFFF"}, Fill: excelize.Fill{Type: "pattern", Color: []string{"#0F172A"}, Pattern: 1}, Alignment: &excelize.Alignment{Horizontal: "center"}})
	currencyStyle, _ := f.NewStyle(&excelize.Style{NumFmt: 3})

	summaryRows := [][]any{{"Laporan", dataset.Title}, {"Periode", dataset.PeriodText}, {"Dicetak", formatDateTimeIndonesian(dataset.GeneratedAt)}, {"Deskripsi", dataset.Subtitle}}
	for _, metric := range dataset.Metrics {
		summaryRows = append(summaryRows, []any{metric.Label, metric.Value})
	}
	for index, row := range summaryRows {
		cellA, _ := excelize.CoordinatesToCellName(1, index+1)
		cellB, _ := excelize.CoordinatesToCellName(2, index+1)
		f.SetCellValue(summarySheet, cellA, row[0])
		f.SetCellValue(summarySheet, cellB, row[1])
	}
	f.SetColWidth(summarySheet, "A", "A", 28)
	f.SetColWidth(summarySheet, "B", "B", 48)

	headers := make([]string, 0, len(dataset.Columns))
	for _, column := range dataset.Columns {
		headers = append(headers, column.Label)
	}
	writeDashboardReportSheetHeader(f, dataSheet, headers, headerStyle)
	for rowIndex, row := range dataset.Rows {
		values := make([]any, 0, len(dataset.Columns))
		for _, column := range dataset.Columns {
			values = append(values, row[column.Key])
		}
		writeDashboardReportSheetRow(f, dataSheet, rowIndex+2, values)
	}
	for index, column := range dataset.Columns {
		columnName, _ := excelize.ColumnNumberToName(index + 1)
		width := 18.0
		if column.Kind == "text" {
			width = 24
		}
		if column.Kind == "currency" {
			width = 18
			f.SetCellStyle(dataSheet, fmt.Sprintf("%s2", columnName), fmt.Sprintf("%s%d", columnName, len(dataset.Rows)+1), currencyStyle)
		}
		f.SetColWidth(dataSheet, columnName, columnName, width)
	}

	f.SetActiveSheet(0)
	var output bytes.Buffer
	if err := f.Write(&output); err != nil {
		return nil, "", err
	}
	fileName := fmt.Sprintf("%s-%s-sd-%s.xlsx", dataset.ExportName, dataset.StartDate.Format("20060102"), dataset.EndDate.Format("20060102"))
	return output.Bytes(), fileName, nil
}

func addReportCenterTableToPDF(pdf *gofpdf.Fpdf, dataset reportCenterDataset) {
	rowHeight := 6.4
	headerHeight := 7.0
	ensureReportCenterSectionSpace(pdf, rowHeight+headerHeight+10)
	addInitialAssessmentSectionTitle(pdf, "DATA LAPORAN")

	pageWidth, _ := pdf.GetPageSize()
	left, _, right, _ := pdf.GetMargins()
	contentWidth := pageWidth - left - right
	weights := make([]float64, 0, len(dataset.Columns))
	for _, column := range dataset.Columns {
		weight := 1.0
		switch column.Kind {
		case "text":
			weight = 1.8
		case "currency":
			weight = 1.1
		case "date":
			weight = 0.9
		case "badge":
			weight = 0.95
		case "number":
			weight = 0.9
		}
		weights = append(weights, weight)
	}
	widths := normalizeReportCenterWidths(contentWidth, weights)

	drawHeader := func() {
		pdf.SetFont("Arial", "B", 8)
		pdf.SetFillColor(30, 41, 59)
		pdf.SetTextColor(255, 255, 255)
		for index, column := range dataset.Columns {
			pdf.CellFormat(widths[index], headerHeight, sanitizePDFSingleLineText(column.Label), "1", 0, "C", true, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetTextColor(0, 0, 0)
	}

	drawHeader()
	pdf.SetFont("Arial", "", 7.6)
	if len(dataset.Rows) == 0 {
		pdf.CellFormat(contentWidth, rowHeight+1, "Tidak ada data pada periode ini.", "1", 1, "C", false, 0, "")
		addInitialAssessmentSectionSpacing(pdf)
		return
	}
	for _, row := range dataset.Rows {
		dashboardEnsureTableRowSpace(pdf, rowHeight, func() {
			ensureReportCenterSectionSpace(pdf, rowHeight+headerHeight+8)
			addInitialAssessmentSectionTitle(pdf, "DATA LAPORAN")
			drawHeader()
		})
		for index, column := range dataset.Columns {
			align := reportCenterPDFAlign(column.Kind)
			value := reportCenterCellString(row[column.Key], column.Kind)
			pdf.CellFormat(widths[index], rowHeight, sanitizePDFSingleLineText(dashboardReportEllipsis(value, reportCenterEllipsisLimit(column.Kind))), "1", 0, align, false, 0, "")
		}
		pdf.Ln(-1)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func ensureReportCenterSectionSpace(pdf *gofpdf.Fpdf, neededHeight float64) {
	_, pageHeight := pdf.GetPageSize()
	if pdf.GetY()+neededHeight > pageHeight-initialAssessmentPDFMarginBottom {
		pdf.AddPage()
		pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
	}
}

func normalizeReportCenterWidths(contentWidth float64, weights []float64) []float64 {
	total := 0.0
	for _, weight := range weights {
		total += weight
	}
	widths := make([]float64, 0, len(weights))
	for _, weight := range weights {
		widths = append(widths, (weight/total)*contentWidth)
	}
	return widths
}

func reportCenterPDFAlign(kind string) string {
	switch kind {
	case "currency", "number":
		return "R"
	case "date", "badge":
		return "C"
	default:
		return "L"
	}
}

func reportCenterEllipsisLimit(kind string) int {
	switch kind {
	case "text":
		return 42
	case "currency":
		return 18
	case "date":
		return 14
	default:
		return 20
	}
}

func reportCenterCellString(value any, kind string) string {
	switch typed := value.(type) {
	case nil:
		return "-"
	case string:
		if kind == "badge" {
			return reportCenterBadgeLabel(typed)
		}
		return firstNonEmpty(strings.TrimSpace(typed), "-")
	case float64:
		if kind == "currency" {
			return formatDashboardReportCurrency(typed)
		}
		return trimFloatString(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case int:
		return strconv.Itoa(typed)
	case bool:
		if typed {
			return "Ya"
		}
		return "Tidak"
	default:
		text := fmt.Sprintf("%v", value)
		if kind == "badge" {
			return reportCenterBadgeLabel(text)
		}
		return firstNonEmpty(strings.TrimSpace(text), "-")
	}
}

func reportCenterBadgeLabel(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	switch trimmed {
	case "completed", "done", "lunas":
		return "Selesai"
	case "registered":
		return "Terdaftar"
	case "in_progress":
		return "Berlangsung"
	case "cancelled":
		return "Batal"
	case "waiting":
		return "Menunggu"
	case "called":
		return "Dipanggil"
	case "processing":
		return "Diproses"
	case "sebagian":
		return "Sebagian"
	case "belum_bayar":
		return "Belum Bayar"
	case "laboratorium":
		return "Laboratorium"
	case "radiologi":
		return "Radiologi"
	case "dokter":
		return "Dokter"
	case "poliklinik":
		return "Poliklinik"
	default:
		return firstNonEmpty(value, "-")
	}
}

func trimFloatString(value float64) string {
	text := strconv.FormatFloat(value, 'f', 2, 64)
	text = strings.TrimRight(text, "0")
	text = strings.TrimRight(text, ".")
	return firstNonEmpty(text, "0")
}

func formatPercent(part int64, total int64) string {
	if total == 0 {
		return "0%"
	}
	return fmt.Sprintf("%.1f%%", (float64(part)/float64(total))*100)
}

func buildRowsFromMaps(rawRows []map[string]any) []map[string]any {
	rows := make([]map[string]any, 0, len(rawRows))
	for _, row := range rawRows {
		rows = append(rows, row)
	}
	sort.SliceStable(rows, func(i int, j int) bool {
		return fmt.Sprintf("%v", rows[i]) < fmt.Sprintf("%v", rows[j])
	})
	return rows
}

func normalizeReportCenterRows(rows []map[string]any) []map[string]any {
	normalized := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		next := make(map[string]any, len(row))
		for key, value := range row {
			next[key] = normalizeReportCenterValue(value)
		}
		normalized = append(normalized, next)
	}
	return normalized
}

func normalizeReportCenterValue(value any) any {
	switch typed := value.(type) {
	case []byte:
		return string(typed)
	case time.Time:
		return typed.Format(time.RFC3339)
	default:
		return value
	}
}
