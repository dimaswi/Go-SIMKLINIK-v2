package models

import (
	"time"

	"gorm.io/gorm"
)

type LabRequest struct {
	ID              uint             `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
	DeletedAt       gorm.DeletedAt   `gorm:"index" json:"-"`
	RequestNumber   string           `gorm:"uniqueIndex;not null;size:20" json:"request_number"`
	MedicalRecordID uint             `gorm:"not null;index" json:"medical_record_id"`
	PatientID       uint             `gorm:"not null;index" json:"patient_id"`
	DoctorID        uint             `gorm:"not null;index" json:"doctor_id"`
	RequestDate     time.Time        `json:"request_date"`
	Type            string           `gorm:"size:20" json:"type"`
	ExternalLabName string           `gorm:"size:200" json:"external_lab_name"`
	Status          string           `gorm:"size:20;default:'diminta'" json:"status"`
	Notes           string           `gorm:"type:text" json:"notes"`
	Priority        string           `gorm:"size:10;default:'normal'" json:"priority"`
	MedicalRecord   MedicalRecord    `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	Patient         Patient          `gorm:"foreignKey:PatientID" json:"patient,omitempty"`
	Doctor          Doctor           `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
	Items           []LabRequestItem `gorm:"foreignKey:LabRequestID" json:"items,omitempty"`
}
