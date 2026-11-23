package models

import (
	"time"

	"gorm.io/gorm"
)

type StockRequest struct {
	ID              uint               `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time          `json:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at"`
	DeletedAt       gorm.DeletedAt     `gorm:"index" json:"-"`
	RequestNumber   string             `gorm:"uniqueIndex;not null;size:30" json:"request_number"`
	FromRoomID      uint               `gorm:"not null;index" json:"from_room_id"`
	ToRoomID        uint               `gorm:"not null;index" json:"to_room_id"`
	RequestDate     time.Time          `json:"request_date"`
	Status          string             `gorm:"size:20;default:'pending';index" json:"status"` // pending, approved, rejected, cancelled
	Notes           string             `gorm:"type:text" json:"notes"`
	RejectionReason string             `gorm:"type:text" json:"rejection_reason"`
	RequestedBy     uint               `gorm:"index" json:"requested_by"`
	ApprovedBy      *uint              `gorm:"index" json:"approved_by"`
	ApprovedAt      *time.Time         `json:"approved_at"`
	FromRoom        Polyclinic         `gorm:"foreignKey:FromRoomID" json:"from_room,omitempty"`
	ToRoom          Polyclinic         `gorm:"foreignKey:ToRoomID" json:"to_room,omitempty"`
	Requester       User               `gorm:"foreignKey:RequestedBy" json:"requester,omitempty"`
	Approver        *User              `gorm:"foreignKey:ApprovedBy" json:"approver,omitempty"`
	Items           []StockRequestItem `gorm:"foreignKey:StockRequestID" json:"items,omitempty"`
}

type StockRequestItem struct {
	ID                uint      `gorm:"primarykey" json:"id"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
	StockRequestID    uint      `gorm:"not null;index" json:"stock_request_id"`
	MedicineID        uint      `gorm:"not null;index" json:"medicine_id"`
	RequestedQuantity int       `gorm:"not null" json:"requested_quantity"`
	ApprovedQuantity  int       `gorm:"default:0" json:"approved_quantity"`
	UnitMode          string    `gorm:"size:20;default:'small'" json:"unit_mode"`
	ConversionFactor  int       `gorm:"default:1" json:"conversion_factor"`
	Notes             string    `gorm:"size:255" json:"notes"`
	Medicine          Medicine  `gorm:"foreignKey:MedicineID" json:"medicine,omitempty"`
}
