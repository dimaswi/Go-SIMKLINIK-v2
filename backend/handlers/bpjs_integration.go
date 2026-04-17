package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"
	"starter/backend/services/bpjs"

	"github.com/gin-gonic/gin"
)

func GetBPJSStatus(c *gin.Context) {
	configs, err := bpjs.LoadDomainConfigs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi BPJS"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": configs.PublicStatus()})
}

func GetBPJSLogs(c *gin.Context) {
	limit, err := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("limit", "50")))
	if err != nil || limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	domain := strings.TrimSpace(strings.ToLower(c.Query("domain")))
	direction := strings.TrimSpace(strings.ToLower(c.Query("direction")))
	operation := strings.TrimSpace(strings.ToLower(c.Query("operation")))
	successFilter := strings.TrimSpace(strings.ToLower(c.Query("success")))

	var logs []models.BPJSLog
	query := database.DB.Order("created_at DESC")
	if domain != "" && domain != "all" {
		query = query.Where("LOWER(domain) = ?", domain)
	}
	if direction != "" && direction != "all" {
		query = query.Where("LOWER(direction) = ?", direction)
	}
	if operation != "" && operation != "all" {
		query = query.Where("LOWER(operation) = ?", operation)
	}
	if successFilter == "true" || successFilter == "1" || successFilter == "success" {
		query = query.Where("success = ?", true)
	} else if successFilter == "false" || successFilter == "0" || successFilter == "failed" {
		query = query.Where("success = ?", false)
	}

	if err := query.Limit(limit).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat log BPJS"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": logs})
}

func TestBPJSAntreanConnection(c *gin.Context) {
	testBPJSDomainConnection(c, bpjs.LoadAntreanConfig)
}

func TestBPJSPCareConnection(c *gin.Context) {
	testBPJSDomainConnection(c, bpjs.LoadPCareConfig)
}

func GetBPJSReferencePoli(c *gin.Context) {
	client, err := bpjs.NewClient()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	tanggal := strings.TrimSpace(c.DefaultQuery("date", time.Now().Format("2006-01-02")))
	references, err := client.GetReferencePoli(tanggal)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	query := strings.ToLower(strings.TrimSpace(c.Query("q")))
	if query != "" {
		filtered := make([]bpjs.ReferencePoli, 0, len(references))
		for _, item := range references {
			searchText := strings.ToLower(strings.Join([]string{item.Code, item.Name, item.SubSpecializationCode, item.SubSpecializationName}, " "))
			if strings.Contains(searchText, query) {
				filtered = append(filtered, item)
			}
		}
		references = filtered
	}

	c.JSON(http.StatusOK, gin.H{"data": references})
}

func GetBPJSReferenceDoctor(c *gin.Context) {
	client, err := bpjs.NewClient()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	tanggal := strings.TrimSpace(c.DefaultQuery("date", time.Now().Format("2006-01-02")))
	references, err := client.GetReferenceDoctor(tanggal)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	query := strings.ToLower(strings.TrimSpace(c.Query("q")))
	if query != "" {
		filtered := make([]bpjs.ReferenceDoctor, 0, len(references))
		for _, item := range references {
			searchText := strings.ToLower(strings.Join([]string{item.Code, item.Name, item.Schedule}, " "))
			if strings.Contains(searchText, query) {
				filtered = append(filtered, item)
			}
		}
		references = filtered
	}

	c.JSON(http.StatusOK, gin.H{"data": references})
}

func testBPJSDomainConnection(c *gin.Context, loader func() (bpjs.Config, error)) {
	config, err := loader()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat konfigurasi BPJS"})
		return
	}

	result, testErr := bpjs.TestConnection(c.Request.Context(), config)
	if testErr != nil {
		statusCode := http.StatusBadGateway
		if strings.Contains(strings.ToLower(testErr.Error()), "belum lengkap") || strings.Contains(strings.ToLower(testErr.Error()), "tidak valid") {
			statusCode = http.StatusBadRequest
		}
		c.JSON(statusCode, gin.H{
			"error": testErr.Error(),
			"data":  result,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":    result,
		"message": fmt.Sprintf("Preflight %s berhasil dijalankan", config.Label),
	})
}
