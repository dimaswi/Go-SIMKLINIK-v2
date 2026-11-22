package models

import (
	"time"

	"gorm.io/gorm"
)

type PurchaseOrderPayment struct {
	ID              uint           `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
	PurchaseOrderID uint           `gorm:"not null;index" json:"purchase_order_id"`
	PaymentNumber   string         `gorm:"uniqueIndex;not null;size:30" json:"payment_number"`
	PaymentDate     time.Time      `json:"payment_date"`
	PaymentMethodID *uint          `gorm:"index" json:"payment_method_id"`
	Amount          float64        `gorm:"not null" json:"amount"`
	ReferenceNumber string         `gorm:"size:100" json:"reference_number"`
	Notes           string         `gorm:"type:text" json:"notes"`
	CreatedBy       uint           `gorm:"index" json:"created_by"`
	PaymentMethod   *PaymentMethod `gorm:"foreignKey:PaymentMethodID" json:"payment_method,omitempty"`
	Creator         User           `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
}
