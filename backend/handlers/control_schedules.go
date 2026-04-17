package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

type controlScheduleIDRow struct {
	ID uint `gorm:"column:id"`
}

type ControlScheduleItem struct {
	MedicalRecordID        uint      `json:"medical_record_id"`
	VisitID                uint      `json:"visit_id"`
	VisitNumber            string    `json:"visit_number"`
	VisitDate              time.Time `json:"visit_date"`
	PatientID              uint      `json:"patient_id"`
	PatientName            string    `json:"patient_name"`
	PatientPhone           string    `json:"patient_phone"`
	MedicalRecordNumber    string    `json:"medical_record_number"`
	PolyclinicID           uint      `json:"polyclinic_id"`
	DoctorName             string    `json:"doctor_name"`
	DoctorID               uint      `json:"doctor_id"`
	PolyclinicName         string    `json:"polyclinic_name"`
	PaymentType            string    `json:"payment_type"`
	InsuranceNumber        string    `json:"insurance_number"`
	FollowUpAt             time.Time `json:"follow_up_at"`
	FollowUpInstruction    string    `json:"follow_up_instruction"`
	DischargeCondition     string    `json:"discharge_condition"`
	Notes                  string    `json:"notes"`
	DaysUntilFollowUp      int       `json:"days_until_follow_up"`
	ScheduleStatus         string    `json:"schedule_status"`
	ScheduleStatusLabel    string    `json:"schedule_status_label"`
	ScheduleStatusTone     string    `json:"schedule_status_tone"`
	ControlLetterPrintPath string    `json:"control_letter_print_path"`
	EMRPath                string    `json:"emr_path"`
}

func startOfLocalDay(value time.Time) time.Time {
	localValue := value.In(time.Local)
	year, month, day := localValue.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, time.Local)
}

func buildControlScheduleIndicator(followUpAt time.Time) (int, string, string, string) {
	today := startOfLocalDay(time.Now())
	target := startOfLocalDay(followUpAt)
	daysUntil := int(target.Sub(today).Hours() / 24)

	switch {
	case daysUntil < 0:
		return daysUntil, "overdue", "Terlambat", "destructive"
	case daysUntil == 0:
		return daysUntil, "today", "Hari ini", "warning"
	case daysUntil <= 3:
		return daysUntil, "soon", "Mendekati jadwal", "warning"
	default:
		return daysUntil, "upcoming", "Terjadwal", "success"
	}
}

func GetControlSchedules(c *gin.Context) {
	var latestOutcomeRows []controlScheduleIDRow
	if err := database.DB.Raw(`
		SELECT DISTINCT ON (mr.visit_id) mr.id
		FROM medical_records mr
		JOIN visits v ON v.id = mr.visit_id
		WHERE mr.section_type = 'outcome'
			AND mr.status <> 'cancelled'
			AND LOWER(TRIM(COALESCE(mr.disposition, ''))) = 'kontrol'
			AND mr.follow_up_at IS NOT NULL
			AND v.status = 'completed'
		ORDER BY mr.visit_id, mr.updated_at DESC, mr.created_at DESC, mr.id DESC
	`).Scan(&latestOutcomeRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(latestOutcomeRows) == 0 {
		c.JSON(http.StatusOK, gin.H{"data": []ControlScheduleItem{}})
		return
	}

	ids := make([]uint, 0, len(latestOutcomeRows))
	for _, row := range latestOutcomeRows {
		if row.ID != 0 {
			ids = append(ids, row.ID)
		}
	}

	var outcomes []models.MedicalRecord
	if err := database.DB.
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Doctor").
		Preload("Visit.Polyclinic").
		Where("id IN ?", ids).
		Find(&outcomes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	items := make([]ControlScheduleItem, 0, len(outcomes))
	for _, outcome := range outcomes {
		if outcome.FollowUpAt == nil || outcome.FollowUpAt.IsZero() {
			continue
		}

		visit := outcome.Visit
		daysUntil, status, statusLabel, statusTone := buildControlScheduleIndicator(*outcome.FollowUpAt)
		visitIDText := strconv.FormatUint(uint64(visit.ID), 10)

		items = append(items, ControlScheduleItem{
			MedicalRecordID:        outcome.ID,
			VisitID:                visit.ID,
			VisitNumber:            strings.TrimSpace(visit.VisitNumber),
			VisitDate:              visit.VisitDate,
			PatientID:              visit.PatientID,
			PatientName:            strings.TrimSpace(visit.Patient.FullName),
			PatientPhone:           strings.TrimSpace(visit.Patient.Phone),
			MedicalRecordNumber:    strings.TrimSpace(visit.Patient.MedicalRecordNumber),
			PolyclinicID:           visit.PolyclinicID,
			DoctorName:             strings.TrimSpace(visit.Doctor.FullName),
			DoctorID:               visit.DoctorID,
			PolyclinicName:         strings.TrimSpace(visit.Polyclinic.Name),
			PaymentType:            strings.TrimSpace(visit.PaymentType),
			InsuranceNumber:        strings.TrimSpace(visit.InsuranceNumber),
			FollowUpAt:             *outcome.FollowUpAt,
			FollowUpInstruction:    strings.TrimSpace(outcome.FollowUpInstruction),
			DischargeCondition:     strings.TrimSpace(outcome.DischargeCondition),
			Notes:                  strings.TrimSpace(outcome.Notes),
			DaysUntilFollowUp:      daysUntil,
			ScheduleStatus:         status,
			ScheduleStatusLabel:    statusLabel,
			ScheduleStatusTone:     statusTone,
			ControlLetterPrintPath: "/api/medical-records/visit/" + visitIDText + "/print/surat-kontrol",
			EMRPath:                "/emr/" + visitIDText,
		})
	}

	sort.SliceStable(items, func(i, j int) bool {
		if items[i].FollowUpAt.Equal(items[j].FollowUpAt) {
			return items[i].VisitID > items[j].VisitID
		}
		return items[i].FollowUpAt.Before(items[j].FollowUpAt)
	})

	c.JSON(http.StatusOK, gin.H{"data": items})
}
