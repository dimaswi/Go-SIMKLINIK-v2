package models

type Province struct {
	ID   int64  `gorm:"primaryKey;autoIncrement:false" json:"id"`
	Name string `gorm:"size:120;not null;index" json:"name"`
}
