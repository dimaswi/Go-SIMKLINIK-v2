package handlers

import (
	"net/http"
	"strings"

	"starter/backend/database"
	"starter/backend/middleware"
	"starter/backend/models"
	"starter/backend/services/bpjs"

	"github.com/gin-gonic/gin"
)

func AuthBPJSWebhook(c *gin.Context) {
	usernameHeader := c.GetHeader("x-username")
	passwordHeader := c.GetHeader("x-password")

	if usernameHeader == "" || passwordHeader == "" {
		bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
			Domain:       bpjs.DomainAntrean,
			Direction:    bpjs.DirectionInbound,
			Operation:    "auth",
			Method:       http.MethodGet,
			Endpoint:     c.FullPath(),
			StatusCode:   http.StatusUnauthorized,
			Success:      false,
			ErrorMessage: "Header x-username dan x-password wajib diisi",
		})
		c.JSON(http.StatusUnauthorized, gin.H{
			"metadata": gin.H{
				"message": "Header x-username dan x-password wajib diisi",
				"code":    401,
			},
		})
		return
	}

	var user models.User
	username := strings.ToLower(strings.TrimSpace(usernameHeader))
	if err := database.DB.Where("LOWER(username) = ?", username).First(&user).Error; err != nil {
		bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
			Domain:         bpjs.DomainAntrean,
			Direction:      bpjs.DirectionInbound,
			Operation:      "auth",
			Method:         http.MethodGet,
			Endpoint:       c.FullPath(),
			StatusCode:     http.StatusUnauthorized,
			Success:        false,
			ErrorMessage:   "Username atau password tidak valid",
			RequestPayload: map[string]any{"username": username},
		})
		c.JSON(http.StatusUnauthorized, gin.H{
			"metadata": gin.H{
				"message": "Username atau password tidak valid",
				"code":    401,
			},
		})
		return
	}

	if !user.CheckPassword(passwordHeader) {
		bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
			Domain:         bpjs.DomainAntrean,
			Direction:      bpjs.DirectionInbound,
			Operation:      "auth",
			Method:         http.MethodGet,
			Endpoint:       c.FullPath(),
			StatusCode:     http.StatusUnauthorized,
			Success:        false,
			ErrorMessage:   "Username atau password tidak valid",
			RequestPayload: map[string]any{"username": username},
		})
		c.JSON(http.StatusUnauthorized, gin.H{
			"metadata": gin.H{
				"message": "Username atau password tidak valid",
				"code":    401,
			},
		})
		return
	}

	if !user.IsActive {
		bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
			Domain:         bpjs.DomainAntrean,
			Direction:      bpjs.DirectionInbound,
			Operation:      "auth",
			Method:         http.MethodGet,
			Endpoint:       c.FullPath(),
			StatusCode:     http.StatusForbidden,
			Success:        false,
			ErrorMessage:   "Akun tidak aktif",
			RequestPayload: map[string]any{"username": username},
		})
		c.JSON(http.StatusForbidden, gin.H{
			"metadata": gin.H{
				"message": "Akun tidak aktif",
				"code":    403,
			},
		})
		return
	}

	token, err := middleware.GenerateToken(&user)
	if err != nil {
		bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
			Domain:         bpjs.DomainAntrean,
			Direction:      bpjs.DirectionInbound,
			Operation:      "auth",
			Method:         http.MethodGet,
			Endpoint:       c.FullPath(),
			StatusCode:     http.StatusInternalServerError,
			Success:        false,
			ErrorMessage:   "Gagal membuat sesi login",
			RequestPayload: map[string]any{"username": username},
		})
		c.JSON(http.StatusInternalServerError, gin.H{
			"metadata": gin.H{
				"message": "Gagal membuat sesi login",
				"code":    500,
			},
		})
		return
	}

	bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
		Domain:         bpjs.DomainAntrean,
		Direction:      bpjs.DirectionInbound,
		Operation:      "auth",
		Method:         http.MethodGet,
		Endpoint:       c.FullPath(),
		StatusCode:     http.StatusOK,
		Success:        true,
		RequestPayload: map[string]any{"username": username},
		ResponseBody:   map[string]any{"token_issued": true},
	})

	c.JSON(http.StatusOK, gin.H{
		"response": gin.H{
			"token": token,
		},
		"metadata": gin.H{
			"message": "OK",
			"code":    200,
		},
	})
}

type BPJSAddAntreanRequest struct {
	NomorKartu     string `json:"nomorkartu"`
	NIK            string `json:"nik"`
	KodePoli       string `json:"kodepoli"`
	TanggalPeriksa string `json:"tanggalperiksa"`
	Keluhan        string `json:"keluhan"`
	KodeDokter     int    `json:"kodedokter"`
	JamPraktek     string `json:"jampraktek"`
	NoRM           string `json:"norm"`
	NoHP           string `json:"nohp"`
}

// BPJSAddAntrean handles inbound add antrean from BPJS
func BPJSAddAntrean(c *gin.Context) {
	var req BPJSAddAntreanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
			Domain:       bpjs.DomainAntrean,
			Direction:    bpjs.DirectionInbound,
			Operation:    "add-antrean",
			Method:       http.MethodPost,
			Endpoint:     c.FullPath(),
			StatusCode:   http.StatusOK,
			Success:      false,
			ErrorMessage: "Invalid payload",
		})
		c.JSON(http.StatusOK, gin.H{"metadata": gin.H{"message": "Invalid payload", "code": 201}})
		return
	}

	// 1. Find Polyclinic by BPJS code
	var poli models.Polyclinic
	if err := database.DB.Where("bpjs_poli_code = ?", req.KodePoli).First(&poli).Error; err != nil {
		response := gin.H{"metadata": gin.H{"message": "Poliklinik tidak ditemukan", "code": 201}}
		bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
			Domain:         bpjs.DomainAntrean,
			Direction:      bpjs.DirectionInbound,
			Operation:      "add-antrean",
			Method:         http.MethodPost,
			Endpoint:       c.FullPath(),
			StatusCode:     http.StatusOK,
			Success:        false,
			ErrorMessage:   "Poliklinik tidak ditemukan",
			RequestPayload: req,
			ResponseBody:   response,
		})
		c.JSON(http.StatusOK, gin.H{"metadata": gin.H{"message": "Poliklinik tidak ditemukan", "code": 201}})
		return
	}

	// 2. Find Patient by NIK or NoRM
	var patient models.Patient
	if err := database.DB.Where("nik = ? OR medical_record_number = ?", req.NIK, req.NoRM).First(&patient).Error; err != nil {
		// Pasien Baru (code 202) -> tells BPJS to hit /peserta (Pasien Baru webhook)
		response := gin.H{"metadata": gin.H{"message": "Pasien Baru", "code": 202}}
		bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
			Domain:         bpjs.DomainAntrean,
			Direction:      bpjs.DirectionInbound,
			Operation:      "add-antrean",
			Method:         http.MethodPost,
			Endpoint:       c.FullPath(),
			StatusCode:     http.StatusOK,
			Success:        true,
			RequestPayload: req,
			ResponseBody:   response,
		})
		c.JSON(http.StatusOK, gin.H{"metadata": gin.H{"message": "Pasien Baru", "code": 202}})
		return
	}

	// For MVP: Return mock success indicating queue number
	// In production, you would call `createVisit` logic here
	response := gin.H{
		"response": gin.H{
			"nomorantrean":   "A1",
			"angkaantrean":   1,
			"namapoli":       poli.Name,
			"sisaantrean":    "0",
			"antreanpanggil": "-",
			"keterangan":     "Antrean berhasil ditambahkan via BPJS Mobile JKN",
		},
		"metadata": gin.H{
			"message": "Ok",
			"code":    200,
		},
	}

	bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
		Domain:         bpjs.DomainAntrean,
		Direction:      bpjs.DirectionInbound,
		Operation:      "add-antrean",
		Method:         http.MethodPost,
		Endpoint:       c.FullPath(),
		StatusCode:     http.StatusOK,
		Success:        true,
		RequestPayload: req,
		ResponseBody:   response,
	})

	c.JSON(http.StatusOK, response)
}

type BPJSCancelAntreanRequest struct {
	NomorKartu     string `json:"nomorkartu"`
	KodePoli       string `json:"kodepoli"`
	TanggalPeriksa string `json:"tanggalperiksa"`
	Keterangan     string `json:"keterangan"`
}

// BPJSCancelAntrean handles inbound cancel antrean from BPJS
func BPJSCancelAntrean(c *gin.Context) {
	var req BPJSCancelAntreanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
			Domain:       bpjs.DomainAntrean,
			Direction:    bpjs.DirectionInbound,
			Operation:    "cancel-antrean",
			Method:       http.MethodPut,
			Endpoint:     c.FullPath(),
			StatusCode:   http.StatusOK,
			Success:      false,
			ErrorMessage: "Invalid payload",
		})
		c.JSON(http.StatusOK, gin.H{"metadata": gin.H{"message": "Invalid payload", "code": 201}})
		return
	}

	// For MVP: Return success for cancellation
	response := gin.H{
		"metadata": gin.H{
			"message": "Ok",
			"code":    200,
		},
	}

	bpjs.RecordActivityLog(bpjs.ActivityLogEntry{
		Domain:         bpjs.DomainAntrean,
		Direction:      bpjs.DirectionInbound,
		Operation:      "cancel-antrean",
		Method:         http.MethodPut,
		Endpoint:       c.FullPath(),
		StatusCode:     http.StatusOK,
		Success:        true,
		RequestPayload: req,
		ResponseBody:   response,
	})

	c.JSON(http.StatusOK, response)
}
