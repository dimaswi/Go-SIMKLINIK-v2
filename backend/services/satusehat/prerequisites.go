package satusehat

import (
	"strings"

	"starter/backend/models"
)

type ResourcePrerequisite struct {
	Key          string `json:"key"`
	Label        string `json:"label"`
	Required     bool   `json:"required"`
	Ready        bool   `json:"ready"`
	CurrentValue string `json:"current_value,omitempty"`
	Detail       string `json:"detail,omitempty"`
	NextStep     string `json:"next_step,omitempty"`
}

func BuildLaboratoryPrerequisites(item models.LaboratoryOrderItem, config Config) []ResourcePrerequisite {
	record := item.MedicalRecord
	requesterActor := ResolveMedicalRecordRequesterActor(record)
	performerActor := ResolveLaboratoryPerformerActor(item)
	resultReady := hasLaboratoryResults(item)
	loincCode := strings.TrimSpace(item.TestCodeSnapshot)
	loincReady := looksLikeLOINCCode(loincCode)
	specimenReady := item.Specimen != nil && strings.TrimSpace(item.Specimen.TypeDisplay) != ""
	specimenValue := ""
	if specimenReady {
		specimenValue = strings.TrimSpace(firstNonEmptyText(item.Specimen.TemplateNameSnapshot, item.Specimen.TypeDisplay, item.Specimen.TypeCode))
	} else if resultReady {
		specimenValue = "Belum ada specimen transaksi pada order laboratorium"
	}

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "Patient SATUSEHAT diperlukan sebagai subject untuk ServiceRequest, Observation, dan DiagnosticReport.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("practitioner", "Practitioner Requester", false, requesterActor.Ready(), requesterActor.ResourceID, "Practitioner dipakai sebagai requester agar order laboratorium lengkap.", "Sinkronkan Practitioner pegawai/dokter pengaju bila requester ingin dikirim lengkap."),
		makePrerequisite("encounter", "Encounter", true, strings.TrimSpace(record.Visit.SatusehatEncounterID) != "", strings.TrimSpace(record.Visit.SatusehatEncounterID), "Encounter aktif diperlukan sebagai referensi order dan hasil laboratorium.", "Sinkronkan Encounter lebih dulu."),
		makePrerequisite("specimen", "Specimen", resultReady, specimenReady, specimenValue, "Collection contoh SATUSEHAT laboratorium memakai resource Specimen yang direferensikan dari Observation dan terhubung ke ServiceRequest.", "Pastikan item laboratorium sudah memiliki specimen transaksi sebelum mengirim hasil laboratorium final."),
		makePrerequisite("performer-practitioner", "Practitioner Performer", false, performerActor.Ready(), performerActor.ResourceID, "Pegawai laboratorium/result user dapat dipakai sebagai performer resource laboratorium sebelum fallback ke Organization.", "Lengkapi SATUSEHAT Practitioner ID pada master pegawai petugas laboratorium bila performer practitioner ingin dipakai."),
		makePrerequisite("organization", "Organization Induk", false, strings.TrimSpace(config.OrganizationID) != "", strings.TrimSpace(config.OrganizationID), "Organization induk saat ini dipakai sebagai performer laboratorium.", "Isi Organization ID SATUSEHAT pada settings jika performer ingin dikirim."),
		makePrerequisite("lab-master", "Master Pemeriksaan Laboratorium", true, strings.TrimSpace(item.TestNameSnapshot) != "", strings.TrimSpace(firstNonEmptyText(item.TestCodeSnapshot, item.TestNameSnapshot)), "Nama dan kode pemeriksaan menjadi code untuk resource laboratorium.", "Pastikan snapshot layanan laboratorium terisi."),
		makePrerequisite("lab-loinc", "Kode LOINC Laboratorium", resultReady, loincReady, loincCode, "DiagnosticReport laboratorium memerlukan kode LOINC valid pada elemen code.coding.", "Lengkapi kode LOINC pada master pemeriksaan laboratorium agar DiagnosticReport bisa dikirim."),
		makePrerequisite("lab-result", "Hasil Laboratorium", false, resultReady, strings.TrimSpace(firstNonEmptyText(item.ResultValue, item.ResultNotes)), "Observation dan DiagnosticReport baru terkirim bila hasil laboratorium sudah tersedia.", "Lengkapi hasil bila ingin mengirim Observation dan DiagnosticReport."),
	}
}

func BuildRadiologyPrerequisites(item models.RadiologyOrderItem, config Config) []ResourcePrerequisite {
	record := item.MedicalRecord
	requesterActor := ResolveMedicalRecordRequesterActor(record)
	performerActor := ResolveRadiologyPerformerActor(item)
	resultReady := hasRadiologyResults(item)
	loincCode := strings.TrimSpace(item.ServiceCodeSnapshot)
	loincReady := looksLikeLOINCCode(loincCode)

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "Patient SATUSEHAT diperlukan sebagai subject untuk ServiceRequest dan DiagnosticReport radiologi.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("practitioner", "Practitioner Requester", false, requesterActor.Ready(), requesterActor.ResourceID, "Practitioner dipakai sebagai requester order radiologi.", "Sinkronkan Practitioner pegawai/dokter pengaju bila requester ingin dikirim lengkap."),
		makePrerequisite("encounter", "Encounter", true, strings.TrimSpace(record.Visit.SatusehatEncounterID) != "", strings.TrimSpace(record.Visit.SatusehatEncounterID), "Encounter diperlukan sebagai konteks order dan hasil radiologi.", "Sinkronkan Encounter lebih dulu."),
		makePrerequisite("performer-practitioner", "Practitioner Performer", false, performerActor.Ready(), performerActor.ResourceID, "Pegawai radiologi/result user dapat dipakai sebagai performer resource radiologi sebelum fallback ke Organization.", "Lengkapi SATUSEHAT Practitioner ID pada master pegawai petugas radiologi bila performer practitioner ingin dipakai."),
		makePrerequisite("organization", "Organization Induk", false, strings.TrimSpace(config.OrganizationID) != "", strings.TrimSpace(config.OrganizationID), "Organization induk saat ini dipakai sebagai performer radiologi.", "Isi Organization ID SATUSEHAT pada settings jika performer ingin dikirim."),
		makePrerequisite("radiology-master", "Master Pemeriksaan Radiologi", true, strings.TrimSpace(item.ServiceNameSnapshot) != "", strings.TrimSpace(firstNonEmptyText(item.ServiceCodeSnapshot, item.ServiceNameSnapshot)), "Nama dan kode layanan radiologi menjadi code untuk resource radiologi.", "Pastikan snapshot layanan radiologi terisi."),
		makePrerequisite("radiology-loinc", "Kode LOINC Radiologi", resultReady, loincReady, loincCode, "DiagnosticReport radiologi memerlukan kode LOINC valid pada elemen code.coding.", "Lengkapi kode LOINC pada master layanan radiologi agar DiagnosticReport bisa dikirim."),
		makePrerequisite("radiology-result", "Hasil Radiologi", false, resultReady, strings.TrimSpace(firstNonEmptyText(item.Impression, item.Findings, item.ResultNotes)), "DiagnosticReport dan Observation radiologi baru lengkap saat hasil atau temuan sudah diisi.", "Lengkapi hasil radiologi bila ingin mengirim report final."),
	}
}

func BuildMedicationRequestPrerequisites(prescription models.Prescription, config Config) []ResourcePrerequisite {
	record := prescription.MedicalRecord
	requesterActor := ResolveMedicalRecordRequesterActor(record)
	medicine := prescription.Medicine
	medicineName := firstNonEmptyText(prescription.Medicine.Name, prescription.Medicine.GenericName)
	kfaCode := strings.TrimSpace(medicine.KFACode)
	medicationMasterValue := strings.TrimSpace(firstNonEmptyText(medicine.SatusehatMedicationID, medicine.KFAName, medicineName))
	medicationMasterReady := medicationMasterValue != "" && looksLikeKFACode(kfaCode)

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "MedicationRequest membutuhkan Patient SATUSEHAT sebagai subject.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("practitioner", "Practitioner Requester", false, requesterActor.Ready(), requesterActor.ResourceID, "Practitioner dipakai sebagai requester resep.", "Sinkronkan Practitioner pegawai/dokter pengaju bila requester ingin dikirim lengkap."),
		makePrerequisite("encounter", "Encounter", true, strings.TrimSpace(record.Visit.SatusehatEncounterID) != "", strings.TrimSpace(record.Visit.SatusehatEncounterID), "Encounter diperlukan sebagai konteks resep pada kunjungan.", "Sinkronkan Encounter lebih dulu."),
		makePrerequisite("medication-master", "Medication Master", true, medicationMasterReady, medicationMasterValue, "MedicationRequest SATUSEHAT merujuk ke resource Medication yang dapat dibentuk dari master obat ber-mapping KFA.", "Lengkapi mapping KFA agar resource Medication bisa dibentuk dan disinkronkan otomatis."),
		makePrerequisite("kfa-code", "Kode KFA Obat", true, looksLikeKFACode(kfaCode), kfaCode, "Collection contoh Medication memakai coding system http://sys-ids.kemkes.go.id/kfa untuk code obat.", "Isi kode KFA pada master obat; kode internal lokal belum cukup."),
		makePrerequisite("medicine-form", "Bentuk Sediaan", false, strings.TrimSpace(medicine.Form) != "", strings.TrimSpace(medicine.Form), "Form obat lazim dipakai pada resource Medication untuk membentuk master farmasi yang konsisten.", "Lengkapi bentuk sediaan pada master obat."),
		makePrerequisite("manufacturer", "Manufacturer", false, strings.TrimSpace(medicine.Manufacturer) != "", strings.TrimSpace(medicine.Manufacturer), "Collection contoh Medication juga menyertakan manufacturer pada resource master obat.", "Lengkapi pabrikan obat atau siapkan mapping Organization manufacturer."),
		makePrerequisite("organization", "Organization Faskes", false, strings.TrimSpace(config.OrganizationID) != "", strings.TrimSpace(config.OrganizationID), "Organization dipakai pada identifier Medication dan performer dispenseRequest di contoh SATUSEHAT.", "Isi Organization ID SATUSEHAT pada settings."),
		makePrerequisite("medicine-quantity", "Jumlah Resep", true, prescription.Quantity > 0, strings.TrimSpace(firstNonEmptyText(kfaCode, medicineName)), "Quantity resep tetap diperlukan untuk membentuk MedicationRequest.", "Pastikan quantity resep terisi."),
	}
}

func BuildMedicationDispensePrerequisites(dispensing models.Dispensing, config Config) []ResourcePrerequisite {
	record := dispensing.MedicalRecord
	performerActor := ResolveDispensingPerformerActor(dispensing)
	medicine := resolveDispensingMedicine(dispensing)
	medicineName := firstNonEmptyText(medicine.Name, medicine.GenericName)
	linkedMedicationRequestID := strings.TrimSpace(dispensing.Prescription.SatusehatMedicationRequestID)
	kfaCode := strings.TrimSpace(medicine.KFACode)
	medicationMasterValue := strings.TrimSpace(firstNonEmptyText(medicine.SatusehatMedicationID, medicine.KFAName, medicineName))
	medicationMasterReady := medicationMasterValue != "" && looksLikeKFACode(kfaCode)

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "MedicationDispense membutuhkan Patient SATUSEHAT sebagai subject.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("encounter", "Encounter", true, strings.TrimSpace(record.Visit.SatusehatEncounterID) != "", strings.TrimSpace(record.Visit.SatusehatEncounterID), "Encounter diperlukan sebagai konteks dispensing.", "Sinkronkan Encounter lebih dulu."),
		makePrerequisite("performer-practitioner", "Practitioner Performer", false, performerActor.Ready(), performerActor.ResourceID, "Pegawai farmasi/dispenser dapat dipakai sebagai performer MedicationDispense.", "Lengkapi SATUSEHAT Practitioner ID pada master pegawai petugas farmasi bila performer practitioner ingin dipakai."),
		makePrerequisite("medication-request", "MedicationRequest", true, linkedMedicationRequestID != "", linkedMedicationRequestID, "Dispense membutuhkan referensi authorizingPrescription dari MedicationRequest yang sudah tersinkron.", "Sinkronkan MedicationRequest resep lebih dulu."),
		makePrerequisite("medication-master", "Medication Master", true, medicationMasterReady, medicationMasterValue, "MedicationDispense idealnya merujuk ke master Medication yang sama dengan MedicationRequest.", "Lengkapi mapping KFA agar resource Medication bisa dibentuk dan disinkronkan otomatis."),
		makePrerequisite("kfa-code", "Kode KFA Obat", true, looksLikeKFACode(kfaCode), kfaCode, "Master farmasi SATUSEHAT biasanya memakai kode KFA pada resource Medication.", "Isi kode KFA pada master obat sebelum sync farmasi."),
		makePrerequisite("medicine-form", "Bentuk Sediaan", false, strings.TrimSpace(medicine.Form) != "", strings.TrimSpace(medicine.Form), "Bentuk sediaan membantu membentuk resource Medication yang konsisten dengan referensi SATUSEHAT.", "Lengkapi bentuk sediaan pada master obat."),
		makePrerequisite("manufacturer", "Manufacturer", false, strings.TrimSpace(medicine.Manufacturer) != "", strings.TrimSpace(medicine.Manufacturer), "Manufacturer juga muncul pada contoh resource Medication di collection SATUSEHAT.", "Lengkapi pabrikan obat atau siapkan mapping Organization manufacturer."),
		makePrerequisite("organization", "Organization Faskes", false, strings.TrimSpace(config.OrganizationID) != "", strings.TrimSpace(config.OrganizationID), "Organization dipakai sebagai performer pada alur farmasi SATUSEHAT.", "Isi Organization ID SATUSEHAT pada settings."),
		makePrerequisite("medicine-quantity", "Jumlah Dispensing", true, dispensing.Quantity > 0, strings.TrimSpace(firstNonEmptyText(kfaCode, medicineName)), "Quantity dispensing tetap diperlukan untuk membentuk MedicationDispense.", "Pastikan quantity dispensing terisi."),
	}
}

func BuildProcedurePrerequisites(action models.MedicalAction, config Config) []ResourcePrerequisite {
	record := action.MedicalRecord
	practitionerActor := ResolveMedicalRecordRequesterActor(record)
	procedureName := strings.TrimSpace(firstNonEmptyText(action.ServiceNameSnapshot, action.MedicalService.Name))
	procedureCode := strings.TrimSpace(firstNonEmptyText(action.ServiceCodeSnapshot, action.MedicalService.Code))

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "Procedure membutuhkan Patient SATUSEHAT sebagai subject tindakan.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("encounter", "Encounter", true, strings.TrimSpace(record.Visit.SatusehatEncounterID) != "", strings.TrimSpace(record.Visit.SatusehatEncounterID), "Procedure perlu konteks Encounter kunjungan.", "Sinkronkan Encounter lebih dulu."),
		makePrerequisite("practitioner", "Practitioner", false, practitionerActor.Ready(), practitionerActor.ResourceID, "Practitioner dipakai sebagai performer tindakan.", "Sinkronkan Practitioner pegawai/dokter pelaksana bila performer ingin terkirim lengkap."),
		makePrerequisite("procedure-master", "Master Tindakan", true, procedureName != "", strings.TrimSpace(firstNonEmptyText(procedureCode, procedureName)), "Nama dan kode tindakan dibutuhkan untuk membentuk code Procedure.", "Lengkapi snapshot layanan tindakan pada data medical action."),
	}
}

func BuildCarePlanPrerequisites(record models.MedicalRecord, config Config) []ResourcePrerequisite {
	planSummary := strings.TrimSpace(firstNonEmptyText(record.Plan, record.FollowUpInstruction))
	authorActor := ResolveMedicalRecordRequesterActor(record)
	authorReference := strings.TrimSpace(authorActor.ResourceID)
	organizationReference := strings.TrimSpace(config.OrganizationID)
	patientReference := strings.TrimSpace(record.Patient.SatusehatPatientID)
	authorReady := authorReference != "" || organizationReference != "" || patientReference != ""
	authorValue := strings.TrimSpace(firstNonEmptyText(authorReference, organizationReference, patientReference))
	addressesReady := false
	for _, diagnosis := range record.Diagnoses {
		if strings.TrimSpace(diagnosis.SatusehatConditionID) != "" {
			addressesReady = true
			break
		}
	}

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "CarePlan membutuhkan Patient SATUSEHAT sebagai subject.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("encounter", "Encounter", true, strings.TrimSpace(record.Visit.SatusehatEncounterID) != "", strings.TrimSpace(record.Visit.SatusehatEncounterID), "CarePlan perlu konteks Encounter kunjungan.", "Sinkronkan Encounter lebih dulu."),
		makePrerequisite("care-plan-content", "Konten Rencana", true, planSummary != "", planSummary, "CarePlan dibentuk dari plan atau instruksi tindak lanjut rekam medis.", "Isi plan atau follow up instruction terlebih dulu."),
		makePrerequisite("author", "Author CarePlan", true, authorReady, authorValue, "CarePlan wajib memiliki author; fallback dapat memakai Practitioner, Organization, atau Patient.", "Sinkronkan Practitioner/Organization SATUSEHAT agar author tidak fallback ke Patient."),
		makePrerequisite("diagnosis-reference", "Referensi Diagnosis", false, addressesReady, "Condition SATUSEHAT dari diagnosis", "CarePlan bisa menghubungkan addresses ke Condition yang sudah tersinkron.", "Sinkronkan diagnosis jika ingin addresses Condition ikut terkirim."),
	}
}

func BuildGoalPrerequisites(record models.MedicalRecord, config Config) []ResourcePrerequisite {
	goalSummary := strings.TrimSpace(firstNonEmptyText(record.Plan, record.FollowUpInstruction, record.Assessment))
	practitionerActor := ResolveMedicalRecordRequesterActor(record)

	conditionReady := false
	conditionValue := ""
	for _, diag := range record.Diagnoses {
		if ref := strings.TrimSpace(diag.SatusehatConditionID); ref != "" {
			conditionReady = true
			conditionValue = ref
			break
		}
	}

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "Goal membutuhkan Patient SATUSEHAT sebagai subject.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("goal-content", "Konten Goal", true, goalSummary != "", goalSummary, "Goal dibentuk dari plan, follow-up instruction, atau assessment rekam medis.", "Isi plan/follow-up instruction/assessment pada rekam medis."),
		makePrerequisite("condition", "Condition (Diagnosis)", true, conditionReady, conditionValue, "Goal.addresses membutuhkan reference ke Condition yang sudah tersinkron; Encounter tidak diperbolehkan.", "Sinkronkan minimal satu diagnosis (Condition) terlebih dahulu."),
		makePrerequisite("practitioner", "Practitioner", false, practitionerActor.Ready(), practitionerActor.ResourceID, "Practitioner opsional untuk expressedBy pada Goal.", "Sinkronkan Practitioner pegawai/dokter pemeriksa jika ingin expressedBy ikut terkirim."),
		makePrerequisite("follow-up-date", "Tanggal Kontrol", false, record.FollowUpAt != nil && !record.FollowUpAt.IsZero(), "follow_up_at", "Tanggal kontrol dapat dikirim sebagai target dueDate pada Goal.", "Isi jadwal follow-up bila ingin menambahkan target tanggal kontrol."),
	}
}

func BuildFamilyHistoryPrerequisites(record models.MedicalRecord, config Config) []ResourcePrerequisite {
	familySummary := strings.TrimSpace(record.FamilyHistory)

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "FamilyMemberHistory membutuhkan Patient SATUSEHAT sebagai subject.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("family-history-content", "Riwayat Keluarga", true, familySummary != "", familySummary, "FamilyMemberHistory dibentuk dari kolom family_history pada rekam medis.", "Isi riwayat keluarga pada rekam medis."),
		makePrerequisite("organization", "Organization Faskes", false, strings.TrimSpace(config.OrganizationID) != "", strings.TrimSpace(config.OrganizationID), "Organization dipakai untuk namespace identifier lokal FamilyMemberHistory.", "Isi Organization ID SATUSEHAT pada settings."),
	}
}

func BuildAllergyPrerequisites(record models.MedicalRecord, config Config) []ResourcePrerequisite {
	allergySummary := strings.TrimSpace(firstNonEmptyText(record.AllergyNotes, record.Patient.Allergies, record.ClinicalAlert))

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "AllergyIntolerance membutuhkan Patient SATUSEHAT sebagai subject.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("allergy-content", "Konten Alergi", true, allergySummary != "", allergySummary, "Data alergi diambil dari patient allergies, allergy notes, atau clinical alert.", "Lengkapi data alergi pasien atau catatan alergi rekam medis."),
		makePrerequisite("encounter", "Encounter", false, strings.TrimSpace(record.Visit.SatusehatEncounterID) != "", strings.TrimSpace(record.Visit.SatusehatEncounterID), "Encounter opsional untuk memberi konteks kapan alergi dicatat.", "Sinkronkan Encounter jika ingin reference konteks kunjungan ikut terkirim."),
	}
}

func BuildCompositionPrerequisites(record models.MedicalRecord, config Config) []ResourcePrerequisite {
	hasContent := strings.TrimSpace(firstNonEmptyText(
		record.ChiefComplaint,
		record.Subjective,
		record.PhysicalExamination,
		record.Assessment,
		record.Plan,
	)) != ""
	practitionerActor := ResolveMedicalRecordRequesterActor(record)

	return []ResourcePrerequisite{
		makePrerequisite("patient", "Patient", true, strings.TrimSpace(record.Patient.SatusehatPatientID) != "", strings.TrimSpace(record.Patient.SatusehatPatientID), "Composition membutuhkan Patient SATUSEHAT sebagai subject dokumen.", "Sinkronkan Patient lebih dulu."),
		makePrerequisite("encounter", "Encounter", true, strings.TrimSpace(record.Visit.SatusehatEncounterID) != "", strings.TrimSpace(record.Visit.SatusehatEncounterID), "Composition membutuhkan Encounter SATUSEHAT sebagai konteks episode kunjungan.", "Sinkronkan Encounter lebih dulu."),
		makePrerequisite("composition-content", "Konten Resume", true, hasContent, "Anamnesis, pemeriksaan, assessment, rencana", "Composition dibentuk dari ringkasan konten rekam medis.", "Lengkapi minimal salah satu bagian rekam medis agar dokumen dapat dibentuk."),
		makePrerequisite("practitioner", "Practitioner", false, practitionerActor.Ready(), practitionerActor.ResourceID, "Practitioner digunakan sebagai author dokumen Composition.", "Sinkronkan Practitioner pegawai/dokter pemeriksa bila author ingin terkirim lengkap."),
	}
}

func makePrerequisite(key, label string, required, ready bool, currentValue, detail, nextStep string) ResourcePrerequisite {
	return ResourcePrerequisite{Key: key, Label: label, Required: required, Ready: ready, CurrentValue: currentValue, Detail: detail, NextStep: nextStep}
}

func hasLaboratoryResults(item models.LaboratoryOrderItem) bool {
	if strings.TrimSpace(firstNonEmptyText(item.ResultValue, item.ResultNotes)) != "" {
		return true
	}
	for _, parameter := range item.ParameterResults {
		if strings.TrimSpace(firstNonEmptyText(parameter.ResultValue, parameter.ResultNotes)) != "" {
			return true
		}
	}
	return false
}

func hasRadiologyResults(item models.RadiologyOrderItem) bool {
	if strings.TrimSpace(firstNonEmptyText(item.Findings, item.Impression, item.Recommendation, item.ResultNotes)) != "" {
		return true
	}
	for _, parameter := range item.ParameterResults {
		if strings.TrimSpace(firstNonEmptyText(parameter.ResultValue, parameter.ResultNotes)) != "" {
			return true
		}
	}
	return false
}

func looksLikeKFACode(value string) bool {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) < 6 {
		return false
	}
	for _, char := range trimmed {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}
