package satusehat

import (
	"fmt"
	"strings"

	"starter/backend/models"
)

func BuildPolyclinicOrganizationPreview(polyclinic models.Polyclinic, config Config) ResourcePreview {
	warnings := make([]string, 0, 4)
	identifierValue := buildPolyclinicOrganizationIdentifier(polyclinic)
	identifierSystem := buildPolyclinicOrganizationIdentifierSystem(config.OrganizationID)

	if strings.TrimSpace(config.OrganizationID) == "" {
		warnings = append(warnings, "Organization ID SATUSEHAT induk belum diisi; identifier dan partOf belum mengikuti pola Kemenkes.")
	}
	if strings.TrimSpace(polyclinic.Code) == "" {
		warnings = append(warnings, "Kode poli kosong; identifier organisasi poli memakai fallback berbasis ID lokal.")
	}
	if strings.TrimSpace(polyclinic.Name) == "" {
		warnings = append(warnings, "Nama poli kosong; Organization belum siap dikirim.")
	}

	resource := map[string]any{
		"resourceType": "Organization",
		"active":       polyclinic.IsActive,
		"identifier": []map[string]any{{
			"use":    "official",
			"system": identifierSystem,
			"value":  identifierValue,
		}},
		"type": []map[string]any{{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/CodeSystem/organization-type",
				"code":    "team",
				"display": "Organizational team",
			}},
		}},
		"name": strings.TrimSpace(polyclinic.Name),
	}

	if strings.TrimSpace(polyclinic.Description) != "" {
		resource["alias"] = []string{strings.TrimSpace(polyclinic.Description)}
	}

	if strings.TrimSpace(config.OrganizationID) != "" {
		resource["partOf"] = map[string]any{
			"reference": fmt.Sprintf("Organization/%s", strings.TrimSpace(config.OrganizationID)),
		}
	}

	if strings.TrimSpace(polyclinic.SatusehatOrganizationID) != "" {
		resource["id"] = strings.TrimSpace(polyclinic.SatusehatOrganizationID)
	}

	ready := strings.TrimSpace(polyclinic.Name) != "" && strings.TrimSpace(config.OrganizationID) != ""
	return ResourcePreview{Resource: resource, Warnings: warnings, Ready: ready}
}

func BuildPolyclinicLocationPreview(polyclinic models.Polyclinic, config Config) ResourcePreview {
	warnings := make([]string, 0, 5)
	identifierValue := buildPolyclinicLocationIdentifier(polyclinic)
	identifierSystem := buildPolyclinicLocationIdentifierSystem(config.OrganizationID)
	locationName := buildPolyclinicLocationName(polyclinic)
	managingOrganizationReference := "Organization/{satusehat_poli_organization_id}"

	if strings.TrimSpace(config.OrganizationID) == "" {
		warnings = append(warnings, "Organization ID SATUSEHAT induk belum diisi; identifier location belum mengikuti pola Kemenkes.")
	}
	if strings.TrimSpace(polyclinic.SatusehatOrganizationID) != "" {
		managingOrganizationReference = fmt.Sprintf("Organization/%s", strings.TrimSpace(polyclinic.SatusehatOrganizationID))
	} else {
		warnings = append(warnings, "Organization SATUSEHAT untuk poli ini belum tersedia; managingOrganization masih placeholder.")
	}
	if strings.TrimSpace(polyclinic.Name) == "" {
		warnings = append(warnings, "Nama poli kosong; Location belum siap dikirim.")
	}
	if strings.TrimSpace(polyclinic.Code) == "" {
		warnings = append(warnings, "Kode poli kosong; identifier location memakai fallback berbasis ID lokal.")
	}

	resource := map[string]any{
		"resourceType": "Location",
		"identifier": []map[string]any{{
			"system": identifierSystem,
			"value":  identifierValue,
		}},
		"status":      "active",
		"name":        locationName,
		"description": firstNonEmpty(strings.TrimSpace(polyclinic.Description), locationName),
		"mode":        "instance",
		"physicalType": map[string]any{
			"coding": []map[string]any{{
				"system":  "http://terminology.hl7.org/CodeSystem/location-physical-type",
				"code":    "ro",
				"display": "Room",
			}},
		},
		"managingOrganization": map[string]any{
			"reference": managingOrganizationReference,
		},
	}

	if strings.TrimSpace(polyclinic.SatusehatLocationID) != "" {
		resource["id"] = strings.TrimSpace(polyclinic.SatusehatLocationID)
	}

	ready := strings.TrimSpace(locationName) != "" && strings.TrimSpace(config.OrganizationID) != "" && strings.TrimSpace(polyclinic.SatusehatOrganizationID) != ""
	return ResourcePreview{Resource: resource, Warnings: warnings, Ready: ready}
}

func buildPolyclinicOrganizationIdentifierSystem(parentOrganizationID string) string {
	trimmed := strings.TrimSpace(parentOrganizationID)
	if trimmed == "" {
		return buildLocalIdentifierSystem("organization", parentOrganizationID)
	}
	return fmt.Sprintf("http://sys-ids.kemkes.go.id/organization/%s", trimmed)
}

func buildPolyclinicLocationIdentifierSystem(parentOrganizationID string) string {
	trimmed := strings.TrimSpace(parentOrganizationID)
	if trimmed == "" {
		return buildLocalIdentifierSystem("location", parentOrganizationID)
	}
	return fmt.Sprintf("http://sys-ids.kemkes.go.id/location/%s", trimmed)
}

func buildPolyclinicOrganizationIdentifier(polyclinic models.Polyclinic) string {
	if code := strings.TrimSpace(polyclinic.Code); code != "" {
		return code
	}
	return fmt.Sprintf("POLI-%d", polyclinic.ID)
}

func buildPolyclinicLocationIdentifier(polyclinic models.Polyclinic) string {
	return buildPolyclinicOrganizationIdentifier(polyclinic) + "-ROOM"
}

func buildPolyclinicLocationName(polyclinic models.Polyclinic) string {
	name := strings.TrimSpace(polyclinic.Name)
	if name == "" {
		return ""
	}
	return "Ruang " + name
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
