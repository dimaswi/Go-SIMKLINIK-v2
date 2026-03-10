package models

import (
	"time"

	"gorm.io/gorm"
)

type Prescription struct {
	ID              uint           `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
	MedicalRecordID uint           `gorm:"not null;index" json:"medical_record_id"`
	MedicineID      uint           `gorm:"not null;index" json:"medicine_id"`
	Quantity        int            `json:"quantity"`
	Dosage          string         `gorm:"size:50" json:"dosage"`
	Frequency       string         `gorm:"size:50" json:"frequency"`
	Duration        string         `gorm:"size:50" json:"duration"`
	Route           string         `gorm:"size:20" json:"route"`
	Instructions    string         `gorm:"size:255" json:"instructions"`
	Notes           string         `gorm:"type:text" json:"notes"`
	Status          string         `gorm:"size:20;default:'prescribed'" json:"status"`
	MedicalRecord   MedicalRecord  `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	Medicine        Medicine       `gorm:"foreignKey:MedicineID" json:"medicine,omitempty"`
}
