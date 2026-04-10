package models

import "time"

type RegistrationQueue struct {
	ID                  uint       `gorm:"primarykey" json:"id"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	QueueDate           time.Time  `gorm:"not null;index;uniqueIndex:idx_registration_queue_date_ticket,priority:1" json:"queue_date"`
	TicketNumber        int        `gorm:"not null;uniqueIndex:idx_registration_queue_date_ticket,priority:2" json:"ticket_number"`
	Status              string     `gorm:"size:20;default:'waiting';index" json:"status"`
	CalledAt            *time.Time `json:"called_at,omitempty"`
	ProcessingStartedAt *time.Time `json:"processing_started_at,omitempty"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	CancelledAt         *time.Time `json:"cancelled_at,omitempty"`
	VisitID             *uint      `gorm:"index" json:"visit_id,omitempty"`
	Visit               *Visit     `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
}
