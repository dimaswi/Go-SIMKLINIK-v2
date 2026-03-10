package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
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
	query := database.DB.Preload("Supplier").Preload("Creator").Order("created_at DESC")

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
		Preload("Creator").
		Preload("Items.Medicine.Unit").
		Preload("Items.Medicine.Category").
		First(&order, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Purchase order tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": order})
}

type POItemInput struct {
	MedicineID uint    `json:"medicine_id" binding:"required"`
	Quantity   int     `json:"quantity" binding:"required,min=1"`
	UnitPrice  float64 `json:"unit_price"`
}

type CreatePurchaseOrderRequest struct {
	SupplierID uint          `json:"supplier_id" binding:"required"`
	OrderDate  string        `json:"order_date"`
	Status     string        `json:"status"`
	Notes      string        `json:"notes"`
	Items      []POItemInput `json:"items" binding:"required,min=1"`
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
		if t, err := time.Parse("2006-01-02", req.OrderDate); err == nil {
			orderDate = t
		}
	}

	var totalAmount float64
	for _, item := range req.Items {
		totalAmount += float64(item.Quantity) * item.UnitPrice
	}

	order := models.PurchaseOrder{
		PONumber:    generatePONumber(),
		SupplierID:  req.SupplierID,
		OrderDate:   orderDate,
		Status:      status,
		TotalAmount: totalAmount,
		Notes:       req.Notes,
		CreatedBy:   userID.(uint),
	}

	if err := database.DB.Create(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, item := range req.Items {
		poItem := models.PurchaseOrderItem{
			PurchaseOrderID: order.ID,
			MedicineID:      item.MedicineID,
			Quantity:        item.Quantity,
			UnitPrice:       item.UnitPrice,
			TotalPrice:      float64(item.Quantity) * item.UnitPrice,
		}
		database.DB.Create(&poItem)
	}

	database.DB.Preload("Supplier").Preload("Creator").Preload("Items.Medicine.Unit").First(&order, order.ID)
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
		if t, err := time.Parse("2006-01-02", req.OrderDate); err == nil {
			order.OrderDate = t
		}
	}
	if req.Status == "ordered" {
		order.Status = "ordered"
	}

	var totalAmount float64
	for _, item := range req.Items {
		totalAmount += float64(item.Quantity) * item.UnitPrice
	}

	order.SupplierID = req.SupplierID
	order.Notes = req.Notes
	order.TotalAmount = totalAmount

	if err := database.DB.Save(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Replace items
	database.DB.Where("purchase_order_id = ?", order.ID).Delete(&models.PurchaseOrderItem{})
	for _, item := range req.Items {
		poItem := models.PurchaseOrderItem{
			PurchaseOrderID: order.ID,
			MedicineID:      item.MedicineID,
			Quantity:        item.Quantity,
			UnitPrice:       item.UnitPrice,
			TotalPrice:      float64(item.Quantity) * item.UnitPrice,
		}
		database.DB.Create(&poItem)
	}

	database.DB.Preload("Supplier").Preload("Creator").Preload("Items.Medicine.Unit").First(&order, order.ID)
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

	for _, ri := range req.Items {
		var item models.PurchaseOrderItem
		if err := database.DB.Where("id = ? AND purchase_order_id = ?", ri.ItemID, order.ID).First(&item).Error; err != nil {
			continue
		}

		var medicine models.Medicine
		if err := database.DB.First(&medicine, item.MedicineID).Error; err != nil {
			continue
		}

		prevStock := medicine.CurrentStock
		medicine.CurrentStock += ri.ReceivedQuantity
		database.DB.Save(&medicine)

		item.ReceivedQuantity += ri.ReceivedQuantity
		if ri.BatchNumber != "" {
			item.BatchNumber = ri.BatchNumber
		}
		var expiryDate *time.Time
		if ri.ExpiryDate != "" {
			if t, err := time.Parse("2006-01-02", ri.ExpiryDate); err == nil {
				item.ExpiryDate = &t
				expiryDate = &t
			}
		}
		database.DB.Save(&item)

		movement := models.StockMovement{
			MedicineID:    item.MedicineID,
			Type:          "in",
			Quantity:      ri.ReceivedQuantity,
			PreviousStock: prevStock,
			NewStock:      medicine.CurrentStock,
			ReferenceType: "purchase_order",
			ReferenceID:   order.ID,
			BatchNumber:   ri.BatchNumber,
			ExpiryDate:    expiryDate,
			Notes:         fmt.Sprintf("Penerimaan barang dari PO %s", order.PONumber),
			CreatedBy:     userID.(uint),
		}
		database.DB.Create(&movement)
	}

	// Reload items and recalculate status
	database.DB.Where("purchase_order_id = ?", order.ID).Find(&order.Items)
	allReceived := true
	for _, item := range order.Items {
		if item.ReceivedQuantity < item.Quantity {
			allReceived = false
			break
		}
	}

	now := time.Now()
	order.ReceivedDate = &now
	if allReceived {
		order.Status = "received"
	} else {
		order.Status = "partial"
	}
	if req.Notes != "" {
		order.Notes = req.Notes
	}
	database.DB.Save(&order)

	database.DB.Preload("Supplier").Preload("Creator").Preload("Items.Medicine.Unit").First(&order, order.ID)
	c.JSON(http.StatusOK, gin.H{"data": order})
}

func GetStockMovements(c *gin.Context) {
	var movements []models.StockMovement
	query := database.DB.Preload("Medicine").Preload("Creator").Order("created_at DESC")

	if medicineID := c.Query("medicine_id"); medicineID != "" {
		query = query.Where("medicine_id = ?", medicineID)
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
