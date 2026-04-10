package satusehat

import (
	"fmt"
	"strings"

	"starter/backend/models"
)

func BuildProcedurePreview(action models.MedicalAction, config Config) ResourcePreview {
	record := action.MedicalRecord
	warnings := make([]string, 0, 6)
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	encounterReference := strings.TrimSpace(record.Visit.SatusehatEncounterID)
	practitionerReference := strings.TrimSpace(record.Doctor.SatusehatPractitionerID)
	procedureName := firstNonEmptyText(action.ServiceNameSnapshot, action.MedicalService.Name)
	procedureCode := firstNonEmptyText(action.ServiceCodeSnapshot, action.MedicalService.Code)

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if encounterReference == "" {
		warnings = append(warnings, "Encounter belum memiliki SATUSEHAT Encounter ID.")
	}
	if strings.TrimSpace(procedureName) == "" {
		warnings = append(warnings, "Nama tindakan medis kosong.")
	}

	resource := map[string]any{
		"resourceType": "Procedure",
		"status":       mapProcedureStatus(record.Status),
		"category": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://terminology.kemkes.go.id",
				"code":    "TK000028",
				"display": "Diagnostic procedure",
			}},
			"text": firstNonEmptyText(action.ServiceDomainSnapshot, "tindakan medis"),
		},
		"code": buildProcedureCodeableConcept(procedureCode, procedureName),
		"subject": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		},
		"encounter": map[string]any{
			"reference": fmt.Sprintf("Encounter/%s", encounterReference),
			"display":   record.Visit.VisitNumber,
		},
		"performedDateTime": formatFHIRDateTime(record.RecordDate),
	}

	if existingID := strings.TrimSpace(action.SatusehatProcedureID); existingID != "" {
		resource["id"] = existingID
	}
	if practitionerReference != "" {
		resource["performer"] = []map[string]any{{
			"actor": map[string]any{
				"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
				"display":   record.Doctor.FullName,
			},
		}}
	} else {
		warnings = append(warnings, "Doctor belum memiliki SATUSEHAT Practitioner ID; performer akan diabaikan sementara.")
	}
	if action.Quantity > 1 {
		resource["note"] = []map[string]any{{
			"text": fmt.Sprintf("Dilakukan sebanyak %d kali.", action.Quantity),
		}}
	}
	if notes := strings.TrimSpace(action.Notes); notes != "" {
		noteList, _ := resource["note"].([]map[string]any)
		noteList = append(noteList, map[string]any{"text": notes})
		resource["note"] = noteList
	}

	ready := patientReference != "" && encounterReference != "" && strings.TrimSpace(procedureName) != ""
	return ResourcePreview{
		Resource:      resource,
		Warnings:      warnings,
		Prerequisites: BuildProcedurePrerequisites(action, config),
		Ready:         ready,
	}
}

func BuildCarePlanPreview(record models.MedicalRecord, config Config) ResourcePreview {
	warnings := make([]string, 0, 6)
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	encounterReference := strings.TrimSpace(record.Visit.SatusehatEncounterID)
	practitionerReference := strings.TrimSpace(record.Doctor.SatusehatPractitionerID)
	organizationReference := strings.TrimSpace(config.OrganizationID)
	planSummary := firstNonEmptyText(record.Plan, record.FollowUpInstruction)

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if encounterReference == "" {
		warnings = append(warnings, "Encounter belum memiliki SATUSEHAT Encounter ID.")
	}
	if strings.TrimSpace(planSummary) == "" {
		warnings = append(warnings, "Rencana tatalaksana atau instruksi tindak lanjut masih kosong.")
	}

	resource := map[string]any{
		"resourceType": "CarePlan",
		"status":       mapCarePlanStatus(record.Status),
		"intent":       "plan",
		"category": []map[string]any{{
			"coding": []map[string]any{{
				"system":  "http://snomed.info/sct",
				"code":    "736271009",
				"display": "Outpatient care plan",
			}},
		}},
		"title":       firstNonEmptyText(record.Plan, "Rencana rawat jalan"),
		"description": strings.TrimSpace(planSummary),
		"subject": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		},
		"encounter": map[string]any{
			"reference": fmt.Sprintf("Encounter/%s", encounterReference),
			"display":   record.Visit.VisitNumber,
		},
		"created": formatFHIRDateTime(record.RecordDate),
		"period": map[string]any{
			"start": formatFHIRDateTime(record.RecordDate),
		},
	}

	if existingID := strings.TrimSpace(record.SatusehatCarePlanID); existingID != "" {
		resource["id"] = existingID
	}
	if record.FollowUpAt != nil && !record.FollowUpAt.IsZero() {
		period := resource["period"].(map[string]any)
		period["end"] = formatFHIRDateTime(*record.FollowUpAt)
	}
	authorReady := false
	if practitionerReference != "" {
		resource["author"] = map[string]any{
			"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
			"display":   record.Doctor.FullName,
		}
		authorReady = true
	} else if organizationReference != "" {
		resource["author"] = map[string]any{
			"reference": fmt.Sprintf("Organization/%s", organizationReference),
			"display":   "Fasilitas pelayanan",
		}
		authorReady = true
		warnings = append(warnings, "Doctor belum memiliki SATUSEHAT Practitioner ID; author CarePlan memakai Organization sebagai fallback.")
	} else if patientReference != "" {
		resource["author"] = map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		}
		authorReady = true
		warnings = append(warnings, "Doctor dan Organization belum memiliki SATUSEHAT ID; author CarePlan memakai Patient sebagai fallback.")
	} else {
		warnings = append(warnings, "Doctor belum memiliki SATUSEHAT Practitioner ID dan Organization SATUSEHAT belum tersedia; author CarePlan wajib dilengkapi.")
	}

	activity := make([]map[string]any, 0, 2)
	if strings.TrimSpace(record.Plan) != "" {
		activity = append(activity, map[string]any{
			"detail": map[string]any{
				"status":      "scheduled",
				"description": strings.TrimSpace(record.Plan),
			},
		})
	}
	if strings.TrimSpace(record.FollowUpInstruction) != "" {
		activity = append(activity, map[string]any{
			"detail": map[string]any{
				"status":      "scheduled",
				"description": strings.TrimSpace(record.FollowUpInstruction),
			},
		})
	}
	if len(activity) > 0 {
		resource["activity"] = activity
	}

	addresses := make([]map[string]any, 0, len(record.Diagnoses))
	for _, diagnosis := range record.Diagnoses {
		conditionID := strings.TrimSpace(diagnosis.SatusehatConditionID)
		if conditionID == "" {
			continue
		}
		addresses = append(addresses, map[string]any{
			"reference": fmt.Sprintf("Condition/%s", conditionID),
		})
	}
	if len(addresses) > 0 {
		resource["addresses"] = addresses
	}

	ready := patientReference != "" && encounterReference != "" && strings.TrimSpace(planSummary) != "" && authorReady
	return ResourcePreview{
		Resource:      resource,
		Warnings:      warnings,
		Prerequisites: BuildCarePlanPrerequisites(record, config),
		Ready:         ready,
	}
}

func BuildGoalPreview(record models.MedicalRecord, config Config) ResourcePreview {
	warnings := make([]string, 0, 6)
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	practitionerReference := strings.TrimSpace(record.Doctor.SatusehatPractitionerID)
	goalSummary := strings.TrimSpace(firstNonEmptyText(record.Plan, record.FollowUpInstruction, record.Assessment))

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if goalSummary == "" {
		warnings = append(warnings, "Rencana tatalaksana atau instruksi tindak lanjut masih kosong.")
	}

	// Find first diagnosis with a synced Condition ID for Goal.addresses
	conditionReference := ""
	for _, diag := range record.Diagnoses {
		if ref := strings.TrimSpace(diag.SatusehatConditionID); ref != "" {
			conditionReference = ref
			break
		}
	}
	if conditionReference == "" {
		warnings = append(warnings, "Belum ada diagnosis yang memiliki SATUSEHAT Condition ID untuk Goal.addresses; sinkronkan Condition terlebih dahulu.")
	}

	resource := map[string]any{
		"resourceType":    "Goal",
		"lifecycleStatus": mapGoalLifecycleStatus(record.Status),
		"category": []map[string]any{{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/CodeSystem/goal-category",
				"code":    "nursing",
				"display": "Nursing",
			}},
		}},
		"description": map[string]any{
			"text": goalSummary,
		},
		"subject": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		},
		"statusDate": record.RecordDate.Format("2006-01-02"),
	}

	if existingID := strings.TrimSpace(record.SatusehatGoalID); existingID != "" {
		resource["id"] = existingID
	}
	if conditionReference != "" {
		resource["addresses"] = []map[string]any{{
			"reference": fmt.Sprintf("Condition/%s", conditionReference),
		}}
	}
	if practitionerReference != "" {
		resource["expressedBy"] = map[string]any{
			"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
		}
	} else {
		warnings = append(warnings, "Doctor belum memiliki SATUSEHAT Practitioner ID; expressedBy Goal akan diabaikan.")
	}

	targets := make([]map[string]any, 0, 1)
	if record.FollowUpAt != nil && !record.FollowUpAt.IsZero() {
		targets = append(targets, map[string]any{
			"measure": map[string]any{
				"text": "Kontrol ulang",
			},
			"dueDate": record.FollowUpAt.Format("2006-01-02"),
		})
	}
	if len(targets) > 0 {
		resource["target"] = targets
	}

	notes := make([]map[string]any, 0, 2)
	if value := strings.TrimSpace(record.FollowUpInstruction); value != "" {
		notes = append(notes, map[string]any{"text": "Instruksi kontrol: " + value})
	}
	if value := strings.TrimSpace(record.Notes); value != "" {
		notes = append(notes, map[string]any{"text": value})
	}
	if len(notes) > 0 {
		resource["note"] = notes
	}

	ready := patientReference != "" && goalSummary != "" && conditionReference != ""
	return ResourcePreview{
		Resource:      resource,
		Warnings:      warnings,
		Prerequisites: BuildGoalPrerequisites(record, config),
		Ready:         ready,
	}
}

func BuildAllergyIntolerancePreview(record models.MedicalRecord, config Config) ResourcePreview {
	warnings := make([]string, 0, 6)
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	encounterReference := strings.TrimSpace(record.Visit.SatusehatEncounterID)
	practitionerReference := strings.TrimSpace(record.Doctor.SatusehatPractitionerID)
	allergySummary := firstNonEmptyText(record.AllergyNotes, record.Patient.Allergies, record.ClinicalAlert)

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if strings.TrimSpace(allergySummary) == "" {
		warnings = append(warnings, "Data alergi pada rekam medis/pasien masih kosong.")
	}

	resource := map[string]any{
		"resourceType": "AllergyIntolerance",
		"clinicalStatus": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
				"code":    "active",
				"display": "Active",
			}},
		},
		"verificationStatus": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
				"code":    "unconfirmed",
				"display": "Unconfirmed",
			}},
		},
		"type":        "allergy",
		"criticality": "low",
		"category":    []string{"medication"},
		"code": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://snomed.info/sct",
				"code":    "419199007",
				"display": "Allergy to substance",
			}},
			"text": strings.TrimSpace(allergySummary),
		},
		"patient": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		},
		"recordedDate": formatFHIRDateTime(record.RecordDate),
	}

	if existingID := strings.TrimSpace(record.SatusehatAllergyIntoleranceID); existingID != "" {
		resource["id"] = existingID
	}
	if encounterReference != "" {
		resource["encounter"] = map[string]any{
			"reference": fmt.Sprintf("Encounter/%s", encounterReference),
			"display":   record.Visit.VisitNumber,
		}
	}
	if practitionerReference != "" {
		resource["recorder"] = map[string]any{
			"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
			"display":   record.Doctor.FullName,
		}
	}

	notes := make([]map[string]any, 0, 3)
	if value := strings.TrimSpace(record.Patient.Allergies); value != "" {
		notes = append(notes, map[string]any{"text": "Alergi pasien: " + value})
	}
	if value := strings.TrimSpace(record.AllergyNotes); value != "" {
		notes = append(notes, map[string]any{"text": "Catatan alergi rekam medis: " + value})
	}
	if value := strings.TrimSpace(record.ClinicalAlert); value != "" {
		notes = append(notes, map[string]any{"text": "Clinical alert: " + value})
	}
	if len(notes) > 0 {
		resource["note"] = notes
	}

	ready := patientReference != "" && strings.TrimSpace(allergySummary) != ""
	return ResourcePreview{
		Resource:      resource,
		Warnings:      warnings,
		Prerequisites: BuildAllergyPrerequisites(record, config),
		Ready:         ready,
	}
}

func BuildCompositionPreview(record models.MedicalRecord, config Config) ResourcePreview {
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

	resource := map[string]any{
		"resourceType": "Composition",
		"status":       mapCompositionStatus(record.Status),
		"identifier": []map[string]any{{
			"system": buildLocalIdentifierSystem("composition", config.OrganizationID),
			"value":  fmt.Sprintf("composition-%d", record.ID),
		}},
		"type": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://loinc.org",
				"code":    "34133-9",
				"display": "Summarization of episode note",
			}},
		},
		"date":  formatFHIRDateTime(record.UpdatedAt),
		"title": firstNonEmptyText("Resume medis rawat jalan", record.Visit.VisitNumber),
		"subject": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		},
		"encounter": map[string]any{
			"reference": fmt.Sprintf("Encounter/%s", encounterReference),
			"display":   record.Visit.VisitNumber,
		},
	}

	if existingID := strings.TrimSpace(record.SatusehatCompositionID); existingID != "" {
		resource["id"] = existingID
	}
	if practitionerReference != "" {
		resource["author"] = []map[string]any{{
			"reference": fmt.Sprintf("Practitioner/%s", practitionerReference),
			"display":   record.Doctor.FullName,
		}}
	} else {
		warnings = append(warnings, "Doctor belum memiliki SATUSEHAT Practitioner ID; author akan diabaikan sementara.")
	}

	sections := make([]map[string]any, 0, 8)
	appendSection := func(title, body string) {
		if strings.TrimSpace(body) == "" {
			return
		}
		sections = append(sections, map[string]any{
			"title": title,
			"text":  buildGeneratedNarrative(body),
		})
	}

	appendSection("Keluhan Utama", record.ChiefComplaint)
	appendSection("Subjektif", firstNonEmptyText(record.Subjective, record.HistoryOfPresentIllness))
	appendSection("Pemeriksaan Fisik", record.PhysicalExamination)
	appendSection("Assessment", firstNonEmptyText(record.Assessment, record.WorkingDiagnosis, record.DifferentialDiagnosis))
	appendSection("Rencana", firstNonEmptyText(record.Plan, record.FollowUpInstruction))

	diagnosisLines := make([]string, 0, len(record.Diagnoses))
	for _, diagnosis := range record.Diagnoses {
		label := firstNonEmptyText(strings.TrimSpace(diagnosis.ICD10.Code), "-")
		name := firstNonEmptyText(strings.TrimSpace(diagnosis.ICD10.Name), diagnosis.WorkingDiagnosis, diagnosis.DifferentialDiagnosis)
		if strings.TrimSpace(name) == "" {
			continue
		}
		diagnosisLines = append(diagnosisLines, fmt.Sprintf("%s - %s", label, name))
	}
	appendSection("Diagnosis", strings.Join(diagnosisLines, "\n"))

	procedureLines := make([]string, 0, len(record.Actions))
	for _, action := range record.Actions {
		serviceName := firstNonEmptyText(action.ServiceNameSnapshot, action.MedicalService.Name)
		if strings.TrimSpace(serviceName) == "" {
			continue
		}
		if action.Quantity > 1 {
			procedureLines = append(procedureLines, fmt.Sprintf("%s x%d", strings.TrimSpace(serviceName), action.Quantity))
			continue
		}
		procedureLines = append(procedureLines, strings.TrimSpace(serviceName))
	}
	appendSection("Tindakan", strings.Join(procedureLines, "\n"))

	if len(sections) == 0 {
		warnings = append(warnings, "Belum ada konten rekam medis yang cukup untuk disusun sebagai Composition.")
	}
	resource["section"] = sections

	ready := patientReference != "" && encounterReference != "" && len(sections) > 0
	return ResourcePreview{
		Resource:      resource,
		Warnings:      warnings,
		Prerequisites: BuildCompositionPrerequisites(record, config),
		Ready:         ready,
	}
}

func BuildFamilyMemberHistoryPreview(record models.MedicalRecord, config Config) ResourcePreview {
	warnings := make([]string, 0, 6)
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	familyHistorySummary := strings.TrimSpace(record.FamilyHistory)

	if patientReference == "" {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID.")
	}
	if familyHistorySummary == "" {
		warnings = append(warnings, "Riwayat keluarga pada rekam medis masih kosong.")
	}

	resource := map[string]any{
		"resourceType": "FamilyMemberHistory",
		"status":       "completed",
		"identifier": []map[string]any{{
			"system": buildLocalIdentifierSystem("family-history", config.OrganizationID),
			"value":  fmt.Sprintf("medical-record-%d-family-history", record.ID),
		}},
		"patient": map[string]any{
			"reference": fmt.Sprintf("Patient/%s", patientReference),
			"display":   record.Patient.FullName,
		},
		"date": formatFHIRDateTime(record.RecordDate),
		"relationship": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/CodeSystem/v3-RoleCode",
				"code":    "FAMMEMB",
				"display": "family member",
			}},
			"text": "Keluarga",
		},
	}

	if existingID := strings.TrimSpace(record.SatusehatFamilyHistoryID); existingID != "" {
		resource["id"] = existingID
	}
	if familyHistorySummary != "" {
		resource["condition"] = []map[string]any{{
			"code": map[string]any{
				"text": familyHistorySummary,
			},
		}}
	}

	notes := make([]map[string]any, 0, 1)
	if value := strings.TrimSpace(record.Notes); value != "" {
		notes = append(notes, map[string]any{"text": value})
	}
	if len(notes) > 0 {
		resource["note"] = notes
	}

	ready := patientReference != "" && familyHistorySummary != ""
	return ResourcePreview{
		Resource:      resource,
		Warnings:      warnings,
		Prerequisites: BuildFamilyHistoryPrerequisites(record, config),
		Ready:         ready,
	}
}

func mapProcedureStatus(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "final") || strings.EqualFold(strings.TrimSpace(value), "completed") {
		return "completed"
	}
	return "in-progress"
}

func buildProcedureCodeableConcept(code, display string) map[string]any {
	trimmedCode := strings.TrimSpace(code)
	trimmedDisplay := strings.TrimSpace(display)
	text := firstNonEmptyText(trimmedDisplay, trimmedCode, "Procedure")

	concept := map[string]any{"text": text}
	if looksLikeSNOMEDCode(trimmedCode) {
		concept["coding"] = []map[string]any{{
			"system":  "http://snomed.info/sct",
			"code":    trimmedCode,
			"display": firstNonEmptyText(trimmedDisplay, text),
		}}
	} else {
		// SATUSEHAT requires Procedure.code with a recognized coding system;
		// use ICD-9-CM when available, otherwise SNOMED generic fallback.
		concept["coding"] = []map[string]any{{
			"system":  "http://snomed.info/sct",
			"code":    "71388002",
			"display": firstNonEmptyText(trimmedDisplay, "Procedure"),
		}}
	}
	return concept
}

func looksLikeSNOMEDCode(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || len(trimmed) < 6 || len(trimmed) > 18 {
		return false
	}
	for _, ch := range trimmed {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func mapCarePlanStatus(value string) string {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	switch trimmed {
	case "final", "completed":
		return "completed"
	case "cancelled":
		return "revoked"
	default:
		return "active"
	}
}

func mapGoalLifecycleStatus(value string) string {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	switch trimmed {
	case "final", "completed":
		return "completed"
	case "cancelled":
		return "cancelled"
	default:
		return "active"
	}
}

func mapCompositionStatus(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "final") {
		return "final"
	}
	return "preliminary"
}

func buildGeneratedNarrative(body string) map[string]any {
	lines := strings.Split(strings.TrimSpace(body), "\n")
	paragraphs := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		paragraphs = append(paragraphs, "<p>"+escapeNarrativeText(trimmed)+"</p>")
	}
	if len(paragraphs) == 0 {
		paragraphs = append(paragraphs, "<p>-</p>")
	}
	return map[string]any{
		"status": "generated",
		"div":    "<div xmlns=\"http://www.w3.org/1999/xhtml\">" + strings.Join(paragraphs, "") + "</div>",
	}
}

func escapeNarrativeText(value string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
	)
	return replacer.Replace(value)
}
