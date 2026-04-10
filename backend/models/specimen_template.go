package models

import (
	"time"

	"gorm.io/gorm"
)

type SpecimenTemplate struct {
	ID                      uint                     `gorm:"primarykey" json:"id"`
	CreatedAt               time.Time                `json:"created_at"`
	UpdatedAt               time.Time                `json:"updated_at"`
	DeletedAt               gorm.DeletedAt           `gorm:"index" json:"-"`
	Code                    string                   `gorm:"size:40;uniqueIndex" json:"code"`
	Name                    string                   `gorm:"not null;size:160" json:"name"`
	Description             string                   `gorm:"size:255" json:"description"`
	TypeSystem              string                   `gorm:"size:120" json:"type_system"`
	TypeCode                string                   `gorm:"size:80" json:"type_code"`
	TypeDisplay             string                   `gorm:"size:160" json:"type_display"`
	CollectionMethodSystem  string                   `gorm:"size:120" json:"collection_method_system"`
	CollectionMethodCode    string                   `gorm:"size:80" json:"collection_method_code"`
	CollectionMethodDisplay string                   `gorm:"size:160" json:"collection_method_display"`
	IsActive                bool                     `gorm:"default:true" json:"is_active"`
	MedicalServiceOptions   []MedicalServiceSpecimen `gorm:"foreignKey:SpecimenTemplateID" json:"medical_service_options,omitempty"`
}
