package handlers

import (
	"fmt"
	"strings"
	"time"

	"starter/backend/models"

	"gorm.io/gorm"
)

var informedConsentSurfaceLabels = map[string]string{
	"occlusal": "oklusal",
	"incisal":  "insisal",
	"mesial":   "mesial",
	"distal":   "distal",
	"buccal":   "bukal",
	"lingual":  "lingual",
	"labial":   "labial",
	"palatal":  "palatal",
}

func formatMedicalActionConsentTarget(target models.MedicalActionTarget) string {
	switch resolveMedicalServiceTargetScope(target.TargetType) {
	case medicalServiceTargetScopeFullMouth:
		return "seluruh mulut"
	case medicalServiceTargetScopeArch:
		if target.Arch == "upper" {
			return "rahang atas"
		}
		return "rahang bawah"
	case medicalServiceTargetScopeQuadrant:
		switch target.Quadrant {
		case "upper_right":
			return "kuadran kanan atas"
		case "upper_left":
			return "kuadran kiri atas"
		case "lower_left":
			return "kuadran kiri bawah"
		case "lower_right":
			return "kuadran kanan bawah"
		default:
			return strings.TrimSpace(target.Quadrant)
		}
	case medicalServiceTargetScopeTooth:
		return fmt.Sprintf("gigi %s", strings.TrimSpace(target.ToothNumber))
	case medicalServiceTargetScopeSurface:
		surfaceLabels := make([]string, 0, len(target.SurfaceCodes))
		for _, surfaceCode := range target.SurfaceCodes {
			label := informedConsentSurfaceLabels[strings.ToLower(strings.TrimSpace(surfaceCode))]
			if label == "" {
				label = strings.ToLower(strings.TrimSpace(surfaceCode))
			}
			surfaceLabels = append(surfaceLabels, label)
		}
		if len(surfaceLabels) == 0 {
			return fmt.Sprintf("gigi %s", strings.TrimSpace(target.ToothNumber))
		}
		return fmt.Sprintf("gigi %s (%s)", strings.TrimSpace(target.ToothNumber), strings.Join(surfaceLabels, ", "))
	default:
		return ""
	}
}

func buildMedicalActionConsentTargetSummary(targets []models.MedicalActionTarget) string {
	parts := make([]string, 0, len(targets))
	for _, target := range targets {
		formatted := strings.TrimSpace(formatMedicalActionConsentTarget(target))
		if formatted == "" {
			continue
		}
		parts = append(parts, formatted)
	}

	return strings.Join(parts, "; ")
}

func buildMedicalActionConsentActionName(service models.MedicalService, targets []models.MedicalActionTarget) string {
	name := strings.TrimSpace(service.Name)
	if name == "" {
		name = "Tindakan Medis"
	}

	targetSummary := buildMedicalActionConsentTargetSummary(targets)
	if targetSummary == "" || targetSummary == "seluruh mulut" {
		return name
	}

	return fmt.Sprintf("%s - %s", name, targetSummary)
}

func buildMedicalActionConsentDescription(service models.MedicalService, targets []models.MedicalActionTarget) string {
	segments := make([]string, 0, 3)
	if description := strings.TrimSpace(service.Description); description != "" {
		segments = append(segments, description)
	}

	targetSummary := buildMedicalActionConsentTargetSummary(targets)
	if targetSummary != "" {
		segments = append(segments, fmt.Sprintf("Target tindakan: %s.", targetSummary))
	}

	if len(segments) == 0 {
		segments = append(segments, "Tindakan dilakukan sesuai indikasi klinis dokter.")
	}

	return strings.Join(segments, " ")
}

func buildMedicalActionConsentBenefits(service models.MedicalService) string {
	if resolveMedicalServiceDomain(service.ServiceDomain) == medicalServiceDomainDental {
		return "Membantu mengatasi keluhan gigi dan mulut, mengurangi nyeri atau infeksi, serta mendukung fungsi oral sesuai indikasi klinis."
	}

	return "Membantu diagnosis atau terapi pasien, mengurangi keluhan, dan mendukung penatalaksanaan klinis sesuai indikasi dokter."
}

func buildMedicalActionConsentRisks(service models.MedicalService) string {
	if resolveMedicalServiceDomain(service.ServiceDomain) == medicalServiceDomainDental {
		return "Risiko umum meliputi nyeri, perdarahan, bengkak, infeksi, reaksi terhadap anestesi atau obat, dan kemungkinan perlunya tindakan lanjutan sesuai kondisi klinis."
	}

	return "Risiko umum meliputi nyeri, perdarahan, infeksi, reaksi terhadap obat atau anestesi, serta kemungkinan perlunya tindakan lanjutan sesuai kondisi klinis."
}

func syncMedicalActionInformedConsentTx(tx *gorm.DB, record models.MedicalRecord, action *models.MedicalAction, service models.MedicalService, targets []models.MedicalActionTarget) (*models.InformedConsent, uint, error) {
	var existing models.InformedConsent
	existingErr := tx.Where("medical_action_id = ?", action.ID).First(&existing).Error
	if existingErr != nil && existingErr != gorm.ErrRecordNotFound {
		return nil, 0, existingErr
	}
	existingFound := existingErr == nil

	if !action.RequiresConsentSnapshot {
		if existingFound {
			removedID := existing.ID
			if deleteErr := tx.Delete(&existing).Error; deleteErr != nil {
				return nil, 0, deleteErr
			}
			return nil, removedID, nil
		}
		return nil, 0, nil
	}

	actionName := buildMedicalActionConsentActionName(service, targets)
	actionDescription := buildMedicalActionConsentDescription(service, targets)
	benefits := buildMedicalActionConsentBenefits(service)
	risks := buildMedicalActionConsentRisks(service)
	consentGiverName, consentGiverRelation, consentGiverIDNumber, err := loadInformedConsentGiverDefaultsTx(tx, record.PatientID)
	if err != nil {
		return nil, 0, err
	}
	autoNotes := "Draft informed consent dibuat otomatis dari tindakan. Lengkapi pemberi persetujuan atau wali, keputusan pasien, saksi, manfaat, dan risiko sebelum finalisasi dokumen."
	medicalActionID := action.ID

	if !existingFound {
		consent := models.InformedConsent{
			MedicalRecordID:      record.ID,
			MedicalActionID:      &medicalActionID,
			PatientID:            record.PatientID,
			DoctorID:             record.DoctorID,
			ActionName:           actionName,
			ActionDescription:    actionDescription,
			Risks:                risks,
			Benefits:             benefits,
			PatientDecision:      "pending",
			ConsentDate:          time.Now(),
			ConsentGiverName:     consentGiverName,
			ConsentGiverRelation: consentGiverRelation,
			ConsentGiverIDNumber: consentGiverIDNumber,
			Notes:                autoNotes,
		}
		if createErr := tx.Create(&consent).Error; createErr != nil {
			return nil, 0, createErr
		}
		return &consent, 0, nil
	}

	updates := map[string]interface{}{
		"medical_record_id":  record.ID,
		"medical_action_id":  medicalActionID,
		"patient_id":         record.PatientID,
		"doctor_id":          record.DoctorID,
		"action_name":        actionName,
		"action_description": actionDescription,
		"updated_at":         time.Now(),
	}

	if strings.TrimSpace(existing.Benefits) == "" || strings.EqualFold(strings.TrimSpace(existing.PatientDecision), "pending") {
		updates["benefits"] = benefits
	}
	if strings.TrimSpace(existing.Risks) == "" || strings.EqualFold(strings.TrimSpace(existing.PatientDecision), "pending") {
		updates["risks"] = risks
	}
	if strings.TrimSpace(existing.PatientDecision) == "" {
		updates["patient_decision"] = "pending"
	}
	if existing.ConsentDate.IsZero() {
		updates["consent_date"] = time.Now()
	}
	if strings.TrimSpace(existing.ConsentGiverName) == "" && consentGiverName != "" {
		updates["consent_giver_name"] = consentGiverName
	}
	if strings.TrimSpace(existing.ConsentGiverRelation) == "" && consentGiverRelation != "" {
		updates["consent_giver_relation"] = consentGiverRelation
	}
	if strings.TrimSpace(existing.ConsentGiverIDNumber) == "" && consentGiverIDNumber != "" {
		updates["consent_giver_id_number"] = consentGiverIDNumber
	}
	if strings.TrimSpace(existing.Notes) == "" || strings.Contains(strings.ToLower(existing.Notes), "draft informed consent dibuat otomatis") {
		updates["notes"] = autoNotes
	}

	if updateErr := tx.Model(&models.InformedConsent{}).Where("id = ?", existing.ID).Updates(updates).Error; updateErr != nil {
		return nil, 0, updateErr
	}
	if reloadErr := tx.First(&existing, existing.ID).Error; reloadErr != nil {
		return nil, 0, reloadErr
	}

	return &existing, 0, nil
}

func loadInformedConsentGiverDefaultsTx(tx *gorm.DB, patientID uint) (string, string, string, error) {
	if patientID == 0 {
		return "", informedConsentDefaultGiverRelation, "", nil
	}

	var patient models.Patient
	if err := tx.Select("id", "full_name", "nik").First(&patient, patientID).Error; err != nil {
		return "", "", "", err
	}

	return strings.TrimSpace(patient.FullName), informedConsentDefaultGiverRelation, strings.TrimSpace(patient.NIK), nil
}
