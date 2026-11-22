package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type tteVerificationRequest struct {
	Token string `json:"token"`
}

type tteVerificationResponse struct {
	IsValid             bool   `json:"is_valid"`
	StatusLabel         string `json:"status_label"`
	StatusTone          string `json:"status_tone"`
	Title               string `json:"title"`
	Description         string `json:"description"`
	HospitalName        string `json:"hospital_name"`
	HospitalAddress     string `json:"hospital_address"`
	HospitalContact     string `json:"hospital_contact"`
	HospitalLogoURL     string `json:"hospital_logo_url"`
	HospitalWebsite     string `json:"hospital_website"`
	DocumentLabel       string `json:"document_label"`
	DocumentKey         string `json:"document_key"`
	SignerName          string `json:"signer_name"`
	SignedAtLabel       string `json:"signed_at_label"`
	VisitNumber         string `json:"visit_number"`
	PatientName         string `json:"patient_name"`
	MedicalRecordNumber string `json:"medical_record_number"`
	PolyclinicName      string `json:"polyclinic_name"`
	DocumentRef         string `json:"document_reference"`
	CheckedAtLabel      string `json:"checked_at_label"`
	VerificationHash    string `json:"verification_hash"`
	Guidance            string `json:"guidance"`
	Reason              string `json:"reason"`
}

func VerifyTTESignature(c *gin.Context) {
	var request tteVerificationRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token verifikasi wajib diisi"})
		return
	}

	response := buildInvalidTTEVerificationResponse("QR tidak valid atau sudah berubah.")
	claims, err := parseTTESignatureVerificationToken(strings.TrimSpace(request.Token))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"data": response})
		return
	}

	var signatureRequest models.DocumentSignatureRequest
	err = database.DB.
		Preload("Visit.Patient").
		Preload("Visit.Polyclinic").
		Preload("RequestedToUser").
		First(&signatureRequest, claims.RequestID).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			response.Reason = "Dokumen TTE tidak ditemukan."
		}
		c.JSON(http.StatusOK, gin.H{"data": response})
		return
	}

	if signatureRequest.Status != tteStatusSigned {
		response.Reason = "Dokumen ini tidak lagi berstatus ditandatangani."
		c.JSON(http.StatusOK, gin.H{"data": response})
		return
	}

	if !validateTTESignatureVerificationClaims(claims, signatureRequest) {
		response.Reason = "Hash validasi tidak cocok dengan dokumen yang tersimpan."
		c.JSON(http.StatusOK, gin.H{"data": response})
		return
	}

	signerName := strings.TrimSpace(signatureRequest.SignatureNameSnapshot)
	if signerName == "" {
		signerName = tteResolveUserDisplayName(signatureRequest.RequestedToUser)
	}

	hospitalName, hospitalAddress, hospitalContact, hospitalLogoURL, hospitalWebsite := resolveTTEVerificationBrandingFull()
	response = tteVerificationResponse{
		IsValid:             true,
		StatusLabel:         "TERVERIFIKASI SAH",
		StatusTone:          "valid",
		Title:               "Dokumen Medis Tervalidasi",
		Description:         "Dokumen ini sah dan telah ditandatangani secara elektronik (TTE) di sistem rekam medis klinik.",
		HospitalName:        hospitalName,
		HospitalAddress:     hospitalAddress,
		HospitalContact:     hospitalContact,
		HospitalLogoURL:     hospitalLogoURL,
		HospitalWebsite:     hospitalWebsite,
		DocumentLabel:       firstNonEmpty(strings.TrimSpace(signatureRequest.DocumentLabel), "Dokumen TTE"),
		DocumentKey:         strings.TrimSpace(signatureRequest.DocumentKey),
		SignerName:          firstNonEmpty(signerName, "Signer Internal"),
		SignedAtLabel:       formatDateTimeIndonesian(*signatureRequest.SignedAt),
		VisitNumber:         strings.TrimSpace(signatureRequest.Visit.VisitNumber),
		PatientName:         strings.TrimSpace(signatureRequest.Visit.Patient.FullName),
		MedicalRecordNumber: strings.TrimSpace(signatureRequest.Visit.Patient.MedicalRecordNumber),
		PolyclinicName:      strings.TrimSpace(signatureRequest.Visit.Polyclinic.Name),
		DocumentRef:         localizeTTEDocumentReference(signatureRequest.DocumentKey),
		CheckedAtLabel:      formatDateTimeIndonesian(time.Now()),
		VerificationHash:    buildTTEVerificationDisplayHash(claims, signatureRequest),
		Guidance:            "Cocokkan Nama Pasien, No. Kunjungan, Nama Penandatangan, dan Waktu TTE dengan lembar dokumen cetak yang Anda pegang.",
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}

func buildInvalidTTEVerificationResponse(reason string) tteVerificationResponse {
	hospitalName, hospitalAddress, hospitalContact, hospitalLogoURL, hospitalWebsite := resolveTTEVerificationBrandingFull()
	return tteVerificationResponse{
		IsValid:         false,
		StatusLabel:     "TIDAK VALID",
		StatusTone:      "invalid",
		Title:           "Validasi Dokumen Gagal",
		Description:     "Kode QR ini tidak dapat diverifikasi sebagai tanda tangan elektronik aktif.",
		HospitalName:    hospitalName,
		HospitalAddress: hospitalAddress,
		HospitalContact: hospitalContact,
		HospitalLogoURL: hospitalLogoURL,
		HospitalWebsite: hospitalWebsite,
		CheckedAtLabel:  formatDateTimeIndonesian(time.Now()),
		Guidance:        "Pastikan kode QR dipindai dari dokumen cetak terbaru dan dokumen belum dibatalkan.",
		Reason:          firstNonEmpty(strings.TrimSpace(reason), "Token validasi tidak dikenali."),
	}
}

func resolveTTEVerificationBranding() (string, string, string) {
	name, _, _, logo, web := resolveTTEVerificationBrandingFull()
	return name, logo, web
}

func resolveTTEVerificationBrandingFull() (string, string, string, string, string) {
	var settings []models.Setting
	database.DB.Find(&settings)

	settingsMap := make(map[string]string, len(settings))
	for _, setting := range settings {
		settingsMap[setting.Key] = strings.TrimSpace(setting.Value)
	}

	name := firstNonEmpty(settingsMap["hospital_name"], settingsMap["app_name"], "SIMKLINIK")
	addrParts := make([]string, 0, 2)
	if a := strings.TrimSpace(settingsMap["hospital_address"]); a != "" {
		addrParts = append(addrParts, a)
	}
	if c := strings.TrimSpace(settingsMap["hospital_city"]); c != "" {
		addrParts = append(addrParts, c)
	}
	address := strings.Join(addrParts, ", ")

	contactParts := make([]string, 0, 2)
	if p := strings.TrimSpace(settingsMap["hospital_phone"]); p != "" {
		contactParts = append(contactParts, "Telp: "+p)
	}
	if e := strings.TrimSpace(settingsMap["hospital_email"]); e != "" {
		contactParts = append(contactParts, e)
	}
	contact := strings.Join(contactParts, " | ")

	logo := strings.TrimSpace(firstNonEmpty(settingsMap["app_print_logo"], settingsMap["app_logo"]))
	website := normalizeTTEVerificationExternalURL(settingsMap["hospital_website"])
	return name, address, contact, logo, website
}

func normalizeTTEVerificationExternalURL(rawValue string) string {
	trimmed := strings.TrimSpace(rawValue)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(trimmed), "http://") || strings.HasPrefix(strings.ToLower(trimmed), "https://") {
		return trimmed
	}
	return "https://" + strings.Trim(trimmed, "/")
}

func buildTTEVerificationDisplayHash(claims *tteVerificationClaims, request models.DocumentSignatureRequest) string {
	rawHash := strings.TrimSpace("")
	if claims != nil {
		rawHash = strings.TrimSpace(claims.Signature)
	}
	if rawHash == "" {
		signedUnix := int64(0)
		if request.SignedAt != nil && !request.SignedAt.IsZero() {
			signedUnix = request.SignedAt.Unix()
		}
		rawHash = computeTTESignatureVerificationMAC(request.ID, request.DocumentKey, signedUnix)
	}
	if rawHash == "" {
		return "-"
	}

	sum := sha256.Sum256([]byte(rawHash))
	encoded := strings.ToUpper(hex.EncodeToString(sum[:8]))
	groups := make([]string, 0, 4)
	for start := 0; start < len(encoded); start += 4 {
		end := start + 4
		if end > len(encoded) {
			end = len(encoded)
		}
		groups = append(groups, encoded[start:end])
	}
	return strings.Join(groups, "-")
}

func localizeTTEDocumentReference(documentKey string) string {
	trimmed := strings.TrimSpace(documentKey)
	if trimmed == "" {
		return "Dokumen internal SIMKLINIK"
	}

	prefix := trimmed
	if separatorIndex := strings.Index(prefix, ":"); separatorIndex >= 0 {
		prefix = prefix[:separatorIndex]
	}

	switch prefix {
	case "control_letter":
		return "Dokumen surat kontrol"
	case "surat":
		return "Dokumen surat medis"
	case "procedure":
		return "Dokumen tindakan medis"
	case "prescription":
		return "Dokumen resep obat"
	case "laboratory_result":
		return "Dokumen hasil laboratorium"
	case "laboratory_result_staff":
		return "Dokumen hasil laboratorium - TTD petugas"
	case "radiology_result":
		return "Dokumen hasil radiologi"
	case "radiology_result_staff":
		return "Dokumen hasil radiologi - TTD petugas"
	case "informed_consent":
		return "Dokumen persetujuan tindakan - TTD dokter"
	case "informed_consent_nurse":
		return "Dokumen persetujuan tindakan - TTD perawat"
	case "odontogram":
		return "Dokumen odontogram"
	case "resume_medis":
		return "Dokumen resume medis"
	default:
		return fmt.Sprintf("Dokumen %s", strings.ReplaceAll(prefix, "_", " "))
	}
}
