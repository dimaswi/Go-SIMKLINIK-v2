package satusehat

import (
	"fmt"
	"strings"

	"starter/backend/models"
)

type PractitionerActor struct {
	ResourceID string
	Display    string
	Source     string
}

func (actor PractitionerActor) Ready() bool {
	return strings.TrimSpace(actor.ResourceID) != ""
}

func (actor PractitionerActor) Reference() string {
	if !actor.Ready() {
		return ""
	}
	return fmt.Sprintf("Practitioner/%s", strings.TrimSpace(actor.ResourceID))
}

func ResolveEmployeePractitionerActor(employee *models.Employee) PractitionerActor {
	if employee == nil {
		return PractitionerActor{}
	}

	return PractitionerActor{
		ResourceID: strings.TrimSpace(employee.SatusehatPractitionerID),
		Display:    strings.TrimSpace(firstNonEmptyText(employee.FullName, employee.EmployeeCode)),
		Source:     "employee",
	}
}

func ResolveUserPractitionerActor(user *models.User) PractitionerActor {
	if user == nil {
		return PractitionerActor{}
	}

	if actor := ResolveEmployeePractitionerActor(user.Employee); actor.Ready() {
		return actor
	}

	return PractitionerActor{
		Display: strings.TrimSpace(firstNonEmptyText(user.FullName, user.Username, user.Email)),
		Source:  "user",
	}
}

func ResolveDoctorPractitionerActor(doctor models.Doctor) PractitionerActor {
	if actor := ResolveEmployeePractitionerActor(&doctor.Employee); actor.Ready() {
		if actor.Display == "" {
			actor.Display = strings.TrimSpace(doctor.FullName)
		}
		return actor
	}

	return PractitionerActor{
		ResourceID: strings.TrimSpace(doctor.SatusehatPractitionerID),
		Display:    strings.TrimSpace(firstNonEmptyText(doctor.FullName, doctor.Specialization)),
		Source:     "doctor",
	}
}

func ResolveMedicalRecordRequesterActor(record models.MedicalRecord) PractitionerActor {
	return ResolveDoctorPractitionerActor(record.Doctor)
}

func ResolveLaboratoryPerformerActor(item models.LaboratoryOrderItem) PractitionerActor {
	if actor := ResolveUserPractitionerActor(item.ResultByUser); actor.Ready() {
		return actor
	}
	if actor := ResolveUserPractitionerActor(item.MedicalRecord.LaboratoryProcessor); actor.Ready() {
		return actor
	}
	return ResolveDoctorPractitionerActor(item.MedicalRecord.Doctor)
}

func ResolveRadiologyPerformerActor(item models.RadiologyOrderItem) PractitionerActor {
	if actor := ResolveUserPractitionerActor(item.ResultByUser); actor.Ready() {
		return actor
	}
	if actor := ResolveUserPractitionerActor(item.MedicalRecord.RadiologyProcessor); actor.Ready() {
		return actor
	}
	return ResolveDoctorPractitionerActor(item.MedicalRecord.Doctor)
}

func ResolveDispensingPerformerActor(dispensing models.Dispensing) PractitionerActor {
	if actor := ResolveUserPractitionerActor(&dispensing.Dispenser); actor.Ready() {
		return actor
	}
	if actor := ResolveUserPractitionerActor(dispensing.MedicalRecord.PrescriptionProcessor); actor.Ready() {
		return actor
	}
	return ResolveDoctorPractitionerActor(dispensing.MedicalRecord.Doctor)
}
