package models

import "time"

type QueueCall struct {
	ID              uint      `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time `json:"created_at"`
	QueueNumber     int       `gorm:"not null;index" json:"queue_number"`
	PatientName     string    `gorm:"size:150" json:"patient_name"`
	UnitType        string    `gorm:"size:30;index" json:"unit_type"` // pendaftaran, kasir, poliklinik, farmasi, laboratorium, radiologi, ruangan
	DestinationName string    `gorm:"size:120" json:"destination_name"`
	CalledBy        uint      `gorm:"index" json:"called_by"`
}
