package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func generatePONumber() string {
	now := time.Now()
	var count int64
	database.DB.Model(&models.PurchaseOrder{}).Unscoped().
		Where("DATE(created_at) = ?", now.Format("2006-01-02")).Count(&count)
	return fmt.Sprintf("PO-%s-%04d", now.Format("20060102"), count+1)
}

func GetPurchaseOrders(c *gin.Context) {
	var orders []models.PurchaseOrder
	query := database.DB.Preload("Supplier").Preload("DestinationRoom").Preload("Creator").Order("created_at DESC")

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if supplierID := c.Query("supplier_id"); supplierID != "" {
		query = query.Where("supplier_id = ?", supplierID)
	}
	if q := c.Query("q"); q != "" {
		query = query.Where("po_number ILIKE ?", "%"+q+"%")
	}

	var total int64
	query.Model(&models.PurchaseOrder{}).Count(&total)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "15"))
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * perPage

	if err := query.Offset(offset).Limit(perPage).Find(&orders).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     orders,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func GetPurchaseOrder(c *gin.Context) {
	id := c.Param("id")

	var order models.PurchaseOrder
	if err := database.DB.
		Preload("Supplier").
		Preload("DestinationRoom").
		Preload("Creator").
		Preload("Items.Medicine.Unit").
		Preload("Items.Medicine.LargeUnit").
		Preload("Items.Medicine.Category").
		Preload("Payments", func(db *gorm.DB) *gorm.DB {
			return db.Order("payment_date DESC, created_at DESC")
		}).
		Preload("Payments.PaymentMethod").
		Preload("Payments.Creator").
		First(&order, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Purchase order tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": order})
}

type POItemInput struct {
	MedicineID   uint    `json:"medicine_id" binding:"required"`
	Quantity     int     `json:"quantity" binding:"required,min=1"`
	UnitMode     string  `json:"unit_mode"`
	UnitPrice    float64 `json:"unit_price"`
	SellingPrice float64 `json:"selling_price"`
}

func resolveItemUnitConversion(medicineID uint, unitMode string) (string, int) {
	if unitMode != "large" {
		return "small", 1
	}
	var med models.Medicine
	if err := database.DB.Select("id, large_unit_id, conversion_factor").First(&med, medicineID).Error; err != nil {
		return "small", 1
	}
	if med.LargeUnitID == nil || *med.LargeUnitID == 0 || med.ConversionFactor <= 1 {
		return "small", 1
	}
	return "large", med.ConversionFactor
}

type CreatePurchaseOrderRequest struct {
	SupplierID        uint          `json:"supplier_id" binding:"required"`
	DestinationRoomID *uint         `json:"destination_room_id"`
	OrderDate         string        `json:"order_date"`
	Status            string        `json:"status"`
	DiscountPercent   float64       `json:"discount_percent"`
	DiscountAmount    float64       `json:"discount_amount"`
	IncludePPN        *bool         `json:"include_ppn"`
	PPNPercent        *float64      `json:"ppn_percent"`
	Notes             string        `json:"notes"`
	Items             []POItemInput `json:"items" binding:"required,min=1"`
}

func calculatePOTotals(items []POItemInput, discountPercent float64, discountAmount float64, includePPNPtr *bool, ppnPercentPtr *float64) (subtotal, calcDiscountPercent, calcDiscountAmount float64, includePPN bool, ppnPercent, ppnAmount, totalAmount float64) {
	for _, item := range items {
		_, factor := resolveItemUnitConversion(item.MedicineID, item.UnitMode)
		smallQty := item.Quantity * factor
		subtotal += float64(smallQty) * item.UnitPrice
	}
	if discountPercent > 0 {
		if discountPercent > 100 {
			discountPercent = 100
		}
		calcDiscountPercent = discountPercent
		calcDiscountAmount = subtotal * (discountPercent / 100)
	} else if discountAmount > 0 {
		if discountAmount > subtotal {
			discountAmount = subtotal
		}
		calcDiscountAmount = discountAmount
	}
	afterDiscount := subtotal - calcDiscountAmount
	if afterDiscount < 0 {
		afterDiscount = 0
	}

	includePPN = true
	if includePPNPtr != nil {
		includePPN = *includePPNPtr
	}
	ppnPercent = 11
	if ppnPercentPtr != nil && *ppnPercentPtr >= 0 {
		ppnPercent = *ppnPercentPtr
	}
	if includePPN {
		ppnAmount = afterDiscount * (ppnPercent / 100)
	}
	totalAmount = afterDiscount + ppnAmount
	return
}

func CreatePurchaseOrder(c *gin.Context) {
	var req CreatePurchaseOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	status := "draft"
	if req.Status == "ordered" {
		status = "ordered"
	}

	orderDate := time.Now()
	if req.OrderDate != "" {
		if t, err := time.ParseInLocation("2006-01-02", req.OrderDate, time.Local); err == nil {
			orderDate = t
		}
	}

	subtotal, discountPercent, discountAmount, includePPN, ppnPercent, ppnAmount, totalAmount := calculatePOTotals(
		req.Items, req.DiscountPercent, req.DiscountAmount, req.IncludePPN, req.PPNPercent,
	)

	var destRoomID *uint
	if req.DestinationRoomID != nil && *req.DestinationRoomID > 0 {
		destRoomID = req.DestinationRoomID
	} else if depo, err := getDefaultDepoRoom(database.DB); err == nil {
		destRoomID = &depo.ID
	}

	order := models.PurchaseOrder{
		PONumber:          generatePONumber(),
		SupplierID:        req.SupplierID,
		DestinationRoomID: destRoomID,
		OrderDate:         orderDate,
		Status:            status,
		Subtotal:          subtotal,
		DiscountPercent:   discountPercent,
		DiscountAmount:    discountAmount,
		IncludePPN:        includePPN,
		PPNPercent:        ppnPercent,
		PPNAmount:         ppnAmount,
		TotalAmount:       totalAmount,
		Notes:             req.Notes,
		CreatedBy:         userID.(uint),
	}

	if err := database.DB.Create(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, item := range req.Items {
		unitMode, factor := resolveItemUnitConversion(item.MedicineID, item.UnitMode)
		smallQty := item.Quantity * factor
		poItem := models.PurchaseOrderItem{
			PurchaseOrderID:  order.ID,
			MedicineID:       item.MedicineID,
			Quantity:         item.Quantity,
			UnitMode:         unitMode,
			ConversionFactor: factor,
			UnitPrice:        item.UnitPrice,
			SellingPrice:     item.SellingPrice,
			TotalPrice:       float64(smallQty) * item.UnitPrice,
		}
		database.DB.Create(&poItem)
	}

	database.DB.Preload("Supplier").Preload("DestinationRoom").Preload("Creator").Preload("Items.Medicine.Unit").Preload("Items.Medicine.LargeUnit").First(&order, order.ID)
	c.JSON(http.StatusCreated, gin.H{"data": order})
}

func UpdatePurchaseOrder(c *gin.Context) {
	id := c.Param("id")

	var order models.PurchaseOrder
	if err := database.DB.First(&order, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Purchase order tidak ditemukan"})
		return
	}
	if order.Status != "draft" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya purchase order berstatus draft yang bisa diedit"})
		return
	}

	var req CreatePurchaseOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.OrderDate != "" {
		if t, err := time.ParseInLocation("2006-01-02", req.OrderDate, time.Local); err == nil {
			order.OrderDate = t
		}
	}
	if req.Status == "ordered" {
		order.Status = "ordered"
	}

	subtotal, discountPercent, discountAmount, includePPN, ppnPercent, ppnAmount, totalAmount := calculatePOTotals(
		req.Items, req.DiscountPercent, req.DiscountAmount, req.IncludePPN, req.PPNPercent,
	)

	if req.DestinationRoomID != nil && *req.DestinationRoomID > 0 {
		order.DestinationRoomID = req.DestinationRoomID
	}
	order.SupplierID = req.SupplierID
	order.Notes = req.Notes
	order.Subtotal = subtotal
	order.DiscountPercent = discountPercent
	order.DiscountAmount = discountAmount
	order.IncludePPN = includePPN
	order.PPNPercent = ppnPercent
	order.PPNAmount = ppnAmount
	order.TotalAmount = totalAmount

	if err := database.DB.Save(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Replace items
	database.DB.Where("purchase_order_id = ?", order.ID).Delete(&models.PurchaseOrderItem{})
	for _, item := range req.Items {
		unitMode, factor := resolveItemUnitConversion(item.MedicineID, item.UnitMode)
		smallQty := item.Quantity * factor
		poItem := models.PurchaseOrderItem{
			PurchaseOrderID:  order.ID,
			MedicineID:       item.MedicineID,
			Quantity:         item.Quantity,
			UnitMode:         unitMode,
			ConversionFactor: factor,
			UnitPrice:        item.UnitPrice,
			SellingPrice:     item.SellingPrice,
			TotalPrice:       float64(smallQty) * item.UnitPrice,
		}
		database.DB.Create(&poItem)
	}

	database.DB.Preload("Supplier").Preload("DestinationRoom").Preload("Creator").Preload("Items.Medicine.Unit").Preload("Items.Medicine.LargeUnit").First(&order, order.ID)
	c.JSON(http.StatusOK, gin.H{"data": order})
}

func DeletePurchaseOrder(c *gin.Context) {
	id := c.Param("id")

	var order models.PurchaseOrder
	if err := database.DB.First(&order, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Purchase order tidak ditemukan"})
		return
	}
	if order.Status != "draft" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya purchase order berstatus draft yang bisa dihapus"})
		return
	}

	database.DB.Where("purchase_order_id = ?", order.ID).Delete(&models.PurchaseOrderItem{})
	database.DB.Delete(&order)
	c.JSON(http.StatusOK, gin.H{"message": "Purchase order berhasil dihapus"})
}

type ReceiveItemInput struct {
	ItemID           uint   `json:"item_id" binding:"required"`
	ReceivedQuantity int    `json:"received_quantity" binding:"required,min=1"`
	BatchNumber      string `json:"batch_number"`
	ExpiryDate       string `json:"expiry_date"`
}

type ReceivePurchaseOrderRequest struct {
	Items []ReceiveItemInput `json:"items" binding:"required,min=1"`
	Notes string             `json:"notes"`
}

func ReceivePurchaseOrder(c *gin.Context) {
	id := c.Param("id")

	var order models.PurchaseOrder
	if err := database.DB.Preload("Items").First(&order, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Purchase order tidak ditemukan"})
		return
	}
	if order.Status == "received" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Purchase order sudah selesai diterima"})
		return
	}
	if order.Status == "draft" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Purchase order harus berstatus ordered sebelum bisa diterima"})
		return
	}

	var req ReceivePurchaseOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	var targetRoomID uint
	if order.DestinationRoomID != nil && *order.DestinationRoomID > 0 {
		targetRoomID = *order.DestinationRoomID
	} else {
		depo, err := getDefaultDepoRoom(database.DB)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		targetRoomID = depo.ID
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		for _, ri := range req.Items {
			var item models.PurchaseOrderItem
			if err := tx.Where("id = ? AND purchase_order_id = ?", ri.ItemID, order.ID).First(&item).Error; err != nil {
				continue
			}

			remaining := item.Quantity - item.ReceivedQuantity
			if remaining <= 0 || ri.ReceivedQuantity <= 0 {
				continue
			}
			receiveQty := ri.ReceivedQuantity
			if receiveQty > remaining {
				receiveQty = remaining
			}

			if ri.BatchNumber != "" {
				item.BatchNumber = ri.BatchNumber
			}
			var expiryDate *time.Time
			if ri.ExpiryDate != "" {
				if t, err := time.ParseInLocation("2006-01-02", ri.ExpiryDate, time.Local); err == nil {
					item.ExpiryDate = &t
					expiryDate = &t
				}
			}
			item.ReceivedQuantity += receiveQty
			if err := tx.Save(&item).Error; err != nil {
				return err
			}

			multiplier := 1
			if item.UnitMode == "large" && item.ConversionFactor > 1 {
				multiplier = item.ConversionFactor
			}
			smallQty := receiveQty * multiplier
			notes := fmt.Sprintf("Penerimaan barang dari PO %s", order.PONumber)
			if multiplier > 1 {
				notes = fmt.Sprintf("Penerimaan barang dari PO %s (%d x %d = %d satuan kecil)", order.PONumber, receiveQty, multiplier, smallQty)
			}

			if _, err := adjustRoomStockTx(
				tx,
				item.MedicineID,
				targetRoomID,
				smallQty,
				"in",
				"purchase_order",
				order.ID,
				ri.BatchNumber,
				expiryDate,
				notes,
				userID.(uint),
			); err != nil {
				return err
			}

			priceUpdates := map[string]interface{}{}
			if item.UnitPrice > 0 {
				priceUpdates["purchase_price"] = item.UnitPrice
			}
			if item.SellingPrice > 0 {
				priceUpdates["selling_price"] = item.SellingPrice
			}
			if len(priceUpdates) > 0 {
				if err := tx.Model(&models.Medicine{}).Where("id = ?", item.MedicineID).Updates(priceUpdates).Error; err != nil {
					return err
				}
			}
		}

		// Reload items and recalculate status
		tx.Where("purchase_order_id = ?", order.ID).Find(&order.Items)
		allReceived := true
		for _, item := range order.Items {
			if item.ReceivedQuantity < item.Quantity {
				allReceived = false
				break
			}
		}

		now := time.Now()
		order.ReceivedDate = &now
		if order.DestinationRoomID == nil {
			order.DestinationRoomID = &targetRoomID
		}
		if allReceived {
			order.Status = "received"
		} else {
			order.Status = "partial"
		}
		if req.Notes != "" {
			order.Notes = req.Notes
		}
		return tx.Save(&order).Error
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Supplier").Preload("DestinationRoom").Preload("Creator").Preload("Items.Medicine.Unit").First(&order, order.ID)
	c.JSON(http.StatusOK, gin.H{"data": order})
}

func GetStockMovements(c *gin.Context) {
	var movements []models.StockMovement
	query := database.DB.Preload("Medicine").Preload("Room").Preload("Creator").Order("created_at DESC")

	if medicineID := c.Query("medicine_id"); medicineID != "" {
		query = query.Where("medicine_id = ?", medicineID)
	}
	if roomID := c.Query("room_id"); roomID != "" {
		query = query.Where("room_id = ?", roomID)
	}
	if movType := c.Query("type"); movType != "" {
		query = query.Where("type = ?", movType)
	}

	var total int64
	query.Model(&models.StockMovement{}).Count(&total)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * perPage

	if err := query.Offset(offset).Limit(perPage).Find(&movements).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     movements,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func generatePOPaymentNumber() string {
	now := time.Now()
	var count int64
	database.DB.Model(&models.PurchaseOrderPayment{}).Unscoped().
		Where("DATE(created_at) = ?", now.Format("2006-01-02")).Count(&count)
	return fmt.Sprintf("PAYPO-%s-%04d", now.Format("20060102"), count+1)
}

type RecordPOPaymentRequest struct {
	PaymentMethodID *uint   `json:"payment_method_id"`
	PaymentDate     string  `json:"payment_date"`
	Amount          float64 `json:"amount" binding:"required,gt=0"`
	ReferenceNumber string  `json:"reference_number"`
	Notes           string  `json:"notes"`
}

func RecordPurchaseOrderPayment(c *gin.Context) {
	id := c.Param("id")
	var req RecordPOPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)

	paymentDate := time.Now()
	if req.PaymentDate != "" {
		if t, err := time.ParseInLocation("2006-01-02", req.PaymentDate, time.Local); err == nil {
			paymentDate = t
		}
	}

	var order models.PurchaseOrder
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, id).Error; err != nil {
			return fmt.Errorf("purchase order tidak ditemukan")
		}
		if order.Status == "draft" {
			return fmt.Errorf("purchase order berstatus draft belum dapat dibayar")
		}
		remaining := order.TotalAmount - order.PaidAmount
		if remaining <= 0.01 {
			return fmt.Errorf("purchase order ini sudah lunas")
		}
		if req.Amount > remaining+0.01 {
			return fmt.Errorf("nominal pembayaran melebihi sisa tagihan (Rp %.0f)", remaining)
		}

		payment := models.PurchaseOrderPayment{
			PurchaseOrderID: order.ID,
			PaymentNumber:   generatePOPaymentNumber(),
			PaymentDate:     paymentDate,
			PaymentMethodID: req.PaymentMethodID,
			Amount:          req.Amount,
			ReferenceNumber: req.ReferenceNumber,
			Notes:           req.Notes,
			CreatedBy:       userID,
		}
		if err := tx.Create(&payment).Error; err != nil {
			return err
		}

		order.PaidAmount += req.Amount
		if order.PaidAmount >= order.TotalAmount-0.01 {
			order.PaidAmount = order.TotalAmount
			order.PaymentStatus = "paid"
		} else {
			order.PaymentStatus = "partial"
		}
		return tx.Model(&order).Updates(map[string]interface{}{
			"paid_amount":    order.PaidAmount,
			"payment_status": order.PaymentStatus,
		}).Error
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	database.DB.
		Preload("Supplier").
		Preload("DestinationRoom").
		Preload("Creator").
		Preload("Items.Medicine.Unit").
		Preload("Items.Medicine.LargeUnit").
		Preload("Payments.PaymentMethod").
		Preload("Payments.Creator").
		First(&order, order.ID)

	c.JSON(http.StatusOK, gin.H{"data": order, "message": "Pembayaran PO berhasil dicatat"})
}
