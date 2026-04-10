package models

import (
	"time"

	"gorm.io/gorm"
)

type VisitFinalizationLog struct {
	ID                uint           `gorm:"primarykey" json:"id"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
	VisitID           uint           `gorm:"not null;index" json:"visit_id"`
	Action            string         `gorm:"size:30;not null;index" json:"action"`
	ActorUserID       *uint          `gorm:"index" json:"actor_user_id,omitempty"`
	ActorEmail        string         `gorm:"size:150;index" json:"actor_email"`
	ActorName         string         `gorm:"size:100" json:"actor_name"`
	VisitStatusBefore string         `gorm:"size:20" json:"visit_status_before"`
	VisitStatusAfter  string         `gorm:"size:20" json:"visit_status_after"`
	QueueStatusBefore string         `gorm:"size:20" json:"queue_status_before"`
	QueueStatusAfter  string         `gorm:"size:20" json:"queue_status_after"`
	Notes             string         `gorm:"type:text" json:"notes"`
	Visit             Visit          `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
	ActorUser         *User          `gorm:"foreignKey:ActorUserID" json:"actor_user,omitempty"`
}
