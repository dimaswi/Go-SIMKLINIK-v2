package satusehat

import (
	"testing"
	"time"

	"starter/backend/models"
)

func buildPreviewTestRecord() models.MedicalRecord {
	now := time.Date(2026, time.April, 10, 10, 0, 0, 0, time.UTC)
	return models.MedicalRecord{
		RecordDate: now,
		Patient: models.Patient{
			FullName:           "Pasien Uji",
			SatusehatPatientID: "patient-123",
		},
		Visit: models.Visit{
			VisitNumber:          "VIS-TEST-001",
			SatusehatEncounterID: "encounter-123",
		},
		Doctor: models.Doctor{
			FullName:                "Dokter Uji",
			SatusehatPractitionerID: "practitioner-123",
		},
	}
}

func firstCodingFromResourceCode(t *testing.T, resource map[string]any) map[string]any {
	t.Helper()

	codeRaw, ok := resource["code"]
	if !ok {
		t.Fatalf("resource tidak memiliki field code")
	}

	codeMap, ok := codeRaw.(map[string]any)
	if !ok {
		t.Fatalf("field code bukan map[string]any, got %T", codeRaw)
	}

	codingRaw, ok := codeMap["coding"]
	if !ok {
		t.Fatalf("code tidak memiliki field coding")
	}

	switch coding := codingRaw.(type) {
	case []map[string]any:
		if len(coding) == 0 {
			t.Fatalf("coding kosong")
		}
		return coding[0]
	case []any:
		if len(coding) == 0 {
			t.Fatalf("coding kosong")
		}
		first, ok := coding[0].(map[string]any)
		if !ok {
			t.Fatalf("item coding pertama bukan map[string]any, got %T", coding[0])
		}
		return first
	default:
		t.Fatalf("tipe coding tidak didukung: %T", codingRaw)
	}

	return nil
}

func TestBuildLaboratoryItemPreview_ServiceRequestCodeUsesLOINCWhenValid(t *testing.T) {
	item := models.LaboratoryOrderItem{
		TestCodeSnapshot: "718-7",
		TestNameSnapshot: "Hemoglobin",
		MedicalRecord:    buildPreviewTestRecord(),
	}

	preview := BuildLaboratoryItemPreview(item, Config{OrganizationID: "ORG-1"})
	coding := firstCodingFromResourceCode(t, preview.ServiceRequest.Resource)

	if got := coding["system"]; got != "http://loinc.org" {
		t.Fatalf("expected system http://loinc.org, got %v", got)
	}
	if got := coding["code"]; got != "718-7" {
		t.Fatalf("expected code 718-7, got %v", got)
	}
}

func TestBuildLaboratoryItemPreview_ServiceRequestCodeUsesSNOMEDFallbackWhenInvalidLOINC(t *testing.T) {
	item := models.LaboratoryOrderItem{
		TestCodeSnapshot: "LAB-HEMOGLOBIN",
		TestNameSnapshot: "Hemoglobin",
		MedicalRecord:    buildPreviewTestRecord(),
	}

	preview := BuildLaboratoryItemPreview(item, Config{OrganizationID: "ORG-1"})
	coding := firstCodingFromResourceCode(t, preview.ServiceRequest.Resource)

	if got := coding["system"]; got != "http://snomed.info/sct" {
		t.Fatalf("expected SNOMED system fallback, got %v", got)
	}
	if got := coding["code"]; got != "108252007" {
		t.Fatalf("expected SNOMED code 108252007, got %v", got)
	}
}

func TestBuildRadiologyItemPreview_ServiceRequestCodeUsesLOINCWhenValid(t *testing.T) {
	item := models.RadiologyOrderItem{
		ServiceCodeSnapshot: "24627-2",
		ServiceNameSnapshot: "Chest imaging study",
		MedicalRecord:       buildPreviewTestRecord(),
	}

	preview := BuildRadiologyItemPreview(item, Config{OrganizationID: "ORG-1"})
	coding := firstCodingFromResourceCode(t, preview.ServiceRequest.Resource)

	if got := coding["system"]; got != "http://loinc.org" {
		t.Fatalf("expected system http://loinc.org, got %v", got)
	}
	if got := coding["code"]; got != "24627-2" {
		t.Fatalf("expected code 24627-2, got %v", got)
	}
}

func TestBuildRadiologyItemPreview_ServiceRequestCodeUsesSNOMEDFallbackWhenInvalidLOINC(t *testing.T) {
	item := models.RadiologyOrderItem{
		ServiceCodeSnapshot: "RAD-CXR-PA",
		ServiceNameSnapshot: "Chest X-Ray PA",
		MedicalRecord:       buildPreviewTestRecord(),
	}

	preview := BuildRadiologyItemPreview(item, Config{OrganizationID: "ORG-1"})
	coding := firstCodingFromResourceCode(t, preview.ServiceRequest.Resource)

	if got := coding["system"]; got != "http://snomed.info/sct" {
		t.Fatalf("expected SNOMED system fallback, got %v", got)
	}
	if got := coding["code"]; got != "363679005" {
		t.Fatalf("expected SNOMED code 363679005, got %v", got)
	}
}

func TestBuildLaboratoryItemPreview_DiagnosticReportSkippedWhenInvalidLOINC(t *testing.T) {
	item := models.LaboratoryOrderItem{
		TestCodeSnapshot: "LAB-HEMOGLOBIN",
		TestNameSnapshot: "Hemoglobin",
		MedicalRecord:    buildPreviewTestRecord(),
		ParameterResults: []models.LaboratoryOrderParameterResult{{
			ID:                    1,
			ParameterCodeSnapshot: "718-7",
			ParameterNameSnapshot: "Hemoglobin",
			ResultValue:           "13.2",
		}},
	}

	preview := BuildLaboratoryItemPreview(item, Config{OrganizationID: "ORG-1"})
	if preview.DiagnosticReport != nil {
		t.Fatalf("expected diagnostic report to be skipped when report code is not valid LOINC")
	}
}

func TestBuildRadiologyItemPreview_DiagnosticReportSkippedWhenInvalidLOINC(t *testing.T) {
	item := models.RadiologyOrderItem{
		ServiceCodeSnapshot: "RAD-CXR-PA",
		ServiceNameSnapshot: "Chest X-Ray PA",
		Findings:            "Tidak tampak infiltrat aktif.",
		MedicalRecord:       buildPreviewTestRecord(),
	}

	preview := BuildRadiologyItemPreview(item, Config{OrganizationID: "ORG-1"})
	if preview.DiagnosticReport != nil {
		t.Fatalf("expected diagnostic report to be skipped when report code is not valid LOINC")
	}
}

func TestBuildCarePlanPreview_UsesOfficialPayloadShapeAndSingleAuthorReference(t *testing.T) {
	record := buildPreviewTestRecord()
	record.Plan = "Kontrol 7 hari"

	preview := BuildCarePlanPreview(record, Config{OrganizationID: "ORG-1"})
	resource := preview.Resource

	categoryRaw, ok := resource["category"]
	if !ok {
		t.Fatalf("expected careplan category")
	}
	categoryList, ok := categoryRaw.([]map[string]any)
	if !ok || len(categoryList) == 0 {
		t.Fatalf("expected careplan category as non-empty []map[string]any")
	}
	codingRaw, ok := categoryList[0]["coding"]
	if !ok {
		t.Fatalf("expected category.coding")
	}
	codingList, ok := codingRaw.([]map[string]any)
	if !ok || len(codingList) == 0 {
		t.Fatalf("expected category.coding as non-empty []map[string]any")
	}
	if got := codingList[0]["system"]; got != "http://snomed.info/sct" {
		t.Fatalf("expected careplan category system http://snomed.info/sct, got %v", got)
	}
	if got := codingList[0]["code"]; got != "736271009" {
		t.Fatalf("expected careplan category code 736271009, got %v", got)
	}

	authorRaw, ok := resource["author"]
	if !ok {
		t.Fatalf("expected careplan author")
	}
	authorMap, ok := authorRaw.(map[string]any)
	if !ok {
		t.Fatalf("expected careplan author as single map[string]any, got %T", authorRaw)
	}
	if got := authorMap["reference"]; got != "Practitioner/practitioner-123" {
		t.Fatalf("expected practitioner author reference, got %v", got)
	}
}

func TestBuildMedicationMasterPreviewForMedicine_UsesKFACodingSystem(t *testing.T) {
	medicine := models.Medicine{
		ID:      10,
		Code:    "MED-10",
		KFACode: "93000001",
		Name:    "Paracetamol",
	}
	detail := &KFAProductDetail{
		KFACode: "93000001",
		Name:    "Paracetamol",
		Active:  true,
		DosageForm: KFAConcept{
			Code: "TAB",
			Name: "Tablet",
		},
	}

	preview := BuildMedicationMasterPreviewForMedicine(medicine, detail, Config{OrganizationID: "ORG-1"})
	if preview.Resource == nil {
		t.Fatalf("expected medication resource to be built")
	}

	coding := firstCodingFromResourceCode(t, preview.Resource)
	if got := coding["system"]; got != "http://sys-ids.kemkes.go.id/kfa" {
		t.Fatalf("expected medication coding system http://sys-ids.kemkes.go.id/kfa, got %v", got)
	}
	if got := coding["code"]; got != "93000001" {
		t.Fatalf("expected KFA code 93000001, got %v", got)
	}
}
