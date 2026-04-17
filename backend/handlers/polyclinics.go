package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func currentUserHasQueuePolyclinicOverviewAccess(c *gin.Context) bool {
	roleIDValue, exists := c.Get("role_id")
	if !exists {
		return false
	}

	var roleID uint
	switch value := roleIDValue.(type) {
	case uint:
		roleID = value
	case int:
		roleID = uint(value)
	case int64:
		roleID = uint(value)
	case float64:
		roleID = uint(value)
	default:
		return false
	}

	var role models.Role
	if err := database.DB.Preload("Permissions").First(&role, roleID).Error; err != nil {
		return false
	}

	for _, permission := range role.Permissions {
		switch permission.Name {
		case "polyclinics.view", "queue.manage", "visits.create":
			return true
		}
	}

	return false
}

func findDoctorScopedQueuePolyclinics(userID uint) ([]models.Polyclinic, error) {
	var doctor models.Doctor
	err := database.DB.
		Preload("Polyclinics", "is_active = ?", true).
		Preload("Schedules", "is_active = ?", true).
		Preload("Schedules.Polyclinic", "is_active = ?", true).
		Where("user_id = ? AND is_active = ?", userID, true).
		First(&doctor).Error
	if err != nil {
		return nil, err
	}

	polyclinicMap := make(map[uint]models.Polyclinic)
	for _, polyclinic := range doctor.Polyclinics {
		if polyclinic.ID != 0 && polyclinic.IsActive {
			polyclinicMap[polyclinic.ID] = polyclinic
		}
	}

	for _, schedule := range doctor.Schedules {
		if schedule.Polyclinic.ID != 0 && schedule.Polyclinic.IsActive {
			polyclinicMap[schedule.Polyclinic.ID] = schedule.Polyclinic
		}
	}

	polyclinics := make([]models.Polyclinic, 0, len(polyclinicMap))
	for _, polyclinic := range polyclinicMap {
		polyclinics = append(polyclinics, polyclinic)
	}

	sort.Slice(polyclinics, func(left, right int) bool {
		if polyclinics[left].SortOrder == polyclinics[right].SortOrder {
			return polyclinics[left].Name < polyclinics[right].Name
		}
		return polyclinics[left].SortOrder < polyclinics[right].SortOrder
	})

	return polyclinics, nil
}

func GetQueuePolyclinicOptions(c *gin.Context) {
	if !currentUserHasQueuePolyclinicOverviewAccess(c) {
		if userIDValue, exists := c.Get("user_id"); exists {
			var userID uint
			switch value := userIDValue.(type) {
			case uint:
				userID = value
			case int:
				userID = uint(value)
			case int64:
				userID = uint(value)
			case float64:
				userID = uint(value)
			}

			if userID != 0 {
				if polyclinics, err := findDoctorScopedQueuePolyclinics(userID); err == nil {
					c.JSON(http.StatusOK, gin.H{"data": polyclinics})
					return
				}
			}
		}
	}

	var polyclinics []models.Polyclinic
	query := database.DB.Order("sort_order ASC, name ASC").Where("is_active = ?", true)

	if err := query.Find(&polyclinics).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": polyclinics})
}

func GetPolyclinics(c *gin.Context) {
	var polyclinics []models.Polyclinic
	query := database.DB.Order("sort_order ASC, name ASC")

	if search := c.Query("q"); search != "" {
		query = query.Where("name ILIKE ? OR code ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	if err := query.Find(&polyclinics).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": polyclinics})
}

func GetPolyclinic(c *gin.Context) {
	id := c.Param("id")

	var polyclinic models.Polyclinic
	if err := database.DB.First(&polyclinic, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poliklinik tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": polyclinic})
}

type CreatePolyclinicRequest struct {
	Name         string  `json:"name" binding:"required"`
	Description  string  `json:"description"`
	AdminFee     float64 `json:"admin_fee"`
	IsActive     *bool   `json:"is_active"`
	Color        string  `json:"color"`
	Icon         string  `json:"icon"`
	SortOrder    int     `json:"sort_order"`
	BpjsPoliCode string  `json:"bpjs_poli_code"`
}

func generatePolyclinicCode() string {
	var count int64
	database.DB.Model(&models.Polyclinic{}).Unscoped().Count(&count)
	return fmt.Sprintf("POL-%04d", count+1)
}

func CreatePolyclinic(c *gin.Context) {
	var req CreatePolyclinicRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AdminFee < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Biaya administrasi tidak boleh negatif"})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	polyclinic := models.Polyclinic{
		Name:         req.Name,
		Code:         generatePolyclinicCode(),
		Description:  req.Description,
		AdminFee:     req.AdminFee,
		IsActive:     isActive,
		Color:        req.Color,
		Icon:         req.Icon,
		SortOrder:    req.SortOrder,
		BpjsPoliCode: req.BpjsPoliCode,
	}

	if err := database.DB.Create(&polyclinic).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": polyclinic})
}

func UpdatePolyclinic(c *gin.Context) {
	id := c.Param("id")

	var polyclinic models.Polyclinic
	if err := database.DB.First(&polyclinic, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poliklinik tidak ditemukan"})
		return
	}

	var req CreatePolyclinicRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AdminFee < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Biaya administrasi tidak boleh negatif"})
		return
	}

	polyclinic.Name = req.Name
	polyclinic.Description = req.Description
	polyclinic.AdminFee = req.AdminFee
	polyclinic.Color = req.Color
	polyclinic.Icon = req.Icon
	polyclinic.SortOrder = req.SortOrder
	polyclinic.BpjsPoliCode = req.BpjsPoliCode
	if req.IsActive != nil {
		polyclinic.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&polyclinic).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": polyclinic})
}

func DeletePolyclinic(c *gin.Context) {
	id := c.Param("id")

	var polyclinic models.Polyclinic
	if err := database.DB.First(&polyclinic, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poliklinik tidak ditemukan"})
		return
	}

	if err := database.DB.Delete(&polyclinic).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Poliklinik berhasil dihapus"})
}
