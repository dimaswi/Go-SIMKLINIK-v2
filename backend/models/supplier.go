package models

import (
	"time"

	"gorm.io/gorm"
)

type Supplier struct {
	ID            uint           `gorm:"primarykey" json:"id"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	Name          string         `gorm:"not null;size:200" json:"name"`
	ContactPerson string         `gorm:"size:100" json:"contact_person"`
	Phone         string         `gorm:"size:20" json:"phone"`
	Email         string         `gorm:"size:150" json:"email"`
	Address       string         `gorm:"type:text" json:"address"`
	IsActive      bool           `gorm:"default:true" json:"is_active"`
}
