package models

import (
	"time"

	"gorm.io/gorm"
)

type Polyclinic struct {
	ID                            uint           `gorm:"primarykey" json:"id"`
	CreatedAt                     time.Time      `json:"created_at"`
	UpdatedAt                     time.Time      `json:"updated_at"`
	DeletedAt                     gorm.DeletedAt `gorm:"index" json:"-"`
	Name                          string         `gorm:"not null;size:100" json:"name"`
	Code                          string         `gorm:"uniqueIndex;not null;size:20" json:"code"`
	Description                   string         `gorm:"size:255" json:"description"`
	AdminFee                      float64        `gorm:"default:0" json:"admin_fee"`
	IsActive                      bool           `gorm:"default:true" json:"is_active"`
	Color                         string         `gorm:"size:20" json:"color"`
	Icon                          string         `gorm:"size:50" json:"icon"`
	SortOrder                     int            `gorm:"default:0" json:"sort_order"`
	SatusehatOrganizationID       string         `gorm:"size:100" json:"satusehat_organization_id"`
	SatusehatLocationID           string         `gorm:"size:100" json:"satusehat_location_id"`
	SatusehatOrganizationSyncedAt *time.Time     `json:"satusehat_organization_synced_at,omitempty"`
	SatusehatLocationSyncedAt     *time.Time     `json:"satusehat_location_synced_at,omitempty"`
}
