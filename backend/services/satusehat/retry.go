package satusehat

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"
)

func RetryFailedSyncLog(ctx context.Context, config Config, entry models.SATUSEHATLog) (ResourceOperationResult, error) {
	if strings.TrimSpace(strings.ToLower(entry.Operation)) != "sync" {
		return ResourceOperationResult{}, fmt.Errorf("hanya log operation=sync yang bisa di-retry")
	}

	if entry.Success {
		return ResourceOperationResult{}, fmt.Errorf("log ini sudah sukses, retry tidak diperlukan")
	}

	method := strings.ToUpper(strings.TrimSpace(entry.Method))
	if method != http.MethodPost && method != http.MethodPut {
		return ResourceOperationResult{}, fmt.Errorf("metode %s tidak didukung untuk retry", method)
	}

	endpoint := strings.TrimSpace(entry.Endpoint)
	if endpoint == "" {
		return ResourceOperationResult{}, fmt.Errorf("endpoint log kosong")
	}

	if !isRetryEndpointAllowed(config, endpoint) {
		return ResourceOperationResult{}, fmt.Errorf("endpoint retry di luar FHIR SATUSEHAT aktif")
	}

	payload := map[string]any{}
	if strings.TrimSpace(entry.RequestPayload) == "" {
		return ResourceOperationResult{}, fmt.Errorf("payload log kosong")
	}
	if err := json.Unmarshal([]byte(entry.RequestPayload), &payload); err != nil {
		return ResourceOperationResult{}, fmt.Errorf("payload log tidak valid JSON: %w", err)
	}

	ensureRetryPayloadIdentifier(entry.ResourceType, method, endpoint, payload, config)

	if resolvedResourceID := resolveExistingLocalResourceIDForRetry(entry, payload); resolvedResourceID != "" {
		result := ResourceOperationResult{
			Method:       "SKIP",
			StatusCode:   http.StatusOK,
			ResourceType: entry.ResourceType,
			ResourceID:   resolvedResourceID,
			ResponseBody: map[string]any{
				"status": "skipped",
				"reason": "resource sudah memiliki SATUSEHAT ID",
			},
		}

		RecordActivityLog(ActivityLogEntry{
			Operation:      "retry-sync",
			ResourceType:   entry.ResourceType,
			Mode:           config.ActiveMode,
			Method:         method,
			Endpoint:       endpoint,
			StatusCode:     http.StatusOK,
			Success:        true,
			RequestPayload: payload,
			ResponseBody:   result.ResponseBody,
			ResourceID:     resolvedResourceID,
		})

		return result, nil
	}

	tokenResponse, err := RequestAccessToken(ctx, config)
	if err != nil {
		return ResourceOperationResult{}, err
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return ResourceOperationResult{}, fmt.Errorf("gagal menyusun payload retry: %w", err)
	}

	operationKey := buildSyncOperationKey(method, endpoint, payload)
	if !acquireSyncOperationLock(operationKey) {
		dupErr := fmt.Errorf("permintaan retry %s duplikat masih diproses", strings.TrimSpace(entry.ResourceType))
		RecordActivityLog(ActivityLogEntry{
			Operation:      "retry-sync",
			ResourceType:   entry.ResourceType,
			Mode:           config.ActiveMode,
			Method:         method,
			Endpoint:       endpoint,
			Success:        false,
			ErrorMessage:   dupErr.Error(),
			RequestPayload: payload,
		})
		return ResourceOperationResult{}, dupErr
	}
	defer releaseSyncOperationLock(operationKey)

	request, err := http.NewRequestWithContext(ctx, method, endpoint, strings.NewReader(string(body)))
	if err != nil {
		return ResourceOperationResult{}, err
	}
	request.Header.Set("Authorization", "Bearer "+tokenResponse.AccessToken)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Idempotency-Key", operationKey)

	client := &http.Client{Timeout: 45 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{
			Operation:      "retry-sync",
			ResourceType:   entry.ResourceType,
			Mode:           config.ActiveMode,
			Method:         method,
			Endpoint:       endpoint,
			Success:        false,
			ErrorMessage:   err.Error(),
			RequestPayload: payload,
		})
		return ResourceOperationResult{}, err
	}
	defer response.Body.Close()

	responseBodyBytes, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024))
	if err != nil {
		return ResourceOperationResult{}, err
	}

	responseBody := map[string]any{}
	if trimmed := strings.TrimSpace(string(responseBodyBytes)); trimmed != "" {
		if err := json.Unmarshal(responseBodyBytes, &responseBody); err != nil {
			wrappedErr := fmt.Errorf("response retry %s tidak valid JSON: %w", entry.ResourceType, err)
			RecordActivityLog(ActivityLogEntry{
				Operation:      "retry-sync",
				ResourceType:   entry.ResourceType,
				Mode:           config.ActiveMode,
				Method:         method,
				Endpoint:       endpoint,
				StatusCode:     response.StatusCode,
				Success:        false,
				ErrorMessage:   wrappedErr.Error(),
				RequestPayload: payload,
				ResponseBody:   string(responseBodyBytes),
			})
			return ResourceOperationResult{}, wrappedErr
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
		err := fmt.Errorf("gagal retry submit %s ke SATUSEHAT: %s", entry.ResourceType, message)
		RecordActivityLog(ActivityLogEntry{
			Operation:      "retry-sync",
			ResourceType:   entry.ResourceType,
			Mode:           config.ActiveMode,
			Method:         method,
			Endpoint:       endpoint,
			StatusCode:     response.StatusCode,
			Success:        false,
			ErrorMessage:   err.Error(),
			RequestPayload: payload,
			ResponseBody:   responseBody,
		})
		return ResourceOperationResult{}, err
	}

	resourceID := strings.TrimSpace(asString(responseBody["id"]))
	location := strings.TrimSpace(response.Header.Get("Location"))
	if resourceID == "" && location != "" {
		resourceID = extractResourceIDFromLocation(location)
	}
	if resourceID == "" {
		resourceID = extractResourceIDFromRetryEndpoint(endpoint)
	}

	result := ResourceOperationResult{
		Method:       method,
		StatusCode:   response.StatusCode,
		ResourceType: entry.ResourceType,
		ResourceID:   resourceID,
		Location:     location,
		ResponseBody: responseBody,
	}

	if persistErr := persistResolvedResourceIDForRetry(entry.ResourceType, payload, resourceID); persistErr != nil {
		if result.ResponseBody == nil {
			result.ResponseBody = map[string]any{}
		}
		result.ResponseBody["local_persist_warning"] = persistErr.Error()
	}

	RecordActivityLog(ActivityLogEntry{
		Operation:      "retry-sync",
		ResourceType:   entry.ResourceType,
		Mode:           config.ActiveMode,
		Method:         method,
		Endpoint:       endpoint,
		StatusCode:     response.StatusCode,
		Success:        true,
		RequestPayload: payload,
		ResponseBody:   responseBody,
		ResourceID:     resourceID,
		Location:       location,
	})

	return result, nil
}

func resolveExistingLocalResourceIDForRetry(entry models.SATUSEHATLog, payload map[string]any) string {
	if resourceID := resolveLocalResourceIDByPayloadIdentifier(entry.ResourceType, payload); resourceID != "" {
		return resourceID
	}

	if database.DB == nil {
		return ""
	}

	var latestSuccess models.SATUSEHATLog
	err := database.DB.
		Where("resource_type = ? AND success = ? AND request_payload = ? AND id <> ?", strings.TrimSpace(entry.ResourceType), true, strings.TrimSpace(entry.RequestPayload), entry.ID).
		Order("created_at DESC").
		Order("id DESC").
		First(&latestSuccess).Error
	if err != nil {
		return ""
	}

	return strings.TrimSpace(latestSuccess.ResourceID)
}

func resolveLocalResourceIDByPayloadIdentifier(resourceType string, payload map[string]any) string {
	if database.DB == nil {
		return ""
	}

	_, identifierValue := extractFirstIdentifier(payload)
	if identifierValue == "" {
		return ""
	}

	switch normalizeResourceType(resourceType) {
	case "medicationrequest":
		prescriptionID := extractResourceNumericID(identifierValue, "prescription-")
		if prescriptionID == 0 {
			return ""
		}

		var prescription models.Prescription
		if err := database.DB.Select("satusehat_medication_request_id").First(&prescription, prescriptionID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(prescription.SatusehatMedicationRequestID)
	case "medicationdispense":
		dispensingID := extractResourceNumericID(identifierValue, "dispensing-")
		if dispensingID == 0 {
			return ""
		}

		var dispensing models.Dispensing
		if err := database.DB.Select("satusehat_medication_dispense_id").First(&dispensing, dispensingID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(dispensing.SatusehatMedicationDispenseID)
	case "careplan":
		recordID := extractResourceNumericID(identifierValue, "care-plan-")
		if recordID == 0 {
			return ""
		}
		var record models.MedicalRecord
		if err := database.DB.Select("satusehat_care_plan_id").First(&record, recordID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(record.SatusehatCarePlanID)
	case "allergyintolerance":
		recordID := extractResourceNumericID(identifierValue, "allergy-intolerance-")
		if recordID == 0 {
			return ""
		}
		var record models.MedicalRecord
		if err := database.DB.Select("satusehat_allergy_intolerance_id").First(&record, recordID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(record.SatusehatAllergyIntoleranceID)
	case "clinicalimpression":
		recordID := extractResourceNumericID(identifierValue, "clinical-impression-")
		if recordID == 0 {
			return ""
		}
		var record models.MedicalRecord
		if err := database.DB.Select("satusehat_clinical_impression_id").First(&record, recordID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(record.SatusehatClinicalImpressionID)
	case "composition":
		recordID := extractResourceNumericID(identifierValue, "composition-")
		if recordID == 0 {
			return ""
		}
		var record models.MedicalRecord
		if err := database.DB.Select("satusehat_composition_id").First(&record, recordID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(record.SatusehatCompositionID)
	case "condition":
		diagnosisID := extractResourceNumericID(identifierValue, "condition-")
		if diagnosisID == 0 {
			return ""
		}
		var diagnosis models.MedicalRecordDiagnosis
		if err := database.DB.Select("satusehat_condition_id").First(&diagnosis, diagnosisID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(diagnosis.SatusehatConditionID)
	case "goal":
		recordID := extractResourceNumericID(identifierValue, "goal-")
		if recordID == 0 {
			recordID = extractResourceNumericIDWithPrefixSuffix(identifierValue, "medical-record-", "-goal")
		}
		if recordID == 0 {
			return ""
		}
		var record models.MedicalRecord
		if err := database.DB.Select("satusehat_goal_id").First(&record, recordID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(record.SatusehatGoalID)
	case "familymemberhistory":
		recordID := extractResourceNumericID(identifierValue, "family-history-")
		if recordID == 0 {
			recordID = extractResourceNumericIDWithPrefixSuffix(identifierValue, "medical-record-", "-family-history")
		}
		if recordID == 0 {
			return ""
		}
		var record models.MedicalRecord
		if err := database.DB.Select("satusehat_family_history_id").First(&record, recordID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(record.SatusehatFamilyHistoryID)
	case "procedure":
		actionID := extractResourceNumericID(identifierValue, "medical-action-")
		if actionID == 0 {
			return ""
		}
		var action models.MedicalAction
		if err := database.DB.Select("satusehat_procedure_id").First(&action, actionID).Error; err != nil {
			return ""
		}
		return strings.TrimSpace(action.SatusehatProcedureID)
	case "servicerequest":
		if laboratoryItemID := extractResourceNumericID(identifierValue, "lab-order-item-"); laboratoryItemID != 0 {
			var item models.LaboratoryOrderItem
			if err := database.DB.Select("satusehat_service_request_id").First(&item, laboratoryItemID).Error; err == nil {
				return strings.TrimSpace(item.SatusehatServiceRequestID)
			}
		}

		if radiologyItemID := extractResourceNumericID(identifierValue, "radiology-order-item-"); radiologyItemID != 0 {
			var item models.RadiologyOrderItem
			if err := database.DB.Select("satusehat_service_request_id").First(&item, radiologyItemID).Error; err == nil {
				return strings.TrimSpace(item.SatusehatServiceRequestID)
			}
		}
	}

	return ""
}

func persistResolvedResourceIDForRetry(resourceType string, payload map[string]any, resourceID string) error {
	trimmedResourceID := strings.TrimSpace(resourceID)
	if trimmedResourceID == "" || database.DB == nil {
		return nil
	}

	_, identifierValue := extractFirstIdentifier(payload)
	if identifierValue == "" {
		return nil
	}

	now := time.Now()

	switch normalizeResourceType(resourceType) {
	case "medicationrequest":
		prescriptionID := extractResourceNumericID(identifierValue, "prescription-")
		if prescriptionID == 0 {
			return nil
		}
		return database.DB.Model(&models.Prescription{}).Where("id = ?", prescriptionID).Updates(map[string]any{
			"satusehat_medication_request_id": trimmedResourceID,
			"satusehat_synced_at":             now,
		}).Error
	case "medicationdispense":
		dispensingID := extractResourceNumericID(identifierValue, "dispensing-")
		if dispensingID == 0 {
			return nil
		}
		return database.DB.Model(&models.Dispensing{}).Where("id = ?", dispensingID).Updates(map[string]any{
			"satusehat_medication_dispense_id": trimmedResourceID,
			"satusehat_synced_at":              now,
		}).Error
	case "careplan":
		recordID := extractResourceNumericID(identifierValue, "care-plan-")
		if recordID == 0 {
			return nil
		}
		return database.DB.Model(&models.MedicalRecord{}).Where("id = ?", recordID).Updates(map[string]any{
			"satusehat_care_plan_id":        trimmedResourceID,
			"satusehat_care_plan_synced_at": now,
		}).Error
	case "allergyintolerance":
		recordID := extractResourceNumericID(identifierValue, "allergy-intolerance-")
		if recordID == 0 {
			return nil
		}
		return database.DB.Model(&models.MedicalRecord{}).Where("id = ?", recordID).Updates(map[string]any{
			"satusehat_allergy_intolerance_id": trimmedResourceID,
			"satusehat_allergy_synced_at":      now,
		}).Error
	case "clinicalimpression":
		recordID := extractResourceNumericID(identifierValue, "clinical-impression-")
		if recordID == 0 {
			return nil
		}
		return database.DB.Model(&models.MedicalRecord{}).Where("id = ?", recordID).Updates(map[string]any{
			"satusehat_clinical_impression_id": trimmedResourceID,
			"satusehat_clinical_synced_at":     now,
		}).Error
	case "composition":
		recordID := extractResourceNumericID(identifierValue, "composition-")
		if recordID == 0 {
			return nil
		}
		return database.DB.Model(&models.MedicalRecord{}).Where("id = ?", recordID).Updates(map[string]any{
			"satusehat_composition_id":        trimmedResourceID,
			"satusehat_composition_synced_at": now,
		}).Error
	case "condition":
		diagnosisID := extractResourceNumericID(identifierValue, "condition-")
		if diagnosisID == 0 {
			return nil
		}
		return database.DB.Model(&models.MedicalRecordDiagnosis{}).Where("id = ?", diagnosisID).Updates(map[string]any{
			"satusehat_condition_id": trimmedResourceID,
			"satusehat_synced_at":    now,
		}).Error
	case "goal":
		recordID := extractResourceNumericID(identifierValue, "goal-")
		if recordID == 0 {
			recordID = extractResourceNumericIDWithPrefixSuffix(identifierValue, "medical-record-", "-goal")
		}
		if recordID == 0 {
			return nil
		}
		return database.DB.Model(&models.MedicalRecord{}).Where("id = ?", recordID).Updates(map[string]any{
			"satusehat_goal_id":        trimmedResourceID,
			"satusehat_goal_synced_at": now,
		}).Error
	case "familymemberhistory":
		recordID := extractResourceNumericID(identifierValue, "family-history-")
		if recordID == 0 {
			recordID = extractResourceNumericIDWithPrefixSuffix(identifierValue, "medical-record-", "-family-history")
		}
		if recordID == 0 {
			return nil
		}
		return database.DB.Model(&models.MedicalRecord{}).Where("id = ?", recordID).Updates(map[string]any{
			"satusehat_family_history_id":        trimmedResourceID,
			"satusehat_family_history_synced_at": now,
		}).Error
	case "procedure":
		actionID := extractResourceNumericID(identifierValue, "medical-action-")
		if actionID == 0 {
			return nil
		}
		return database.DB.Model(&models.MedicalAction{}).Where("id = ?", actionID).Updates(map[string]any{
			"satusehat_procedure_id": trimmedResourceID,
			"satusehat_synced_at":    now,
		}).Error
	case "servicerequest":
		if laboratoryItemID := extractResourceNumericID(identifierValue, "lab-order-item-"); laboratoryItemID != 0 {
			return database.DB.Model(&models.LaboratoryOrderItem{}).Where("id = ?", laboratoryItemID).Updates(map[string]any{
				"satusehat_service_request_id": trimmedResourceID,
				"satusehat_synced_at":          now,
			}).Error
		}
		if radiologyItemID := extractResourceNumericID(identifierValue, "radiology-order-item-"); radiologyItemID != 0 {
			return database.DB.Model(&models.RadiologyOrderItem{}).Where("id = ?", radiologyItemID).Updates(map[string]any{
				"satusehat_service_request_id": trimmedResourceID,
				"satusehat_synced_at":          now,
			}).Error
		}
	}

	return nil
}

func extractFirstIdentifier(payload map[string]any) (string, string) {
	identifierPayload, exists := payload["identifier"]
	if !exists || identifierPayload == nil {
		return "", ""
	}

	collect := func(identifier map[string]any) (string, string, bool) {
		system := strings.TrimSpace(asString(identifier["system"]))
		value := strings.TrimSpace(asString(identifier["value"]))
		if value == "" {
			return "", "", false
		}
		return system, value, true
	}

	if identifiers, ok := identifierPayload.([]any); ok {
		for _, identifierRaw := range identifiers {
			identifier, ok := identifierRaw.(map[string]any)
			if !ok {
				continue
			}
			if system, value, found := collect(identifier); found {
				return system, value
			}
		}
	}

	if identifiers, ok := identifierPayload.([]map[string]any); ok {
		for _, identifier := range identifiers {
			if system, value, found := collect(identifier); found {
				return system, value
			}
		}
	}

	return "", ""
}

func extractResourceNumericID(value, prefix string) uint {
	trimmedValue := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmedValue, prefix) {
		return 0
	}

	rawID := strings.TrimSpace(strings.TrimPrefix(trimmedValue, prefix))
	if rawID == "" {
		return 0
	}

	parsedID, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil {
		return 0
	}

	return uint(parsedID)
}

func extractResourceNumericIDWithPrefixSuffix(value, prefix, suffix string) uint {
	trimmedValue := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmedValue, prefix) || !strings.HasSuffix(trimmedValue, suffix) {
		return 0
	}
	rawID := strings.TrimPrefix(trimmedValue, prefix)
	rawID = strings.TrimSuffix(rawID, suffix)
	rawID = strings.TrimSpace(rawID)
	if rawID == "" {
		return 0
	}
	parsedID, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil {
		return 0
	}
	return uint(parsedID)
}

func normalizeResourceType(resourceType string) string {
	normalized := strings.ToLower(strings.TrimSpace(resourceType))
	normalized = strings.ReplaceAll(normalized, "_", "")
	normalized = strings.ReplaceAll(normalized, "-", "")
	normalized = strings.ReplaceAll(normalized, " ", "")
	return normalized
}

func ensureRetryPayloadIdentifier(resourceType, method, endpoint string, payload map[string]any, config Config) {
	if payload == nil {
		return
	}

	if _, identifierValue := extractFirstIdentifier(payload); identifierValue != "" {
		return
	}

	normalizedResourceType := normalizeResourceType(resourceType)
	identifierSystem := ""
	identifierPrefix := ""

	switch normalizedResourceType {
	case "medicationrequest":
		identifierSystem = buildMedicationRequestIdentifierSystem(config.OrganizationID)
		identifierPrefix = "retry-medication-request"
	case "medicationdispense":
		identifierSystem = buildMedicationDispenseIdentifierSystem(config.OrganizationID)
		identifierPrefix = "retry-medication-dispense"
	default:
		return
	}

	payloadClone := cloneMap(payload)
	delete(payloadClone, "identifier")
	serialized, _ := json.Marshal(payloadClone)
	seed := strings.Join([]string{strings.TrimSpace(method), strings.TrimSpace(endpoint), normalizedResourceType, string(serialized)}, "|")
	hash := sha256.Sum256([]byte(seed))
	identifierValue := fmt.Sprintf("%s-%s", identifierPrefix, hex.EncodeToString(hash[:8]))

	identifier := map[string]any{
		"use":    "official",
		"system": identifierSystem,
		"value":  identifierValue,
	}
	if assignerOrganizationID := strings.TrimSpace(config.OrganizationID); assignerOrganizationID != "" {
		identifier["assigner"] = map[string]any{
			"reference": fmt.Sprintf("Organization/%s", assignerOrganizationID),
		}
	}

	payload["identifier"] = []any{identifier}
}

func isRetryEndpointAllowed(config Config, endpoint string) bool {
	baseURL, err := url.Parse(strings.TrimSpace(config.FHIRURL))
	if err != nil || baseURL.Host == "" {
		return false
	}

	targetURL, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil || targetURL.Host == "" {
		return false
	}

	if !strings.EqualFold(baseURL.Scheme, targetURL.Scheme) {
		return false
	}
	if !strings.EqualFold(baseURL.Host, targetURL.Host) {
		return false
	}

	basePath := strings.TrimRight(baseURL.Path, "/")
	targetPath := strings.TrimRight(targetURL.Path, "/")
	if basePath == "" {
		return false
	}

	if targetPath == basePath {
		return true
	}

	return strings.HasPrefix(targetPath, basePath+"/")
}

func extractResourceIDFromRetryEndpoint(endpoint string) string {
	parsed, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil {
		return ""
	}
	trimmedPath := strings.Trim(parsed.Path, "/")
	if trimmedPath == "" {
		return ""
	}
	segments := strings.Split(trimmedPath, "/")
	if len(segments) < 2 {
		return ""
	}
	if len(segments) >= 3 && segments[len(segments)-2] == "_history" {
		return path.Base(strings.Join(segments[:len(segments)-2], "/"))
	}
	return path.Base(trimmedPath)
}
