package models

import (
	"time"
)

type Payment struct {
	ID              uint          `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
	InvoiceID       uint          `gorm:"not null;index" json:"invoice_id"`
	PaymentMethodID uint          `gorm:"not null;index" json:"payment_method_id"`
	Amount          float64       `json:"amount"`
	PaymentDate     time.Time     `json:"payment_date"`
	ReferenceNumber string        `gorm:"size:100" json:"reference_number"`
	ReceivedBy      uint          `gorm:"index" json:"received_by"`
	Notes           string        `gorm:"type:text" json:"notes"`
	Invoice         Invoice       `gorm:"foreignKey:InvoiceID" json:"invoice,omitempty"`
	PaymentMethod   PaymentMethod `gorm:"foreignKey:PaymentMethodID" json:"payment_method,omitempty"`
	Receiver        User          `gorm:"foreignKey:ReceivedBy" json:"receiver,omitempty"`
}
