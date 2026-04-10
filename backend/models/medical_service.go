package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalService struct {
	ID                     uint                      `gorm:"primarykey" json:"id"`
	CreatedAt              time.Time                 `json:"created_at"`
	UpdatedAt              time.Time                 `json:"updated_at"`
	DeletedAt              gorm.DeletedAt            `gorm:"index" json:"-"`
	Code                   string                    `gorm:"size:20" json:"code"`
	Name                   string                    `gorm:"not null;size:200" json:"name"`
	CategoryID             uint                      `gorm:"not null;index" json:"category_id"`
	PolyclinicID           *uint                     `gorm:"index" json:"polyclinic_id"`
	ServiceDomain          string                    `gorm:"size:20;not null;default:'general';index" json:"service_domain"`
	TargetScope            string                    `gorm:"size:20;not null;default:'none'" json:"target_scope"`
	RequiresConsent        bool                      `gorm:"default:false" json:"requires_consent"`
	SupportsOdontogramSync bool                      `gorm:"default:false" json:"supports_odontogram_sync"`
	Price                  float64                   `gorm:"default:0" json:"price"`
	IsActive               bool                      `gorm:"default:true" json:"is_active"`
	Description            string                    `gorm:"size:255" json:"description"`
	Category               ServiceCategory           `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	Polyclinic             *Polyclinic               `gorm:"foreignKey:PolyclinicID" json:"polyclinic,omitempty"`
	Parameters             []MedicalServiceParameter `gorm:"foreignKey:MedicalServiceID" json:"parameters,omitempty"`
	SpecimenOptions        []MedicalServiceSpecimen  `gorm:"foreignKey:MedicalServiceID" json:"specimen_options,omitempty"`
}
