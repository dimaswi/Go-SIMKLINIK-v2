package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalRecord struct {
	ID                      uint                     `gorm:"primarykey" json:"id"`
	CreatedAt               time.Time                `json:"created_at"`
	UpdatedAt               time.Time                `json:"updated_at"`
	DeletedAt               gorm.DeletedAt           `gorm:"index" json:"-"`
	VisitID                 uint                     `gorm:"uniqueIndex;not null" json:"visit_id"`
	PatientID               uint                     `gorm:"not null;index" json:"patient_id"`
	DoctorID                uint                     `gorm:"not null;index" json:"doctor_id"`
	PolyclinicID            uint                     `gorm:"not null;index" json:"polyclinic_id"`
	RecordDate              time.Time                `gorm:"not null" json:"record_date"`
	ChiefComplaint          string                   `gorm:"type:text" json:"chief_complaint"`
	HistoryOfPresentIllness string                   `gorm:"type:text" json:"history_of_present_illness"`
	ClinicalAlert           string                   `gorm:"type:text" json:"clinical_alert"`
	AllergyNotes            string                   `gorm:"type:text" json:"allergy_notes"`
	Subjective              string                   `gorm:"type:text" json:"subjective"`
	BPSystolic              int                      `json:"bp_systolic"`
	BPDiastolic             int                      `json:"bp_diastolic"`
	HeartRate               int                      `json:"heart_rate"`
	Temperature             float64                  `json:"temperature"`
	RespiratoryRate         int                      `json:"respiratory_rate"`
	SpO2                    float64                  `json:"spo2"`
	PainScale               int                      `json:"pain_scale"`
	Consciousness           string                   `gorm:"size:30" json:"consciousness"`
	Height                  float64                  `json:"height"`
	Weight                  float64                  `json:"weight"`
	BMI                     float64                  `json:"bmi"`
	PhysicalExamination     string                   `gorm:"type:text" json:"physical_examination"`
	Assessment              string                   `gorm:"type:text" json:"assessment"`
	Plan                    string                   `gorm:"type:text" json:"plan"`
	FollowUpInstruction     string                   `gorm:"type:text" json:"follow_up_instruction"`
	FollowUpAt              *time.Time               `json:"follow_up_at"`
	Notes                   string                   `gorm:"type:text" json:"notes"`
	Status                  string                   `gorm:"size:10;default:'draft'" json:"status"`
	Visit                   Visit                    `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
	Patient                 Patient                  `gorm:"foreignKey:PatientID" json:"patient,omitempty"`
	Doctor                  Doctor                   `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
	Polyclinic              Polyclinic               `gorm:"foreignKey:PolyclinicID" json:"polyclinic,omitempty"`
	Diagnoses               []MedicalRecordDiagnosis `gorm:"foreignKey:MedicalRecordID" json:"diagnoses,omitempty"`
	Prescriptions           []Prescription           `gorm:"foreignKey:MedicalRecordID" json:"prescriptions,omitempty"`
	Actions                 []MedicalAction          `gorm:"foreignKey:MedicalRecordID" json:"actions,omitempty"`
	InformedConsents        []InformedConsent        `gorm:"foreignKey:MedicalRecordID" json:"informed_consents,omitempty"`
}
