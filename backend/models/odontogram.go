package models

import (
	"time"

	"gorm.io/gorm"
)

type OdontogramEntry struct {
	ID           uint              `gorm:"primarykey" json:"id"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
	DeletedAt    gorm.DeletedAt    `gorm:"index" json:"-"`
	VisitID      uint              `gorm:"not null;index" json:"visit_id"`
	PatientID    uint              `gorm:"not null;index" json:"patient_id"`
	DoctorID     uint              `gorm:"not null;index" json:"doctor_id"`
	PolyclinicID uint              `gorm:"not null;index" json:"polyclinic_id"`
	SheetKey     string            `gorm:"size:40;not null;default:'odontogram';index" json:"sheet_key"`
	ChartType    string            `gorm:"size:20;not null;default:'permanent'" json:"chart_type"`
	Notes        string            `gorm:"type:text" json:"notes"`
	Status       string            `gorm:"size:10;not null;default:'draft';index" json:"status"`
	Visit        Visit             `gorm:"foreignKey:VisitID" json:"visit,omitempty"`
	Patient      Patient           `gorm:"foreignKey:PatientID" json:"patient,omitempty"`
	Doctor       Doctor            `gorm:"foreignKey:DoctorID" json:"doctor,omitempty"`
	Polyclinic   Polyclinic        `gorm:"foreignKey:PolyclinicID" json:"polyclinic,omitempty"`
	Teeth        []OdontogramTooth `gorm:"foreignKey:OdontogramEntryID" json:"teeth,omitempty"`
}

type OdontogramTooth struct {
	ID                uint                       `gorm:"primarykey" json:"id"`
	CreatedAt         time.Time                  `json:"created_at"`
	UpdatedAt         time.Time                  `json:"updated_at"`
	DeletedAt         gorm.DeletedAt             `gorm:"index" json:"-"`
	OdontogramEntryID uint                       `gorm:"not null;index" json:"odontogram_entry_id"`
	ToothNumber       string                     `gorm:"size:10;not null;index" json:"tooth_number"`
	ToothCondition    string                     `gorm:"size:40;not null;default:'sound'" json:"tooth_condition"`
	Notes             string                     `gorm:"type:text" json:"notes"`
	SortOrder         int                        `gorm:"default:0" json:"sort_order"`
	Entry             OdontogramEntry            `gorm:"foreignKey:OdontogramEntryID" json:"-"`
	SurfaceFindings   []OdontogramSurfaceFinding `gorm:"foreignKey:OdontogramToothID" json:"surface_findings,omitempty"`
}

type OdontogramSurfaceFinding struct {
	ID                uint            `gorm:"primarykey" json:"id"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
	DeletedAt         gorm.DeletedAt  `gorm:"index" json:"-"`
	OdontogramToothID uint            `gorm:"not null;index" json:"odontogram_tooth_id"`
	SurfaceCode       string          `gorm:"size:30;not null;index" json:"surface_code"`
	ConditionCode     string          `gorm:"size:40;not null" json:"condition_code"`
	Notes             string          `gorm:"type:text" json:"notes"`
	Tooth             OdontogramTooth `gorm:"foreignKey:OdontogramToothID" json:"-"`
}
