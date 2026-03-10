package models

import (
	"time"

	"gorm.io/gorm"
)

type PurchaseOrder struct {
	ID           uint                `gorm:"primarykey" json:"id"`
	CreatedAt    time.Time           `json:"created_at"`
	UpdatedAt    time.Time           `json:"updated_at"`
	DeletedAt    gorm.DeletedAt      `gorm:"index" json:"-"`
	PONumber     string              `gorm:"uniqueIndex;not null;size:20" json:"po_number"`
	SupplierID   uint                `gorm:"not null;index" json:"supplier_id"`
	OrderDate    time.Time           `json:"order_date"`
	ReceivedDate *time.Time          `json:"received_date"`
	Status       string              `gorm:"size:20;default:'draft'" json:"status"`
	TotalAmount  float64             `gorm:"default:0" json:"total_amount"`
	Notes        string              `gorm:"type:text" json:"notes"`
	CreatedBy    uint                `gorm:"index" json:"created_by"`
	Supplier     Supplier            `gorm:"foreignKey:SupplierID" json:"supplier,omitempty"`
	Creator      User                `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	Items        []PurchaseOrderItem `gorm:"foreignKey:PurchaseOrderID" json:"items,omitempty"`
}
