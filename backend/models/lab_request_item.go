package models

import (
	"time"
)

type LabRequestItem struct {
	ID           uint       `gorm:"primarykey" json:"id"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	LabRequestID uint       `gorm:"not null;index" json:"lab_request_id"`
	LabTestID    uint       `gorm:"not null;index" json:"lab_test_id"`
	Result       string     `gorm:"size:100" json:"result"`
	Unit         string     `gorm:"size:50" json:"unit"`
	NormalValue  string     `gorm:"size:100" json:"normal_value"`
	Flag         string     `gorm:"size:20" json:"flag"`
	ResultDate   *time.Time `json:"result_date"`
	ResultBy     *uint      `json:"result_by"`
	LabRequest   LabRequest `gorm:"foreignKey:LabRequestID" json:"lab_request,omitempty"`
	LabTest      LabTest    `gorm:"foreignKey:LabTestID" json:"lab_test,omitempty"`
	ResultByUser *User      `gorm:"foreignKey:ResultBy" json:"result_by_user,omitempty"`
}
