package models

import (
	"time"

	"gorm.io/gorm"
)

type Patient struct {
	ID                       uint           `gorm:"primarykey" json:"id"`
	CreatedAt                time.Time      `json:"created_at"`
	UpdatedAt                time.Time      `json:"updated_at"`
	DeletedAt                gorm.DeletedAt `gorm:"index" json:"-"`
	MedicalRecordNumber      string         `gorm:"uniqueIndex;not null;size:20" json:"medical_record_number"`
	NIK                      string         `gorm:"uniqueIndex;size:20" json:"nik"`
	FullName                 string         `gorm:"not null;size:100" json:"full_name"`
	BirthDate                *time.Time     `json:"birth_date"`
	BirthPlace               string         `gorm:"size:100" json:"birth_place"`
	Gender                   string         `gorm:"size:1" json:"gender"`
	BloodType                string         `gorm:"size:5" json:"blood_type"`
	MaritalStatus            string         `gorm:"size:20" json:"marital_status"`
	Religion                 string         `gorm:"size:20" json:"religion"`
	Education                string         `gorm:"size:50" json:"education"`
	Occupation               string         `gorm:"size:100" json:"occupation"`
	Address                  string         `gorm:"type:text" json:"address"`
	RT                       string         `gorm:"size:5" json:"rt"`
	RW                       string         `gorm:"size:5" json:"rw"`
	Kelurahan                string         `gorm:"size:100" json:"kelurahan"`
	Kecamatan                string         `gorm:"size:100" json:"kecamatan"`
	City                     string         `gorm:"size:100" json:"city"`
	Province                 string         `gorm:"size:100" json:"province"`
	PostalCode               string         `gorm:"size:10" json:"postal_code"`
	Phone                    string         `gorm:"size:20" json:"phone"`
	Email                    string         `gorm:"size:150" json:"email"`
	EmergencyContactName     string         `gorm:"size:100" json:"emergency_contact_name"`
	EmergencyContactPhone    string         `gorm:"size:20" json:"emergency_contact_phone"`
	EmergencyContactRelation string         `gorm:"size:50" json:"emergency_contact_relation"`
	InsuranceType            string         `gorm:"size:20" json:"insurance_type"`
	InsuranceNumber          string         `gorm:"size:50" json:"insurance_number"`
	Allergies                string         `gorm:"type:text" json:"allergies"`
	Notes                    string         `gorm:"type:text" json:"notes"`
	Photo                    string         `gorm:"size:255" json:"photo"`
	SatusehatPatientID       string         `gorm:"size:120;index" json:"satusehat_patient_id"`
	SatusehatSyncedAt        *time.Time     `json:"satusehat_synced_at"`
	IsActive                 bool           `gorm:"default:true" json:"is_active"`
}
