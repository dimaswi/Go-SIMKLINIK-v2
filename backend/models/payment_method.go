package models

import (
	"time"

	"gorm.io/gorm"
)

type PaymentMethod struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Name      string         `gorm:"not null;size:50" json:"name"`
	IsActive  bool           `gorm:"default:true" json:"is_active"`
}
