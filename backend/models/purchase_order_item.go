package models

import (
	"time"
)

type PurchaseOrderItem struct {
	ID               uint          `gorm:"primarykey" json:"id"`
	CreatedAt        time.Time     `json:"created_at"`
	UpdatedAt        time.Time     `json:"updated_at"`
	PurchaseOrderID  uint          `gorm:"not null;index" json:"purchase_order_id"`
	MedicineID       uint          `gorm:"not null;index" json:"medicine_id"`
	Quantity         int           `json:"quantity"`
	ReceivedQuantity int           `gorm:"default:0" json:"received_quantity"`
	UnitPrice        float64       `json:"unit_price"`
	TotalPrice       float64       `json:"total_price"`
	BatchNumber      string        `gorm:"size:50" json:"batch_number"`
	ExpiryDate       *time.Time    `json:"expiry_date"`
	PurchaseOrder    PurchaseOrder `gorm:"foreignKey:PurchaseOrderID" json:"purchase_order,omitempty"`
	Medicine         Medicine      `gorm:"foreignKey:MedicineID" json:"medicine,omitempty"`
}
