package models

import "time"

type LaboratoryOrderItem struct {
	ID                          uint                             `gorm:"primarykey" json:"id"`
	CreatedAt                   time.Time                        `json:"created_at"`
	UpdatedAt                   time.Time                        `json:"updated_at"`
	MedicalRecordID             uint                             `gorm:"not null;index" json:"medical_record_id"`
	MedicalServiceID            uint                             `gorm:"column:lab_test_id;not null;index" json:"medical_service_id"`
	TestCodeSnapshot            string                           `gorm:"size:30" json:"test_code_snapshot"`
	TestNameSnapshot            string                           `gorm:"size:200" json:"test_name_snapshot"`
	Instructions                string                           `gorm:"type:text" json:"instructions"`
	UnitSnapshot                string                           `gorm:"size:50" json:"unit_snapshot"`
	NormalValueSnapshot         string                           `gorm:"size:100" json:"normal_value_snapshot"`
	ResultValue                 string                           `gorm:"size:120" json:"result_value"`
	ResultNotes                 string                           `gorm:"type:text" json:"result_notes"`
	Flag                        string                           `gorm:"size:20" json:"flag"`
	ResultDate                  *time.Time                       `json:"result_date"`
	ResultBy                    *uint                            `gorm:"index" json:"result_by"`
	SatusehatServiceRequestID   string                           `gorm:"size:120;index" json:"satusehat_service_request_id"`
	SatusehatObservationID      string                           `gorm:"size:120;index" json:"satusehat_observation_id"`
	SatusehatDiagnosticReportID string                           `gorm:"size:120;index" json:"satusehat_diagnostic_report_id"`
	SatusehatSyncedAt           *time.Time                       `json:"satusehat_synced_at"`
	MedicalRecord               MedicalRecord                    `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	MedicalService              MedicalService                   `gorm:"foreignKey:MedicalServiceID" json:"medical_service,omitempty"`
	Specimen                    *LaboratoryOrderSpecimen         `gorm:"foreignKey:LaboratoryOrderItemID" json:"specimen,omitempty"`
	ParameterResults            []LaboratoryOrderParameterResult `gorm:"foreignKey:LaboratoryOrderItemID" json:"parameter_results,omitempty"`
	ResultByUser                *User                            `gorm:"foreignKey:ResultBy" json:"result_by_user,omitempty"`
}
