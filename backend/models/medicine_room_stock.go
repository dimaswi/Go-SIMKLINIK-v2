package models

import (
	"time"
)

type MedicineRoomStock struct {
	ID         uint         `gorm:"primarykey" json:"id"`
	CreatedAt  time.Time    `json:"created_at"`
	UpdatedAt  time.Time    `json:"updated_at"`
	MedicineID uint         `gorm:"not null;uniqueIndex:idx_medicine_room" json:"medicine_id"`
	RoomID     uint         `gorm:"not null;uniqueIndex:idx_medicine_room" json:"room_id"`
	Quantity   int          `gorm:"not null;default:0" json:"quantity"`
	MinStock   int          `gorm:"default:0" json:"min_stock"`
	Medicine   Medicine   `gorm:"foreignKey:MedicineID" json:"medicine,omitempty"`
	Room       Polyclinic `gorm:"foreignKey:RoomID" json:"room,omitempty"`
}
