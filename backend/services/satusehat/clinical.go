package satusehat

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"starter/backend/models"
)

type NamedResourcePreview struct {
	Key                string         `json:"key"`
	ExistingResourceID string         `json:"existing_resource_id,omitempty"`
	Resource           map[string]any `json:"resource"`
}

type BatchResourcePreview struct {
	Resources []NamedResourcePreview `json:"resources"`
	Warnings  []string               `json:"warnings,omitempty"`
	Ready     bool                   `json:"ready"`
}

func BuildClinicalImpressionPreview(record models.MedicalRecord, config Config) ResourcePreview {
	warnings := make([]string, 0, 6)
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	encounterReference := strings.TrimSpace(record.Visit.SatusehatEncounterID)
	practitionerReference := strings.TrimSpace(record.Doctor.SatusehatPractitionerID)

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if encounterReference == "" {
		warnings = append(warnings, "Encounter belum memiliki SATUSEHAT Encounter ID.")
	}
	if strings.TrimSpace(record.Assessment) == "" && strings.TrimSpace(record.WorkingDiagnosis) == "" {
		warnings = append(warnings, "Assessment atau working diagnosis masih kosong.")
	}

	problemReferences := make([]map[string]any, 0, len(record.Diagnoses))
	findings := make([]map[string]any, 0, len(record.Diagnoses))
	for _, diagnosis := range record.Diagnoses {
		if strings.TrimSpace(diagnosis.SatusehatConditionID) == "" {
			continue
		}

		reference := fmt.Sprintf("Condition/%s", strings.TrimSpace(diagnosis.SatusehatConditionID))
		problemReferences = append(problemReferences, map[string]any{"reference": reference})

		finding := map[string]any{
			"itemReference": map[string]any{
				"reference": reference,
			},
		}
		if strings.TrimSpace(diagnosis.ICD10.Code) != "" {
			finding["itemCodeableConcept"] = map[string]any{
				"coding": []map[string]any{{
					"system":  "http://hl7.org/fhir/sid/icd-10",
					"code":    diagnosis.ICD10.Code,
					"display": diagnosis.ICD10.Name,
				}},
			}
		}
		findings = append(findings, finding)
	}

	if len(problemReferences) == 0 {
		warnings = append(warnings, "Belum ada diagnosis yang sudah tersinkron ke SATUSEHAT; ClinicalImpression akan dikirim tanpa reference problem.")
	}

	resource := map[string]any{
		"resourceType": "ClinicalImpression",
		"status":       mapClinicalImpressionStatus(record.Status),
		"identifier": []map[string]any{{
			"system": buildLocalIdentifierSystem("clinical-impression", config.OrganizationID),
			"value":  fmt.Sprintf("clinical-impression-%d", record.ID),
		}},
		"description": firstNonEmptyText(record.WorkingDiagnosis, record.Assessment),
		"subject": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		},
		"encounter": map[string]any{
			"reference": fmt.Sprintf("Encounter/%s", encounterReference),
			"display":   record.Visit.VisitNumber,
		},
		"effectiveDateTime": formatFHIRDateTime(record.RecordDate),
		"date":              formatFHIRDateTime(record.UpdatedAt),
		"summary":           firstNonEmptyText(record.Assessment, record.Plan, record.WorkingDiagnosis),
	}

	if strings.TrimSpace(record.SatusehatClinicalImpressionID) != "" {
		resource["id"] = strings.TrimSpace(record.SatusehatClinicalImpressionID)
	}
	if practitionerReference != "" {
		resource["assessor"] = map[string]any{
			"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
			"display":   record.Doctor.FullName,
		}
	} else {
		warnings = append(warnings, "Doctor belum memiliki SATUSEHAT Practitioner ID; assessor akan diabaikan sementara.")
	}
	if len(problemReferences) > 0 {
		resource["problem"] = problemReferences
	}
	if len(findings) > 0 {
		resource["finding"] = findings
	}

	ready := patientReference != "" && encounterReference != "" && strings.TrimSpace(firstNonEmptyText(record.Assessment, record.WorkingDiagnosis, record.Plan)) != ""
	return ResourcePreview{Resource: resource, Warnings: warnings, Ready: ready}
}

func BuildVitalSignsPreview(record models.MedicalRecord, config Config) BatchResourcePreview {
	warnings := make([]string, 0, 6)
	resources := make([]NamedResourcePreview, 0, 8)
	existingIDs := ParseResourceIDMap(record.SatusehatVitalSignIDs)

	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	encounterReference := strings.TrimSpace(record.Visit.SatusehatEncounterID)
	practitionerReference := strings.TrimSpace(record.Doctor.SatusehatPractitionerID)

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if encounterReference == "" {
		warnings = append(warnings, "Encounter belum memiliki SATUSEHAT Encounter ID.")
	}
	if practitionerReference == "" {
		warnings = append(warnings, "Doctor belum memiliki SATUSEHAT Practitioner ID; performer akan dikirim tanpa reference dokter.")
	}

	addQuantityObservation := func(key, code, display string, value float64, unit, unitCode string) {
		if value <= 0 {
			return
		}

		resource := map[string]any{
			"resourceType": "Observation",
			"status":       "final",
			"identifier": []map[string]any{{
				"system": buildLocalIdentifierSystem("observation", config.OrganizationID),
				"value":  fmt.Sprintf("vital-sign-%d-%s", record.ID, key),
			}},
			"category": []map[string]any{{
				"coding": []map[string]any{{
					"system":  "http://terminology.hl7.org/CodeSystem/observation-category",
					"code":    "vital-signs",
					"display": "Vital Signs",
				}},
			}},
			"code": map[string]any{
				"coding": []map[string]any{{
					"system":  "http://loinc.org",
					"code":    code,
					"display": display,
				}},
			},
			"subject": map[string]any{
				"reference": fmt.Sprintf("Patient/%s", patientReference),
				"display":   record.Patient.FullName,
			},
			"encounter": map[string]any{
				"reference": fmt.Sprintf("Encounter/%s", encounterReference),
				"display":   record.Visit.VisitNumber,
			},
			"effectiveDateTime": formatFHIRDateTime(record.RecordDate),
			"issued":            formatFHIRDateTime(record.RecordDate),
			"valueQuantity": map[string]any{
				"value":  roundObservationValue(value),
				"unit":   unit,
				"system": "http://unitsofmeasure.org",
				"code":   unitCode,
			},
		}

		if practitionerReference != "" {
			resource["performer"] = []map[string]any{{
				"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
				"display":   record.Doctor.FullName,
			}}
		}

		if existingID := strings.TrimSpace(existingIDs[key]); existingID != "" {
			resource["id"] = existingID
		}

		resources = append(resources, NamedResourcePreview{
			Key:                key,
			ExistingResourceID: strings.TrimSpace(existingIDs[key]),
			Resource:           resource,
		})
	}

	if patientReference != "" && encounterReference != "" {
		addQuantityObservation("bp_systolic", "8480-6", "Systolic blood pressure", float64(record.BPSystolic), "mmHg", "mm[Hg]")
		addQuantityObservation("bp_diastolic", "8462-4", "Diastolic blood pressure", float64(record.BPDiastolic), "mmHg", "mm[Hg]")
		addQuantityObservation("heart_rate", "8867-4", "Heart rate", float64(record.HeartRate), "beats/minute", "/min")
		addQuantityObservation("temperature", "8310-5", "Body temperature", record.Temperature, "C", "Cel")
		addQuantityObservation("respiratory_rate", "9279-1", "Respiratory rate", float64(record.RespiratoryRate), "breaths/minute", "/min")
		addQuantityObservation("spo2", "59408-5", "Oxygen saturation in Arterial blood by Pulse oximetry", record.SpO2, "%", "%")
		addQuantityObservation("height", "8302-2", "Body height", record.Height, "cm", "cm")
		addQuantityObservation("weight", "29463-7", "Body weight", record.Weight, "kg", "kg")
		addQuantityObservation("bmi", "39156-5", "Body mass index (BMI) [Ratio]", record.BMI, "kg/m2", "kg/m2")
	}

	if len(resources) == 0 {
		warnings = append(warnings, "Belum ada vital signs numerik yang cukup untuk dikirim ke SATUSEHAT.")
	}

	ready := patientReference != "" && encounterReference != "" && len(resources) > 0
	return BatchResourcePreview{Resources: resources, Warnings: warnings, Ready: ready}
}

func BuildDiagnosisPreview(diagnosis models.MedicalRecordDiagnosis, config Config) ResourcePreview {
	warnings := make([]string, 0, 5)
	patientReference := strings.TrimSpace(diagnosis.MedicalRecord.Patient.SatusehatPatientID)
	encounterReference := strings.TrimSpace(diagnosis.MedicalRecord.Visit.SatusehatEncounterID)
	practitionerReference := strings.TrimSpace(diagnosis.MedicalRecord.Doctor.SatusehatPractitionerID)

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if encounterReference == "" {
		warnings = append(warnings, "Encounter belum memiliki SATUSEHAT Encounter ID.")
	}
	if strings.TrimSpace(diagnosis.ICD10.Code) == "" {
		warnings = append(warnings, "Kode ICD-10 diagnosis kosong.")
	}

	resource := map[string]any{
		"resourceType": "Condition",
		"identifier": []map[string]any{{
			"system": buildLocalIdentifierSystem("condition", config.OrganizationID),
			"value":  fmt.Sprintf("condition-%d", diagnosis.ID),
		}},
		"clinicalStatus": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/CodeSystem/condition-clinical",
				"code":    "active",
				"display": "Active",
			}},
		},
		"category": []map[string]any{{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/CodeSystem/condition-category",
				"code":    mapDiagnosisCategory(diagnosis.DiagnosisType),
				"display": mapDiagnosisCategoryDisplay(diagnosis.DiagnosisType),
			}},
		}},
		"code": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://hl7.org/fhir/sid/icd-10",
				"code":    diagnosis.ICD10.Code,
				"display": diagnosis.ICD10.Name,
			}},
		},
		"subject": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   diagnosis.MedicalRecord.Patient.FullName,
		},
		"encounter": map[string]any{
			"reference": fmt.Sprintf("Encounter/%s", encounterReference),
			"display":   diagnosis.MedicalRecord.Visit.VisitNumber,
		},
		"recordedDate": formatFHIRDateTime(diagnosis.MedicalRecord.RecordDate),
	}

	if strings.TrimSpace(diagnosis.SatusehatConditionID) != "" {
		resource["id"] = strings.TrimSpace(diagnosis.SatusehatConditionID)
	}

	if practitionerReference != "" {
		resource["recorder"] = map[string]any{
			"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
			"display":   diagnosis.MedicalRecord.Doctor.FullName,
		}
	} else {
		warnings = append(warnings, "Doctor belum memiliki SATUSEHAT Practitioner ID; recorder akan diabaikan sementara.")
	}

	notes := make([]map[string]any, 0, 2)
	if note := strings.TrimSpace(diagnosis.AssessmentNarrative); note != "" {
		notes = append(notes, map[string]any{"text": note})
	}
	if note := strings.TrimSpace(diagnosis.Notes); note != "" {
		notes = append(notes, map[string]any{"text": note})
	}
	if len(notes) > 0 {
		resource["note"] = notes
	}

	ready := patientReference != "" && encounterReference != "" && strings.TrimSpace(diagnosis.ICD10.Code) != ""
	return ResourcePreview{Resource: resource, Warnings: warnings, Ready: ready}
}

func ParseResourceIDMap(raw string) map[string]string {
	result := make(map[string]string)
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return result
	}
	_ = json.Unmarshal([]byte(trimmed), &result)
	return result
}

func MarshalResourceIDMap(values map[string]string) (string, error) {
	if len(values) == 0 {
		return "", nil
	}
	body, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func roundObservationValue(value float64) float64 {
	return math.Round(value*100) / 100
}

func mapDiagnosisCategory(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "utama", "primary":
		return "encounter-diagnosis"
	case "sekunder", "secondary":
		return "encounter-diagnosis"
	default:
		return "problem-list-item"
	}
}

func mapDiagnosisCategoryDisplay(value string) string {
	if mapDiagnosisCategory(value) == "encounter-diagnosis" {
		return "Encounter Diagnosis"
	}
	return "Problem List Item"
}

func mapClinicalImpressionStatus(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "final") {
		return "completed"
	}
	return "in-progress"
}

func firstNonEmptyText(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
