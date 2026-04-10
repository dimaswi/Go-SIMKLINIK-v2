package satusehat

import "testing"

func TestIsRetryEndpointAllowed(t *testing.T) {
	config := Config{FHIRURL: "https://api.example.org/fhir-r4/v1"}

	if !isRetryEndpointAllowed(config, "https://api.example.org/fhir-r4/v1/ServiceRequest") {
		t.Fatalf("expected endpoint to be allowed")
	}

	if isRetryEndpointAllowed(config, "https://malicious.example.org/fhir-r4/v1/ServiceRequest") {
		t.Fatalf("expected endpoint with different host to be rejected")
	}

	if isRetryEndpointAllowed(config, "https://api.example.org/other-path/ServiceRequest") {
		t.Fatalf("expected endpoint outside base path to be rejected")
	}
}

func TestExtractResourceIDFromRetryEndpoint(t *testing.T) {
	got := extractResourceIDFromRetryEndpoint("https://api.example.org/fhir-r4/v1/ServiceRequest/abc-123")
	if got != "abc-123" {
		t.Fatalf("expected resource id abc-123, got %s", got)
	}
}

func TestEnsureRetryPayloadIdentifierMedicationRequest(t *testing.T) {
	payload := map[string]any{
		"resourceType": "MedicationRequest",
		"status":       "active",
	}

	ensureRetryPayloadIdentifier("MedicationRequest", "POST", "https://api.example.org/fhir-r4/v1/MedicationRequest", payload, Config{OrganizationID: "org-123"})

	identifiers, ok := payload["identifier"].([]any)
	if !ok || len(identifiers) == 0 {
		t.Fatalf("expected identifier to be injected")
	}

	identifier, ok := identifiers[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first identifier object")
	}

	if value := asString(identifier["value"]); value == "" {
		t.Fatalf("expected identifier value to be non-empty")
	}
}

func TestEnsureRetryPayloadIdentifierMedicationDispense(t *testing.T) {
	payload := map[string]any{
		"resourceType": "MedicationDispense",
		"status":       "completed",
	}

	ensureRetryPayloadIdentifier("MedicationDispense", "POST", "https://api.example.org/fhir-r4/v1/MedicationDispense", payload, Config{OrganizationID: "org-123"})

	identifiers, ok := payload["identifier"].([]any)
	if !ok || len(identifiers) == 0 {
		t.Fatalf("expected identifier to be injected")
	}

	identifier, ok := identifiers[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first identifier object")
	}

	if value := asString(identifier["value"]); value == "" {
		t.Fatalf("expected identifier value to be non-empty")
	}
}

func TestEnsureRetryPayloadIdentifierPreserveExisting(t *testing.T) {
	payload := map[string]any{
		"resourceType": "MedicationRequest",
		"identifier": []any{map[string]any{
			"system": "http://example.org/system",
			"value":  "existing-id",
		}},
	}

	ensureRetryPayloadIdentifier("MedicationRequest", "POST", "https://api.example.org/fhir-r4/v1/MedicationRequest", payload, Config{OrganizationID: "org-123"})

	_, value := extractFirstIdentifier(payload)
	if value != "existing-id" {
		t.Fatalf("expected existing identifier to be preserved, got %s", value)
	}
}

func TestExtractFirstIdentifierFromMapSlice(t *testing.T) {
	payload := map[string]any{
		"identifier": []map[string]any{{
			"system": "http://example.org/system",
			"value":  "map-slice-id",
		}},
	}

	system, value := extractFirstIdentifier(payload)
	if system != "http://example.org/system" || value != "map-slice-id" {
		t.Fatalf("expected identifier from []map[string]any, got system=%s value=%s", system, value)
	}
}

func TestExtractFirstIdentifierFromAnySlice(t *testing.T) {
	payload := map[string]any{
		"identifier": []any{map[string]any{
			"system": "http://example.org/system",
			"value":  "any-slice-id",
		}},
	}

	system, value := extractFirstIdentifier(payload)
	if system != "http://example.org/system" || value != "any-slice-id" {
		t.Fatalf("expected identifier from []any, got system=%s value=%s", system, value)
	}
}
