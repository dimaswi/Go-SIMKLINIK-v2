package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CreateQueueCallRequest struct {
	QueueNumber     int    `json:"queue_number" binding:"required,min=1"`
	PatientName     string `json:"patient_name"`
	UnitType        string `json:"unit_type"`
	DestinationName string `json:"destination_name" binding:"required"`
}

func CreateQueueCall(c *gin.Context) {
	var req CreateQueueCallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userIDVal, _ := c.Get("user_id")
	userID, _ := userIDVal.(uint)

	unitType := strings.TrimSpace(req.UnitType)
	if unitType == "" {
		unitType = "ruangan"
	}

	call := models.QueueCall{
		QueueNumber:     req.QueueNumber,
		PatientName:     strings.TrimSpace(req.PatientName),
		UnitType:        unitType,
		DestinationName: strings.TrimSpace(req.DestinationName),
		CalledBy:        userID,
	}

	if err := database.DB.Create(&call).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": call})
}

func GetLatestQueueCall(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	var call models.QueueCall
	if err := database.DB.
		Where("DATE(created_at) = ?", today).
		Order("id DESC").
		First(&call).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"data": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": call})
}

type DisplayClinicInfo struct {
	Name               string `json:"name"`
	Subtitle           string `json:"subtitle"`
	Logo               string `json:"logo"`
	DisplayVideoURL    string `json:"display_video_url"`
	DisplayAds         string `json:"display_ads"`
	DisplayRunningText string `json:"display_running_text"`
}

type DisplayQueueTicket struct {
	QueueNumber         int       `json:"queue_number"`
	PatientName         string    `json:"patient_name"`
	MedicalRecordNumber string    `json:"medical_record_number"`
	PolyclinicName      string    `json:"polyclinic_name"`
	DoctorName          string    `json:"doctor_name"`
	PaymentType         string    `json:"payment_type"`
	Priority            string    `json:"priority"`
	Status              string    `json:"status"`
	StatusLabel         string    `json:"status_label"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type DisplayUnitCounts struct {
	Waiting   int `json:"waiting"`
	InService int `json:"in_service"`
	Done      int `json:"done"`
	Total     int `json:"total"`
}

type DisplayUnitQueue struct {
	UnitKey      string               `json:"unit_key"`
	UnitType     string               `json:"unit_type"`
	PolyclinicID uint                 `json:"polyclinic_id,omitempty"`
	Name         string               `json:"name"`
	Code         string               `json:"code,omitempty"`
	Subtitle     string               `json:"subtitle"`
	LatestCall   *models.QueueCall    `json:"latest_call"`
	Active       *DisplayQueueTicket  `json:"active"`
	Waiting      []DisplayQueueTicket `json:"waiting"`
	InService    []DisplayQueueTicket `json:"in_service"`
	Done         []DisplayQueueTicket `json:"done"`
	Counts       DisplayUnitCounts    `json:"counts"`
}

type DisplayBoardResponse struct {
	Date         string             `json:"date"`
	ClinicInfo   DisplayClinicInfo  `json:"clinic_info"`
	LatestCall   *models.QueueCall  `json:"latest_call"`
	RecentCalls  []models.QueueCall `json:"recent_calls"`
	Registration DisplayUnitQueue   `json:"registration"`
	Cashier      DisplayUnitQueue   `json:"cashier"`
	Rooms        []DisplayUnitQueue `json:"rooms"`
}

func resolveDisplayActiveTicket(inService []DisplayQueueTicket, waiting []DisplayQueueTicket, done []DisplayQueueTicket, latestCall *models.QueueCall, fallbackDestination string) *DisplayQueueTicket {
	if latestCall != nil {
		for i := range inService {
			if inService[i].QueueNumber == latestCall.QueueNumber {
				ticket := inService[i]
				return &ticket
			}
		}

		for i := range waiting {
			if waiting[i].QueueNumber == latestCall.QueueNumber {
				ticket := waiting[i]
				ticket.Status = "called"
				ticket.StatusLabel = "Sedang Dipanggil"
				return &ticket
			}
		}

		isAlreadyDone := false
		for i := range done {
			if done[i].QueueNumber == latestCall.QueueNumber {
				isAlreadyDone = true
				if time.Since(latestCall.CreatedAt) < 2*time.Minute {
					ticket := done[i]
					ticket.Status = "called"
					ticket.StatusLabel = "Dipanggil Ulang"
					return &ticket
				}
				break
			}
		}

		if !isAlreadyDone {
			patientName := strings.TrimSpace(latestCall.PatientName)
			if patientName == "" {
				patientName = "Pasien Antrian"
			}
			destName := strings.TrimSpace(latestCall.DestinationName)
			if destName == "" {
				destName = fallbackDestination
			}
			return &DisplayQueueTicket{
				QueueNumber:    latestCall.QueueNumber,
				PatientName:    patientName,
				PolyclinicName: destName,
				Status:         "called",
				StatusLabel:    "Sedang Dipanggil",
				UpdatedAt:      latestCall.CreatedAt,
			}
		}
	}

	if len(inService) > 0 {
		ticket := inService[0]
		return &ticket
	}

	return nil
}

func finalizeDisplayUnitCounts(unit *DisplayUnitQueue) {
	unit.Counts = DisplayUnitCounts{
		Waiting:   len(unit.Waiting),
		InService: len(unit.InService),
		Done:      len(unit.Done),
		Total:     len(unit.Waiting) + len(unit.InService) + len(unit.Done),
	}
}

func GetQueueDisplayBoard(c *gin.Context) {
	today := time.Now().Format("2006-01-02")

	// 1. Clinic Info from settings
	var settings []models.Setting
	_ = database.DB.Find(&settings).Error
	settingMap := make(map[string]string, len(settings))
	for _, s := range settings {
		settingMap[s.Key] = strings.TrimSpace(s.Value)
	}

	clinicName := settingMap["clinic_name"]
	if clinicName == "" {
		clinicName = settingMap["app_name"]
	}
	if clinicName == "" {
		clinicName = "RS / KLINIK UTAMA SIMKLINIK"
	}

	clinicSubtitle := settingMap["app_subtitle"]
	if clinicSubtitle == "" {
		clinicSubtitle = settingMap["clinic_address"]
	}
	if clinicSubtitle == "" {
		clinicSubtitle = "Sistem Informasi Manajemen Antrian Layanan Terpadu"
	}

	// 2. Recent calls today
	var recentCalls []models.QueueCall
	_ = database.DB.
		Where("DATE(created_at) = ?", today).
		Order("id DESC").
		Limit(25).
		Find(&recentCalls).Error

	var latestCall *models.QueueCall
	if len(recentCalls) > 0 {
		first := recentCalls[0]
		latestCall = &first
	}

	findLatestCallForUnit := func(unitType string, destinationName string) *models.QueueCall {
		for i := range recentCalls {
			call := recentCalls[i]
			if !strings.EqualFold(strings.TrimSpace(call.UnitType), unitType) {
				continue
			}
			if destinationName != "" && !strings.EqualFold(strings.TrimSpace(call.DestinationName), strings.TrimSpace(destinationName)) {
				continue
			}
			matched := call
			return &matched
		}
		return nil
	}

	// 3. Registration Queue
	var regQueues []models.RegistrationQueue
	_ = database.DB.
		Preload("Patient").
		Preload("Polyclinic").
		Preload("Doctor").
		Preload("Visit").
		Where("DATE(queue_date) = ?", today).
		Order("ticket_number ASC").
		Find(&regQueues).Error

	regUnit := DisplayUnitQueue{
		UnitKey:    "pendaftaran",
		UnitType:   "pendaftaran",
		Name:       "Loket Pendaftaran",
		Code:       "ADM",
		Subtitle:   "Pendaftaran Pasien Baru & Kunjungan Poliklinik",
		LatestCall: findLatestCallForUnit("pendaftaran", ""),
		Waiting:    []DisplayQueueTicket{},
		InService:  []DisplayQueueTicket{},
		Done:       []DisplayQueueTicket{},
	}

	for _, rq := range regQueues {
		if rq.Status == "cancelled" {
			continue
		}
		patientName := strings.TrimSpace(rq.PatientName)
		mrn := ""
		if rq.Patient != nil {
			if patientName == "" {
				patientName = strings.TrimSpace(rq.Patient.FullName)
			}
			mrn = rq.Patient.MedicalRecordNumber
		}
		if patientName == "" {
			patientName = fmt.Sprintf("Tiket #%03d", rq.TicketNumber)
		}
		poliName := ""
		if rq.Polyclinic != nil {
			poliName = rq.Polyclinic.Name
		}
		doctorName := ""
		if rq.Doctor != nil {
			doctorName = rq.Doctor.FullName
		}
		paymentType := ""
		priority := "normal"
		if rq.Visit != nil {
			paymentType = rq.Visit.PaymentType
			if rq.Visit.Priority != "" {
				priority = rq.Visit.Priority
			}
		}

		ticket := DisplayQueueTicket{
			QueueNumber:         rq.TicketNumber,
			PatientName:         patientName,
			MedicalRecordNumber: mrn,
			PolyclinicName:      poliName,
			DoctorName:          doctorName,
			PaymentType:         paymentType,
			Priority:            priority,
			Status:              rq.Status,
			UpdatedAt:           rq.UpdatedAt,
		}

		switch rq.Status {
		case "waiting":
			ticket.StatusLabel = "Menunggu Panggilan"
			regUnit.Waiting = append(regUnit.Waiting, ticket)
		case "called":
			ticket.StatusLabel = "Sedang Dipanggil"
			regUnit.InService = append(regUnit.InService, ticket)
		case "processing":
			ticket.StatusLabel = "Sedang Dilayani"
			regUnit.InService = append(regUnit.InService, ticket)
		case "completed":
			ticket.StatusLabel = "Terdaftar"
			regUnit.Done = append(regUnit.Done, ticket)
		}
	}
	regUnit.Active = resolveDisplayActiveTicket(regUnit.InService, regUnit.Waiting, regUnit.Done, regUnit.LatestCall, "Loket Pendaftaran")
	finalizeDisplayUnitCounts(&regUnit)

	// 4. Visits Today (used for Cashier and Polyclinics)
	var todayVisits []models.Visit
	_ = database.DB.
		Preload("Patient").
		Preload("Polyclinic").
		Preload("Doctor").
		Where("DATE(visit_date) = ?", today).
		Order("priority DESC, queue_number ASC").
		Find(&todayVisits).Error

	completedVisitIDs := make([]uint, 0)
	for _, v := range todayVisits {
		if v.Status == "completed" {
			completedVisitIDs = append(completedVisitIDs, v.ID)
		}
	}

	invoiceByVisitID := make(map[uint]models.Invoice)
	if len(completedVisitIDs) > 0 {
		var invoices []models.Invoice
		if err := database.DB.Where("visit_id IN ?", completedVisitIDs).Find(&invoices).Error; err == nil {
			for _, inv := range invoices {
				invoiceByVisitID[inv.VisitID] = inv
			}
		}
	}

	// 5. Cashier Unit
	cashierLatestCall := findLatestCallForUnit("kasir", "")
	cashierUnit := DisplayUnitQueue{
		UnitKey:    "kasir",
		UnitType:   "kasir",
		Name:       "Loket Kasir & Pembayaran",
		Code:       "KSR",
		Subtitle:   "Penyelesaian Administrasi & Pembayaran Layanan",
		LatestCall: cashierLatestCall,
		Waiting:    []DisplayQueueTicket{},
		InService:  []DisplayQueueTicket{},
		Done:       []DisplayQueueTicket{},
	}

	for _, v := range todayVisits {
		if v.Status != "completed" {
			continue
		}
		inv, hasInv := invoiceByVisitID[v.ID]
		if hasInv && inv.Status == "batal" {
			continue
		}

		ticket := DisplayQueueTicket{
			QueueNumber:         v.QueueNumber,
			PatientName:         strings.TrimSpace(v.Patient.FullName),
			MedicalRecordNumber: v.Patient.MedicalRecordNumber,
			PolyclinicName:      v.Polyclinic.Name,
			DoctorName:          v.Doctor.FullName,
			PaymentType:         v.PaymentType,
			Priority:            v.Priority,
			UpdatedAt:           v.UpdatedAt,
		}
		if ticket.PatientName == "" {
			ticket.PatientName = fmt.Sprintf("Pasien #%03d", v.QueueNumber)
		}

		if hasInv && inv.Status == "lunas" {
			ticket.Status = "lunas"
			ticket.StatusLabel = "Lunas"
			cashierUnit.Done = append(cashierUnit.Done, ticket)
			continue
		}

		isBeingCalled := cashierLatestCall != nil && v.QueueNumber == cashierLatestCall.QueueNumber
		if isBeingCalled || (hasInv && inv.Status == "sebagian") {
			ticket.Status = "calling"
			if isBeingCalled {
				ticket.StatusLabel = "Dipanggil ke Kasir"
			} else {
				ticket.StatusLabel = "Bayar Sebagian"
			}
			cashierUnit.InService = append(cashierUnit.InService, ticket)
		} else {
			ticket.Status = "waiting"
			if !hasInv {
				ticket.StatusLabel = "Siap Tagih"
			} else {
				ticket.StatusLabel = "Menunggu Pembayaran"
			}
			cashierUnit.Waiting = append(cashierUnit.Waiting, ticket)
		}
	}
	cashierUnit.Active = resolveDisplayActiveTicket(cashierUnit.InService, cashierUnit.Waiting, cashierUnit.Done, cashierLatestCall, "Kasir")
	finalizeDisplayUnitCounts(&cashierUnit)

	// 6. Dynamic Rooms: All Active Polyclinics + Farmasi + Laboratorium + Radiologi
	var polyclinics []models.Polyclinic
	_ = database.DB.
		Order("sort_order ASC, name ASC").
		Where("is_active = ? AND (room_type = ? OR room_type IS NULL OR room_type = '')", true, "poliklinik").
		Find(&polyclinics).Error

	visitsByPoli := make(map[uint][]models.Visit)
	for _, v := range todayVisits {
		visitsByPoli[v.PolyclinicID] = append(visitsByPoli[v.PolyclinicID], v)
	}

	rooms := make([]DisplayUnitQueue, 0, len(polyclinics)+3)
	for _, poly := range polyclinics {
		polyVisits := visitsByPoli[poly.ID]
		polyLatestCall := findLatestCallForUnit("poliklinik", poly.Name)

		doctorNames := make([]string, 0)
		seenDoctors := make(map[string]bool)
		for _, v := range polyVisits {
			docName := strings.TrimSpace(v.Doctor.FullName)
			if docName != "" && !seenDoctors[docName] {
				seenDoctors[docName] = true
				doctorNames = append(doctorNames, docName)
			}
		}

		subtitle := strings.Join(doctorNames, " • ")
		if subtitle == "" {
			subtitle = strings.TrimSpace(poly.Description)
		}
		if subtitle == "" {
			subtitle = "Poliklinik Rawat Jalan"
		}

		unit := DisplayUnitQueue{
			UnitKey:      fmt.Sprintf("poli:%d", poly.ID),
			UnitType:     "poliklinik",
			PolyclinicID: poly.ID,
			Name:         poly.Name,
			Code:         poly.Code,
			Subtitle:     subtitle,
			LatestCall:   polyLatestCall,
			Waiting:      []DisplayQueueTicket{},
			InService:    []DisplayQueueTicket{},
			Done:         []DisplayQueueTicket{},
		}

		for _, v := range polyVisits {
			if v.QueueStatus == "cancelled" || v.Status == "cancelled" {
				continue
			}

			ticket := DisplayQueueTicket{
				QueueNumber:         v.QueueNumber,
				PatientName:         strings.TrimSpace(v.Patient.FullName),
				MedicalRecordNumber: v.Patient.MedicalRecordNumber,
				PolyclinicName:      poly.Name,
				DoctorName:          v.Doctor.FullName,
				PaymentType:         v.PaymentType,
				Priority:            v.Priority,
				Status:              v.QueueStatus,
				UpdatedAt:           v.UpdatedAt,
			}
			if ticket.PatientName == "" {
				ticket.PatientName = fmt.Sprintf("Pasien #%03d", v.QueueNumber)
			}

			switch v.QueueStatus {
			case "in_consultation":
				ticket.StatusLabel = "Dalam Pemeriksaan"
				unit.InService = append(unit.InService, ticket)
			case "done":
				ticket.StatusLabel = "Selesai Poli"
				unit.Done = append(unit.Done, ticket)
			case "waiting":
				if polyLatestCall != nil && v.QueueNumber == polyLatestCall.QueueNumber && time.Since(polyLatestCall.CreatedAt) < 2*time.Minute {
					ticket.Status = "called"
					ticket.StatusLabel = "Sedang Dipanggil"
					unit.InService = append(unit.InService, ticket)
				} else {
					ticket.StatusLabel = "Menunggu"
					unit.Waiting = append(unit.Waiting, ticket)
				}
			}
		}

		unit.Active = resolveDisplayActiveTicket(unit.InService, unit.Waiting, unit.Done, polyLatestCall, poly.Name)
		finalizeDisplayUnitCounts(&unit)
		rooms = append(rooms, unit)
	}

	// Helper to preload visit relations for order units
	preloadOrderRelations := func(q *gorm.DB) *gorm.DB {
		return q.
			Preload("Patient").
			Preload("Doctor").
			Preload("Polyclinic").
			Preload("Visit")
	}

	// 6B. Farmasi / Apotek
	var pharmacyRecords []models.MedicalRecord
	_ = preloadOrderRelations(database.DB).
		Where("section_type = ?", "prescription").
		Where("prescription_fulfillment_mode = ?", prescriptionFulfillmentModeInternal).
		Where("prescription_workflow_status IN ?", []string{prescriptionWorkflowStatusOrdered, prescriptionWorkflowStatusPreparing, prescriptionWorkflowStatusReady, prescriptionWorkflowStatusDispensed}).
		Where("DATE(COALESCE(prescription_ordered_at, record_date)) = ?", today).
		Order("prescription_ordered_at ASC NULLS LAST, id ASC").
		Find(&pharmacyRecords).Error

	farmasiCall := findLatestCallForUnit("farmasi", "")
	farmasiUnit := DisplayUnitQueue{
		UnitKey:    "farmasi",
		UnitType:   "farmasi",
		Name:       "Instalasi Farmasi / Apotek",
		Code:       "FRM",
		Subtitle:   "Penyiapan & Penyerahan Resep Obat",
		LatestCall: farmasiCall,
		Waiting:    []DisplayQueueTicket{},
		InService:  []DisplayQueueTicket{},
		Done:       []DisplayQueueTicket{},
	}

	seenFarmasiVisit := make(map[uint]bool)
	for _, rec := range pharmacyRecords {
		if rec.Status == "cancelled" || rec.Visit.QueueNumber == 0 {
			continue
		}
		if seenFarmasiVisit[rec.VisitID] {
			continue
		}
		seenFarmasiVisit[rec.VisitID] = true

		ticket := DisplayQueueTicket{
			QueueNumber:         rec.Visit.QueueNumber,
			PatientName:         strings.TrimSpace(rec.Patient.FullName),
			MedicalRecordNumber: rec.Patient.MedicalRecordNumber,
			PolyclinicName:      rec.Polyclinic.Name,
			DoctorName:          rec.Doctor.FullName,
			PaymentType:         rec.Visit.PaymentType,
			Priority:            rec.Visit.Priority,
			Status:              rec.PrescriptionWorkflowStatus,
			UpdatedAt:           rec.UpdatedAt,
		}
		switch rec.PrescriptionWorkflowStatus {
		case prescriptionWorkflowStatusOrdered:
			if farmasiCall != nil && rec.Visit.QueueNumber == farmasiCall.QueueNumber {
				ticket.StatusLabel = "Dipanggil ke Apotek"
				farmasiUnit.InService = append(farmasiUnit.InService, ticket)
			} else {
				ticket.StatusLabel = "Menunggu Racik/Siap"
				farmasiUnit.Waiting = append(farmasiUnit.Waiting, ticket)
			}
		case prescriptionWorkflowStatusPreparing:
			ticket.StatusLabel = "Sedang Disiapkan"
			farmasiUnit.InService = append(farmasiUnit.InService, ticket)
		case prescriptionWorkflowStatusReady:
			ticket.StatusLabel = "Obat Siap Ambil"
			farmasiUnit.InService = append(farmasiUnit.InService, ticket)
		case prescriptionWorkflowStatusDispensed:
			ticket.StatusLabel = "Sudah Diserahkan"
			farmasiUnit.Done = append(farmasiUnit.Done, ticket)
		}
	}
	farmasiUnit.Active = resolveDisplayActiveTicket(farmasiUnit.InService, farmasiUnit.Waiting, farmasiUnit.Done, farmasiCall, "Ruangan Apotek")
	finalizeDisplayUnitCounts(&farmasiUnit)
	rooms = append(rooms, farmasiUnit)

	// 6C. Laboratorium
	var labRecords []models.MedicalRecord
	_ = preloadOrderRelations(database.DB).
		Where("section_type = ?", "laboratory").
		Where("laboratory_workflow_status IN ?", []string{supportingOrderWorkflowStatusOrdered, supportingOrderWorkflowStatusPreparing, supportingOrderWorkflowStatusCompleted}).
		Where("DATE(COALESCE(laboratory_ordered_at, record_date)) = ?", today).
		Order("laboratory_ordered_at ASC NULLS LAST, id ASC").
		Find(&labRecords).Error

	labCall := findLatestCallForUnit("laboratorium", "")
	labUnit := DisplayUnitQueue{
		UnitKey:    "laboratorium",
		UnitType:   "laboratorium",
		Name:       "Instalasi Laboratorium",
		Code:       "LAB",
		Subtitle:   "Pengambilan Sampel & Pemeriksaan Laboratorium",
		LatestCall: labCall,
		Waiting:    []DisplayQueueTicket{},
		InService:  []DisplayQueueTicket{},
		Done:       []DisplayQueueTicket{},
	}

	seenLabVisit := make(map[uint]bool)
	for _, rec := range labRecords {
		if rec.Status == "cancelled" || rec.Visit.QueueNumber == 0 {
			continue
		}
		if seenLabVisit[rec.VisitID] {
			continue
		}
		seenLabVisit[rec.VisitID] = true

		ticket := DisplayQueueTicket{
			QueueNumber:         rec.Visit.QueueNumber,
			PatientName:         strings.TrimSpace(rec.Patient.FullName),
			MedicalRecordNumber: rec.Patient.MedicalRecordNumber,
			PolyclinicName:      rec.Polyclinic.Name,
			DoctorName:          rec.Doctor.FullName,
			PaymentType:         rec.Visit.PaymentType,
			Priority:            rec.Visit.Priority,
			Status:              rec.LaboratoryWorkflowStatus,
			UpdatedAt:           rec.UpdatedAt,
		}
		switch rec.LaboratoryWorkflowStatus {
		case supportingOrderWorkflowStatusOrdered:
			if labCall != nil && rec.Visit.QueueNumber == labCall.QueueNumber {
				ticket.StatusLabel = "Dipanggil ke Lab"
				labUnit.InService = append(labUnit.InService, ticket)
			} else {
				ticket.StatusLabel = "Menunggu Sampel"
				labUnit.Waiting = append(labUnit.Waiting, ticket)
			}
		case supportingOrderWorkflowStatusPreparing:
			ticket.StatusLabel = "Sedang Diperiksa"
			labUnit.InService = append(labUnit.InService, ticket)
		case supportingOrderWorkflowStatusCompleted:
			ticket.StatusLabel = "Hasil Selesai"
			labUnit.Done = append(labUnit.Done, ticket)
		}
	}
	labUnit.Active = resolveDisplayActiveTicket(labUnit.InService, labUnit.Waiting, labUnit.Done, labCall, "Laboratorium")
	finalizeDisplayUnitCounts(&labUnit)
	rooms = append(rooms, labUnit)

	// 6D. Radiologi
	var radRecords []models.MedicalRecord
	_ = preloadOrderRelations(database.DB).
		Where("section_type = ?", "radiology").
		Where("radiology_workflow_status IN ?", []string{supportingOrderWorkflowStatusOrdered, supportingOrderWorkflowStatusPreparing, supportingOrderWorkflowStatusCompleted}).
		Where("DATE(COALESCE(radiology_ordered_at, record_date)) = ?", today).
		Order("radiology_ordered_at ASC NULLS LAST, id ASC").
		Find(&radRecords).Error

	radCall := findLatestCallForUnit("radiologi", "")
	radUnit := DisplayUnitQueue{
		UnitKey:    "radiologi",
		UnitType:   "radiologi",
		Name:       "Instalasi Radiologi",
		Code:       "RAD",
		Subtitle:   "Pemeriksaan Pencitraan & Radiodiagnostik",
		LatestCall: radCall,
		Waiting:    []DisplayQueueTicket{},
		InService:  []DisplayQueueTicket{},
		Done:       []DisplayQueueTicket{},
	}

	seenRadVisit := make(map[uint]bool)
	for _, rec := range radRecords {
		if rec.Status == "cancelled" || rec.Visit.QueueNumber == 0 {
			continue
		}
		if seenRadVisit[rec.VisitID] {
			continue
		}
		seenRadVisit[rec.VisitID] = true

		ticket := DisplayQueueTicket{
			QueueNumber:         rec.Visit.QueueNumber,
			PatientName:         strings.TrimSpace(rec.Patient.FullName),
			MedicalRecordNumber: rec.Patient.MedicalRecordNumber,
			PolyclinicName:      rec.Polyclinic.Name,
			DoctorName:          rec.Doctor.FullName,
			PaymentType:         rec.Visit.PaymentType,
			Priority:            rec.Visit.Priority,
			Status:              rec.RadiologyWorkflowStatus,
			UpdatedAt:           rec.UpdatedAt,
		}
		switch rec.RadiologyWorkflowStatus {
		case supportingOrderWorkflowStatusOrdered:
			if radCall != nil && rec.Visit.QueueNumber == radCall.QueueNumber {
				ticket.StatusLabel = "Dipanggil ke Radiologi"
				radUnit.InService = append(radUnit.InService, ticket)
			} else {
				ticket.StatusLabel = "Menunggu Foto"
				radUnit.Waiting = append(radUnit.Waiting, ticket)
			}
		case supportingOrderWorkflowStatusPreparing:
			ticket.StatusLabel = "Sedang Diperiksa"
			radUnit.InService = append(radUnit.InService, ticket)
		case supportingOrderWorkflowStatusCompleted:
			ticket.StatusLabel = "Hasil Selesai"
			radUnit.Done = append(radUnit.Done, ticket)
		}
	}
	radUnit.Active = resolveDisplayActiveTicket(radUnit.InService, radUnit.Waiting, radUnit.Done, radCall, "Radiologi")
	finalizeDisplayUnitCounts(&radUnit)
	rooms = append(rooms, radUnit)

	clinicLogo := settingMap["app_logo"]
	if clinicLogo == "" {
		clinicLogo = settingMap["app_print_logo"]
	}
	if clinicLogo == "" {
		clinicLogo = settingMap["logo"]
	}

	c.JSON(http.StatusOK, gin.H{
		"data": DisplayBoardResponse{
			Date: today,
			ClinicInfo: DisplayClinicInfo{
				Name:               clinicName,
				Subtitle:           clinicSubtitle,
				Logo:               clinicLogo,
				DisplayVideoURL:    settingMap["display_video_url"],
				DisplayAds:         settingMap["display_ads"],
				DisplayRunningText: settingMap["display_running_text"],
			},
			LatestCall:   latestCall,
			RecentCalls:  recentCalls,
			Registration: regUnit,
			Cashier:      cashierUnit,
			Rooms:        rooms,
		},
	})
}
