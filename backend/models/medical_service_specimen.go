package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalServiceSpecimen struct {
	ID                 uint             `gorm:"primarykey" json:"id"`
	CreatedAt          time.Time        `json:"created_at"`
	UpdatedAt          time.Time        `json:"updated_at"`
	DeletedAt          gorm.DeletedAt   `gorm:"index" json:"-"`
	MedicalServiceID   uint             `gorm:"not null;index;uniqueIndex:idx_medical_service_specimen" json:"medical_service_id"`
	SpecimenTemplateID uint             `gorm:"not null;index;uniqueIndex:idx_medical_service_specimen" json:"specimen_template_id"`
	SortOrder          int              `gorm:"default:0" json:"sort_order"`
	IsDefault          bool             `gorm:"default:false" json:"is_default"`
	Notes              string           `gorm:"size:255" json:"notes"`
	MedicalService     MedicalService   `gorm:"foreignKey:MedicalServiceID" json:"medical_service,omitempty"`
	SpecimenTemplate   SpecimenTemplate `gorm:"foreignKey:SpecimenTemplateID" json:"specimen_template,omitempty"`
}
