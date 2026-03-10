package models

import (
	"time"
)

type QueueCounter struct {
	ID           uint       `gorm:"primarykey" json:"id"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	PolyclinicID uint       `gorm:"not null;uniqueIndex:idx_polyclinic_date" json:"polyclinic_id"`
	Date         time.Time  `gorm:"not null;uniqueIndex:idx_polyclinic_date" json:"date"`
	LastNumber   int        `gorm:"default:0" json:"last_number"`
	Polyclinic   Polyclinic `gorm:"foreignKey:PolyclinicID" json:"polyclinic,omitempty"`
}
