package bpjs

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type ConnectionTestResult struct {
	Domain      string    `json:"domain"`
	Label       string    `json:"label"`
	Endpoint    string    `json:"endpoint"`
	Ready       bool      `json:"ready"`
	Reachable   bool      `json:"reachable"`
	StatusCode  int       `json:"status_code"`
	Message     string    `json:"message"`
	CheckedAt   time.Time `json:"checked_at"`
	CheckedMode string    `json:"checked_mode"`
	Host        string    `json:"host"`
	Note        string    `json:"note"`
	Response    string    `json:"response_preview,omitempty"`
}

func TestConnection(ctx context.Context, config Config) (ConnectionTestResult, error) {
	result := ConnectionTestResult{
		Domain:      config.Domain,
		Label:       config.Label,
		Endpoint:    strings.TrimSpace(config.BaseURL),
		Ready:       config.Enabled && len(config.MissingRequiredFields()) == 0,
		CheckedAt:   time.Now(),
		CheckedMode: "preflight",
		Note:        "Preflight hanya memverifikasi reachability endpoint dasar dan kredensial terisi, belum mengeksekusi endpoint bisnis BPJS.",
	}

	missing := config.MissingRequiredFields()
	if len(missing) > 0 {
		err := fmt.Errorf("konfigurasi %s belum lengkap: %s", config.Label, strings.Join(missing, ", "))
		RecordActivityLog(ActivityLogEntry{
			Domain:       config.Domain,
			Direction:    DirectionSystem,
			Operation:    "test-connection",
			Method:       http.MethodGet,
			Endpoint:     config.BaseURL,
			StatusCode:   http.StatusBadRequest,
			Success:      false,
			ErrorMessage: err.Error(),
			RequestPayload: map[string]any{
				"cons_id_configured":    strings.TrimSpace(config.ConsID) != "",
				"secret_key_configured": strings.TrimSpace(config.SecretKey) != "",
				"user_key_configured":   strings.TrimSpace(config.UserKey) != "",
				"base_url":              strings.TrimSpace(config.BaseURL),
			},
		})
		return result, err
	}

	parsedURL, err := url.Parse(strings.TrimSpace(config.BaseURL))
	if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		wrappedErr := fmt.Errorf("base URL %s tidak valid", config.Label)
		RecordActivityLog(ActivityLogEntry{
			Domain:       config.Domain,
			Direction:    DirectionSystem,
			Operation:    "test-connection",
			Method:       http.MethodGet,
			Endpoint:     config.BaseURL,
			StatusCode:   http.StatusBadRequest,
			Success:      false,
			ErrorMessage: wrappedErr.Error(),
		})
		return result, wrappedErr
	}
	result.Host = parsedURL.Host

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		wrappedErr := fmt.Errorf("gagal membuat request test %s: %w", config.Label, err)
		RecordActivityLog(ActivityLogEntry{
			Domain:       config.Domain,
			Direction:    DirectionSystem,
			Operation:    "test-connection",
			Method:       http.MethodGet,
			Endpoint:     parsedURL.String(),
			StatusCode:   http.StatusInternalServerError,
			Success:      false,
			ErrorMessage: wrappedErr.Error(),
		})
		return result, wrappedErr
	}

	signature, timestamp := GenerateSignature(config.ConsID, config.SecretKey)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("x-cons-id", config.ConsID)
	request.Header.Set("x-timestamp", timestamp)
	request.Header.Set("x-signature", signature)
	request.Header.Set("user_key", config.UserKey)

	client := &http.Client{Timeout: 12 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		wrappedErr := fmt.Errorf("gagal menjangkau endpoint %s: %w", config.Label, err)
		RecordActivityLog(ActivityLogEntry{
			Domain:       config.Domain,
			Direction:    DirectionSystem,
			Operation:    "test-connection",
			Method:       http.MethodGet,
			Endpoint:     parsedURL.String(),
			StatusCode:   http.StatusBadGateway,
			Success:      false,
			ErrorMessage: wrappedErr.Error(),
			RequestPayload: map[string]any{
				"host":                  parsedURL.Host,
				"checked_mode":          "preflight",
				"cons_id_configured":    true,
				"user_key_configured":   true,
				"secret_key_configured": true,
			},
		})
		return result, wrappedErr
	}
	defer response.Body.Close()

	previewBytes, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	previewText := strings.TrimSpace(string(previewBytes))
	result.StatusCode = response.StatusCode
	result.Response = previewText
	result.Reachable = true

	if response.StatusCode >= http.StatusInternalServerError {
		result.Message = fmt.Sprintf("endpoint merespons HTTP %d", response.StatusCode)
		RecordActivityLog(ActivityLogEntry{
			Domain:       config.Domain,
			Direction:    DirectionSystem,
			Operation:    "test-connection",
			Method:       http.MethodGet,
			Endpoint:     parsedURL.String(),
			StatusCode:   response.StatusCode,
			Success:      false,
			ErrorMessage: result.Message,
			RequestPayload: map[string]any{
				"host":                parsedURL.Host,
				"checked_mode":        "preflight",
				"cons_id_configured":  true,
				"user_key_configured": true,
			},
			ResponseBody: previewText,
		})
		return result, fmt.Errorf("%s", result.Message)
	}

	result.Message = fmt.Sprintf("endpoint %s dapat dijangkau (HTTP %d)", parsedURL.Host, response.StatusCode)
	RecordActivityLog(ActivityLogEntry{
		Domain:     config.Domain,
		Direction:  DirectionSystem,
		Operation:  "test-connection",
		Method:     http.MethodGet,
		Endpoint:   parsedURL.String(),
		StatusCode: response.StatusCode,
		Success:    true,
		RequestPayload: map[string]any{
			"host":                parsedURL.Host,
			"checked_mode":        "preflight",
			"cons_id_configured":  true,
			"user_key_configured": true,
		},
		ResponseBody: previewText,
	})

	return result, nil
}
