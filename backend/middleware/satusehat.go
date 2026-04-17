package middleware

import (
	"net/http"

	"starter/backend/services/satusehat"

	"github.com/gin-gonic/gin"
)

func RequireSATUSEHATEnabled() gin.HandlerFunc {
	return func(c *gin.Context) {
		config, err := satusehat.LoadConfig()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi SATUSEHAT"})
			return
		}

		if err := config.EnsureEnabled(); err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			return
		}

		c.Next()
	}
}
