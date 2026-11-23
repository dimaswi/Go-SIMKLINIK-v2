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
	PONumber          string              `gorm:"uniqueIndex;not null;size:20" json:"po_number"`
	SupplierID        uint                `gorm:"not null;index" json:"supplier_id"`
	DestinationRoomID *uint               `gorm:"index" json:"destination_room_id"`
	OrderDate         time.Time           `json:"order_date"`
	ReceivedDate      *time.Time          `json:"received_date"`
	Status            string              `gorm:"size:20;default:'draft'" json:"status"`
	Subtotal          float64             `gorm:"default:0" json:"subtotal"`
	DiscountPercent   float64             `gorm:"default:0" json:"discount_percent"`
	DiscountAmount    float64             `gorm:"default:0" json:"discount_amount"`
	IncludePPN        bool                `gorm:"default:true" json:"include_ppn"`
	PPNPercent        float64             `gorm:"default:11" json:"ppn_percent"`
	PPNAmount         float64                `gorm:"default:0" json:"ppn_amount"`
	TotalAmount       float64                `gorm:"default:0" json:"total_amount"`
	PaymentStatus     string                 `gorm:"size:20;default:'unpaid'" json:"payment_status"`
	PaidAmount        float64                `gorm:"default:0" json:"paid_amount"`
	Notes             string                 `gorm:"type:text" json:"notes"`
	CreatedBy         uint                   `gorm:"index" json:"created_by"`
	Supplier          Supplier               `gorm:"foreignKey:SupplierID" json:"supplier,omitempty"`
	DestinationRoom   *Polyclinic            `gorm:"foreignKey:DestinationRoomID" json:"destination_room,omitempty"`
	Creator           User                   `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	Items             []PurchaseOrderItem    `gorm:"foreignKey:PurchaseOrderID" json:"items,omitempty"`
	Payments          []PurchaseOrderPayment `gorm:"foreignKey:PurchaseOrderID" json:"payments,omitempty"`
}
