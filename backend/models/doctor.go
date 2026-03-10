package models

import (
	"time"

	"gorm.io/gorm"
)

type Doctor struct {
	ID             uint           `gorm:"primarykey" json:"id"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
	UserID         *uint          `json:"user_id"`
	FullName       string         `gorm:"not null;size:100" json:"full_name"`
	SIPNumber      string         `gorm:"size:50" json:"sip_number"`
	Specialization string         `gorm:"size:100" json:"specialization"`
	Phone          string         `gorm:"size:20" json:"phone"`
	Photo          string         `gorm:"size:255" json:"photo"`
	IsActive       bool           `gorm:"default:true" json:"is_active"`
	User           User           `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Polyclinics    []Polyclinic   `gorm:"many2many:doctor_polyclinics;" json:"polyclinics,omitempty"`
	Schedules      []DoctorSchedule `gorm:"foreignKey:DoctorID" json:"schedules,omitempty"`
}
