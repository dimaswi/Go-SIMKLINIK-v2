package satusehat

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"starter/backend/models"
)

type LaboratoryItemPreview struct {
	ServiceRequest   NamedResourcePreview   `json:"service_request"`
	Specimen         *NamedResourcePreview  `json:"specimen,omitempty"`
	Observations     []NamedResourcePreview `json:"observations,omitempty"`
	DiagnosticReport *NamedResourcePreview  `json:"diagnostic_report,omitempty"`
	Warnings         []string               `json:"warnings,omitempty"`
	Prerequisites    []ResourcePrerequisite `json:"prerequisites,omitempty"`
	Ready            bool                   `json:"ready"`
	HasResults       bool                   `json:"has_results"`
}

func BuildLaboratoryItemPreview(item models.LaboratoryOrderItem, config Config) LaboratoryItemPreview {
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
	if strings.TrimSpace(item.TestNameSnapshot) == "" {
		warnings = append(warnings, "Nama pemeriksaan laboratorium kosong.")
	}

	serviceRequest := NamedResourcePreview{
		Key:                "service_request",
		ExistingResourceID: strings.TrimSpace(item.SatusehatServiceRequestID),
		Resource: map[string]any{
			"resourceType": "ServiceRequest",
			"status":       mapLabServiceRequestStatus(item),
			"intent":       "original-order",
			"identifier": []map[string]any{{
				"use":    "official",
				"system": buildServiceRequestIdentifierSystem(config.OrganizationID),
				"value":  buildLaboratoryServiceRequestIdentifierValue(item),
			}},
			"category": []map[string]any{{
				"coding": []map[string]any{{
					"system":  "http://snomed.info/sct",
					"code":    "108252007",
					"display": "Laboratory procedure",
				}},
			}},
			"code": buildLabCodeableConcept(item.TestCodeSnapshot, item.TestNameSnapshot, config.OrganizationID),
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
			"value":  buildLaboratoryServiceRequestIdentifierValue(item),
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

	specimen := buildLaboratorySpecimenPreview(item, record, config.OrganizationID, practitionerReference, serviceRequestReference)
	specimenReference := ""
	if specimen != nil {
		specimenReference = "Specimen/{satusehat_specimen_id}"
		if existingID := strings.TrimSpace(specimen.ExistingResourceID); existingID != "" {
			specimenReference = fmt.Sprintf("Specimen/%s", existingID)
		}
	}

	observations := buildLaboratoryObservationPreviews(item, record, config.OrganizationID, serviceRequestReference, specimenReference)
	hasResults := len(observations) > 0
	reportCodeReady := looksLikeLOINCCode(item.TestCodeSnapshot)
	if !hasResults {
		warnings = append(warnings, "Belum ada hasil laboratorium yang siap dikirim; sync hanya akan mengirim ServiceRequest lebih dulu.")
	} else if specimen == nil {
		warnings = append(warnings, "Collection SATUSEHAT laboratorium biasanya juga memakai resource Specimen; item ini belum memiliki specimen transaksi yang siap dipakai.")
	}
	if hasResults && !reportCodeReady {
		warnings = append(warnings, "DiagnosticReport laboratorium membutuhkan kode LOINC valid pada master pemeriksaan; report akan dilewati sampai kode LOINC diisi.")
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
						"code":    "LAB",
						"display": "Laboratory",
					}},
				}},
				"code": buildLabCodeableConcept(item.TestCodeSnapshot, item.TestNameSnapshot, config.OrganizationID),
				"subject": map[string]any{
					"reference": fmt.Sprintf("Patient/%s", patientReference),
					"display":   record.Patient.FullName,
				},
				"encounter": map[string]any{
					"reference": fmt.Sprintf("Encounter/%s", encounterReference),
					"display":   record.Visit.VisitNumber,
				},
				"effectiveDateTime": formatFHIRDateTime(resolveLabResultDateTime(item, record.RecordDate)),
				"issued":            formatFHIRDateTime(resolveLabResultDateTime(item, record.RecordDate)),
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
		if specimenReference != "" {
			report.Resource["specimen"] = []map[string]any{{
				"reference": specimenReference,
			}}
		}
		if note := strings.TrimSpace(firstNonEmptyText(item.ResultNotes, item.ResultValue)); note != "" {
			report.Resource["conclusion"] = note
		}

		resultRefs := make([]map[string]any, 0, len(observations))
		for _, observation := range observations {
			observationReference := "Observation/{satusehat_observation_id}"
			if observation.ExistingResourceID != "" {
				observationReference = fmt.Sprintf("Observation/%s", observation.ExistingResourceID)
			}
			resultRefs = append(resultRefs, map[string]any{"reference": observationReference})
		}
		report.Resource["result"] = resultRefs
		if reportPerformerReady {
			diagnosticReport = &report
		} else {
			warnings = append(warnings, "DiagnosticReport laboratorium membutuhkan performer SATUSEHAT; sinkronkan Organization atau Practitioner agar report bisa dikirim.")
		}
	}

	ready := patientReference != "" && encounterReference != "" && strings.TrimSpace(item.TestNameSnapshot) != "" && (!hasResults || specimen != nil)
	return LaboratoryItemPreview{
		ServiceRequest:   serviceRequest,
		Specimen:         specimen,
		Observations:     observations,
		DiagnosticReport: diagnosticReport,
		Warnings:         warnings,
		Prerequisites:    BuildLaboratoryPrerequisites(item, config),
		Ready:            ready,
		HasResults:       hasResults,
	}
}

func buildLaboratorySpecimenPreview(item models.LaboratoryOrderItem, record models.MedicalRecord, organizationID, practitionerReference, serviceRequestReference string) *NamedResourcePreview {
	if item.Specimen == nil {
		return nil
	}

	specimen := item.Specimen
	typeDisplay := strings.TrimSpace(firstNonEmptyText(specimen.TypeDisplay, specimen.TemplateNameSnapshot))
	typeCode := strings.TrimSpace(specimen.TypeCode)
	if typeDisplay == "" && typeCode == "" {
		return nil
	}

	resource := map[string]any{
		"resourceType": "Specimen",
		"status":       "available",
		"subject": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", record.Patient.SatusehatPatientID),
			"display":   record.Patient.FullName,
		},
		"request": []map[string]any{{
			"reference": serviceRequestReference,
		}},
	}

	typeConcept := map[string]any{"text": typeDisplay}
	if typeCode != "" {
		typeConcept["coding"] = []map[string]any{{
			"system":  firstNonEmptyText(specimen.TypeSystem, "http://snomed.info/sct"),
			"code":    typeCode,
			"display": typeDisplay,
		}}
	}
	resource["type"] = typeConcept

	identifier := map[string]any{
		"system": buildSpecimenIdentifierSystem(organizationID),
		"value":  buildLaboratorySpecimenIdentifierValue(item),
	}
	if strings.TrimSpace(organizationID) != "" {
		identifier["assigner"] = map[string]any{"reference": fmt.Sprintf("Organization/%s", strings.TrimSpace(organizationID))}
	}
	resource["identifier"] = []map[string]any{identifier}

	collectedAt := resolveLaboratorySpecimenCollectedDateTime(specimen, record.RecordDate)
	receivedAt := resolveLaboratorySpecimenReceivedDateTime(specimen, collectedAt)
	collection := map[string]any{
		"collectedDateTime": formatFHIRDateTime(collectedAt),
	}
	if practitionerReference != "" {
		collection["collector"] = map[string]any{
			"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
			"display":   record.Doctor.FullName,
		}
	}
	if methodCode := strings.TrimSpace(specimen.CollectionMethodCode); methodCode != "" || strings.TrimSpace(specimen.CollectionMethodDisplay) != "" {
		collection["method"] = map[string]any{
			"coding": []map[string]any{{
				"system":  firstNonEmptyText(specimen.CollectionMethodSystem, "http://snomed.info/sct"),
				"code":    methodCode,
				"display": strings.TrimSpace(specimen.CollectionMethodDisplay),
			}},
		}
	}
	resource["collection"] = collection
	resource["receivedTime"] = formatFHIRDateTime(receivedAt)
	resource["processing"] = []map[string]any{{
		"procedure": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://snomed.info/sct",
				"code":    "9265001",
				"display": "Specimen processing",
			}},
		},
		"timeDateTime": formatFHIRDateTime(receivedAt),
	}}
	if note := strings.TrimSpace(specimen.Notes); note != "" {
		resource["condition"] = []map[string]any{{"text": note}}
	}
	if existingID := strings.TrimSpace(specimen.SatusehatSpecimenID); existingID != "" {
		resource["id"] = existingID
	}

	return &NamedResourcePreview{
		Key:                "specimen",
		ExistingResourceID: strings.TrimSpace(specimen.SatusehatSpecimenID),
		Resource:           resource,
	}
}

func buildLaboratoryObservationPreviews(item models.LaboratoryOrderItem, record models.MedicalRecord, organizationID, serviceRequestReference, specimenReference string) []NamedResourcePreview {
	observations := make([]NamedResourcePreview, 0, len(item.ParameterResults)+1)

	createObservation := func(key, existingResourceID, code, display, unit, resultValue, note string, resultDate *time.Time) {
		trimmedResultValue := strings.TrimSpace(resultValue)
		if trimmedResultValue == "" {
			return
		}

		resource := map[string]any{
			"resourceType": "Observation",
			"status":       "final",
			"identifier": []map[string]any{{
				"use":    "official",
				"system": buildObservationIdentifierSystem(organizationID),
				"value":  buildLaboratoryObservationIdentifierValue(item, key),
			}},
			"category": []map[string]any{{
				"coding": []map[string]any{{
					"system":  "http://terminology.hl7.org/CodeSystem/observation-category",
					"code":    "laboratory",
					"display": "Laboratory",
				}},
			}},
			"code": buildLabCodeableConcept(code, display, organizationID),
			"subject": map[string]any{
				"reference": fmt.Sprintf("Patient/%s", record.Patient.SatusehatPatientID),
				"display":   record.Patient.FullName,
			},
			"encounter": map[string]any{
				"reference": fmt.Sprintf("Encounter/%s", record.Visit.SatusehatEncounterID),
				"display":   record.Visit.VisitNumber,
			},
			"effectiveDateTime": formatFHIRDateTime(coalesceLabResultDateTime(resultDate, item.ResultDate, record.RecordDate)),
			"issued":            formatFHIRDateTime(coalesceLabResultDateTime(resultDate, item.ResultDate, record.RecordDate)),
			"basedOn": []map[string]any{{
				"reference": serviceRequestReference,
			}},
		}
		if strings.TrimSpace(organizationID) != "" {
			resource["performer"] = []map[string]any{{
				"reference": fmt.Sprintf("Organization/%s", strings.TrimSpace(organizationID)),
			}}
		}
		if specimenReference != "" {
			resource["specimen"] = map[string]any{"reference": specimenReference}
		}

		if parsed, ok := parseLabNumeric(trimmedResultValue); ok {
			valueQuantity := map[string]any{"value": roundObservationValue(parsed)}
			if strings.TrimSpace(unit) != "" {
				valueQuantity["unit"] = strings.TrimSpace(unit)
				valueQuantity["system"] = "http://unitsofmeasure.org"
				valueQuantity["code"] = strings.TrimSpace(unit)
			}
			resource["valueQuantity"] = valueQuantity
		} else {
			resource["valueString"] = trimmedResultValue
		}
		if strings.TrimSpace(note) != "" {
			resource["note"] = []map[string]any{{"text": strings.TrimSpace(note)}}
		}
		if strings.TrimSpace(existingResourceID) != "" {
			resource["id"] = strings.TrimSpace(existingResourceID)
		}

		observations = append(observations, NamedResourcePreview{
			Key:                key,
			ExistingResourceID: strings.TrimSpace(existingResourceID),
			Resource:           resource,
		})
	}

	if len(item.ParameterResults) > 0 {
		for _, parameter := range item.ParameterResults {
			createObservation(
				fmt.Sprintf("parameter_%d", parameter.ID),
				parameter.SatusehatObservationID,
				parameter.ParameterCodeSnapshot,
				parameter.ParameterNameSnapshot,
				parameter.UnitSnapshot,
				parameter.ResultValue,
				firstNonEmptyText(parameter.ResultNotes, parameter.Flag),
				parameter.ResultDate,
			)
		}
		return observations
	}

	createObservation(
		"item_result",
		item.SatusehatObservationID,
		item.TestCodeSnapshot,
		item.TestNameSnapshot,
		item.UnitSnapshot,
		item.ResultValue,
		firstNonEmptyText(item.ResultNotes, item.Flag),
		item.ResultDate,
	)

	return observations
}

func buildSpecimenIdentifierSystem(organizationID string) string {
	trimmedOrganizationID := strings.TrimSpace(organizationID)
	if trimmedOrganizationID == "" {
		return buildLocalIdentifierSystem("specimen", organizationID)
	}
	return fmt.Sprintf("http://sys-ids.kemkes.go.id/specimen/%s", trimmedOrganizationID)
}

func buildLaboratorySpecimenIdentifierValue(item models.LaboratoryOrderItem) string {
	templateCode := strings.TrimSpace(item.Specimen.TemplateCodeSnapshot)
	if templateCode == "" {
		templateCode = strings.TrimSpace(item.TestCodeSnapshot)
	}
	if templateCode == "" {
		return fmt.Sprintf("LABSPEC-%d", item.ID)
	}
	return fmt.Sprintf("LABSPEC-%d-%s", item.ID, strings.ToUpper(templateCode))
}

func buildLaboratoryServiceRequestIdentifierValue(item models.LaboratoryOrderItem) string {
	if item.ID != 0 {
		return fmt.Sprintf("lab-order-item-%d", item.ID)
	}
	if item.MedicalRecordID != 0 && item.MedicalServiceID != 0 {
		return fmt.Sprintf("lab-mr-%d-service-%d", item.MedicalRecordID, item.MedicalServiceID)
	}
	if item.MedicalRecordID != 0 {
		return fmt.Sprintf("lab-mr-%d", item.MedicalRecordID)
	}
	if item.MedicalServiceID != 0 {
		return fmt.Sprintf("lab-service-%d", item.MedicalServiceID)
	}
	return "lab-order-item-unknown"
}

func buildLaboratoryObservationIdentifierValue(item models.LaboratoryOrderItem, key string) string {
	trimmedKey := strings.TrimSpace(key)
	if trimmedKey == "" {
		trimmedKey = "item_result"
	}
	if item.ID != 0 {
		return fmt.Sprintf("lab-order-item-%d-observation-%s", item.ID, trimmedKey)
	}
	if item.MedicalRecordID != 0 {
		return fmt.Sprintf("lab-mr-%d-observation-%s", item.MedicalRecordID, trimmedKey)
	}
	return fmt.Sprintf("lab-observation-%s", trimmedKey)
}

func resolveLaboratorySpecimenCollectedDateTime(specimen *models.LaboratoryOrderSpecimen, fallback time.Time) time.Time {
	if specimen != nil && specimen.CollectedAt != nil && !specimen.CollectedAt.IsZero() {
		return *specimen.CollectedAt
	}
	return fallback
}

func resolveLaboratorySpecimenReceivedDateTime(specimen *models.LaboratoryOrderSpecimen, fallback time.Time) time.Time {
	if specimen != nil && specimen.ReceivedAt != nil && !specimen.ReceivedAt.IsZero() {
		return *specimen.ReceivedAt
	}
	return fallback
}

func buildLabCodeableConcept(code, display, organizationID string) map[string]any {
	_ = organizationID

	trimmedCode := strings.TrimSpace(code)
	trimmedDisplay := strings.TrimSpace(display)
	text := firstNonEmptyText(trimmedDisplay, trimmedCode, "Laboratory test")

	concept := map[string]any{
		"text": text,
	}

	if looksLikeLOINCCode(trimmedCode) {
		concept["coding"] = []map[string]any{{
			"system":  "http://loinc.org",
			"code":    trimmedCode,
			"display": firstNonEmptyText(trimmedDisplay, text),
		}}
	} else {
		// SATUSEHAT requires ServiceRequest.code with a recognized coding system;
		// use SNOMED fallback for laboratory when LOINC is unavailable.
		concept["coding"] = []map[string]any{{
			"system":  "http://snomed.info/sct",
			"code":    "108252007",
			"display": firstNonEmptyText(trimmedDisplay, "Laboratory procedure"),
		}}
	}
	return concept
}

func looksLikeLOINCCode(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}

	parts := strings.Split(trimmed, "-")
	if len(parts) != 2 || len(parts[0]) == 0 || len(parts[1]) != 1 {
		return false
	}

	for _, ch := range parts[0] {
		if ch < '0' || ch > '9' {
			return false
		}
	}

	checkDigit := parts[1][0]
	return checkDigit >= '0' && checkDigit <= '9'
}

func parseLabNumeric(value string) (float64, bool) {
	trimmed := strings.TrimSpace(strings.ReplaceAll(value, ",", "."))
	if trimmed == "" {
		return 0, false
	}
	parsed, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return 0, false
	}
	return parsed, true
}

func coalesceLabResultDateTime(primary, secondary *time.Time, fallback time.Time) time.Time {
	if primary != nil && !primary.IsZero() {
		return *primary
	}
	if secondary != nil && !secondary.IsZero() {
		return *secondary
	}
	return fallback
}

func resolveLabResultDateTime(item models.LaboratoryOrderItem, fallback time.Time) time.Time {
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

func mapLabServiceRequestStatus(item models.LaboratoryOrderItem) string {
	if item.ResultDate != nil || strings.TrimSpace(item.ResultValue) != "" {
		return "completed"
	}
	for _, parameter := range item.ParameterResults {
		if parameter.ResultDate != nil || strings.TrimSpace(parameter.ResultValue) != "" {
			return "completed"
		}
	}
	return "active"
}
