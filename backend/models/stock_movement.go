package models

import (
	"time"
)

type StockMovement struct {
	ID            uint       `gorm:"primarykey" json:"id"`
	CreatedAt     time.Time  `json:"created_at"`
	MedicineID    uint       `gorm:"not null;index" json:"medicine_id"`
	Type          string     `gorm:"size:20" json:"type"`
	Quantity      int        `json:"quantity"`
	PreviousStock int        `json:"previous_stock"`
	NewStock      int        `json:"new_stock"`
	ReferenceType string     `gorm:"size:30" json:"reference_type"`
	ReferenceID   uint       `json:"reference_id"`
	BatchNumber   string     `gorm:"size:50" json:"batch_number"`
	ExpiryDate    *time.Time `json:"expiry_date"`
	Notes         string     `gorm:"type:text" json:"notes"`
	CreatedBy     uint       `gorm:"index" json:"created_by"`
	Medicine      Medicine   `gorm:"foreignKey:MedicineID" json:"medicine,omitempty"`
	Creator       User       `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
}
