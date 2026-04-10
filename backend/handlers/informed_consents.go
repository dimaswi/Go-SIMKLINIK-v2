package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

type UpdateInformedConsentRequest struct {
	ActionDescription    string `json:"action_description"`
	Risks                string `json:"risks"`
	Benefits             string `json:"benefits"`
	PatientDecision      string `json:"patient_decision"`
	ConsentDate          string `json:"consent_date"`
	ConsentGiverName     string `json:"consent_giver_name"`
	ConsentGiverRelation string `json:"consent_giver_relation"`
	ConsentGiverIDNumber string `json:"consent_giver_id_number"`
	WitnessName          string `json:"witness_name"`
	Notes                string `json:"notes"`
}

const informedConsentDefaultGiverRelation = "Pasien sendiri"

func normalizeInformedConsentDecision(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "approved":
		return "approved"
	case "declined":
		return "declined"
	default:
		return "pending"
	}
}

func parseInformedConsentDate(value string, fallback time.Time) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		if fallback.IsZero() {
			return time.Now(), nil
		}
		return fallback, nil
	}

	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04",
		"2006-01-02",
	}

	for _, layout := range layouts {
		parsed, err := time.ParseInLocation(layout, trimmed, time.Local)
		if err == nil {
			return parsed, nil
		}
	}

	return time.Time{}, strconv.ErrSyntax
}

func resolveInformedConsentConsentGiverName(consent models.InformedConsent, patient *models.Patient) string {
	if trimmed := strings.TrimSpace(consent.ConsentGiverName); trimmed != "" {
		return trimmed
	}
	if patient != nil {
		if trimmed := strings.TrimSpace(patient.FullName); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func resolveInformedConsentConsentGiverRelation(consent models.InformedConsent, patient *models.Patient) string {
	if trimmed := strings.TrimSpace(consent.ConsentGiverRelation); trimmed != "" {
		return trimmed
	}
	if patient != nil && strings.TrimSpace(patient.FullName) != "" {
		return informedConsentDefaultGiverRelation
	}
	return informedConsentDefaultGiverRelation
}

func resolveInformedConsentConsentGiverIDNumber(consent models.InformedConsent, patient *models.Patient) string {
	if trimmed := strings.TrimSpace(consent.ConsentGiverIDNumber); trimmed != "" {
		return trimmed
	}
	if patient != nil {
		if trimmed := strings.TrimSpace(patient.NIK); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func UpdateInformedConsent(c *gin.Context) {
	consentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid informed consent ID"})
		return
	}

	var consent models.InformedConsent
	if err := database.DB.Preload("MedicalRecord").Preload("Patient").First(&consent, consentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Informed consent tidak ditemukan"})
		return
	}

	if consent.MedicalRecord.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final"})
		return
	}
	if consent.MedicalRecord.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis berstatus batal"})
		return
	}

	var req UpdateInformedConsentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	consentDate, err := parseInformedConsentDate(req.ConsentDate, consent.ConsentDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tanggal informed consent tidak valid"})
		return
	}

	consentGiverName := strings.TrimSpace(req.ConsentGiverName)
	if consentGiverName == "" {
		consentGiverName = resolveInformedConsentConsentGiverName(consent, &consent.Patient)
	}
	consentGiverRelation := strings.TrimSpace(req.ConsentGiverRelation)
	if consentGiverRelation == "" {
		consentGiverRelation = resolveInformedConsentConsentGiverRelation(consent, &consent.Patient)
	}
	consentGiverIDNumber := strings.TrimSpace(req.ConsentGiverIDNumber)
	if consentGiverIDNumber == "" {
		consentGiverIDNumber = resolveInformedConsentConsentGiverIDNumber(consent, &consent.Patient)
	}

	updates := map[string]interface{}{
		"action_description":      strings.TrimSpace(req.ActionDescription),
		"risks":                   strings.TrimSpace(req.Risks),
		"benefits":                strings.TrimSpace(req.Benefits),
		"patient_decision":        normalizeInformedConsentDecision(req.PatientDecision),
		"consent_date":            consentDate,
		"consent_giver_name":      consentGiverName,
		"consent_giver_relation":  consentGiverRelation,
		"consent_giver_id_number": consentGiverIDNumber,
		"witness_name":            strings.TrimSpace(req.WitnessName),
		"notes":                   strings.TrimSpace(req.Notes),
	}

	if err := database.DB.Model(&models.InformedConsent{}).Where("id = ?", consent.ID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.First(&consent, consent.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":    consent,
		"message": "Informed consent berhasil diperbarui",
	})
}
