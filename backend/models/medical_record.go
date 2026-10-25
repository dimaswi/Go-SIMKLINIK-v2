package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalRecord struct {
	ID                             uint                     `gorm:"primarykey" json:"id"`
	CreatedAt                      time.Time                `json:"created_at"`
	UpdatedAt                      time.Time                `json:"updated_at"`
	DeletedAt                      gorm.DeletedAt           `gorm:"index" json:"-"`
	VisitID                        uint                     `gorm:"not null;index" json:"visit_id"`
	PatientID                      uint                     `gorm:"not null;index" json:"patient_id"`
	DoctorID                       uint                     `gorm:"not null;index" json:"doctor_id"`
	PolyclinicID                   uint                     `gorm:"not null;index" json:"polyclinic_id"`
	SectionType                    string                   `gorm:"size:30;not null;default:'anamnesis';index" json:"section_type"`
	EntryGroupKey                  string                   `gorm:"size:100;index" json:"entry_group_key"`
	SheetKey                       string                   `gorm:"size:50;index" json:"sheet_key"`
	RecordDate                     time.Time                `gorm:"not null" json:"record_date"`
	ChiefComplaint                 string                   `gorm:"type:text" json:"chief_complaint"`
	HistoryOfPresentIllness        string                   `gorm:"type:text" json:"history_of_present_illness"`
	PastMedicalHistory             string                   `gorm:"type:text" json:"past_medical_history"`
	PastSurgicalHistory            string                   `gorm:"type:text" json:"past_surgical_history"`
	FamilyHistory                  string                   `gorm:"type:text" json:"family_history"`
	MedicationHistory              string                   `gorm:"type:text" json:"medication_history"`
	SocialHistory                  string                   `gorm:"type:text" json:"social_history"`
	ReviewOfSystems                string                   `gorm:"type:text" json:"review_of_systems"`
	ClinicalAlert                  string                   `gorm:"type:text" json:"clinical_alert"`
	AllergyNotes                   string                   `gorm:"type:text" json:"allergy_notes"`
	Subjective                     string                   `gorm:"type:text" json:"subjective"`
	BPSystolic                     int                      `json:"bp_systolic"`
	BPDiastolic                    int                      `json:"bp_diastolic"`
	HeartRate                      int                      `json:"heart_rate"`
	Temperature                    float64                  `json:"temperature"`
	RespiratoryRate                int                      `json:"respiratory_rate"`
	SpO2                           float64                  `gorm:"column:sp_o2" json:"spo2"`
	PainScaleType                  string                   `gorm:"size:30;default:'nrs'" json:"pain_scale_type"`
	PainScale                      int                      `json:"pain_scale"`
	Consciousness                  string                   `gorm:"size:30" json:"consciousness"`
	Height                         float64                  `json:"height"`
	Weight                         float64                  `json:"weight"`
	BMI                            float64                  `json:"bmi"`
	PhysicalExamination            string                   `gorm:"type:text" json:"physical_examination"`
	SupportingExamination          string                   `gorm:"type:text" json:"supporting_examination"`
	WorkingDiagnosis               string                   `gorm:"type:text" json:"working_diagnosis"`
	DifferentialDiagnosis          string                   `gorm:"type:text" json:"differential_diagnosis"`
	Assessment                     string                   `gorm:"type:text" json:"assessment"`
	Plan                           string                   `gorm:"type:text" json:"plan"`
	FollowUpInstruction            string                   `gorm:"type:text" json:"follow_up_instruction"`
	FollowUpAt                     *time.Time               `json:"follow_up_at"`
	PrescriptionFulfillmentMode    string                   `gorm:"size:20" json:"prescription_fulfillment_mode"`
	PrescriptionWorkflowStatus     string                   `gorm:"size:20;default:'draft'" json:"prescription_workflow_status"`
	PrescriptionOrderedAt          *time.Time               `json:"prescription_ordered_at"`
	PrescriptionOrderedBy          *uint                    `gorm:"index" json:"prescription_ordered_by"`
	PrescriptionProcessedAt        *time.Time               `json:"prescription_processed_at"`
	PrescriptionProcessedBy        *uint                    `gorm:"index" json:"prescription_processed_by"`
	PrescriptionReviewInitial       string                   `gorm:"type:text" json:"prescription_review_initial"`
	PrescriptionReviewFinal         string                   `gorm:"type:text" json:"prescription_review_final"`
	PrescriptionDoctorOrderSnapshot string                   `gorm:"type:text" json:"prescription_doctor_order_snapshot"`
	LaboratoryWorkflowStatus       string                   `gorm:"size:20;default:'draft'" json:"laboratory_workflow_status"`
	LaboratoryOrderedAt            *time.Time               `json:"laboratory_ordered_at"`
	LaboratoryOrderedBy            *uint                    `gorm:"index" json:"laboratory_ordered_by"`
	LaboratoryProcessedAt          *time.Time               `json:"laboratory_processed_at"`
	LaboratoryProcessedBy          *uint                    `gorm:"index" json:"laboratory_processed_by"`
	RadiologyWorkflowStatus        string                   `gorm:"size:20;default:'draft'" json:"radiology_workflow_status"`
	RadiologyOrderedAt             *time.Time               `json:"radiology_ordered_at"`
	RadiologyOrderedBy             *uint                    `gorm:"index" json:"radiology_ordered_by"`
	RadiologyProcessedAt           *time.Time               `json:"radiology_processed_at"`
	RadiologyProcessedBy           *uint                    `gorm:"index" json:"radiology_processed_by"`
	Disposition                    string                   `gorm:"size:30" json:"disposition"`
	DischargeCondition             string                   `gorm:"type:text" json:"discharge_condition"`
	ReferralDestination            string                   `gorm:"type:text" json:"referral_destination"`
	ReferralReason                 string                   `gorm:"type:text" json:"referral_reason"`
	Notes                          string                   `gorm:"type:text" json:"notes"`
	Status                         string                   `gorm:"size:10;default:'draft'" json:"status"`
	SatusehatVitalSignIDs          string                   `gorm:"type:text" json:"satusehat_vital_sign_ids"`
	SatusehatVitalSignsSyncedAt    *time.Time               `json:"satusehat_vital_signs_synced_at"`
	SatusehatClinicalImpressionID  string                   `gorm:"size:120;index" json:"satusehat_clinical_impression_id"`
	SatusehatClinicalSyncedAt      *time.Time               `json:"satusehat_clinical_synced_at"`
	SatusehatCarePlanID            string                   `gorm:"size:120;index" json:"satusehat_care_plan_id"`
	SatusehatCarePlanSyncedAt      *time.Time               `json:"satusehat_care_plan_synced_at"`
	SatusehatGoalID                string                   `gorm:"size:120;index" json:"satusehat_goal_id"`
	SatusehatGoalSyncedAt          *time.Time               `json:"satusehat_goal_synced_at"`
	SatusehatCompositionID         string                   `gorm:"size:120;index" json:"satusehat_composition_id"`
	SatusehatCompositionSyncedAt   *time.Time               `json:"satusehat_composition_synced_at"`
	SatusehatAllergyIntoleranceID  string                   `gorm:"size:120;index" json:"satusehat_allergy_intolerance_id"`
	SatusehatAllergySyncedAt       *time.Time               `json:"satusehat_allergy_synced_at"`
	SatusehatFamilyHistoryID       string                   `gorm:"size:120;index" json:"satusehat_family_history_id"`
	SatusehatFamilyHistorySyncedAt *time.Time               `json:"satusehat_family_history_synced_at"`
	Visit                          Visit                    `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
	Patient                        Patient                  `gorm:"foreignKey:PatientID" json:"patient,omitempty"`
	Doctor                         Doctor                   `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
	Polyclinic                     Polyclinic               `gorm:"foreignKey:PolyclinicID" json:"polyclinic,omitempty"`
	Diagnoses                      []MedicalRecordDiagnosis `gorm:"foreignKey:MedicalRecordID" json:"diagnoses,omitempty"`
	Prescriptions                  []Prescription           `gorm:"foreignKey:MedicalRecordID" json:"prescriptions,omitempty"`
	PrescriptionCompounds          []PrescriptionCompound   `gorm:"foreignKey:MedicalRecordID" json:"prescription_compounds,omitempty"`
	LaboratoryOrderItems           []LaboratoryOrderItem    `gorm:"foreignKey:MedicalRecordID" json:"laboratory_order_items,omitempty"`
	RadiologyOrderItems            []RadiologyOrderItem     `gorm:"foreignKey:MedicalRecordID" json:"radiology_order_items,omitempty"`
	Actions                        []MedicalAction          `gorm:"foreignKey:MedicalRecordID" json:"actions,omitempty"`
	PhysicalExamImages             []MedicalRecordImagePick `gorm:"foreignKey:MedicalRecordID" json:"physical_exam_images,omitempty"`
	InformedConsents               []InformedConsent        `gorm:"foreignKey:MedicalRecordID" json:"informed_consents,omitempty"`
	PrescriptionProcessor          *User                    `gorm:"foreignKey:PrescriptionProcessedBy" json:"prescription_processor,omitempty"`
	LaboratoryProcessor            *User                    `gorm:"foreignKey:LaboratoryProcessedBy" json:"laboratory_processor,omitempty"`
	RadiologyProcessor             *User                    `gorm:"foreignKey:RadiologyProcessedBy" json:"radiology_processor,omitempty"`
}
