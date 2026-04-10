package models

import (
	"time"

	"gorm.io/gorm"
)

type PrescriptionCompound struct {
	ID              uint                       `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time                  `json:"created_at"`
	UpdatedAt       time.Time                  `json:"updated_at"`
	DeletedAt       gorm.DeletedAt             `gorm:"index" json:"-"`
	MedicalRecordID uint                       `gorm:"not null;index" json:"medical_record_id"`
	Name            string                     `gorm:"not null;size:200" json:"name"`
	PreparationType string                     `gorm:"size:50" json:"preparation_type"`
	OutputQuantity  int                        `json:"output_quantity"`
	OutputUnit      string                     `gorm:"size:50" json:"output_unit"`
	Dosage          string                     `gorm:"size:50" json:"dosage"`
	Frequency       string                     `gorm:"size:50" json:"frequency"`
	Duration        string                     `gorm:"size:50" json:"duration"`
	Route           string                     `gorm:"size:20" json:"route"`
	Instructions    string                     `gorm:"size:255" json:"instructions"`
	Notes           string                     `gorm:"type:text" json:"notes"`
	Status          string                     `gorm:"size:20;default:'prescribed'" json:"status"`
	MedicalRecord   MedicalRecord              `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	Items           []PrescriptionCompoundItem `gorm:"foreignKey:PrescriptionCompoundID" json:"items,omitempty"`
	Dispensings     []Dispensing               `gorm:"foreignKey:PrescriptionCompoundID" json:"dispensings,omitempty"`
}

type PrescriptionCompoundItem struct {
	ID                     uint                 `gorm:"primarykey" json:"id"`
	CreatedAt              time.Time            `json:"created_at"`
	UpdatedAt              time.Time            `json:"updated_at"`
	DeletedAt              gorm.DeletedAt       `gorm:"index" json:"-"`
	PrescriptionCompoundID uint                 `gorm:"not null;index" json:"prescription_compound_id"`
	MedicineID             uint                 `gorm:"not null;index" json:"medicine_id"`
	Quantity               int                  `json:"quantity"`
	Notes                  string               `gorm:"type:text" json:"notes"`
	PrescriptionCompound   PrescriptionCompound `gorm:"foreignKey:PrescriptionCompoundID" json:"prescription_compound,omitempty"`
	Medicine               Medicine             `gorm:"foreignKey:MedicineID" json:"medicine,omitempty"`
}
