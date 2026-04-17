package bpjs

import (
	"errors"
	"fmt"
	"strings"

	"starter/backend/database"
	"starter/backend/models"
)

var ErrIntegrationDisabled = errors.New("integrasi antrean BPJS sedang dinonaktifkan")
var ErrPCareIntegrationDisabled = errors.New("integrasi P-Care BPJS sedang dinonaktifkan")

type Config struct {
	Domain    string `json:"domain"`
	Label     string `json:"label"`
	Enabled   bool   `json:"enabled"`
	ConsID    string `json:"cons_id"`
	SecretKey string `json:"-"`
	UserKey   string `json:"user_key"`
	BaseURL   string `json:"base_url"`
}

type DomainConfigs struct {
	Antrean Config `json:"antrean"`
	PCare   Config `json:"pcare"`
}

func LoadConfig() (Config, error) {
	return LoadAntreanConfig()
}

func LoadAntreanConfig() (Config, error) {
	settingsMap, err := loadSettingsMap()
	if err != nil {
		return Config{}, err
	}

	return buildConfigFromSettings(DomainAntrean, "Antrean FKTP", settingsMap), nil
}

func LoadPCareConfig() (Config, error) {
	settingsMap, err := loadSettingsMap()
	if err != nil {
		return Config{}, err
	}

	return buildConfigFromSettings(DomainPCare, "P-Care", settingsMap), nil
}

func LoadDomainConfigs() (DomainConfigs, error) {
	settingsMap, err := loadSettingsMap()
	if err != nil {
		return DomainConfigs{}, err
	}

	return DomainConfigs{
		Antrean: buildConfigFromSettings(DomainAntrean, "Antrean FKTP", settingsMap),
		PCare:   buildConfigFromSettings(DomainPCare, "P-Care", settingsMap),
	}, nil
}

func loadSettingsMap() (map[string]string, error) {
	var settings []models.Setting
	if err := database.DB.Find(&settings).Error; err != nil {
		return nil, err
	}

	settingsMap := make(map[string]string, len(settings))
	for _, setting := range settings {
		settingsMap[setting.Key] = strings.TrimSpace(setting.Value)
	}

	return settingsMap, nil
}

func buildConfigFromSettings(domain string, label string, settingsMap map[string]string) Config {
	config := Config{
		Domain: domain,
		Label:  label,
	}

	switch domain {
	case DomainPCare:
		config.Enabled = parseBPJSSettingFlag(settingsMap["bpjs_pcare_enabled"], false)
		config.ConsID = firstNonEmptySetting(settingsMap["bpjs_pcare_cons_id"], settingsMap["bpjs_cons_id"])
		config.SecretKey = firstNonEmptySetting(settingsMap["bpjs_pcare_secret_key"], settingsMap["bpjs_secret_key"])
		config.UserKey = firstNonEmptySetting(settingsMap["bpjs_pcare_user_key"], settingsMap["bpjs_user_key"])
		config.BaseURL = settingsMap["bpjs_pcare_base_url"]
	default:
		config.Enabled = parseBPJSSettingFlag(settingsMap["bpjs_antrean_enabled"], false)
		config.ConsID = settingsMap["bpjs_cons_id"]
		config.SecretKey = settingsMap["bpjs_secret_key"]
		config.UserKey = settingsMap["bpjs_user_key"]
		config.BaseURL = settingsMap["bpjs_base_url"]
	}

	return config
}

func firstNonEmptySetting(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}

	return ""
}

func parseBPJSSettingFlag(value string, defaultValue bool) bool {
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

func (config Config) EnsureEnabled() error {
	if config.Enabled {
		return nil
	}

	if config.Domain == DomainPCare {
		return ErrPCareIntegrationDisabled
	}

	return ErrIntegrationDisabled
}

func (config Config) MissingRequiredFields() []string {
	missing := make([]string, 0, 4)

	if strings.TrimSpace(config.ConsID) == "" {
		missing = append(missing, "cons_id")
	}
	if strings.TrimSpace(config.SecretKey) == "" {
		missing = append(missing, "secret_key")
	}
	if strings.TrimSpace(config.UserKey) == "" {
		missing = append(missing, "user_key")
	}
	if strings.TrimSpace(config.BaseURL) == "" {
		missing = append(missing, "base_url")
	}

	return missing
}

func (config Config) PublicStatus() map[string]any {
	missingFields := config.MissingRequiredFields()
	return map[string]any{
		"domain":                config.Domain,
		"label":                 config.Label,
		"enabled":               config.Enabled,
		"disabled_reason":       config.disabledReason(),
		"base_url":              config.BaseURL,
		"cons_id_configured":    strings.TrimSpace(config.ConsID) != "",
		"secret_key_configured": strings.TrimSpace(config.SecretKey) != "",
		"user_key_configured":   strings.TrimSpace(config.UserKey) != "",
		"missing_fields":        missingFields,
		"ready":                 config.Enabled && len(missingFields) == 0,
	}
}

func (config Config) disabledReason() string {
	if config.Enabled {
		return ""
	}

	if config.Label != "" {
		return fmt.Sprintf("integrasi %s sedang dinonaktifkan", config.Label)
	}

	return "integrasi BPJS sedang dinonaktifkan"
}

func (configs DomainConfigs) PublicStatus() map[string]any {
	readyDomains := 0
	enabledDomains := 0

	for _, config := range []Config{configs.Antrean, configs.PCare} {
		if config.Enabled {
			enabledDomains++
		}
		if config.Enabled && len(config.MissingRequiredFields()) == 0 {
			readyDomains++
		}
	}

	return map[string]any{
		"provider":        "bpjs",
		"enabled_domains": enabledDomains,
		"ready_domains":   readyDomains,
		"total_domains":   2,
		"domains": map[string]any{
			DomainAntrean: configs.Antrean.PublicStatus(),
			DomainPCare:   configs.PCare.PublicStatus(),
		},
	}
}
