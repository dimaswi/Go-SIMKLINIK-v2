package satusehat

import (
	"fmt"
	"strings"
	"time"

	"starter/backend/models"
)

type RadiologyItemPreview struct {
	ServiceRequest   NamedResourcePreview   `json:"service_request"`
	Observations     []NamedResourcePreview `json:"observations,omitempty"`
	DiagnosticReport *NamedResourcePreview  `json:"diagnostic_report,omitempty"`
	Warnings         []string               `json:"warnings,omitempty"`
	Prerequisites    []ResourcePrerequisite `json:"prerequisites,omitempty"`
	Ready            bool                   `json:"ready"`
	HasResults       bool                   `json:"has_results"`
}

func BuildRadiologyItemPreview(item models.RadiologyOrderItem, config Config) RadiologyItemPreview {
	warnings := make([]string, 0, 8)
	record := item.MedicalRecord
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	encounterReference := strings.TrimSpace(record.Visit.SatusehatEncounterID)
	practitionerReference := strings.TrimSpace(record.Doctor.SatusehatPractitionerID)
	organizationReference := strings.TrimSpace(config.OrganizationID)

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if encounterReference == "" {
		warnings = append(warnings, "Encounter belum memiliki SATUSEHAT Encounter ID.")
	}
	if strings.TrimSpace(item.ServiceNameSnapshot) == "" {
		warnings = append(warnings, "Nama pemeriksaan radiologi kosong.")
	}

	serviceRequest := NamedResourcePreview{
		Key:                "service_request",
		ExistingResourceID: strings.TrimSpace(item.SatusehatServiceRequestID),
		Resource: map[string]any{
			"resourceType": "ServiceRequest",
			"status":       mapRadiologyServiceRequestStatus(item),
			"intent":       "original-order",
			"identifier": []map[string]any{{
				"use":    "official",
				"system": buildServiceRequestIdentifierSystem(config.OrganizationID),
				"value":  buildRadiologyServiceRequestIdentifierValue(item),
			}},
			"category": []map[string]any{{
				"coding": []map[string]any{{
					"system":  "http://snomed.info/sct",
					"code":    "363679005",
					"display": "Imaging",
				}},
			}},
			"code": buildRadiologyCodeableConcept(item.ServiceCodeSnapshot, item.ServiceNameSnapshot, config.OrganizationID),
			"subject": map[string]any{
				"reference": fmt.Sprintf("Patient/%s", patientReference),
				"display":   record.Patient.FullName,
			},
			"encounter": map[string]any{
				"reference": fmt.Sprintf("Encounter/%s", encounterReference),
				"display":   record.Visit.VisitNumber,
			},
			"occurrenceDateTime": formatFHIRDateTime(record.RecordDate),
		},
	}

	if existingID := strings.TrimSpace(item.SatusehatServiceRequestID); existingID != "" {
		serviceRequest.Resource["id"] = existingID
	}
	if assignerOrganizationID := strings.TrimSpace(config.OrganizationID); assignerOrganizationID != "" {
		serviceRequest.Resource["identifier"] = []map[string]any{{
			"use":    "official",
			"system": buildServiceRequestIdentifierSystem(config.OrganizationID),
			"value":  buildRadiologyServiceRequestIdentifierValue(item),
			"assigner": map[string]any{
				"reference": fmt.Sprintf("Organization/%s", assignerOrganizationID),
			},
		}}
	}
	if practitionerReference != "" {
		serviceRequest.Resource["requester"] = map[string]any{
			"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
			"display":   record.Doctor.FullName,
		}
	} else {
		warnings = append(warnings, "Doctor belum memiliki SATUSEHAT Practitioner ID; requester akan diabaikan sementara.")
	}
	if organizationReference != "" {
		serviceRequest.Resource["performer"] = []map[string]any{{
			"reference": fmt.Sprintf("Organization/%s", organizationReference),
		}}
	}
	if note := strings.TrimSpace(item.Instructions); note != "" {
		serviceRequest.Resource["note"] = []map[string]any{{"text": note}}
	}

	serviceRequestReference := "ServiceRequest/{satusehat_service_request_id}"
	if existingID := strings.TrimSpace(item.SatusehatServiceRequestID); existingID != "" {
		serviceRequestReference = fmt.Sprintf("ServiceRequest/%s", existingID)
	}

	observations := buildRadiologyObservationPreviews(item, record, config.OrganizationID, serviceRequestReference)
	hasNarrative := strings.TrimSpace(firstNonEmptyText(item.Findings, item.Impression, item.Recommendation, item.ResultNotes)) != ""
	hasResults := hasNarrative || len(observations) > 0
	reportCodeReady := looksLikeLOINCCode(item.ServiceCodeSnapshot)
	if !hasResults {
		warnings = append(warnings, "Belum ada hasil radiologi yang siap dikirim; sync hanya akan mengirim ServiceRequest lebih dulu.")
	}
	if hasResults && !reportCodeReady {
		warnings = append(warnings, "DiagnosticReport radiologi membutuhkan kode LOINC valid pada master layanan; report akan dilewati sampai kode LOINC diisi.")
	}

	var diagnosticReport *NamedResourcePreview
	if hasResults && reportCodeReady {
		report := NamedResourcePreview{
			Key:                "diagnostic_report",
			ExistingResourceID: strings.TrimSpace(item.SatusehatDiagnosticReportID),
			Resource: map[string]any{
				"resourceType": "DiagnosticReport",
				"status":       "final",
				"category": []map[string]any{{
					"coding": []map[string]any{{
						"system":  "http://terminology.hl7.org/CodeSystem/v2-0074",
						"code":    "RAD",
						"display": "Radiology",
					}},
				}},
				"code": buildRadiologyCodeableConcept(item.ServiceCodeSnapshot, item.ServiceNameSnapshot, config.OrganizationID),
				"subject": map[string]any{
					"reference": fmt.Sprintf("Patient/%s", patientReference),
					"display":   record.Patient.FullName,
				},
				"encounter": map[string]any{
					"reference": fmt.Sprintf("Encounter/%s", encounterReference),
					"display":   record.Visit.VisitNumber,
				},
				"effectiveDateTime": formatFHIRDateTime(resolveRadiologyResultDateTime(item, record.RecordDate)),
				"issued":            formatFHIRDateTime(resolveRadiologyResultDateTime(item, record.RecordDate)),
				"basedOn": []map[string]any{{
					"reference": serviceRequestReference,
				}},
			},
		}

		if existingID := strings.TrimSpace(item.SatusehatDiagnosticReportID); existingID != "" {
			report.Resource["id"] = existingID
		}
		reportPerformerReady := false
		if organizationReference != "" {
			report.Resource["performer"] = []map[string]any{{
				"reference": fmt.Sprintf("Organization/%s", organizationReference),
			}}
			reportPerformerReady = true
		} else if practitionerReference != "" {
			report.Resource["performer"] = []map[string]any{{
				"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
				"display":   record.Doctor.FullName,
			}}
			reportPerformerReady = true
		}
		if conclusion := strings.TrimSpace(firstNonEmptyText(item.Impression, item.Findings, item.ResultNotes)); conclusion != "" {
			report.Resource["conclusion"] = conclusion
		}
		conclusionCodes := make([]map[string]any, 0, 2)
		if findings := strings.TrimSpace(item.Findings); findings != "" {
			conclusionCodes = append(conclusionCodes, map[string]any{"text": findings})
		}
		if recommendation := strings.TrimSpace(item.Recommendation); recommendation != "" {
			conclusionCodes = append(conclusionCodes, map[string]any{"text": recommendation})
		}
		if len(conclusionCodes) > 0 {
			report.Resource["conclusionCode"] = conclusionCodes
		}

		resultRefs := make([]map[string]any, 0, len(observations))
		for _, observation := range observations {
			observationReference := "Observation/{satusehat_observation_id}"
			if observation.ExistingResourceID != "" {
				observationReference = fmt.Sprintf("Observation/%s", observation.ExistingResourceID)
			}
			resultRefs = append(resultRefs, map[string]any{"reference": observationReference})
		}
		if len(resultRefs) > 0 {
			report.Resource["result"] = resultRefs
		}
		if reportPerformerReady {
			diagnosticReport = &report
		} else {
			warnings = append(warnings, "DiagnosticReport radiologi membutuhkan performer SATUSEHAT; sinkronkan Organization atau Practitioner agar report bisa dikirim.")
		}
	}

	ready := patientReference != "" && encounterReference != "" && strings.TrimSpace(item.ServiceNameSnapshot) != ""
	return RadiologyItemPreview{
		ServiceRequest:   serviceRequest,
		Observations:     observations,
		DiagnosticReport: diagnosticReport,
		Warnings:         warnings,
		Prerequisites:    BuildRadiologyPrerequisites(item, config),
		Ready:            ready,
		HasResults:       hasResults,
	}
}

func buildRadiologyObservationPreviews(item models.RadiologyOrderItem, record models.MedicalRecord, organizationID, serviceRequestReference string) []NamedResourcePreview {
	observations := make([]NamedResourcePreview, 0, len(item.ParameterResults))
	for _, parameter := range item.ParameterResults {
		trimmedResultValue := strings.TrimSpace(parameter.ResultValue)
		if trimmedResultValue == "" {
			continue
		}

		resource := map[string]any{
			"resourceType": "Observation",
			"status":       "final",
			"identifier": []map[string]any{{
				"use":    "official",
				"system": buildObservationIdentifierSystem(organizationID),
				"value":  buildRadiologyObservationIdentifierValue(item, parameter.ID),
			}},
			"category": []map[string]any{{
				"coding": []map[string]any{{
					"system":  "http://terminology.hl7.org/CodeSystem/observation-category",
					"code":    "imaging",
					"display": "Imaging",
				}},
			}},
			"code": buildRadiologyCodeableConcept(parameter.ParameterCodeSnapshot, parameter.ParameterNameSnapshot, organizationID),
			"subject": map[string]any{
				"reference": fmt.Sprintf("Patient/%s", record.Patient.SatusehatPatientID),
				"display":   record.Patient.FullName,
			},
			"encounter": map[string]any{
				"reference": fmt.Sprintf("Encounter/%s", record.Visit.SatusehatEncounterID),
				"display":   record.Visit.VisitNumber,
			},
			"effectiveDateTime": formatFHIRDateTime(coalesceRadiologyResultDateTime(parameter.ResultDate, item.ResultDate, record.RecordDate)),
			"issued":            formatFHIRDateTime(coalesceRadiologyResultDateTime(parameter.ResultDate, item.ResultDate, record.RecordDate)),
			"basedOn": []map[string]any{{
				"reference": serviceRequestReference,
			}},
		}

		resource["valueString"] = trimmedResultValue
		if note := strings.TrimSpace(firstNonEmptyText(parameter.ResultNotes, parameter.Flag)); note != "" {
			resource["note"] = []map[string]any{{"text": note}}
		}
		if practitionerID := strings.TrimSpace(record.Doctor.SatusehatPractitionerID); practitionerID != "" {
			resource["performer"] = []map[string]any{{
				"reference": fmt.Sprintf("Practitioner/%s", practitionerID),
				"display":   record.Doctor.FullName,
			}}
		} else if strings.TrimSpace(organizationID) != "" {
			resource["performer"] = []map[string]any{{
				"reference": fmt.Sprintf("Organization/%s", strings.TrimSpace(organizationID)),
			}}
		}
		if strings.TrimSpace(parameter.SatusehatObservationID) != "" {
			resource["id"] = strings.TrimSpace(parameter.SatusehatObservationID)
		}

		observations = append(observations, NamedResourcePreview{
			Key:                fmt.Sprintf("parameter_%d", parameter.ID),
			ExistingResourceID: strings.TrimSpace(parameter.SatusehatObservationID),
			Resource:           resource,
		})
	}
	return observations
}

func buildRadiologyCodeableConcept(code, display, organizationID string) map[string]any {
	_ = organizationID

	trimmedCode := strings.TrimSpace(code)
	trimmedDisplay := strings.TrimSpace(display)
	text := firstNonEmptyText(trimmedDisplay, trimmedCode, "Imaging procedure")

	concept := map[string]any{"text": text}
	if looksLikeLOINCCode(trimmedCode) {
		concept["coding"] = []map[string]any{{
			"system":  "http://loinc.org",
			"code":    trimmedCode,
			"display": firstNonEmptyText(trimmedDisplay, text),
		}}
	} else {
		// SATUSEHAT requires ServiceRequest.code with a recognized coding system;
		// use SNOMED fallback for imaging when LOINC is unavailable.
		concept["coding"] = []map[string]any{{
			"system":  "http://snomed.info/sct",
			"code":    "363679005",
			"display": firstNonEmptyText(trimmedDisplay, "Imaging"),
		}}
	}
	return concept
}

func coalesceRadiologyResultDateTime(primary, secondary *time.Time, fallback time.Time) time.Time {
	if primary != nil && !primary.IsZero() {
		return *primary
	}
	if secondary != nil && !secondary.IsZero() {
		return *secondary
	}
	return fallback
}

func resolveRadiologyResultDateTime(item models.RadiologyOrderItem, fallback time.Time) time.Time {
	if item.ResultDate != nil && !item.ResultDate.IsZero() {
		return *item.ResultDate
	}
	for _, parameter := range item.ParameterResults {
		if parameter.ResultDate != nil && !parameter.ResultDate.IsZero() {
			return *parameter.ResultDate
		}
	}
	return fallback
}

func mapRadiologyServiceRequestStatus(item models.RadiologyOrderItem) string {
	if item.ResultDate != nil || strings.TrimSpace(item.Findings) != "" || strings.TrimSpace(item.Impression) != "" || strings.TrimSpace(item.Recommendation) != "" {
		return "completed"
	}
	for _, parameter := range item.ParameterResults {
		if parameter.ResultDate != nil || strings.TrimSpace(parameter.ResultValue) != "" {
			return "completed"
		}
	}
	return "active"
}

func buildRadiologyServiceRequestIdentifierValue(item models.RadiologyOrderItem) string {
	if item.ID != 0 {
		return fmt.Sprintf("radiology-order-item-%d", item.ID)
	}
	if item.MedicalRecordID != 0 && item.MedicalServiceID != 0 {
		return fmt.Sprintf("radiology-mr-%d-service-%d", item.MedicalRecordID, item.MedicalServiceID)
	}
	if item.MedicalRecordID != 0 {
		return fmt.Sprintf("radiology-mr-%d", item.MedicalRecordID)
	}
	if item.MedicalServiceID != 0 {
		return fmt.Sprintf("radiology-service-%d", item.MedicalServiceID)
	}
	return "radiology-order-item-unknown"
}

func buildRadiologyObservationIdentifierValue(item models.RadiologyOrderItem, parameterID uint) string {
	if item.ID != 0 && parameterID != 0 {
		return fmt.Sprintf("radiology-order-item-%d-parameter-%d", item.ID, parameterID)
	}
	if item.ID != 0 {
		return fmt.Sprintf("radiology-order-item-%d-observation", item.ID)
	}
	if item.MedicalRecordID != 0 && parameterID != 0 {
		return fmt.Sprintf("radiology-mr-%d-parameter-%d", item.MedicalRecordID, parameterID)
	}
	if item.MedicalRecordID != 0 {
		return fmt.Sprintf("radiology-mr-%d-observation", item.MedicalRecordID)
	}
	if parameterID != 0 {
		return fmt.Sprintf("radiology-parameter-%d", parameterID)
	}
	return "radiology-observation-unknown"
}
