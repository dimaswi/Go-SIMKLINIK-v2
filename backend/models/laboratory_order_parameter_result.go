package models

import "time"

type LaboratoryOrderParameterResult struct {
	ID                        uint                     `gorm:"primarykey" json:"id"`
	CreatedAt                 time.Time                `json:"created_at"`
	UpdatedAt                 time.Time                `json:"updated_at"`
	LaboratoryOrderItemID     uint                     `gorm:"not null;index" json:"laboratory_order_item_id"`
	MedicalServiceParameterID *uint                    `gorm:"column:lab_test_parameter_id;index" json:"medical_service_parameter_id"`
	ParameterCodeSnapshot     string                   `gorm:"size:30" json:"parameter_code_snapshot"`
	ParameterNameSnapshot     string                   `gorm:"size:120" json:"parameter_name_snapshot"`
	InputTypeSnapshot         string                   `gorm:"size:20" json:"input_type_snapshot"`
	UnitSnapshot              string                   `gorm:"size:50" json:"unit_snapshot"`
	NormalValueSnapshot       string                   `gorm:"size:120" json:"normal_value_snapshot"`
	SortOrder                 int                      `gorm:"default:0" json:"sort_order"`
	IsRequired                bool                     `gorm:"default:true" json:"is_required"`
	ResultValue               string                   `gorm:"size:120" json:"result_value"`
	ResultNotes               string                   `gorm:"type:text" json:"result_notes"`
	Flag                      string                   `gorm:"size:20" json:"flag"`
	ResultDate                *time.Time               `json:"result_date"`
	ResultBy                  *uint                    `gorm:"index" json:"result_by"`
	SatusehatObservationID    string                   `gorm:"size:120;index" json:"satusehat_observation_id"`
	SatusehatSyncedAt         *time.Time               `json:"satusehat_synced_at"`
	LaboratoryOrderItem       LaboratoryOrderItem      `gorm:"foreignKey:LaboratoryOrderItemID" json:"laboratory_order_item,omitempty"`
	MedicalServiceParameter   *MedicalServiceParameter `gorm:"foreignKey:MedicalServiceParameterID" json:"medical_service_parameter,omitempty"`
	ResultByUser              *User                    `gorm:"foreignKey:ResultBy" json:"result_by_user,omitempty"`
}
