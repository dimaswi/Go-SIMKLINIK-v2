package models

import (
	"time"

	"gorm.io/gorm"
)

type DocumentSignatureRequest struct {
	ID                    uint           `gorm:"primarykey" json:"id"`
	CreatedAt             time.Time      `json:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at"`
	DeletedAt             gorm.DeletedAt `gorm:"index" json:"-"`
	VisitID               uint           `gorm:"not null;index" json:"visit_id"`
	DocumentKey           string         `gorm:"size:120;not null;uniqueIndex" json:"document_key"`
	DocumentType          string         `gorm:"size:40;not null;index" json:"document_type"`
	DocumentLabel         string         `gorm:"size:200;not null" json:"document_label"`
	SourceID              *uint          `gorm:"index" json:"source_id,omitempty"`
	MedicalRecordID       *uint          `gorm:"index" json:"medical_record_id,omitempty"`
	RequestedByUserID     uint           `gorm:"not null;index" json:"requested_by_user_id"`
	RequestedToUserID     uint           `gorm:"not null;index" json:"requested_to_user_id"`
	Status                string         `gorm:"size:20;not null;default:'pending';index" json:"status"`
	RequestedAt           time.Time      `gorm:"not null" json:"requested_at"`
	RespondedAt           *time.Time     `json:"responded_at,omitempty"`
	SignedAt              *time.Time     `json:"signed_at,omitempty"`
	Notes                 string         `gorm:"type:text" json:"notes"`
	RejectionReason       string         `gorm:"type:text" json:"rejection_reason"`
	SignatureNameSnapshot string         `gorm:"size:150" json:"signature_name_snapshot"`
	Visit                 Visit          `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
	RequestedByUser       User           `gorm:"foreignKey:RequestedByUserID" json:"requested_by_user,omitempty"`
	RequestedToUser       User           `gorm:"foreignKey:RequestedToUserID" json:"requested_to_user,omitempty"`
}
