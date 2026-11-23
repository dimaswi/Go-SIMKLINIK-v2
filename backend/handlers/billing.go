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
	case "kwitansi", "terbilang", "simple":
		pdf, err = renderInvoiceKwitansiTerbilangPDF(invoice, hospitalInfo, generatedAt, totalPaid, remaining)
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

	margin := 10.0
	if isA5 {
		margin = 7.0
	}
	pdf.SetMargins(margin, margin-1.5, margin)
	pdf.SetAutoPageBreak(true, margin)
	pdf.AliasNbPages("")
	pdf.SetTitle("Kwitansi Pembayaran", false)
	pdf.SetCreator("SIMKLINIK", false)

	pdf.SetFooterFunc(func() {
		pdf.SetY(-6.5)
		pdf.SetFont("Arial", "", 7)
		pdf.SetTextColor(70, 70, 70)
		pdf.CellFormat(100, 4, "Dicetak: "+formatDateTimeIndonesian(generatedAt)+" | SIMKLINIK", "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})

	pdf.AddPage()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - (margin * 2)

	// 1. Kop Resmi Klinik + Banner Judul & Status Badge Non-Overlapping
	drawInvoiceKopWithBanner(pdf, hospitalInfo, invoice, contentWidth, isA5)

	// 2. Informasi Tagihan & Pasien Terpadu (2 kolom rapat standar RS Indonesia)
	mergedFields := buildInvoiceMergedFields(invoice)
	addInvoiceCompactFieldSection(pdf, "INFORMASI TAGIHAN & PASIEN", mergedFields, contentWidth, isA5)

	// 3. Rincian Tagihan (Tabel Slate-800 + Zebra Rows)
	addInvoiceItemSection(pdf, invoice, contentWidth, isA5)

	// 4. Terbilang (kiri) + Ringkasan Pembayaran (kanan) berdampingan tanpa ruang kosong
	addInvoiceSummaryAndTerbilangBlock(pdf, invoice, buildInvoiceSummaryFields(invoice, totalPaid, remaining), contentWidth, isA5)

	// 5. Tanda Tangan Pasien & Petugas Kasir (Kompak)
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

func drawInvoiceKopWithBanner(pdf *gofpdf.Fpdf, info initialAssessmentHospitalInfo, invoice models.Invoice, contentWidth float64, isA5 bool) {
	left, top, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()

	hasLogo := info.LogoPath != "" && info.LogoType != ""
	logoMaxHeight := 15.0
	logoMaxWidth := 18.0
	logoGap := 3.0
	if isA5 {
		logoMaxHeight = 12.0
		logoMaxWidth = 14.0
		logoGap = 2.2
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

	nameSize := 12.5
	addrSize := 7.8
	lineHeight := 3.4
	nameLineH := 4.8
	if isA5 {
		nameSize = 10.5
		addrSize = 6.8
		lineHeight = 3.0
		nameLineH = 4.2
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
		lineHeight: nameLineH,
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
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Email)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Website)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if len(contactParts) > 0 {
		lines = append(lines, kopLine{
			text:       strings.Join(contactParts, "  |  "),
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
		lc := len(lineParts)
		if lc < 1 {
			lc = 1
		}
		textBlockHeight += float64(lc) * l.lineHeight
	}
	headerBlockHeight := maxFloat64(textBlockHeight, logoHeight)

	if hasLogo && logoWidth > 0 {
		logoY := top + ((headerBlockHeight - logoHeight) / 2)
		drawInitialAssessmentHeaderLogo(pdf, info.LogoPath, info.LogoType, left, logoY, logoMaxHeight, logoMaxWidth)
	}

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

	// Garis pembatas Kop Resmi Indonesia (1 garis tegas bersih, tidak mepet)
	lineY := top + headerBlockHeight + 1.6
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.6)
	pdf.Line(left, lineY, pageWidth-right, lineY)

	// Kotak Judul Dokumen menyatu langsung sebagai bagian atas bingkai besar (gaya Resep)
	titleFont := 10.8
	subFont := 8.0
	titleBoxH := 9.8
	if isA5 {
		titleFont = 9.2
		subFont = 7.2
		titleBoxH = 8.4
	}
	titleBoxY := lineY + 1.8
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(left, titleBoxY, contentWidth, titleBoxH, "D")

	pdf.SetXY(left, titleBoxY+0.6)
	pdf.SetFont("Arial", "B", titleFont)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(contentWidth, titleBoxH*0.5, "KWITANSI / RINCIAN TAGIHAN", "", 1, "C", false, 0, "")

	statusLabel := resolveInvoiceStatusWatermarkText(invoice.Status)
	pdf.SetXY(left, titleBoxY+titleBoxH*0.5)
	pdf.SetFont("Arial", "", subFont)
	pdf.CellFormat(contentWidth, titleBoxH*0.44, fmt.Sprintf("No. Invoice : %s   |   Status : %s", fallbackText(invoice.InvoiceNumber), statusLabel), "", 1, "C", false, 0, "")

	pdf.SetLineWidth(0.2)
	pdf.SetY(titleBoxY + titleBoxH)
}

func buildInvoiceMergedFields(invoice models.Invoice) []initialAssessmentPrintField {
	fields := []initialAssessmentPrintField{
		{Label: "No. Rekam Medis", Value: fallbackText(invoice.Patient.MedicalRecordNumber)},
		{Label: "Tgl. Invoice", Value: formatDateTimeIndonesian(invoice.InvoiceDate)},
		{Label: "Nama Pasien", Value: fallbackText(invoice.Patient.FullName)},
		{Label: "No. Kunjungan", Value: fallbackText(invoice.Visit.VisitNumber)},
		{Label: "JK / Telepon", Value: strings.Trim(strings.Join(filterEmptyStrings([]string{genderLabelForPrint(invoice.Patient.Gender), strings.TrimSpace(invoice.Patient.Phone)}), " / "), " /")},
		{Label: "Poliklinik", Value: fallbackText(invoice.Visit.Polyclinic.Name)},
		{Label: "Dokter", Value: fallbackText(invoice.Visit.Doctor.FullName)},
	}
	if payMethod := resolveInvoicePaymentMethodsSummary(invoice); payMethod != "" {
		fields = append(fields, initialAssessmentPrintField{Label: "Metode Bayar", Value: payMethod})
	} else {
		fields = append(fields, initialAssessmentPrintField{Label: "Pembiayaan", Value: formatPaymentTypeForPrint(invoice.Visit.PaymentType)})
	}
	if addr := strings.TrimSpace(formatPatientAddress(invoice.Patient)); addr != "" && addr != "-" {
		fields = append(fields, initialAssessmentPrintField{Label: "Alamat", Value: addr})
	}
	return fields
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
	titleHeight := 5.0
	titleFont := 8.2
	if isA5 {
		titleHeight = 4.2
		titleFont = 7.4
	}
	ensureInitialAssessmentPDFSpace(pdf, titleHeight+6.0)
	left, _, _, _ := pdf.GetMargins()
	y := pdf.GetY()
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(left, y, contentWidth, titleHeight, "D")
	pdf.SetLineWidth(0.2)

	pdf.SetXY(left+2.0, y+0.3)
	pdf.SetFont("Arial", "B", titleFont)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(contentWidth-4.0, titleHeight-0.6, strings.ToUpper(title), "", 0, "C", false, 0, "")
	pdf.SetY(y + titleHeight)
	pdf.SetFont("Arial", "", titleFont)
}

func addInvoiceCompactFieldSection(pdf *gofpdf.Fpdf, title string, fields []initialAssessmentPrintField, contentWidth float64, isA5 bool) {
	addInvoiceSectionTitle(pdf, title, contentWidth, isA5)
	if len(fields) == 0 {
		pdf.CellFormat(contentWidth, 5.2, "Tidak ada data.", "1", 1, "L", false, 0, "")
		return
	}

	left, _, _, _ := pdf.GetMargins()
	boxStartY := pdf.GetY()
	pdf.SetY(boxStartY + 1.2)

	halfSpanW := contentWidth / 2.0
	splitX := left + halfSpanW
	colPad := 2.5
	colonW := 4.0
	valGap := 1.2
	fontSize := 8.2
	lineHeight := 3.8
	rowHeight := 4.5
	if isA5 {
		colPad = 2.0
		colonW = 3.2
		valGap = 1.0
		fontSize = 7.2
		lineHeight = 3.3
		rowHeight = 3.9
	}
	halfWidth := halfSpanW - (colPad * 2)
	labelWidth := halfWidth * 0.36
	valueWidth := halfWidth - labelWidth - colonW - valGap - 0.5
	innerLeft := left + colPad
	innerWidth := contentWidth - (colPad * 2)

	pdf.SetTextColor(0, 0, 0)
	twoColStartY := boxStartY
	twoColEndY := boxStartY

	for i := 0; i < len(fields); {
		field := fields[i]
		isFullWidth := strings.EqualFold(field.Label, "Alamat")

		if isFullWidth {
			divY := pdf.GetY() + 0.4
			if twoColEndY > twoColStartY {
				pdf.SetDrawColor(0, 0, 0)
				pdf.SetLineWidth(0.25)
				pdf.Line(splitX, twoColStartY, splitX, divY)
				pdf.Line(left, divY, left+contentWidth, divY)
			}
			fullValWidth := innerWidth - labelWidth - colonW - valGap - 1.0
			pdf.SetFont("Arial", "", fontSize)
			lines := pdf.SplitLines([]byte(sanitizePDFText(field.Value)), fullValWidth)
			lineCount := len(lines)
			if lineCount < 1 {
				lineCount = 1
			}
			curRowH := maxFloat64(rowHeight, float64(lineCount)*lineHeight+0.8)

			y := divY + 0.6
			pdf.SetFont("Arial", "", fontSize)
			pdf.SetXY(innerLeft, y+0.4)
			pdf.CellFormat(labelWidth-1.0, lineHeight, field.Label, "", 0, "L", false, 0, "")
			pdf.CellFormat(colonW, lineHeight, ":", "", 0, "C", false, 0, "")

			pdf.SetXY(innerLeft+labelWidth+colonW+valGap, y+0.4)
			pdf.MultiCell(fullValWidth, lineHeight, firstNonEmpty(sanitizePDFText(field.Value), "-"), "", "L", false)

			pdf.SetXY(left, y+curRowH)
			twoColStartY = pdf.GetY()
			twoColEndY = twoColStartY
			i++
			continue
		}

		leftField := field
		hasRight := i+1 < len(fields) && !strings.EqualFold(fields[i+1].Label, "Alamat")

		ensureInitialAssessmentPDFSpace(pdf, rowHeight)
		y := pdf.GetY()

		// Kolom Kiri
		pdf.SetFont("Arial", "", fontSize)
		pdf.SetXY(innerLeft, y+0.4)
		pdf.CellFormat(labelWidth-1.0, lineHeight, leftField.Label, "", 0, "L", false, 0, "")
		pdf.CellFormat(colonW, lineHeight, ":", "", 0, "C", false, 0, "")
		if strings.EqualFold(leftField.Label, "Nama Pasien") || strings.EqualFold(leftField.Label, "No. Rekam Medis") {
			pdf.SetFont("Arial", "B", fontSize)
		}
		pdf.SetXY(innerLeft+labelWidth+colonW+valGap, y+0.4)
		pdf.CellFormat(valueWidth, lineHeight, fitTextToWidth(pdf, firstNonEmpty(sanitizePDFSingleLineText(leftField.Value), "-"), valueWidth), "", 0, "L", false, 0, "")

		// Kolom Kanan
		rx := splitX + colPad
		if hasRight {
			rightField := fields[i+1]
			pdf.SetFont("Arial", "", fontSize)
			pdf.SetXY(rx, y+0.4)
			pdf.CellFormat(labelWidth-1.0, lineHeight, rightField.Label, "", 0, "L", false, 0, "")
			pdf.CellFormat(colonW, lineHeight, ":", "", 0, "C", false, 0, "")
			if strings.EqualFold(rightField.Label, "No. Kunjungan") {
				pdf.SetFont("Arial", "B", fontSize)
			}
			pdf.SetXY(rx+labelWidth+colonW+valGap, y+0.4)
			pdf.CellFormat(valueWidth, lineHeight, fitTextToWidth(pdf, firstNonEmpty(sanitizePDFSingleLineText(rightField.Value), "-"), valueWidth), "", 0, "L", false, 0, "")
			i += 2
		} else {
			i++
		}

		pdf.SetXY(left, y+rowHeight)
		twoColEndY = pdf.GetY()
	}

	boxEndY := pdf.GetY() + 1.2
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	if twoColEndY > twoColStartY {
		pdf.Line(splitX, twoColStartY, splitX, boxEndY)
	}
	pdf.Rect(left, boxStartY, contentWidth, boxEndY-boxStartY, "D")
	pdf.SetLineWidth(0.2)
	pdf.SetY(boxEndY)
}

func addInvoiceItemSection(pdf *gofpdf.Fpdf, invoice models.Invoice, contentWidth float64, isA5 bool) {
	addInvoiceSectionTitle(pdf, "RINCIAN TAGIHAN", contentWidth, isA5)
	if len(invoice.Items) == 0 {
		pdf.CellFormat(contentWidth, 5.5, "Tidak ada item tagihan.", "1", 1, "C", false, 0, "")
		return
	}

	left, _, _, _ := pdf.GetMargins()
	var colNo, colQty, colPrice, colTotal, colDesc float64
	if isA5 {
		colNo = 8.0
		colQty = 11.0
		colPrice = 24.0
		colTotal = 25.0
		colDesc = contentWidth - (colNo + colQty + colPrice + colTotal)
	} else {
		colNo = 9.0
		colQty = 14.0
		colPrice = 34.0
		colTotal = 34.0
		colDesc = contentWidth - (colNo + colQty + colPrice + colTotal)
	}

	headers := []string{"NO", "DESKRIPSI LAYANAN / OBAT", "QTY", "HARGA SATUAN", "SUBTOTAL"}
	widths := []float64{colNo, colDesc, colQty, colPrice, colTotal}
	aligns := []string{"C", "L", "C", "R", "R"}

	headerHeight := 5.2
	headerFontSize := 7.6
	rowFontSize := 8.0
	lineHeight := 3.6
	minRowHeight := 4.8
	if isA5 {
		headerHeight = 4.4
		headerFontSize = 6.8
		rowFontSize = 7.0
		lineHeight = 3.2
		minRowHeight = 4.2
	}

	drawTableHeader := func() {
		ensureInitialAssessmentPDFSpace(pdf, headerHeight+minRowHeight)
		x := left
		y := pdf.GetY()
		pdf.SetFont("Arial", "B", headerFontSize)
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetTextColor(0, 0, 0)
		pdf.SetLineWidth(0.25)
		for i, header := range headers {
			pdf.Rect(x, y, widths[i], headerHeight, "D")
			pdf.SetXY(x+1, y+0.3)
			pdf.CellFormat(widths[i]-2, headerHeight-0.6, header, "", 0, "C", false, 0, "")
			x += widths[i]
		}
		pdf.SetLineWidth(0.2)
		pdf.SetY(y + headerHeight)
	}

	drawTableHeader()

	// Rows (Hitam Putih Murni)
	for idx, item := range invoice.Items {
		desc := firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(item.Description)), "-")
		pdf.SetFont("Arial", "", rowFontSize)
		descLines := pdf.SplitLines([]byte(desc), colDesc-3)
		lineCount := len(descLines)
		if lineCount < 1 {
			lineCount = 1
		}
		rowH := maxFloat64(minRowHeight, float64(lineCount)*lineHeight+1.2)

		_, pageHeight := pdf.GetPageSize()
		_, _, _, bottom := pdf.GetMargins()
		if pdf.GetY()+rowH > pageHeight-bottom {
			pdf.AddPage()
			pdf.SetY(10)
			drawTableHeader()
		}

		y := pdf.GetY()
		x := left
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetLineWidth(0.2)

		curX := x
		for _, w := range widths {
			pdf.Rect(curX, y, w, rowH, "D")
			curX += w
		}

		pdf.SetTextColor(0, 0, 0)
		pdf.SetFont("Arial", "", rowFontSize)
		pdf.SetXY(x, y)
		pdf.CellFormat(widths[0], rowH, strconv.Itoa(idx+1), "", 0, "C", false, 0, "")

		pdf.SetXY(x+widths[0]+1.5, y+0.6)
		pdf.MultiCell(widths[1]-3, lineHeight, desc, "", aligns[1], false)

		pdf.SetXY(x+widths[0]+widths[1], y)
		pdf.CellFormat(widths[2], rowH, strconv.Itoa(item.Quantity), "", 0, "C", false, 0, "")

		pdf.SetXY(x+widths[0]+widths[1]+widths[2], y)
		pdf.CellFormat(widths[3]-1.5, rowH, formatCurrency(item.UnitPrice), "", 0, "R", false, 0, "")

		pdf.SetFont("Arial", "B", rowFontSize)
		pdf.SetXY(x+widths[0]+widths[1]+widths[2]+widths[3], y)
		pdf.CellFormat(widths[4]-1.5, rowH, formatCurrency(item.TotalPrice), "", 0, "R", false, 0, "")

		pdf.SetY(y + rowH)
	}
}

func addInvoiceSummaryAndTerbilangBlock(pdf *gofpdf.Fpdf, invoice models.Invoice, fields []initialAssessmentPrintField, contentWidth float64, isA5 bool) {
	if len(fields) == 0 {
		return
	}

	left, _, _, _ := pdf.GetMargins()
	summaryW := 78.0
	fontSize := 8.0
	lineHeight := 4.4
	headerHeight := 4.8
	if isA5 {
		summaryW = 60.0
		fontSize = 7.0
		lineHeight = 3.8
		headerHeight = 4.2
	}
	terbilangW := contentWidth - summaryW

	labelWidth := summaryW * 0.48
	valueWidth := summaryW - labelWidth
	summaryX := left + terbilangW
	totalHeight := headerHeight + (float64(len(fields)) * lineHeight) + 1.2

	ensureInitialAssessmentPDFSpace(pdf, totalHeight+2)
	curY := pdf.GetY()

	// Satu kotak penuh menyatu: Terbilang (kiri) | Ringkasan Pembayaran (kanan)
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(left, curY, contentWidth, totalHeight, "D")
	pdf.Line(summaryX, curY, summaryX, curY+totalHeight)
	pdf.Line(left, curY+headerHeight, left+contentWidth, curY+headerHeight)
	pdf.SetLineWidth(0.2)

	pdf.SetXY(left+2.2, curY+0.2)
	pdf.SetFont("Arial", "B", fontSize)
	pdf.CellFormat(terbilangW-4.4, headerHeight-0.4, "TERBILANG", "", 0, "C", false, 0, "")

	pdf.SetXY(left+2.5, curY+headerHeight+1.4)
	pdf.SetFont("Arial", "BI", fontSize+0.2)
	pdf.MultiCell(terbilangW-5.0, lineHeight-0.2, formatTerbilangRupiah(invoice.TotalAmount), "", "L", false)

	pdf.SetXY(summaryX+1.5, curY+0.2)
	pdf.SetFont("Arial", "B", fontSize)
	pdf.CellFormat(summaryW-3, headerHeight-0.4, "RINGKASAN PEMBAYARAN", "", 1, "C", false, 0, "")

	rowY := curY + headerHeight + 0.4
	for _, field := range fields {
		label := firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(field.Label)), "-")
		value := firstNonEmpty(strings.TrimSpace(sanitizePDFSingleLineText(field.Value)), "-")
		isImportant := label == "Total Tagihan" || label == "Sudah Dibayar" || label == "Sisa Tagihan"

		if isImportant {
			pdf.SetFont("Arial", "B", fontSize)
		} else {
			pdf.SetFont("Arial", "", fontSize)
		}

		pdf.SetXY(summaryX+2.0, rowY)
		pdf.CellFormat(labelWidth-2.0, lineHeight, label, "", 0, "L", false, 0, "")
		pdf.CellFormat(valueWidth-2.0, lineHeight, value, "", 1, "R", false, 0, "")
		rowY += lineHeight
	}

	pdf.SetY(curY + totalHeight)
}

func addInvoiceSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, leftLabel string, leftName string, rightLabel string, rightName string, contentWidth float64, isA5 bool) {
	boxH := 27.0
	fontSize := 8.4
	if isA5 {
		boxH = 22.0
		fontSize = 7.4
	}

	ensureInitialAssessmentPDFSpace(pdf, boxH)
	left, _, _, _ := pdf.GetMargins()
	columnWidth := contentWidth / 2.0
	splitX := left + columnWidth
	boxStartY := pdf.GetY()

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(left, boxStartY, contentWidth, boxH, "D")
	pdf.Line(splitX, boxStartY, splitX, boxStartY+boxH)
	pdf.SetLineWidth(0.2)

	dateLabel := formatDateIndonesian(generatedAt)
	if city := strings.TrimSpace(hospitalInfo.City); city != "" {
		dateLabel = city + ", " + dateLabel
	}

	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Arial", "", fontSize)

	// Tanggal di atas tanda tangan kasir
	pdf.SetXY(splitX, boxStartY+1.8)
	pdf.CellFormat(columnWidth, 4.0, dateLabel, "", 1, "C", false, 0, "")

	// Label penandatangan
	labelY := boxStartY + 5.6
	pdf.SetXY(left, labelY)
	pdf.CellFormat(columnWidth, 4.0, fallbackText(leftLabel), "", 0, "C", false, 0, "")
	pdf.SetXY(splitX, labelY)
	pdf.CellFormat(columnWidth, 4.0, fallbackText(rightLabel), "", 1, "C", false, 0, "")

	// Format resmi tanda tangan dokumen: ( Nama Lengkap )
	nameY := boxStartY + boxH - 5.6
	pdf.SetFont("Arial", "B", fontSize)
	pdf.SetXY(left, nameY)
	pdf.CellFormat(columnWidth, 4.2, "( "+fallbackText(leftName)+" )", "", 0, "C", false, 0, "")
	pdf.SetXY(splitX, nameY)
	pdf.CellFormat(columnWidth, 4.2, "( "+fallbackText(rightName)+" )", "", 1, "C", false, 0, "")

	pdf.SetY(boxStartY + boxH)
}

// renderInvoiceThermalPDF produces receipt for standard 80mm POS Thermal printers (2-pass exact height)
func renderInvoiceThermalPDF(invoice models.Invoice, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, totalPaid float64, remaining float64) (*gofpdf.Fpdf, error) {
	// Pass 1: Measure exact content height on 80mm thermal roll
	measurePdf := gofpdf.NewCustom(&gofpdf.InitType{
		OrientationStr: "P",
		UnitStr:        "mm",
		Size:           gofpdf.SizeType{Wd: 80, Ht: 600},
	})
	measurePdf.SetMargins(3.5, 3.5, 3.5)
	measurePdf.SetAutoPageBreak(false, 0)
	measurePdf.AddPage()
	buildInvoiceThermalContent(measurePdf, invoice, hospitalInfo, generatedAt, totalPaid, remaining)
	exactHeight := measurePdf.GetY() + 4.0
	if exactHeight < 80.0 {
		exactHeight = 80.0
	}

	// Pass 2: Render final PDF with zero trailing blank paper
	pdf := gofpdf.NewCustom(&gofpdf.InitType{
		OrientationStr: "P",
		UnitStr:        "mm",
		Size:           gofpdf.SizeType{Wd: 80, Ht: exactHeight},
	})
	pdf.SetMargins(3.5, 3.5, 3.5)
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetTitle("Kwitansi Pembayaran (Thermal)", false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.AddPage()
	buildInvoiceThermalContent(pdf, invoice, hospitalInfo, generatedAt, totalPaid, remaining)

	return pdf, nil
}

func buildInvoiceThermalContent(pdf *gofpdf.Fpdf, invoice models.Invoice, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, totalPaid float64, remaining float64) {
	width := 73.0

	// 1. Clinic Header
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Arial", "B", 9.8)
	pdf.MultiCell(width, 4.0, strings.ToUpper(fallbackText(hospitalInfo.Name)), "", "C", false)

	pdf.SetFont("Arial", "", 7.2)
	addr := strings.Trim(strings.Join([]string{strings.TrimSpace(hospitalInfo.Address), strings.TrimSpace(hospitalInfo.City)}, ", "), ", ")
	if addr != "" {
		pdf.MultiCell(width, 3.2, sanitizePDFText(addr), "", "C", false)
	}
	if phone := strings.TrimSpace(hospitalInfo.Phone); phone != "" {
		pdf.CellFormat(width, 3.2, "Telp: "+sanitizePDFSingleLineText(phone), "", 1, "C", false, 0, "")
	}

	// Double Line
	drawThermalDivider(pdf, width, "=")

	// 2. Receipt Title & Meta
	pdf.SetFont("Arial", "B", 8.8)
	pdf.CellFormat(width, 4.2, "KWITANSI PEMBAYARAN", "", 1, "C", false, 0, "")

	pdf.SetFont("Arial", "", 7.4)
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
	pdf.SetFont("Arial", "B", 7.4)
	pdf.CellFormat(width, 4.0, "RINCIAN TAGIHAN", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 7.3)

	if len(invoice.Items) == 0 {
		pdf.CellFormat(width, 3.8, "Tidak ada item tagihan.", "", 1, "L", false, 0, "")
	} else {
		for idx, item := range invoice.Items {
			desc := fmt.Sprintf("%d. %s", idx+1, strings.TrimSpace(sanitizePDFSingleLineText(item.Description)))
			pdf.MultiCell(width, 3.4, desc, "", "L", false)

			calcLine := fmt.Sprintf("   %d x %s", item.Quantity, formatNumber(item.UnitPrice))
			totLine := formatCurrency(item.TotalPrice)
			pdf.CellFormat(width*0.55, 3.4, calcLine, "", 0, "L", false, 0, "")
			pdf.CellFormat(width*0.45, 3.4, totLine, "", 1, "R", false, 0, "")
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

	drawThermalDivider(pdf, width, "=")

	// 6. Status Text
	statusLabel := fmt.Sprintf("*** %s ***", resolveInvoiceStatusWatermarkText(invoice.Status))
	pdf.SetFont("Arial", "B", 9.0)
	pdf.CellFormat(width, 4.6, statusLabel, "", 1, "C", false, 0, "")

	drawThermalDivider(pdf, width, "=")

	// 7. Footer
	pdf.SetFont("Arial", "I", 7.2)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(width, 3.4, "Terima kasih atas kunjungan Anda", "", 1, "C", false, 0, "")
	pdf.CellFormat(width, 3.4, "Semoga lekas sembuh", "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 6.5)
	pdf.CellFormat(width, 3.2, "Dicetak: "+formatDateTimeIndonesian(generatedAt), "", 1, "C", false, 0, "")
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

func formatTerbilangWords(n int64) string {
	if n < 0 {
		return "Minus " + formatTerbilangWords(-n)
	}
	base := []string{"", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"}
	switch {
	case n == 0:
		return ""
	case n < 12:
		return base[n]
	case n < 20:
		return formatTerbilangWords(n-10) + " Belas"
	case n < 100:
		res := formatTerbilangWords(n/10) + " Puluh"
		if rem := n % 10; rem > 0 {
			res += " " + formatTerbilangWords(rem)
		}
		return res
	case n < 200:
		res := "Seratus"
		if rem := n - 100; rem > 0 {
			res += " " + formatTerbilangWords(rem)
		}
		return res
	case n < 1000:
		res := formatTerbilangWords(n/100) + " Ratus"
		if rem := n % 100; rem > 0 {
			res += " " + formatTerbilangWords(rem)
		}
		return res
	case n < 2000:
		res := "Seribu"
		if rem := n - 1000; rem > 0 {
			res += " " + formatTerbilangWords(rem)
		}
		return res
	case n < 1000000:
		res := formatTerbilangWords(n/1000) + " Ribu"
		if rem := n % 1000; rem > 0 {
			res += " " + formatTerbilangWords(rem)
		}
		return res
	case n < 1000000000:
		res := formatTerbilangWords(n/1000000) + " Juta"
		if rem := n % 1000000; rem > 0 {
			res += " " + formatTerbilangWords(rem)
		}
		return res
	case n < 1000000000000:
		res := formatTerbilangWords(n/1000000000) + " Miliar"
		if rem := n % 1000000000; rem > 0 {
			res += " " + formatTerbilangWords(rem)
		}
		return res
	default:
		res := formatTerbilangWords(n/1000000000000) + " Triliun"
		if rem := n % 1000000000000; rem > 0 {
			res += " " + formatTerbilangWords(rem)
		}
		return res
	}
}

func formatTerbilangRupiah(amount float64) string {
	rounded := int64(math.Round(amount))
	if rounded == 0 {
		return "Nol Rupiah"
	}
	words := strings.TrimSpace(formatTerbilangWords(rounded))
	if words == "" {
		return "Nol Rupiah"
	}
	return words + " Rupiah"
}

func resolveInvoicePaymentMethodsSummary(invoice models.Invoice) string {
	if len(invoice.Payments) == 0 {
		return ""
	}
	seen := make(map[string]struct{})
	methods := make([]string, 0, len(invoice.Payments))
	for _, p := range invoice.Payments {
		name := strings.TrimSpace(p.PaymentMethod.Name)
		if name == "" {
			continue
		}
		if _, exists := seen[name]; !exists {
			seen[name] = struct{}{}
			methods = append(methods, name)
		}
	}
	return strings.Join(methods, ", ")
}

// renderInvoiceKwitansiTerbilangPDF menghasilkan kwitansi standar tanpa rincian item dengan teks terbilang (A5 Landscape: 210mm x 148mm)
func renderInvoiceKwitansiTerbilangPDF(invoice models.Invoice, hospitalInfo initialAssessmentHospitalInfo, generatedAt time.Time, totalPaid float64, remaining float64) (*gofpdf.Fpdf, error) {
	// A5 Landscape: lebar 210mm x tinggi 148mm
	pdf := gofpdf.New("L", "mm", "A5", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)

	pdf.SetMargins(6, 6, 6)
	pdf.SetAutoPageBreak(false, 6)
	pdf.SetTitle("Kwitansi Pembayaran", false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.AddPage()

	pageWidth, pageHeight := pdf.GetPageSize() // 210 x 148 mm
	frameX := 6.0
	frameY := 6.0
	frameW := pageWidth - 12.0  // 198 mm
	frameH := pageHeight - 14.0 // 134 mm (sisakan ruang footer di bawah frame)

	innerLeft := frameX + 6.0     // 12 mm
	innerRight := frameX + frameW - 6.0 // 198 mm
	innerWidth := innerRight - innerLeft // 186 mm

	// ── 1. Bingkai Resmi Kwitansi (1 garis tegas bersih, tidak mepet) ──────
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.45)
	pdf.Rect(frameX, frameY, frameW, frameH, "D")

	// ── 2. Header Band (Kop Klinik Kiri + Judul & Nomor Kwitansi Kanan — Hitam Putih Murni)
	headerY := frameY + 1.2
	headerH := 26.0

	// Logo & Identitas Klinik (Sisi Kiri Header)
	hasLogo := hospitalInfo.LogoPath != "" && hospitalInfo.LogoType != ""
	logoMaxH := 16.5
	logoMaxW := 18.5
	logoW, logoH := 0.0, 0.0
	if hasLogo {
		logoW, logoH = measureInitialAssessmentHeaderLogo(hospitalInfo.LogoPath, logoMaxH, logoMaxW)
	}

	kopStartX := innerLeft + 1.0
	if hasLogo && logoW > 0 {
		logoY := headerY + (headerH-logoH)/2
		drawInitialAssessmentHeaderLogo(pdf, hospitalInfo.LogoPath, hospitalInfo.LogoType, kopStartX, logoY, logoMaxH, logoMaxW)
		kopStartX += logoW + 3.5
	}

	kopTextW := 124.0 - (kopStartX - innerLeft)
	if kopTextW < 60.0 {
		kopTextW = 60.0
	}

	addressParts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(sanitizePDFText(hospitalInfo.Address)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(hospitalInfo.City)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	contactParts := make([]string, 0, 3)
	if trimmed := strings.TrimSpace(sanitizePDFText(hospitalInfo.Phone)); trimmed != "" {
		contactParts = append(contactParts, "Telp: "+trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(hospitalInfo.Email)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(hospitalInfo.Website)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}

	kopY := headerY + 4.2
	pdf.SetXY(kopStartX, kopY)
	pdf.SetFont("Arial", "B", 12)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(kopTextW, 5.2, strings.ToUpper(fallbackText(hospitalInfo.Name)), "", 1, "L", false, 0, "")

	pdf.SetFont("Arial", "", 7.5)
	if len(addressParts) > 0 {
		pdf.SetX(kopStartX)
		pdf.MultiCell(kopTextW, 3.6, strings.Join(addressParts, ", "), "", "L", false)
	}
	if len(contactParts) > 0 {
		pdf.SetX(kopStartX)
		pdf.MultiCell(kopTextW, 3.5, strings.Join(contactParts, "  |  "), "", "L", false)
	}

	// Blok Judul KWITANSI + No. Invoice (Sisi Kanan Header)
	rightBlockW := 60.0
	rightBlockX := innerRight - rightBlockW

	pdf.SetXY(rightBlockX, headerY+3.2)
	pdf.SetFont("Arial", "B", 14.5)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(rightBlockW, 6.2, "KWITANSI", "", 1, "R", false, 0, "")

	pdf.SetXY(rightBlockX, headerY+9.6)
	pdf.SetFont("Arial", "B", 7.2)
	pdf.CellFormat(rightBlockW, 3.6, "BUKTI PEMBAYARAN RESMI", "", 1, "R", false, 0, "")

	noBoxW := 52.0
	noBoxH := 6.2
	noBoxX := innerRight - noBoxW
	noBoxY := headerY + 15.2
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(noBoxX, noBoxY, noBoxW, noBoxH, "D")

	pdf.SetXY(noBoxX+1.5, noBoxY)
	pdf.SetFont("Arial", "B", 8)
	pdf.CellFormat(noBoxW-3.0, noBoxH, "No. "+fallbackText(invoice.InvoiceNumber), "", 0, "C", false, 0, "")

	// Garis pembatas bawah kop (1 garis tegas bersih, tidak mepet)
	dividerY := headerY + headerH
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.45)
	pdf.Line(frameX, dividerY, frameX+frameW, dividerY)

	// ── 3. Data Kwitansi ──────────────────────────────────────────────────
	receiptAmount := invoice.TotalAmount
	if strings.EqualFold(strings.TrimSpace(invoice.Status), "sebagian") && totalPaid > 0 {
		receiptAmount = totalPaid
	}
	terbilangText := formatTerbilangRupiah(receiptAmount)

	receivedFrom := fallbackText(invoice.Patient.FullName)

	purposeParts := make([]string, 0, 2)
	poliName := strings.TrimSpace(invoice.Visit.Polyclinic.Name)
	if poliName != "" {
		purposeParts = append(purposeParts, "Biaya pelayanan kesehatan / pemeriksaan di "+poliName)
	} else {
		purposeParts = append(purposeParts, "Biaya pelayanan kesehatan / pemeriksaan medis")
	}
	if strings.EqualFold(strings.TrimSpace(invoice.Status), "sebagian") && remaining > 0 {
		purposeParts = append(purposeParts, fmt.Sprintf("- Pembayaran sebagian dari total %s, sisa tagihan %s", formatCurrency(invoice.TotalAmount), formatCurrency(remaining)))
	}
	purposeText := strings.Join(purposeParts, " ")

	labelW := 36.0
	colonW := 4.0
	valueX := innerLeft + labelW + colonW
	valueW := innerWidth - labelW - colonW

	// ── Row 1: Sudah terima dari ──────────────────────────────────────────
	curY := dividerY + 4.8
	pdf.SetXY(innerLeft, curY)
	pdf.SetFont("Arial", "", 9.5)
	pdf.SetTextColor(0, 0, 0)
	pdf.CellFormat(labelW, 6.2, "Sudah terima dari", "", 0, "L", false, 0, "")
	pdf.CellFormat(colonW, 6.2, ":", "", 0, "C", false, 0, "")

	pdf.SetFont("Arial", "B", 10)
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.CellFormat(valueW, 6.2, " "+sanitizePDFText(receivedFrom), "B", 1, "L", false, 0, "")

	// ── Row 2: Uang sejumlah (Kotak Terbilang Hitam Putih Murni) ──────────
	curY = pdf.GetY() + 3.6
	pdf.SetFont("Arial", "BI", 10)
	terbilangLines := pdf.SplitLines([]byte(sanitizePDFText(terbilangText)), valueW-9.0)
	tLines := len(terbilangLines)
	if tLines < 1 {
		tLines = 1
	}
	terbilangBoxH := float64(tLines)*5.4 + 4.2
	if terbilangBoxH < 11.5 {
		terbilangBoxH = 11.5
	}

	pdf.SetXY(innerLeft, curY)
	pdf.SetFont("Arial", "", 9.5)
	pdf.CellFormat(labelW, terbilangBoxH, "Uang sejumlah", "", 0, "L", false, 0, "")
	pdf.CellFormat(colonW, terbilangBoxH, ":", "", 0, "C", false, 0, "")

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.3)
	pdf.Rect(valueX, curY, valueW, terbilangBoxH, "D")

	textTopOffset := (terbilangBoxH - float64(tLines)*5.4) / 2
	pdf.SetXY(valueX+3.0, curY+textTopOffset)
	pdf.SetFont("Arial", "BI", 10)
	pdf.MultiCell(valueW-6.0, 5.4, sanitizePDFText(terbilangText), "", "L", false)
	pdf.SetY(curY + terbilangBoxH)

	// ── Row 3: Untuk pembayaran (Dengan garis tulis klasik kwitansi) ──────
	curY = pdf.GetY() + 3.8
	pdf.SetXY(innerLeft, curY)
	pdf.SetFont("Arial", "", 9.5)
	pdf.CellFormat(labelW, 5.6, "Untuk pembayaran", "", 0, "L", false, 0, "")
	pdf.CellFormat(colonW, 5.6, ":", "", 0, "C", false, 0, "")

	pdf.SetFont("Arial", "", 9.2)
	purposeLines := pdf.SplitLines([]byte(sanitizePDFText(purposeText)), valueW-2.0)
	pLines := len(purposeLines)
	if pLines < 2 {
		pLines = 2
	}
	purposeLineH := 5.6
	purposeBlockH := float64(pLines) * purposeLineH

	pdf.SetXY(valueX+1.0, curY)
	pdf.MultiCell(valueW-2.0, purposeLineH, sanitizePDFText(purposeText), "", "L", false)

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.2)
	for i := 1; i <= pLines; i++ {
		lineY := curY + float64(i)*purposeLineH
		pdf.Line(valueX, lineY, valueX+valueW, lineY)
	}
	pdf.SetY(curY + purposeBlockH)

	// ── 4. Strip Info Ringkas (Poliklinik & Metode Pembayaran) ───────────
	metaY := pdf.GetY() + 3.8
	if metaY < 79.5 {
		metaY = 79.5
	}
	metaH := 10.5
	colW := innerWidth / 2.0

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Rect(innerLeft, metaY, innerWidth, metaH, "D")
	pdf.Line(innerLeft+colW, metaY, innerLeft+colW, metaY+metaH)

	paymentSummary := resolveInvoicePaymentMethodsSummary(invoice)
	if paymentSummary == "" {
		paymentSummary = "-"
	}

	metaCells := []struct {
		label string
		value string
	}{
		{"POLIKLINIK", fallbackText(invoice.Visit.Polyclinic.Name)},
		{"METODE PEMBAYARAN", paymentSummary},
	}

	for idx, mc := range metaCells {
		cx := innerLeft + float64(idx)*colW + 2.5
		cw := colW - 5.0
		pdf.SetXY(cx, metaY+1.4)
		pdf.SetFont("Arial", "B", 6.5)
		pdf.CellFormat(cw, 3.2, mc.label, "", 1, "L", false, 0, "")

		pdf.SetXY(cx, metaY+5.0)
		pdf.SetFont("Arial", "B", 8.0)
		pdf.CellFormat(cw, 4.2, sanitizePDFSingleLineText(mc.value), "", 0, "L", false, 0, "")
	}

	// ── 5. Bagian Bawah: Nominal Box (Kiri) & TTD Kasir (Kanan)
	bottomY := metaY + metaH + 4.5
	if bottomY < 96.0 {
		bottomY = 96.0
	}

	// Kiri: Kotak Nominal Hitam Putih Bersih (1 garis tegas, tidak mepet)
	nominalBoxW := 82.0
	nominalBoxH := 16.5
	nominalBoxY := bottomY + 1.5

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.45)
	pdf.Rect(innerLeft, nominalBoxY, nominalBoxW, nominalBoxH, "D")

	pdf.SetXY(innerLeft+3.0, nominalBoxY+1.8)
	pdf.SetFont("Arial", "B", 6.5)
	pdf.CellFormat(nominalBoxW-6.0, 3.2, "JUMLAH PEMBAYARAN", "", 1, "L", false, 0, "")

	pdf.SetXY(innerLeft+3.0, nominalBoxY+5.2)
	pdf.SetFont("Arial", "B", 14.5)
	pdf.CellFormat(nominalBoxW-6.0, 9.5, formatCurrency(receiptAmount)+",-", "", 0, "C", false, 0, "")

	// Badge Status Pembayaran Hitam Putih
	statusLabel := resolveInvoiceStatusWatermarkText(invoice.Status)
	badgeY := nominalBoxY + nominalBoxH + 3.0
	badgeText := "STATUS: " + statusLabel
	pdf.SetFont("Arial", "B", 7.8)
	badgeW := pdf.GetStringWidth(badgeText) + 8.0
	if badgeW < 36.0 {
		badgeW = 36.0
	}
	badgeH := 5.6
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.3)
	pdf.Rect(innerLeft, badgeY, badgeW, badgeH, "D")

	pdf.SetXY(innerLeft, badgeY)
	pdf.SetFont("Arial", "B", 7.8)
	pdf.CellFormat(badgeW, badgeH, badgeText, "", 0, "C", false, 0, "")

	// Catatan keabsahan kwitansi
	pdf.SetXY(innerLeft, badgeY+badgeH+2.2)
	pdf.SetFont("Arial", "I", 7.2)
	pdf.CellFormat(95.0, 3.8, "* Kwitansi ini merupakan bukti pembayaran yang sah.", "", 0, "L", false, 0, "")

	// Kanan: Tanggal + Tanda Tangan Petugas Kasir
	sigColW := 66.0
	sigColX := innerRight - sigColW
	dateLabel := formatDateIndonesian(generatedAt)
	if city := strings.TrimSpace(hospitalInfo.City); city != "" {
		dateLabel = city + ", " + dateLabel
	}

	pdf.SetXY(sigColX, bottomY)
	pdf.SetFont("Arial", "", 8.5)
	pdf.CellFormat(sigColW, 4.5, sanitizePDFText(dateLabel), "", 1, "C", false, 0, "")

	pdf.SetXY(sigColX, bottomY+4.8)
	pdf.CellFormat(sigColW, 4.5, "Petugas Kasir,", "", 1, "C", false, 0, "")

	// Garis tanda tangan + Nama Kasir
	sigNameY := bottomY + 25.5
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.25)
	pdf.Line(sigColX+6.0, sigNameY-0.8, sigColX+sigColW-6.0, sigNameY-0.8)

	pdf.SetXY(sigColX, sigNameY)
	pdf.SetFont("Arial", "B", 8.8)
	pdf.CellFormat(sigColW, 4.8, "( "+sanitizePDFText(resolveInvoiceCashierSignatureName(invoice))+" )", "", 1, "C", false, 0, "")

	// ── 6. Footer di luar frame bawah ─────────────────────────────────────
	footerY := frameY + frameH + 1.5
	pdf.SetFont("Arial", "", 6.8)
	pdf.SetTextColor(70, 70, 70)
	pdf.SetXY(frameX, footerY)
	pdf.CellFormat(frameW, 4.0, "Dicetak: "+formatDateTimeIndonesian(generatedAt)+" | SIMKLINIK", "", 0, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)

	return pdf, nil
}


