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

func getDefaultDepoRoom(tx *gorm.DB) (models.Polyclinic, error) {
	var room models.Polyclinic
	if err := tx.Where("is_default_depo = ?", true).First(&room).Error; err == nil {
		return room, nil
	}
	if err := tx.Where("room_type = ? AND is_active = ?", "depo", true).Order("id ASC").First(&room).Error; err != nil {
		return room, fmt.Errorf("ruangan Depo Farmasi belum tersedia")
	}
	return room, nil
}

func getDefaultApotekRoom(tx *gorm.DB) (models.Polyclinic, error) {
	var room models.Polyclinic
	if err := tx.Where("is_default_apotek = ?", true).First(&room).Error; err == nil {
		return room, nil
	}
	if err := tx.Where("room_type = ? AND is_active = ?", "apotek", true).Order("id ASC").First(&room).Error; err != nil {
		return room, fmt.Errorf("ruangan Apotek belum tersedia")
	}
	return room, nil
}

func getRoomMedicineStockQty(tx *gorm.DB, medicineID uint, roomID uint) int {
	var stock models.MedicineRoomStock
	if err := tx.Where("medicine_id = ? AND room_id = ?", medicineID, roomID).First(&stock).Error; err != nil {
		return 0
	}
	return stock.Quantity
}

func recalculateMedicineTotalStockTx(tx *gorm.DB, medicineID uint) (int, error) {
	var total int64
	if err := tx.Model(&models.MedicineRoomStock{}).
		Where("medicine_id = ?", medicineID).
		Select("COALESCE(SUM(quantity), 0)").
		Scan(&total).Error; err != nil {
		return 0, err
	}
	if err := tx.Model(&models.Medicine{}).
		Where("id = ?", medicineID).
		Update("current_stock", int(total)).Error; err != nil {
		return 0, err
	}
	return int(total), nil
}

func adjustRoomStockTx(
	tx *gorm.DB,
	medicineID uint,
	roomID uint,
	delta int,
	movementType string,
	refType string,
	refID uint,
	batchNumber string,
	expiryDate *time.Time,
	notes string,
	userID uint,
) (models.MedicineRoomStock, error) {
	var medicine models.Medicine
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&medicine, medicineID).Error; err != nil {
		return models.MedicineRoomStock{}, fmt.Errorf("obat tidak ditemukan")
	}

	var room models.Polyclinic
	if err := tx.First(&room, roomID).Error; err != nil {
		return models.MedicineRoomStock{}, fmt.Errorf("ruangan tidak ditemukan")
	}

	var roomStock models.MedicineRoomStock
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("medicine_id = ? AND room_id = ?", medicineID, roomID).
		First(&roomStock).Error
	if err != nil {
		if err != gorm.ErrRecordNotFound {
			return roomStock, err
		}
		roomStock = models.MedicineRoomStock{
			MedicineID: medicineID,
			RoomID:     roomID,
			Quantity:   0,
			MinStock:   medicine.MinStock,
		}
		if createErr := tx.Create(&roomStock).Error; createErr != nil {
			return roomStock, createErr
		}
	}

	prevQty := roomStock.Quantity
	newQty := prevQty + delta
	if newQty < 0 {
		return roomStock, fmt.Errorf("stok %s di %s tidak mencukupi. Tersedia %d", medicine.Name, room.Name, prevQty)
	}

	roomStock.Quantity = newQty
	if err := tx.Model(&roomStock).Update("quantity", newQty).Error; err != nil {
		return roomStock, err
	}

	if _, err := recalculateMedicineTotalStockTx(tx, medicineID); err != nil {
		return roomStock, err
	}

	absQty := delta
	if absQty < 0 {
		absQty = -absQty
	}

	movement := models.StockMovement{
		MedicineID:    medicineID,
		RoomID:        &roomID,
		Type:          movementType,
		Quantity:      absQty,
		PreviousStock: prevQty,
		NewStock:      newQty,
		ReferenceType: refType,
		ReferenceID:   refID,
		BatchNumber:   batchNumber,
		ExpiryDate:    expiryDate,
		Notes:         notes,
		CreatedBy:     userID,
	}
	if err := tx.Create(&movement).Error; err != nil {
		return roomStock, err
	}

	return roomStock, nil
}

type MedicineRoomSummary struct {
	models.Polyclinic
	TotalMedicines int64 `json:"total_medicines"`
	TotalStock     int64 `json:"total_stock"`
}

func GetMedicineRooms(c *gin.Context) {
	var rooms []models.Polyclinic
	query := database.DB.Order("is_default_depo DESC, is_default_apotek DESC, sort_order ASC, name ASC")

	if roomType := strings.TrimSpace(c.Query("room_type")); roomType != "" {
		query = query.Where("room_type = ?", roomType)
	} else if roomType := strings.TrimSpace(c.Query("type")); roomType != "" {
		query = query.Where("room_type = ?", roomType)
	}
	if isActive := strings.TrimSpace(c.Query("is_active")); isActive != "" {
		query = query.Where("is_active = ?", isActive == "true")
	}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		query = query.Where("name ILIKE ? OR code ILIKE ? OR description ILIKE ?", "%"+q+"%", "%"+q+"%", "%"+q+"%")
	}

	if err := query.Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type roomAgg struct {
		RoomID         uint
		TotalMedicines int64
		TotalStock     int64
	}
	var aggs []roomAgg
	database.DB.Model(&models.MedicineRoomStock{}).
		Select("room_id, COUNT(CASE WHEN quantity > 0 THEN 1 END) as total_medicines, COALESCE(SUM(quantity), 0) as total_stock").
		Group("room_id").
		Scan(&aggs)

	aggMap := make(map[uint]roomAgg, len(aggs))
	for _, agg := range aggs {
		aggMap[agg.RoomID] = agg
	}

	summaries := make([]MedicineRoomSummary, 0, len(rooms))
	for _, room := range rooms {
		agg := aggMap[room.ID]
		summaries = append(summaries, MedicineRoomSummary{
			Polyclinic:     room,
			TotalMedicines: agg.TotalMedicines,
			TotalStock:     agg.TotalStock,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": summaries})
}

func GetMedicineRoom(c *gin.Context) {
	id := c.Param("id")
	var room models.Polyclinic
	if err := database.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ruangan tidak ditemukan"})
		return
	}

	stockQuery := database.DB.Model(&models.MedicineRoomStock{}).
		Joins("JOIN medicines ON medicines.id = medicine_room_stocks.medicine_id AND medicines.deleted_at IS NULL").
		Where("medicine_room_stocks.room_id = ?", room.ID)

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		stockQuery = stockQuery.Where(
			"medicines.name ILIKE ? OR medicines.code ILIKE ? OR medicines.generic_name ILIKE ?",
			"%"+q+"%", "%"+q+"%", "%"+q+"%",
		)
	}
	if strings.TrimSpace(c.Query("only_available")) == "true" {
		stockQuery = stockQuery.Where("medicine_room_stocks.quantity > 0")
	}

	var total int64
	stockQuery.Count(&total)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 500 {
		perPage = 50
	}
	offset := (page - 1) * perPage

	var stocks []models.MedicineRoomStock
	if err := stockQuery.
		Preload("Medicine.Category").
		Preload("Medicine.Unit").
		Order("medicines.name ASC").
		Offset(offset).
		Limit(perPage).
		Find(&stocks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     room,
		"stocks":   stocks,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

type MedicineRoomRequest struct {
	Code            string `json:"code" binding:"required"`
	Name            string `json:"name" binding:"required"`
	Type            string `json:"type"`
	Description     string `json:"description"`
	IsDefaultDepo   bool   `json:"is_default_depo"`
	IsDefaultApotek bool   `json:"is_default_apotek"`
	IsActive        *bool  `json:"is_active"`
}

func CreateMedicineRoom(c *gin.Context) {
	var req MedicineRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	roomType := strings.TrimSpace(req.Type)
	if roomType == "" {
		roomType = "lainnya"
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	room := models.Polyclinic{
		Code:            strings.ToUpper(strings.TrimSpace(req.Code)),
		Name:            strings.TrimSpace(req.Name),
		RoomType:        roomType,
		Description:     strings.TrimSpace(req.Description),
		IsDefaultDepo:   req.IsDefaultDepo,
		IsDefaultApotek: req.IsDefaultApotek,
		IsActive:        isActive,
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if room.IsDefaultDepo {
			tx.Model(&models.Polyclinic{}).Where("is_default_depo = ?", true).Update("is_default_depo", false)
		}
		if room.IsDefaultApotek {
			tx.Model(&models.Polyclinic{}).Where("is_default_apotek = ?", true).Update("is_default_apotek", false)
		}
		return tx.Create(&room).Error
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": room})
}

func UpdateMedicineRoom(c *gin.Context) {
	id := c.Param("id")
	var room models.Polyclinic
	if err := database.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ruangan tidak ditemukan"})
		return
	}

	var req MedicineRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if req.IsDefaultDepo {
			tx.Model(&models.Polyclinic{}).Where("id <> ? AND is_default_depo = ?", room.ID, true).Update("is_default_depo", false)
		}
		if req.IsDefaultApotek {
			tx.Model(&models.Polyclinic{}).Where("id <> ? AND is_default_apotek = ?", room.ID, true).Update("is_default_apotek", false)
		}

		room.Code = strings.ToUpper(strings.TrimSpace(req.Code))
		room.Name = strings.TrimSpace(req.Name)
		if strings.TrimSpace(req.Type) != "" {
			room.RoomType = strings.TrimSpace(req.Type)
		}
		room.Description = strings.TrimSpace(req.Description)
		room.IsDefaultDepo = req.IsDefaultDepo
		room.IsDefaultApotek = req.IsDefaultApotek
		if req.IsActive != nil {
			room.IsActive = *req.IsActive
		}
		return tx.Save(&room).Error
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": room})
}

func DeleteMedicineRoom(c *gin.Context) {
	id := c.Param("id")
	var room models.Polyclinic
	if err := database.DB.First(&room, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ruangan tidak ditemukan"})
		return
	}

	if room.IsDefaultDepo || room.IsDefaultApotek {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ruangan default Depo/Apotek tidak dapat dihapus"})
		return
	}

	var nonZeroStock int64
	database.DB.Model(&models.MedicineRoomStock{}).Where("room_id = ? AND quantity > 0", room.ID).Count(&nonZeroStock)
	if nonZeroStock > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ruangan masih memiliki stok obat aktif"})
		return
	}

	if err := database.DB.Delete(&room).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Ruangan berhasil dihapus"})
}
