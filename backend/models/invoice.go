package models

import (
	"time"

	"gorm.io/gorm"
)

type Invoice struct {
	ID            uint           `gorm:"primarykey" json:"id"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	InvoiceNumber string         `gorm:"uniqueIndex;not null;size:20" json:"invoice_number"`
	VisitID       uint           `gorm:"uniqueIndex;not null" json:"visit_id"`
	PatientID     uint           `gorm:"not null;index" json:"patient_id"`
	InvoiceDate   time.Time      `json:"invoice_date"`
	SubTotal      float64        `gorm:"default:0" json:"sub_total"`
	Discount      float64        `gorm:"default:0" json:"discount"`
	DiscountType  string         `gorm:"size:20" json:"discount_type"`
	Tax           float64        `gorm:"default:0" json:"tax"`
	TotalAmount   float64        `gorm:"default:0" json:"total_amount"`
	Status        string         `gorm:"size:20;default:'belum_bayar'" json:"status"`
	Notes         string         `gorm:"type:text" json:"notes"`
	CreatedBy     uint           `gorm:"index" json:"created_by"`
	Visit         Visit          `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
	Patient       Patient        `gorm:"foreignKey:PatientID" json:"patient,omitempty"`
	Creator       User           `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	Items         []InvoiceItem  `gorm:"foreignKey:InvoiceID" json:"items,omitempty"`
	Payments      []Payment      `gorm:"foreignKey:InvoiceID" json:"payments,omitempty"`
}
