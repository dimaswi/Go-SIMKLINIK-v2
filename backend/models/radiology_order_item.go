package models

import "time"

type RadiologyOrderItem struct {
	ID                          uint                            `gorm:"primarykey" json:"id"`
	CreatedAt                   time.Time                       `json:"created_at"`
	UpdatedAt                   time.Time                       `json:"updated_at"`
	MedicalRecordID             uint                            `gorm:"not null;index" json:"medical_record_id"`
	MedicalServiceID            uint                            `gorm:"not null;index" json:"medical_service_id"`
	ServiceCodeSnapshot         string                          `gorm:"size:30" json:"service_code_snapshot"`
	ServiceNameSnapshot         string                          `gorm:"size:200" json:"service_name_snapshot"`
	TemplateSnapshot            string                          `gorm:"type:text" json:"template_snapshot"`
	Instructions                string                          `gorm:"type:text" json:"instructions"`
	Findings                    string                          `gorm:"type:text" json:"findings"`
	Impression                  string                          `gorm:"type:text" json:"impression"`
	Recommendation              string                          `gorm:"type:text" json:"recommendation"`
	ResultNotes                 string                          `gorm:"type:text" json:"result_notes"`
	ResultDate                  *time.Time                      `json:"result_date"`
	ResultBy                    *uint                           `gorm:"index" json:"result_by"`
	SatusehatServiceRequestID   string                          `gorm:"size:120;index" json:"satusehat_service_request_id"`
	SatusehatDiagnosticReportID string                          `gorm:"size:120;index" json:"satusehat_diagnostic_report_id"`
	SatusehatSyncedAt           *time.Time                      `json:"satusehat_synced_at"`
	MedicalRecord               MedicalRecord                   `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	MedicalService              MedicalService                  `gorm:"foreignKey:MedicalServiceID" json:"medical_service,omitempty"`
	ParameterResults            []RadiologyOrderParameterResult `gorm:"foreignKey:RadiologyOrderItemID" json:"parameter_results,omitempty"`
	ResultByUser                *User                           `gorm:"foreignKey:ResultBy" json:"result_by_user,omitempty"`
}
