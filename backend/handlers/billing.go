package handlers

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"gorm.io/gorm"
)

// ========================
// Invoice / Billing Aggregator
// ========================

type InvoiceItemDetail struct {
	ID          uint    `json:"id"`
	ItemType    string  `json:"item_type"`
	ReferenceID uint    `json:"reference_id"`
	Description string  `json:"description"`
	Quantity    int     `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	Discount    float64 `json:"discount"`
	TotalPrice  float64 `json:"total_price"`
}

type InvoiceListResponse struct {
	ID            uint                `json:"id"`
	InvoiceNumber string              `json:"invoice_number"`
	VisitID       uint                `json:"visit_id"`
	PatientID     uint                `json:"patient_id"`
	InvoiceDate   time.Time           `json:"invoice_date"`
	SubTotal      float64             `json:"sub_total"`
	Discount      float64             `json:"discount"`
	DiscountType  string              `json:"discount_type"`
	Tax           float64             `json:"tax"`
	TotalAmount   float64             `json:"total_amount"`
	PaidAmount    float64             `json:"paid_amount"`
	Status        string              `json:"status"`
	Notes         string              `json:"notes"`
	CreatedAt     time.Time           `json:"created_at"`
	Visit         *models.Visit       `json:"visit,omitempty"`
	Patient       *models.Patient     `json:"patient,omitempty"`
	Items         []InvoiceItemDetail `json:"items,omitempty"`
	Payments      []models.Payment    `json:"payments,omitempty"`
}

// GetInvoices returns all invoices for kasir queue
func GetInvoices(c *gin.Context) {
	status := c.Query("status")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")
	search := c.Query("search")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))

	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 20
	}
	offset := (page - 1) * perPage

	query := database.DB.Model(&models.Invoice{}).
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Polyclinic").
		Preload("Visit.Doctor").
		Preload("Patient").
		Preload("Items").
		Preload("Payments").
		Preload("Payments.PaymentMethod")

	if status != "" && status != "all" {
		query = query.Where("status = ?", status)
	}

	if dateFrom != "" {
		if parsed, err := time.ParseInLocation("2006-01-02", dateFrom, time.Local); err == nil {
			query = query.Where("invoice_date >= ?", parsed)
		}
	}

	if dateTo != "" {
		if parsed, err := time.ParseInLocation("2006-01-02", dateTo, time.Local); err == nil {
			query = query.Where("invoice_date < ?", parsed.AddDate(0, 0, 1))
		}
	}

	if search != "" {
		searchPattern := "%" + strings.ToLower(search) + "%"
		query = query.Joins("LEFT JOIN patients ON patients.id = invoices.patient_id").
			Where("LOWER(invoice_number) LIKE ? OR LOWER(patients.full_name) LIKE ? OR LOWER(patients.medical_record_number) LIKE ?",
				searchPattern, searchPattern, searchPattern)
	}

	var total int64
	query.Count(&total)

	var invoices []models.Invoice
	if err := query.Order("created_at DESC").Offset(offset).Limit(perPage).Find(&invoices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Convert to response with paid amount calculation
	var response []InvoiceListResponse
	for _, inv := range invoices {
		var paidAmount float64
		for _, p := range inv.Payments {
			paidAmount += p.Amount
		}

		items := make([]InvoiceItemDetail, len(inv.Items))
		for i, item := range inv.Items {
			items[i] = InvoiceItemDetail{
				ID:          item.ID,
				ItemType:    item.ItemType,
				ReferenceID: item.ReferenceID,
				Description: item.Description,
				Quantity:    item.Quantity,
				UnitPrice:   item.UnitPrice,
				Discount:    item.Discount,
				TotalPrice:  item.TotalPrice,
			}
		}

		response = append(response, InvoiceListResponse{
			ID:            inv.ID,
			InvoiceNumber: inv.InvoiceNumber,
			VisitID:       inv.VisitID,
			PatientID:     inv.PatientID,
			InvoiceDate:   inv.InvoiceDate,
			SubTotal:      inv.SubTotal,
			Discount:      inv.Discount,
			DiscountType:  inv.DiscountType,
			Tax:           inv.Tax,
			TotalAmount:   inv.TotalAmount,
			PaidAmount:    paidAmount,
			Status:        inv.Status,
			Notes:         inv.Notes,
			CreatedAt:     inv.CreatedAt,
			Visit:         &inv.Visit,
			Patient:       &inv.Patient,
			Items:         items,
			Payments:      inv.Payments,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     response,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

// GetInvoice returns single invoice by ID
func GetInvoice(c *gin.Context) {
	id := c.Param("id")

	var invoice models.Invoice
	if err := database.DB.
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Polyclinic").
		Preload("Visit.Doctor").
		Preload("Patient").
		Preload("Items").
		Preload("Payments").
		Preload("Payments.PaymentMethod").
		Preload("Payments.Receiver").
		Preload("Creator").
		First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice tidak ditemukan"})
		return
	}

	var paidAmount float64
	for _, p := range invoice.Payments {
		paidAmount += p.Amount
	}

	items := make([]InvoiceItemDetail, len(invoice.Items))
	for i, item := range invoice.Items {
		items[i] = InvoiceItemDetail{
			ID:          item.ID,
			ItemType:    item.ItemType,
			ReferenceID: item.ReferenceID,
			Description: item.Description,
			Quantity:    item.Quantity,
			UnitPrice:   item.UnitPrice,
			Discount:    item.Discount,
			TotalPrice:  item.TotalPrice,
		}
	}

	response := InvoiceListResponse{
		ID:            invoice.ID,
		InvoiceNumber: invoice.InvoiceNumber,
		VisitID:       invoice.VisitID,
		PatientID:     invoice.PatientID,
		InvoiceDate:   invoice.InvoiceDate,
		SubTotal:      invoice.SubTotal,
		Discount:      invoice.Discount,
		DiscountType:  invoice.DiscountType,
		Tax:           invoice.Tax,
		TotalAmount:   invoice.TotalAmount,
		PaidAmount:    paidAmount,
		Status:        invoice.Status,
		Notes:         invoice.Notes,
		CreatedAt:     invoice.CreatedAt,
		Visit:         &invoice.Visit,
		Patient:       &invoice.Patient,
		Items:         items,
		Payments:      invoice.Payments,
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}

// GetInvoiceByVisit returns invoice for a specific visit
func GetInvoiceByVisit(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("visitId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	var invoice models.Invoice
	result := database.DB.
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Polyclinic").
		Preload("Visit.Doctor").
		Preload("Patient").
		Preload("Items").
		Preload("Payments").
		Preload("Payments.PaymentMethod").
		Where("visit_id = ?", visitID).
		First(&invoice)

	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Invoice belum dibuat untuk kunjungan ini"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	var paidAmount float64
	for _, p := range invoice.Payments {
		paidAmount += p.Amount
	}

	items := make([]InvoiceItemDetail, len(invoice.Items))
	for i, item := range invoice.Items {
		items[i] = InvoiceItemDetail{
			ID:          item.ID,
			ItemType:    item.ItemType,
			ReferenceID: item.ReferenceID,
			Description: item.Description,
			Quantity:    item.Quantity,
			UnitPrice:   item.UnitPrice,
			Discount:    item.Discount,
			TotalPrice:  item.TotalPrice,
		}
	}

	response := InvoiceListResponse{
		ID:            invoice.ID,
		InvoiceNumber: invoice.InvoiceNumber,
		VisitID:       invoice.VisitID,
		PatientID:     invoice.PatientID,
		InvoiceDate:   invoice.InvoiceDate,
		SubTotal:      invoice.SubTotal,
		Discount:      invoice.Discount,
		DiscountType:  invoice.DiscountType,
		Tax:           invoice.Tax,
		TotalAmount:   invoice.TotalAmount,
		PaidAmount:    paidAmount,
		Status:        invoice.Status,
		Notes:         invoice.Notes,
		CreatedAt:     invoice.CreatedAt,
		Visit:         &invoice.Visit,
		Patient:       &invoice.Patient,
		Items:         items,
		Payments:      invoice.Payments,
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}

func resolveVisitAdministrationFee(tx *gorm.DB, visit models.Visit) float64 {
	if visit.Polyclinic.ID > 0 && visit.Polyclinic.AdminFee > 0 {
		return visit.Polyclinic.AdminFee
	}

	var registrationService models.MedicalService
	if err := tx.Where("service_domain = ? AND LOWER(name) LIKE ?", "general", "%pendaftaran%").First(&registrationService).Error; err == nil && registrationService.Price > 0 {
		return registrationService.Price
	}

	return 0
}

func buildInvoiceResponse(invoice models.Invoice) InvoiceListResponse {
	var paidAmount float64
	for _, p := range invoice.Payments {
		paidAmount += p.Amount
	}

	items := make([]InvoiceItemDetail, len(invoice.Items))
	for i, item := range invoice.Items {
		items[i] = InvoiceItemDetail{
			ID:          item.ID,
			ItemType:    item.ItemType,
			ReferenceID: item.ReferenceID,
			Description: item.Description,
			Quantity:    item.Quantity,
			UnitPrice:   item.UnitPrice,
			Discount:    item.Discount,
			TotalPrice:  item.TotalPrice,
		}
	}

	return InvoiceListResponse{
		ID:            invoice.ID,
		InvoiceNumber: invoice.InvoiceNumber,
		VisitID:       invoice.VisitID,
		PatientID:     invoice.PatientID,
		InvoiceDate:   invoice.InvoiceDate,
		SubTotal:      invoice.SubTotal,
		Discount:      invoice.Discount,
		DiscountType:  invoice.DiscountType,
		Tax:           invoice.Tax,
		TotalAmount:   invoice.TotalAmount,
		PaidAmount:    paidAmount,
		Status:        invoice.Status,
		Notes:         invoice.Notes,
		CreatedAt:     invoice.CreatedAt,
		Visit:         &invoice.Visit,
		Patient:       &invoice.Patient,
		Items:         items,
		Payments:      invoice.Payments,
	}
}

func buildVisitInvoiceItems(tx *gorm.DB, visit models.Visit, requireRegistrationFee bool) ([]models.InvoiceItem, float64, error) {
	var medicalRecords []models.MedicalRecord
	if err := tx.Where("visit_id = ?", visit.ID).Find(&medicalRecords).Error; err != nil {
		return nil, 0, err
	}

	var items []models.InvoiceItem
	registrationFee := resolveVisitAdministrationFee(tx, visit)
	if registrationFee <= 0 && requireRegistrationFee {
		return nil, 0, fmt.Errorf("biaya administrasi untuk poli %s belum diatur", visit.Polyclinic.Name)
	}
	if registrationFee > 0 {
		description := "Biaya Administrasi"
		if strings.TrimSpace(visit.Polyclinic.Name) != "" {
			description = fmt.Sprintf("Biaya Administrasi %s", visit.Polyclinic.Name)
		}
		items = append(items, models.InvoiceItem{
			ItemType:    "pendaftaran",
			ReferenceID: visit.ID,
			Description: description,
			Quantity:    1,
			UnitPrice:   registrationFee,
			Discount:    0,
			TotalPrice:  registrationFee,
		})
	}

	processedActions := make(map[uint]bool)
	processedPrescriptions := make(map[uint]bool)
	processedCompounds := make(map[uint]bool)
	processedLabItems := make(map[uint]bool)
	processedRadItems := make(map[uint]bool)

	for _, mr := range medicalRecords {
		if mr.Status == "cancelled" {
			continue
		}

		var actions []models.MedicalAction
		tx.Preload("MedicalService").Where("medical_record_id = ?", mr.ID).Find(&actions)
		for _, action := range actions {
			if processedActions[action.ID] {
				continue
			}
			processedActions[action.ID] = true

			description := action.ServiceNameSnapshot
			if description == "" && action.MedicalService.ID > 0 {
				description = action.MedicalService.Name
			}
			price := action.Price
			if price == 0 && action.MedicalService.ID > 0 {
				price = action.MedicalService.Price
			}
			qty := action.Quantity
			if qty == 0 {
				qty = 1
			}

			items = append(items, models.InvoiceItem{
				ItemType:    "tindakan",
				ReferenceID: action.ID,
				Description: fmt.Sprintf("Tindakan: %s", description),
				Quantity:    qty,
				UnitPrice:   price,
				Discount:    0,
				TotalPrice:  price * float64(qty),
			})
		}

		var prescriptions []models.Prescription
		tx.Preload("Medicine").Where("medical_record_id = ?", mr.ID).Find(&prescriptions)
		for _, presc := range prescriptions {
			if processedPrescriptions[presc.ID] {
				continue
			}
			processedPrescriptions[presc.ID] = true
			if presc.Medicine.ID == 0 {
				continue
			}

			price := presc.Medicine.SellingPrice
			qty := presc.Quantity
			if qty == 0 {
				qty = 1
			}

			items = append(items, models.InvoiceItem{
				ItemType:    "obat",
				ReferenceID: presc.ID,
				Description: fmt.Sprintf("Obat: %s", presc.Medicine.Name),
				Quantity:    qty,
				UnitPrice:   price,
				Discount:    0,
				TotalPrice:  price * float64(qty),
			})
		}

		var compounds []models.PrescriptionCompound
		tx.Preload("Items").Preload("Items.Medicine").Where("medical_record_id = ?", mr.ID).Find(&compounds)
		for _, comp := range compounds {
			if processedCompounds[comp.ID] {
				continue
			}
			processedCompounds[comp.ID] = true

			var compoundPrice float64
			for _, item := range comp.Items {
				if item.Medicine.ID > 0 {
					compoundPrice += item.Medicine.SellingPrice * float64(item.Quantity)
				}
			}

			items = append(items, models.InvoiceItem{
				ItemType:    "racikan",
				ReferenceID: comp.ID,
				Description: fmt.Sprintf("Racikan: %s", comp.Name),
				Quantity:    1,
				UnitPrice:   compoundPrice,
				Discount:    0,
				TotalPrice:  compoundPrice,
			})
		}

		var labItems []models.LaboratoryOrderItem
		tx.Preload("MedicalService").Where("medical_record_id = ?", mr.ID).Find(&labItems)
		for _, labItem := range labItems {
			if processedLabItems[labItem.ID] {
				continue
			}
			processedLabItems[labItem.ID] = true

			description := labItem.TestNameSnapshot
			if description == "" && labItem.MedicalService.ID > 0 {
				description = labItem.MedicalService.Name
			}
			price := 0.0
			if labItem.MedicalService.ID > 0 {
				price = labItem.MedicalService.Price
			}

			items = append(items, models.InvoiceItem{
				ItemType:    "laboratorium",
				ReferenceID: labItem.ID,
				Description: fmt.Sprintf("Lab: %s", description),
				Quantity:    1,
				UnitPrice:   price,
				Discount:    0,
				TotalPrice:  price,
			})
		}

		var radItems []models.RadiologyOrderItem
		tx.Preload("MedicalService").Where("medical_record_id = ?", mr.ID).Find(&radItems)
		for _, radItem := range radItems {
			if processedRadItems[radItem.ID] {
				continue
			}
			processedRadItems[radItem.ID] = true

			description := radItem.ServiceNameSnapshot
			if description == "" && radItem.MedicalService.ID > 0 {
				description = radItem.MedicalService.Name
			}
			price := 0.0
			if radItem.MedicalService.ID > 0 {
				price = radItem.MedicalService.Price
			}

			items = append(items, models.InvoiceItem{
				ItemType:    "radiologi",
				ReferenceID: radItem.ID,
				Description: fmt.Sprintf("Radiologi: %s", description),
				Quantity:    1,
				UnitPrice:   price,
				Discount:    0,
				TotalPrice:  price,
			})
		}
	}

	if len(items) == 0 {
		return nil, 0, fmt.Errorf("belum ada item tagihan untuk kunjungan ini")
	}

	var subTotal float64
	for _, item := range items {
		subTotal += item.TotalPrice
	}

	return items, subTotal, nil
}

func upsertVisitInvoice(tx *gorm.DB, visitID uint, createdBy uint, requireRegistrationFee bool) (models.Invoice, error) {
	var visit models.Visit
	if err := tx.Preload("Patient").Preload("Polyclinic").Preload("Doctor").First(&visit, visitID).Error; err != nil {
		return models.Invoice{}, err
	}

	var invoice models.Invoice
	result := tx.Where("visit_id = ?", visitID).First(&invoice)
	if result.Error == nil && invoice.Status == "lunas" {
		return models.Invoice{}, fmt.Errorf("invoice sudah lunas, tidak dapat di-sync")
	}
	if result.Error != nil && !errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return models.Invoice{}, result.Error
	}

	items, subTotal, err := buildVisitInvoiceItems(tx, visit, requireRegistrationFee)
	if err != nil {
		return models.Invoice{}, err
	}

	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		invoice = models.Invoice{
			InvoiceNumber: generateInvoiceNumber(),
			VisitID:       visit.ID,
			PatientID:     visit.PatientID,
			InvoiceDate:   time.Now(),
			SubTotal:      subTotal,
			Discount:      0,
			Tax:           0,
			TotalAmount:   subTotal,
			Status:        "belum_bayar",
			CreatedBy:     createdBy,
		}

		if err := tx.Create(&invoice).Error; err != nil {
			return models.Invoice{}, err
		}
	} else {
		if err := tx.Model(&invoice).Updates(map[string]interface{}{
			"sub_total":    subTotal,
			"total_amount": subTotal - invoice.Discount + invoice.Tax,
		}).Error; err != nil {
			return models.Invoice{}, err
		}

		if err := tx.Where("invoice_id = ?", invoice.ID).Delete(&models.InvoiceItem{}).Error; err != nil {
			return models.Invoice{}, err
		}
	}

	for i := range items {
		items[i].InvoiceID = invoice.ID
	}
	if err := tx.Create(&items).Error; err != nil {
		return models.Invoice{}, err
	}

	if err := tx.
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Polyclinic").
		Preload("Patient").
		Preload("Items").
		Preload("Payments").
		First(&invoice, invoice.ID).Error; err != nil {
		return models.Invoice{}, err
	}

	return invoice, nil
}

// SyncVisitInvoice aggregates all billable items from a visit and creates/updates invoice
func SyncVisitInvoice(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("visitId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	userID, _ := c.Get("user_id")
	createdBy := uint(0)
	if uid, ok := userID.(uint); ok {
		createdBy = uid
	} else if uid, ok := userID.(float64); ok {
		createdBy = uint(uid)
	}
	var invoice models.Invoice
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		var syncErr error
		invoice, syncErr = upsertVisitInvoice(tx, uint(visitID), createdBy, false)
		return syncErr
	}); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Invoice berhasil di-sync",
		"data":    buildInvoiceResponse(invoice),
	})
}

// UpdateInvoice updates invoice discount, tax, notes
type UpdateInvoiceRequest struct {
	Discount     float64 `json:"discount"`
	DiscountType string  `json:"discount_type"`
	Tax          float64 `json:"tax"`
	Notes        string  `json:"notes"`
}

func UpdateInvoice(c *gin.Context) {
	id := c.Param("id")

	var invoice models.Invoice
	if err := database.DB.First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice tidak ditemukan"})
		return
	}

	if invoice.Status == "lunas" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invoice sudah lunas, tidak dapat diubah"})
		return
	}

	var req UpdateInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	normalizedDiscountType := strings.ToLower(strings.TrimSpace(req.DiscountType))
	if req.Discount < 0 {
		req.Discount = 0
	}
	if req.Tax < 0 {
		req.Tax = 0
	}

	discount := 0.0
	switch normalizedDiscountType {
	case "persen":
		if req.Discount > 0 && invoice.SubTotal > 0 {
			discount = invoice.SubTotal * (req.Discount / 100)
		} else {
			normalizedDiscountType = ""
		}
	case "nominal":
		if req.Discount > 0 {
			discount = req.Discount
		} else {
			normalizedDiscountType = ""
		}
	default:
		normalizedDiscountType = ""
	}

	if discount > invoice.SubTotal {
		discount = invoice.SubTotal
	}

	totalAmount := invoice.SubTotal - discount + req.Tax
	if totalAmount < 0 {
		totalAmount = 0
	}

	if err := database.DB.Model(&invoice).Updates(map[string]interface{}{
		"discount":      discount,
		"discount_type": normalizedDiscountType,
		"tax":           req.Tax,
		"total_amount":  totalAmount,
		"notes":         req.Notes,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Invoice berhasil diupdate"})
}

// ProcessPayment processes payment for an invoice
type ProcessPaymentRequest struct {
	PaymentMethodID uint    `json:"payment_method_id" binding:"required"`
	Amount          float64 `json:"amount" binding:"required"`
	ReferenceNumber string  `json:"reference_number"`
	Notes           string  `json:"notes"`
}

func ProcessPayment(c *gin.Context) {
	id := c.Param("id")

	var invoice models.Invoice
	if err := database.DB.Preload("Payments").Preload("Visit").First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice tidak ditemukan"})
		return
	}

	if invoice.Status == "lunas" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invoice sudah lunas"})
		return
	}

	if invoice.Visit.ID == 0 || invoice.Visit.Status != "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan belum final. Finalisasikan kunjungan di EMR sebelum menerima pembayaran di kasir"})
		return
	}

	var req ProcessPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate payment method
	var paymentMethod models.PaymentMethod
	if err := database.DB.First(&paymentMethod, req.PaymentMethodID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Metode pembayaran tidak valid"})
		return
	}

	// Calculate paid amount
	var paidAmount float64
	for _, p := range invoice.Payments {
		paidAmount += p.Amount
	}

	remaining := invoice.TotalAmount - paidAmount
	if req.Amount > remaining {
		req.Amount = remaining
	}
	if req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tidak ada sisa tagihan yang dapat dibayarkan"})
		return
	}

	userID, _ := c.Get("user_id")
	receivedBy := uint(0)
	if uid, ok := userID.(uint); ok {
		receivedBy = uid
	} else if uid, ok := userID.(float64); ok {
		receivedBy = uint(uid)
	}

	tx := database.DB.Begin()

	// Create payment record
	payment := models.Payment{
		InvoiceID:       invoice.ID,
		PaymentMethodID: req.PaymentMethodID,
		Amount:          req.Amount,
		PaymentDate:     time.Now(),
		ReferenceNumber: req.ReferenceNumber,
		ReceivedBy:      receivedBy,
		Notes:           req.Notes,
	}

	if err := tx.Create(&payment).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Update invoice status
	newPaidAmount := paidAmount + req.Amount
	newStatus := invoice.Status

	if newPaidAmount >= invoice.TotalAmount {
		newStatus = "lunas"
	} else if newPaidAmount > 0 {
		newStatus = "sebagian"
	}

	if err := tx.Model(&invoice).Update("status", newStatus).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if newStatus == "lunas" {
		if err := tx.Model(&models.Visit{}).Where("id = ?", invoice.VisitID).Updates(map[string]interface{}{
			"status":       "completed",
			"queue_status": "done",
		}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Reload payment with relations
	database.DB.Preload("PaymentMethod").Preload("Receiver").First(&payment, payment.ID)

	c.JSON(http.StatusOK, gin.H{
		"message": "Pembayaran berhasil dicatat",
		"data":    payment,
		"status":  newStatus,
	})
}

// GetCashierQueue returns visits ready for billing
func GetCashierQueue(c *gin.Context) {
	dateFilter := c.DefaultQuery("date", time.Now().Format("2006-01-02"))
	search := c.Query("search")

	parsedDate, err := time.ParseInLocation("2006-01-02", dateFilter, time.Local)
	if err != nil {
		parsedDate = time.Now()
	}

	startOfDay := time.Date(parsedDate.Year(), parsedDate.Month(), parsedDate.Day(), 0, 0, 0, 0, parsedDate.Location())
	endOfDay := startOfDay.AddDate(0, 0, 1)

	// Only finalized visits should enter cashier queue for payment processing.
	query := database.DB.Model(&models.Visit{}).
		Preload("Patient").
		Preload("Polyclinic").
		Preload("Doctor").
		Where("visit_date >= ? AND visit_date < ?", startOfDay, endOfDay).
		Where("status = ?", "completed")

	if search != "" {
		searchPattern := "%" + strings.ToLower(search) + "%"
		query = query.Joins("LEFT JOIN patients ON patients.id = visits.patient_id").
			Where("LOWER(patients.full_name) LIKE ? OR LOWER(patients.medical_record_number) LIKE ? OR LOWER(visit_number) LIKE ?",
				searchPattern, searchPattern, searchPattern)
	}

	var visits []models.Visit
	if err := query.Order("queue_number ASC").Find(&visits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Get invoices for these visits
	var visitIDs []uint
	for _, v := range visits {
		visitIDs = append(visitIDs, v.ID)
	}

	var invoices []models.Invoice
	if len(visitIDs) > 0 {
		database.DB.Preload("Payments").Where("visit_id IN ?", visitIDs).Find(&invoices)
	}

	invoiceMap := make(map[uint]models.Invoice)
	for _, inv := range invoices {
		invoiceMap[inv.VisitID] = inv
	}

	type QueueItem struct {
		Visit         models.Visit `json:"visit"`
		HasInvoice    bool         `json:"has_invoice"`
		InvoiceID     uint         `json:"invoice_id"`
		InvoiceStatus string       `json:"invoice_status"`
		TotalAmount   float64      `json:"total_amount"`
		PaidAmount    float64      `json:"paid_amount"`
	}

	var queue []QueueItem
	for _, v := range visits {
		item := QueueItem{
			Visit:      v,
			HasInvoice: false,
		}

		if inv, ok := invoiceMap[v.ID]; ok {
			item.HasInvoice = true
			item.InvoiceID = inv.ID
			item.InvoiceStatus = inv.Status
			item.TotalAmount = inv.TotalAmount

			var paidAmount float64
			for _, p := range inv.Payments {
				paidAmount += p.Amount
			}
			item.PaidAmount = paidAmount
		}

		queue = append(queue, item)
	}

	c.JSON(http.StatusOK, gin.H{"data": queue})
}

// GetBillingStats returns billing statistics
func GetBillingStats(c *gin.Context) {
	dateFilter := c.DefaultQuery("date", time.Now().Format("2006-01-02"))

	parsedDate, err := time.ParseInLocation("2006-01-02", dateFilter, time.Local)
	if err != nil {
		parsedDate = time.Now()
	}

	startOfDay := time.Date(parsedDate.Year(), parsedDate.Month(), parsedDate.Day(), 0, 0, 0, 0, parsedDate.Location())
	endOfDay := startOfDay.AddDate(0, 0, 1)

	// Today's stats
	var totalInvoices int64
	var unpaidCount int64
	var partialCount int64
	var paidCount int64

	database.DB.Model(&models.Invoice{}).
		Where("invoice_date >= ? AND invoice_date < ?", startOfDay, endOfDay).
		Count(&totalInvoices)

	database.DB.Model(&models.Invoice{}).
		Where("invoice_date >= ? AND invoice_date < ?", startOfDay, endOfDay).
		Where("status = ?", "belum_bayar").
		Count(&unpaidCount)

	database.DB.Model(&models.Invoice{}).
		Where("invoice_date >= ? AND invoice_date < ?", startOfDay, endOfDay).
		Where("status = ?", "sebagian").
		Count(&partialCount)

	database.DB.Model(&models.Invoice{}).
		Where("invoice_date >= ? AND invoice_date < ?", startOfDay, endOfDay).
		Where("status = ?", "lunas").
		Count(&paidCount)

	// Revenue stats
	var totalRevenue float64
	var row struct{ Total float64 }
	database.DB.Model(&models.Payment{}).
		Select("COALESCE(SUM(amount), 0) as total").
		Where("payment_date >= ? AND payment_date < ?", startOfDay, endOfDay).
		Scan(&row)
	totalRevenue = row.Total

	// Pending amount
	var pendingRow struct{ Total float64 }
	database.DB.Model(&models.Invoice{}).
		Select("COALESCE(SUM(total_amount), 0) as total").
		Where("invoice_date >= ? AND invoice_date < ?", startOfDay, endOfDay).
		Where("status IN ?", []string{"belum_bayar", "sebagian"}).
		Scan(&pendingRow)

	c.JSON(http.StatusOK, gin.H{
		"date":           dateFilter,
		"total_invoices": totalInvoices,
		"unpaid":         unpaidCount,
		"partial":        partialCount,
		"paid":           paidCount,
		"total_revenue":  totalRevenue,
		"pending_amount": pendingRow.Total,
	})
}

// Helper: Generate invoice number
func generateInvoiceNumber() string {
	now := time.Now()
	prefix := fmt.Sprintf("INV%s", now.Format("20060102"))

	var lastInvoice models.Invoice
	database.DB.Where("invoice_number LIKE ?", prefix+"%").
		Order("invoice_number DESC").
		First(&lastInvoice)

	var sequence int
	if lastInvoice.ID > 0 {
		// Extract sequence from last invoice
		parts := strings.Split(lastInvoice.InvoiceNumber, prefix)
		if len(parts) > 1 {
			sequence, _ = strconv.Atoi(parts[1])
		}
	}

	sequence++
	return fmt.Sprintf("%s%04d", prefix, sequence)
}

// PrintInvoice generates PDF receipt
func PrintInvoice(c *gin.Context) {
	id := c.Param("id")

	var invoice models.Invoice
	if err := database.DB.
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Polyclinic").
		Preload("Visit.Doctor").
		Preload("Patient").
		Preload("Creator").
		Preload("Items").
		Preload("Payments").
		Preload("Payments.PaymentMethod").
		Preload("Payments.Receiver").
		First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice tidak ditemukan"})
		return
	}

	hospitalInfo := getInitialAssessmentHospitalInfo()
	generatedAt := time.Now()
	var totalPaid float64
	for _, payment := range invoice.Payments {
		totalPaid += payment.Amount
	}
	remaining := invoice.TotalAmount - totalPaid
	if remaining < 0 {
		remaining = 0
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)
	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle("Kwitansi Pembayaran", false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetHeaderFuncMode(func() {
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, "KWITANSI PEMBAYARAN", fallbackText(invoice.Visit.VisitNumber))
	}, true)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-7)
		pdf.SetFont("Arial", "", 7)
		pdf.SetTextColor(90, 90, 90)
		pdf.CellFormat(0, 4, "Dicetak: "+formatDateTimeIndonesian(generatedAt), "", 0, "L", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AddPage()
	drawInvoiceStatusWatermark(pdf, invoice.Status)
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	addInvoiceCompactFieldSection(pdf, "Informasi Invoice", buildInvoiceDocumentFields(invoice), "")
	addInvoiceCompactFieldSection(pdf, "Informasi Pasien", buildInvoicePatientFields(invoice), "")
	addInvoiceItemSection(pdf, invoice)
	addInvoiceSummaryBlock(pdf, buildInvoiceSummaryFields(invoice, totalPaid, remaining))

	if len(invoice.Payments) > 0 {
		addInvoicePaymentSection(pdf, invoice.Payments)
	}

	if strings.TrimSpace(invoice.Notes) != "" {
		addInitialAssessmentSectionTitle(pdf, "Catatan")
		addInitialAssessmentFullWidthRow(pdf, invoice.Notes, false)
		addInitialAssessmentSectionSpacing(pdf)
	}

	addOrderPrintSignatureSection(
		pdf,
		hospitalInfo,
		generatedAt,
		"Pasien",
		fallbackText(invoice.Patient.FullName),
		"Petugas Kasir",
		resolveInvoiceCashierSignatureName(invoice),
	)

	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=invoice_%s.pdf", invoice.InvoiceNumber))

	if err := pdf.Output(c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF"})
	}
}

func formatCurrency(amount float64) string {
	rounded := math.Round(amount)
	return fmt.Sprintf("Rp %s", formatNumber(rounded))
}

func formatNumber(n float64) string {
	str := strconv.FormatFloat(n, 'f', 0, 64)
	result := ""
	for i, c := range str {
		if i > 0 && (len(str)-i)%3 == 0 {
			result += "."
		}
		result += string(c)
	}
	return result
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func buildInvoiceDocumentFields(invoice models.Invoice) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "No. Invoice", Value: fallbackText(invoice.InvoiceNumber)},
		{Label: "Tanggal Invoice", Value: formatDateTimeIndonesian(invoice.InvoiceDate)},
		{Label: "No. Kunjungan", Value: fallbackText(invoice.Visit.VisitNumber)},
		{Label: "Dokter", Value: fallbackText(invoice.Visit.Doctor.FullName)},
		{Label: "Poliklinik", Value: fallbackText(invoice.Visit.Polyclinic.Name)},
		{Label: "Status", Value: resolveInvoiceStatusWatermarkText(invoice.Status)},
	}
}

func buildInvoicePatientFields(invoice models.Invoice) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "No. Rekam Medis", Value: fallbackText(invoice.Patient.MedicalRecordNumber)},
		{Label: "Nama Pasien", Value: fallbackText(invoice.Patient.FullName)},
		{Label: "Jenis Kelamin", Value: fallbackText(genderLabelForPrint(invoice.Patient.Gender))},
		{Label: "No. Telepon", Value: fallbackText(invoice.Patient.Phone)},
		{Label: "Alamat", Value: formatPatientAddress(invoice.Patient)},
	}
}

func buildInvoiceSummaryFields(invoice models.Invoice, totalPaid float64, remaining float64) []initialAssessmentPrintField {
	fields := []initialAssessmentPrintField{
		{Label: "Subtotal", Value: formatCurrency(invoice.SubTotal)},
		{Label: "Diskon", Value: formatSignedCurrency(-invoice.Discount)},
		{Label: "Pajak", Value: formatSignedCurrency(invoice.Tax)},
		{Label: "Total Tagihan", Value: formatCurrency(invoice.TotalAmount)},
		{Label: "Sudah Dibayar", Value: formatCurrency(totalPaid)},
		{Label: "Sisa Tagihan", Value: formatCurrency(remaining)},
	}

	return fields
}

func addInvoiceItemSection(pdf *gofpdf.Fpdf, invoice models.Invoice) {
	addInvoiceSectionTitle(pdf, "Rincian Tagihan")
	if len(invoice.Items) == 0 {
		addInitialAssessmentFullWidthRow(pdf, "Tidak ada item tagihan.", false)
		addInitialAssessmentSectionSpacing(pdf)
		return
	}

	drawInvoiceItemTableHeader(pdf)
	for index, item := range invoice.Items {
		ensureInvoiceItemRowSpace(pdf)
		drawInvoiceItemTableRow(pdf, index+1, item)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func addInvoicePaymentSection(pdf *gofpdf.Fpdf, payments []models.Payment) {
	addInvoiceSectionTitle(pdf, "Riwayat Pembayaran")
	drawInvoicePaymentTableHeader(pdf)
	for _, payment := range payments {
		ensureInvoicePaymentRowSpace(pdf)
		drawInvoicePaymentTableRow(pdf, payment)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func drawInvoiceStatusWatermark(pdf *gofpdf.Fpdf, status string) {
	label := resolveInvoiceStatusWatermarkText(status)
	if label == "" {
		return
	}

	pageWidth, pageHeight := pdf.GetPageSize()
	textR, textG, textB, borderR, borderG, borderB := resolveInvoiceStatusWatermarkColors(status)
	template := pdf.CreateTemplateCustom(
		gofpdf.PointType{X: 0, Y: 0},
		gofpdf.SizeType{Wd: pageWidth, Ht: pageHeight},
		func(tpl *gofpdf.Tpl) {
			tpl.SetFont("Arial", "B", 58)
			textWidth := tpl.GetStringWidth(label)
			stampWidth := textWidth + 26
			if stampWidth < 116 {
				stampWidth = 116
			}
			if stampWidth > pageWidth-42 {
				stampWidth = pageWidth - 42
			}
			stampHeight := 34.0
			stampX := (pageWidth - stampWidth) / 2
			stampY := (pageHeight - stampHeight) / 2
			if stampX < 10 {
				stampX = 10
			}
			if stampY < 10 {
				stampY = 10
			}

			tpl.TransformBegin()
			tpl.TransformRotate(50, pageWidth/2, pageHeight/2)
			tpl.SetLineWidth(1.1)
			tpl.SetDrawColor(borderR, borderG, borderB)
			tpl.RoundedRect(stampX, stampY, stampWidth, stampHeight, 2.4, "1234", "D")
			tpl.SetLineWidth(0.55)
			tpl.RoundedRect(stampX+2.6, stampY+2.6, stampWidth-5.2, stampHeight-5.2, 1.7, "1234", "D")
			tpl.SetTextColor(textR, textG, textB)
			tpl.SetXY(stampX, stampY+7.5)
			tpl.CellFormat(stampWidth, 18, label, "", 0, "C", false, 0, "")
			tpl.SetTextColor(0, 0, 0)
			tpl.SetLineWidth(0.2)
			tpl.TransformEnd()
		},
	)
	pdf.UseTemplateScaled(template, gofpdf.PointType{X: 0, Y: 0}, gofpdf.SizeType{Wd: pageWidth, Ht: pageHeight})
}

func resolveInvoiceStatusWatermarkText(status string) string {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case "lunas":
		return "LUNAS"
	case "sebagian":
		return "BAYAR SEBAGIAN"
	case "batal":
		return "DIBATALKAN"
	default:
		return "BELUM LUNAS"
	}
}

func addInvoiceSummaryBlock(pdf *gofpdf.Fpdf, fields []initialAssessmentPrintField) {
	if len(fields) == 0 {
		return
	}

	left, _, right, _ := pdf.GetMargins()
	pageWidth, pageHeight := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	blockWidth := 78.0
	if blockWidth > contentWidth {
		blockWidth = contentWidth
	}
	labelWidth := blockWidth * 0.5
	valueWidth := blockWidth - labelWidth
	blockX := left + contentWidth - blockWidth
	lineHeight := 5.2
	headerHeight := 5.0
	totalHeight := headerHeight + (float64(len(fields)) * lineHeight) + 2

	if pdf.GetY()+totalHeight > pageHeight-initialAssessmentPDFMarginBottom {
		pdf.AddPage()
		pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
	}

	pdf.SetX(blockX)
	pdf.SetFont("Arial", "B", 10)
	pdf.CellFormat(blockWidth, headerHeight, "Ringkasan Pembayaran", "", 1, "L", false, 0, "")
	pdf.SetY(pdf.GetY() + 0.8)

	for _, field := range fields {
		label := firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(field.Label)), "-")
		value := firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(field.Value)), "-")
		isTotal := label == "Total Tagihan"
		isRemaining := label == "Sisa Tagihan"

		if isTotal || isRemaining {
			pdf.SetFont("Arial", "B", 10)
		} else {
			pdf.SetFont("Arial", "", 9)
		}

		if isRemaining {
			pdf.SetTextColor(170, 30, 45)
		} else {
			pdf.SetTextColor(0, 0, 0)
		}

		pdf.SetX(blockX)
		pdf.CellFormat(labelWidth, lineHeight, label, "", 0, "L", false, 0, "")
		pdf.CellFormat(valueWidth, lineHeight, value, "", 1, "R", false, 0, "")
	}

	pdf.SetTextColor(0, 0, 0)
	pdf.SetY(pdf.GetY() + 2)
}

func addInvoiceCompactFieldSection(pdf *gofpdf.Fpdf, title string, fields []initialAssessmentPrintField, emptyMessage string) {
	addInvoiceSectionTitle(pdf, title)
	if len(fields) == 0 {
		addInitialAssessmentFullWidthRow(pdf, firstNonEmpty(emptyMessage, "Tidak ada data."), false)
		return
	}

	pending := make([]initialAssessmentPrintField, 0, 2)
	flushPending := func() {
		if len(pending) == 0 {
			return
		}
		if len(pending) == 1 {
			drawInvoiceCompactSingleFieldRow(pdf, pending[0])
			pending = pending[:0]
			return
		}
		drawInvoiceCompactFieldPair(pdf, pending[0], pending[1])
		pending = pending[:0]
	}

	for _, field := range fields {
		if !isInitialAssessmentFieldCompactFriendly(pdf, field) {
			flushPending()
			addInvoiceKeyValueRow(pdf, field.Label, field.Value)
			continue
		}

		pending = append(pending, field)
		if len(pending) == 2 {
			flushPending()
		}
	}

	flushPending()
	addInitialAssessmentSectionSpacing(pdf)
}

func addInvoiceSectionTitle(pdf *gofpdf.Fpdf, title string) {
	ensureInitialAssessmentPDFSpace(pdf, 8)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	title = firstNonEmpty(sanitizePDFText(title), "-")
	pdf.SetFont("Arial", "B", 11)
	pdf.SetDrawColor(120, 120, 120)
	pdf.CellFormat(contentWidth, 6.5, " "+strings.ToUpper(title), "1", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 9)
}

func addInvoiceKeyValueRow(pdf *gofpdf.Fpdf, label string, value string) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	labelWidth := 42.0
	valueWidth := contentWidth - labelWidth

	trimmedLabel := firstNonEmpty(strings.TrimSpace(sanitizePDFText(label)), "-")
	trimmedValue := firstNonEmpty(strings.TrimSpace(sanitizePDFText(value)), "-")
	labelLines := pdf.SplitLines([]byte(trimmedLabel), labelWidth-4)
	valueLines := pdf.SplitLines([]byte(trimmedValue), valueWidth-4)
	lineCount := maxInt(len(labelLines), len(valueLines))
	if lineCount == 0 {
		lineCount = 1
	}
	rowHeight := float64(lineCount)*4.5 + 2
	ensureInitialAssessmentPDFSpace(pdf, rowHeight)

	x := left
	y := pdf.GetY()
	pdf.SetDrawColor(120, 120, 120)
	pdf.Rect(x, y, labelWidth, rowHeight, "D")
	pdf.Rect(x+labelWidth, y, valueWidth, rowHeight, "D")

	pdf.SetXY(x+2, y+1.5)
	pdf.SetFont("Arial", "", 9)
	pdf.MultiCell(labelWidth-4, 4.5, trimmedLabel, "", "L", false)
	pdf.SetXY(x+labelWidth+2, y+1.5)
	pdf.MultiCell(valueWidth-4, 4.5, trimmedValue, "", "L", false)
	pdf.SetXY(left, y+rowHeight)
}

func drawInvoiceCompactFieldPair(pdf *gofpdf.Fpdf, leftField initialAssessmentPrintField, rightField initialAssessmentPrintField) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	halfWidth := contentWidth / 2
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(halfWidth)
	rowHeight := 6.5
	ensureInitialAssessmentPDFSpace(pdf, rowHeight)

	y := pdf.GetY()
	drawInvoiceCompactFieldBox(pdf, left, y, halfWidth, rowHeight, labelWidth, leftField)
	drawInvoiceCompactFieldBox(pdf, left+halfWidth, y, halfWidth, rowHeight, labelWidth, rightField)
	pdf.SetY(y + rowHeight)
}

func drawInvoiceCompactSingleFieldRow(pdf *gofpdf.Fpdf, field initialAssessmentPrintField) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	halfWidth := contentWidth / 2
	labelWidth := resolveInitialAssessmentCompactFieldLabelWidth(halfWidth)
	rowHeight := 6.5
	ensureInitialAssessmentPDFSpace(pdf, rowHeight)

	y := pdf.GetY()
	drawInvoiceCompactFieldBox(pdf, left, y, halfWidth, rowHeight, labelWidth, field)
	drawInvoiceCompactBlankFieldBox(pdf, left+halfWidth, y, halfWidth, rowHeight, labelWidth)
	pdf.SetY(y + rowHeight)
}

func drawInvoiceCompactFieldBox(pdf *gofpdf.Fpdf, x float64, y float64, totalWidth float64, rowHeight float64, labelWidth float64, field initialAssessmentPrintField) {
	valueWidth := totalWidth - labelWidth
	trimmedLabel := firstNonEmpty(sanitizePDFSingleLineText(field.Label), "-")
	trimmedValue := firstNonEmpty(sanitizePDFSingleLineText(field.Value), "-")

	pdf.SetDrawColor(120, 120, 120)
	pdf.Rect(x, y, labelWidth, rowHeight, "D")
	pdf.Rect(x+labelWidth, y, valueWidth, rowHeight, "D")

	pdf.SetXY(x+1.5, y+0.4)
	pdf.SetFont("Arial", "", 9)
	pdf.CellFormat(labelWidth-3, rowHeight-0.8, trimmedLabel, "", 0, "L", false, 0, "")
	pdf.SetXY(x+labelWidth+1.5, y+0.4)
	pdf.CellFormat(valueWidth-3, rowHeight-0.8, trimmedValue, "", 0, "L", false, 0, "")
}

func drawInvoiceCompactBlankFieldBox(pdf *gofpdf.Fpdf, x float64, y float64, totalWidth float64, rowHeight float64, labelWidth float64) {
	valueWidth := totalWidth - labelWidth
	pdf.SetDrawColor(120, 120, 120)
	pdf.Rect(x, y, labelWidth, rowHeight, "D")
	pdf.Rect(x+labelWidth, y, valueWidth, rowHeight, "D")
}

func resolveInvoiceStatusWatermarkColors(status string) (int, int, int, int, int, int) {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case "lunas":
		return 118, 168, 124, 146, 194, 150
	case "sebagian":
		return 176, 136, 72, 214, 180, 126
	case "batal":
		return 150, 150, 150, 198, 198, 198
	default:
		return 188, 92, 92, 226, 164, 164
	}
}

func resolveInvoiceCashierSignatureName(invoice models.Invoice) string {
	for index := len(invoice.Payments) - 1; index >= 0; index-- {
		name := strings.TrimSpace(invoice.Payments[index].Receiver.FullName)
		if name != "" {
			return name
		}
	}

	if name := strings.TrimSpace(invoice.Creator.FullName); name != "" {
		return name
	}

	return "________________"
}

func drawInvoiceItemTableHeader(pdf *gofpdf.Fpdf) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columns := []float64{12, 84, 18, 34, 34}
	if len(columns) == 5 {
		columns[1] = contentWidth - (columns[0] + columns[2] + columns[3] + columns[4])
	}
	headers := []string{"No", "Deskripsi", "Qty", "Harga", "Total"}
	aligns := []string{"C", "C", "C", "C", "C"}

	y := pdf.GetY()
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetFont("Arial", "B", 9)
	x := left
	for index, width := range columns {
		pdf.Rect(x, y, width, 7, "D")
		pdf.SetXY(x, y+1.1)
		pdf.CellFormat(width, 4.8, headers[index], "", 0, aligns[index], false, 0, "")
		x += width
	}
	pdf.SetY(y + 7)
	pdf.SetFont("Arial", "", 9)
}

func drawInvoiceItemTableRow(pdf *gofpdf.Fpdf, rowNumber int, item models.InvoiceItem) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columns := []float64{12, 84, 18, 34, 34}
	columns[1] = contentWidth - (columns[0] + columns[2] + columns[3] + columns[4])
	values := []string{
		strconv.Itoa(rowNumber),
		firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(item.Description)), "-"),
		strconv.Itoa(item.Quantity),
		formatCurrency(item.UnitPrice),
		formatCurrency(item.TotalPrice),
	}
	aligns := []string{"C", "L", "C", "R", "R"}

	pdf.SetFont("Arial", "", 9)
	rowHeight := measureInvoiceTableRowHeight(pdf, values[1], columns[1]-4)
	y := pdf.GetY()
	x := left
	pdf.SetDrawColor(120, 120, 120)
	for index, width := range columns {
		pdf.Rect(x, y, width, rowHeight, "D")
		text := values[index]
		if index == 1 {
			pdf.SetXY(x+2, y+1.2)
			pdf.MultiCell(width-4, 4.2, text, "", aligns[index], false)
		} else {
			pdf.SetXY(x+1.5, y+1.2)
			pdf.CellFormat(width-3, rowHeight-2.4, text, "", 0, aligns[index], false, 0, "")
		}
		x += width
	}
	pdf.SetY(y + rowHeight)
}

func ensureInvoiceItemRowSpace(pdf *gofpdf.Fpdf) {
	_, pageHeight := pdf.GetPageSize()
	if pdf.GetY()+8 > pageHeight-initialAssessmentPDFMarginBottom {
		pdf.AddPage()
		pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
		addInvoiceSectionTitle(pdf, "Rincian Tagihan")
		drawInvoiceItemTableHeader(pdf)
	}
}

func drawInvoicePaymentTableHeader(pdf *gofpdf.Fpdf) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columns := []float64{40, 46, 52, 0}
	columns[3] = contentWidth - (columns[0] + columns[1] + columns[2])
	headers := []string{"Tanggal", "Metode", "Referensi", "Jumlah"}
	aligns := []string{"C", "C", "C", "C"}

	y := pdf.GetY()
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetFont("Arial", "B", 9)
	x := left
	for index, width := range columns {
		pdf.Rect(x, y, width, 7, "D")
		pdf.SetXY(x, y+1.1)
		pdf.CellFormat(width, 4.8, headers[index], "", 0, aligns[index], false, 0, "")
		x += width
	}
	pdf.SetY(y + 7)
	pdf.SetFont("Arial", "", 9)
}

func drawInvoicePaymentTableRow(pdf *gofpdf.Fpdf, payment models.Payment) {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columns := []float64{40, 46, 52, 0}
	columns[3] = contentWidth - (columns[0] + columns[1] + columns[2])
	values := []string{
		formatDateTimeIndonesian(payment.PaymentDate),
		firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(payment.PaymentMethod.Name)), "-"),
		firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(payment.ReferenceNumber)), "-"),
		formatCurrency(payment.Amount),
	}
	aligns := []string{"L", "L", "L", "R"}
	rowHeight := 6.8
	y := pdf.GetY()
	x := left
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetFont("Arial", "", 9)
	for index, width := range columns {
		pdf.Rect(x, y, width, rowHeight, "D")
		pdf.SetXY(x+1.5, y+1.2)
		pdf.CellFormat(width-3, rowHeight-2.4, values[index], "", 0, aligns[index], false, 0, "")
		x += width
	}
	pdf.SetY(y + rowHeight)
}

func ensureInvoicePaymentRowSpace(pdf *gofpdf.Fpdf) {
	_, pageHeight := pdf.GetPageSize()
	if pdf.GetY()+8 > pageHeight-initialAssessmentPDFMarginBottom {
		pdf.AddPage()
		pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
		addInvoiceSectionTitle(pdf, "Riwayat Pembayaran")
		drawInvoicePaymentTableHeader(pdf)
	}
}

func measureInvoiceTableRowHeight(pdf *gofpdf.Fpdf, value string, width float64) float64 {
	pdf.SetFont("Arial", "", 9)
	lines := pdf.SplitLines([]byte(value), width)
	lineCount := len(lines)
	if lineCount < 1 {
		lineCount = 1
	}
	rowHeight := float64(lineCount)*4.2 + 2.4
	if rowHeight < 6.8 {
		rowHeight = 6.8
	}
	return rowHeight
}

func formatSignedCurrency(amount float64) string {
	if amount < 0 {
		return "-" + formatCurrency(math.Abs(amount))
	}
	if amount > 0 {
		return "+" + formatCurrency(amount)
	}
	return formatCurrency(0)
}
