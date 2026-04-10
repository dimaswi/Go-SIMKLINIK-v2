package models

import "time"

type RadiologyOrderParameterResult struct {
	ID                        uint                     `gorm:"primarykey" json:"id"`
	CreatedAt                 time.Time                `json:"created_at"`
	UpdatedAt                 time.Time                `json:"updated_at"`
	RadiologyOrderItemID      uint                     `gorm:"not null;index" json:"radiology_order_item_id"`
	MedicalServiceParameterID *uint                    `gorm:"index" json:"medical_service_parameter_id"`
	ParameterCodeSnapshot     string                   `gorm:"size:30" json:"parameter_code_snapshot"`
	ParameterNameSnapshot     string                   `gorm:"size:120" json:"parameter_name_snapshot"`
	InputTypeSnapshot         string                   `gorm:"size:20" json:"input_type_snapshot"`
	UnitSnapshot              string                   `gorm:"size:50" json:"unit_snapshot"`
	ReferenceValueSnapshot    string                   `gorm:"size:120" json:"reference_value_snapshot"`
	SortOrder                 int                      `gorm:"default:0" json:"sort_order"`
	IsRequired                bool                     `gorm:"default:true" json:"is_required"`
	ResultValue               string                   `gorm:"type:text" json:"result_value"`
	ResultNotes               string                   `gorm:"type:text" json:"result_notes"`
	Flag                      string                   `gorm:"size:20" json:"flag"`
	ResultDate                *time.Time               `json:"result_date"`
	ResultBy                  *uint                    `gorm:"index" json:"result_by"`
	SatusehatObservationID    string                   `gorm:"size:120;index" json:"satusehat_observation_id"`
	SatusehatSyncedAt         *time.Time               `json:"satusehat_synced_at"`
	RadiologyOrderItem        RadiologyOrderItem       `gorm:"foreignKey:RadiologyOrderItemID" json:"radiology_order_item,omitempty"`
	MedicalServiceParameter   *MedicalServiceParameter `gorm:"foreignKey:MedicalServiceParameterID" json:"medical_service_parameter,omitempty"`
	ResultByUser              *User                    `gorm:"foreignKey:ResultBy" json:"result_by_user,omitempty"`
}
