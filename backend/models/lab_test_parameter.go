package models

import (
	"time"

	"gorm.io/gorm"
)

type LabTestParameter struct {
	ID                uint           `gorm:"primarykey" json:"id"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
	LabTestID         uint           `gorm:"not null;index" json:"lab_test_id"`
	Code              string         `gorm:"size:30" json:"code"`
	Name              string         `gorm:"not null;size:120" json:"name"`
	Unit              string         `gorm:"size:50" json:"unit"`
	NormalValueMale   string         `gorm:"size:120" json:"normal_value_male"`
	NormalValueFemale string         `gorm:"size:120" json:"normal_value_female"`
	SortOrder         int            `gorm:"default:0" json:"sort_order"`
	IsRequired        bool           `gorm:"default:true" json:"is_required"`
	LabTest           LabTest        `gorm:"foreignKey:LabTestID" json:"lab_test,omitempty"`
}
