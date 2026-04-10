package models

import (
	"time"

	"gorm.io/gorm"
)

type Medicine struct {
	ID                          uint             `gorm:"primarykey" json:"id"`
	CreatedAt                   time.Time        `json:"created_at"`
	UpdatedAt                   time.Time        `json:"updated_at"`
	DeletedAt                   gorm.DeletedAt   `gorm:"index" json:"-"`
	Code                        string           `gorm:"uniqueIndex;not null;size:20" json:"code"`
	KFACode                     string           `gorm:"size:20;index" json:"kfa_code"`
	KFAName                     string           `gorm:"size:255" json:"kfa_name"`
	Name                        string           `gorm:"not null;size:200" json:"name"`
	GenericName                 string           `gorm:"size:200" json:"generic_name"`
	CategoryID                  uint             `gorm:"not null;index" json:"category_id"`
	UnitID                      uint             `gorm:"not null;index" json:"unit_id"`
	Type                        string           `gorm:"size:20" json:"type"`
	Form                        string           `gorm:"size:50" json:"form"`
	Strength                    string           `gorm:"size:50" json:"strength"`
	Manufacturer                string           `gorm:"size:100" json:"manufacturer"`
	MinStock                    int              `gorm:"default:10" json:"min_stock"`
	CurrentStock                int              `gorm:"default:0" json:"current_stock"`
	PurchasePrice               float64          `gorm:"default:0" json:"purchase_price"`
	SellingPrice                float64          `gorm:"default:0" json:"selling_price"`
	IsActive                    bool             `gorm:"default:true" json:"is_active"`
	SatusehatMedicationID       string           `gorm:"size:120;index" json:"satusehat_medication_id"`
	SatusehatMedicationSyncedAt *time.Time       `json:"satusehat_medication_synced_at"`
	Category                    MedicineCategory `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	Unit                        Unit             `gorm:"foreignKey:UnitID" json:"unit,omitempty"`
}
