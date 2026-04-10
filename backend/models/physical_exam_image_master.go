package models

import (
	"time"

	"gorm.io/gorm"
)

type PhysicalExamImageMaster struct {
	ID          uint                     `gorm:"primarykey" json:"id"`
	CreatedAt   time.Time                `json:"created_at"`
	UpdatedAt   time.Time                `json:"updated_at"`
	DeletedAt   gorm.DeletedAt           `gorm:"index" json:"-"`
	Name        string                   `gorm:"size:150;not null" json:"name"`
	Category    string                   `gorm:"size:100;index;not null" json:"category"`
	Location    string                   `gorm:"size:100;index" json:"location"`
	Description string                   `gorm:"type:text" json:"description"`
	ImageURL    string                   `gorm:"size:255;not null" json:"image_url"`
	IsActive    bool                     `gorm:"default:true" json:"is_active"`
	SortOrder   int                      `gorm:"default:0" json:"sort_order"`
	Selections  []MedicalRecordImagePick `gorm:"foreignKey:PhysicalExamImageMasterID" json:"-"`
}

type MedicalRecordImagePick struct {
	ID                        uint                           `gorm:"primarykey" json:"id"`
	CreatedAt                 time.Time                      `json:"created_at"`
	UpdatedAt                 time.Time                      `json:"updated_at"`
	DeletedAt                 gorm.DeletedAt                 `gorm:"index" json:"-"`
	MedicalRecordID           uint                           `gorm:"not null;index" json:"medical_record_id"`
	PhysicalExamImageMasterID uint                           `gorm:"not null;index" json:"physical_exam_image_master_id"`
	Notes                     string                         `gorm:"type:text" json:"notes"`
	SortOrder                 int                            `gorm:"default:0" json:"sort_order"`
	MedicalRecord             MedicalRecord                  `gorm:"foreignKey:MedicalRecordID" json:"-"`
	PhysicalExamImageMaster   PhysicalExamImageMaster        `gorm:"foreignKey:PhysicalExamImageMasterID" json:"master,omitempty"`
	Markers                   []MedicalRecordImagePickMarker `gorm:"foreignKey:MedicalRecordImagePickID" json:"markers,omitempty"`
}

type MedicalRecordImagePickMarker struct {
	ID                       uint                   `gorm:"primarykey" json:"id"`
	CreatedAt                time.Time              `json:"created_at"`
	UpdatedAt                time.Time              `json:"updated_at"`
	DeletedAt                gorm.DeletedAt         `gorm:"index" json:"-"`
	MedicalRecordImagePickID uint                   `gorm:"not null;index" json:"medical_record_image_pick_id"`
	MarkerLabel              string                 `gorm:"size:100" json:"marker_label"`
	PosX                     float64                `json:"pos_x"`
	PosY                     float64                `json:"pos_y"`
	MedicalRecordImagePick   MedicalRecordImagePick `gorm:"foreignKey:MedicalRecordImagePickID" json:"-"`
}
