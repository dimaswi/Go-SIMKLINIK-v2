package satusehat

import (
	"errors"
	"strings"
	"unicode"

	"starter/backend/database"
	"starter/backend/models"
)

const (
	ModeSandbox    = "sandbox"
	ModeProduction = "production"
)

var ErrIntegrationDisabled = errors.New("integrasi SATUSEHAT sedang dinonaktifkan")

type Config struct {
	Enabled        bool   `json:"enabled"`
	ActiveMode     string `json:"active_mode"`
	AuthURL        string `json:"auth_url"`
	FHIRURL        string `json:"fhir_url"`
	KFAURL         string `json:"kfa_url"`
	OrganizationID string `json:"organization_id"`
	ClientID       string `json:"client_id"`
	ClientSecret   string `json:"-"`
}

func LoadConfig() (Config, error) {
	var settings []models.Setting
	if err := database.DB.Find(&settings).Error; err != nil {
		return Config{}, err
	}

	settingsMap := make(map[string]string, len(settings))
	for _, setting := range settings {
		settingsMap[setting.Key] = strings.TrimSpace(setting.Value)
	}

	mode := strings.ToLower(strings.TrimSpace(settingsMap["satusehat_active_mode"]))
	if mode != ModeProduction {
		mode = ModeSandbox
	}

	config := Config{
		Enabled:        parseSATUSEHATSettingFlag(settingsMap["satusehat_enabled"], true),
		ActiveMode:     mode,
		OrganizationID: settingsMap["satusehat_organization_id"],
		ClientID:       normalizeSATUSEHATCredential(settingsMap["satusehat_client_id"]),
		ClientSecret:   normalizeSATUSEHATCredential(settingsMap["satusehat_client_secret"]),
	}

	if mode == ModeProduction {
		config.AuthURL = settingsMap["satusehat_production_auth_url"]
		config.FHIRURL = settingsMap["satusehat_production_fhir_url"]
		config.KFAURL = firstNonEmptyText(settingsMap["satusehat_production_kfa_url"], "https://api-satusehat.kemkes.go.id/kfa-v2")
	} else {
		config.AuthURL = settingsMap["satusehat_sandbox_auth_url"]
		config.FHIRURL = settingsMap["satusehat_sandbox_fhir_url"]
		config.KFAURL = firstNonEmptyText(settingsMap["satusehat_sandbox_kfa_url"], "https://api-satusehat-stg.dto.kemkes.go.id/kfa-v2")
	}

	return config, nil
}

func parseSATUSEHATSettingFlag(value string, defaultValue bool) bool {
	normalized := strings.TrimSpace(strings.ToLower(value))
	if normalized == "" {
		return defaultValue
	}

	switch normalized {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return defaultValue
	}
}

func normalizeSATUSEHATCredential(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	b := strings.Builder{}
	b.Grow(len(trimmed))
	for _, r := range trimmed {
		if unicode.IsControl(r) {
			continue
		}
		if unicode.IsSpace(r) {
			continue
		}
		if r == '\u200b' || r == '\u200c' || r == '\u200d' || r == '\ufeff' {
			continue
		}
		b.WriteRune(r)
	}

	return b.String()
}

func (config Config) EnsureEnabled() error {
	if config.Enabled {
		return nil
	}

	return ErrIntegrationDisabled
}

func (config Config) DisabledReason() string {
	if config.Enabled {
		return ""
	}

	return ErrIntegrationDisabled.Error()
}

func (config Config) MissingRequiredFields(includeCredentials bool) []string {
	missing := make([]string, 0, 5)

	if strings.TrimSpace(config.AuthURL) == "" {
		missing = append(missing, "auth_url")
	}
	if strings.TrimSpace(config.FHIRURL) == "" {
		missing = append(missing, "fhir_url")
	}
	if strings.TrimSpace(config.KFAURL) == "" {
		missing = append(missing, "kfa_url")
	}
	if strings.TrimSpace(config.OrganizationID) == "" {
		missing = append(missing, "organization_id")
	}
	if includeCredentials && strings.TrimSpace(config.ClientID) == "" {
		missing = append(missing, "client_id")
	}
	if includeCredentials && strings.TrimSpace(config.ClientSecret) == "" {
		missing = append(missing, "client_secret")
	}

	return missing
}

func (config Config) PublicStatus() map[string]any {
	missingFields := config.MissingRequiredFields(true)
	return map[string]any{
		"enabled":                  config.Enabled,
		"disabled_reason":          config.DisabledReason(),
		"active_mode":              config.ActiveMode,
		"auth_url":                 config.AuthURL,
		"fhir_url":                 config.FHIRURL,
		"kfa_url":                  config.KFAURL,
		"organization_id":          config.OrganizationID,
		"client_id_configured":     strings.TrimSpace(config.ClientID) != "",
		"client_secret_configured": strings.TrimSpace(config.ClientSecret) != "",
		"missing_fields":           missingFields,
		"ready":                    config.Enabled && len(missingFields) == 0,
	}
}
