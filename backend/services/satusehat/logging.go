package satusehat

import (
	"encoding/json"
	"log"
	"strings"

	"starter/backend/database"
	"starter/backend/models"
)

type ActivityLogEntry struct {
	Operation      string
	ResourceType   string
	Mode           string
	Method         string
	Endpoint       string
	StatusCode     int
	Success        bool
	ErrorMessage   string
	RequestPayload any
	ResponseBody   any
	ResourceID     string
	Location       string
}

func RecordActivityLog(entry ActivityLogEntry) {
	if database.DB == nil {
		return
	}

	record := models.SATUSEHATLog{
		Operation:      truncateLogValue(entry.Operation, 50),
		ResourceType:   truncateLogValue(entry.ResourceType, 100),
		Mode:           truncateLogValue(entry.Mode, 20),
		Method:         truncateLogValue(entry.Method, 20),
		Endpoint:       entry.Endpoint,
		StatusCode:     entry.StatusCode,
		Success:        entry.Success,
		ErrorMessage:   entry.ErrorMessage,
		RequestPayload: encodeLogPayload(entry.RequestPayload),
		ResponseBody:   encodeLogPayload(entry.ResponseBody),
		ResourceID:     truncateLogValue(entry.ResourceID, 120),
		Location:       entry.Location,
	}

	if err := database.DB.Create(&record).Error; err != nil {
		log.Printf("failed to persist SATUSEHAT log: %v", err)
	}
}

func encodeLogPayload(payload any) string {
	if payload == nil {
		return ""
	}
	switch value := payload.(type) {
	case string:
		return value
	case []byte:
		return string(value)
	default:
		encoded, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			return ""
		}
		return string(encoded)
	}
}

func truncateLogValue(value string, limit int) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= limit {
		return trimmed
	}
	return trimmed[:limit]
}
