package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"starter/backend/database"
	"starter/backend/models"
	"starter/backend/services/bpjs"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func generateVisitNumber() string {
	now := time.Now()
	var count int64
	database.DB.Model(&models.Visit{}).Unscoped().
		Where("DATE(visit_date) = ?", now.Format("2006-01-02")).Count(&count)
	return fmt.Sprintf("VIS-%s-%04d", now.Format("20060102"), count+1)
}

func getNextQueueNumber(polyclinicID uint, date time.Time) int {
	dateStr := date.Format("2006-01-02")
	var counter models.QueueCounter
	err := database.DB.
		Where("polyclinic_id = ? AND DATE(date) = ?", polyclinicID, dateStr).
		First(&counter).Error

	if err != nil {
		// Create new counter
		counter = models.QueueCounter{
			PolyclinicID: polyclinicID,
			Date:         date,
			LastNumber:   1,
		}
		database.DB.Create(&counter)
		return 1
	}

	counter.LastNumber++
	database.DB.Save(&counter)
	return counter.LastNumber
}

func GetVisits(c *gin.Context) {
	var visits []models.Visit
	query := database.DB.
		Preload("Patient").
		Preload("Polyclinic").
		Preload("Doctor").
		Order("visit_date DESC, queue_number ASC")

	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Joins("JOIN patients ON patients.id = visits.patient_id").
			Where("patients.full_name ILIKE ? OR visits.visit_number ILIKE ? OR patients.medical_record_number ILIKE ?", like, like, like)
	}
	if status := c.Query("status"); status != "" {
		query = query.Where("visits.status = ?", status)
	}
	if qStatus := c.Query("queue_status"); qStatus != "" {
		query = query.Where("visits.queue_status = ?", qStatus)
	}
	if poli := c.Query("polyclinic_id"); poli != "" {
		query = query.Where("visits.polyclinic_id = ?", poli)
	}
	if doctor := c.Query("doctor_id"); doctor != "" {
		query = query.Where("visits.doctor_id = ?", doctor)
	}
	if date := c.Query("date"); date != "" {
		query = query.Where("DATE(visits.visit_date) = ?", date)
	}

	var total int64
	query.Model(&models.Visit{}).Count(&total)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * perPage

	if err := query.Offset(offset).Limit(perPage).Find(&visits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     visits,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func GetTodayVisits(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	var visits []models.Visit
	query := database.DB.
		Preload("Patient").
		Preload("Polyclinic").
		Preload("Doctor").
		Where("DATE(visit_date) = ?", today).
		Order("polyclinic_id ASC, queue_number ASC")

	if poli := c.Query("polyclinic_id"); poli != "" {
		query = query.Where("polyclinic_id = ?", poli)
	}
	if doctor := c.Query("doctor_id"); doctor != "" {
		query = query.Where("doctor_id = ?", doctor)
	}
	if status := c.Query("queue_status"); status != "" {
		query = query.Where("queue_status = ?", status)
	}

	if err := query.Find(&visits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": visits})
}

func GetVisit(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var visit models.Visit
	if err := database.DB.
		Preload("Patient").
		Preload("Polyclinic").
		Preload("Doctor").
		Preload("RegisteredByUser").
		First(&visit, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Visit not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": visit})
}

func FindActiveVisitForPatient(db *gorm.DB, patientID uint) (*models.Visit, error) {
	var visit models.Visit
	err := db.
		Preload("Polyclinic").
		Preload("Doctor").
		Preload("Patient").
		Where("patient_id = ? AND status != 'cancelled' AND (status != 'completed' OR id IN (SELECT visit_id FROM invoices WHERE patient_id = ? AND status NOT IN ('lunas', 'batal')))", patientID, patientID).
		Order("created_at DESC").
		First(&visit).Error
	if err != nil {
		return nil, err
	}
	return &visit, nil
}

func GetActiveVisitByPatient(c *gin.Context) {
	patientIDStr := c.Param("patientId")
	patientID, err := strconv.ParseUint(patientIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID Pasien tidak valid"})
		return
	}

	activeVisit, err := FindActiveVisitForPatient(database.DB, uint(patientID))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{"data": nil})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": activeVisit})
}

type CreateVisitRequest struct {
	PatientID       uint   `json:"patient_id" binding:"required"`
	VisitDate       string `json:"visit_date" binding:"required"`
	PolyclinicID    uint   `json:"polyclinic_id" binding:"required"`
	DoctorID        uint   `json:"doctor_id" binding:"required"`
	PaymentType     string `json:"payment_type" binding:"required,oneof=umum bpjs asuransi"`
	InsuranceNumber string `json:"insurance_number"`
	Complaint       string `json:"complaint"`
	VisitType       string `json:"visit_type" binding:"required,oneof=baru lama"`
	Priority        string `json:"priority"`
}

func CreateVisit(c *gin.Context) {
	var req CreateVisitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	visitDate, err := time.ParseInLocation("2006-01-02", req.VisitDate, time.Local)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format tanggal tidak valid (YYYY-MM-DD)"})
		return
	}

	// Validate patient exists
	var patient models.Patient
	if err := database.DB.First(&patient, req.PatientID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pasien tidak ditemukan"})
		return
	}

	// Validate patient doesn't have an active visit not finished until billing
	activeVisit, err := FindActiveVisitForPatient(database.DB, req.PatientID)
	if err == nil && activeVisit != nil {
		poliName := "Poli"
		if activeVisit.Polyclinic.Name != "" {
			poliName = activeVisit.Polyclinic.Name
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Pasien %s masih memiliki pendaftaran/kunjungan aktif di %s (%s) yang belum selesai sampai billing. Selesaikan pelayanan dan pembayaran billing terlebih dahulu.", patient.FullName, poliName, activeVisit.VisitNumber),
		})
		return
	}

	// Get registered user from JWT
	registeredBy, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User login tidak ditemukan"})
		return
	}

	registeredByUint, ok := registeredBy.(uint)
	if !ok || registeredByUint == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Session user tidak valid"})
		return
	}

	priority := req.Priority
	if priority == "" {
		priority = "normal"
	}

	queueNumber := getNextQueueNumber(req.PolyclinicID, visitDate)

	visit := models.Visit{
		VisitNumber:     generateVisitNumber(),
		PatientID:       req.PatientID,
		VisitDate:       visitDate,
		PolyclinicID:    req.PolyclinicID,
		DoctorID:        req.DoctorID,
		QueueNumber:     queueNumber,
		QueueStatus:     "waiting",
		PaymentType:     req.PaymentType,
		InsuranceNumber: req.InsuranceNumber,
		Complaint:       req.Complaint,
		VisitType:       req.VisitType,
		Priority:        priority,
		Status:          "registered",
		RegisteredBy:    registeredByUint,
	}

	var createdInvoice models.Invoice
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&visit).Error; err != nil {
			return err
		}

		invoice, invoiceErr := upsertVisitInvoice(tx, visit.ID, registeredByUint, true)
		if invoiceErr != nil {
			return invoiceErr
		}
		createdInvoice = invoice
		return nil
	}); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Patient").Preload("Polyclinic").Preload("Doctor").First(&visit, visit.ID)

	// Sync Tambah Antrean Offline ke BPJS if applicable
	if visit.PaymentType == "bpjs" && visit.InsuranceNumber != "" && visit.Polyclinic.BpjsPoliCode != "" {
		go func(v models.Visit, p models.Patient) {
			client, err := bpjs.NewClient()
			if err != nil {
				bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
					Domain:       bpjs.DomainAntrean,
					Direction:    bpjs.DirectionOutbound,
					Operation:    "add-antrean",
					Method:       http.MethodPost,
					Endpoint:     "/antrean",
					StatusCode:   http.StatusServiceUnavailable,
					Success:      false,
					ErrorMessage: err.Error(),
					RequestPayload: map[string]any{
						"visit_id": v.ID,
					},
				})
				return
			}

			payload := map[string]interface{}{
				"kdppk":          client.Config.ConsID, // Kdppk usually same as cons ID or configured separately? Usually handled on BPJS side or passed. We'll pass it.
				"kodepoli":       v.Polyclinic.BpjsPoliCode,
				"kodedokter":     v.Doctor.BpjsDoctorCode,
				"nomorkartu":     v.InsuranceNumber,
				"nik":            p.NIK,
				"nohp":           p.Phone,
				"keluhan":        v.Complaint,
				"tanggalperiksa": v.VisitDate.Format("2006-01-02"),
			}
			_ = client.AddAntrean(payload)
		}(visit, patient)
	}

	c.JSON(http.StatusCreated, gin.H{
		"data":    visit,
		"invoice": buildInvoiceResponse(createdInvoice),
		"message": "Kunjungan berhasil didaftarkan dan invoice administrasi berhasil dibuat",
	})
}

func UpdateVisit(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var visit models.Visit
	if err := database.DB.First(&visit, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Visit not found"})
		return
	}

	var req struct {
		PolyclinicID    uint   `json:"polyclinic_id"`
		DoctorID        uint   `json:"doctor_id"`
		PaymentType     string `json:"payment_type"`
		InsuranceNumber string `json:"insurance_number"`
		Complaint       string `json:"complaint"`
		VisitType       string `json:"visit_type"`
		Priority        string `json:"priority"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"polyclinic_id":    req.PolyclinicID,
		"doctor_id":        req.DoctorID,
		"payment_type":     req.PaymentType,
		"insurance_number": req.InsuranceNumber,
		"complaint":        req.Complaint,
		"visit_type":       req.VisitType,
		"priority":         req.Priority,
	}
	if err := database.DB.Model(&visit).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": visit, "message": "Kunjungan berhasil diperbarui"})
}

func DeleteVisit(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var visit models.Visit
	if err := database.DB.First(&visit, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Visit not found"})
		return
	}

	if visit.Status != "registered" && visit.Status != "cancelled" {
		c.JSON(http.StatusConflict, gin.H{"error": "Hanya kunjungan berstatus 'registered' atau 'cancelled' yang dapat dihapus"})
		return
	}

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		now := time.Now()

		if err := tx.Model(&models.RegistrationQueue{}).
			Where("visit_id = ?", visit.ID).
			Updates(map[string]interface{}{
				"status":       "cancelled",
				"cancelled_at": &now,
				"completed_at": nil,
				"visit_id":     nil,
			}).Error; err != nil {
			return err
		}

		if err := tx.Delete(&visit).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Kunjungan berhasil dihapus"})
}

func CancelVisitWorkspace(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var visit models.Visit
	if err := database.DB.First(&visit, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Visit not found"})
		return
	}

	if visit.Status == "completed" || visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Workspace rekam medis yang sudah final atau batal tidak dapat dibatalkan lagi"})
		return
	}

	var invoiceCount int64
	if err := database.DB.Model(&models.Invoice{}).Where("visit_id = ?", visit.ID).Count(&invoiceCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if invoiceCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Workspace tidak dapat dibatalkan karena tagihan untuk kunjungan ini sudah dibuat"})
		return
	}

	var records []models.MedicalRecord
	if err := database.DB.Where("visit_id = ?", visit.ID).Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	hasActiveRecordData := false
	for _, record := range records {
		if record.Status == "final" {
			c.JSON(http.StatusConflict, gin.H{"error": "Workspace tidak dapat dibatalkan karena sudah memiliki entri rekam medis final"})
			return
		}

		if record.Status != "cancelled" {
			hasActiveRecordData = true
		}

		switch normalizeMedicalRecordSection(record.SectionType) {
		case "prescription":
			if isPrescriptionWorkflowLocked(record.PrescriptionWorkflowStatus) {
				c.JSON(http.StatusConflict, gin.H{"error": "Workspace tidak dapat dibatalkan karena order resep sudah dikirim atau diproses"})
				return
			}
		case "laboratory":
			if isSupportingOrderWorkflowLocked(record.LaboratoryWorkflowStatus) {
				c.JSON(http.StatusConflict, gin.H{"error": "Workspace tidak dapat dibatalkan karena order laboratorium sudah dikirim atau diproses"})
				return
			}
		case "radiology":
			if isSupportingOrderWorkflowLocked(record.RadiologyWorkflowStatus) {
				c.JSON(http.StatusConflict, gin.H{"error": "Workspace tidak dapat dibatalkan karena order radiologi sudah dikirim atau diproses"})
				return
			}
		}
	}

	var odontogramEntries []models.OdontogramEntry
	if err := database.DB.Where("visit_id = ?", visit.ID).Find(&odontogramEntries).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	hasActiveOdontogramData := false
	for _, entry := range odontogramEntries {
		if entry.Status == odontogramStatusFinal {
			c.JSON(http.StatusConflict, gin.H{"error": "Workspace tidak dapat dibatalkan karena sudah memiliki entri odontogram final"})
			return
		}
		if entry.Status != odontogramStatusCancel {
			hasActiveOdontogramData = true
		}
	}

	shouldDeleteVisit := visit.Status == "registered" && !hasActiveRecordData && !hasActiveOdontogramData

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		now := time.Now()

		if err := tx.Model(&models.RegistrationQueue{}).
			Where("visit_id = ?", visit.ID).
			Updates(map[string]interface{}{
				"status":       "cancelled",
				"cancelled_at": &now,
				"completed_at": nil,
				"visit_id":     nil,
			}).Error; err != nil {
			return err
		}

		if hasActiveRecordData {
			if err := tx.Model(&models.MedicalRecord{}).
				Where("visit_id = ? AND status <> ?", visit.ID, "cancelled").
				Update("status", "cancelled").Error; err != nil {
				return err
			}
		}

		if hasActiveOdontogramData {
			if err := tx.Model(&models.OdontogramEntry{}).
				Where("visit_id = ? AND status <> ?", visit.ID, odontogramStatusCancel).
				Update("status", odontogramStatusCancel).Error; err != nil {
				return err
			}
		}

		if shouldDeleteVisit {
			if err := tx.Delete(&visit).Error; err != nil {
				return err
			}
			return nil
		}

		if err := tx.Model(&visit).Updates(map[string]interface{}{
			"status":       "cancelled",
			"queue_status": "cancelled",
		}).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	message := "Workspace rekam medis berhasil dibatalkan"
	if shouldDeleteVisit {
		message = "Kunjungan berhasil dihapus"
	}

	c.JSON(http.StatusOK, gin.H{"message": message})
}

func UpdateVisitStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var visit models.Visit
	if err := database.DB.First(&visit, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Visit not found"})
		return
	}

	var req struct {
		QueueStatus string `json:"queue_status"`
		Status      string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Status == "completed" || req.QueueStatus == "done" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status selesai hanya bisa ditetapkan melalui finalisasi kunjungan di EMR"})
		return
	}

	updates := map[string]interface{}{}
	if req.QueueStatus != "" {
		updates["queue_status"] = req.QueueStatus
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}

	if err := database.DB.Model(&visit).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Patient").Preload("Polyclinic").Preload("Doctor").First(&visit, visit.ID)

	// Sync Batal Antrean BPJS if applicable
	if req.QueueStatus == "cancelled" && visit.InsuranceNumber != "" && visit.Polyclinic.BpjsPoliCode != "" {
		go func(v models.Visit) {
			client, err := bpjs.NewClient()
			if err != nil {
				bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
					Domain:       bpjs.DomainAntrean,
					Direction:    bpjs.DirectionOutbound,
					Operation:    "cancel-antrean",
					Method:       http.MethodPost,
					Endpoint:     "/antrean/batal",
					StatusCode:   http.StatusServiceUnavailable,
					Success:      false,
					ErrorMessage: err.Error(),
					RequestPayload: map[string]any{
						"visit_id": v.ID,
					},
				})
				return
			}

			_ = client.CancelQueue(v.VisitDate.Format("2006-01-02"), v.Polyclinic.BpjsPoliCode, v.InsuranceNumber, "Dibatalkan dari sistem klinik")
		}(visit)
	}

	c.JSON(http.StatusOK, gin.H{"data": visit, "message": "Status berhasil diperbarui"})
}

func CallBPJSQueue(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var visit models.Visit
	if err := database.DB.Preload("Patient").Preload("Polyclinic").Preload("Doctor").First(&visit, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Visit not found"})
		return
	}

	if visit.Polyclinic.BpjsPoliCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Poli tidak memiliki kode BPJS"})
		return
	}

	if visit.Patient.MedicalRecordNumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pasien tidak memiliki rekam medis"})
		return
	}

	if visit.InsuranceNumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pasien tidak memiliki nomor asuransi BPJS / Kartu JKN"})
		return
	}

	client, err := bpjs.NewClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal inisialisasi BPJS Client: " + err.Error()})
		return
	}

	tanggalPeriksa := visit.VisitDate.Format("2006-01-02")
	if err := client.CallNextQueue(tanggalPeriksa, visit.Polyclinic.BpjsPoliCode, visit.InsuranceNumber); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Gagal panggil BPJS: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Berhasil memanggil antrean BPJS"})
}

func GetQueueByPolyclinic(c *gin.Context) {
	polyclinicID, err := strconv.Atoi(c.Param("polyclinicId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid polyclinic ID"})
		return
	}

	today := time.Now().Format("2006-01-02")
	var visits []models.Visit
	if err := database.DB.
		Preload("Patient").
		Preload("Doctor").
		Where("polyclinic_id = ? AND DATE(visit_date) = ?", polyclinicID, today).
		Order("queue_number ASC").
		Find(&visits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Group by queue_status
	waiting := []models.Visit{}
	inConsultation := []models.Visit{}
	done := []models.Visit{}
	cancelled := []models.Visit{}

	for _, v := range visits {
		switch v.QueueStatus {
		case "waiting":
			waiting = append(waiting, v)
		case "in_consultation":
			inConsultation = append(inConsultation, v)
		case "done":
			done = append(done, v)
		case "cancelled":
			cancelled = append(cancelled, v)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"waiting":         waiting,
			"in_consultation": inConsultation,
			"done":            done,
			"cancelled":       cancelled,
		},
	})
}

func CallNextQueue(c *gin.Context) {
	polyclinicID, err := strconv.Atoi(c.Param("polyclinicId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid polyclinic ID"})
		return
	}

	today := time.Now().Format("2006-01-02")

	// Find next waiting visit
	var visit models.Visit
	if err := database.DB.
		Preload("Patient").
		Where("polyclinic_id = ? AND DATE(visit_date) = ? AND queue_status = ?", polyclinicID, today, "waiting").
		Order("priority DESC, queue_number ASC").
		First(&visit).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tidak ada antrian yang menunggu"})
		return
	}

	database.DB.Model(&visit).Updates(map[string]interface{}{
		"queue_status": "in_consultation",
		"status":       "in_progress",
	})
	database.DB.Preload("Patient").Preload("Doctor").First(&visit, visit.ID)

	c.JSON(http.StatusOK, gin.H{"data": visit, "message": "Antrian dipanggil"})
}
