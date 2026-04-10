package models

import (
	"time"

	"gorm.io/gorm"
)

type MedicalAction struct {
	ID                             uint                          `gorm:"primarykey" json:"id"`
	CreatedAt                      time.Time                     `json:"created_at"`
	UpdatedAt                      time.Time                     `json:"updated_at"`
	DeletedAt                      gorm.DeletedAt                `gorm:"index" json:"-"`
	MedicalRecordID                uint                          `gorm:"not null;index" json:"medical_record_id"`
	MedicalServiceID               uint                          `gorm:"not null;index" json:"medical_service_id"`
	DoctorID                       uint                          `gorm:"not null;index" json:"doctor_id"`
	ServiceCodeSnapshot            string                        `gorm:"size:30" json:"service_code_snapshot"`
	ServiceNameSnapshot            string                        `gorm:"size:200" json:"service_name_snapshot"`
	ServiceDomainSnapshot          string                        `gorm:"size:20" json:"service_domain_snapshot"`
	TargetScopeSnapshot            string                        `gorm:"size:20" json:"target_scope_snapshot"`
	RequiresConsentSnapshot        bool                          `gorm:"default:false" json:"requires_consent_snapshot"`
	SupportsOdontogramSyncSnapshot bool                          `gorm:"default:false" json:"supports_odontogram_sync_snapshot"`
	Notes                          string                        `gorm:"type:text" json:"notes"`
	Quantity                       int                           `gorm:"default:1" json:"quantity"`
	Price                          float64                       `json:"price"`
	SatusehatProcedureID           string                        `gorm:"size:120;index" json:"satusehat_procedure_id"`
	SatusehatSyncedAt              *time.Time                    `json:"satusehat_synced_at"`
	MedicalRecord                  MedicalRecord                 `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	MedicalService                 MedicalService                `gorm:"foreignKey:MedicalServiceID" json:"medical_service,omitempty"`
	Doctor                         Doctor                        `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
	ParameterValues                []MedicalActionParameterValue `gorm:"foreignKey:MedicalActionID" json:"parameter_values,omitempty"`
	Targets                        []MedicalActionTarget         `gorm:"foreignKey:MedicalActionID" json:"targets,omitempty"`
}
