package models

import (
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type User struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Email     string         `gorm:"uniqueIndex;not null;size:150" json:"email"`
	Username  string         `gorm:"uniqueIndex;not null;size:50" json:"username"`
	Password  string         `gorm:"not null;size:255" json:"-"`
	FullName  string         `gorm:"size:100" json:"full_name"`
	IsActive  bool           `gorm:"default:true" json:"is_active"`
	RoleID    uint           `gorm:"not null;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"role_id"`
	Role      Role           `gorm:"foreignKey:RoleID" json:"role,omitempty"`
	Employee  *Employee      `gorm:"foreignKey:UserID" json:"employee,omitempty"`
}

// HashPassword hashes the user password
func (u *User) HashPassword(password string) error {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	if err != nil {
		return err
	}
	u.Password = string(bytes)
	return nil
}

// CheckPassword checks if the provided password matches
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
	return err == nil
}
