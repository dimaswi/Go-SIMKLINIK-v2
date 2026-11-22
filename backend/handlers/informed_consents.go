package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"image/png"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"starter/backend/config"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/boombuler/barcode"
	barcodeqr "github.com/boombuler/barcode/qr"
	"github.com/gin-gonic/gin"
)

type CreateInformedConsentRequest struct {
	VisitID              uint   `json:"visit_id"`
	MedicalRecordID      *uint  `json:"medical_record_id"`
	MedicalActionID      *uint  `json:"medical_action_id"`
	MedicalServiceID     *uint  `json:"medical_service_id"`
	ActionName           string `json:"action_name"`
	Diagnosis            string `json:"diagnosis"`
	ActionDescription    string `json:"action_description"`
	Risks                string `json:"risks"`
	Benefits             string `json:"benefits"`
	Alternatives         string `json:"alternatives"`
	Prognosis            string `json:"prognosis"`
	PatientDecision      string `json:"patient_decision"`
	ConsentDate          string `json:"consent_date"`
	ConsentGiverName     string  `json:"consent_giver_name"`
	ConsentGiverRelation string  `json:"consent_giver_relation"`
	ConsentGiverIDNumber string  `json:"consent_giver_id_number"`
	WitnessName          string  `json:"witness_name"`
	NurseName            string  `json:"nurse_name"`
	PatientSignature     *string `json:"patient_signature"`
	WitnessSignature     *string `json:"witness_signature"`
	Notes                string  `json:"notes"`
}

type UpdateInformedConsentRequest struct {
	MedicalActionID      *uint   `json:"medical_action_id"`
	MedicalServiceID     *uint   `json:"medical_service_id"`
	ActionName           string  `json:"action_name"`
	Diagnosis            string  `json:"diagnosis"`
	ActionDescription    string  `json:"action_description"`
	Risks                string  `json:"risks"`
	Benefits             string  `json:"benefits"`
	Alternatives         string  `json:"alternatives"`
	Prognosis            string  `json:"prognosis"`
	PatientDecision      string  `json:"patient_decision"`
	ConsentDate          string  `json:"consent_date"`
	ConsentGiverName     string  `json:"consent_giver_name"`
	ConsentGiverRelation string  `json:"consent_giver_relation"`
	ConsentGiverIDNumber string  `json:"consent_giver_id_number"`
	WitnessName          string  `json:"witness_name"`
	NurseName            string  `json:"nurse_name"`
	PatientSignature     *string `json:"patient_signature"`
	WitnessSignature     *string `json:"witness_signature"`
	Notes                string  `json:"notes"`
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

func resolveVisitDefaultDiagnosisForConsent(visitID uint) string {
	var records []models.MedicalRecord
	if err := database.DB.
		Preload("Diagnoses").
		Preload("Diagnoses.ICD10").
		Where("visit_id = ? AND section_type = ? AND status <> ?", visitID, "assessment", "cancelled").
		Order("updated_at DESC").
		Order("created_at DESC").
		Find(&records).Error; err != nil {
		return ""
	}

	for _, rec := range records {
		if inferSuratTypeFromEntryGroupKey(rec.EntryGroupKey) != "" {
			continue
		}
		if wd := strings.TrimSpace(rec.WorkingDiagnosis); wd != "" {
			return wd
		}
		for _, diag := range rec.Diagnoses {
			code := strings.TrimSpace(diag.ICD10.Code)
			name := strings.TrimSpace(diag.ICD10.Name)
			if code != "" && name != "" {
				return code + " - " + name
			}
			if name != "" {
				return name
			}
		}
		if ass := strings.TrimSpace(rec.Assessment); ass != "" {
			return ass
		}
	}
	return ""
}

func CreateInformedConsent(c *gin.Context) {
	var req CreateInformedConsentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.VisitID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan wajib diisi"})
		return
	}

	var visit models.Visit
	if err := database.DB.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		First(&visit, req.VisitID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	if visit.Status == "completed" || visit.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah difinalisasi atau dibatalkan"})
		return
	}

	var targetRecord models.MedicalRecord
	createdNewRecord := false
	if req.MedicalRecordID != nil && *req.MedicalRecordID > 0 {
		if err := database.DB.Where("id = ? AND visit_id = ?", *req.MedicalRecordID, visit.ID).First(&targetRecord).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis tujuan tidak ditemukan pada kunjungan ini"})
			return
		}
	} else {
		// Cari entri procedure aktif terlebih dahulu, atau entri aktif apa saja pada kunjungan ini
		err := database.DB.
			Where("visit_id = ? AND section_type = ? AND status <> ?", visit.ID, "procedure", "cancelled").
			Order("updated_at DESC").
			Order("id DESC").
			First(&targetRecord).Error
		if err != nil {
			err = database.DB.
				Where("visit_id = ? AND status <> ?", visit.ID, "cancelled").
				Order("updated_at DESC").
				Order("id DESC").
				First(&targetRecord).Error
		}
		if err != nil {
			allergyNotes := getPatientAllergyNotes(visit.PatientID)
			targetRecord = buildMedicalRecordDraftEntry(visit, "procedure", allergyNotes, "", "")
			if createErr := database.DB.Create(&targetRecord).Error; createErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyiapkan entri rekam medis untuk informed consent"})
				return
			}
			createdNewRecord = true
			_ = database.DB.Model(&visit).Updates(map[string]interface{}{
				"status":       "in_progress",
				"queue_status": "in_consultation",
			}).Error
		}
	}

	consentDate, err := parseInformedConsentDate(req.ConsentDate, time.Now())
	if err != nil {
		consentDate = time.Now()
	}

	actionName := strings.TrimSpace(req.ActionName)
	actionDesc := strings.TrimSpace(req.ActionDescription)
	benefits := strings.TrimSpace(req.Benefits)
	risks := strings.TrimSpace(req.Risks)
	alternatives := strings.TrimSpace(req.Alternatives)
	prognosis := strings.TrimSpace(req.Prognosis)

	if req.MedicalActionID != nil && *req.MedicalActionID > 0 {
		var action models.MedicalAction
		if err := database.DB.Preload("MedicalService").Preload("Targets").First(&action, *req.MedicalActionID).Error; err == nil {
			if actionName == "" {
				actionName = buildMedicalActionConsentActionName(action.MedicalService, action.Targets)
			}
			if actionDesc == "" {
				actionDesc = buildMedicalActionConsentDescription(action.MedicalService, action.Targets)
			}
			if benefits == "" {
				benefits = buildMedicalActionConsentBenefits(action.MedicalService)
			}
			if risks == "" {
				risks = buildMedicalActionConsentRisks(action.MedicalService)
			}
			if req.MedicalServiceID == nil && action.MedicalServiceID > 0 {
				svcID := action.MedicalServiceID
				req.MedicalServiceID = &svcID
			}
		}
	} else if req.MedicalServiceID != nil && *req.MedicalServiceID > 0 {
		var service models.MedicalService
		if err := database.DB.First(&service, *req.MedicalServiceID).Error; err == nil {
			if actionName == "" {
				actionName = strings.TrimSpace(service.Name)
			}
			if actionDesc == "" {
				actionDesc = buildMedicalActionConsentDescription(service, nil)
			}
			if benefits == "" {
				benefits = buildMedicalActionConsentBenefits(service)
			}
			if risks == "" {
				risks = buildMedicalActionConsentRisks(service)
			}
		}
	}

	if alternatives == "" {
		alternatives = "Terapi konservatif / medikamentosa atau rujukan tindakan lanjutan sesuai kondisi klinis."
	}
	if prognosis == "" {
		prognosis = "Dubia ad bonam (tergantung respons klinis pasien)."
	}

	diagnosis := strings.TrimSpace(req.Diagnosis)
	if diagnosis == "" {
		diagnosis = resolveVisitDefaultDiagnosisForConsent(visit.ID)
	}

	consentGiverName := strings.TrimSpace(req.ConsentGiverName)
	if consentGiverName == "" {
		consentGiverName = strings.TrimSpace(visit.Patient.FullName)
	}
	consentGiverRelation := strings.TrimSpace(req.ConsentGiverRelation)
	if consentGiverRelation == "" {
		consentGiverRelation = informedConsentDefaultGiverRelation
	}
	consentGiverIDNumber := strings.TrimSpace(req.ConsentGiverIDNumber)
	if consentGiverIDNumber == "" {
		consentGiverIDNumber = strings.TrimSpace(visit.Patient.NIK)
	}

	decision := normalizeInformedConsentDecision(req.PatientDecision)
	if strings.TrimSpace(req.PatientDecision) == "" {
		decision = "approved"
	}

	now := time.Now()
	patientSig := ""
	var patientSignedAt *time.Time
	if req.PatientSignature != nil && strings.TrimSpace(*req.PatientSignature) != "" {
		patientSig = strings.TrimSpace(*req.PatientSignature)
		patientSignedAt = &now
	}
	witnessSig := ""
	var witnessSignedAt *time.Time
	if req.WitnessSignature != nil && strings.TrimSpace(*req.WitnessSignature) != "" {
		witnessSig = strings.TrimSpace(*req.WitnessSignature)
		witnessSignedAt = &now
	}

	consent := models.InformedConsent{
		VisitID:              visit.ID,
		MedicalRecordID:      targetRecord.ID,
		MedicalActionID:      req.MedicalActionID,
		MedicalServiceID:     req.MedicalServiceID,
		PatientID:            visit.PatientID,
		DoctorID:             visit.DoctorID,
		NurseName:            strings.TrimSpace(req.NurseName),
		ActionName:           actionName,
		Diagnosis:            diagnosis,
		ActionDescription:    actionDesc,
		Benefits:             benefits,
		Risks:                risks,
		Alternatives:         alternatives,
		Prognosis:            prognosis,
		PatientDecision:      decision,
		ConsentDate:          consentDate,
		ConsentGiverName:     consentGiverName,
		ConsentGiverRelation: consentGiverRelation,
		ConsentGiverIDNumber: consentGiverIDNumber,
		PatientSignature:     patientSig,
		PatientSignedAt:      patientSignedAt,
		WitnessName:          strings.TrimSpace(req.WitnessName),
		WitnessSignature:     witnessSig,
		WitnessSignedAt:      witnessSignedAt,
		Notes:                strings.TrimSpace(req.Notes),
	}

	if err := database.DB.Create(&consent).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat informed consent: " + err.Error()})
		return
	}

	var refreshedRecord models.MedicalRecord
	_ = preloadMedicalRecordRelations(database.DB).First(&refreshedRecord, targetRecord.ID).Error

	c.JSON(http.StatusCreated, gin.H{
		"data":               consent,
		"medical_record":     refreshedRecord,
		"created_new_record": createdNewRecord,
		"message":            "Entri informed consent berhasil ditambahkan",
	})
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

	actionName := strings.TrimSpace(req.ActionName)
	if actionName == "" {
		actionName = consent.ActionName
	}

	updates := map[string]interface{}{
		"medical_action_id":       req.MedicalActionID,
		"medical_service_id":      req.MedicalServiceID,
		"action_name":             actionName,
		"diagnosis":               strings.TrimSpace(req.Diagnosis),
		"action_description":      strings.TrimSpace(req.ActionDescription),
		"risks":                   strings.TrimSpace(req.Risks),
		"benefits":                strings.TrimSpace(req.Benefits),
		"alternatives":            strings.TrimSpace(req.Alternatives),
		"prognosis":               strings.TrimSpace(req.Prognosis),
		"patient_decision":        normalizeInformedConsentDecision(req.PatientDecision),
		"consent_date":            consentDate,
		"consent_giver_name":      consentGiverName,
		"consent_giver_relation":  consentGiverRelation,
		"consent_giver_id_number": consentGiverIDNumber,
		"witness_name":            strings.TrimSpace(req.WitnessName),
		"nurse_name":              strings.TrimSpace(req.NurseName),
		"notes":                   strings.TrimSpace(req.Notes),
	}

	now := time.Now()
	if req.PatientSignature != nil {
		sig := strings.TrimSpace(*req.PatientSignature)
		updates["patient_signature"] = sig
		if sig != "" {
			if consent.PatientSignedAt == nil || sig != strings.TrimSpace(consent.PatientSignature) {
				updates["patient_signed_at"] = &now
			}
		} else {
			updates["patient_signed_at"] = nil
		}
	}
	if req.WitnessSignature != nil {
		sig := strings.TrimSpace(*req.WitnessSignature)
		updates["witness_signature"] = sig
		if sig != "" {
			if consent.WitnessSignedAt == nil || sig != strings.TrimSpace(consent.WitnessSignature) {
				updates["witness_signed_at"] = &now
			}
		} else {
			updates["witness_signed_at"] = nil
		}
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

func GetInformedConsent(c *gin.Context) {
	consentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID informed consent tidak valid"})
		return
	}

	var consent models.InformedConsent
	if err := database.DB.Preload("Patient").Preload("Doctor").First(&consent, consentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Informed consent tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": consent})
}

func normalizeConsentSignRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "patient", "pasien", "wali":
		return "patient"
	case "witness", "saksi":
		return "witness"
	default:
		return ""
	}
}

func computeInformedConsentSignMAC(consentID uint, role string) string {
	secret := strings.TrimSpace(config.Load().JWTSecret)
	if secret == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(fmt.Sprintf("ic-wet-sign|%d|%s", consentID, role)))
	checksum := mac.Sum(nil)
	return base64.RawURLEncoding.EncodeToString(checksum[:14])
}

func buildInformedConsentSignToken(consentID uint, role string) (string, error) {
	normalizedRole := normalizeConsentSignRole(role)
	if consentID == 0 || normalizedRole == "" {
		return "", errors.New("parameter token tanda tangan tidak valid")
	}
	roleCode := "p"
	if normalizedRole == "witness" {
		roleCode = "w"
	}
	idPart := strconv.FormatUint(uint64(consentID), 36)
	mac := computeInformedConsentSignMAC(consentID, normalizedRole)
	if mac == "" {
		return "", errors.New("secret token kosong")
	}
	return fmt.Sprintf("ics1.%s.%s.%s", idPart, roleCode, mac), nil
}

func parseInformedConsentSignToken(rawToken string) (uint, string, error) {
	parts := strings.Split(strings.TrimSpace(rawToken), ".")
	if len(parts) != 4 || parts[0] != "ics1" {
		return 0, "", errors.New("token tanda tangan tidak valid")
	}
	idVal, err := strconv.ParseUint(parts[1], 36, 64)
	if err != nil || idVal == 0 {
		return 0, "", errors.New("ID consent pada token tidak valid")
	}
	role := ""
	switch parts[2] {
	case "p":
		role = "patient"
	case "w":
		role = "witness"
	default:
		return 0, "", errors.New("peran penandatangan tidak dikenali")
	}
	expectedMAC := computeInformedConsentSignMAC(uint(idVal), role)
	if expectedMAC == "" || subtle.ConstantTimeCompare([]byte(expectedMAC), []byte(strings.TrimSpace(parts[3]))) != 1 {
		return 0, "", errors.New("validasi token tanda tangan gagal")
	}
	return uint(idVal), role, nil
}

func GetInformedConsentSignQR(c *gin.Context) {
	consentID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || consentID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID informed consent tidak valid"})
		return
	}
	role := normalizeConsentSignRole(c.Query("role"))
	if role == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Role penandatangan wajib 'patient' atau 'witness'"})
		return
	}

	var consent models.InformedConsent
	if err := database.DB.Select("id").First(&consent, uint(consentID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Informed consent tidak ditemukan"})
		return
	}

	token, err := buildInformedConsentSignToken(consent.ID, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	baseURL := strings.TrimSpace(c.Query("base_url"))
	if baseURL == "" {
		baseURL = resolveTTEVerificationBaseURLForRequest(c)
	}
	signURL := strings.TrimRight(baseURL, "/") + "/informed-consent/sign#" + url.PathEscape(token)

	if strings.EqualFold(strings.TrimSpace(c.Query("format")), "json") {
		c.JSON(http.StatusOK, gin.H{
			"data": gin.H{
				"token":    token,
				"role":     role,
				"sign_url": signURL,
			},
		})
		return
	}

	qrCode, err := barcodeqr.Encode(signURL, barcodeqr.M, barcodeqr.Auto)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat QR code"})
		return
	}
	scaledQR, err := barcode.Scale(qrCode, 420, 420)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal merender QR code"})
		return
	}

	c.Header("Cache-Control", "no-store")
	c.Header("Content-Type", "image/png")
	_ = png.Encode(c.Writer, scaledQR)
}

type publicInformedConsentSignSession struct {
	ConsentID            uint       `json:"consent_id"`
	Role                 string     `json:"role"`
	RoleLabel            string     `json:"role_label"`
	PatientToken         string     `json:"patient_token"`
	WitnessToken         string     `json:"witness_token"`
	HospitalName         string     `json:"hospital_name"`
	HospitalLogoURL      string     `json:"hospital_logo_url"`
	VisitNumber          string     `json:"visit_number"`
	PatientName          string     `json:"patient_name"`
	MedicalRecordNumber  string     `json:"medical_record_number"`
	DoctorName           string     `json:"doctor_name"`
	NurseName            string     `json:"nurse_name"`
	ActionName           string     `json:"action_name"`
	Diagnosis            string     `json:"diagnosis"`
	ActionDescription    string     `json:"action_description"`
	Benefits             string     `json:"benefits"`
	Risks                string     `json:"risks"`
	Alternatives         string     `json:"alternatives"`
	Prognosis            string     `json:"prognosis"`
	PatientDecision      string     `json:"patient_decision"`
	PatientDecisionLabel string     `json:"patient_decision_label"`
	DecisionStatement    string     `json:"decision_statement"`
	SignerName           string     `json:"signer_name"`
	ConsentGiverName     string     `json:"consent_giver_name"`
	ConsentGiverRelation string     `json:"consent_giver_relation"`
	ConsentGiverIDNumber string     `json:"consent_giver_id_number"`
	PatientSignature     string     `json:"patient_signature"`
	PatientSignedAt      *time.Time `json:"patient_signed_at,omitempty"`
	WitnessName          string     `json:"witness_name"`
	WitnessSignature     string     `json:"witness_signature"`
	WitnessSignedAt      *time.Time `json:"witness_signed_at,omitempty"`
	CurrentSignature     string     `json:"current_signature"`
	SignedAt             *time.Time `json:"signed_at,omitempty"`
	IsLocked             bool       `json:"is_locked"`
}

func buildPublicInformedConsentSignSession(consent models.InformedConsent, record models.MedicalRecord, role string) publicInformedConsentSignSession {
	patient := record.Patient
	if patient.ID == 0 {
		patient = consent.Patient
	}
	doctor := record.Doctor
	if doctor.ID == 0 {
		doctor = consent.Doctor
	}

	hospitalName, hospitalLogoURL, _ := resolveTTEVerificationBranding()
	consentGiverName := resolveInformedConsentConsentGiverName(consent, &patient)
	witnessName := strings.TrimSpace(consent.WitnessName)
	patientSig := strings.TrimSpace(consent.PatientSignature)
	witnessSig := strings.TrimSpace(consent.WitnessSignature)

	roleLabel := "Pasien / Wali Pemberi Persetujuan"
	signerName := consentGiverName
	currentSig := patientSig
	signedAt := consent.PatientSignedAt

	if role == "witness" {
		roleLabel = "Saksi"
		signerName = witnessName
		currentSig = witnessSig
		signedAt = consent.WitnessSignedAt
	}

	patientToken, _ := buildInformedConsentSignToken(consent.ID, "patient")
	witnessToken, _ := buildInformedConsentSignToken(consent.ID, "witness")

	isLocked := record.Status == "final" || record.Status == "cancelled" || record.Visit.Status == "completed" || record.Visit.Status == "cancelled"

	return publicInformedConsentSignSession{
		ConsentID:            consent.ID,
		Role:                 role,
		RoleLabel:            roleLabel,
		PatientToken:         patientToken,
		WitnessToken:         witnessToken,
		HospitalName:         hospitalName,
		HospitalLogoURL:      hospitalLogoURL,
		VisitNumber:          strings.TrimSpace(record.Visit.VisitNumber),
		PatientName:          strings.TrimSpace(patient.FullName),
		MedicalRecordNumber:  strings.TrimSpace(patient.MedicalRecordNumber),
		DoctorName:           strings.TrimSpace(doctor.FullName),
		NurseName:            strings.TrimSpace(consent.NurseName),
		ActionName:           strings.TrimSpace(consent.ActionName),
		Diagnosis:            strings.TrimSpace(consent.Diagnosis),
		ActionDescription:    strings.TrimSpace(consent.ActionDescription),
		Benefits:             strings.TrimSpace(consent.Benefits),
		Risks:                strings.TrimSpace(consent.Risks),
		Alternatives:         strings.TrimSpace(consent.Alternatives),
		Prognosis:            strings.TrimSpace(consent.Prognosis),
		PatientDecision:      normalizeInformedConsentDecision(consent.PatientDecision),
		PatientDecisionLabel: informedConsentDecisionLabel(consent.PatientDecision),
		DecisionStatement:    informedConsentDecisionStatement(consent.PatientDecision, consent.ActionName),
		SignerName:           signerName,
		ConsentGiverName:     consentGiverName,
		ConsentGiverRelation: resolveInformedConsentConsentGiverRelation(consent, &patient),
		ConsentGiverIDNumber: resolveInformedConsentConsentGiverIDNumber(consent, &patient),
		PatientSignature:     patientSig,
		PatientSignedAt:      consent.PatientSignedAt,
		WitnessName:          witnessName,
		WitnessSignature:     witnessSig,
		WitnessSignedAt:      consent.WitnessSignedAt,
		CurrentSignature:     currentSig,
		SignedAt:             signedAt,
		IsLocked:             isLocked,
	}
}

func GetPublicInformedConsentSignSession(c *gin.Context) {
	token := strings.TrimSpace(c.Query("token"))
	consentID, role, err := parseInformedConsentSignToken(token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var consent models.InformedConsent
	if err := database.DB.Preload("Patient").Preload("Doctor").First(&consent, consentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dokumen informed consent tidak ditemukan"})
		return
	}

	var record models.MedicalRecord
	_ = database.DB.Preload("Visit").Preload("Patient").Preload("Doctor").First(&record, consent.MedicalRecordID).Error

	session := buildPublicInformedConsentSignSession(consent, record, role)
	c.JSON(http.StatusOK, gin.H{"data": session})
}

type submitPublicInformedConsentSignRequest struct {
	Token                string `json:"token"`
	Role                 string `json:"role"`
	SignerName           string `json:"signer_name"`
	ConsentGiverRelation string `json:"consent_giver_relation"`
	ConsentGiverIDNumber string `json:"consent_giver_id_number"`
	SignatureData        string `json:"signature_data"`
}

func SubmitPublicInformedConsentSignature(c *gin.Context) {
	var req submitPublicInformedConsentSignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload tanda tangan tidak valid"})
		return
	}

	consentID, tokenRole, err := parseInformedConsentSignToken(req.Token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	role := normalizeConsentSignRole(req.Role)
	if role == "" {
		role = tokenRole
	}

	sigData := strings.TrimSpace(req.SignatureData)
	if sigData == "" || !strings.HasPrefix(sigData, "data:image/png;base64,") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Gambar tanda tangan basah wajib diisi"})
		return
	}

	var consent models.InformedConsent
	if err := database.DB.Preload("Patient").Preload("Doctor").First(&consent, consentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dokumen informed consent tidak ditemukan"})
		return
	}

	var record models.MedicalRecord
	if err := database.DB.Preload("Visit").Preload("Patient").Preload("Doctor").First(&record, consent.MedicalRecordID).Error; err == nil {
		if record.Status == "final" || record.Status == "cancelled" || record.Visit.Status == "completed" || record.Visit.Status == "cancelled" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah difinalisasi atau dibatalkan, tanda tangan tidak dapat diubah"})
			return
		}
	}

	now := time.Now()
	updates := map[string]interface{}{}
	signerName := strings.TrimSpace(req.SignerName)

	if role == "patient" {
		updates["patient_signature"] = sigData
		updates["patient_signed_at"] = &now
		if signerName != "" {
			updates["consent_giver_name"] = signerName
		}
		if rel := strings.TrimSpace(req.ConsentGiverRelation); rel != "" {
			updates["consent_giver_relation"] = rel
		}
		if idNum := strings.TrimSpace(req.ConsentGiverIDNumber); idNum != "" {
			updates["consent_giver_id_number"] = idNum
		}
	} else {
		updates["witness_signature"] = sigData
		updates["witness_signed_at"] = &now
		if signerName != "" {
			updates["witness_name"] = signerName
		}
	}

	if err := database.DB.Model(&models.InformedConsent{}).Where("id = ?", consent.ID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan tanda tangan"})
		return
	}

	_ = database.DB.Preload("Patient").Preload("Doctor").First(&consent, consent.ID).Error
	session := buildPublicInformedConsentSignSession(consent, record, role)
	c.JSON(http.StatusOK, gin.H{
		"data":    session,
		"message": "Tanda tangan berhasil disimpan",
	})
}

func DeleteInformedConsent(c *gin.Context) {
	consentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid informed consent ID"})
		return
	}

	var consent models.InformedConsent
	if err := database.DB.Preload("MedicalRecord").First(&consent, consentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Informed consent tidak ditemukan"})
		return
	}

	if consent.MedicalRecord.Status == "final" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rekam medis sudah final, informed consent tidak dapat dihapus"})
		return
	}

	if err := database.DB.Delete(&consent).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menghapus informed consent"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":            "Informed consent berhasil dihapus",
		"deleted_consent_id": consent.ID,
		"medical_record_id":  consent.MedicalRecordID,
	})
}
