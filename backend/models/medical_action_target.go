package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

type MedicalActionTarget struct {
	ID              uint           `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
	MedicalActionID uint           `gorm:"not null;index" json:"medical_action_id"`
	TargetType      string         `gorm:"size:20;not null" json:"target_type"`
	Arch            string         `gorm:"size:20" json:"arch"`
	Quadrant        string         `gorm:"size:20" json:"quadrant"`
	ToothNumber     string         `gorm:"size:10;index" json:"tooth_number"`
	SurfaceCodesRaw string         `gorm:"column:surface_codes;type:text" json:"-"`
	SurfaceCodes    []string       `gorm:"-" json:"surface_codes,omitempty"`
	Notes           string         `gorm:"type:text" json:"notes"`
	MedicalAction   MedicalAction  `gorm:"foreignKey:MedicalActionID" json:"-"`
}

func (target *MedicalActionTarget) BeforeSave(_ *gorm.DB) error {
	if len(target.SurfaceCodes) == 0 {
		target.SurfaceCodesRaw = ""
		return nil
	}

	payload, err := json.Marshal(target.SurfaceCodes)
	if err != nil {
		return err
	}

	target.SurfaceCodesRaw = string(payload)
	return nil
}

func (target *MedicalActionTarget) AfterFind(_ *gorm.DB) error {
	if target.SurfaceCodesRaw == "" {
		target.SurfaceCodes = nil
		return nil
	}

	var surfaceCodes []string
	if err := json.Unmarshal([]byte(target.SurfaceCodesRaw), &surfaceCodes); err != nil {
		return err
	}

	target.SurfaceCodes = surfaceCodes
	return nil
}
