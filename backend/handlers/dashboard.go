package handlers

import (
	"net/http"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

type dashboardVisitTrend struct {
	Date      string `json:"date"`
	Total     int64  `json:"total"`
	Completed int64  `json:"completed"`
	Cancelled int64  `json:"cancelled"`
}

type dashboardTopPolyclinic struct {
	Name   string `json:"name"`
	Visits int64  `json:"visits"`
}

type dashboardTopDiagnosis struct {
	Code  string `json:"code"`
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

type dashboardLowStockMedicine struct {
	ID           uint   `json:"id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	CurrentStock int    `json:"current_stock"`
	MinStock     int    `json:"min_stock"`
}

type dashboardRecentVisit struct {
	ID          uint   `json:"id"`
	VisitNumber string `json:"visit_number"`
	PatientName string `json:"patient_name"`
	DoctorName  string `json:"doctor_name"`
	PolyName    string `json:"poly_name"`
	Status      string `json:"status"`
	QueueStatus string `json:"queue_status"`
	VisitDate   string `json:"visit_date"`
}

type dashboardRevenueTrend struct {
	Date   string  `json:"date"`
	Amount float64 `json:"amount"`
}

type dashboardPatientTrend struct {
	Month       string `json:"month"`
	NewPatients int64  `json:"new_patients"`
	TotalVisits int64  `json:"total_visits"`
}

func GetDashboardSummary(c *gin.Context) {
	now := time.Now()
	startOfToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	endOfToday := startOfToday.AddDate(0, 0, 1)

	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	// ---- Visits ----
	var todayVisits int64
	var todayCompleted int64
	var todayInProgress int64
	var todayCancelled int64
	var todayRegistered int64
	var monthVisits int64
	var monthCompleted int64

	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ?", startOfToday, endOfToday).Count(&todayVisits)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", startOfToday, endOfToday, "completed").Count(&todayCompleted)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", startOfToday, endOfToday, "in_progress").Count(&todayInProgress)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", startOfToday, endOfToday, "cancelled").Count(&todayCancelled)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", startOfToday, endOfToday, "registered").Count(&todayRegistered)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ?", startOfMonth, endOfToday).Count(&monthVisits)
	database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", startOfMonth, endOfToday, "completed").Count(&monthCompleted)

	// ---- Queue ----
	var queueWaiting int64
	var queueCalled int64
	var queueProcessing int64
	var queueDone int64

	database.DB.Model(&models.RegistrationQueue{}).Where("queue_date >= ? AND queue_date < ? AND status = ?", startOfToday, endOfToday, "waiting").Count(&queueWaiting)
	database.DB.Model(&models.RegistrationQueue{}).Where("queue_date >= ? AND queue_date < ? AND status = ?", startOfToday, endOfToday, "called").Count(&queueCalled)
	database.DB.Model(&models.RegistrationQueue{}).Where("queue_date >= ? AND queue_date < ? AND status = ?", startOfToday, endOfToday, "processing").Count(&queueProcessing)
	database.DB.Model(&models.RegistrationQueue{}).Where("queue_date >= ? AND queue_date < ? AND status = ?", startOfToday, endOfToday, "completed").Count(&queueDone)

	// ---- Billing today ----
	var revenueToday float64
	database.DB.Model(&models.Payment{}).Select("COALESCE(SUM(amount), 0)").Where("payment_date >= ? AND payment_date < ?", startOfToday, endOfToday).Scan(&revenueToday)

	var revenueMonth float64
	database.DB.Model(&models.Payment{}).Select("COALESCE(SUM(amount), 0)").Where("payment_date >= ? AND payment_date < ?", startOfMonth, endOfToday).Scan(&revenueMonth)

	var invoicesPaid int64
	var invoicesUnpaid int64
	database.DB.Model(&models.Invoice{}).Where("invoice_date >= ? AND invoice_date < ? AND status = ?", startOfToday, endOfToday, "lunas").Count(&invoicesPaid)
	database.DB.Model(&models.Invoice{}).Where("invoice_date >= ? AND invoice_date < ? AND status IN ?", startOfToday, endOfToday, []string{"belum_bayar", "sebagian"}).Count(&invoicesUnpaid)

	// ---- Patients ----
	var totalPatients int64
	var newPatientsMonth int64
	database.DB.Model(&models.Patient{}).Count(&totalPatients)
	database.DB.Model(&models.Patient{}).Where("created_at >= ?", startOfMonth).Count(&newPatientsMonth)

	// ---- Doctors/Polyclinics ----
	var activeDoctors int64
	var activePolyclinics int64
	database.DB.Model(&models.Doctor{}).Where("is_active = ?", true).Count(&activeDoctors)
	database.DB.Model(&models.Polyclinic{}).Where("is_active = ?", true).Count(&activePolyclinics)

	// ---- Pharmacy workflow today ----
	var rxOrdered int64
	var rxPreparing int64
	var rxReady int64
	var rxDispensed int64
	database.DB.Model(&models.MedicalRecord{}).Where("prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status = ?", startOfToday, endOfToday, "ordered").Count(&rxOrdered)
	database.DB.Model(&models.MedicalRecord{}).Where("prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status = ?", startOfToday, endOfToday, "preparing").Count(&rxPreparing)
	database.DB.Model(&models.MedicalRecord{}).Where("prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status = ?", startOfToday, endOfToday, "ready").Count(&rxReady)
	database.DB.Model(&models.MedicalRecord{}).Where("prescription_ordered_at >= ? AND prescription_ordered_at < ? AND prescription_workflow_status = ?", startOfToday, endOfToday, "dispensed").Count(&rxDispensed)

	// ---- Lab workflow today ----
	var labOrdered int64
	var labPreparing int64
	var labCompleted int64
	database.DB.Model(&models.MedicalRecord{}).Where("laboratory_ordered_at >= ? AND laboratory_ordered_at < ? AND laboratory_workflow_status = ?", startOfToday, endOfToday, "ordered").Count(&labOrdered)
	database.DB.Model(&models.MedicalRecord{}).Where("laboratory_ordered_at >= ? AND laboratory_ordered_at < ? AND laboratory_workflow_status = ?", startOfToday, endOfToday, "preparing").Count(&labPreparing)
	database.DB.Model(&models.MedicalRecord{}).Where("laboratory_ordered_at >= ? AND laboratory_ordered_at < ? AND laboratory_workflow_status = ?", startOfToday, endOfToday, "completed").Count(&labCompleted)

	// ---- Radiology workflow today ----
	var radOrdered int64
	var radCompleted int64
	database.DB.Model(&models.MedicalRecord{}).Where("radiology_ordered_at >= ? AND radiology_ordered_at < ? AND radiology_workflow_status = ?", startOfToday, endOfToday, "ordered").Count(&radOrdered)
	database.DB.Model(&models.MedicalRecord{}).Where("radiology_ordered_at >= ? AND radiology_ordered_at < ? AND radiology_workflow_status = ?", startOfToday, endOfToday, "completed").Count(&radCompleted)

	// ---- 7-day visit trend ----
	trend := make([]dashboardVisitTrend, 7)
	for i := 6; i >= 0; i-- {
		d := now.AddDate(0, 0, -i)
		ds := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, d.Location())
		de := ds.AddDate(0, 0, 1)
		dateStr := ds.Format("2006-01-02")

		var total, completed, cancelled int64
		database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ?", ds, de).Count(&total)
		database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", ds, de, "completed").Count(&completed)
		database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ? AND status = ?", ds, de, "cancelled").Count(&cancelled)

		trend[6-i] = dashboardVisitTrend{Date: dateStr, Total: total, Completed: completed, Cancelled: cancelled}
	}

	// ---- Top 5 polyclinics today ----
	var topPolyclinics []dashboardTopPolyclinic
	database.DB.Model(&models.Visit{}).
		Select("polyclinics.name as name, COUNT(*) as visits").
		Joins("JOIN polyclinics ON polyclinics.id = visits.polyclinic_id").
		Where("visits.visit_date >= ? AND visits.visit_date < ?", startOfToday, endOfToday).
		Group("polyclinics.name").
		Order("visits DESC").
		Limit(5).
		Scan(&topPolyclinics)

	// ---- Top 5 diagnoses this month ----
	var topDiagnoses []dashboardTopDiagnosis
	database.DB.Model(&models.MedicalRecordDiagnosis{}).
		Select("icd10.code as code, icd10.name as name, COUNT(*) as count").
		Joins("JOIN icd10 ON icd10.id = medical_record_diagnoses.icd10_id").
		Joins("JOIN medical_records ON medical_records.id = medical_record_diagnoses.medical_record_id").
		Where("medical_records.created_at >= ? AND medical_record_diagnoses.deleted_at IS NULL AND medical_records.deleted_at IS NULL", startOfMonth).
		Group("icd10.code, icd10.name").
		Order("count DESC").
		Limit(5).
		Scan(&topDiagnoses)

	// ---- Low stock medicines (current_stock <= min_stock) ----
	var lowStock []dashboardLowStockMedicine
	database.DB.Model(&models.Medicine{}).
		Select("id, code, name, current_stock, min_stock").
		Where("is_active = ? AND current_stock <= min_stock", true).
		Order("current_stock ASC").
		Limit(10).
		Scan(&lowStock)

	// ---- Revenue trend 7 days ----
	revenueTrend := make([]dashboardRevenueTrend, 7)
	for i := 6; i >= 0; i-- {
		d := now.AddDate(0, 0, -i)
		ds := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, d.Location())
		de := ds.AddDate(0, 0, 1)
		dateStr := ds.Format("2006-01-02")

		var amount float64
		database.DB.Model(&models.Payment{}).Select("COALESCE(SUM(amount), 0)").Where("payment_date >= ? AND payment_date < ?", ds, de).Scan(&amount)

		revenueTrend[6-i] = dashboardRevenueTrend{Date: dateStr, Amount: amount}
	}

	// ---- Patient trend 6 months ----
	patientTrend := make([]dashboardPatientTrend, 6)
	for i := 5; i >= 0; i-- {
		ms := time.Date(now.Year(), now.Month()-time.Month(i), 1, 0, 0, 0, 0, now.Location())
		me := ms.AddDate(0, 1, 0)
		monthStr := ms.Format("2006-01")

		var np int64
		database.DB.Model(&models.Patient{}).Where("created_at >= ? AND created_at < ?", ms, me).Count(&np)

		var tv int64
		database.DB.Model(&models.Visit{}).Where("visit_date >= ? AND visit_date < ?", ms, me).Count(&tv)

		patientTrend[5-i] = dashboardPatientTrend{Month: monthStr, NewPatients: np, TotalVisits: tv}
	}

	// ---- Recent visits today ----
	var recentVisitRows []struct {
		ID          uint
		VisitNumber string
		PatientName string
		DoctorName  string
		PolyName    string
		Status      string
		QueueStatus string
		VisitDate   time.Time
	}
	database.DB.Model(&models.Visit{}).
		Select("visits.id, visits.visit_number, patients.full_name as patient_name, doctors.full_name as doctor_name, polyclinics.name as poly_name, visits.status, visits.queue_status, visits.visit_date").
		Joins("JOIN patients ON patients.id = visits.patient_id").
		Joins("JOIN doctors ON doctors.id = visits.doctor_id").
		Joins("JOIN polyclinics ON polyclinics.id = visits.polyclinic_id").
		Where("visits.visit_date >= ? AND visits.visit_date < ?", startOfToday, endOfToday).
		Order("visits.created_at DESC").
		Limit(10).
		Scan(&recentVisitRows)

	recentVisits := make([]dashboardRecentVisit, 0, len(recentVisitRows))
	for _, r := range recentVisitRows {
		recentVisits = append(recentVisits, dashboardRecentVisit{
			ID:          r.ID,
			VisitNumber: r.VisitNumber,
			PatientName: r.PatientName,
			DoctorName:  r.DoctorName,
			PolyName:    r.PolyName,
			Status:      r.Status,
			QueueStatus: r.QueueStatus,
			VisitDate:   r.VisitDate.Format("2006-01-02 15:04"),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"generated_at": now.Format(time.RFC3339),

			// Visit stats
			"today_visits":      todayVisits,
			"today_completed":   todayCompleted,
			"today_in_progress": todayInProgress,
			"today_cancelled":   todayCancelled,
			"today_registered":  todayRegistered,
			"month_visits":      monthVisits,
			"month_completed":   monthCompleted,

			// Queue
			"queue_waiting":    queueWaiting,
			"queue_called":     queueCalled,
			"queue_processing": queueProcessing,
			"queue_done":       queueDone,

			// Revenue
			"revenue_today":   revenueToday,
			"revenue_month":   revenueMonth,
			"invoices_paid":   invoicesPaid,
			"invoices_unpaid": invoicesUnpaid,

			// Patients
			"total_patients":     totalPatients,
			"new_patients_month": newPatientsMonth,

			// Staff
			"active_doctors":     activeDoctors,
			"active_polyclinics": activePolyclinics,

			// Pharmacy
			"rx_ordered":   rxOrdered,
			"rx_preparing": rxPreparing,
			"rx_ready":     rxReady,
			"rx_dispensed": rxDispensed,

			// Lab
			"lab_ordered":   labOrdered,
			"lab_preparing": labPreparing,
			"lab_completed": labCompleted,

			// Radiology
			"rad_ordered":   radOrdered,
			"rad_completed": radCompleted,

			// Charts
			"visit_trend_7d":   trend,
			"revenue_trend_7d": revenueTrend,
			"patient_trend_6m": patientTrend,
			"top_polyclinics":  topPolyclinics,
			"top_diagnoses":    topDiagnoses,
			"low_stock":        lowStock,
			"recent_visits":    recentVisits,
		},
	})
}
