package satusehat

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"
)

type ResourcePreview struct {
	Resource         map[string]any         `json:"resource"`
	RelatedResources []NamedResourcePreview `json:"related_resources,omitempty"`
	Warnings         []string               `json:"warnings,omitempty"`
	Prerequisites    []ResourcePrerequisite `json:"prerequisites,omitempty"`
	Ready            bool                   `json:"ready"`
}

func BuildPatientPreview(patient models.Patient, config Config) ResourcePreview {
	warnings := make([]string, 0, 8)
	identifiers := make([]map[string]any, 0, 1)

	if strings.TrimSpace(patient.NIK) != "" {
		identifiers = append(identifiers, map[string]any{
			"use":    "official",
			"system": "https://fhir.kemkes.go.id/id/nik",
			"value":  patient.NIK,
		})
	} else {
		warnings = append(warnings, "NIK pasien kosong; payload Patient SATUSEHAT sebaiknya memakai identitas nasional yang tervalidasi.")
	}

	resourceExtensions := buildPatientExtensions(patient)
	address, hasAdministrativeCode := buildPatientAddress(patient)
	if hasAddressContent(patient) && !hasAdministrativeCode {
		warnings = append(warnings, "Kode administratif alamat belum lengkap; address pasien tidak ikut dikirim ke SATUSEHAT sampai province/city/district/village bisa dipetakan.")
	}
	if patient.BirthDate == nil {
		warnings = append(warnings, "Tanggal lahir pasien belum terisi.")
	}
	if !hasBirthPlaceExtension(resourceExtensions) {
		warnings = append(warnings, "Tempat lahir pasien belum terisi; extension birthPlace SATUSEHAT belum bisa dibentuk.")
	}

	resource := map[string]any{
		"resourceType":         "Patient",
		"active":               patient.IsActive,
		"identifier":           identifiers,
		"name":                 []map[string]any{buildPatientName(patient.FullName)},
		"gender":               mapPatientGender(patient.Gender),
		"multipleBirthBoolean": false,
		"deceasedBoolean":      false,
		"communication": []map[string]any{{
			"language": map[string]any{
				"coding": []map[string]any{{
					"system":  "urn:ietf:bcp:47",
					"code":    "id-ID",
					"display": "Indonesian",
				}},
			},
			"preferred": true,
		}},
	}
	if len(resourceExtensions) > 0 {
		resource["extension"] = resourceExtensions
	}

	if strings.TrimSpace(patient.SatusehatPatientID) != "" {
		normalizedPatientID := NormalizeFHIRResourceUUID(patient.SatusehatPatientID)
		if normalizedPatientID != "" {
			resource["id"] = normalizedPatientID
		} else {
			warnings = append(warnings, "SATUSEHAT Patient ID lokal tidak valid UUID; field id tidak dipakai pada payload Patient.")
		}
	}

	if patient.BirthDate != nil {
		resource["birthDate"] = patient.BirthDate.Format("2006-01-02")
	}

	telecom := make([]map[string]any, 0, 2)
	if strings.TrimSpace(patient.Phone) != "" {
		telecom = append(telecom, map[string]any{"system": "phone", "value": patient.Phone, "use": "mobile"})
	}
	if strings.TrimSpace(patient.Email) != "" {
		telecom = append(telecom, map[string]any{"system": "email", "value": patient.Email, "use": "home"})
	}
	if len(telecom) > 0 {
		resource["telecom"] = telecom
	}
	if maritalStatus := buildPatientMaritalStatus(patient.MaritalStatus); maritalStatus != nil {
		resource["maritalStatus"] = maritalStatus
	}
	if contact := buildPatientEmergencyContact(patient); len(contact) > 0 {
		resource["contact"] = contact
	}
	if strings.TrimSpace(config.OrganizationID) != "" {
		resource["managingOrganization"] = map[string]any{
			"reference": fmt.Sprintf("Organization/%s", strings.TrimSpace(config.OrganizationID)),
		}
	}

	if len(address) > 0 {
		resource["address"] = []map[string]any{address}
	}

	ready := strings.TrimSpace(patient.FullName) != "" && len(identifiers) > 0 && patient.BirthDate != nil && hasBirthPlaceExtension(resourceExtensions)
	return ResourcePreview{Resource: resource, Warnings: warnings, Ready: ready}
}

func BuildPractitionerPreview(doctor models.Doctor, config Config) ResourcePreview {
	warnings := make([]string, 0, 4)
	practitionerActor := ResolveDoctorPractitionerActor(doctor)
	normalizedNIK := NormalizeIndonesianNIK(doctor.NIKNumber)
	searchQuery := ""
	if normalizedNIK != "" {
		searchQuery = fmt.Sprintf("%s|%s", practitionerNIKIdentifierSystem, normalizedNIK)
	}

	if strings.TrimSpace(doctor.FullName) == "" {
		warnings = append(warnings, "Nama dokter kosong; data master dokter perlu dilengkapi lebih dulu.")
	}
	if normalizedNIK == "" {
		warnings = append(warnings, "NIK dokter belum diisi; SATUSEHAT Practitioner sekarang dicari melalui Master Nakes Index menggunakan NIK.")
	} else if !LooksLikeIndonesianNIK(normalizedNIK) {
		warnings = append(warnings, "NIK dokter belum valid; gunakan 16 digit angka agar pencarian Practitioner SATUSEHAT berhasil.")
	}
	if strings.TrimSpace(doctor.Specialization) == "" {
		warnings = append(warnings, "Spesialisasi dokter kosong; sinkron tetap bisa jalan, tetapi profil lokal dokter sebaiknya dilengkapi.")
	}

	resource := map[string]any{
		"resourceType":     "PractitionerLookup",
		"lookupStrategy":   "nik",
		"active":           doctor.IsActive,
		"fullName":         doctor.FullName,
		"identifierSystem": practitionerNIKIdentifierSystem,
		"identifierValue":  normalizedNIK,
		"searchQuery":      searchQuery,
		"specialization":   doctor.Specialization,
		"phone":            doctor.Phone,
		"organizationID":   strings.TrimSpace(config.OrganizationID),
	}

	if practitionerActor.Ready() {
		resource["storedPractitionerID"] = strings.TrimSpace(practitionerActor.ResourceID)
		resource["storedPractitionerSource"] = practitionerActor.Source
	}
	if doctor.EmployeeID != nil && *doctor.EmployeeID != 0 {
		resource["employeeID"] = *doctor.EmployeeID
		resource["employeeCode"] = strings.TrimSpace(doctor.Employee.EmployeeCode)
	}

	ready := strings.TrimSpace(doctor.FullName) != "" && LooksLikeIndonesianNIK(normalizedNIK)
	return ResourcePreview{Resource: resource, Warnings: warnings, Ready: ready}
}

func BuildEmployeePractitionerPreview(employee models.Employee, config Config) ResourcePreview {
	warnings := make([]string, 0, 4)
	normalizedNIK := NormalizeIndonesianNIK(employee.NIKNumber)
	searchQuery := ""
	if normalizedNIK != "" {
		searchQuery = fmt.Sprintf("%s|%s", practitionerNIKIdentifierSystem, normalizedNIK)
	}

	if strings.TrimSpace(employee.FullName) == "" {
		warnings = append(warnings, "Nama pegawai kosong; data master pegawai perlu dilengkapi lebih dulu.")
	}
	if normalizedNIK == "" {
		warnings = append(warnings, "NIK pegawai belum diisi; SATUSEHAT Practitioner dicari melalui Master Nakes Index menggunakan NIK.")
	} else if !LooksLikeIndonesianNIK(normalizedNIK) {
		warnings = append(warnings, "NIK pegawai belum valid; gunakan 16 digit angka agar pencarian Practitioner SATUSEHAT berhasil.")
	}
	if strings.TrimSpace(employee.Profession) == "" {
		warnings = append(warnings, "Profesi pegawai kosong; lengkapi profesi agar konteks actor SATUSEHAT lebih jelas.")
	}

	resource := map[string]any{
		"resourceType":     "PractitionerLookup",
		"lookupStrategy":   "nik",
		"active":           employee.IsActive,
		"fullName":         employee.FullName,
		"identifierSystem": practitionerNIKIdentifierSystem,
		"identifierValue":  normalizedNIK,
		"searchQuery":      searchQuery,
		"profession":       employee.Profession,
		"phone":            employee.Phone,
		"organizationID":   strings.TrimSpace(config.OrganizationID),
	}

	if strings.TrimSpace(employee.EmployeeCode) != "" {
		resource["employeeCode"] = strings.TrimSpace(employee.EmployeeCode)
	}
	if strings.TrimSpace(employee.SatusehatPractitionerID) != "" {
		resource["storedPractitionerID"] = strings.TrimSpace(employee.SatusehatPractitionerID)
		resource["storedPractitionerSource"] = "employee"
	}

	ready := strings.TrimSpace(employee.FullName) != "" && LooksLikeIndonesianNIK(normalizedNIK)
	return ResourcePreview{Resource: resource, Warnings: warnings, Ready: ready}
}

func BuildEncounterPreview(visit models.Visit, config Config) ResourcePreview {
	return buildEncounterPreviewInternal(visit, config, false)
}

// BuildEncounterInitialPreview builds an Encounter payload for the initial POST.
// It uses "in-progress" status so SATUSEHAT does not require diagnosis[] references,
// which only become available after Condition resources are synced.
func BuildEncounterInitialPreview(visit models.Visit, config Config) ResourcePreview {
	return buildEncounterPreviewInternal(visit, config, true)
}

func buildEncounterPreviewInternal(visit models.Visit, config Config, initialPost bool) ResourcePreview {
	warnings := make([]string, 0, 6)
	identifierSystem := buildEncounterIdentifierSystem(config.OrganizationID)

	patientReference := "Patient/{satusehat_patient_id}"
	if strings.TrimSpace(visit.Patient.SatusehatPatientID) != "" {
		patientReference = fmt.Sprintf("Patient/%s", strings.TrimSpace(visit.Patient.SatusehatPatientID))
	} else {
		warnings = append(warnings, "Patient belum memiliki SATUSEHAT Patient ID; reference subject masih placeholder.")
	}

	practitionerActor := ResolveDoctorPractitionerActor(visit.Doctor)
	practitionerReference := "Practitioner/{satusehat_practitioner_id}"
	practitionerDisplay := visit.Doctor.FullName
	if practitionerActor.Ready() {
		practitionerReference = practitionerActor.Reference()
		practitionerDisplay = practitionerActor.Display
	} else {
		warnings = append(warnings, "Pegawai/dokter pemeriksa belum memiliki SATUSEHAT Practitioner ID; participant masih placeholder.")
	}

	serviceProviderReference := "Organization/{organization_id}"
	if strings.TrimSpace(config.OrganizationID) != "" {
		serviceProviderReference = fmt.Sprintf("Organization/%s", strings.TrimSpace(config.OrganizationID))
	} else {
		warnings = append(warnings, "Organization ID SATUSEHAT belum diisi; serviceProvider masih placeholder.")
	}

	locationReference := "Location/{satusehat_location_id}"
	locationDisplay := buildPolyclinicLocationName(visit.Polyclinic)
	if strings.TrimSpace(visit.Polyclinic.SatusehatLocationID) != "" {
		locationReference = fmt.Sprintf("Location/%s", strings.TrimSpace(visit.Polyclinic.SatusehatLocationID))
	} else {
		warnings = append(warnings, "Poli belum memiliki SATUSEHAT Location ID; encounter.location masih placeholder.")
	}

	// For initial POST without existing Encounter ID, use "in-progress" status
	// so SATUSEHAT does not enforce the diagnosis requirement (Rule 10457).
	// The final status will be set via PUT after Conditions are synced.
	encounterStatus := mapEncounterStatus(visit.Status)
	isInitialCreate := initialPost && strings.TrimSpace(visit.SatusehatEncounterID) == ""
	if isInitialCreate && encounterStatus == "finished" {
		encounterStatus = "in-progress"
	}

	resource := map[string]any{
		"resourceType": "Encounter",
		"identifier": []map[string]any{{
			"use":    "official",
			"system": identifierSystem,
			"value":  visit.VisitNumber,
		}},
		"status":        encounterStatus,
		"statusHistory": buildEncounterStatusHistory(visit),
		"class": map[string]any{
			"system":  "http://terminology.hl7.org/CodeSystem/v3-ActCode",
			"code":    "AMB",
			"display": "ambulatory",
		},
		"classHistory": []map[string]any{buildEncounterClassHistory(visit)},
		"serviceType": map[string]any{
			"text": strings.TrimSpace(visit.Polyclinic.Name),
		},
		"subject": map[string]any{
			"reference": patientReference,
			"display":   visit.Patient.FullName,
		},
		"participant": []map[string]any{{
			"type": []map[string]any{{
				"coding": []map[string]any{{
					"system":  "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
					"code":    "ATND",
					"display": "attender",
				}},
			}},
			"individual": map[string]any{
				"reference": practitionerReference,
				"display":   practitionerDisplay,
			},
		}},
		"period": map[string]any{
			"start": formatFHIRDateTime(visit.VisitDate),
		},
		"location": []map[string]any{{
			"location": map[string]any{
				"reference": locationReference,
				"display":   locationDisplay,
			},
			"period": map[string]any{
				"start": formatFHIRDateTime(visit.VisitDate),
			},
		}},
		"serviceProvider": map[string]any{
			"reference": serviceProviderReference,
		},
	}

	if encounterPeriodEnd := buildEncounterCurrentPeriodEnd(visit); encounterPeriodEnd != "" {
		period := resource["period"].(map[string]any)
		period["end"] = encounterPeriodEnd

		locations := resource["location"].([]map[string]any)
		if len(locations) > 0 {
			locationPeriod := locations[0]["period"].(map[string]any)
			locationPeriod["end"] = encounterPeriodEnd
		}
	}

	if strings.TrimSpace(visit.Polyclinic.Name) == "" {
		warnings = append(warnings, "Nama poliklinik kosong; serviceType saat ini masih berbasis teks.")
	}
	if strings.TrimSpace(locationDisplay) == "" {
		warnings = append(warnings, "Nama lokasi poli tidak bisa dibentuk karena nama poli kosong.")
	}
	if strings.TrimSpace(visit.Complaint) != "" {
		resource["reasonCode"] = []map[string]any{{"text": visit.Complaint}}
	}
	if strings.TrimSpace(visit.SatusehatEncounterID) != "" {
		resource["id"] = strings.TrimSpace(visit.SatusehatEncounterID)
	}

	// For initial POST, skip diagnosis attachment (Conditions not synced yet)
	if !isInitialCreate {
		if diagnosisEntries := BuildEncounterDiagnosisEntries(visit.ID); len(diagnosisEntries) > 0 {
			resource["diagnosis"] = diagnosisEntries
		} else if mapEncounterStatus(visit.Status) == "finished" {
			warnings = append(warnings, "Encounter berstatus finished tetapi belum ada diagnosis dengan SATUSEHAT Condition ID; field diagnosis kosong.")
		}
	}

	ready := len(warnings) == 0
	return ResourcePreview{Resource: resource, Warnings: warnings, Ready: ready}
}

// BuildEncounterDiagnosisEntries queries synced diagnoses for a visit and returns
// the FHIR Encounter.diagnosis array with Condition references and diagnosis-role coding.
func BuildEncounterDiagnosisEntries(visitID uint) []map[string]any {
	var diagnoses []models.MedicalRecordDiagnosis
	database.DB.
		Joins("JOIN medical_records ON medical_records.id = medical_record_diagnoses.medical_record_id").
		Preload("ICD10").
		Where("medical_records.visit_id = ? AND medical_records.deleted_at IS NULL AND medical_record_diagnoses.deleted_at IS NULL AND COALESCE(medical_record_diagnoses.satusehat_condition_id, '') <> ''", visitID).
		Order("medical_record_diagnoses.diagnosis_type ASC, medical_record_diagnoses.id ASC").
		Find(&diagnoses)

	if len(diagnoses) == 0 {
		return nil
	}

	entries := make([]map[string]any, 0, len(diagnoses))
	rank := 1
	for _, d := range diagnoses {
		conditionID := strings.TrimSpace(d.SatusehatConditionID)
		if conditionID == "" {
			continue
		}

		entry := map[string]any{
			"condition": map[string]any{
				"reference": fmt.Sprintf("Condition/%s", conditionID),
				"display":   strings.TrimSpace(d.ICD10.Name),
			},
			"use": map[string]any{
				"coding": []map[string]any{{
					"system":  "http://terminology.hl7.org/CodeSystem/diagnosis-role",
					"code":    "DD",
					"display": "Discharge diagnosis",
				}},
			},
			"rank": rank,
		}
		entries = append(entries, entry)
		rank++
	}

	return entries
}

func buildLocalIdentifierSystem(scope, organizationID string) string {
	trimmedOrganizationID := strings.TrimSpace(organizationID)
	if trimmedOrganizationID == "" {
		return fmt.Sprintf("https://simklinik.local/id/%s", scope)
	}
	return fmt.Sprintf("https://simklinik.local/id/%s/%s", scope, trimmedOrganizationID)
}

func buildEncounterIdentifierSystem(organizationID string) string {
	trimmedOrganizationID := strings.TrimSpace(organizationID)
	if trimmedOrganizationID == "" {
		return buildLocalIdentifierSystem("encounter", organizationID)
	}
	return fmt.Sprintf("http://sys-ids.kemkes.go.id/encounter/%s", trimmedOrganizationID)
}

func buildServiceRequestIdentifierSystem(organizationID string) string {
	trimmedOrganizationID := strings.TrimSpace(organizationID)
	if trimmedOrganizationID == "" {
		return buildLocalIdentifierSystem("service-request", organizationID)
	}
	return fmt.Sprintf("http://sys-ids.kemkes.go.id/servicerequest/%s", trimmedOrganizationID)
}

func buildObservationIdentifierSystem(organizationID string) string {
	trimmedOrganizationID := strings.TrimSpace(organizationID)
	if trimmedOrganizationID == "" {
		return buildLocalIdentifierSystem("observation", organizationID)
	}
	return fmt.Sprintf("http://sys-ids.kemkes.go.id/observation/%s", trimmedOrganizationID)
}

func buildCarePlanIdentifierSystem(organizationID string) string {
	trimmedOrganizationID := strings.TrimSpace(organizationID)
	if trimmedOrganizationID == "" {
		return buildLocalIdentifierSystem("care-plan", organizationID)
	}
	return fmt.Sprintf("http://sys-ids.kemkes.go.id/careplan/%s", trimmedOrganizationID)
}

func mapPatientGender(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "L":
		return "male"
	case "P":
		return "female"
	default:
		return "unknown"
	}
}

func mapEncounterStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "completed":
		return "finished"
	case "in_progress":
		return "in-progress"
	case "cancelled":
		return "cancelled"
	default:
		return "arrived"
	}
}

func buildEncounterStatusHistory(visit models.Visit) []map[string]any {
	start := normalizeEncounterHistoryTime(visit.VisitDate, visit.VisitDate)
	current := normalizeEncounterHistoryTime(visit.UpdatedAt, start)
	transition := start
	if current.After(start) {
		transition = start.Add(time.Minute)
		if transition.After(current) {
			transition = current
		}
	}

	appendHistory := func(status string, periodStart, periodEnd time.Time) map[string]any {
		return map[string]any{
			"status": status,
			"period": map[string]any{
				"start": formatFHIRDateTime(periodStart),
				"end":   formatFHIRDateTime(periodEnd),
			},
		}
	}

	currentStatus := mapEncounterStatus(visit.Status)
	history := []map[string]any{appendHistory("arrived", start, transition)}

	switch currentStatus {
	case "finished":
		history = append(history,
			appendHistory("in-progress", transition, current),
			appendHistory("finished", current, current),
		)
	case "cancelled":
		history = append(history,
			appendHistory("in-progress", transition, current),
			appendHistory("cancelled", current, current),
		)
	case "in-progress":
		history = append(history, appendHistory("in-progress", transition, current))
	}

	return history
}

func buildEncounterClassHistory(visit models.Visit) map[string]any {
	start := normalizeEncounterHistoryTime(visit.VisitDate, visit.VisitDate)
	period := map[string]any{
		"start": formatFHIRDateTime(start),
	}
	if end := buildEncounterCurrentPeriodEnd(visit); end != "" {
		period["end"] = end
	}

	return map[string]any{
		"class": map[string]any{
			"system":  "http://terminology.hl7.org/CodeSystem/v3-ActCode",
			"code":    "AMB",
			"display": "ambulatory",
		},
		"period": period,
	}
}

func buildEncounterCurrentPeriodEnd(visit models.Visit) string {
	status := mapEncounterStatus(visit.Status)
	if status != "finished" && status != "cancelled" {
		return ""
	}
	end := normalizeEncounterHistoryTime(visit.UpdatedAt, visit.VisitDate)
	return formatFHIRDateTime(end)
}

func normalizeEncounterHistoryTime(value time.Time, fallback time.Time) time.Time {
	if value.IsZero() {
		return fallback
	}
	if value.Before(fallback) {
		return fallback
	}
	return value
}

func buildPatientName(fullName string) map[string]any {
	trimmedFullName := strings.TrimSpace(fullName)
	name := map[string]any{
		"use":  "official",
		"text": trimmedFullName,
	}
	parts := strings.Fields(trimmedFullName)
	if len(parts) == 0 {
		return name
	}
	if len(parts) == 1 {
		name["given"] = []string{parts[0]}
		return name
	}
	name["family"] = parts[len(parts)-1]
	name["given"] = parts[:len(parts)-1]
	return name
}

func buildPatientExtensions(patient models.Patient) []map[string]any {
	result := make([]map[string]any, 0, 2)
	if birthPlace := strings.TrimSpace(patient.BirthPlace); birthPlace != "" {
		result = append(result, map[string]any{
			"url": "https://fhir.kemkes.go.id/r4/StructureDefinition/birthPlace",
			"valueAddress": map[string]any{
				"city":    birthPlace,
				"country": "ID",
			},
		})
	}
	if citizenshipStatus := derivePatientCitizenshipStatus(patient); citizenshipStatus != "" {
		result = append(result, map[string]any{
			"url":       "https://fhir.kemkes.go.id/r4/StructureDefinition/citizenshipStatus",
			"valueCode": citizenshipStatus,
		})
	}
	return result
}

func hasBirthPlaceExtension(extensions []map[string]any) bool {
	for _, extension := range extensions {
		if strings.TrimSpace(asString(extension["url"])) == "https://fhir.kemkes.go.id/r4/StructureDefinition/birthPlace" {
			return true
		}
	}
	return false
}

func derivePatientCitizenshipStatus(patient models.Patient) string {
	if strings.TrimSpace(patient.NIK) != "" {
		return "WNI"
	}
	return ""
}

func buildPatientMaritalStatus(value string) map[string]any {
	code, display := mapPatientMaritalStatus(value)
	if code == "" {
		return nil
	}
	return map[string]any{
		"coding": []map[string]any{{
			"system":  "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
			"code":    code,
			"display": display,
		}},
		"text": display,
	}
}

func mapPatientMaritalStatus(value string) (string, string) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "menikah":
		return "M", "Married"
	case "cerai_hidup":
		return "D", "Divorced"
	case "cerai_mati":
		return "W", "Widowed"
	case "belum_menikah":
		return "U", "Unmarried"
	default:
		return "", ""
	}
}

func buildPatientEmergencyContact(patient models.Patient) []map[string]any {
	name := strings.TrimSpace(patient.EmergencyContactName)
	phone := strings.TrimSpace(patient.EmergencyContactPhone)
	relationText := strings.TrimSpace(patient.EmergencyContactRelation)
	if name == "" && phone == "" {
		return nil
	}

	contact := map[string]any{}
	if name != "" {
		contact["name"] = map[string]any{
			"use":  "official",
			"text": name,
		}
	}
	if phone != "" {
		contact["telecom"] = []map[string]any{{
			"system": "phone",
			"value":  phone,
			"use":    "mobile",
		}}
	}
	relationshipText := firstNonEmptyText(relationText, "Emergency Contact")
	contact["relationship"] = []map[string]any{{
		"coding": []map[string]any{{
			"system":  "http://terminology.hl7.org/CodeSystem/v2-0131",
			"code":    "C",
			"display": "Emergency Contact",
		}},
		"text": relationshipText,
	}}
	return []map[string]any{contact}
}

func hasAddressContent(patient models.Patient) bool {
	return strings.TrimSpace(patient.Address) != "" ||
		strings.TrimSpace(patient.Province) != "" ||
		strings.TrimSpace(patient.City) != "" ||
		strings.TrimSpace(patient.Kecamatan) != "" ||
		strings.TrimSpace(patient.Kelurahan) != ""
}

func buildPatientAddress(patient models.Patient) (map[string]any, bool) {
	if !hasAddressContent(patient) {
		return nil, false
	}

	administrativeExtension := buildPatientAdministrativeCodeExtension(patient)
	if len(administrativeExtension) == 0 {
		return nil, false
	}

	address := map[string]any{
		"use":       "home",
		"country":   "ID",
		"extension": []map[string]any{administrativeExtension},
	}
	if addressLine := strings.TrimSpace(patient.Address); addressLine != "" {
		address["line"] = []string{addressLine}
	}
	if city := strings.TrimSpace(patient.City); city != "" {
		address["city"] = city
	}
	if province := strings.TrimSpace(patient.Province); province != "" {
		address["state"] = province
	}
	if postalCode := strings.TrimSpace(patient.PostalCode); postalCode != "" {
		address["postalCode"] = postalCode
	}
	return address, true
}

func buildPatientAdministrativeCodeExtension(patient models.Patient) map[string]any {
	codes := resolvePatientAdministrativeCodes(patient)
	parts := make([]map[string]any, 0, 6)
	for _, item := range []struct {
		url   string
		value string
	}{
		{url: "province", value: codes.ProvinceID},
		{url: "city", value: codes.RegencyID},
		{url: "district", value: codes.DistrictID},
		{url: "village", value: codes.VillageID},
		{url: "rt", value: normalizeAdministrativeCodeValue(patient.RT)},
		{url: "rw", value: normalizeAdministrativeCodeValue(patient.RW)},
	} {
		if item.value == "" {
			continue
		}
		parts = append(parts, map[string]any{
			"url":       item.url,
			"valueCode": item.value,
		})
	}
	if len(parts) == 0 {
		return nil
	}
	return map[string]any{
		"url":       "https://fhir.kemkes.go.id/r4/StructureDefinition/administrativeCode",
		"extension": parts,
	}
}

type patientAdministrativeCodes struct {
	ProvinceID string
	RegencyID  string
	DistrictID string
	VillageID  string
}

func resolvePatientAdministrativeCodes(patient models.Patient) patientAdministrativeCodes {
	var result patientAdministrativeCodes
	provinceName := strings.TrimSpace(patient.Province)
	if provinceName == "" || database.DB == nil {
		return result
	}

	var provinces []models.Province
	if err := database.DB.Order("name ASC").Find(&provinces).Error; err != nil {
		return result
	}
	province := findProvinceByName(provinces, provinceName)
	if province == nil {
		return result
	}
	result.ProvinceID = strconv.FormatInt(province.ID, 10)

	cityName := strings.TrimSpace(patient.City)
	if cityName == "" {
		return result
	}
	var regencies []models.Regency
	if err := database.DB.Where("province_id = ?", province.ID).Order("name ASC").Find(&regencies).Error; err != nil {
		return result
	}
	regency := findRegencyByName(regencies, cityName)
	if regency == nil {
		return result
	}
	result.RegencyID = strconv.FormatInt(regency.ID, 10)

	districtName := strings.TrimSpace(patient.Kecamatan)
	if districtName == "" {
		return result
	}
	var districts []models.District
	if err := database.DB.Where("regency_id = ?", regency.ID).Order("name ASC").Find(&districts).Error; err != nil {
		return result
	}
	district := findDistrictByName(districts, districtName)
	if district == nil {
		return result
	}
	result.DistrictID = strconv.FormatInt(district.ID, 10)

	villageName := strings.TrimSpace(patient.Kelurahan)
	if villageName == "" {
		return result
	}
	var villages []models.Village
	if err := database.DB.Where("district_id = ?", district.ID).Order("name ASC").Find(&villages).Error; err != nil {
		return result
	}
	village := findVillageByName(villages, villageName)
	if village == nil {
		return result
	}
	result.VillageID = strconv.FormatInt(village.ID, 10)
	return result
}

func findProvinceByName(items []models.Province, name string) *models.Province {
	target := normalizeRegionName(name)
	for index := range items {
		if normalizeRegionName(items[index].Name) == target {
			return &items[index]
		}
	}
	return nil
}

func findRegencyByName(items []models.Regency, name string) *models.Regency {
	target := normalizeRegionName(name)
	for index := range items {
		if normalizeRegionName(items[index].Name) == target {
			return &items[index]
		}
	}
	return nil
}

func findDistrictByName(items []models.District, name string) *models.District {
	target := normalizeRegionName(name)
	for index := range items {
		if normalizeRegionName(items[index].Name) == target {
			return &items[index]
		}
	}
	return nil
}

func findVillageByName(items []models.Village, name string) *models.Village {
	target := normalizeRegionName(name)
	for index := range items {
		if normalizeRegionName(items[index].Name) == target {
			return &items[index]
		}
	}
	return nil
}

func normalizeRegionName(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	trimmed = strings.TrimPrefix(trimmed, "kabupaten ")
	trimmed = strings.TrimPrefix(trimmed, "kab. ")
	trimmed = strings.TrimPrefix(trimmed, "kota ")
	trimmed = strings.ReplaceAll(trimmed, ".", "")
	trimmed = strings.ReplaceAll(trimmed, "'", "")
	return strings.Join(strings.Fields(trimmed), " ")
}

func normalizeAdministrativeCodeValue(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.TrimLeft(trimmed, "0")
	if trimmed == "" {
		return "0"
	}
	return trimmed
}

func formatFHIRDateTime(value time.Time) string {
	return value.Format(time.RFC3339)
}
