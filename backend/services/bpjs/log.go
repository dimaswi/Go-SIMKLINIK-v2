package bpjs

import (
	"encoding/json"
	"fmt"
	"strings"

	"starter/backend/database"
	"starter/backend/models"
)

const (
	DomainAntrean = "antrean"
	DomainPCare   = "pcare"

	DirectionInbound  = "inbound"
	DirectionOutbound = "outbound"
	DirectionSystem   = "system"
)

type ActivityLogEntry struct {
	Domain         string
	Direction      string
	Operation      string
	Method         string
	Endpoint       string
	StatusCode     int
	Success        bool
	ErrorMessage   string
	RequestPayload any
	ResponseBody   any
}

func RecordActivityLog(entry ActivityLogEntry) {
	if database.DB == nil {
		return
	}

	logEntry := models.BPJSLog{
		Domain:         strings.TrimSpace(entry.Domain),
		Direction:      strings.TrimSpace(entry.Direction),
		Operation:      strings.TrimSpace(entry.Operation),
		Method:         strings.TrimSpace(entry.Method),
		Endpoint:       strings.TrimSpace(entry.Endpoint),
		StatusCode:     entry.StatusCode,
		Success:        entry.Success,
		ErrorMessage:   strings.TrimSpace(entry.ErrorMessage),
		RequestPayload: marshalLogValue(entry.RequestPayload),
		ResponseBody:   marshalLogValue(entry.ResponseBody),
	}

	_ = database.DB.Create(&logEntry).Error
}

func marshalLogValue(value any) string {
	if value == nil {
		return ""
	}

	if text, ok := value.(string); ok {
		trimmed := strings.TrimSpace(text)
		if trimmed == "" {
			return ""
		}
		var compact any
		if err := json.Unmarshal([]byte(trimmed), &compact); err == nil {
			bytes, marshalErr := json.MarshalIndent(compact, "", "  ")
			if marshalErr == nil {
				return string(bytes)
			}
		}
		return trimmed
	}

	bytes, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return strings.TrimSpace(fmt.Sprintf("%v", value))
	}

	return string(bytes)
}
