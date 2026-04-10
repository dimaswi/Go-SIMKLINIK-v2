package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func getNextRegistrationTicketNumber(date time.Time) int {
	dateStr := date.Format("2006-01-02")
	var counter models.RegistrationCounter
	err := database.DB.
		Where("DATE(date) = ?", dateStr).
		First(&counter).Error

	if err != nil {
		counter = models.RegistrationCounter{
			Date:       date,
			LastNumber: 1,
		}
		database.DB.Create(&counter)
		return 1
	}

	counter.LastNumber++
	database.DB.Save(&counter)
	return counter.LastNumber
}

func parseRegistrationQueueDate(c *gin.Context) (time.Time, string, error) {
	dateStr := c.DefaultQuery("date", time.Now().Format("2006-01-02"))
	parsed, err := time.ParseInLocation("2006-01-02", dateStr, time.Local)
	if err != nil {
		return time.Time{}, "", err
	}

	return parsed, dateStr, nil
}

func registrationQueueQuery() *gorm.DB {
	return database.DB.
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Polyclinic").
		Preload("Visit.Doctor")
}

func hasOtherActiveRegistrationQueue(date time.Time, excludeID uint) (bool, error) {
	var count int64
	query := database.DB.
		Model(&models.RegistrationQueue{}).
		Where("DATE(queue_date) = ? AND status IN ?", date.Format("2006-01-02"), []string{"called", "processing"})

	if excludeID != 0 {
		query = query.Where("id <> ?", excludeID)
	}

	if err := query.Count(&count).Error; err != nil {
		return false, err
	}

	return count > 0, nil
}

func GetRegistrationQueues(c *gin.Context) {
	_, dateStr, err := parseRegistrationQueueDate(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format tanggal tidak valid (YYYY-MM-DD)"})
		return
	}

	var queues []models.RegistrationQueue
	query := registrationQueueQuery().
		Where("DATE(queue_date) = ?", dateStr).
		Order("ticket_number ASC")

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Find(&queues).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": queues})
}

func GetRegistrationQueue(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var queue models.RegistrationQueue
	if err := registrationQueueQuery().First(&queue, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Antrian pendaftaran tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": queue})
}

func DeleteRegistrationQueue(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var queue models.RegistrationQueue
	if err := registrationQueueQuery().First(&queue, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Antrian pendaftaran tidak ditemukan"})
		return
	}

	if queue.VisitID != nil && *queue.VisitID != 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Antrian sudah terhubung ke pendaftaran dan tidak bisa dihapus"})
		return
	}

	if err := database.DB.Delete(&queue).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Antrian pendaftaran berhasil dihapus"})
}

func CreateRegistrationQueue(c *gin.Context) {
	now := time.Now()
	queue := models.RegistrationQueue{
		QueueDate:    now,
		TicketNumber: getNextRegistrationTicketNumber(now),
		Status:       "waiting",
	}

	if err := database.DB.Create(&queue).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := registrationQueueQuery().First(&queue, queue.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": queue, "message": "Tiket antrian pendaftaran berhasil dibuat"})
}

func CallNextRegistrationQueue(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	hasActive, err := hasOtherActiveRegistrationQueue(time.Now(), 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hasActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Masih ada tiket pendaftaran aktif yang belum selesai diproses"})
		return
	}

	var queue models.RegistrationQueue
	if err := registrationQueueQuery().
		Where("DATE(queue_date) = ? AND status = ?", today, "waiting").
		Order("ticket_number ASC").
		First(&queue).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Tidak ada antrian pendaftaran yang menunggu"})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	updates := map[string]interface{}{
		"status":    "called",
		"called_at": &now,
	}

	if err := database.DB.Model(&queue).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := registrationQueueQuery().First(&queue, queue.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": queue, "message": "Antrian pendaftaran dipanggil"})
}

type UpdateRegistrationQueueStatusRequest struct {
	Status  string `json:"status" binding:"required,oneof=waiting called processing completed cancelled"`
	VisitID *uint  `json:"visit_id"`
}

func UpdateRegistrationQueueStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req UpdateRegistrationQueueStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var queue models.RegistrationQueue
	if err := registrationQueueQuery().First(&queue, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Antrian pendaftaran tidak ditemukan"})
		return
	}

	now := time.Now()
	updates := map[string]interface{}{
		"status": req.Status,
	}

	if req.Status == "called" || req.Status == "processing" {
		hasActive, err := hasOtherActiveRegistrationQueue(queue.QueueDate, queue.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if hasActive {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Masih ada tiket pendaftaran aktif yang belum selesai diproses"})
			return
		}
	}

	switch req.Status {
	case "called":
		updates["called_at"] = &now
	case "processing":
		if queue.CalledAt == nil {
			updates["called_at"] = &now
		}
		updates["processing_started_at"] = &now
	case "completed":
		if req.VisitID == nil || *req.VisitID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "visit_id wajib diisi saat menyelesaikan tiket"})
			return
		}

		var visit models.Visit
		if err := database.DB.First(&visit, *req.VisitID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan hasil pendaftaran tidak ditemukan"})
			return
		}

		if queue.CalledAt == nil {
			updates["called_at"] = &now
		}
		if queue.ProcessingStartedAt == nil {
			updates["processing_started_at"] = &now
		}
		updates["completed_at"] = &now
		updates["visit_id"] = *req.VisitID
	case "cancelled":
		updates["cancelled_at"] = &now
	}

	if err := database.DB.Model(&queue).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := registrationQueueQuery().First(&queue, queue.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": queue, "message": "Status antrian pendaftaran diperbarui"})
}
