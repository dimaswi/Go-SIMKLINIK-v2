package models

import "time"

type RegistrationQueue struct {
	ID                  uint       `gorm:"primarykey" json:"id"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	QueueDate           time.Time  `gorm:"not null;index;uniqueIndex:idx_registration_queue_date_ticket,priority:1" json:"queue_date"`
	TicketNumber        int        `gorm:"not null;uniqueIndex:idx_registration_queue_date_ticket,priority:2" json:"ticket_number"`
	Status              string     `gorm:"size:20;default:'waiting';index" json:"status"`
	CalledAt            *time.Time `json:"called_at,omitempty"`
	ProcessingStartedAt *time.Time `json:"processing_started_at,omitempty"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	CancelledAt         *time.Time `json:"cancelled_at,omitempty"`
	VisitID             *uint      `gorm:"index" json:"visit_id,omitempty"`
	Visit               *Visit     `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
	NIK                 string     `gorm:"size:20;index" json:"nik"`
	PatientName         string     `gorm:"size:150" json:"patient_name"`
	Phone               string     `gorm:"size:30" json:"phone"`
	PatientID           *uint       `gorm:"index" json:"patient_id,omitempty"`
	Patient             *Patient    `gorm:"foreignKey:PatientID" json:"patient,omitempty"`
	PolyclinicID        *uint       `gorm:"index" json:"polyclinic_id,omitempty"`
	Polyclinic          *Polyclinic `gorm:"foreignKey:PolyclinicID" json:"polyclinic,omitempty"`
	DoctorID            *uint       `gorm:"index" json:"doctor_id,omitempty"`
	Doctor              *Doctor     `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
	IsNewPatient        bool        `gorm:"default:false" json:"is_new_patient"`
}
