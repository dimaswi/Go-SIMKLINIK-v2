package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	odontogramSheetKey       = "odontogram"
	odontogramChartAdult     = "permanent"
	odontogramChartPrimary   = "primary"
	odontogramStatusDraft    = "draft"
	odontogramStatusFinal    = "final"
	odontogramStatusCancel   = "cancelled"
	odontogramConditionSound = "sound"
)

type UpdateOdontogramEntryRequest struct {
	ChartType string                         `json:"chart_type"`
	Notes     string                         `json:"notes"`
	Teeth     []UpdateOdontogramToothRequest `json:"teeth"`
}

type UpdateOdontogramToothRequest struct {
	ToothNumber     string                           `json:"tooth_number"`
	ToothCondition  string                           `json:"tooth_condition"`
	Notes           string                           `json:"notes"`
	SurfaceFindings []UpdateOdontogramSurfaceRequest `json:"surface_findings"`
}

type UpdateOdontogramSurfaceRequest struct {
	SurfaceCode   string `json:"surface_code"`
	ConditionCode string `json:"condition_code"`
	Notes         string `json:"notes"`
}

type CreateOdontogramEntryRequest struct {
	VisitID   uint   `json:"visit_id" binding:"required"`
	ChartType string `json:"chart_type"`
	Notes     string `json:"notes"`
}

func normalizeOdontogramChartType(chartType string) string {
	switch strings.ToLower(strings.TrimSpace(chartType)) {
	case odontogramChartPrimary, "deciduous", "child", "anak":
		return odontogramChartPrimary
	default:
		return odontogramChartAdult
	}
}

func normalizeOdontogramStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case odontogramStatusFinal:
		return odontogramStatusFinal
	case odontogramStatusCancel:
		return odontogramStatusCancel
	default:
		return odontogramStatusDraft
	}
}

func normalizeOdontogramCondition(value string) string {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	if trimmed == "" {
		return odontogramConditionSound
	}
	return trimmed
}

func preloadOdontogramEntryRelations(query *gorm.DB) *gorm.DB {
	return query.
		Preload("Visit").
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		Preload("Teeth", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("tooth_number ASC")
		}).
		Preload("Teeth.SurfaceFindings", func(db *gorm.DB) *gorm.DB {
			return db.Order("surface_code ASC").Order("id ASC")
		})
}

func GetOdontogramEntriesByVisit(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("visitId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visit ID"})
		return
	}

	var entries []models.OdontogramEntry
	if err := preloadOdontogramEntryRelations(database.DB).
		Where("visit_id = ?", visitID).
		Order("created_at DESC").
		Find(&entries).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": entries})
}

func CreateOdontogramEntry(c *gin.Context) {
	var req CreateOdontogramEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var visit models.Visit
	if err := database.DB.First(&visit, req.VisitID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	if visit.Status == "completed" || visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah ditutup, tidak bisa menambah entri odontogram"})
		return
	}

	entry := models.OdontogramEntry{
		VisitID:      visit.ID,
		PatientID:    visit.PatientID,
		DoctorID:     visit.DoctorID,
		PolyclinicID: visit.PolyclinicID,
		SheetKey:     odontogramSheetKey,
		ChartType:    normalizeOdontogramChartType(req.ChartType),
		Notes:        strings.TrimSpace(req.Notes),
		Status:       odontogramStatusDraft,
	}

	if err := database.DB.Create(&entry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Model(&visit).Updates(map[string]interface{}{
		"status":       "in_progress",
		"queue_status": "in_consultation",
	})

	if err := preloadOdontogramEntryRelations(database.DB).First(&entry, entry.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": entry, "message": "Entri odontogram berhasil dibuat"})
}

func UpdateOdontogramEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var entry models.OdontogramEntry
	if err := database.DB.Preload("Visit").First(&entry, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri odontogram tidak ditemukan"})
		return
	}

	if entry.Status == odontogramStatusCancel {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Entri odontogram berstatus batal, tidak bisa diubah"})
		return
	}

	if entry.Visit.Status == "completed" || entry.Visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah dikunci, entri odontogram tidak bisa diubah"})
		return
	}

	var req UpdateOdontogramEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Model(&entry).Updates(map[string]interface{}{
		"chart_type": normalizeOdontogramChartType(req.ChartType),
		"notes":      strings.TrimSpace(req.Notes),
	}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var existingToothIDs []uint
	if err := tx.Model(&models.OdontogramTooth{}).
		Where("odontogram_entry_id = ?", entry.ID).
		Pluck("id", &existingToothIDs).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(existingToothIDs) > 0 {
		if err := tx.Where("odontogram_tooth_id IN ?", existingToothIDs).Delete(&models.OdontogramSurfaceFinding{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Where("odontogram_entry_id = ?", entry.ID).Delete(&models.OdontogramTooth{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for index, toothReq := range req.Teeth {
		toothNumber := strings.TrimSpace(toothReq.ToothNumber)
		if toothNumber == "" {
			continue
		}

		normalizedToothCondition := normalizeOdontogramCondition(toothReq.ToothCondition)
		trimmedToothNotes := strings.TrimSpace(toothReq.Notes)
		filteredSurfaceFindings := make([]UpdateOdontogramSurfaceRequest, 0, len(toothReq.SurfaceFindings))

		for _, surfaceReq := range toothReq.SurfaceFindings {
			surfaceCode := strings.ToLower(strings.TrimSpace(surfaceReq.SurfaceCode))
			conditionCode := normalizeOdontogramCondition(surfaceReq.ConditionCode)
			if surfaceCode == "" {
				continue
			}
			if conditionCode == odontogramConditionSound && strings.TrimSpace(surfaceReq.Notes) == "" {
				continue
			}
			filteredSurfaceFindings = append(filteredSurfaceFindings, UpdateOdontogramSurfaceRequest{
				SurfaceCode:   surfaceCode,
				ConditionCode: conditionCode,
				Notes:         strings.TrimSpace(surfaceReq.Notes),
			})
		}

		if normalizedToothCondition == odontogramConditionSound && trimmedToothNotes == "" && len(filteredSurfaceFindings) == 0 {
			continue
		}

		tooth := models.OdontogramTooth{
			OdontogramEntryID: entry.ID,
			ToothNumber:       toothNumber,
			ToothCondition:    normalizedToothCondition,
			Notes:             trimmedToothNotes,
			SortOrder:         index + 1,
		}

		if err := tx.Create(&tooth).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		for _, surfaceReq := range filteredSurfaceFindings {
			surface := models.OdontogramSurfaceFinding{
				OdontogramToothID: tooth.ID,
				SurfaceCode:       surfaceReq.SurfaceCode,
				ConditionCode:     surfaceReq.ConditionCode,
				Notes:             surfaceReq.Notes,
			}
			if err := tx.Create(&surface).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := preloadOdontogramEntryRelations(database.DB).First(&entry, entry.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": entry, "message": "Entri odontogram berhasil diperbarui"})
}

func CancelOdontogramEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var entry models.OdontogramEntry
	if err := database.DB.Preload("Visit").First(&entry, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri odontogram tidak ditemukan"})
		return
	}

	if entry.Status == odontogramStatusCancel {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Entri odontogram sudah berstatus batal"})
		return
	}

	if entry.Visit.Status == "completed" || entry.Visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah dikunci dan entri odontogram tidak dapat dibatalkan"})
		return
	}

	if err := database.DB.Model(&entry).Update("status", odontogramStatusCancel).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := preloadOdontogramEntryRelations(database.DB).First(&entry, entry.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": entry, "message": "Entri odontogram berhasil dibatalkan"})
}

func DeleteOdontogramEntry(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var entry models.OdontogramEntry
	if err := database.DB.Preload("Visit").First(&entry, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri odontogram tidak ditemukan"})
		return
	}

	if entry.Status != odontogramStatusCancel {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya entri odontogram berstatus batal yang dapat dihapus"})
		return
	}

	if entry.Visit.Status == "completed" || entry.Visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah dikunci dan entri odontogram tidak dapat dihapus"})
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	var toothIDs []uint
	if err := tx.Model(&models.OdontogramTooth{}).
		Where("odontogram_entry_id = ?", entry.ID).
		Pluck("id", &toothIDs).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(toothIDs) > 0 {
		if err := tx.Where("odontogram_tooth_id IN ?", toothIDs).Delete(&models.OdontogramSurfaceFinding{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Where("odontogram_entry_id = ?", entry.ID).Delete(&models.OdontogramTooth{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Delete(&entry).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Entri odontogram berhasil dihapus"})
}
