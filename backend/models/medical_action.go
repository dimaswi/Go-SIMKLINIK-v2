package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalAction struct {
	ID               uint           `gorm:"primarykey" json:"id"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
	MedicalRecordID  uint           `gorm:"not null;index" json:"medical_record_id"`
	MedicalServiceID uint           `gorm:"not null;index" json:"medical_service_id"`
	DoctorID         uint           `gorm:"not null;index" json:"doctor_id"`
	Notes            string         `gorm:"type:text" json:"notes"`
	Quantity         int            `gorm:"default:1" json:"quantity"`
	Price            float64        `json:"price"`
	MedicalRecord    MedicalRecord  `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	MedicalService   MedicalService `gorm:"foreignKey:MedicalServiceID" json:"medical_service,omitempty"`
	Doctor           Doctor         `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
}
