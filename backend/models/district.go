package models

type District struct {
	ID        int64   `gorm:"primaryKey;autoIncrement:false" json:"id"`
	RegencyID int64   `gorm:"not null;index" json:"regency_id"`
	Regency   Regency `gorm:"foreignKey:RegencyID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"regency,omitempty"`
	Name      string  `gorm:"size:160;not null;index" json:"name"`
}
