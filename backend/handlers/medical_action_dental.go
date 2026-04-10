package handlers

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"starter/backend/models"

	"gorm.io/gorm"
)

const (
	medicalServiceDomainGeneral    = "general"
	medicalServiceDomainLaboratory = "laboratory"
	medicalServiceDomainRadiology  = "radiology"
	medicalServiceDomainDental     = "dental"

	medicalServiceTargetScopeNone      = "none"
	medicalServiceTargetScopeFullMouth = "full_mouth"
	medicalServiceTargetScopeArch      = "arch"
	medicalServiceTargetScopeQuadrant  = "quadrant"
	medicalServiceTargetScopeTooth     = "tooth"
	medicalServiceTargetScopeSurface   = "surface"
)

var (
	errMedicalActionServiceNotFound     = errors.New("medical action service not found")
	errMedicalActionServiceInactive     = errors.New("medical action service inactive")
	errMedicalActionServiceNotSupported = errors.New("medical action service not supported")
)

var dentalToothSortOrder = map[string]int{}

var dentalValidToothNumbers = []string{
	"18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28",
	"55", "54", "53", "52", "51", "61", "62", "63", "64", "65",
	"85", "84", "83", "82", "81", "71", "72", "73", "74", "75",
	"48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38",
}

var dentalToothConditionSet = map[string]struct{}{
	"sound":         {},
	"missing":       {},
	"extracted":     {},
	"retained_root": {},
	"impacted":      {},
	"implant":       {},
	"crown":         {},
	"mobility":      {},
}

var dentalSurfaceConditionSet = map[string]struct{}{
	"sound":       {},
	"caries":      {},
	"restoration": {},
	"sealant":     {},
	"fracture":    {},
	"wear":        {},
	"calculus":    {},
}

var dentalArchSet = map[string]struct{}{
	"upper": {},
	"lower": {},
}

var dentalQuadrantSet = map[string]struct{}{
	"upper_right": {},
	"upper_left":  {},
	"lower_left":  {},
	"lower_right": {},
}

func init() {
	for index, toothNumber := range dentalValidToothNumbers {
		dentalToothSortOrder[toothNumber] = index + 1
	}
}

type MedicalActionTargetRequest struct {
	TargetType   string   `json:"target_type"`
	Arch         string   `json:"arch"`
	Quadrant     string   `json:"quadrant"`
	ToothNumber  string   `json:"tooth_number"`
	SurfaceCodes []string `json:"surface_codes"`
	Notes        string   `json:"notes"`
}

type MedicalActionOdontogramSyncRequest struct {
	EntryID          uint   `json:"entry_id"`
	ToothCondition   string `json:"tooth_condition"`
	SurfaceCondition string `json:"surface_condition"`
}

func normalizeMedicalServiceDomain(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case medicalServiceDomainGeneral:
		return medicalServiceDomainGeneral
	case medicalServiceDomainLaboratory:
		return medicalServiceDomainLaboratory
	case medicalServiceDomainRadiology:
		return medicalServiceDomainRadiology
	case medicalServiceDomainDental:
		return medicalServiceDomainDental
	default:
		return ""
	}
}

func resolveMedicalServiceDomain(value string) string {
	if normalized := normalizeMedicalServiceDomain(value); normalized != "" {
		return normalized
	}

	return medicalServiceDomainGeneral
}

func normalizeMedicalServiceTargetScope(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case medicalServiceTargetScopeNone:
		return medicalServiceTargetScopeNone
	case medicalServiceTargetScopeFullMouth:
		return medicalServiceTargetScopeFullMouth
	case medicalServiceTargetScopeArch:
		return medicalServiceTargetScopeArch
	case medicalServiceTargetScopeQuadrant:
		return medicalServiceTargetScopeQuadrant
	case medicalServiceTargetScopeTooth:
		return medicalServiceTargetScopeTooth
	case medicalServiceTargetScopeSurface:
		return medicalServiceTargetScopeSurface
	default:
		return ""
	}
}

func resolveMedicalServiceTargetScope(value string) string {
	if normalized := normalizeMedicalServiceTargetScope(value); normalized != "" {
		return normalized
	}

	return medicalServiceTargetScopeNone
}

func normalizeMedicalActionTargetType(value string) string {
	return normalizeMedicalServiceTargetScope(value)
}

func isProcedureEligibleMedicalService(service models.MedicalService) bool {
	domain := normalizeMedicalServiceDomain(service.ServiceDomain)
	if domain == medicalServiceDomainGeneral || domain == medicalServiceDomainDental {
		return true
	}
	if domain == medicalServiceDomainLaboratory || domain == medicalServiceDomainRadiology {
		return false
	}

	categoryName := strings.ToLower(strings.TrimSpace(service.Category.Name))
	return categoryName != "laboratorium" && categoryName != "laboratory" && categoryName != "radiologi" && categoryName != "radiology"
}

func normalizeDentalArch(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if _, exists := dentalArchSet[normalized]; exists {
		return normalized
	}

	return ""
}

func normalizeDentalQuadrant(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if _, exists := dentalQuadrantSet[normalized]; exists {
		return normalized
	}

	return ""
}

func normalizeDentalToothNumber(value string) string {
	normalized := strings.TrimSpace(value)
	if _, exists := dentalToothSortOrder[normalized]; exists {
		return normalized
	}

	return ""
}

func normalizeOdontogramToothCondition(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if _, exists := dentalToothConditionSet[normalized]; exists {
		return normalized
	}

	return ""
}

func normalizeOdontogramSurfaceCondition(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if _, exists := dentalSurfaceConditionSet[normalized]; exists {
		return normalized
	}

	return ""
}

func dentalSurfaceCodeOrder(toothNumber string) []string {
	if toothNumber == "" {
		return nil
	}

	lastDigit := toothNumber[len(toothNumber)-1]
	if lastDigit == '1' || lastDigit == '2' || lastDigit == '3' {
		return []string{"incisal", "mesial", "distal", "labial", "palatal"}
	}

	return []string{"occlusal", "mesial", "distal", "buccal", "lingual"}
}

func normalizeDentalSurfaceCodes(toothNumber string, surfaceCodes []string) ([]string, error) {
	allowedOrder := dentalSurfaceCodeOrder(toothNumber)
	if len(allowedOrder) == 0 {
		return nil, fmt.Errorf("nomor gigi target tidak valid")
	}

	allowedSet := make(map[string]int, len(allowedOrder))
	for index, surfaceCode := range allowedOrder {
		allowedSet[surfaceCode] = index
	}

	normalizedCodes := make([]string, 0, len(surfaceCodes))
	seen := make(map[string]struct{}, len(surfaceCodes))
	for _, surfaceCode := range surfaceCodes {
		normalized := strings.ToLower(strings.TrimSpace(surfaceCode))
		if _, exists := allowedSet[normalized]; !exists {
			return nil, fmt.Errorf("permukaan %s tidak valid untuk gigi %s", normalized, toothNumber)
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		normalizedCodes = append(normalizedCodes, normalized)
	}

	if len(normalizedCodes) == 0 {
		return nil, fmt.Errorf("minimal satu permukaan wajib dipilih")
	}

	sort.SliceStable(normalizedCodes, func(left int, right int) bool {
		return allowedSet[normalizedCodes[left]] < allowedSet[normalizedCodes[right]]
	})

	return normalizedCodes, nil
}

func syncMedicalActionTargetsTx(tx *gorm.DB, actionID uint, targetScope string, requests []MedicalActionTargetRequest) ([]models.MedicalActionTarget, error) {
	if err := tx.Where("medical_action_id = ?", actionID).Delete(&models.MedicalActionTarget{}).Error; err != nil {
		return nil, err
	}

	normalizedScope := resolveMedicalServiceTargetScope(targetScope)
	if normalizedScope == medicalServiceTargetScopeNone {
		return nil, nil
	}

	if normalizedScope == medicalServiceTargetScopeFullMouth {
		target := models.MedicalActionTarget{
			MedicalActionID: actionID,
			TargetType:      medicalServiceTargetScopeFullMouth,
		}
		if len(requests) > 0 {
			target.Notes = strings.TrimSpace(requests[0].Notes)
		}
		if err := tx.Create(&target).Error; err != nil {
			return nil, err
		}
		return []models.MedicalActionTarget{target}, nil
	}

	if len(requests) == 0 {
		return nil, fmt.Errorf("target tindakan wajib diisi")
	}

	targets := make([]models.MedicalActionTarget, 0, len(requests))
	seen := map[string]struct{}{}

	for _, request := range requests {
		target := models.MedicalActionTarget{
			MedicalActionID: actionID,
			TargetType:      normalizedScope,
			Notes:           strings.TrimSpace(request.Notes),
		}

		switch normalizedScope {
		case medicalServiceTargetScopeArch:
			target.Arch = normalizeDentalArch(request.Arch)
			if target.Arch == "" {
				return nil, fmt.Errorf("target rahang tidak valid")
			}
		case medicalServiceTargetScopeQuadrant:
			target.Quadrant = normalizeDentalQuadrant(request.Quadrant)
			if target.Quadrant == "" {
				return nil, fmt.Errorf("target kuadran tidak valid")
			}
		case medicalServiceTargetScopeTooth:
			target.ToothNumber = normalizeDentalToothNumber(request.ToothNumber)
			if target.ToothNumber == "" {
				return nil, fmt.Errorf("target gigi tidak valid")
			}
		case medicalServiceTargetScopeSurface:
			target.ToothNumber = normalizeDentalToothNumber(request.ToothNumber)
			if target.ToothNumber == "" {
				return nil, fmt.Errorf("target gigi tidak valid")
			}

			surfaceCodes, err := normalizeDentalSurfaceCodes(target.ToothNumber, request.SurfaceCodes)
			if err != nil {
				return nil, err
			}

			target.SurfaceCodes = surfaceCodes
		}

		key := strings.Join([]string{
			target.TargetType,
			target.Arch,
			target.Quadrant,
			target.ToothNumber,
			strings.Join(target.SurfaceCodes, ","),
		}, "|")
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		targets = append(targets, target)
	}

	if len(targets) == 0 {
		return nil, fmt.Errorf("target tindakan wajib diisi")
	}

	if err := tx.Create(&targets).Error; err != nil {
		return nil, err
	}

	return targets, nil
}

func upsertOdontogramToothTx(tx *gorm.DB, entryID uint, toothNumber string) (*models.OdontogramTooth, error) {
	var teeth []models.OdontogramTooth
	if err := tx.Where("odontogram_entry_id = ? AND tooth_number = ?", entryID, toothNumber).Limit(1).Find(&teeth).Error; err != nil {
		return nil, err
	}
	if len(teeth) > 0 {
		return &teeth[0], nil
	}

	tooth := models.OdontogramTooth{
		OdontogramEntryID: entryID,
		ToothNumber:       toothNumber,
		ToothCondition:    "sound",
		SortOrder:         dentalToothSortOrder[toothNumber],
	}
	if err := tx.Create(&tooth).Error; err != nil {
		return nil, err
	}

	return &tooth, nil
}

func upsertOdontogramSurfaceFindingTx(tx *gorm.DB, toothID uint, surfaceCode string) (*models.OdontogramSurfaceFinding, error) {
	var findings []models.OdontogramSurfaceFinding
	if err := tx.Where("odontogram_tooth_id = ? AND surface_code = ?", toothID, surfaceCode).Limit(1).Find(&findings).Error; err != nil {
		return nil, err
	}
	if len(findings) > 0 {
		return &findings[0], nil
	}

	finding := models.OdontogramSurfaceFinding{
		OdontogramToothID: toothID,
		SurfaceCode:       surfaceCode,
		ConditionCode:     "sound",
	}
	if err := tx.Create(&finding).Error; err != nil {
		return nil, err
	}

	return &finding, nil
}

func applyMedicalActionOdontogramSyncTx(tx *gorm.DB, record models.MedicalRecord, service models.MedicalService, targets []models.MedicalActionTarget, request *MedicalActionOdontogramSyncRequest) (*models.OdontogramEntry, error) {
	if request == nil {
		return nil, nil
	}
	if request.EntryID == 0 {
		return nil, fmt.Errorf("entri odontogram tujuan wajib dipilih")
	}
	if resolveMedicalServiceDomain(service.ServiceDomain) != medicalServiceDomainDental {
		return nil, fmt.Errorf("sinkronisasi odontogram hanya tersedia untuk layanan dental")
	}
	if !service.SupportsOdontogramSync {
		return nil, fmt.Errorf("layanan ini tidak mengaktifkan sinkronisasi odontogram")
	}

	targetScope := resolveMedicalServiceTargetScope(service.TargetScope)
	if targetScope != medicalServiceTargetScopeTooth && targetScope != medicalServiceTargetScopeSurface {
		return nil, fmt.Errorf("sinkronisasi odontogram hanya didukung untuk target gigi atau permukaan")
	}
	if len(targets) == 0 {
		return nil, fmt.Errorf("target tindakan belum diisi")
	}

	var entry models.OdontogramEntry
	if err := tx.Preload("Teeth").Preload("Teeth.SurfaceFindings").Where("id = ? AND visit_id = ?", request.EntryID, record.VisitID).First(&entry).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("entri odontogram tidak ditemukan pada kunjungan ini")
		}
		return nil, err
	}
	if entry.Status != "draft" {
		return nil, fmt.Errorf("sinkronisasi hanya dapat dilakukan ke entri odontogram draft")
	}

	if targetScope == medicalServiceTargetScopeTooth {
		condition := normalizeOdontogramToothCondition(request.ToothCondition)
		if condition == "" {
			return nil, fmt.Errorf("kondisi gigi odontogram wajib dipilih")
		}

		for _, target := range targets {
			tooth, err := upsertOdontogramToothTx(tx, entry.ID, target.ToothNumber)
			if err != nil {
				return nil, err
			}
			if err := tx.Model(&models.OdontogramTooth{}).Where("id = ?", tooth.ID).Updates(map[string]interface{}{
				"tooth_condition": condition,
				"notes":           target.Notes,
			}).Error; err != nil {
				return nil, err
			}
		}
	} else {
		condition := normalizeOdontogramSurfaceCondition(request.SurfaceCondition)
		if condition == "" {
			return nil, fmt.Errorf("kondisi permukaan odontogram wajib dipilih")
		}

		for _, target := range targets {
			tooth, err := upsertOdontogramToothTx(tx, entry.ID, target.ToothNumber)
			if err != nil {
				return nil, err
			}
			for _, surfaceCode := range target.SurfaceCodes {
				finding, err := upsertOdontogramSurfaceFindingTx(tx, tooth.ID, surfaceCode)
				if err != nil {
					return nil, err
				}
				if err := tx.Model(&models.OdontogramSurfaceFinding{}).Where("id = ?", finding.ID).Updates(map[string]interface{}{
					"condition_code": condition,
					"notes":          target.Notes,
				}).Error; err != nil {
					return nil, err
				}
			}
		}
	}

	if err := tx.Preload("Teeth").Preload("Teeth.SurfaceFindings").First(&entry, entry.ID).Error; err != nil {
		return nil, err
	}

	return &entry, nil
}

// shouldAutoGenerateOdontogramFromTargets returns true when a dental action has
// tooth/surface targets that can be auto-synced to an odontogram.
func shouldAutoGenerateOdontogramFromTargets(service models.MedicalService, targets []models.MedicalActionTarget) bool {
	if resolveMedicalServiceDomain(service.ServiceDomain) != medicalServiceDomainDental {
		return false
	}
	if !service.SupportsOdontogramSync {
		return false
	}
	scope := resolveMedicalServiceTargetScope(service.TargetScope)
	if scope != medicalServiceTargetScopeTooth && scope != medicalServiceTargetScopeSurface {
		return false
	}
	return len(targets) > 0
}

// autoGenerateOdontogramFromDentalTargetsTx finds or creates a draft odontogram
// entry for the visit and auto-syncs the dental action targets into it.
func autoGenerateOdontogramFromDentalTargetsTx(tx *gorm.DB, record models.MedicalRecord, service models.MedicalService, targets []models.MedicalActionTarget) (*models.OdontogramEntry, error) {
	// Ensure we have visit info for PolyclinicID
	polyclinicID := record.Visit.PolyclinicID
	doctorID := record.DoctorID
	if polyclinicID == 0 && record.VisitID != 0 {
		var visits []models.Visit
		if err := tx.Select("id, polyclinic_id, doctor_id").Where("id = ?", record.VisitID).Limit(1).Find(&visits).Error; err == nil && len(visits) > 0 {
			polyclinicID = visits[0].PolyclinicID
			if doctorID == 0 {
				doctorID = visits[0].DoctorID
			}
		}
	}

	// Look for an existing draft odontogram entry on this visit
	var entries []models.OdontogramEntry
	if err := tx.Where("visit_id = ? AND status = ?", record.VisitID, odontogramStatusDraft).
		Order("created_at DESC").
		Limit(1).
		Find(&entries).Error; err != nil {
		return nil, err
	}

	var entry models.OdontogramEntry
	if len(entries) > 0 {
		entry = entries[0]
	} else {
		entry = models.OdontogramEntry{
			VisitID:      record.VisitID,
			PatientID:    record.PatientID,
			DoctorID:     doctorID,
			PolyclinicID: polyclinicID,
			SheetKey:     odontogramSheetKey,
			ChartType:    resolveChartTypeFromTargets(targets),
			Notes:        autoGeneratedOdontogramNotes,
			Status:       odontogramStatusDraft,
		}
		if err := tx.Create(&entry).Error; err != nil {
			return nil, err
		}
	}

	targetScope := resolveMedicalServiceTargetScope(service.TargetScope)

	if targetScope == medicalServiceTargetScopeTooth {
		for _, target := range targets {
			tooth, err := upsertOdontogramToothTx(tx, entry.ID, target.ToothNumber)
			if err != nil {
				return nil, err
			}
			// Default tooth condition for auto-generated entries
			if err := tx.Model(&models.OdontogramTooth{}).Where("id = ?", tooth.ID).Updates(map[string]interface{}{
				"notes": target.Notes,
			}).Error; err != nil {
				return nil, err
			}
		}
	} else if targetScope == medicalServiceTargetScopeSurface {
		for _, target := range targets {
			tooth, err := upsertOdontogramToothTx(tx, entry.ID, target.ToothNumber)
			if err != nil {
				return nil, err
			}
			for _, surfaceCode := range target.SurfaceCodes {
				if _, err := upsertOdontogramSurfaceFindingTx(tx, tooth.ID, surfaceCode); err != nil {
					return nil, err
				}
			}
		}
	}

	if err := tx.Preload("Teeth").Preload("Teeth.SurfaceFindings").First(&entry, entry.ID).Error; err != nil {
		return nil, err
	}

	return &entry, nil
}

// resolveChartTypeFromTargets picks "primary" if any target tooth is deciduous (51-85),
// otherwise defaults to "permanent".
func resolveChartTypeFromTargets(targets []models.MedicalActionTarget) string {
	for _, t := range targets {
		num := strings.TrimSpace(t.ToothNumber)
		if len(num) == 2 && num[0] >= '5' && num[0] <= '8' {
			return odontogramChartPrimary
		}
	}
	return odontogramChartAdult
}

const autoGeneratedOdontogramNotes = "Dibuat otomatis dari tindakan gigi"

// cleanupAutoGeneratedOdontogramOnDeleteTx removes orphaned teeth from the
// auto-generated odontogram entry after a dental action is deleted.
// If the entry becomes empty, it is deleted entirely.
func cleanupAutoGeneratedOdontogramOnDeleteTx(tx *gorm.DB, visitID uint, deletedTargets []models.MedicalActionTarget) error {
	// Collect tooth numbers from the deleted action
	deletedTeeth := make(map[string]bool)
	for _, target := range deletedTargets {
		if target.ToothNumber != "" {
			deletedTeeth[target.ToothNumber] = true
		}
	}
	if len(deletedTeeth) == 0 {
		return nil
	}

	// Find auto-generated draft odontogram for this visit
	var entries []models.OdontogramEntry
	if err := tx.Where("visit_id = ? AND status = ? AND notes = ?", visitID, odontogramStatusDraft, autoGeneratedOdontogramNotes).
		Preload("Teeth").Preload("Teeth.SurfaceFindings").
		Order("created_at DESC").Limit(1).
		Find(&entries).Error; err != nil {
		return err
	}
	if len(entries) == 0 {
		return nil
	}
	entry := entries[0]

	// Find tooth numbers still referenced by remaining dental actions on this visit.
	// Since the deleted action is already soft-deleted at this point, GORM auto-scoping
	// excludes it from the subqueries.
	var referencedToothNumbers []string
	if err := tx.Model(&models.MedicalActionTarget{}).
		Select("DISTINCT tooth_number").
		Where("tooth_number != ''").
		Where("medical_action_id IN (?)",
			tx.Model(&models.MedicalAction{}).Select("id").
				Where("medical_record_id IN (?)",
					tx.Model(&models.MedicalRecord{}).Select("id").
						Where("visit_id = ? AND section_type = ?", visitID, "procedure"),
				),
		).Pluck("tooth_number", &referencedToothNumbers).Error; err != nil {
		return err
	}
	stillReferenced := make(map[string]bool, len(referencedToothNumbers))
	for _, tn := range referencedToothNumbers {
		stillReferenced[tn] = true
	}

	// Remove orphaned teeth
	for _, tooth := range entry.Teeth {
		if !deletedTeeth[tooth.ToothNumber] {
			continue
		}
		if stillReferenced[tooth.ToothNumber] {
			continue
		}
		if err := tx.Where("odontogram_tooth_id = ?", tooth.ID).Delete(&models.OdontogramSurfaceFinding{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&tooth).Error; err != nil {
			return err
		}
	}

	// If no teeth remain, delete the empty auto-generated entry
	var remainingCount int64
	if err := tx.Model(&models.OdontogramTooth{}).Where("odontogram_entry_id = ?", entry.ID).Count(&remainingCount).Error; err != nil {
		return err
	}
	if remainingCount == 0 {
		if err := tx.Delete(&entry).Error; err != nil {
			return err
		}
	}

	return nil
}
