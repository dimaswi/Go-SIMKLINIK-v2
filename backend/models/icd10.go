package models

import (
	"time"

	"gorm.io/gorm"
)

type ICD10 struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Code      string         `gorm:"uniqueIndex;not null;size:10" json:"code"`
	Name      string         `gorm:"not null;size:255" json:"name"`
	NameID    string         `gorm:"size:255" json:"name_id"`
	Category  string         `gorm:"size:100" json:"category"`
	Chapter   string         `gorm:"size:100" json:"chapter"`
}
