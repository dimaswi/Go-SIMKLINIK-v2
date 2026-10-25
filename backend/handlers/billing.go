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

		inv.Items = enrichRacikanInvoiceItems(inv.Items)

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

	if invoice.Status == "belum_bayar" && len(invoice.Payments) > 0 {
		database.DB.Exec("DELETE FROM payments WHERE invoice_id = ?", invoice.ID)
		invoice.Payments = nil
		paidAmount = 0
	}

	invoice.Items = enrichRacikanInvoiceItems(invoice.Items)

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

	invoice.Items = enrichRacikanInvoiceItems(invoice.Items)

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

func enrichRacikanInvoiceItems(items []models.InvoiceItem) []models.InvoiceItem {
	var result []models.InvoiceItem
	for _, item := range items {
		isBundled := item.ItemType == "racikan" && item.ReferenceID > 0 &&
			(strings.Contains(item.Description, " - Bahan: ") || (!strings.Contains(item.Description, "Racikan (") && strings.HasPrefix(item.Description, "Racikan:")))

		if isBundled {
			var comp models.PrescriptionCompound
			if err := database.DB.Preload("Items.Medicine.Unit").First(&comp, item.ReferenceID).Error; err == nil && len(comp.Items) > 0 {
				if item.ID > 0 {
					database.DB.Delete(&models.InvoiceItem{}, item.ID)
				}

				compName := strings.TrimSpace(comp.Name)
				if compName == "" {
					compName = "Racikan"
				}

				for _, cItem := range comp.Items {
					if cItem.Medicine.ID > 0 {
						price := cItem.Medicine.SellingPrice
						qty := cItem.Quantity
						if qty <= 0 {
							qty = 1
						}
						desc := fmt.Sprintf("Racikan (%s): %s", compName, cItem.Medicine.Name)
						newItem := models.InvoiceItem{
							InvoiceID:   item.InvoiceID,
							ItemType:    "racikan",
							ReferenceID: comp.ID,
							Description: desc,
							Quantity:    qty,
							UnitPrice:   price,
							Discount:    0,
							TotalPrice:  price * float64(qty),
						}
						if item.InvoiceID > 0 {
							database.DB.Create(&newItem)
						}
						result = append(result, newItem)
					}
				}
				continue
			}
		}

		result = append(result, item)
	}
	return result
}

func buildInvoiceResponse(invoice models.Invoice) InvoiceListResponse {
	invoice.Items = enrichRacikanInvoiceItems(invoice.Items)
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
		tx.Preload("Items.Medicine.Unit").Where("medical_record_id = ?", mr.ID).Find(&compounds)
		for _, comp := range compounds {
			if processedCompounds[comp.ID] {
				continue
			}
			processedCompounds[comp.ID] = true

			compName := strings.TrimSpace(comp.Name)
			if compName == "" {
				compName = "Racikan"
			}

			hasItems := false
			for _, item := range comp.Items {
				if item.Medicine.ID > 0 {
					hasItems = true
					price := item.Medicine.SellingPrice
					qty := item.Quantity
					if qty <= 0 {
						qty = 1
					}
					desc := fmt.Sprintf("Racikan (%s): %s", compName, item.Medicine.Name)
					items = append(items, models.InvoiceItem{
						ItemType:    "racikan",
						ReferenceID: comp.ID,
						Description: desc,
						Quantity:    qty,
						UnitPrice:   price,
						Discount:    0,
						TotalPrice:  price * float64(qty),
					})
				}
			}

			if !hasItems {
				outputQty := comp.OutputQuantity
				if outputQty <= 0 {
					outputQty = 1
				}
				items = append(items, models.InvoiceItem{
					ItemType:    "racikan",
					ReferenceID: comp.ID,
					Description: fmt.Sprintf("Racikan: %s", compName),
					Quantity:    outputQty,
					UnitPrice:   0,
					Discount:    0,
					TotalPrice:  0,
				})
			}
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

// CancelPayment voids either a specific payment or all payments for an invoice
func CancelPayment(c *gin.Context) {
	id := c.Param("id")
	paymentIDStr := c.Param("paymentId")

	var invoice models.Invoice
	if err := database.DB.Preload("Payments").First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice tidak ditemukan"})
		return
	}

	if len(invoice.Payments) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invoice belum memiliki data pembayaran untuk dibatalkan"})
		return
	}

	tx := database.DB.Begin()

	if paymentIDStr != "" {
		paymentID, err := strconv.Atoi(paymentIDStr)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "ID pembayaran tidak valid"})
			return
		}

		var payment models.Payment
		if err := tx.Where("id = ? AND invoice_id = ?", paymentID, invoice.ID).First(&payment).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"error": "Data pembayaran tidak ditemukan"})
			return
		}

		if err := tx.Exec("DELETE FROM payments WHERE id = ? AND invoice_id = ?", paymentID, invoice.ID).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menghapus data pembayaran: " + err.Error()})
			return
		}
	} else {
		// Cancel all payments for this invoice
		if err := tx.Exec("DELETE FROM payments WHERE invoice_id = ?", invoice.ID).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membatalkan pembayaran: " + err.Error()})
			return
		}
	}

	// Calculate remaining paid amount
	var remainingPayments []models.Payment
	if err := tx.Where("invoice_id = ?", invoice.ID).Find(&remainingPayments).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var newPaidAmount float64
	for _, p := range remainingPayments {
		newPaidAmount += p.Amount
	}

	newStatus := "belum_bayar"
	if newPaidAmount >= invoice.TotalAmount && invoice.TotalAmount > 0 {
		newStatus = "lunas"
	} else if newPaidAmount > 0 {
		newStatus = "sebagian"
	}

	if err := tx.Model(&invoice).Update("status", newStatus).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Pembayaran berhasil dibatalkan",
		"status":  newStatus,
	})
}


// GetCashierQueue returns visits ready for billing
func GetCashierQueue(c *gin.Context) {
	dateFilter := c.Query("date")
	hasDateParam := c.Request.URL.Query().Has("date")
	search := c.Query("search")

	// Only finalized visits should enter cashier queue for payment processing.
	query := database.DB.Model(&models.Visit{}).
		Preload("Patient").
		Preload("Polyclinic").
		Preload("Doctor").
		Where("status = ?", "completed")

	if hasDateParam && (dateFilter == "" || dateFilter == "all") {
		// Do not filter by date: show all
	} else {
		dateStr := dateFilter
		if !hasDateParam {
			dateStr = time.Now().Format("2006-01-02")
		}
		parsedDate, err := time.ParseInLocation("2006-01-02", dateStr, time.Local)
		if err != nil {
			parsedDate = time.Now()
		}
		startOfDay := time.Date(parsedDate.Year(), parsedDate.Month(), parsedDate.Day(), 0, 0, 0, 0, parsedDate.Location())
		endOfDay := startOfDay.AddDate(0, 0, 1)
		query = query.Where("visit_date >= ? AND visit_date < ?", startOfDay, endOfDay)
	}

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

// PrintInvoice generates PDF receipt in A4, A5, or Thermal (80mm) format
func PrintInvoice(c *gin.Context) {
	id := c.Param("id")
	format := strings.ToLower(strings.TrimSpace(c.DefaultQuery("format", "a4")))

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
	invoice.Items = enrichRacikanInvoiceItems(invoice.Items)
	var totalPaid float64
	for _, payment := range invoice.Payments {
		totalPaid += payment.Amount
	}
	remaining := invoice.TotalAmount - totalPaid
	if remaining < 0 {
		remaining = 0
	}

	var pdf *gofpdf.Fpdf
	var err error

	switch format {
	case "thermal", "80mm":
		pdf, err = renderInvoiceThermalPDF(invoice, hospitalInfo, generatedAt, totalPaid, remaining)
	case "a5":
		pdf, err = renderInvoiceSheetPDF(invoice, hospitalInfo, generatedAt, totalPaid, remaining, "A5")
	default: // "a4"
		pdf, err = renderInvoiceSheetPDF(invoice, hospitalInfo, generatedAt, totalPaid, remaining, "A4")
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF: " + err.Error()})
		return
	}

	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=kwitansi_%s_%s.pdf", invoice.InvoiceNumber, format))

	if err := pdf.Output(c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengirim PDF"})
	}
}

func renderInvoiceSheetPDF(invoice models.Invoice, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, totalPaid float64, remaining float64, pageSize string) (*gofpdf.Fpdf, error) {
	isA5 := pageSize == "A5"
	pdf := gofpdf.New("P", "mm", pageSize, "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)

	margin := 12.0
	if isA5 {
		margin = 8.0
	}
	pdf.SetMargins(margin, margin, margin)
	pdf.SetAutoPageBreak(true, margin)
	pdf.AliasNbPages("")
	pdf.SetTitle("Kwitansi Pembayaran", false)
	pdf.SetCreator("SIMKLINIK", false)

	pdf.SetFooterFunc(func() {
		pdf.SetY(-6.5)
		pdf.SetFont("Arial", "", 7)
		pdf.SetTextColor(100, 100, 100)
		pdf.CellFormat(0, 4, "Dicetak: "+formatDateTimeIndonesian(generatedAt)+" | SIMKLINIK", "", 0, "L", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})

	pdf.AddPage()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - (margin * 2)

	// Kop resmi klinik (Tanpa judul 'KWITANSI PEMBAYARAN' di bawah kop & jarak rapat langsung ke konten)
	drawInvoiceKop(pdf, hospitalInfo, contentWidth, isA5)

	// Watermark status 45 derajat presisi di tengah dokumen
	drawInvoiceStatusWatermark(pdf, invoice.Status, isA5)

	// 1. Informasi Invoice (Hitam-Putih Box Standard)
	addInvoiceCompactFieldSection(pdf, "Informasi Invoice", buildInvoiceDocumentFields(invoice), contentWidth, isA5)

	// 2. Informasi Pasien (Hitam-Putih Box Standard)
	addInvoiceCompactFieldSection(pdf, "Informasi Pasien", buildInvoicePatientFields(invoice), contentWidth, isA5)

	// 3. Rincian Tagihan (Hitam-Putih Table Grid Standard)
	addInvoiceItemSection(pdf, invoice, contentWidth, isA5)

	// 4. Ringkasan Pembayaran (Hitam-Putih Standard)
	addInvoiceSummaryBlock(pdf, buildInvoiceSummaryFields(invoice, totalPaid, remaining), contentWidth, isA5)

	// Riwayat Pembayaran TIDAK DITAMPILKAN sesuai permintaan user
	// Catatan dan Riwayat Pembayaran TIDAK DITAMPILKAN sesuai instruksi user


	// 6. Tanda Tangan Pasien & Petugas Kasir (Kompak agar muat 1 halaman tunggal)
	addInvoiceSignatureSection(
		pdf,
		hospitalInfo,
		generatedAt,
		"Pasien / Keluarga",
		fallbackText(invoice.Patient.FullName),
		"Petugas Kasir",
		resolveInvoiceCashierSignatureName(invoice),
		contentWidth,
		isA5,
	)

	return pdf, nil
}

func drawInvoiceKop(pdf *gofpdf.Fpdf, info initialAssessmentHospitalInfo, contentWidth float64, isA5 bool) {
	left, top, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()

	hasLogo := info.LogoPath != "" && info.LogoType != ""
	logoMaxHeight := 20.0
	logoMaxWidth := 22.0
	logoGap := 3.5
	if isA5 {
		logoMaxHeight = 15.0
		logoMaxWidth = 18.0
		logoGap = 2.5
	}

	logoWidth := 0.0
	logoHeight := 0.0
	if hasLogo {
		logoWidth, logoHeight = measureInitialAssessmentHeaderLogo(info.LogoPath, logoMaxHeight, logoMaxWidth)
	}

	textStartX := left
	if hasLogo && logoWidth > 0 {
		textStartX = left + logoWidth + logoGap
	}
	textWidth := (pageWidth - right) - textStartX

	nameSize := 14.0
	addrSize := 8.2
	lineHeight := 3.8
	if isA5 {
		nameSize = 11.5
		addrSize = 7.2
		lineHeight = 3.2
	}

	type kopLine struct {
		text       string
		fontStyle  string
		fontSize   float64
		lineHeight float64
	}

	lines := []kopLine{{
		text:       strings.ToUpper(fallbackText(info.Name)),
		fontStyle:  "B",
		fontSize:   nameSize,
		lineHeight: 5.5,
	}}

	addressParts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Address)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.City)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	if len(addressParts) > 0 {
		lines = append(lines, kopLine{
			text:       strings.Join(addressParts, ", "),
			fontStyle:  "",
			fontSize:   addrSize,
			lineHeight: lineHeight,
		})
	}

	contactParts := make([]string, 0, 4)
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Phone)); trimmed != "" {
		contactParts = append(contactParts, "Telp: "+trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Fax)); trimmed != "" {
		contactParts = append(contactParts, "Fax: "+trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Email)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if len(contactParts) > 0 {
		lines = append(lines, kopLine{
			text:       strings.Join(contactParts, " | "),
			fontStyle:  "",
			fontSize:   addrSize,
			lineHeight: lineHeight,
		})
	}

	if trimmed := strings.TrimSpace(sanitizePDFText(info.Website)); trimmed != "" {
		lines = append(lines, kopLine{
			text:       trimmed,
			fontStyle:  "",
			fontSize:   addrSize,
			lineHeight: lineHeight,
		})
	}

	textBlockHeight := 0.0
	for _, l := range lines {
		trimmedText := strings.TrimSpace(sanitizePDFText(l.text))
		if trimmedText == "" {
			continue
		}
		pdf.SetFont("Arial", l.fontStyle, l.fontSize)
		lineParts := pdf.SplitLines([]byte(trimmedText), textWidth)
		lineCount := len(lineParts)
		if lineCount < 1 {
			lineCount = 1
		}
		textBlockHeight += float64(lineCount) * l.lineHeight
	}

	headerBlockHeight := maxFloat64(textBlockHeight, logoHeight)

	// Gambar logo klinik di sisi kiri kop
	if hasLogo && logoWidth > 0 {
		logoX := left
		logoY := top + ((headerBlockHeight - logoHeight) / 2)
		drawInitialAssessmentHeaderLogo(pdf, info.LogoPath, info.LogoType, logoX, logoY, logoMaxHeight, logoMaxWidth)
	}

	// Teks kop klinik di samping logo (Left Aligned)
	textY := top + ((headerBlockHeight - textBlockHeight) / 2)
	pdf.SetTextColor(0, 0, 0)
	for _, l := range lines {
		trimmedText := strings.TrimSpace(sanitizePDFText(l.text))
		if trimmedText == "" {
			continue
		}
		pdf.SetXY(textStartX, textY)
		pdf.SetFont("Arial", l.fontStyle, l.fontSize)
		pdf.MultiCell(textWidth, l.lineHeight, trimmedText, "", "L", false)
		textY = pdf.GetY()
	}

	// Garis pembatas kop resmi
	lineY := top + headerBlockHeight + 1.8
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.6)
	pdf.Line(left, lineY, pageWidth-right, lineY)

	// Jarak rapat langsung ke konten
	gap := 3.5
	if isA5 {
		gap = 2.5
	}
	pdf.SetY(lineY + gap)
}

func drawInvoiceStatusWatermark(pdf *gofpdf.Fpdf, status string, isA5 bool) {
	label := resolveInvoiceStatusWatermarkText(status)
	if label == "" {
		return
	}

	pageWidth, pageHeight := pdf.GetPageSize()
	cx := pageWidth / 2
	cy := 115.0 // Berada tepat di tengah-tengah tabel & konten faktur
	if isA5 {
		cy = 84.0
	}

	// Warna watermark: Lunas = Hijau, Belum Lunas = Merah, Sebagian = Oranye, Batal = Abu-abu
	var r, g, b int
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "lunas":
		r, g, b = 40, 167, 69 // Hijau
	case "sebagian":
		r, g, b = 217, 119, 6 // Oranye / Amber
	case "batal":
		r, g, b = 156, 163, 175 // Abu-abu
	default:
		r, g, b = 220, 53, 69 // Merah (Belum Lunas)
	}

	fontSize := 46.0
	boxHeight := 24.0
	if isA5 {
		fontSize = 32.0
		boxHeight = 18.0
	}

	// Gunakan CreateTemplateCustom agar isolasi rotasi hanya berlaku untuk watermark dan TIDAK memutar seluruh halaman
	template := pdf.CreateTemplateCustom(
		gofpdf.PointType{X: 0, Y: 0},
		gofpdf.SizeType{Wd: pageWidth, Ht: pageHeight},
		func(tpl *gofpdf.Tpl) {
			tpl.SetFont("Arial", "B", fontSize)
			textWidth := tpl.GetStringWidth(label)
			boxWidth := textWidth + 24.0
			if boxWidth < 90.0 {
				boxWidth = 90.0
			}

			boxX := cx - (boxWidth / 2)
			boxY := cy - (boxHeight / 2)

			tpl.TransformBegin()
			// Rotasi 45 derajat (miring diagonal sempurna) berpusat tepat di cx, cy
			tpl.TransformRotate(45, cx, cy)

			// Bingkai luar watermark berwarna
			tpl.SetLineWidth(0.8)
			tpl.SetDrawColor(r, g, b)
			tpl.RoundedRect(boxX, boxY, boxWidth, boxHeight, 2.2, "1234", "D")

			// Bingkai dalam watermark berwarna
			tpl.SetLineWidth(0.4)
			tpl.RoundedRect(boxX+1.8, boxY+1.8, boxWidth-3.6, boxHeight-3.6, 1.4, "1234", "D")

			// Teks status: presisi vertikal dan horizontal di tengah kotak
			tpl.SetTextColor(r, g, b)
			tpl.SetXY(boxX, boxY)
			tpl.CellFormat(boxWidth, boxHeight, label, "", 0, "C", false, 0, "")

			tpl.SetTextColor(0, 0, 0)
			tpl.SetLineWidth(0.2)
			tpl.TransformEnd()
		},
	)

	pdf.UseTemplateScaled(template, gofpdf.PointType{X: 0, Y: 0}, gofpdf.SizeType{Wd: pageWidth, Ht: pageHeight})
}

func buildInvoiceDocumentFields(invoice models.Invoice) []initialAssessmentPrintField {
	return []initialAssessmentPrintField{
		{Label: "No. Invoice", Value: fallbackText(invoice.InvoiceNumber)},
		{Label: "Tanggal Invoice", Value: formatDateTimeIndonesian(invoice.InvoiceDate)},
		{Label: "No. Kunjungan", Value: fallbackText(invoice.Visit.VisitNumber)},
		{Label: "Dokter", Value: fallbackText(invoice.Visit.Doctor.FullName)},
		{Label: "Poliklinik", Value: fallbackText(invoice.Visit.Polyclinic.Name)},
		{Label: "Status Tagihan", Value: resolveInvoiceStatusWatermarkText(invoice.Status)},
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
	}
	if invoice.Discount > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "Diskon", Value: "-" + formatCurrency(invoice.Discount)})
	}
	if invoice.Tax > 0 {
		fields = append(fields, initialAssessmentPrintField{Label: "Pajak", Value: "+" + formatCurrency(invoice.Tax)})
	}
	fields = append(fields,
		initialAssessmentPrintField{Label: "Total Tagihan", Value: formatCurrency(invoice.TotalAmount)},
		initialAssessmentPrintField{Label: "Sudah Dibayar", Value: formatCurrency(totalPaid)},
		initialAssessmentPrintField{Label: "Sisa Tagihan", Value: formatCurrency(remaining)},
	)
	return fields
}

func addInvoiceSectionTitle(pdf *gofpdf.Fpdf, title string, contentWidth float64, isA5 bool) {
	titleHeight := 5.6
	titleFont := 9.0
	if isA5 {
		titleHeight = 4.6
		titleFont = 8.0
	}
	ensureInitialAssessmentPDFSpace(pdf, titleHeight+2)
	pdf.SetFont("Arial", "B", titleFont)
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(contentWidth, titleHeight, " "+strings.ToUpper(title), "1", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", titleFont)
}

func addInvoiceCompactFieldSection(pdf *gofpdf.Fpdf, title string, fields []initialAssessmentPrintField, contentWidth float64, isA5 bool) {
	addInvoiceSectionTitle(pdf, title, contentWidth, isA5)
	if len(fields) == 0 {
		pdf.CellFormat(contentWidth, 6, "Tidak ada data.", "1", 1, "C", false, 0, "")
		pdf.SetY(pdf.GetY() + 1.5)
		return
	}

	halfWidth := contentWidth / 2
	labelWidth := halfWidth * 0.38
	valueWidth := halfWidth - labelWidth
	fontSize := 8.5
	lineHeight := 4.0
	rowHeight := 5.4
	if isA5 {
		fontSize = 7.5
		lineHeight = 3.5
		rowHeight = 4.4
	}

	pdf.SetDrawColor(120, 120, 120)
	pdf.SetTextColor(0, 0, 0)

	for i := 0; i < len(fields); {
		field := fields[i]
		// Jika Alamat atau field penutup ganjil, gunakan lebar penuh agar teks tidak tumpah/melewati border
		isFullWidth := strings.EqualFold(field.Label, "Alamat") || (i == len(fields)-1 && i%2 == 0)

		if isFullWidth {
			fullValWidth := contentWidth - labelWidth
			pdf.SetFont("Arial", "", fontSize)
			lines := pdf.SplitLines([]byte(field.Value), fullValWidth-4)
			lineCount := len(lines)
			if lineCount < 1 {
				lineCount = 1
			}
			curRowH := float64(lineCount)*lineHeight + 1.8
			if curRowH < rowHeight {
				curRowH = rowHeight
			}

			ensureInitialAssessmentPDFSpace(pdf, curRowH)
			x := pdf.GetX()
			y := pdf.GetY()

			pdf.Rect(x, y, labelWidth, curRowH, "D")
			pdf.Rect(x+labelWidth, y, fullValWidth, curRowH, "D")

			pdf.SetFont("Arial", "", fontSize)
			pdf.SetXY(x+1.5, y+0.8)
			pdf.CellFormat(labelWidth-3, lineHeight, field.Label, "", 0, "L", false, 0, "")

			pdf.SetXY(x+labelWidth+1.5, y+0.8)
			pdf.MultiCell(fullValWidth-3, lineHeight, ": "+firstNonEmpty(field.Value, "-"), "", "L", false)

			pdf.SetXY(x, y+curRowH)
			i++
			continue
		}

		// Field berpasangan 2 kolom
		leftField := field
		hasRight := i+1 < len(fields) && !strings.EqualFold(fields[i+1].Label, "Alamat")

		ensureInitialAssessmentPDFSpace(pdf, rowHeight)
		x := pdf.GetX()
		y := pdf.GetY()

		// Kolom Kiri
		pdf.Rect(x, y, labelWidth, rowHeight, "D")
		pdf.Rect(x+labelWidth, y, valueWidth, rowHeight, "D")
		pdf.SetFont("Arial", "", fontSize)
		pdf.SetXY(x+1.5, y+0.4)
		pdf.CellFormat(labelWidth-3, rowHeight-0.8, leftField.Label, "", 0, "L", false, 0, "")
		pdf.SetFont("Arial", "B", fontSize)
		pdf.SetXY(x+labelWidth+1.5, y+0.4)
		pdf.CellFormat(valueWidth-3, rowHeight-0.8, ": "+firstNonEmpty(leftField.Value, "-"), "", 0, "L", false, 0, "")

		// Kolom Kanan
		rx := x + halfWidth
		if hasRight {
			rightField := fields[i+1]
			pdf.Rect(rx, y, labelWidth, rowHeight, "D")
			pdf.Rect(rx+labelWidth, y, valueWidth, rowHeight, "D")
			pdf.SetFont("Arial", "", fontSize)
			pdf.SetXY(rx+1.5, y+0.4)
			pdf.CellFormat(labelWidth-3, rowHeight-0.8, rightField.Label, "", 0, "L", false, 0, "")
			pdf.SetFont("Arial", "B", fontSize)
			pdf.SetXY(rx+labelWidth+1.5, y+0.4)
			pdf.CellFormat(valueWidth-3, rowHeight-0.8, ": "+firstNonEmpty(rightField.Value, "-"), "", 0, "L", false, 0, "")
			i += 2
		} else {
			pdf.Rect(rx, y, halfWidth, rowHeight, "D")
			i++
		}

		pdf.SetXY(x, y+rowHeight)
	}

	spacing := 2.5
	if isA5 {
		spacing = 1.8
	}
	pdf.SetY(pdf.GetY() + spacing)
}

func addInvoiceItemSection(pdf *gofpdf.Fpdf, invoice models.Invoice, contentWidth float64, isA5 bool) {
	addInvoiceSectionTitle(pdf, "Rincian Tagihan", contentWidth, isA5)
	if len(invoice.Items) == 0 {
		pdf.CellFormat(contentWidth, 6, "Tidak ada item tagihan.", "1", 1, "C", false, 0, "")
		pdf.SetY(pdf.GetY() + 2)
		return
	}

	var colNo, colQty, colPrice, colTotal, colDesc float64
	if isA5 {
		colNo = 8.0
		colQty = 12.0
		colPrice = 24.0
		colTotal = 24.0
		colDesc = contentWidth - (colNo + colQty + colPrice + colTotal)
	} else {
		colNo = 10.0
		colQty = 15.0
		colPrice = 34.0
		colTotal = 34.0
		colDesc = contentWidth - (colNo + colQty + colPrice + colTotal)
	}

	headers := []string{"No", "Deskripsi", "Qty", "Harga Satuan", "Total"}
	widths := []float64{colNo, colDesc, colQty, colPrice, colTotal}
	aligns := []string{"C", "L", "C", "R", "R"}

	headerHeight := 5.8
	headerFontSize := 8.5
	rowFontSize := 8.5
	lineHeight := 4.0
	minRowHeight := 5.4
	if isA5 {
		headerHeight = 4.8
		headerFontSize = 7.5
		rowFontSize = 7.5
		lineHeight = 3.5
		minRowHeight = 4.4
	}

	// Table Header (Tanpa warna background)
	ensureInitialAssessmentPDFSpace(pdf, headerHeight)
	x := pdf.GetX()
	y := pdf.GetY()
	pdf.SetFont("Arial", "B", headerFontSize)
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetTextColor(0, 0, 0)
	for i, header := range headers {
		pdf.Rect(x, y, widths[i], headerHeight, "D")
		pdf.SetXY(x, y+0.4)
		pdf.CellFormat(widths[i], headerHeight-0.8, header, "", 0, aligns[i], false, 0, "")
		x += widths[i]
	}
	pdf.SetY(y + headerHeight)

	// Rows
	for idx, item := range invoice.Items {
		desc := firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(item.Description)), "-")
		pdf.SetFont("Arial", "", rowFontSize)
		descLines := pdf.SplitLines([]byte(desc), colDesc-4)
		lineCount := len(descLines)
		if lineCount < 1 {
			lineCount = 1
		}
		rowH := float64(lineCount)*lineHeight + 1.6
		if rowH < minRowHeight {
			rowH = minRowHeight
		}

		ensureInitialAssessmentPDFSpace(pdf, rowH)
		y = pdf.GetY()
		x = pdf.GetX()

		// Rectangles for each column
		curX := x
		for _, w := range widths {
			pdf.Rect(curX, y, w, rowH, "D")
			curX += w
		}

		// Values
		pdf.SetXY(x, y)
		pdf.CellFormat(widths[0], rowH, strconv.Itoa(idx+1), "", 0, "C", false, 0, "")

		pdf.SetXY(x+widths[0]+2, y+0.8)
		pdf.MultiCell(widths[1]-4, lineHeight, desc, "", "L", false)

		pdf.SetXY(x+widths[0]+widths[1], y)
		pdf.CellFormat(widths[2], rowH, strconv.Itoa(item.Quantity), "", 0, "C", false, 0, "")

		pdf.SetXY(x+widths[0]+widths[1]+widths[2], y)
		pdf.CellFormat(widths[3]-2, rowH, formatCurrency(item.UnitPrice), "", 0, "R", false, 0, "")

		pdf.SetXY(x+widths[0]+widths[1]+widths[2]+widths[3], y)
		pdf.CellFormat(widths[4]-2, rowH, formatCurrency(item.TotalPrice), "", 0, "R", false, 0, "")

		pdf.SetY(y + rowH)
	}

	spacing := 2.5
	if isA5 {
		spacing = 1.8
	}
	pdf.SetY(pdf.GetY() + spacing)
}

func addInvoiceSummaryBlock(pdf *gofpdf.Fpdf, fields []initialAssessmentPrintField, contentWidth float64, isA5 bool) {
	if len(fields) == 0 {
		return
	}

	blockWidth := 80.0
	fontSize := 8.5
	lineHeight := 4.6
	headerHeight := 5.0
	if isA5 {
		blockWidth = 64.0
		fontSize = 7.5
		lineHeight = 3.8
		headerHeight = 4.2
	}

	labelWidth := blockWidth * 0.48
	valueWidth := blockWidth - labelWidth
	left, _, _, _ := pdf.GetMargins()
	blockX := left + contentWidth - blockWidth
	totalHeight := headerHeight + (float64(len(fields)) * lineHeight) + 1.0

	ensureInitialAssessmentPDFSpace(pdf, totalHeight)
	pdf.SetDrawColor(120, 120, 120)
	pdf.SetTextColor(0, 0, 0)

	curY := pdf.GetY()
	// Bingkai kotak rapi di ringkasan pembayaran
	pdf.Rect(blockX, curY, blockWidth, totalHeight, "D")

	// Garis judul
	pdf.SetXY(blockX, curY)
	pdf.SetFont("Arial", "B", fontSize)
	pdf.CellFormat(blockWidth, headerHeight, " Ringkasan Pembayaran", "B", 1, "L", false, 0, "")

	for _, field := range fields {
		label := firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(field.Label)), "-")
		value := firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(field.Value)), "-")
		isImportant := label == "Total Tagihan" || label == "Sudah Dibayar" || label == "Sisa Tagihan"

		if isImportant {
			pdf.SetFont("Arial", "B", fontSize)
		} else {
			pdf.SetFont("Arial", "", fontSize)
		}

		pdf.SetTextColor(0, 0, 0)
		pdf.SetX(blockX)
		pdf.CellFormat(labelWidth, lineHeight, " "+label, "", 0, "L", false, 0, "")
		pdf.CellFormat(valueWidth-2, lineHeight, value, "", 1, "R", false, 0, "")
	}

	pdf.SetY(curY + totalHeight + 3.0)
}

func addInvoiceSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, leftLabel string, leftName string, rightLabel string, rightName string, contentWidth float64, isA5 bool) {
	requiredHeight := 28.0
	fontSize := 8.5
	gapHeight := 14.0
	if isA5 {
		requiredHeight = 24.0
		fontSize = 7.5
		gapHeight = 11.0
	}

	ensureInitialAssessmentPDFSpace(pdf, requiredHeight)
	left, _, _, _ := pdf.GetMargins()
	columnGap := 16.0
	columnWidth := (contentWidth - columnGap) / 2
	leftColumnX := left
	rightColumnX := left + columnWidth + columnGap

	dateLabel := formatDateIndonesian(generatedAt)
	if city := strings.TrimSpace(hospitalInfo.City); city != "" {
		dateLabel = city + ", " + dateLabel
	}

	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Arial", "", fontSize)

	// Tanggal di atas tanda tangan kasir
	currentY := pdf.GetY() + 2.0
	pdf.SetXY(rightColumnX, currentY)
	pdf.CellFormat(columnWidth, 4.5, dateLabel, "", 1, "C", false, 0, "")

	// Label penandatangan
	currentY = pdf.GetY() + 1.0
	pdf.SetXY(leftColumnX, currentY)
	pdf.CellFormat(columnWidth, 4.5, fallbackText(leftLabel), "", 0, "C", false, 0, "")
	pdf.SetXY(rightColumnX, currentY)
	pdf.CellFormat(columnWidth, 4.5, fallbackText(rightLabel), "", 1, "C", false, 0, "")

	// Jarak untuk tanda tangan fisik
	currentY = pdf.GetY() + gapHeight

	// Format resmi tanda tangan dokumen: ( Nama Lengkap )
	pdf.SetFont("Arial", "B", fontSize)
	pdf.SetXY(leftColumnX, currentY)
	pdf.CellFormat(columnWidth, 4.5, "( "+fallbackText(leftName)+" )", "", 0, "C", false, 0, "")
	pdf.SetXY(rightColumnX, currentY)
	pdf.CellFormat(columnWidth, 4.5, "( "+fallbackText(rightName)+" )", "", 1, "C", false, 0, "")

	pdf.SetY(currentY + 6.0)
}

// renderInvoiceThermalPDF produces receipt for standard 80mm POS Thermal printers
func renderInvoiceThermalPDF(invoice models.Invoice, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, totalPaid float64, remaining float64) (*gofpdf.Fpdf, error) {
	itemCount := len(invoice.Items)
	baseHeight := 105.0 + float64(itemCount)*9.0
	if strings.TrimSpace(invoice.Notes) != "" {
		baseHeight += 12.0
	}
	if baseHeight < 140.0 {
		baseHeight = 140.0
	}

	pdf := gofpdf.NewCustom(&gofpdf.InitType{
		OrientationStr: "P",
		UnitStr:        "mm",
		Size:           gofpdf.SizeType{Wd: 80, Ht: baseHeight},
	})
	pdf.SetMargins(3.5, 4, 3.5)
	pdf.SetAutoPageBreak(true, 4)
	pdf.SetTitle("Kwitansi Pembayaran (Thermal)", false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.AddPage()

	width := 73.0

	// 1. Clinic Header
	pdf.SetFont("Arial", "B", 10)
	pdf.MultiCell(width, 4.2, strings.ToUpper(fallbackText(hospitalInfo.Name)), "", "C", false)

	pdf.SetFont("Arial", "", 7.5)
	addr := strings.Trim(strings.Join([]string{strings.TrimSpace(hospitalInfo.Address), strings.TrimSpace(hospitalInfo.City)}, ", "), ", ")
	if addr != "" {
		pdf.MultiCell(width, 3.4, addr, "", "C", false)
	}
	if phone := strings.TrimSpace(hospitalInfo.Phone); phone != "" {
		pdf.CellFormat(width, 3.4, "Telp: "+phone, "", 1, "C", false, 0, "")
	}

	// Double Line
	drawThermalDivider(pdf, width, "=")

	// 2. Receipt Title & Meta
	pdf.SetFont("Arial", "B", 9)
	pdf.CellFormat(width, 4.5, "KWITANSI PEMBAYARAN", "", 1, "C", false, 0, "")

	pdf.SetFont("Arial", "", 7.5)
	drawThermalKeyValue(pdf, width, "No. Invoice", fallbackText(invoice.InvoiceNumber))
	drawThermalKeyValue(pdf, width, "Tanggal", formatDateTimeIndonesian(invoice.InvoiceDate))
	drawThermalKeyValue(pdf, width, "No. Kunjungan", fallbackText(invoice.Visit.VisitNumber))

	drawThermalDivider(pdf, width, "-")

	// 3. Patient & Clinic info
	drawThermalKeyValue(pdf, width, "No. RM", fallbackText(invoice.Patient.MedicalRecordNumber))
	drawThermalKeyValue(pdf, width, "Nama Pasien", fallbackText(invoice.Patient.FullName))
	drawThermalKeyValue(pdf, width, "Poliklinik", fallbackText(invoice.Visit.Polyclinic.Name))
	drawThermalKeyValue(pdf, width, "Dokter", fallbackText(invoice.Visit.Doctor.FullName))
	drawThermalKeyValue(pdf, width, "Kasir", resolveInvoiceCashierSignatureName(invoice))

	drawThermalDivider(pdf, width, "-")

	// 4. Items List
	pdf.SetFont("Arial", "B", 7.5)
	pdf.CellFormat(width, 4.2, "RINCIAN TAGIHAN", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 7.5)

	if len(invoice.Items) == 0 {
		pdf.CellFormat(width, 4, "Tidak ada item tagihan.", "", 1, "L", false, 0, "")
	} else {
		for idx, item := range invoice.Items {
			desc := fmt.Sprintf("%d. %s", idx+1, strings.TrimSpace(sanitizePDFSingleLineText(item.Description)))
			pdf.MultiCell(width, 3.6, desc, "", "L", false)

			// Sub row: Qty x UnitPrice -> Total
			calcLine := fmt.Sprintf("   %d x %s", item.Quantity, formatNumber(item.UnitPrice))
			totLine := formatCurrency(item.TotalPrice)
			pdf.CellFormat(width*0.55, 3.6, calcLine, "", 0, "L", false, 0, "")
			pdf.CellFormat(width*0.45, 3.6, totLine, "", 1, "R", false, 0, "")
		}
	}

	drawThermalDivider(pdf, width, "-")

	// 5. Summary
	drawThermalSummaryRow(pdf, width, "Subtotal", formatCurrency(invoice.SubTotal), false)
	if invoice.Discount > 0 {
		drawThermalSummaryRow(pdf, width, "Diskon", "-"+formatCurrency(invoice.Discount), false)
	}
	if invoice.Tax > 0 {
		drawThermalSummaryRow(pdf, width, "Pajak", "+"+formatCurrency(invoice.Tax), false)
	}
	drawThermalSummaryRow(pdf, width, "TOTAL TAGIHAN", formatCurrency(invoice.TotalAmount), true)
	drawThermalSummaryRow(pdf, width, "Sudah Dibayar", formatCurrency(totalPaid), true)
	drawThermalSummaryRow(pdf, width, "Sisa Tagihan", formatCurrency(remaining), true)

	// Riwayat pembayaran TIDAK ditampilkan sesuai instruksi user

	drawThermalDivider(pdf, width, "=")

	// 6. Status Text
	statusLabel := fmt.Sprintf("*** %s ***", resolveInvoiceStatusWatermarkText(invoice.Status))
	pdf.SetFont("Arial", "B", 9.5)
	pdf.CellFormat(width, 5, statusLabel, "", 1, "C", false, 0, "")

	drawThermalDivider(pdf, width, "=")

	// 7. Footer
	pdf.SetFont("Arial", "I", 7.5)
	pdf.CellFormat(width, 3.8, "Terima kasih atas kunjungan Anda", "", 1, "C", false, 0, "")
	pdf.CellFormat(width, 3.8, "Semoga lekas sembuh", "", 1, "C", false, 0, "")

	return pdf, nil
}

func drawThermalKeyValue(pdf *gofpdf.Fpdf, width float64, label string, val string) {
	labelW := 25.0
	valW := width - labelW
	pdf.CellFormat(labelW, 3.6, label, "", 0, "L", false, 0, "")
	pdf.CellFormat(valW, 3.6, ": "+val, "", 1, "L", false, 0, "")
}

func drawThermalSummaryRow(pdf *gofpdf.Fpdf, width float64, label string, val string, bold bool) {
	if bold {
		pdf.SetFont("Arial", "B", 8)
	} else {
		pdf.SetFont("Arial", "", 7.5)
	}
	labelW := width * 0.55
	valW := width * 0.45
	pdf.CellFormat(labelW, 4.0, label, "", 0, "L", false, 0, "")
	pdf.CellFormat(valW, 4.0, val, "", 1, "R", false, 0, "")
}

func drawThermalDivider(pdf *gofpdf.Fpdf, width float64, char string) {
	pdf.SetFont("Courier", "", 8)
	divider := strings.Repeat(char, 38)
	pdf.CellFormat(width, 3.5, divider, "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 7.5)
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


