package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/middleware"
	"starter/backend/models"
	"strings"

	"github.com/gin-gonic/gin"
)

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string       `json:"token"`
	User  UserResponse `json:"user"`
}

type UserResponse struct {
	ID       uint          `json:"id"`
	Email    string        `json:"email"`
	Username string        `json:"username"`
	FullName string        `json:"full_name"`
	IsActive bool          `json:"is_active"`
	RoleID   uint          `json:"role_id,omitempty"`
	Role     *RoleResponse `json:"role,omitempty"`
}

type RoleResponse struct {
	ID          uint                 `json:"id"`
	Name        string               `json:"name"`
	Description string               `json:"description"`
	Permissions []PermissionResponse `json:"permissions,omitempty"`
}

type PermissionResponse struct {
	ID          uint   `json:"id"`
	Name        string `json:"name"`
	Module      string `json:"module"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Actions     string `json:"actions"`
}

func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	username := strings.ToLower(strings.TrimSpace(req.Username))
	if err := database.DB.Preload("Role.Permissions").Where("LOWER(username) = ?", username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Username atau password tidak valid"})
		return
	}

	if !user.CheckPassword(req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Username atau password tidak valid"})
		return
	}

	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "Akun tidak aktif"})
		return
	}

	token, err := middleware.GenerateToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat sesi login"})
		return
	}

	response := LoginResponse{
		Token: token,
		User: UserResponse{
			ID:       user.ID,
			Email:    user.Email,
			Username: user.Username,
			FullName: user.FullName,
			IsActive: user.IsActive,
			RoleID:   user.RoleID,
		},
	}

	if user.Role.ID > 0 {
		roleResp := &RoleResponse{
			ID:          user.Role.ID,
			Name:        user.Role.Name,
			Description: user.Role.Description,
		}

		if len(user.Role.Permissions) > 0 {
			roleResp.Permissions = make([]PermissionResponse, len(user.Role.Permissions))
			for i, perm := range user.Role.Permissions {
				roleResp.Permissions[i] = PermissionResponse{
					ID:          perm.ID,
					Name:        perm.Name,
					Module:      perm.Module,
					Category:    perm.Category,
					Description: perm.Description,
					Actions:     perm.Actions,
				}
			}
		}

		response.User.Role = roleResp
	}

	c.JSON(http.StatusOK, response)
}

func GetProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user models.User
	if err := database.DB.Preload("Role.Permissions").First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	response := UserResponse{
		ID:       user.ID,
		Email:    user.Email,
		Username: user.Username,
		FullName: user.FullName,
		IsActive: user.IsActive,
		RoleID:   user.RoleID,
	}

	if user.Role.ID > 0 {
		roleResp := &RoleResponse{
			ID:          user.Role.ID,
			Name:        user.Role.Name,
			Description: user.Role.Description,
		}

		if len(user.Role.Permissions) > 0 {
			roleResp.Permissions = make([]PermissionResponse, len(user.Role.Permissions))
			for i, perm := range user.Role.Permissions {
				roleResp.Permissions[i] = PermissionResponse{
					ID:          perm.ID,
					Name:        perm.Name,
					Module:      perm.Module,
					Category:    perm.Category,
					Description: perm.Description,
					Actions:     perm.Actions,
				}
			}
		}

		response.Role = roleResp
	}

	c.JSON(http.StatusOK, response)
}
