package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func GetICD10(c *gin.Context) {
	var codes []models.ICD10
	query := database.DB.Order("code ASC")

	if search := c.Query("q"); search != "" {
		query = query.Where(
			"code ILIKE ? OR name ILIKE ? OR name_id ILIKE ? OR category ILIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%",
		)
	}

	if category := c.Query("category"); category != "" {
		query = query.Where("category = ?", category)
	}

	if chapter := c.Query("chapter"); chapter != "" {
		query = query.Where("chapter = ?", chapter)
	}

	if system := strings.TrimSpace(c.Query("system")); system != "" && !strings.EqualFold(system, "all") {
		query = query.Where("system = ?", system)
	} else {
		// Default: only ICD-10 codes unless explicitly requesting ICD-9-CM
		query = query.Where("system = ? OR system IS NULL OR system = ''", "ICD10_2010_IM")
	}

	// Limit results for autocomplete
	limit := 50
	limitParam := strings.TrimSpace(c.Query("limit"))
	if limitParam == "" {
		limitParam = strings.TrimSpace(c.Query("per_page"))
	}
	if limitParam != "" {
		if parsedLimit, err := strconv.Atoi(limitParam); err == nil && parsedLimit > 0 {
			if parsedLimit > 50000 {
				parsedLimit = 50000
			}
			limit = parsedLimit
		}
	}
	query = query.Limit(limit)

	if err := query.Find(&codes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": codes})
}
