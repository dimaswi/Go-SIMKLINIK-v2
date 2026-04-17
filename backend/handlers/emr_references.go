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

type emrReferencesResponse struct {
	VisitID            uint                             `json:"visit_id"`
	Medicines          []models.Medicine                `json:"medicines"`
	MedicalServices    []models.MedicalService          `json:"medical_services"`
	PhysicalExamImages []models.PhysicalExamImageMaster `json:"physical_exam_images"`
}

func GetEMRReferences(c *gin.Context) {
	visitID, err := strconv.ParseUint(c.Param("visitId"), 10, 64)
	if err != nil || visitID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	var visit models.Visit
	if err := database.DB.Select("id", "polyclinic_id").First(&visit, uint(visitID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	medicines := make([]models.Medicine, 0)
	if err := database.DB.
		Preload("Category").
		Preload("Unit").
		Where("is_active = ?", true).
		Order("name ASC").
		Limit(500).
		Find(&medicines).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	services := make([]models.MedicalService, 0)
	serviceQuery := database.DB.
		Preload("Category").
		Preload("Polyclinic").
		Preload("Parameters", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC").Order("id ASC")
		}).
		Preload("SpecimenOptions", func(db *gorm.DB) *gorm.DB {
			return db.Order("is_default DESC").Order("sort_order ASC").Order("id ASC")
		}).
		Preload("SpecimenOptions.SpecimenTemplate", func(db *gorm.DB) *gorm.DB {
			return db.Order("name ASC")
		}).
		Where("is_active = ?", true).
		Order("name ASC")

	if visit.PolyclinicID != 0 {
		serviceQuery = serviceQuery.Where("polyclinic_id IS NULL OR polyclinic_id = ?", visit.PolyclinicID)
	}

	if err := serviceQuery.Find(&services).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	physicalExamImages := make([]models.PhysicalExamImageMaster, 0)
	if err := database.DB.
		Where("is_active = ?", true).
		Order("category ASC").
		Order("location ASC").
		Order("sort_order ASC").
		Order("name ASC").
		Find(&physicalExamImages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": emrReferencesResponse{
		VisitID:            visit.ID,
		Medicines:          medicines,
		MedicalServices:    services,
		PhysicalExamImages: physicalExamImages,
	}})
}

func SearchEMRICD10(c *gin.Context) {
	var codes []models.ICD10
	query := database.DB.Order("code ASC")

	if search := strings.TrimSpace(c.Query("q")); search != "" {
		query = query.Where(
			"code ILIKE ? OR name ILIKE ? OR name_id ILIKE ? OR category ILIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%",
		)
	}

	if category := strings.TrimSpace(c.Query("category")); category != "" {
		query = query.Where("category = ?", category)
	}

	if chapter := strings.TrimSpace(c.Query("chapter")); chapter != "" {
		query = query.Where("chapter = ?", chapter)
	}

	if system := strings.TrimSpace(c.Query("system")); system != "" && !strings.EqualFold(system, "all") {
		query = query.Where("system = ?", system)
	} else {
		query = query.Where("system = ? OR system IS NULL OR system = ''", "ICD10_2010_IM")
	}

	limit := 50
	if limitParam := firstNonEmpty(strings.TrimSpace(c.Query("limit")), strings.TrimSpace(c.Query("per_page"))); limitParam != "" {
		if parsedLimit, err := strconv.Atoi(limitParam); err == nil && parsedLimit > 0 {
			if parsedLimit > 50000 {
				parsedLimit = 50000
			}
			limit = parsedLimit
		}
	}

	if err := query.Limit(limit).Find(&codes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": codes})
}
