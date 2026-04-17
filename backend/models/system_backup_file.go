package models

import (
	"time"

	"gorm.io/gorm"
)

type SystemBackupFile struct {
	ID                uint           `gorm:"primarykey" json:"id"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
	RunKey            string         `gorm:"size:64;index" json:"run_key"`
	BackupType        string         `gorm:"size:32;index" json:"backup_type"`
	TriggerSource     string         `gorm:"size:32;index" json:"trigger_source"`
	Status            string         `gorm:"size:32;index" json:"status"`
	FileName          string         `gorm:"size:255" json:"file_name"`
	RelativePath      string         `gorm:"size:512" json:"relative_path"`
	SizeBytes         int64          `json:"size_bytes"`
	ErrorMessage      string         `gorm:"type:text" json:"error_message"`
	TriggeredByUserID *uint          `json:"triggered_by_user_id"`
	TriggeredByUser   *User          `gorm:"foreignKey:TriggeredByUserID" json:"triggered_by_user,omitempty"`
	CompletedAt       *time.Time     `json:"completed_at"`
}
