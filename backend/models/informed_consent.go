package models

import (
	"time"

	"gorm.io/gorm"
)

type InformedConsent struct {
	ID                   uint           `gorm:"primarykey" json:"id"`
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
	DeletedAt            gorm.DeletedAt `gorm:"index" json:"-"`
	VisitID              uint           `gorm:"index" json:"visit_id"`
	MedicalRecordID      uint           `gorm:"not null;index" json:"medical_record_id"`
	MedicalActionID      *uint          `gorm:"index" json:"medical_action_id,omitempty"`
	MedicalServiceID     *uint          `gorm:"index" json:"medical_service_id,omitempty"`
	PatientID            uint           `gorm:"not null;index" json:"patient_id"`
	DoctorID             uint           `gorm:"not null;index" json:"doctor_id"`
	NurseName            string         `gorm:"size:120" json:"nurse_name"`
	ActionName           string         `gorm:"size:200" json:"action_name"`
	Diagnosis            string         `gorm:"type:text" json:"diagnosis"`
	ActionDescription    string         `gorm:"type:text" json:"action_description"`
	Risks                string         `gorm:"type:text" json:"risks"`
	Benefits             string         `gorm:"type:text" json:"benefits"`
	Alternatives         string         `gorm:"type:text" json:"alternatives"`
	Prognosis            string         `gorm:"type:text" json:"prognosis"`
	PatientDecision      string         `gorm:"size:20" json:"patient_decision"`
	ConsentDate          time.Time      `json:"consent_date"`
	ConsentGiverName     string         `gorm:"size:100" json:"consent_giver_name"`
	ConsentGiverRelation string         `gorm:"size:100" json:"consent_giver_relation"`
	ConsentGiverIDNumber string         `gorm:"size:50" json:"consent_giver_id_number"`
	PatientSignature     string         `gorm:"type:text" json:"patient_signature"`
	PatientSignedAt      *time.Time     `json:"patient_signed_at,omitempty"`
	WitnessName          string         `gorm:"size:100" json:"witness_name"`
	WitnessSignature     string         `gorm:"type:text" json:"witness_signature"`
	WitnessSignedAt      *time.Time     `json:"witness_signed_at,omitempty"`
	Notes                string         `gorm:"type:text" json:"notes"`
	MedicalRecord        MedicalRecord  `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	Patient              Patient        `gorm:"foreignKey:PatientID" json:"patient,omitempty"`
	Doctor               Doctor         `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
}
