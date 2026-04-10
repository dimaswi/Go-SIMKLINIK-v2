package models

type Regency struct {
	ID         int64    `gorm:"primaryKey;autoIncrement:false" json:"id"`
	ProvinceID int64    `gorm:"not null;index" json:"province_id"`
	Province   Province `gorm:"foreignKey:ProvinceID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"province,omitempty"`
	Name       string   `gorm:"size:160;not null;index" json:"name"`
}
