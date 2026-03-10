package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

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

	// Limit results for autocomplete
	limit := 50
	if c.Query("limit") != "" {
		query = query.Limit(limit)
	} else {
		query = query.Limit(limit)
	}

	if err := query.Find(&codes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": codes})
}
