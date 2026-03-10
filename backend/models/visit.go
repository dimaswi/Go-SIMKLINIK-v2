package models

import (
	"time"

	"gorm.io/gorm"
)

type Visit struct {
	ID               uint           `gorm:"primarykey" json:"id"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
	VisitNumber      string         `gorm:"uniqueIndex;not null;size:20" json:"visit_number"`
	PatientID        uint           `gorm:"not null;index" json:"patient_id"`
	VisitDate        time.Time      `gorm:"not null" json:"visit_date"`
	PolyclinicID     uint           `gorm:"not null;index" json:"polyclinic_id"`
	DoctorID         uint           `gorm:"not null;index" json:"doctor_id"`
	QueueNumber      int            `json:"queue_number"`
	QueueStatus      string         `gorm:"size:20;default:'waiting'" json:"queue_status"`
	PaymentType      string         `gorm:"size:20" json:"payment_type"`
	InsuranceNumber  string         `gorm:"size:50" json:"insurance_number"`
	Complaint        string         `gorm:"type:text" json:"complaint"`
	VisitType        string         `gorm:"size:10" json:"visit_type"`
	Priority         string         `gorm:"size:10;default:'normal'" json:"priority"`
	Status           string         `gorm:"size:20;default:'registered'" json:"status"`
	RegisteredBy     uint           `gorm:"index" json:"registered_by"`
	Patient          Patient        `gorm:"foreignKey:PatientID" json:"patient,omitempty"`
	Polyclinic       Polyclinic     `gorm:"foreignKey:PolyclinicID" json:"polyclinic,omitempty"`
	Doctor           Doctor         `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
	RegisteredByUser User           `gorm:"foreignKey:RegisteredBy" json:"registered_by_user,omitempty"`
}
