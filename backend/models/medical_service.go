package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalService struct {
	ID           uint             `gorm:"primarykey" json:"id"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`
	DeletedAt    gorm.DeletedAt   `gorm:"index" json:"-"`
	Code         string           `gorm:"size:20" json:"code"`
	Name         string           `gorm:"not null;size:200" json:"name"`
	CategoryID   uint             `gorm:"not null;index" json:"category_id"`
	PolyclinicID *uint            `gorm:"index" json:"polyclinic_id"`
	Price        float64          `gorm:"default:0" json:"price"`
	IsActive     bool             `gorm:"default:true" json:"is_active"`
	Description  string           `gorm:"size:255" json:"description"`
	Category     ServiceCategory  `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	Polyclinic   *Polyclinic      `gorm:"foreignKey:PolyclinicID" json:"polyclinic,omitempty"`
}
