package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func generateStockRequestNumber() string {
	now := time.Now()
	var count int64
	database.DB.Model(&models.StockRequest{}).Unscoped().
		Where("DATE(created_at) = ?", now.Format("2006-01-02")).Count(&count)
	return fmt.Sprintf("REQ-%s-%04d", now.Format("20060102"), count+1)
}

func GetStockRequests(c *gin.Context) {
	var requests []models.StockRequest
	query := database.DB.
		Preload("FromRoom").
		Preload("ToRoom").
		Preload("Requester").
		Preload("Approver").
		Order("created_at DESC")

	if status := strings.TrimSpace(c.Query("status")); status != "" {
		query = query.Where("status = ?", status)
	}
	if fromRoomID := strings.TrimSpace(c.Query("from_room_id")); fromRoomID != "" {
		query = query.Where("from_room_id = ?", fromRoomID)
	}
	if toRoomID := strings.TrimSpace(c.Query("to_room_id")); toRoomID != "" {
		query = query.Where("to_room_id = ?", toRoomID)
	}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		query = query.Where("request_number ILIKE ? OR notes ILIKE ?", "%"+q+"%", "%"+q+"%")
	}

	var total int64
	query.Model(&models.StockRequest{}).Count(&total)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "15"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 15
	}
	offset := (page - 1) * perPage

	if err := query.Offset(offset).Limit(perPage).Find(&requests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     requests,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func GetStockRequest(c *gin.Context) {
	id := c.Param("id")
	var req models.StockRequest
	if err := database.DB.
		Preload("FromRoom").
		Preload("ToRoom").
		Preload("Requester").
		Preload("Approver").
		Preload("Items.Medicine.Unit").
		Preload("Items.Medicine.LargeUnit").
		Preload("Items.Medicine.Category").
		First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Permintaan stok tidak ditemukan"})
		return
	}

	// Include current stock in FromRoom & ToRoom for each item
	type itemRoomStockInfo struct {
		MedicineID    uint `json:"medicine_id"`
		FromRoomStock int  `json:"from_room_stock"`
		ToRoomStock   int  `json:"to_room_stock"`
	}
	roomStocks := make([]itemRoomStockInfo, 0, len(req.Items))
	for _, item := range req.Items {
		roomStocks = append(roomStocks, itemRoomStockInfo{
			MedicineID:    item.MedicineID,
			FromRoomStock: getRoomMedicineStockQty(database.DB, item.MedicineID, req.FromRoomID),
			ToRoomStock:   getRoomMedicineStockQty(database.DB, item.MedicineID, req.ToRoomID),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"data":        req,
		"room_stocks": roomStocks,
	})
}

type StockRequestItemInput struct {
	MedicineID        uint   `json:"medicine_id" binding:"required"`
	RequestedQuantity int    `json:"requested_quantity" binding:"required,min=1"`
	UnitMode          string `json:"unit_mode"`
	Notes             string `json:"notes"`
}

type CreateStockRequestPayload struct {
	FromRoomID  uint                    `json:"from_room_id"`
	ToRoomID    uint                    `json:"to_room_id"`
	RequestDate string                  `json:"request_date"`
	Notes       string                  `json:"notes"`
	Items       []StockRequestItemInput `json:"items" binding:"required,min=1"`
}

func CreateStockRequest(c *gin.Context) {
	var payload CreateStockRequestPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	fromRoomID := payload.FromRoomID
	if fromRoomID == 0 {
		depo, err := getDefaultDepoRoom(database.DB)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		fromRoomID = depo.ID
	}

	toRoomID := payload.ToRoomID
	if toRoomID == 0 {
		apotek, err := getDefaultApotekRoom(database.DB)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		toRoomID = apotek.ID
	}

	if fromRoomID == toRoomID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ruangan asal dan ruangan tujuan tidak boleh sama"})
		return
	}

	requestDate := time.Now()
	if payload.RequestDate != "" {
		if t, err := time.ParseInLocation("2006-01-02", payload.RequestDate, time.Local); err == nil {
			requestDate = t
		}
	}

	userID, _ := c.Get("user_id")
	req := models.StockRequest{
		RequestNumber: generateStockRequestNumber(),
		FromRoomID:    fromRoomID,
		ToRoomID:      toRoomID,
		RequestDate:   requestDate,
		Status:        "pending",
		Notes:         strings.TrimSpace(payload.Notes),
		RequestedBy:   userID.(uint),
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&req).Error; err != nil {
			return err
		}

		for _, item := range payload.Items {
			unitMode, factor := resolveItemUnitConversion(item.MedicineID, item.UnitMode)
			reqItem := models.StockRequestItem{
				StockRequestID:    req.ID,
				MedicineID:        item.MedicineID,
				RequestedQuantity: item.RequestedQuantity,
				UnitMode:          unitMode,
				ConversionFactor:  factor,
				Notes:             strings.TrimSpace(item.Notes),
			}
			if err := tx.Create(&reqItem).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.
		Preload("FromRoom").
		Preload("ToRoom").
		Preload("Requester").
		Preload("Items.Medicine.Unit").
		First(&req, req.ID)

	c.JSON(http.StatusCreated, gin.H{"data": req})
}

type ApproveStockRequestItemInput struct {
	ItemID           uint `json:"item_id" binding:"required"`
	ApprovedQuantity int  `json:"approved_quantity" binding:"min=0"`
}

type ApproveStockRequestPayload struct {
	Items []ApproveStockRequestItemInput `json:"items"`
	Notes string                         `json:"notes"`
}

func ApproveStockRequest(c *gin.Context) {
	id := c.Param("id")
	var payload ApproveStockRequestPayload
	_ = c.ShouldBindJSON(&payload)

	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)

	var req models.StockRequest
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("FromRoom").
			Preload("ToRoom").
			Preload("Items").
			First(&req, id).Error; err != nil {
			return fmt.Errorf("permintaan stok tidak ditemukan")
		}

		if req.Status != "pending" {
			return fmt.Errorf("permintaan stok berstatus %s dan tidak dapat disetujui", req.Status)
		}

		overrideQty := make(map[uint]int, len(payload.Items))
		for _, item := range payload.Items {
			overrideQty[item.ItemID] = item.ApprovedQuantity
		}

		totalApproved := 0
		for _, item := range req.Items {
			qty := item.RequestedQuantity
			if q, ok := overrideQty[item.ID]; ok {
				qty = q
			}
			if qty < 0 {
				return fmt.Errorf("jumlah disetujui tidak valid")
			}
			if qty == 0 {
				tx.Model(&item).Update("approved_quantity", 0)
				continue
			}

			totalApproved += qty
			multiplier := 1
			if item.UnitMode == "large" && item.ConversionFactor > 1 {
				multiplier = item.ConversionFactor
			}
			smallQty := qty * multiplier
			outNotes := fmt.Sprintf("Mutasi keluar ke %s (%s)", req.ToRoom.Name, req.RequestNumber)
			inNotes := fmt.Sprintf("Mutasi masuk dari %s (%s)", req.FromRoom.Name, req.RequestNumber)
			if multiplier > 1 {
				outNotes = fmt.Sprintf("Mutasi keluar ke %s (%s: %d x %d = %d satuan kecil)", req.ToRoom.Name, req.RequestNumber, qty, multiplier, smallQty)
				inNotes = fmt.Sprintf("Mutasi masuk dari %s (%s: %d x %d = %d satuan kecil)", req.FromRoom.Name, req.RequestNumber, qty, multiplier, smallQty)
			}

			if _, err := adjustRoomStockTx(
				tx,
				item.MedicineID,
				req.FromRoomID,
				-smallQty,
				"transfer_out",
				"stock_request",
				req.ID,
				"",
				nil,
				outNotes,
				userID,
			); err != nil {
				return err
			}

			if _, err := adjustRoomStockTx(
				tx,
				item.MedicineID,
				req.ToRoomID,
				smallQty,
				"transfer_in",
				"stock_request",
				req.ID,
				"",
				nil,
				inNotes,
				userID,
			); err != nil {
				return err
			}

			if err := tx.Model(&item).Update("approved_quantity", qty).Error; err != nil {
				return err
			}
		}

		if totalApproved == 0 {
			return fmt.Errorf("minimal satu item harus disetujui dengan jumlah lebih dari 0")
		}

		now := time.Now()
		updates := map[string]interface{}{
			"status":      "approved",
			"approved_by": userID,
			"approved_at": &now,
		}
		if strings.TrimSpace(payload.Notes) != "" {
			updates["notes"] = strings.TrimSpace(payload.Notes)
		}
		return tx.Model(&req).Updates(updates).Error
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	database.DB.
		Preload("FromRoom").
		Preload("ToRoom").
		Preload("Requester").
		Preload("Approver").
		Preload("Items.Medicine.Unit").
		First(&req, req.ID)

	c.JSON(http.StatusOK, gin.H{"data": req, "message": "Permintaan stok disetujui dan stok berhasil dipindahkan"})
}

type RejectStockRequestPayload struct {
	Reason string `json:"reason"`
}

func RejectStockRequest(c *gin.Context) {
	id := c.Param("id")
	var payload RejectStockRequestPayload
	_ = c.ShouldBindJSON(&payload)

	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)

	var req models.StockRequest
	if err := database.DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Permintaan stok tidak ditemukan"})
		return
	}
	if req.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya permintaan berstatus pending yang dapat ditolak"})
		return
	}

	now := time.Now()
	req.Status = "rejected"
	req.RejectionReason = strings.TrimSpace(payload.Reason)
	req.ApprovedBy = &userID
	req.ApprovedAt = &now

	if err := database.DB.Save(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.
		Preload("FromRoom").
		Preload("ToRoom").
		Preload("Requester").
		Preload("Approver").
		Preload("Items.Medicine.Unit").
		First(&req, req.ID)

	c.JSON(http.StatusOK, gin.H{"data": req, "message": "Permintaan stok ditolak"})
}

func CancelStockRequest(c *gin.Context) {
	id := c.Param("id")
	var req models.StockRequest
	if err := database.DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Permintaan stok tidak ditemukan"})
		return
	}
	if req.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya permintaan berstatus pending yang dapat dibatalkan"})
		return
	}

	req.Status = "cancelled"
	if err := database.DB.Save(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": req, "message": "Permintaan stok dibatalkan"})
}
