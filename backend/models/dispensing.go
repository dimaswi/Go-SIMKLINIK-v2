package models

import (
	"time"
)

type Dispensing struct {
	ID             uint         `gorm:"primarykey" json:"id"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
	VisitID        uint         `gorm:"not null;index" json:"visit_id"`
	PrescriptionID uint         `gorm:"not null;index" json:"prescription_id"`
	MedicineID     uint         `gorm:"not null;index" json:"medicine_id"`
	Quantity       int          `json:"quantity"`
	BatchNumber    string       `gorm:"size:50" json:"batch_number"`
	DispensedBy    uint         `gorm:"index" json:"dispensed_by"`
	DispensedAt    *time.Time   `json:"dispensed_at"`
	Status         string       `gorm:"size:20;default:'pending'" json:"status"`
	Notes          string       `gorm:"type:text" json:"notes"`
	Visit          Visit        `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
	Prescription   Prescription `gorm:"foreignKey:PrescriptionID" json:"prescription,omitempty"`
	Medicine       Medicine     `gorm:"foreignKey:MedicineID" json:"medicine,omitempty"`
	Dispenser      User         `gorm:"foreignKey:DispensedBy" json:"dispenser,omitempty"`
}
