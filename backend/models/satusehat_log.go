package models

import "time"

type SATUSEHATLog struct {
	ID             uint      `gorm:"primarykey" json:"id"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	Operation      string    `gorm:"size:50;index" json:"operation"`
	ResourceType   string    `gorm:"size:100;index" json:"resource_type"`
	Mode           string    `gorm:"size:20;index" json:"mode"`
	Method         string    `gorm:"size:20" json:"method"`
	Endpoint       string    `gorm:"type:text" json:"endpoint"`
	StatusCode     int       `json:"status_code"`
	Success        bool      `gorm:"index" json:"success"`
	ErrorMessage   string    `gorm:"type:text" json:"error_message"`
	RequestPayload string    `gorm:"type:text" json:"request_payload"`
	ResponseBody   string    `gorm:"type:text" json:"response_body"`
	ResourceID     string    `gorm:"size:120;index" json:"resource_id"`
	Location       string    `gorm:"type:text" json:"location"`
}
