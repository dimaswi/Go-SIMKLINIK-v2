package models

import "time"

type SATUSEHATAutoSyncSnapshot struct {
	ID          uint      `gorm:"primarykey" json:"id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	VisitID     uint      `gorm:"uniqueIndex" json:"visit_id"`
	Trigger     string    `gorm:"size:40" json:"trigger"`
	Mode        string    `gorm:"size:20" json:"mode"`
	ExecutedAt  time.Time `json:"executed_at"`
	SentCount   int       `json:"sent_count"`
	UnsentCount int       `json:"unsent_count"`
	Payload     string    `gorm:"type:text" json:"payload"`
}
