package models

import "time"

type RegistrationCounter struct {
	ID         uint      `gorm:"primarykey" json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	Date       time.Time `gorm:"not null;uniqueIndex:idx_registration_counter_date" json:"date"`
	LastNumber int       `gorm:"default:0" json:"last_number"`
}
