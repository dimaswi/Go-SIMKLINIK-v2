package models

import (
	"time"

	"gorm.io/gorm"
)

type DoctorSchedule struct {
	ID           uint           `gorm:"primarykey" json:"id"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
	DoctorID     uint           `gorm:"not null;index" json:"doctor_id"`
	PolyclinicID uint           `gorm:"not null;index" json:"polyclinic_id"`
	DayOfWeek    int            `gorm:"not null" json:"day_of_week"`
	StartTime    string         `gorm:"size:5" json:"start_time"`
	EndTime      string         `gorm:"size:5" json:"end_time"`
	MaxPatients  int            `gorm:"default:30" json:"max_patients"`
	IsActive     bool           `gorm:"default:true" json:"is_active"`
	Doctor       Doctor         `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
	Polyclinic   Polyclinic     `gorm:"foreignKey:PolyclinicID" json:"polyclinic,omitempty"`
}
