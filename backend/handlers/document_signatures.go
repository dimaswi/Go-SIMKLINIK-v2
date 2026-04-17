package handlers

import (
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	tteStatusUnsigned = "unsigned"
	tteStatusPending  = "pending"
	tteStatusSigned   = "signed"
	tteStatusRejected = "rejected"
	tteStatusRevoked  = "revoked"
)

type tteVisitDocumentItem struct {
	DocumentKey           string            `json:"document_key"`
	DocumentType          string            `json:"document_type"`
	DocumentLabel         string            `json:"document_label"`
	Description           string            `json:"description"`
	SignerScope           string            `json:"signer_scope,omitempty"`
	SignerScopeLabel      string            `json:"signer_scope_label,omitempty"`
	PreferredSignerUserID *uint             `json:"preferred_signer_user_id,omitempty"`
	PreferredSignerName   string            `json:"preferred_signer_name,omitempty"`
	SignerCandidates      []tteSignerOption `json:"signer_candidates,omitempty"`
	SignerResolutionNote  string            `json:"signer_resolution_note,omitempty"`
	SourceID              *uint             `json:"source_id,omitempty"`
	MedicalRecordID       *uint             `json:"medical_record_id,omitempty"`
	PrintPath             string            `json:"print_path"`
	Status                string            `json:"status"`
	StatusLabel           string            `json:"status_label"`
	RequestID             *uint             `json:"request_id,omitempty"`
	SignerUserID          *uint             `json:"signer_user_id,omitempty"`
	SignerName            string            `json:"signer_name,omitempty"`
	RequestedByName       string            `json:"requested_by_name,omitempty"`
	RequestedAt           *time.Time        `json:"requested_at,omitempty"`
	RespondedAt           *time.Time        `json:"responded_at,omitempty"`
	SignedAt              *time.Time        `json:"signed_at,omitempty"`
	Notes                 string            `json:"notes,omitempty"`
	RejectionReason       string            `json:"rejection_reason,omitempty"`
	UpdatedAt             *time.Time        `json:"updated_at,omitempty"`
}

type tteSignerOption struct {
	ID       uint   `json:"id"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	IsDoctor bool   `json:"is_doctor"`
	DoctorID *uint  `json:"doctor_id,omitempty"`
}

type tteInboxItem struct {
	ID              uint       `json:"id"`
	VisitID         uint       `json:"visit_id"`
	VisitNumber     string     `json:"visit_number"`
	PatientName     string     `json:"patient_name"`
	PolyclinicName  string     `json:"polyclinic_name"`
	DocumentKey     string     `json:"document_key"`
	DocumentType    string     `json:"document_type"`
	DocumentLabel   string     `json:"document_label"`
	Status          string     `json:"status"`
	StatusLabel     string     `json:"status_label"`
	RequestedAt     time.Time  `json:"requested_at"`
	RespondedAt     *time.Time `json:"responded_at,omitempty"`
	SignedAt        *time.Time `json:"signed_at,omitempty"`
	RequestedByName string     `json:"requested_by_name"`
	RequestedByID   uint       `json:"requested_by_user_id"`
	SignerName      string     `json:"signer_name"`
	Notes           string     `json:"notes,omitempty"`
	RejectionReason string     `json:"rejection_reason,omitempty"`
	PrintPath       string     `json:"print_path"`
	VisitStatus     string     `json:"visit_status"`
}

type upsertTTERequestInput struct {
	VisitID           uint   `json:"visit_id"`
	DocumentKey       string `json:"document_key"`
	RequestedToUserID uint   `json:"requested_to_user_id"`
	Notes             string `json:"notes"`
}

type reviewTTERequestInput struct {
	Reason string `json:"reason"`
}

type tteSignerDirectory struct {
	All      []tteSignerOption
	ByUserID map[uint]tteSignerOption
}

type tteDocumentSignerSelection struct {
	Scope               string
	Label               string
	PreferredSignerID   *uint
	PreferredSignerName string
	Candidates          []tteSignerOption
	ResolutionNote      string
}

func GetTTESigners(c *gin.Context) {
	directory, err := loadTTESignerDirectory()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": directory.All})
}

func GetVisitTTEDocuments(c *gin.Context) {
	visitID, err := strconv.ParseUint(c.Param("visitId"), 10, 64)
	if err != nil || visitID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID kunjungan tidak valid"})
		return
	}

	visit, documents, err := buildTTEDocumentsForVisit(uint(visitID))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"visit_id":           visit.ID,
			"visit_number":       visit.VisitNumber,
			"visit_status":       visit.Status,
			"visit_is_finalized": strings.EqualFold(strings.TrimSpace(visit.Status), "completed"),
			"patient_name":       strings.TrimSpace(visit.Patient.FullName),
			"documents":          documents,
		},
	})
}

func UpsertTTEDocumentRequest(c *gin.Context) {
	actor := resolveVisitFinalizationActor(c)
	if actor.UserID == nil || *actor.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User tidak dikenali"})
		return
	}

	var input upsertTTERequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.VisitID == 0 || strings.TrimSpace(input.DocumentKey) == "" || input.RequestedToUserID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload request TTE tidak lengkap"})
		return
	}

	visit, documents, err := buildTTEDocumentsForVisit(input.VisitID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !strings.EqualFold(strings.TrimSpace(visit.Status), "completed") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan harus final sebelum pengajuan TTE"})
		return
	}

	requestedDocument, found := findTTEDocumentByKey(documents, input.DocumentKey)
	if !found {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dokumen TTE tidak ditemukan untuk kunjungan ini"})
		return
	}

	actorCanBypassSignerScope := false
	var actorUser models.User
	if err := database.DB.Preload("Role").Select("id", "role_id").First(&actorUser, *actor.UserID).Error; err == nil {
		actorCanBypassSignerScope = tteUserHasSignerBypassRole(actorUser)
	}

	var signer models.User
	if err := database.DB.Preload("Role.Permissions").First(&signer, input.RequestedToUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User penandatangan tidak ditemukan"})
		return
	}
	if !signer.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User penandatangan sedang nonaktif"})
		return
	}
	if !tteUserHasPermission(signer, "document_signatures.approve") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User yang dipilih belum memiliki akses ACC TTE"})
		return
	}
	if !tteDocumentAllowsSigner(requestedDocument, signer.ID, actorCanBypassSignerScope || tteUserHasSignerBypassRole(signer)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User yang dipilih tidak sesuai dengan target TTD dokumen ini"})
		return
	}

	now := time.Now()
	var request models.DocumentSignatureRequest
	result := database.DB.Where("document_key = ?", requestedDocument.DocumentKey).First(&request)
	if result.Error == nil {
		if request.Status == tteStatusSigned {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Dokumen ini sudah ditandatangani secara internal"})
			return
		}

		updates := map[string]any{
			"visit_id":                input.VisitID,
			"document_type":           requestedDocument.DocumentType,
			"document_label":          requestedDocument.DocumentLabel,
			"source_id":               requestedDocument.SourceID,
			"medical_record_id":       requestedDocument.MedicalRecordID,
			"requested_by_user_id":    *actor.UserID,
			"requested_to_user_id":    input.RequestedToUserID,
			"status":                  tteStatusPending,
			"requested_at":            now,
			"responded_at":            nil,
			"signed_at":               nil,
			"notes":                   strings.TrimSpace(input.Notes),
			"rejection_reason":        "",
			"signature_name_snapshot": "",
		}
		if err := database.DB.Model(&request).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else if result.Error == gorm.ErrRecordNotFound {
		request = models.DocumentSignatureRequest{
			VisitID:           input.VisitID,
			DocumentKey:       requestedDocument.DocumentKey,
			DocumentType:      requestedDocument.DocumentType,
			DocumentLabel:     requestedDocument.DocumentLabel,
			SourceID:          requestedDocument.SourceID,
			MedicalRecordID:   requestedDocument.MedicalRecordID,
			RequestedByUserID: *actor.UserID,
			RequestedToUserID: input.RequestedToUserID,
			Status:            tteStatusPending,
			RequestedAt:       now,
			Notes:             strings.TrimSpace(input.Notes),
		}
		if err := database.DB.Create(&request).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	updatedVisit, updatedDocuments, err := buildTTEDocumentsForVisit(input.VisitID)
	if err != nil {
		_ = updatedVisit
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	updatedDocument, _ := findTTEDocumentByKey(updatedDocuments, requestedDocument.DocumentKey)

	c.JSON(http.StatusOK, gin.H{
		"data":    updatedDocument,
		"message": "Request TTE berhasil dikirim",
	})
}

func GetIncomingTTEDocumentRequests(c *gin.Context) {
	actor := resolveVisitFinalizationActor(c)
	if actor.UserID == nil || *actor.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User tidak dikenali"})
		return
	}

	actorCanBypassSignerScope := tteActorCanBypassSignerScope(*actor.UserID)

	statusFilter := strings.ToLower(strings.TrimSpace(c.Query("status")))
	query := database.DB.
		Preload("Visit.Patient").
		Preload("Visit.Polyclinic").
		Preload("RequestedByUser").
		Preload("RequestedToUser")
	if !actorCanBypassSignerScope {
		query = query.Where("requested_to_user_id = ?", *actor.UserID)
	}
	if statusFilter != "" {
		query = query.Where("status = ?", statusFilter)
	}

	var requests []models.DocumentSignatureRequest
	if err := query.Order("CASE WHEN status = 'pending' THEN 0 ELSE 1 END").Order("updated_at DESC").Find(&requests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	items := make([]tteInboxItem, 0, len(requests))
	for _, request := range requests {
		items = append(items, tteInboxItem{
			ID:              request.ID,
			VisitID:         request.VisitID,
			VisitNumber:     strings.TrimSpace(request.Visit.VisitNumber),
			PatientName:     strings.TrimSpace(request.Visit.Patient.FullName),
			PolyclinicName:  strings.TrimSpace(request.Visit.Polyclinic.Name),
			DocumentKey:     request.DocumentKey,
			DocumentType:    request.DocumentType,
			DocumentLabel:   request.DocumentLabel,
			Status:          request.Status,
			StatusLabel:     tteDocumentStatusLabel(request.Status),
			RequestedAt:     request.RequestedAt,
			RespondedAt:     request.RespondedAt,
			SignedAt:        request.SignedAt,
			RequestedByName: tteResolveUserDisplayName(request.RequestedByUser),
			RequestedByID:   request.RequestedByUserID,
			SignerName:      tteResolveRequestSignerName(request),
			Notes:           strings.TrimSpace(request.Notes),
			RejectionReason: strings.TrimSpace(request.RejectionReason),
			PrintPath:       tteBuildPrintPath(request.DocumentType, request.DocumentKey, request.VisitID, request.SourceID, request.MedicalRecordID),
			VisitStatus:     strings.TrimSpace(request.Visit.Status),
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": items})
}

func ApproveTTEDocumentRequest(c *gin.Context) {
	reviewTTEDocumentRequest(c, tteStatusSigned)
}

func RejectTTEDocumentRequest(c *gin.Context) {
	reviewTTEDocumentRequest(c, tteStatusRejected)
}

func reviewTTEDocumentRequest(c *gin.Context, targetStatus string) {
	requestID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || requestID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID request TTE tidak valid"})
		return
	}

	actor := resolveVisitFinalizationActor(c)
	if actor.UserID == nil || *actor.UserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User tidak dikenali"})
		return
	}
	actorCanBypassSignerScope := tteActorCanBypassSignerScope(*actor.UserID)

	var input reviewTTERequestInput
	_ = c.ShouldBindJSON(&input)

	var request models.DocumentSignatureRequest
	if err := database.DB.Preload("Visit").Preload("RequestedByUser").Preload("RequestedToUser").First(&request, uint(requestID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Request TTE tidak ditemukan"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if request.RequestedToUserID != *actor.UserID && !actorCanBypassSignerScope {
		c.JSON(http.StatusForbidden, gin.H{"error": "Request ini bukan ditujukan ke user saat ini"})
		return
	}
	if request.Status != tteStatusPending {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Request TTE ini tidak lagi menunggu ACC"})
		return
	}
	if !strings.EqualFold(strings.TrimSpace(request.Visit.Status), "completed") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kunjungan sudah tidak final. Request TTE tidak bisa diproses"})
		return
	}

	now := time.Now()
	signatureName := tteResolveUserDisplayName(request.RequestedToUser)
	if signatureName == "-" {
		signatureName = firstNonEmpty(strings.TrimSpace(actor.Name), strings.TrimSpace(actor.Email), "Signer Internal")
	}
	updates := map[string]any{
		"status":                  targetStatus,
		"responded_at":            now,
		"signature_name_snapshot": signatureName,
	}
	if targetStatus == tteStatusSigned {
		updates["signed_at"] = now
		updates["rejection_reason"] = ""
	} else {
		updates["signed_at"] = nil
		updates["rejection_reason"] = strings.TrimSpace(input.Reason)
	}

	if err := database.DB.Model(&request).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Preload("Visit.Patient").Preload("Visit.Polyclinic").Preload("RequestedByUser").Preload("RequestedToUser").First(&request, request.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	message := "Request TTE ditolak"
	if targetStatus == tteStatusSigned {
		message = "Request TTE berhasil di-ACC"
	}

	c.JSON(http.StatusOK, gin.H{
		"data": tteInboxItem{
			ID:              request.ID,
			VisitID:         request.VisitID,
			VisitNumber:     strings.TrimSpace(request.Visit.VisitNumber),
			PatientName:     strings.TrimSpace(request.Visit.Patient.FullName),
			PolyclinicName:  strings.TrimSpace(request.Visit.Polyclinic.Name),
			DocumentKey:     request.DocumentKey,
			DocumentType:    request.DocumentType,
			DocumentLabel:   request.DocumentLabel,
			Status:          request.Status,
			StatusLabel:     tteDocumentStatusLabel(request.Status),
			RequestedAt:     request.RequestedAt,
			RespondedAt:     request.RespondedAt,
			SignedAt:        request.SignedAt,
			RequestedByName: tteResolveUserDisplayName(request.RequestedByUser),
			RequestedByID:   request.RequestedByUserID,
			SignerName:      tteResolveRequestSignerName(request),
			Notes:           strings.TrimSpace(request.Notes),
			RejectionReason: strings.TrimSpace(request.RejectionReason),
			PrintPath:       tteBuildPrintPath(request.DocumentType, request.DocumentKey, request.VisitID, request.SourceID, request.MedicalRecordID),
			VisitStatus:     strings.TrimSpace(request.Visit.Status),
		},
		"message": message,
	})
}

func buildTTEDocumentsForVisit(visitID uint) (models.Visit, []tteVisitDocumentItem, error) {
	var visit models.Visit
	if err := database.DB.Preload("Patient").Preload("Polyclinic").Preload("Doctor").Preload("Doctor.Employee").First(&visit, visitID).Error; err != nil {
		return visit, nil, err
	}

	var records []models.MedicalRecord
	if err := database.DB.
		Preload("Doctor").
		Preload("Doctor.Employee").
		Preload("LaboratoryProcessor").
		Preload("RadiologyProcessor").
		Preload("Actions").
		Preload("Prescriptions").
		Preload("PrescriptionCompounds").
		Preload("LaboratoryOrderItems").
		Preload("LaboratoryOrderItems.ResultByUser").
		Preload("LaboratoryOrderItems.ParameterResults").
		Preload("LaboratoryOrderItems.ParameterResults.ResultByUser").
		Preload("RadiologyOrderItems").
		Preload("RadiologyOrderItems.ResultByUser").
		Preload("RadiologyOrderItems.ParameterResults").
		Preload("RadiologyOrderItems.ParameterResults.ResultByUser").
		Preload("InformedConsents").
		Preload("InformedConsents.Doctor").
		Preload("InformedConsents.Doctor.Employee").
		Where("visit_id = ?", visitID).
		Order("record_date ASC").
		Order("created_at ASC").
		Find(&records).Error; err != nil {
		return visit, nil, err
	}

	var odontograms []models.OdontogramEntry
	if err := database.DB.
		Preload("Doctor").
		Preload("Doctor.Employee").
		Where("visit_id = ?", visitID).
		Where("status <> ?", "cancelled").
		Order("created_at ASC").
		Find(&odontograms).Error; err != nil {
		return visit, nil, err
	}

	var requests []models.DocumentSignatureRequest
	if err := database.DB.
		Preload("RequestedByUser").
		Preload("RequestedToUser").
		Where("visit_id = ?", visitID).
		Find(&requests).Error; err != nil {
		return visit, nil, err
	}

	requestByKey := make(map[string]models.DocumentSignatureRequest, len(requests))
	for _, request := range requests {
		requestByKey[request.DocumentKey] = request
	}

	signerDirectory, err := loadTTESignerDirectory()
	if err != nil {
		return visit, nil, err
	}

	documents := make([]tteVisitDocumentItem, 0)

	var latestOutcome *models.MedicalRecord
	for index := range records {
		record := &records[index]
		if strings.EqualFold(strings.TrimSpace(record.SectionType), "outcome") {
			latestOutcome = record
		}
	}
	if latestOutcome != nil {
		documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
			DocumentKey:     "resume_medis:visit:" + strconv.FormatUint(uint64(visit.ID), 10),
			DocumentType:    "resume_medis",
			DocumentLabel:   "Resume Medis",
			Description:     "Ringkasan akhir kunjungan pasien yang dicetak dari visit final.",
			SourceID:        &latestOutcome.ID,
			MedicalRecordID: &latestOutcome.ID,
			PrintPath:       "/api/medical-records/visit/" + strconv.FormatUint(uint64(visit.ID), 10) + "/print/resume-medis",
		}, tteBuildDoctorSignerSelection("TTD Dokter Pemeriksa", visit.DoctorID, &visit.Doctor, signerDirectory), requestByKey))

		if strings.EqualFold(strings.TrimSpace(latestOutcome.Disposition), "kontrol") && latestOutcome.FollowUpAt != nil && !latestOutcome.FollowUpAt.IsZero() {
			documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
				DocumentKey:     buildTTEControlLetterDocumentKey(visit.ID),
				DocumentType:    "control_letter",
				DocumentLabel:   "Surat Kontrol",
				Description:     "Dokumen surat kontrol untuk kunjungan final dengan disposition kontrol.",
				SourceID:        &latestOutcome.ID,
				MedicalRecordID: &latestOutcome.ID,
				PrintPath:       "/api/medical-records/visit/" + strconv.FormatUint(uint64(visit.ID), 10) + "/print/surat-kontrol",
			}, tteBuildDoctorSignerSelection("TTD Dokter Pemeriksa", visit.DoctorID, &visit.Doctor, signerDirectory), requestByKey))
		}
	}

	documents = append(documents, buildTTESuratDocuments(visit, records, signerDirectory, requestByKey)...)

	for index := range records {
		record := records[index]
		recordID := record.ID
		normalizedSection := normalizeMedicalRecordSection(record.SectionType)

		if normalizedSection == "procedure" {
			documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
				DocumentKey:     "procedure:" + strconv.FormatUint(uint64(recordID), 10),
				DocumentType:    "procedure",
				DocumentLabel:   "Dokumen Tindakan #" + strconv.FormatUint(uint64(recordID), 10),
				Description:     "Ringkasan tindakan medis yang tercatat pada entri rekam medis.",
				SourceID:        &recordID,
				MedicalRecordID: &recordID,
				PrintPath:       "/api/medical-records/" + strconv.FormatUint(uint64(recordID), 10) + "/print/procedure",
			}, tteBuildDoctorSignerSelection("TTD Dokter Pelaksana Tindakan", record.DoctorID, &record.Doctor, signerDirectory), requestByKey))
		}

		if len(record.Prescriptions) > 0 || len(record.PrescriptionCompounds) > 0 {
			documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
				DocumentKey:     "prescription:" + strconv.FormatUint(uint64(recordID), 10),
				DocumentType:    "prescription",
				DocumentLabel:   "Resep Obat #" + strconv.FormatUint(uint64(recordID), 10),
				Description:     "Dokumen resep obat hasil visit untuk proses farmasi dan arsip.",
				SourceID:        &recordID,
				MedicalRecordID: &recordID,
				PrintPath:       "/api/medical-records/" + strconv.FormatUint(uint64(recordID), 10) + "/print/prescription",
			}, tteBuildDoctorSignerSelection("TTD Dokter Peresep", record.DoctorID, &record.Doctor, signerDirectory), requestByKey))
		}

		if normalizedSection == "laboratory" && len(record.LaboratoryOrderItems) > 0 {
			workflowStatus := getLaboratoryWorkflowStatus(record)
			documentType := "laboratory_ticket"
			documentLabel := "Tiket Laboratorium #" + strconv.FormatUint(uint64(recordID), 10)
			description := "Dokumen tiket order laboratorium berdasarkan order penunjang visit."
			printPath := "/api/medical-records/" + strconv.FormatUint(uint64(recordID), 10) + "/print/laboratory-ticket"

			if workflowStatus == supportingOrderWorkflowStatusCompleted {
				documentType = "laboratory_result"
				documentLabel = "Hasil Laboratorium #" + strconv.FormatUint(uint64(recordID), 10)
				description = "Dokumen hasil laboratorium berdasarkan order penunjang visit."
				printPath = "/api/medical-records/" + strconv.FormatUint(uint64(recordID), 10) + "/print/laboratory-result"
			}

			documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
				DocumentKey:     documentType + ":" + strconv.FormatUint(uint64(recordID), 10),
				DocumentType:    documentType,
				DocumentLabel:   documentLabel + map[bool]string{true: " · TTD Dokter", false: ""}[workflowStatus == supportingOrderWorkflowStatusCompleted],
				Description:     description,
				SourceID:        &recordID,
				MedicalRecordID: &recordID,
				PrintPath:       printPath,
			}, tteBuildDoctorSignerSelection("TTD Dokter Pengorder Laboratorium", record.DoctorID, &record.Doctor, signerDirectory), requestByKey))

			if workflowStatus == supportingOrderWorkflowStatusCompleted {
				staffDocumentKey := "laboratory_result_staff:" + strconv.FormatUint(uint64(recordID), 10)
				documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
					DocumentKey:     staffDocumentKey,
					DocumentType:    "laboratory_result_staff",
					DocumentLabel:   documentLabel + " · TTD Petugas Lab",
					Description:     "TTE internal untuk petugas laboratorium pada dokumen hasil laboratorium.",
					SourceID:        &recordID,
					MedicalRecordID: &recordID,
					PrintPath:       printPath,
				}, tteBuildOperationalSignerSelection("TTD Petugas Laboratorium", tteResolveLaboratoryStaffSignerUserIDs(record), signerDirectory, "Petugas laboratorium belum terhubung ke akun ACC TTE. Pilih manual dari daftar petugas bila perlu."), requestByKey))
			}
		}

		if normalizedSection == "radiology" && len(record.RadiologyOrderItems) > 0 {
			workflowStatus := getRadiologyWorkflowStatus(record)
			documentType := "radiology_ticket"
			documentLabel := "Tiket Radiologi #" + strconv.FormatUint(uint64(recordID), 10)
			description := "Dokumen tiket order radiologi berdasarkan order penunjang visit."
			printPath := "/api/medical-records/" + strconv.FormatUint(uint64(recordID), 10) + "/print/radiology-ticket"

			if workflowStatus == supportingOrderWorkflowStatusCompleted {
				documentType = "radiology_result"
				documentLabel = "Hasil Radiologi #" + strconv.FormatUint(uint64(recordID), 10)
				description = "Dokumen hasil radiologi berdasarkan order penunjang visit."
				printPath = "/api/medical-records/" + strconv.FormatUint(uint64(recordID), 10) + "/print/radiology-result"
			}

			documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
				DocumentKey:     documentType + ":" + strconv.FormatUint(uint64(recordID), 10),
				DocumentType:    documentType,
				DocumentLabel:   documentLabel + map[bool]string{true: " · TTD Dokter", false: ""}[workflowStatus == supportingOrderWorkflowStatusCompleted],
				Description:     description,
				SourceID:        &recordID,
				MedicalRecordID: &recordID,
				PrintPath:       printPath,
			}, tteBuildDoctorSignerSelection("TTD Dokter Pengorder Radiologi", record.DoctorID, &record.Doctor, signerDirectory), requestByKey))

			if workflowStatus == supportingOrderWorkflowStatusCompleted {
				staffDocumentKey := "radiology_result_staff:" + strconv.FormatUint(uint64(recordID), 10)
				documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
					DocumentKey:     staffDocumentKey,
					DocumentType:    "radiology_result_staff",
					DocumentLabel:   documentLabel + " · TTD Petugas Radiologi",
					Description:     "TTE internal untuk petugas radiologi pada dokumen hasil radiologi.",
					SourceID:        &recordID,
					MedicalRecordID: &recordID,
					PrintPath:       printPath,
				}, tteBuildOperationalSignerSelection("TTD Petugas Radiologi", tteResolveRadiologyStaffSignerUserIDs(record), signerDirectory, "Petugas radiologi belum terhubung ke akun ACC TTE. Pilih manual dari daftar petugas bila perlu."), requestByKey))
			}
		}

		for _, consent := range record.InformedConsents {
			consentID := consent.ID
			label := firstNonEmpty(strings.TrimSpace(consent.ActionName), "Informed Consent")
			documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
				DocumentKey:     "informed_consent:" + strconv.FormatUint(uint64(consentID), 10),
				DocumentType:    "informed_consent",
				DocumentLabel:   label,
				Description:     "Dokumen informed consent yang disimpan dari tindakan medis.",
				SourceID:        &consentID,
				MedicalRecordID: &recordID,
				PrintPath:       "/api/informed-consents/" + strconv.FormatUint(uint64(consentID), 10) + "/print",
			}, tteBuildDoctorSignerSelection("TTD Dokter Tindakan", consent.DoctorID, &consent.Doctor, signerDirectory), requestByKey))
		}
	}

	for _, entry := range odontograms {
		entryID := entry.ID
		label := "Odontogram"
		if strings.TrimSpace(entry.ChartType) != "" {
			label = label + " " + strings.Title(strings.TrimSpace(entry.ChartType))
		}
		documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
			DocumentKey:   "odontogram:" + strconv.FormatUint(uint64(entryID), 10),
			DocumentType:  "odontogram",
			DocumentLabel: label,
			Description:   "Dokumen odontogram berdasarkan chart gigi pasien.",
			SourceID:      &entryID,
			PrintPath:     "/api/odontogram-entries/" + strconv.FormatUint(uint64(entryID), 10) + "/print",
		}, tteBuildDoctorSignerSelection("TTD Dokter Gigi Pemeriksa", entry.DoctorID, &entry.Doctor, signerDirectory), requestByKey))
	}

	sort.SliceStable(documents, func(i, j int) bool {
		leftPending := documents[i].Status == tteStatusPending
		rightPending := documents[j].Status == tteStatusPending
		if leftPending != rightPending {
			return leftPending
		}
		leftSigned := documents[i].Status == tteStatusSigned
		rightSigned := documents[j].Status == tteStatusSigned
		if leftSigned != rightSigned {
			return !leftSigned
		}
		return strings.ToLower(documents[i].DocumentLabel) < strings.ToLower(documents[j].DocumentLabel)
	})

	return visit, documents, nil
}

type tteSuratDocumentCandidate struct {
	EntryGroupKey string
	FallbackKey   string
	Assessment    *models.MedicalRecord
	Outcome       *models.MedicalRecord
}

func buildTTESuratDocuments(
	visit models.Visit,
	records []models.MedicalRecord,
	signerDirectory tteSignerDirectory,
	requestByKey map[string]models.DocumentSignatureRequest,
) []tteVisitDocumentItem {
	candidateByKey := make(map[string]*tteSuratDocumentCandidate)
	orderedKeys := make([]string, 0)

	for index := range records {
		record := &records[index]
		if !strings.EqualFold(strings.TrimSpace(record.SheetKey), medicalRecordSheetKeySurat) {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(record.Status), "cancelled") {
			continue
		}

		entryGroupKey := strings.TrimSpace(record.EntryGroupKey)
		candidateKey := entryGroupKey
		if candidateKey == "" {
			candidateKey = "record:" + strconv.FormatUint(uint64(record.ID), 10)
		}

		candidate, exists := candidateByKey[candidateKey]
		if !exists {
			candidate = &tteSuratDocumentCandidate{
				EntryGroupKey: entryGroupKey,
				FallbackKey:   candidateKey,
			}
			candidateByKey[candidateKey] = candidate
			orderedKeys = append(orderedKeys, candidateKey)
		}

		sectionType := normalizeMedicalRecordSection(record.SectionType)
		if sectionType == "assessment" && candidate.Assessment == nil {
			candidate.Assessment = record
		}
		if sectionType == "outcome" && candidate.Outcome == nil {
			candidate.Outcome = record
		}
		if candidate.Assessment == nil && candidate.Outcome == nil {
			candidate.Assessment = record
		}
	}

	documents := make([]tteVisitDocumentItem, 0, len(orderedKeys))
	for _, key := range orderedKeys {
		candidate := candidateByKey[key]
		if candidate == nil {
			continue
		}

		sourceRecord := candidate.Outcome
		if sourceRecord == nil {
			sourceRecord = candidate.Assessment
		}
		if sourceRecord == nil {
			continue
		}

		sourceID := sourceRecord.ID
		doctorID, doctor := tteResolveSuratSigner(candidate, visit)
		suratType := inferSuratTypeFromEntryGroupKey(key)
		documentLabel := firstNonEmpty(getSuratTypeLabel(suratType), "Surat Keterangan")

		documentKey := buildTTESuratDocumentKey(visit.ID, key)
		printPath := buildTTESuratPrintPath(visit.ID, candidate.EntryGroupKey)
		if printPath == "" {
			printPath = "/api/medical-records/visit/" + strconv.FormatUint(uint64(visit.ID), 10) + "/print/surat?record_ids=" + strconv.FormatUint(uint64(sourceID), 10)
		}

		documents = append(documents, tteDecorateVisitDocument(tteVisitDocumentItem{
			DocumentKey:     documentKey,
			DocumentType:    "surat",
			DocumentLabel:   documentLabel,
			Description:     "Dokumen surat medis berdasarkan entri surat pada visit.",
			SourceID:        &sourceID,
			MedicalRecordID: &sourceID,
			PrintPath:       printPath,
		}, tteBuildDoctorSignerSelection("TTD Dokter Pemeriksa Surat", doctorID, doctor, signerDirectory), requestByKey))
	}

	return documents
}

func tteResolveSuratSigner(candidate *tteSuratDocumentCandidate, visit models.Visit) (uint, *models.Doctor) {
	if candidate != nil {
		if candidate.Outcome != nil && candidate.Outcome.DoctorID != 0 {
			doctor := candidate.Outcome.Doctor
			return candidate.Outcome.DoctorID, &doctor
		}
		if candidate.Assessment != nil && candidate.Assessment.DoctorID != 0 {
			doctor := candidate.Assessment.Doctor
			return candidate.Assessment.DoctorID, &doctor
		}
	}

	if visit.DoctorID != 0 {
		doctor := visit.Doctor
		return visit.DoctorID, &doctor
	}

	return 0, nil
}

func tteDecorateVisitDocument(document tteVisitDocumentItem, signerSelection tteDocumentSignerSelection, requestByKey map[string]models.DocumentSignatureRequest) tteVisitDocumentItem {
	document = tteApplySignerSelection(document, signerSelection)

	request, exists := requestByKey[document.DocumentKey]
	if !exists {
		document.Status = tteStatusUnsigned
		document.StatusLabel = tteDocumentStatusLabel(tteStatusUnsigned)
		return document
	}

	document.Status = request.Status
	document.StatusLabel = tteDocumentStatusLabel(request.Status)
	document.RequestID = &request.ID
	document.SignerUserID = &request.RequestedToUserID
	document.SignerName = tteResolveUserDisplayName(request.RequestedToUser)
	document.RequestedByName = tteResolveUserDisplayName(request.RequestedByUser)
	document.RequestedAt = &request.RequestedAt
	document.RespondedAt = request.RespondedAt
	document.SignedAt = request.SignedAt
	document.Notes = strings.TrimSpace(request.Notes)
	document.RejectionReason = strings.TrimSpace(request.RejectionReason)
	document.UpdatedAt = &request.UpdatedAt
	return document
}

func loadTTESignerDirectory() (tteSignerDirectory, error) {
	var users []models.User
	if err := database.DB.
		Preload("Role.Permissions").
		Where("is_active = ?", true).
		Order("full_name ASC").
		Order("email ASC").
		Find(&users).Error; err != nil {
		return tteSignerDirectory{}, err
	}

	var doctors []models.Doctor
	if err := database.DB.
		Preload("Employee").
		Where("is_active = ?", true).
		Find(&doctors).Error; err != nil {
		return tteSignerDirectory{}, err
	}

	doctorByUserID := make(map[uint]models.Doctor, len(doctors))
	for _, doctor := range doctors {
		resolvedUserID := tteResolveDoctorLinkedUserID(doctor)
		if resolvedUserID == 0 {
			continue
		}
		doctorByUserID[resolvedUserID] = doctor
	}

	directory := tteSignerDirectory{
		All:      make([]tteSignerOption, 0, len(users)),
		ByUserID: make(map[uint]tteSignerOption, len(users)),
	}

	for _, user := range users {
		if !tteUserHasPermission(user, "document_signatures.approve") {
			continue
		}

		doctor, isDoctor := doctorByUserID[user.ID]
		option := tteSignerOption{
			ID:       user.ID,
			FullName: firstNonEmpty(strings.TrimSpace(user.FullName), tteResolveDoctorDisplayName(doctor), strings.TrimSpace(user.Username), strings.TrimSpace(user.Email)),
			Email:    strings.TrimSpace(user.Email),
			IsDoctor: isDoctor,
		}
		if isDoctor {
			doctorID := doctor.ID
			option.DoctorID = &doctorID
		}

		directory.All = append(directory.All, option)
		directory.ByUserID[user.ID] = option
	}

	return directory, nil
}

func tteApplySignerSelection(document tteVisitDocumentItem, signerSelection tteDocumentSignerSelection) tteVisitDocumentItem {
	document.SignerScope = signerSelection.Scope
	document.SignerScopeLabel = signerSelection.Label
	document.PreferredSignerUserID = signerSelection.PreferredSignerID
	document.PreferredSignerName = strings.TrimSpace(signerSelection.PreferredSignerName)
	document.SignerCandidates = signerSelection.Candidates
	document.SignerResolutionNote = strings.TrimSpace(signerSelection.ResolutionNote)
	return document
}

func tteBuildDoctorSignerSelection(targetLabel string, doctorID uint, preloadedDoctor *models.Doctor, signerDirectory tteSignerDirectory) tteDocumentSignerSelection {
	selection := tteDocumentSignerSelection{
		Scope: "doctor",
		Label: targetLabel,
	}

	doctorName, linkedUserID := tteResolveDoctorSignerIdentity(preloadedDoctor, doctorID)

	selection.PreferredSignerName = doctorName
	if linkedUserID == 0 {
		selection.ResolutionNote = firstNonEmpty(
			buildTTEDoctorSignerResolutionNote(doctorName, false),
			"Dokter pada dokumen ini belum terhubung ke akun aplikasi melalui master pegawai atau profil dokter.",
		)
		return selection
	}

	option, exists := signerDirectory.ByUserID[linkedUserID]
	if !exists {
		selection.ResolutionNote = firstNonEmpty(
			buildTTEDoctorSignerResolutionNote(doctorName, true),
			"Akun dokter pada dokumen ini belum aktif atau belum memiliki akses ACC TTE.",
		)
		return selection
	}

	preferredSignerID := option.ID
	selection.PreferredSignerID = &preferredSignerID
	selection.PreferredSignerName = option.FullName
	selection.Candidates = []tteSignerOption{option}
	return selection
}

func tteBuildOperationalSignerSelection(targetLabel string, preferredUserIDs []uint, signerDirectory tteSignerDirectory, unresolvedNote string) tteDocumentSignerSelection {
	selection := tteDocumentSignerSelection{
		Scope: "staff",
		Label: targetLabel,
	}

	matched := make([]tteSignerOption, 0, len(preferredUserIDs))
	seen := make(map[uint]struct{}, len(preferredUserIDs))
	for _, userID := range preferredUserIDs {
		if userID == 0 {
			continue
		}
		if _, exists := seen[userID]; exists {
			continue
		}
		seen[userID] = struct{}{}
		option, exists := signerDirectory.ByUserID[userID]
		if !exists || option.IsDoctor {
			continue
		}
		matched = append(matched, option)
	}

	if len(matched) > 0 {
		preferredSignerID := matched[0].ID
		selection.PreferredSignerID = &preferredSignerID
		selection.PreferredSignerName = matched[0].FullName
		selection.Candidates = matched
		if len(matched) > 1 {
			selection.ResolutionNote = "Terdapat lebih dari satu petugas hasil untuk dokumen ini. Pilih user yang akan menandatangani secara internal."
		}
		return selection
	}

	fallbackCandidates := make([]tteSignerOption, 0, len(signerDirectory.All))
	for _, option := range signerDirectory.All {
		if option.IsDoctor {
			continue
		}
		fallbackCandidates = append(fallbackCandidates, option)
	}
	selection.Candidates = fallbackCandidates
	if len(fallbackCandidates) == 0 {
		selection.ResolutionNote = firstNonEmpty(strings.TrimSpace(unresolvedNote), "Belum ada user petugas aktif dengan akses ACC TTE.")
		return selection
	}
	selection.ResolutionNote = firstNonEmpty(strings.TrimSpace(unresolvedNote), "Signer petugas belum terhubung otomatis, silakan pilih manual dari daftar user petugas.")
	return selection
}

func tteResolveLaboratoryStaffSignerUserIDs(record models.MedicalRecord) []uint {
	userIDs := make([]uint, 0, 8)
	if record.LaboratoryProcessedBy != nil && *record.LaboratoryProcessedBy != 0 {
		userIDs = append(userIDs, *record.LaboratoryProcessedBy)
	}
	for _, item := range record.LaboratoryOrderItems {
		if item.ResultBy != nil && *item.ResultBy != 0 {
			userIDs = append(userIDs, *item.ResultBy)
		}
		for _, parameter := range item.ParameterResults {
			if parameter.ResultBy != nil && *parameter.ResultBy != 0 {
				userIDs = append(userIDs, *parameter.ResultBy)
			}
		}
	}
	return tteUniqueUserIDs(userIDs)
}

func tteResolveRadiologyStaffSignerUserIDs(record models.MedicalRecord) []uint {
	userIDs := make([]uint, 0, 8)
	if record.RadiologyProcessedBy != nil && *record.RadiologyProcessedBy != 0 {
		userIDs = append(userIDs, *record.RadiologyProcessedBy)
	}
	for _, item := range record.RadiologyOrderItems {
		if item.ResultBy != nil && *item.ResultBy != 0 {
			userIDs = append(userIDs, *item.ResultBy)
		}
		for _, parameter := range item.ParameterResults {
			if parameter.ResultBy != nil && *parameter.ResultBy != 0 {
				userIDs = append(userIDs, *parameter.ResultBy)
			}
		}
	}
	return tteUniqueUserIDs(userIDs)
}

func tteUniqueUserIDs(values []uint) []uint {
	seen := make(map[uint]struct{}, len(values))
	unique := make([]uint, 0, len(values))
	for _, value := range values {
		if value == 0 {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	return unique
}

func buildTTEDoctorSignerResolutionNote(doctorName string, hasLinkedUser bool) string {
	doctorLabel := strings.TrimSpace(doctorName)
	if doctorLabel == "" {
		if hasLinkedUser {
			return "Akun dokter pada dokumen ini belum aktif atau belum memiliki akses ACC TTE."
		}
		return "Dokter pada dokumen ini belum terhubung ke akun aplikasi melalui master pegawai atau profil dokter."
	}

	if hasLinkedUser {
		return doctorLabel + " belum aktif atau akun ACC TTE-nya belum memenuhi akses."
	}
	return doctorLabel + " belum terhubung ke akun aplikasi melalui master pegawai atau profil dokter."
}

func tteResolveDoctorSignerIdentity(preloadedDoctor *models.Doctor, doctorID uint) (string, uint) {
	doctorName := ""
	var linkedUserID uint

	if preloadedDoctor != nil {
		doctorName = tteResolveDoctorDisplayName(*preloadedDoctor)
		linkedUserID = tteResolveDoctorLinkedUserID(*preloadedDoctor)
	}

	if doctorID != 0 && (doctorName == "" || linkedUserID == 0) {
		var doctor models.Doctor
		if err := database.DB.Preload("Employee").Select("id", "employee_id", "user_id", "full_name").First(&doctor, doctorID).Error; err == nil {
			if doctorName == "" {
				doctorName = tteResolveDoctorDisplayName(doctor)
			}
			if linkedUserID == 0 {
				linkedUserID = tteResolveDoctorLinkedUserID(doctor)
			}
		}
	}

	return doctorName, linkedUserID
}

func tteResolveDoctorDisplayName(doctor models.Doctor) string {
	return firstNonEmpty(strings.TrimSpace(doctor.FullName), strings.TrimSpace(doctor.Employee.FullName))
}

func tteResolveDoctorLinkedUserID(doctor models.Doctor) uint {
	if doctor.Employee.UserID != nil && *doctor.Employee.UserID != 0 {
		return *doctor.Employee.UserID
	}
	if doctor.UserID != nil && *doctor.UserID != 0 {
		return *doctor.UserID
	}
	return 0
}

func tteDocumentAllowsSigner(document tteVisitDocumentItem, signerUserID uint, allowBypass bool) bool {
	if signerUserID == 0 {
		return false
	}

	if allowBypass {
		return true
	}

	if len(document.SignerCandidates) > 0 {
		for _, candidate := range document.SignerCandidates {
			if candidate.ID == signerUserID {
				return true
			}
		}
		return false
	}

	if strings.EqualFold(strings.TrimSpace(document.SignerScope), "doctor") {
		if document.PreferredSignerUserID == nil || *document.PreferredSignerUserID == 0 {
			return false
		}
		return *document.PreferredSignerUserID == signerUserID
	}

	return true
}

func tteActorCanBypassSignerScope(actorUserID uint) bool {
	if actorUserID == 0 {
		return false
	}

	var actorUser models.User
	if err := database.DB.Preload("Role").Select("id", "role_id").First(&actorUser, actorUserID).Error; err != nil {
		return false
	}

	return tteUserHasSignerBypassRole(actorUser)
}

func tteUserHasSignerBypassRole(user models.User) bool {
	roleName := strings.ToLower(strings.TrimSpace(user.Role.Name))
	if roleName == "" {
		return false
	}

	normalized := strings.NewReplacer(" ", "", "-", "", "_", "").Replace(roleName)
	switch normalized {
	case "admin", "administrator", "sysadmin", "systemadmin", "systemadministrator", "superadmin", "superadministrator":
		return true
	default:
		return false
	}
}

func tteResolveRequestSignerName(request models.DocumentSignatureRequest) string {
	return firstNonEmpty(strings.TrimSpace(request.SignatureNameSnapshot), tteResolveUserDisplayName(request.RequestedToUser))
}

func tteResolveUserDisplayName(user models.User) string {
	return firstNonEmpty(strings.TrimSpace(user.FullName), strings.TrimSpace(user.Username), strings.TrimSpace(user.Email), "-")
}

func tteUserHasPermission(user models.User, permissionName string) bool {
	for _, permission := range user.Role.Permissions {
		if permission.Name == permissionName {
			return true
		}
	}
	return false
}

func tteDocumentStatusLabel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case tteStatusPending:
		return "Menunggu ACC"
	case tteStatusSigned:
		return "Sudah ditandatangani"
	case tteStatusRejected:
		return "Ditolak"
	case tteStatusRevoked:
		return "Tidak berlaku"
	default:
		return "Belum diajukan"
	}
}

func findTTEDocumentByKey(documents []tteVisitDocumentItem, documentKey string) (tteVisitDocumentItem, bool) {
	for _, document := range documents {
		if document.DocumentKey == documentKey {
			return document, true
		}
	}
	return tteVisitDocumentItem{}, false
}

func buildTTESuratDocumentKey(visitID uint, entryGroupKey string) string {
	return "surat:visit:" + strconv.FormatUint(uint64(visitID), 10) + ":" + strings.TrimSpace(entryGroupKey)
}

func parseTTESuratDocumentKey(documentKey string) (uint, string, bool) {
	trimmedKey := strings.TrimSpace(documentKey)
	const prefix = "surat:visit:"
	if !strings.HasPrefix(trimmedKey, prefix) {
		return 0, "", false
	}

	payload := strings.TrimPrefix(trimmedKey, prefix)
	parts := strings.SplitN(payload, ":", 2)
	if len(parts) != 2 {
		return 0, "", false
	}

	visitID, err := strconv.ParseUint(strings.TrimSpace(parts[0]), 10, 64)
	if err != nil || visitID == 0 {
		return 0, "", false
	}

	entryGroupKey := strings.TrimSpace(parts[1])
	if entryGroupKey == "" {
		return 0, "", false
	}

	return uint(visitID), entryGroupKey, true
}

func buildTTESuratPrintPath(visitID uint, entryGroupKey string) string {
	resolvedEntryGroupKey := strings.TrimSpace(entryGroupKey)
	if visitID == 0 || resolvedEntryGroupKey == "" {
		return ""
	}

	return "/api/medical-records/visit/" + strconv.FormatUint(uint64(visitID), 10) + "/print/surat?entry_group_key=" + url.QueryEscape(resolvedEntryGroupKey)
}

func buildTTEControlLetterDocumentKey(visitID uint) string {
	if visitID == 0 {
		return ""
	}
	return "control_letter:visit:" + strconv.FormatUint(uint64(visitID), 10)
}

func tteBuildPrintPath(documentType string, documentKey string, visitID uint, sourceID *uint, medicalRecordID *uint) string {
	switch documentType {
	case "resume_medis":
		return "/api/medical-records/visit/" + strconv.FormatUint(uint64(visitID), 10) + "/print/resume-medis"
	case "control_letter":
		return "/api/medical-records/visit/" + strconv.FormatUint(uint64(visitID), 10) + "/print/surat-kontrol"
	case "surat":
		if parsedVisitID, entryGroupKey, ok := parseTTESuratDocumentKey(documentKey); ok {
			resolvedVisitID := visitID
			if resolvedVisitID == 0 {
				resolvedVisitID = parsedVisitID
			}
			if printPath := buildTTESuratPrintPath(resolvedVisitID, entryGroupKey); printPath != "" {
				return printPath
			}
		}
		if sourceID != nil {
			return "/api/medical-records/visit/" + strconv.FormatUint(uint64(visitID), 10) + "/print/surat?record_ids=" + strconv.FormatUint(uint64(*sourceID), 10)
		}
		if medicalRecordID != nil {
			return "/api/medical-records/visit/" + strconv.FormatUint(uint64(visitID), 10) + "/print/surat?record_ids=" + strconv.FormatUint(uint64(*medicalRecordID), 10)
		}
	case "informed_consent":
		if sourceID != nil {
			return "/api/informed-consents/" + strconv.FormatUint(uint64(*sourceID), 10) + "/print"
		}
	case "odontogram":
		if sourceID != nil {
			return "/api/odontogram-entries/" + strconv.FormatUint(uint64(*sourceID), 10) + "/print"
		}
	case "procedure":
		if medicalRecordID != nil {
			return "/api/medical-records/" + strconv.FormatUint(uint64(*medicalRecordID), 10) + "/print/procedure"
		}
	case "prescription":
		if medicalRecordID != nil {
			return "/api/medical-records/" + strconv.FormatUint(uint64(*medicalRecordID), 10) + "/print/prescription"
		}
	case "laboratory_ticket":
		if medicalRecordID != nil {
			return "/api/medical-records/" + strconv.FormatUint(uint64(*medicalRecordID), 10) + "/print/laboratory-ticket"
		}
	case "laboratory_result":
		if medicalRecordID != nil {
			return "/api/medical-records/" + strconv.FormatUint(uint64(*medicalRecordID), 10) + "/print/laboratory-result"
		}
	case "laboratory_result_staff":
		if medicalRecordID != nil {
			return "/api/medical-records/" + strconv.FormatUint(uint64(*medicalRecordID), 10) + "/print/laboratory-result"
		}
	case "radiology_ticket":
		if medicalRecordID != nil {
			return "/api/medical-records/" + strconv.FormatUint(uint64(*medicalRecordID), 10) + "/print/radiology-ticket"
		}
	case "radiology_result":
		if medicalRecordID != nil {
			return "/api/medical-records/" + strconv.FormatUint(uint64(*medicalRecordID), 10) + "/print/radiology-result"
		}
	case "radiology_result_staff":
		if medicalRecordID != nil {
			return "/api/medical-records/" + strconv.FormatUint(uint64(*medicalRecordID), 10) + "/print/radiology-result"
		}
	}
	return ""
}
