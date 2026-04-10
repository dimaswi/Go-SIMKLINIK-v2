package satusehat

import "testing"

func TestParseTokenResponseAcceptsNumericExpiresIn(t *testing.T) {
	body := []byte(`{"access_token":"abc","token_type":"Bearer","expires_in":3600,"scope":"user/*.read"}`)

	result, err := parseTokenResponse(body)
	if err != nil {
		t.Fatalf("parseTokenResponse returned error: %v", err)
	}

	if result.ExpiresIn != 3600 {
		t.Fatalf("expected expires_in=3600, got %d", result.ExpiresIn)
	}
}

func TestParseTokenResponseAcceptsStringExpiresIn(t *testing.T) {
	body := []byte(`{"access_token":"abc","token_type":"Bearer","expires_in":"3600","scope":"user/*.read"}`)

	result, err := parseTokenResponse(body)
	if err != nil {
		t.Fatalf("parseTokenResponse returned error: %v", err)
	}

	if result.ExpiresIn != 3600 {
		t.Fatalf("expected expires_in=3600, got %d", result.ExpiresIn)
	}
}

func TestExtractDuplicateResourceIDFromMessage(t *testing.T) {
	message := "Resource already exists with id 550e8400-e29b-41d4-a716-446655440000"

	result := extractDuplicateResourceIDFromMessage(message)

	if result != "550e8400-e29b-41d4-a716-446655440000" {
		t.Fatalf("expected parsed uuid, got %q", result)
	}
}

func TestExtractDuplicateResourceIDFromMessageWithoutUUID(t *testing.T) {
	message := "Resource already exists"

	result := extractDuplicateResourceIDFromMessage(message)

	if result != "" {
		t.Fatalf("expected empty result, got %q", result)
	}
}
