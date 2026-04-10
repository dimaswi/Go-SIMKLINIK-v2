package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalRecordDiagnosis struct {
	ID                    uint           `gorm:"primarykey" json:"id"`
	CreatedAt             time.Time      `json:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at"`
	DeletedAt             gorm.DeletedAt `gorm:"index" json:"-"`
	MedicalRecordID       uint           `gorm:"not null;index" json:"medical_record_id"`
	ICD10ID               uint           `gorm:"not null;index" json:"icd10_id"`
	DiagnosisType         string         `gorm:"size:20" json:"diagnosis_type"`
	WorkingDiagnosis      string         `gorm:"type:text" json:"working_diagnosis"`
	DifferentialDiagnosis string         `gorm:"type:text" json:"differential_diagnosis"`
	AssessmentNarrative   string         `gorm:"type:text" json:"assessment_narrative"`
	Notes                 string         `gorm:"type:text" json:"notes"`
	SatusehatConditionID  string         `gorm:"size:120;index" json:"satusehat_condition_id"`
	SatusehatSyncedAt     *time.Time     `json:"satusehat_synced_at"`
	MedicalRecord         MedicalRecord  `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	ICD10                 ICD10          `gorm:"foreignKey:ICD10ID" json:"icd10,omitempty"`
}
