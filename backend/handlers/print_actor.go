package handlers

import (
	"strconv"
	"strings"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func resolvePrintedByLabel(c *gin.Context) string {
	fallback := strings.TrimSpace(c.GetString("email"))
	if c == nil {
		return fallbackText(fallback)
	}

	userID, exists := c.Get("user_id")
	if !exists {
		return fallbackText(fallback)
	}

	resolvedUserID := resolveContextUserID(userID)
	if resolvedUserID == 0 {
		return fallbackText(fallback)
	}

	var user models.User
	if err := database.DB.Preload("Employee").First(&user, resolvedUserID).Error; err != nil {
		return fallbackText(fallback)
	}

	if user.Employee != nil {
		if employeeName := strings.TrimSpace(user.Employee.FullName); employeeName != "" {
			return employeeName
		}
	}

	return firstNonEmpty(
		strings.TrimSpace(user.FullName),
		strings.TrimSpace(user.Username),
		strings.TrimSpace(user.Email),
		fallback,
		"-",
	)
}

func resolveContextUserID(value interface{}) uint {
	switch typed := value.(type) {
	case uint:
		return typed
	case uint64:
		return uint(typed)
	case uint32:
		return uint(typed)
	case uint16:
		return uint(typed)
	case uint8:
		return uint(typed)
	case int:
		if typed > 0 {
			return uint(typed)
		}
	case int64:
		if typed > 0 {
			return uint(typed)
		}
	case int32:
		if typed > 0 {
			return uint(typed)
		}
	case int16:
		if typed > 0 {
			return uint(typed)
		}
	case int8:
		if typed > 0 {
			return uint(typed)
		}
	case float64:
		if typed > 0 {
			return uint(typed)
		}
	case float32:
		if typed > 0 {
			return uint(typed)
		}
	case string:
		parsed, err := strconv.ParseUint(strings.TrimSpace(typed), 10, 64)
		if err == nil && parsed > 0 {
			return uint(parsed)
		}
	}

	return 0
}
