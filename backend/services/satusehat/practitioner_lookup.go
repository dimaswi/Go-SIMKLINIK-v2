package satusehat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const practitionerNIKIdentifierSystem = "https://fhir.kemkes.go.id/id/nik"

type PractitionerLookupResult struct {
	Endpoint         string         `json:"endpoint"`
	IdentifierSystem string         `json:"identifier_system"`
	IdentifierValue  string         `json:"identifier_value"`
	Found            bool           `json:"found"`
	Total            int            `json:"total"`
	ResourceID       string         `json:"resource_id,omitempty"`
	Resource         map[string]any `json:"resource,omitempty"`
}

func NormalizeIndonesianNIK(raw string) string {
	var builder strings.Builder
	builder.Grow(len(raw))
	for _, char := range raw {
		if char >= '0' && char <= '9' {
			builder.WriteRune(char)
		}
	}
	return builder.String()
}

func LooksLikeIndonesianNIK(raw string) bool {
	normalized := NormalizeIndonesianNIK(raw)
	if len(normalized) != 16 {
		return false
	}
	for _, char := range normalized {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func LookupPractitionerByNIK(ctx context.Context, config Config, nik string) (PractitionerLookupResult, error) {
	normalizedNIK := NormalizeIndonesianNIK(nik)
	searchValue := fmt.Sprintf("%s|%s", practitionerNIKIdentifierSystem, normalizedNIK)
	endpoint := strings.TrimRight(config.FHIRURL, "/") + "/Practitioner?identifier=" + url.QueryEscape(searchValue)
	result := PractitionerLookupResult{
		Endpoint:         endpoint,
		IdentifierSystem: practitionerNIKIdentifierSystem,
		IdentifierValue:  normalizedNIK,
	}

	if !LooksLikeIndonesianNIK(normalizedNIK) {
		return result, fmt.Errorf("NIK dokter harus 16 digit agar Practitioner bisa dicari di SATUSEHAT")
	}

	tokenResponse, err := RequestAccessToken(ctx, config)
	if err != nil {
		return result, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return result, err
	}
	request.Header.Set("Authorization", "Bearer "+tokenResponse.AccessToken)
	request.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 45 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Practitioner", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, Success: false, ErrorMessage: err.Error()})
		return result, err
	}
	defer response.Body.Close()

	responseBodyBytes, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024))
	if err != nil {
		return result, err
	}

	responseBody := map[string]any{}
	if trimmed := strings.TrimSpace(string(responseBodyBytes)); trimmed != "" {
		if err := json.Unmarshal(responseBodyBytes, &responseBody); err != nil {
			RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Practitioner", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("response lookup Practitioner tidak valid JSON: %v", err), ResponseBody: string(responseBodyBytes)})
			return result, fmt.Errorf("response lookup Practitioner tidak valid JSON: %w", err)
		}
	}

	if response.StatusCode >= http.StatusBadRequest {
		message := extractOperationOutcomeMessage(responseBody)
		if message == "" {
			message = strings.TrimSpace(string(responseBodyBytes))
		}
		if message == "" {
			message = response.Status
		}
		RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Practitioner", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("gagal mencari Practitioner SATUSEHAT: %s", message), ResponseBody: responseBody})
		return result, fmt.Errorf("gagal mencari Practitioner SATUSEHAT: %s", message)
	}

	result.Total = asInt(responseBody["total"])
	entries, _ := responseBody["entry"].([]any)
	if len(entries) > 0 {
		entryMap, _ := entries[0].(map[string]any)
		resource, _ := entryMap["resource"].(map[string]any)
		result.Resource = resource
		result.ResourceID = strings.TrimSpace(asString(resource["id"]))
		result.Found = result.ResourceID != ""
	}

	logSuccess := result.Found
	logMessage := ""
	if !result.Found {
		logMessage = "Practitioner SATUSEHAT tidak ditemukan untuk NIK yang diberikan"
	}
	RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Practitioner", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: logSuccess, ErrorMessage: logMessage, ResponseBody: responseBody, ResourceID: result.ResourceID})

	return result, nil
}

func asInt(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		if err == nil {
			return parsed
		}
	}
	return 0
}
