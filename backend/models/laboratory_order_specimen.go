package models

import "time"

type LaboratoryOrderSpecimen struct {
	ID                      uint                `gorm:"primarykey" json:"id"`
	CreatedAt               time.Time           `json:"created_at"`
	UpdatedAt               time.Time           `json:"updated_at"`
	LaboratoryOrderItemID   uint                `gorm:"not null;uniqueIndex" json:"laboratory_order_item_id"`
	SpecimenTemplateID      *uint               `gorm:"index" json:"specimen_template_id"`
	TemplateCodeSnapshot    string              `gorm:"size:40" json:"template_code_snapshot"`
	TemplateNameSnapshot    string              `gorm:"size:160" json:"template_name_snapshot"`
	TypeSystem              string              `gorm:"size:120" json:"type_system"`
	TypeCode                string              `gorm:"size:80" json:"type_code"`
	TypeDisplay             string              `gorm:"size:160" json:"type_display"`
	CollectionMethodSystem  string              `gorm:"size:120" json:"collection_method_system"`
	CollectionMethodCode    string              `gorm:"size:80" json:"collection_method_code"`
	CollectionMethodDisplay string              `gorm:"size:160" json:"collection_method_display"`
	CollectedAt             *time.Time          `json:"collected_at"`
	ReceivedAt              *time.Time          `json:"received_at"`
	CollectorOrganizationID string              `gorm:"size:120" json:"collector_organization_id"`
	Notes                   string              `gorm:"size:255" json:"notes"`
	SatusehatSpecimenID     string              `gorm:"size:120;index" json:"satusehat_specimen_id"`
	SatusehatSyncedAt       *time.Time          `json:"satusehat_synced_at"`
	LaboratoryOrderItem     LaboratoryOrderItem `gorm:"foreignKey:LaboratoryOrderItemID" json:"laboratory_order_item,omitempty"`
	SpecimenTemplate        *SpecimenTemplate   `gorm:"foreignKey:SpecimenTemplateID" json:"specimen_template,omitempty"`
}
