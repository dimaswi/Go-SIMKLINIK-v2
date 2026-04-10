package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"starter/backend/database"
	"starter/backend/models"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetMedicalServices(c *gin.Context) {
	var services []models.MedicalService
	query := database.DB.
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
		Order("name ASC")

	if search := c.Query("q"); search != "" {
		query = query.Where("name ILIKE ? OR code ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	if categoryID := c.Query("category_id"); categoryID != "" {
		query = query.Where("category_id = ?", categoryID)
	}

	if serviceDomain := strings.TrimSpace(c.Query("service_domain")); serviceDomain != "" {
		normalizedServiceDomain := normalizeMedicalServiceDomain(serviceDomain)
		if normalizedServiceDomain == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "service_domain tidak valid"})
			return
		}
		query = query.Where("service_domain = ?", normalizedServiceDomain)
	}

	if targetScope := strings.TrimSpace(c.Query("target_scope")); targetScope != "" {
		normalizedTargetScope := normalizeMedicalServiceTargetScope(targetScope)
		if normalizedTargetScope == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "target_scope tidak valid"})
			return
		}
		query = query.Where("target_scope = ?", normalizedTargetScope)
	}

	if requiresConsent := strings.TrimSpace(c.Query("requires_consent")); requiresConsent != "" {
		query = query.Where("requires_consent = ?", requiresConsent == "true" || requiresConsent == "1")
	}

	if supportsOdontogramSync := strings.TrimSpace(c.Query("supports_odontogram_sync")); supportsOdontogramSync != "" {
		query = query.Where("supports_odontogram_sync = ?", supportsOdontogramSync == "true" || supportsOdontogramSync == "1")
	}

	if polyclinicID := c.Query("polyclinic_id"); polyclinicID != "" {
		query = query.Where("polyclinic_id = ?", polyclinicID)
	}

	if isActive := c.Query("is_active"); isActive != "" {
		query = query.Where("is_active = ?", isActive == "true")
	}

	if err := query.Find(&services).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": services})
}

func GetMedicalService(c *gin.Context) {
	id := c.Param("id")

	var service models.MedicalService
	if err := database.DB.
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
		First(&service, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Layanan medis tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": service})
}

type CreateMedicalServiceRequest struct {
	Name                   string                           `json:"name" binding:"required"`
	CategoryID             uint                             `json:"category_id" binding:"required"`
	PolyclinicID           *uint                            `json:"polyclinic_id"`
	ServiceDomain          string                           `json:"service_domain"`
	TargetScope            string                           `json:"target_scope"`
	RequiresConsent        *bool                            `json:"requires_consent"`
	SupportsOdontogramSync *bool                            `json:"supports_odontogram_sync"`
	Price                  float64                          `json:"price"`
	IsActive               *bool                            `json:"is_active"`
	Description            string                           `json:"description"`
	Parameters             []MedicalServiceParameterRequest `json:"parameters"`
	SpecimenOptions        []MedicalServiceSpecimenRequest  `json:"specimen_options"`
}

type MedicalServiceParameterRequest struct {
	ID                   *uint  `json:"id"`
	Code                 string `json:"code"`
	Name                 string `json:"name"`
	InputType            string `json:"input_type"`
	Unit                 string `json:"unit"`
	ReferenceValueMale   string `json:"reference_value_male"`
	ReferenceValueFemale string `json:"reference_value_female"`
	SortOrder            int    `json:"sort_order"`
	IsRequired           *bool  `json:"is_required"`
}

type MedicalServiceSpecimenRequest struct {
	SpecimenTemplateID uint   `json:"specimen_template_id"`
	SortOrder          int    `json:"sort_order"`
	IsDefault          *bool  `json:"is_default"`
	Notes              string `json:"notes"`
}

func generateMedicalServiceCode() string {
	var count int64
	database.DB.Model(&models.MedicalService{}).Unscoped().Count(&count)
	return fmt.Sprintf("SRV-%04d", count+1)
}

func normalizeMedicalServiceParameterInputType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "number":
		return "number"
	case "textarea":
		return "textarea"
	default:
		return "text"
	}
}

func normalizeMedicalServiceMetadata(request CreateMedicalServiceRequest) (string, string, bool, bool, error) {
	serviceDomain := resolveMedicalServiceDomain(request.ServiceDomain)
	if strings.TrimSpace(request.ServiceDomain) != "" && normalizeMedicalServiceDomain(request.ServiceDomain) == "" {
		return "", "", false, false, fmt.Errorf("service_domain tidak valid")
	}

	targetScope := resolveMedicalServiceTargetScope(request.TargetScope)
	if strings.TrimSpace(request.TargetScope) != "" && normalizeMedicalServiceTargetScope(request.TargetScope) == "" {
		return "", "", false, false, fmt.Errorf("target_scope tidak valid")
	}

	requiresConsent := false
	if request.RequiresConsent != nil {
		requiresConsent = *request.RequiresConsent
	}

	supportsOdontogramSync := false
	if request.SupportsOdontogramSync != nil {
		supportsOdontogramSync = *request.SupportsOdontogramSync
	}

	if serviceDomain != medicalServiceDomainDental {
		targetScope = medicalServiceTargetScopeNone
		supportsOdontogramSync = false
	}

	if targetScope != medicalServiceTargetScopeTooth && targetScope != medicalServiceTargetScopeSurface {
		supportsOdontogramSync = false
	}

	return serviceDomain, targetScope, requiresConsent, supportsOdontogramSync, nil
}

func syncMedicalServiceParametersTx(tx *gorm.DB, serviceID uint, requests []MedicalServiceParameterRequest) error {
	var existingParameters []models.MedicalServiceParameter
	if err := tx.Where("medical_service_id = ?", serviceID).Find(&existingParameters).Error; err != nil {
		return err
	}

	existingByID := make(map[uint]models.MedicalServiceParameter, len(existingParameters))
	for _, parameter := range existingParameters {
		existingByID[parameter.ID] = parameter
	}

	retainedIDs := make(map[uint]struct{}, len(existingParameters))
	parametersToCreate := make([]models.MedicalServiceParameter, 0, len(requests))
	for index, request := range requests {
		if strings.TrimSpace(request.Name) == "" {
			continue
		}

		isRequired := true
		if request.IsRequired != nil {
			isRequired = *request.IsRequired
		}

		sortOrder := request.SortOrder
		if sortOrder == 0 {
			sortOrder = index + 1
		}

		if request.ID != nil && *request.ID != 0 {
			existingParameter, exists := existingByID[*request.ID]
			if !exists {
				return fmt.Errorf("parameter layanan tidak ditemukan: %d", *request.ID)
			}

			existingParameter.Code = strings.TrimSpace(request.Code)
			existingParameter.Name = strings.TrimSpace(request.Name)
			existingParameter.InputType = normalizeMedicalServiceParameterInputType(request.InputType)
			existingParameter.Unit = strings.TrimSpace(request.Unit)
			existingParameter.ReferenceValueMale = strings.TrimSpace(request.ReferenceValueMale)
			existingParameter.ReferenceValueFemale = strings.TrimSpace(request.ReferenceValueFemale)
			existingParameter.SortOrder = sortOrder
			existingParameter.IsRequired = isRequired

			if err := tx.Save(&existingParameter).Error; err != nil {
				return err
			}

			retainedIDs[existingParameter.ID] = struct{}{}
			continue
		}

		parametersToCreate = append(parametersToCreate, models.MedicalServiceParameter{
			MedicalServiceID:     serviceID,
			Code:                 strings.TrimSpace(request.Code),
			Name:                 strings.TrimSpace(request.Name),
			InputType:            normalizeMedicalServiceParameterInputType(request.InputType),
			Unit:                 strings.TrimSpace(request.Unit),
			ReferenceValueMale:   strings.TrimSpace(request.ReferenceValueMale),
			ReferenceValueFemale: strings.TrimSpace(request.ReferenceValueFemale),
			SortOrder:            sortOrder,
			IsRequired:           isRequired,
		})
	}

	if len(parametersToCreate) > 0 {
		if err := tx.Create(&parametersToCreate).Error; err != nil {
			return err
		}
	}

	parametersToDelete := make([]uint, 0)
	for _, parameter := range existingParameters {
		if _, exists := retainedIDs[parameter.ID]; exists {
			continue
		}
		parametersToDelete = append(parametersToDelete, parameter.ID)
	}

	if len(parametersToDelete) == 0 {
		return nil
	}

	return tx.Where("id IN ?", parametersToDelete).Delete(&models.MedicalServiceParameter{}).Error
}

func syncMedicalServiceSpecimensTx(tx *gorm.DB, service models.MedicalService, requests []MedicalServiceSpecimenRequest) error {
	if err := tx.Unscoped().Where("medical_service_id = ?", service.ID).Delete(&models.MedicalServiceSpecimen{}).Error; err != nil {
		return err
	}

	if resolveMedicalServiceDomain(service.ServiceDomain) != medicalServiceDomainLaboratory {
		if len(requests) > 0 {
			return fmt.Errorf("opsi specimen hanya boleh dipakai pada layanan laboratorium")
		}
		return nil
	}

	options := make([]models.MedicalServiceSpecimen, 0, len(requests))
	defaultCount := 0
	seenTemplateIDs := make(map[uint]struct{}, len(requests))
	for index, request := range requests {
		if request.SpecimenTemplateID == 0 {
			continue
		}

		if _, exists := seenTemplateIDs[request.SpecimenTemplateID]; exists {
			return fmt.Errorf("template specimen tidak boleh dipilih lebih dari sekali dalam satu layanan")
		}
		seenTemplateIDs[request.SpecimenTemplateID] = struct{}{}

		var template models.SpecimenTemplate
		if err := tx.First(&template, request.SpecimenTemplateID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("template specimen tidak ditemukan: %d", request.SpecimenTemplateID)
			}
			return err
		}

		isDefault := false
		if request.IsDefault != nil {
			isDefault = *request.IsDefault
		}
		if isDefault {
			defaultCount++
		}

		sortOrder := request.SortOrder
		if sortOrder == 0 {
			sortOrder = index + 1
		}

		options = append(options, models.MedicalServiceSpecimen{
			MedicalServiceID:   service.ID,
			SpecimenTemplateID: request.SpecimenTemplateID,
			SortOrder:          sortOrder,
			IsDefault:          isDefault,
			Notes:              strings.TrimSpace(request.Notes),
		})
	}

	if len(options) == 0 {
		return nil
	}

	if defaultCount > 1 {
		return fmt.Errorf("hanya satu specimen default yang diperbolehkan per layanan")
	}
	if defaultCount == 0 {
		options[0].IsDefault = true
	}

	return tx.Create(&options).Error
}

func CreateMedicalService(c *gin.Context) {
	var req CreateMedicalServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	serviceDomain, targetScope, requiresConsent, supportsOdontogramSync, err := normalizeMedicalServiceMetadata(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if serviceDomain != medicalServiceDomainLaboratory && len(req.SpecimenOptions) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "opsi specimen hanya boleh dipakai pada layanan laboratorium"})
		return
	}

	service := models.MedicalService{
		Code:                   generateMedicalServiceCode(),
		Name:                   strings.TrimSpace(req.Name),
		CategoryID:             req.CategoryID,
		PolyclinicID:           req.PolyclinicID,
		ServiceDomain:          serviceDomain,
		TargetScope:            targetScope,
		RequiresConsent:        requiresConsent,
		SupportsOdontogramSync: supportsOdontogramSync,
		Price:                  req.Price,
		IsActive:               isActive,
		Description:            strings.TrimSpace(req.Description),
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Create(&service).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := syncMedicalServiceParametersTx(tx, service.ID, req.Parameters); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := syncMedicalServiceSpecimensTx(tx, service, req.SpecimenOptions); err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.
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
		First(&service, service.ID)
	c.JSON(http.StatusCreated, gin.H{"data": service})
}

func UpdateMedicalService(c *gin.Context) {
	id := c.Param("id")

	var service models.MedicalService
	if err := database.DB.First(&service, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Layanan medis tidak ditemukan"})
		return
	}

	var req CreateMedicalServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	serviceDomain, targetScope, requiresConsent, supportsOdontogramSync, err := normalizeMedicalServiceMetadata(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if serviceDomain != medicalServiceDomainLaboratory && len(req.SpecimenOptions) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "opsi specimen hanya boleh dipakai pada layanan laboratorium"})
		return
	}

	service.Name = strings.TrimSpace(req.Name)
	service.CategoryID = req.CategoryID
	service.PolyclinicID = req.PolyclinicID
	service.ServiceDomain = serviceDomain
	service.TargetScope = targetScope
	service.RequiresConsent = requiresConsent
	service.SupportsOdontogramSync = supportsOdontogramSync
	service.Price = req.Price
	service.Description = strings.TrimSpace(req.Description)
	if req.IsActive != nil {
		service.IsActive = *req.IsActive
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Save(&service).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := syncMedicalServiceParametersTx(tx, service.ID, req.Parameters); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := syncMedicalServiceSpecimensTx(tx, service, req.SpecimenOptions); err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.
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
		First(&service, service.ID)
	c.JSON(http.StatusOK, gin.H{"data": service})
}

func DeleteMedicalService(c *gin.Context) {
	id := c.Param("id")

	var service models.MedicalService
	if err := database.DB.First(&service, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Layanan medis tidak ditemukan"})
		return
	}

	if err := database.DB.Delete(&service).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Layanan medis berhasil dihapus"})
}
