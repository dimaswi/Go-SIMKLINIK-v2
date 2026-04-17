package middleware

import (
	"net/http"

	"starter/backend/services/bpjs"

	"github.com/gin-gonic/gin"
)

func RequireBPJSEnabled() gin.HandlerFunc {
	return RequireBPJSAntreanEnabled()
}

func RequireBPJSAntreanEnabled() gin.HandlerFunc {
	return func(c *gin.Context) {
		config, err := bpjs.LoadAntreanConfig()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"metadata": gin.H{"message": "Gagal memuat konfigurasi BPJS", "code": 500}})
			return
		}

		if err := config.EnsureEnabled(); err != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"metadata": gin.H{"message": err.Error(), "code": 503}})
			return
		}

		c.Next()
	}
}
