package models

type Village struct {
	ID         int64    `gorm:"primaryKey;autoIncrement:false" json:"id"`
	DistrictID int64    `gorm:"not null;index" json:"district_id"`
	District   District `gorm:"foreignKey:DistrictID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"district,omitempty"`
	Name       string   `gorm:"size:180;not null;index" json:"name"`
}
