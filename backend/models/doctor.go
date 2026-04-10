package models

import (
	"time"

	"gorm.io/gorm"
)

type Doctor struct {
	ID                      uint             `gorm:"primarykey" json:"id"`
	CreatedAt               time.Time        `json:"created_at"`
	UpdatedAt               time.Time        `json:"updated_at"`
	DeletedAt               gorm.DeletedAt   `gorm:"index" json:"-"`
	UserID                  *uint            `json:"user_id"`
	FullName                string           `gorm:"not null;size:100" json:"full_name"`
	NIKNumber               string           `gorm:"size:20;index" json:"nik_number"`
	NIPNumber               string           `gorm:"size:50" json:"nip_number"`
	SIPNumber               string           `gorm:"size:50" json:"sip_number"`
	Specialization          string           `gorm:"size:100" json:"specialization"`
	Phone                   string           `gorm:"size:20" json:"phone"`
	Photo                   string           `gorm:"size:255" json:"photo"`
	SatusehatPractitionerID string           `gorm:"size:120;index" json:"satusehat_practitioner_id"`
	SatusehatSyncedAt       *time.Time       `json:"satusehat_synced_at"`
	IsActive                bool             `gorm:"default:true" json:"is_active"`
	User                    User             `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Polyclinics             []Polyclinic     `gorm:"many2many:doctor_polyclinics;" json:"polyclinics,omitempty"`
	Schedules               []DoctorSchedule `gorm:"foreignKey:DoctorID" json:"schedules,omitempty"`
}
