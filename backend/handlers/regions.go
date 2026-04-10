package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func parseInt64Query(c *gin.Context, key string) (int64, bool) {
	value := strings.TrimSpace(c.Query(key))
	if value == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parameter " + key + " wajib diisi"})
		return 0, false
	}

	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parameter " + key + " tidak valid"})
		return 0, false
	}

	return parsed, true
}

func GetProvinces(c *gin.Context) {
	var provinces []models.Province
	query := database.DB.Model(&models.Province{}).Order("name ASC")

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		query = query.Where("name ILIKE ?", "%"+q+"%")
	}

	if err := query.Find(&provinces).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": provinces})
}

func GetRegencies(c *gin.Context) {
	var regencies []models.Regency
	query := database.DB.Model(&models.Regency{}).Order("name ASC")

	if provinceValue := strings.TrimSpace(c.Query("province_id")); provinceValue != "" {
		provinceID, err := strconv.ParseInt(provinceValue, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parameter province_id tidak valid"})
			return
		}
		query = query.Where("province_id = ?", provinceID)
	}

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		query = query.Where("name ILIKE ?", "%"+q+"%")
	}

	if err := query.Find(&regencies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": regencies})
}

func GetDistricts(c *gin.Context) {
	regencyID, ok := parseInt64Query(c, "regency_id")
	if !ok {
		return
	}

	var districts []models.District
	query := database.DB.Model(&models.District{}).
		Where("regency_id = ?", regencyID).
		Order("name ASC")

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		query = query.Where("name ILIKE ?", "%"+q+"%")
	}

	if err := query.Find(&districts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": districts})
}

func GetVillages(c *gin.Context) {
	districtID, ok := parseInt64Query(c, "district_id")
	if !ok {
		return
	}

	var villages []models.Village
	query := database.DB.Model(&models.Village{}).
		Where("district_id = ?", districtID).
		Order("name ASC")

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		query = query.Where("name ILIKE ?", "%"+q+"%")
	}

	if err := query.Find(&villages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": villages})
}
