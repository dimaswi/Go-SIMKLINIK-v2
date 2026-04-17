package models

import (
	"time"

	"gorm.io/gorm"
)

type Employee struct {
	ID                      uint           `gorm:"primarykey" json:"id"`
	CreatedAt               time.Time      `json:"created_at"`
	UpdatedAt               time.Time      `json:"updated_at"`
	DeletedAt               gorm.DeletedAt `gorm:"index" json:"-"`
	UserID                  *uint          `gorm:"uniqueIndex" json:"user_id"`
	FullName                string         `gorm:"not null;size:100;index" json:"full_name"`
	EmployeeCode            string         `gorm:"size:50;index" json:"employee_code"`
	NIKNumber               string         `gorm:"size:20;index" json:"nik_number"`
	NIPNumber               string         `gorm:"size:50;index" json:"nip_number"`
	Profession              string         `gorm:"size:40;not null;index" json:"profession"`
	LicenseNumber           string         `gorm:"size:80" json:"license_number"`
	Phone                   string         `gorm:"size:20" json:"phone"`
	RequiresSATUSEHAT       bool           `gorm:"default:false;index" json:"requires_satusehat"`
	SatusehatPractitionerID string         `gorm:"size:120;index" json:"satusehat_practitioner_id"`
	SatusehatSyncedAt       *time.Time     `json:"satusehat_synced_at"`
	IsActive                bool           `gorm:"default:true;index" json:"is_active"`
	User                    User           `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
