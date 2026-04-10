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
	MedicalRecordID      uint           `gorm:"not null;index" json:"medical_record_id"`
	MedicalActionID      *uint          `gorm:"index" json:"medical_action_id,omitempty"`
	PatientID            uint           `gorm:"not null;index" json:"patient_id"`
	DoctorID             uint           `gorm:"not null;index" json:"doctor_id"`
	ActionName           string         `gorm:"size:200" json:"action_name"`
	ActionDescription    string         `gorm:"type:text" json:"action_description"`
	Risks                string         `gorm:"type:text" json:"risks"`
	Benefits             string         `gorm:"type:text" json:"benefits"`
	PatientDecision      string         `gorm:"size:10" json:"patient_decision"`
	ConsentDate          time.Time      `json:"consent_date"`
	ConsentGiverName     string         `gorm:"size:100" json:"consent_giver_name"`
	ConsentGiverRelation string         `gorm:"size:100" json:"consent_giver_relation"`
	ConsentGiverIDNumber string         `gorm:"size:50" json:"consent_giver_id_number"`
	WitnessName          string         `gorm:"size:100" json:"witness_name"`
	Notes                string         `gorm:"type:text" json:"notes"`
	MedicalRecord        MedicalRecord  `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	Patient              Patient        `gorm:"foreignKey:PatientID" json:"patient,omitempty"`
	Doctor               Doctor         `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
}
