package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalServiceParameter struct {
	ID                   uint           `gorm:"primarykey" json:"id"`
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
	DeletedAt            gorm.DeletedAt `gorm:"index" json:"-"`
	MedicalServiceID     uint           `gorm:"not null;index" json:"medical_service_id"`
	Code                 string         `gorm:"size:30" json:"code"`
	Name                 string         `gorm:"not null;size:120" json:"name"`
	InputType            string         `gorm:"size:20;default:'text'" json:"input_type"`
	Unit                 string         `gorm:"size:50" json:"unit"`
	ReferenceValueMale   string         `gorm:"size:120" json:"reference_value_male"`
	ReferenceValueFemale string         `gorm:"size:120" json:"reference_value_female"`
	SortOrder            int            `gorm:"default:0" json:"sort_order"`
	IsRequired           bool           `gorm:"default:true" json:"is_required"`
	MedicalService       MedicalService `gorm:"foreignKey:MedicalServiceID" json:"medical_service,omitempty"`
}
