package satusehat

import (
	"fmt"
	"strings"

	"starter/backend/models"
)

func BuildMedicationMasterPreviewForMedicine(medicine models.Medicine, detail *KFAProductDetail, config Config) ResourcePreview {
	warnings := make([]string, 0, 4)
	medicineName := resolveMedicationDisplayName(medicine, detail)
	resourcePreview := buildMedicationMasterPreview(medicine, detail, config)

	if medicineName == "" {
		warnings = append(warnings, "Nama obat kosong.")
	}
	if !looksLikeKFACode(medicine.KFACode) {
		warnings = append(warnings, "Master obat belum memiliki kode KFA; resource Medication SATUSEHAT tidak bisa dibentuk dari kode lokal saja.")
	}
	if resourcePreview == nil {
		warnings = append(warnings, "Detail produk KFA belum tersedia; resource Medication belum bisa dibentuk dari master obat ini.")
	}
	if strings.TrimSpace(firstNonEmptyText(resolveMedicationFormDisplay(detail), medicine.Form)) == "" {
		warnings = append(warnings, "Bentuk sediaan obat belum terisi; data ini biasanya dibutuhkan saat membentuk resource Medication master.")
	}

	if resourcePreview == nil {
		return ResourcePreview{Warnings: warnings, Ready: false}
	}

	return ResourcePreview{
		Resource: resourcePreview.Resource,
		Warnings: warnings,
		Ready:    medicineName != "",
	}
}

func BuildMedicationRequestPreview(prescription models.Prescription, detail *KFAProductDetail, config Config) ResourcePreview {
	warnings := make([]string, 0, 6)
	record := prescription.MedicalRecord
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	encounterReference := strings.TrimSpace(record.Visit.SatusehatEncounterID)
	requesterActor := ResolveMedicalRecordRequesterActor(record)
	medicineName := resolveMedicationDisplayName(prescription.Medicine, detail)
	medicationPreview := buildMedicationMasterPreview(prescription.Medicine, detail, config)
	relatedResources := make([]NamedResourcePreview, 0, 1)
	if medicationPreview != nil {
		relatedResources = append(relatedResources, *medicationPreview)
	}

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if encounterReference == "" {
		warnings = append(warnings, "Encounter belum memiliki SATUSEHAT Encounter ID.")
	}
	if medicineName == "" {
		warnings = append(warnings, "Nama obat kosong.")
	}
	if prescription.Quantity < 1 {
		warnings = append(warnings, "Jumlah obat belum valid.")
	}
	if !looksLikeKFACode(prescription.Medicine.KFACode) {
		warnings = append(warnings, "Master obat belum memiliki kode KFA; collection SATUSEHAT farmasi umumnya memakai resource Medication ber-KFA lalu direferensikan dari MedicationRequest.")
	}
	if medicationPreview == nil {
		warnings = append(warnings, "Detail produk KFA belum tersedia; resource Medication belum bisa dibentuk dari master obat ini.")
	}
	if strings.TrimSpace(firstNonEmptyText(resolveMedicationFormDisplay(detail), prescription.Medicine.Form)) == "" {
		warnings = append(warnings, "Bentuk sediaan obat belum terisi; data ini biasanya dibutuhkan saat membentuk resource Medication master.")
	}

	resource := map[string]any{
		"resourceType": "MedicationRequest",
		"status":       mapMedicationRequestStatus(prescription.Status),
		"intent":       "order",
		"identifier": []map[string]any{{
			"use":    "official",
			"system": buildMedicationRequestIdentifierSystem(config.OrganizationID),
			"value":  buildMedicationRequestIdentifierValue(prescription),
		}},
		"category": []map[string]any{{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/CodeSystem/medicationrequest-category",
				"code":    "community",
				"display": "Community",
			}},
		}},
		"priority": "routine",
		"subject": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		},
		"encounter": map[string]any{
			"reference": fmt.Sprintf("Encounter/%s", encounterReference),
			"display":   record.Visit.VisitNumber,
		},
		"authoredOn": formatFHIRDateTime(record.RecordDate),
		"dispenseRequest": map[string]any{
			"quantity": buildMedicationQuantity(prescription.Quantity, firstNonEmptyText(resolveMedicationFormDisplay(detail), prescription.Medicine.Unit.Name)),
		},
	}
	setMedicationReference(resource, strings.TrimSpace(prescription.Medicine.SatusehatMedicationID), medicineName)

	if existingID := strings.TrimSpace(prescription.SatusehatMedicationRequestID); existingID != "" {
		resource["id"] = existingID
	}
	if assignerOrganizationID := strings.TrimSpace(config.OrganizationID); assignerOrganizationID != "" {
		resource["identifier"] = []map[string]any{{
			"use":    "official",
			"system": buildMedicationRequestIdentifierSystem(config.OrganizationID),
			"value":  buildMedicationRequestIdentifierValue(prescription),
			"assigner": map[string]any{
				"reference": fmt.Sprintf("Organization/%s", assignerOrganizationID),
			},
		}}
	}
	if requesterActor.Ready() {
		resource["requester"] = map[string]any{
			"reference": requesterActor.Reference(),
			"display":   requesterActor.Display,
		}
	} else {
		warnings = append(warnings, "Pegawai/dokter pengaju belum memiliki SATUSEHAT Practitioner ID; requester akan diabaikan sementara.")
	}

	dosageText := buildMedicationDosageText(prescription.Dosage, prescription.Frequency, prescription.Duration, prescription.Route, prescription.Instructions)
	if dosageText != "" {
		resource["dosageInstruction"] = []map[string]any{{"text": dosageText}}
	}
	if note := strings.TrimSpace(firstNonEmptyText(prescription.Notes, prescription.Instructions)); note != "" {
		resource["note"] = []map[string]any{{"text": note}}
	}
	if strings.TrimSpace(prescription.Medicine.SatusehatMedicationID) == "" && medicationPreview != nil {
		warnings = append(warnings, "Medication master akan disinkronkan lebih dulu saat submit sehingga medicationReference final baru terisi pada payload kirim.")
	}

	ready := patientReference != "" && encounterReference != "" && medicineName != "" && prescription.Quantity > 0 && medicationPreview != nil
	return ResourcePreview{Resource: resource, RelatedResources: relatedResources, Warnings: warnings, Prerequisites: BuildMedicationRequestPrerequisites(prescription, config), Ready: ready}
}

func BuildMedicationDispensePreview(dispensing models.Dispensing, detail *KFAProductDetail, config Config) ResourcePreview {
	warnings := make([]string, 0, 6)
	record := dispensing.MedicalRecord
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	encounterReference := strings.TrimSpace(record.Visit.SatusehatEncounterID)
	performerActor := ResolveDispensingPerformerActor(dispensing)
	medicine := resolveDispensingMedicine(dispensing)
	medicineName := resolveMedicationDisplayName(medicine, detail)
	linkedMedicationRequestID := strings.TrimSpace(dispensing.Prescription.SatusehatMedicationRequestID)
	medicationPreview := buildMedicationMasterPreview(medicine, detail, config)
	relatedResources := make([]NamedResourcePreview, 0, 1)
	if medicationPreview != nil {
		relatedResources = append(relatedResources, *medicationPreview)
	}

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if encounterReference == "" {
		warnings = append(warnings, "Encounter belum memiliki SATUSEHAT Encounter ID.")
	}
	if medicineName == "" {
		warnings = append(warnings, "Nama obat dispensing kosong.")
	}
	if dispensing.Quantity < 1 {
		warnings = append(warnings, "Jumlah dispensing belum valid.")
	}
	if dispensing.PrescriptionID != nil && linkedMedicationRequestID == "" {
		warnings = append(warnings, "Prescription belum memiliki SATUSEHAT MedicationRequest ID; authorizingPrescription belum bisa direferensikan.")
	}
	if !looksLikeKFACode(medicine.KFACode) {
		warnings = append(warnings, "Master obat dispensing belum memiliki kode KFA; alur farmasi SATUSEHAT biasanya memakai resource Medication ber-KFA sebagai master.")
	}
	if medicationPreview == nil {
		warnings = append(warnings, "Detail produk KFA belum tersedia; resource Medication dispensing belum bisa dibentuk dari master obat ini.")
	}
	if strings.TrimSpace(firstNonEmptyText(resolveMedicationFormDisplay(detail), medicine.Form)) == "" {
		warnings = append(warnings, "Bentuk sediaan obat dispensing belum terisi; data ini biasanya dibutuhkan pada resource Medication master.")
	}

	resource := map[string]any{
		"resourceType": "MedicationDispense",
		"status":       mapMedicationDispenseStatus(dispensing.Status),
		"identifier": []map[string]any{{
			"use":    "official",
			"system": buildMedicationDispenseIdentifierSystem(config.OrganizationID),
			"value":  buildMedicationDispenseIdentifierValue(dispensing),
		}},
		"category": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/fhir/CodeSystem/medicationdispense-category",
				"code":    "community",
				"display": "Community",
			}},
		},
		"subject": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		},
		"context": map[string]any{
			"reference": fmt.Sprintf("Encounter/%s", encounterReference),
			"display":   record.Visit.VisitNumber,
		},
		"quantity": buildMedicationQuantity(dispensing.Quantity, firstNonEmptyText(resolveMedicationFormDisplay(detail), medicine.Unit.Name)),
	}
	setMedicationReference(resource, strings.TrimSpace(medicine.SatusehatMedicationID), medicineName)

	if existingID := strings.TrimSpace(dispensing.SatusehatMedicationDispenseID); existingID != "" {
		resource["id"] = existingID
	}
	if assignerOrganizationID := strings.TrimSpace(config.OrganizationID); assignerOrganizationID != "" {
		resource["identifier"] = []map[string]any{{
			"use":    "official",
			"system": buildMedicationDispenseIdentifierSystem(config.OrganizationID),
			"value":  buildMedicationDispenseIdentifierValue(dispensing),
			"assigner": map[string]any{
				"reference": fmt.Sprintf("Organization/%s", assignerOrganizationID),
			},
		}}
	}
	if dispensing.DispensedAt != nil && !dispensing.DispensedAt.IsZero() {
		resource["whenPrepared"] = formatFHIRDateTime(*dispensing.DispensedAt)
		resource["whenHandedOver"] = formatFHIRDateTime(*dispensing.DispensedAt)
	}
	if linkedMedicationRequestID != "" {
		resource["authorizingPrescription"] = []map[string]any{{
			"reference": fmt.Sprintf("MedicationRequest/%s", linkedMedicationRequestID),
		}}
	}
	if performerActor.Ready() {
		resource["performer"] = []map[string]any{{
			"actor": map[string]any{
				"reference": performerActor.Reference(),
				"display":   performerActor.Display,
			},
		}}
	}
	dosageText := buildMedicationDosageText(
		dispensing.Prescription.Dosage,
		dispensing.Prescription.Frequency,
		dispensing.Prescription.Duration,
		dispensing.Prescription.Route,
		dispensing.Prescription.Instructions,
	)
	if dosageText != "" {
		resource["dosageInstruction"] = []map[string]any{{"text": dosageText}}
	}
	if note := strings.TrimSpace(firstNonEmptyText(dispensing.Notes, dispensing.Prescription.Notes)); note != "" {
		resource["note"] = []map[string]any{{"text": note}}
	}
	if strings.TrimSpace(medicine.SatusehatMedicationID) == "" && medicationPreview != nil {
		warnings = append(warnings, "Medication master akan disinkronkan lebih dulu saat submit sehingga medicationReference final baru terisi pada payload kirim.")
	}

	ready := patientReference != "" && encounterReference != "" && medicineName != "" && dispensing.Quantity > 0 && linkedMedicationRequestID != "" && medicationPreview != nil
	return ResourcePreview{Resource: resource, RelatedResources: relatedResources, Warnings: warnings, Prerequisites: BuildMedicationDispensePrerequisites(dispensing, config), Ready: ready}
}

func buildMedicationMasterPreview(medicine models.Medicine, detail *KFAProductDetail, config Config) *NamedResourcePreview {
	if detail == nil || !looksLikeKFACode(detail.KFACode) {
		return nil
	}

	resource := map[string]any{
		"resourceType": "Medication",
		"meta": map[string]any{
			"profile": []string{"https://fhir.kemkes.go.id/r4/StructureDefinition/Medication"},
		},
		"identifier": []map[string]any{{
			"system": buildMedicationIdentifierSystem(config.OrganizationID),
			"use":    "official",
			"value":  firstNonEmptyText(strings.TrimSpace(medicine.Code), strings.TrimSpace(medicine.KFACode), fmt.Sprintf("medicine-%d", medicine.ID)),
		}},
		"code": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://sys-ids.kemkes.go.id/kfa",
				"code":    strings.TrimSpace(detail.KFACode),
				"display": resolveMedicationDisplayName(medicine, detail),
			}},
			"text": resolveMedicationDisplayName(medicine, detail),
		},
		"status": mapMedicationMasterStatus(detail.Active),
		"extension": []map[string]any{{
			"url": "https://fhir.kemkes.go.id/r4/StructureDefinition/MedicationType",
			"valueCodeableConcept": map[string]any{
				"coding": []map[string]any{{
					"system":  "http://terminology.kemkes.go.id/CodeSystem/medication-type",
					"code":    "NC",
					"display": "Non-compound",
				}},
			},
		}},
	}

	if existingID := strings.TrimSpace(medicine.SatusehatMedicationID); existingID != "" {
		resource["id"] = existingID
	}
	if form := buildMedicationForm(detail); len(form) > 0 {
		resource["form"] = form
	}
	if manufacturer := strings.TrimSpace(firstNonEmptyText(detail.Manufacturer, medicine.Manufacturer)); manufacturer != "" {
		resource["manufacturer"] = map[string]any{"display": manufacturer}
	}
	if ingredients := buildMedicationIngredients(detail); len(ingredients) > 0 {
		resource["ingredient"] = ingredients
	}

	return &NamedResourcePreview{Key: "medication", ExistingResourceID: strings.TrimSpace(medicine.SatusehatMedicationID), Resource: resource}
}

func buildMedicationForm(detail *KFAProductDetail) map[string]any {
	if detail == nil {
		return nil
	}
	if strings.TrimSpace(detail.DosageForm.Code) == "" && strings.TrimSpace(detail.DosageForm.Name) == "" {
		return nil
	}
	return map[string]any{
		"coding": []map[string]any{{
			"system":  "http://terminology.kemkes.go.id/CodeSystem/medication-form",
			"code":    strings.TrimSpace(detail.DosageForm.Code),
			"display": strings.TrimSpace(detail.DosageForm.Name),
		}},
	}

}

func buildMedicationIngredients(detail *KFAProductDetail) []map[string]any {
	if detail == nil || len(detail.ActiveIngredients) == 0 {
		return nil
	}
	result := make([]map[string]any, 0, len(detail.ActiveIngredients))
	for _, ingredient := range detail.ActiveIngredients {
		if strings.TrimSpace(ingredient.KFACode) == "" && strings.TrimSpace(ingredient.ZatAktif) == "" {
			continue
		}
		result = append(result, map[string]any{
			"isActive": true,
			"itemCodeableConcept": map[string]any{
				"coding": []map[string]any{{
					"system":  "http://sys-ids.kemkes.go.id/kfa",
					"code":    strings.TrimSpace(ingredient.KFACode),
					"display": strings.TrimSpace(ingredient.ZatAktif),
				}},
				"text": strings.TrimSpace(firstNonEmptyText(ingredient.ZatAktif, ingredient.KFACode)),
			},
		})
	}
	return result
}

func buildMedicationIdentifierSystem(organizationID string) string {
	trimmedOrganizationID := strings.TrimSpace(organizationID)
	if trimmedOrganizationID == "" {
		return buildLocalIdentifierSystem("medication", organizationID)
	}
	return fmt.Sprintf("http://sys-ids.kemkes.go.id/medication/%s", trimmedOrganizationID)
}

func buildMedicationRequestIdentifierSystem(organizationID string) string {
	trimmedOrganizationID := strings.TrimSpace(organizationID)
	if trimmedOrganizationID == "" {
		return buildLocalIdentifierSystem("medication-request", organizationID)
	}
	return fmt.Sprintf("http://sys-ids.kemkes.go.id/prescription/%s", trimmedOrganizationID)
}

func buildMedicationRequestIdentifierValue(prescription models.Prescription) string {
	if prescription.ID != 0 {
		return fmt.Sprintf("prescription-%d", prescription.ID)
	}
	if prescription.MedicalRecordID != 0 && prescription.MedicineID != 0 {
		return fmt.Sprintf("prescription-mr-%d-med-%d", prescription.MedicalRecordID, prescription.MedicineID)
	}
	if prescription.MedicalRecordID != 0 {
		return fmt.Sprintf("prescription-mr-%d", prescription.MedicalRecordID)
	}
	if prescription.MedicineID != 0 {
		return fmt.Sprintf("prescription-med-%d", prescription.MedicineID)
	}
	if !prescription.MedicalRecord.RecordDate.IsZero() {
		return fmt.Sprintf("prescription-%d", prescription.MedicalRecord.RecordDate.Unix())
	}
	return "prescription-unknown"
}

func buildMedicationDispenseIdentifierSystem(organizationID string) string {
	return buildMedicationRequestIdentifierSystem(organizationID)
}

func buildMedicationDispenseIdentifierValue(dispensing models.Dispensing) string {
	if dispensing.ID != 0 {
		return fmt.Sprintf("dispensing-%d", dispensing.ID)
	}
	if dispensing.MedicalRecordID != 0 && dispensing.MedicineID != nil && *dispensing.MedicineID != 0 {
		return fmt.Sprintf("dispensing-mr-%d-med-%d", dispensing.MedicalRecordID, *dispensing.MedicineID)
	}
	if dispensing.PrescriptionID != nil && *dispensing.PrescriptionID != 0 {
		return fmt.Sprintf("dispensing-prescription-%d", *dispensing.PrescriptionID)
	}
	if dispensing.MedicalRecordID != 0 {
		return fmt.Sprintf("dispensing-mr-%d", dispensing.MedicalRecordID)
	}
	return "dispensing-unknown"
}

func resolveMedicationDisplayName(medicine models.Medicine, detail *KFAProductDetail) string {
	if detail != nil {
		return firstNonEmptyText(detail.Name, medicine.KFAName, medicine.Name, medicine.GenericName)
	}
	return firstNonEmptyText(medicine.KFAName, medicine.Name, medicine.GenericName)
}

func resolveMedicationFormDisplay(detail *KFAProductDetail) string {
	if detail == nil {
		return ""
	}
	return strings.TrimSpace(firstNonEmptyText(detail.DosageForm.Name, detail.UOM.Name))
}

func setMedicationReference(resource map[string]any, medicationID, display string) {
	reference := map[string]any{"display": display}
	if strings.TrimSpace(medicationID) != "" {
		reference["reference"] = fmt.Sprintf("Medication/%s", strings.TrimSpace(medicationID))
	}
	resource["medicationReference"] = reference
}

func mapMedicationMasterStatus(active bool) string {
	if active {
		return "active"
	}
	return "inactive"
}

func buildMedicationQuantity(quantity int, unit string) map[string]any {
	result := map[string]any{"value": quantity}
	if trimmedUnit := strings.TrimSpace(unit); trimmedUnit != "" {
		result["unit"] = trimmedUnit
		result["system"] = "http://unitsofmeasure.org"
		result["code"] = trimmedUnit
	}
	return result
}

func buildMedicationDosageText(dosage, frequency, duration, route, instructions string) string {
	parts := make([]string, 0, 5)
	for _, value := range []string{dosage, frequency, duration, route, instructions} {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			parts = append(parts, trimmed)
		}
	}
	return strings.Join(parts, "; ")
}

func mapMedicationRequestStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "dispensed":
		return "completed"
	case "cancelled":
		return "cancelled"
	default:
		return "active"
	}
}

func mapMedicationDispenseStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "dispensed":
		return "completed"
	case "pending":
		return "preparation"
	default:
		return "in-progress"
	}
}

func resolveDispensingMedicine(dispensing models.Dispensing) models.Medicine {
	if dispensing.MedicineID != nil && dispensing.Medicine.ID != 0 {
		return dispensing.Medicine
	}
	if dispensing.Prescription.Medicine.ID != 0 {
		return dispensing.Prescription.Medicine
	}
	return models.Medicine{}
}
