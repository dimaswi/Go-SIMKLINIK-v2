package satusehat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const patientNIKIdentifierSystem = "https://fhir.kemkes.go.id/id/nik"
const patientIHSIdentifierSystem = "https://fhir.kemkes.go.id/id/ihs-number"

type PatientLookupResult struct {
	Endpoint         string         `json:"endpoint"`
	IdentifierSystem string         `json:"identifier_system"`
	IdentifierValue  string         `json:"identifier_value"`
	Found            bool           `json:"found"`
	Total            int            `json:"total"`
	ResourceID       string         `json:"resource_id,omitempty"`
	Resource         map[string]any `json:"resource,omitempty"`
}

func LookupPatientByID(ctx context.Context, config Config, patientID string) (PatientLookupResult, error) {
	normalizedID := NormalizeFHIRResourceUUID(patientID)
	endpoint := strings.TrimRight(config.FHIRURL, "/") + "/Patient/" + normalizedID
	result := PatientLookupResult{
		Endpoint:   endpoint,
		ResourceID: normalizedID,
	}

	if normalizedID == "" {
		return result, fmt.Errorf("SATUSEHAT Patient ID harus berformat UUID")
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
	throttleSATUSEHATCall()
	response, err := client.Do(request)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, Success: false, ErrorMessage: err.Error(), ResourceID: normalizedID})
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
			RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("response lookup Patient by ID tidak valid JSON: %v", err), ResponseBody: string(responseBodyBytes), ResourceID: normalizedID})
			return result, fmt.Errorf("response lookup Patient by ID tidak valid JSON: %w", err)
		}
	}

	if response.StatusCode == http.StatusNotFound {
		RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: "Patient SATUSEHAT tidak ditemukan berdasarkan ID", ResponseBody: responseBody, ResourceID: normalizedID})
		return result, nil
	}

	if response.StatusCode >= http.StatusBadRequest {
		message := extractOperationOutcomeMessage(responseBody)
		if message == "" {
			message = strings.TrimSpace(string(responseBodyBytes))
		}
		if message == "" {
			message = response.Status
		}
		RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("gagal mencari Patient SATUSEHAT by ID: %s", message), ResponseBody: responseBody, ResourceID: normalizedID})
		return result, fmt.Errorf("gagal mencari Patient SATUSEHAT by ID: %s", message)
	}

	resourceID := NormalizeFHIRResourceUUID(asString(responseBody["id"]))
	if resourceID == "" {
		resourceID = normalizedID
	}

	result.Resource = responseBody
	result.ResourceID = resourceID
	result.Found = true
	result.Total = 1

	RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: true, ResponseBody: responseBody, ResourceID: resourceID})

	return result, nil
}

func LookupPatientByNIK(ctx context.Context, config Config, nik string) (PatientLookupResult, error) {
	return LookupPatientByNIKWithName(ctx, config, nik, "")
}

func LookupPatientByNIKWithName(ctx context.Context, config Config, nik string, fullName string) (PatientLookupResult, error) {
	normalizedNIK := NormalizeIndonesianNIK(nik)
	if normalizedNIK == "" {
		return PatientLookupResult{IdentifierSystem: patientNIKIdentifierSystem}, fmt.Errorf("NIK pasien kosong, tidak dapat melakukan lookup Patient")
	}
	if !LooksLikeIndonesianNIK(normalizedNIK) {
		return PatientLookupResult{IdentifierSystem: patientNIKIdentifierSystem, IdentifierValue: normalizedNIK}, fmt.Errorf("NIK pasien harus 16 digit agar lookup Patient by NIK valid")
	}

	searchValue := fmt.Sprintf("%s|%s", patientNIKIdentifierSystem, normalizedNIK)
	query := url.Values{}
	query.Set("identifier", searchValue)
	if trimmedName := strings.TrimSpace(fullName); trimmedName != "" {
		query.Set("name", trimmedName)
	}
	endpoint := strings.TrimRight(config.FHIRURL, "/") + "/Patient?" + query.Encode()
	result := PatientLookupResult{
		Endpoint:         endpoint,
		IdentifierSystem: patientNIKIdentifierSystem,
		IdentifierValue:  normalizedNIK,
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
	throttleSATUSEHATCall()
	response, err := client.Do(request)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, Success: false, ErrorMessage: err.Error()})
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
			RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("response lookup Patient tidak valid JSON: %v", err), ResponseBody: string(responseBodyBytes)})
			return result, fmt.Errorf("response lookup Patient tidak valid JSON: %w", err)
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
		RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("gagal mencari Patient SATUSEHAT by NIK: %s", message), ResponseBody: responseBody})
		return result, fmt.Errorf("gagal mencari Patient SATUSEHAT by NIK: %s", message)
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
		logMessage = "Patient SATUSEHAT tidak ditemukan untuk NIK yang diberikan"
	}
	RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: logSuccess, ErrorMessage: logMessage, ResponseBody: responseBody, ResourceID: result.ResourceID})

	return result, nil
}

func LookupPatientByIHSNumber(ctx context.Context, config Config, ihsNumber string) (PatientLookupResult, error) {
	normalizedIHSNumber := strings.TrimSpace(ihsNumber)
	if normalizedIHSNumber == "" {
		return PatientLookupResult{IdentifierSystem: patientIHSIdentifierSystem}, fmt.Errorf("IHS Number pasien kosong, tidak dapat melakukan lookup Patient")
	}

	searchValue := fmt.Sprintf("%s|%s", patientIHSIdentifierSystem, normalizedIHSNumber)
	endpoint := strings.TrimRight(config.FHIRURL, "/") + "/Patient?identifier=" + url.QueryEscape(searchValue)
	result := PatientLookupResult{
		Endpoint:         endpoint,
		IdentifierSystem: patientIHSIdentifierSystem,
		IdentifierValue:  normalizedIHSNumber,
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
	throttleSATUSEHATCall()
	response, err := client.Do(request)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, Success: false, ErrorMessage: err.Error()})
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
			RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("response lookup Patient by IHS Number tidak valid JSON: %v", err), ResponseBody: string(responseBodyBytes)})
			return result, fmt.Errorf("response lookup Patient by IHS Number tidak valid JSON: %w", err)
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
		RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("gagal mencari Patient SATUSEHAT by IHS Number: %s", message), ResponseBody: responseBody})
		return result, fmt.Errorf("gagal mencari Patient SATUSEHAT by IHS Number: %s", message)
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
		logMessage = "Patient SATUSEHAT tidak ditemukan untuk IHS Number yang diberikan"
	}
	RecordActivityLog(ActivityLogEntry{Operation: "lookup", ResourceType: "Patient", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, StatusCode: response.StatusCode, Success: logSuccess, ErrorMessage: logMessage, ResponseBody: responseBody, ResourceID: result.ResourceID})

	return result, nil
}
