package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type userSummaryResponse struct {
	TotalCount           int64 `json:"total_count"`
	ActiveCount          int64 `json:"active_count"`
	InactiveCount        int64 `json:"inactive_count"`
	LinkedEmployeeCount  int64 `json:"linked_employee_count"`
	LinkedSATUSEHATCount int64 `json:"linked_satusehat_count"`
	UnlinkedUserCount    int64 `json:"unlinked_user_count"`
}

func GetUsers(c *gin.Context) {
	var users []models.User
	query := database.DB.Preload("Role")

	switch strings.ToLower(strings.TrimSpace(c.Query("employee_filter"))) {
	case "linked":
		query = query.Joins("JOIN employees ON employees.user_id = users.id")
	case "linked-required":
		query = query.Joins("JOIN employees ON employees.user_id = users.id").Where("employees.requires_satusehat = ?", true)
	case "linked-not-required":
		query = query.Joins("JOIN employees ON employees.user_id = users.id").Where("employees.requires_satusehat = ?", false)
	case "unlinked":
		query = query.Joins("LEFT JOIN employees ON employees.user_id = users.id").Where("employees.id IS NULL")
	}

	if isActive, ok := parseOptionalQueryBool(c.Query("is_active")); ok {
		query = query.Where("users.is_active = ?", isActive)
	}

	if err := query.Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": users})
}

func GetUser(c *gin.Context) {
	id := c.Param("id")

	var user models.User
	if err := database.DB.Preload("Role.Permissions").First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": user})
}

func GetUsersSummary(c *gin.Context) {
	summary := userSummaryResponse{}

	if err := database.DB.Model(&models.User{}).Count(&summary.TotalCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&models.User{}).Where("is_active = ?", true).Count(&summary.ActiveCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	summary.InactiveCount = summary.TotalCount - summary.ActiveCount

	if err := database.DB.Model(&models.User{}).
		Joins("JOIN employees ON employees.user_id = users.id").
		Count(&summary.LinkedEmployeeCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&models.Employee{}).
		Where("user_id IS NOT NULL AND requires_satusehat = ?", true).
		Count(&summary.LinkedSATUSEHATCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	summary.UnlinkedUserCount = summary.TotalCount - summary.LinkedEmployeeCount

	c.JSON(http.StatusOK, gin.H{"data": summary})
}

type CreateUserRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
	FullName string `json:"full_name" binding:"required"`
	RoleID   uint   `json:"role_id" binding:"required"`
}

func CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user := models.User{
		Email:    req.Email,
		Username: req.Username,
		FullName: req.FullName,
		RoleID:   req.RoleID,
		IsActive: true,
	}

	if err := user.HashPassword(req.Password); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	if err := database.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Role").First(&user, user.ID)
	c.JSON(http.StatusCreated, gin.H{"data": user})
}

type UpdateUserRequest struct {
	FullName string `json:"full_name"`
	RoleID   uint   `json:"role_id"`
	IsActive *bool  `json:"is_active"`
}

func UpdateUser(c *gin.Context) {
	id := c.Param("id")

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.FullName != "" {
		user.FullName = req.FullName
	}
	if req.RoleID > 0 {
		user.RoleID = req.RoleID
	}
	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}

	if err := database.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Role").First(&user, user.ID)
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func DeleteUser(c *gin.Context) {
	id := c.Param("id")

	idInt, _ := strconv.Atoi(id)
	userID, _ := c.Get("user_id")
	if uint(idInt) == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete your own account"})
		return
	}

	if err := database.DB.Delete(&models.User{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User deleted successfully"})
}
