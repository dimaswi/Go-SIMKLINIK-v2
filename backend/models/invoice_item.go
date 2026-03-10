package models

import (
	"time"
)

type InvoiceItem struct {
	ID          uint      `gorm:"primarykey" json:"id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	InvoiceID   uint      `gorm:"not null;index" json:"invoice_id"`
	ItemType    string    `gorm:"size:20" json:"item_type"`
	ReferenceID uint      `json:"reference_id"`
	Description string    `gorm:"size:255" json:"description"`
	Quantity    int       `json:"quantity"`
	UnitPrice   float64   `json:"unit_price"`
	Discount    float64   `gorm:"default:0" json:"discount"`
	TotalPrice  float64   `json:"total_price"`
	Invoice     Invoice   `gorm:"foreignKey:InvoiceID" json:"invoice,omitempty"`
}
