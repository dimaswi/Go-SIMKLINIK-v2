package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalActionParameterValue struct {
	ID                        uint                     `gorm:"primarykey" json:"id"`
	CreatedAt                 time.Time                `json:"created_at"`
	UpdatedAt                 time.Time                `json:"updated_at"`
	DeletedAt                 gorm.DeletedAt           `gorm:"index" json:"-"`
	MedicalActionID           uint                     `gorm:"not null;index" json:"medical_action_id"`
	MedicalServiceParameterID *uint                    `gorm:"index" json:"medical_service_parameter_id,omitempty"`
	ParameterCodeSnapshot     string                   `gorm:"size:30" json:"parameter_code_snapshot"`
	ParameterNameSnapshot     string                   `gorm:"size:120" json:"parameter_name_snapshot"`
	InputTypeSnapshot         string                   `gorm:"size:20;default:'text'" json:"input_type_snapshot"`
	UnitSnapshot              string                   `gorm:"size:50" json:"unit_snapshot"`
	SortOrder                 int                      `gorm:"default:0" json:"sort_order"`
	IsRequired                bool                     `gorm:"default:true" json:"is_required"`
	ResultValue               string                   `gorm:"type:text" json:"result_value"`
	ResultNotes               string                   `gorm:"type:text" json:"result_notes"`
	MedicalAction             MedicalAction            `gorm:"foreignKey:MedicalActionID" json:"-"`
	MedicalServiceParameter   *MedicalServiceParameter `gorm:"foreignKey:MedicalServiceParameterID" json:"medical_service_parameter,omitempty"`
}
