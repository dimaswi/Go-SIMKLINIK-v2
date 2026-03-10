package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicineCategory struct {
	ID          uint           `gorm:"primarykey" json:"id"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
	Name        string         `gorm:"not null;size:100" json:"name"`
	Description string         `gorm:"size:255" json:"description"`
}
