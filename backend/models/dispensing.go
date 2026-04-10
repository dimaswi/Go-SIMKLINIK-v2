package models

import (
	"time"

	"gorm.io/gorm"
)

type Dispensing struct {
	ID                            uint                 `gorm:"primarykey" json:"id"`
	CreatedAt                     time.Time            `json:"created_at"`
	UpdatedAt                     time.Time            `json:"updated_at"`
	DeletedAt                     gorm.DeletedAt       `gorm:"index" json:"-"`
	VisitID                       uint                 `gorm:"not null;index" json:"visit_id"`
	MedicalRecordID               uint                 `gorm:"not null;index" json:"medical_record_id"`
	PrescriptionID                *uint                `gorm:"index" json:"prescription_id,omitempty"`
	PrescriptionCompoundID        *uint                `gorm:"index" json:"prescription_compound_id,omitempty"`
	MedicineID                    *uint                `gorm:"index" json:"medicine_id,omitempty"`
	Quantity                      int                  `json:"quantity"`
	BatchNumber                   string               `gorm:"size:50" json:"batch_number"`
	DispensedBy                   uint                 `gorm:"index" json:"dispensed_by"`
	DispensedAt                   *time.Time           `json:"dispensed_at"`
	Status                        string               `gorm:"size:20;default:'pending'" json:"status"`
	Notes                         string               `gorm:"type:text" json:"notes"`
	SatusehatMedicationDispenseID string               `gorm:"size:120;index" json:"satusehat_medication_dispense_id"`
	SatusehatSyncedAt             *time.Time           `json:"satusehat_synced_at"`
	Visit                         Visit                `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
	MedicalRecord                 MedicalRecord        `gorm:"foreignKey:MedicalRecordID" json:"medical_record,omitempty"`
	Prescription                  Prescription         `gorm:"foreignKey:PrescriptionID" json:"prescription,omitempty"`
	PrescriptionCompound          PrescriptionCompound `gorm:"foreignKey:PrescriptionCompoundID" json:"prescription_compound,omitempty"`
	Medicine                      Medicine             `gorm:"foreignKey:MedicineID" json:"medicine,omitempty"`
	Dispenser                     User                 `gorm:"foreignKey:DispensedBy" json:"dispenser,omitempty"`
}
