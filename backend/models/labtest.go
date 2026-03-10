package models

import (
	"time"

	"gorm.io/gorm"
)

type LabTest struct {
	ID                uint            `gorm:"primarykey" json:"id"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
	DeletedAt         gorm.DeletedAt  `gorm:"index" json:"-"`
	Code              string          `gorm:"size:20" json:"code"`
	Name              string          `gorm:"not null;size:200" json:"name"`
	CategoryID        uint            `gorm:"not null;index" json:"category_id"`
	Unit              string          `gorm:"size:50" json:"unit"`
	NormalValueMale   string          `gorm:"size:100" json:"normal_value_male"`
	NormalValueFemale string          `gorm:"size:100" json:"normal_value_female"`
	Price             float64         `gorm:"default:0" json:"price"`
	IsActive          bool            `gorm:"default:true" json:"is_active"`
	SortOrder         int             `gorm:"default:0" json:"sort_order"`
	Category          LabTestCategory `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
}
