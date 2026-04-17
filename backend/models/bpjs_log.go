package models

import "time"

type BPJSLog struct {
	ID             uint      `gorm:"primarykey" json:"id"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	Domain         string    `gorm:"size:30;index" json:"domain"`
	Direction      string    `gorm:"size:20;index" json:"direction"`
	Operation      string    `gorm:"size:80;index" json:"operation"`
	Method         string    `gorm:"size:20" json:"method"`
	Endpoint       string    `gorm:"type:text" json:"endpoint"`
	StatusCode     int       `json:"status_code"`
	Success        bool      `gorm:"index" json:"success"`
	ErrorMessage   string    `gorm:"type:text" json:"error_message"`
	RequestPayload string    `gorm:"type:text" json:"request_payload"`
	ResponseBody   string    `gorm:"type:text" json:"response_body"`
}
