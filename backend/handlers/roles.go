package handlers

import (
	"net/http"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
)

func GetRoles(c *gin.Context) {
	var roles []models.Role
	if err := database.DB.Preload("Permissions").Find(&roles).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": roles})
}

func GetRole(c *gin.Context) {
	id := c.Param("id")

	var role models.Role
	if err := database.DB.Preload("Permissions").First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Role not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": role})
}

type CreateRoleRequest struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	PermissionIDs []uint `json:"permission_ids"`
}

func CreateRole(c *gin.Context) {
	var req CreateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := models.Role{
		Name:        req.Name,
		Description: req.Description,
	}

	if err := database.DB.Create(&role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(req.PermissionIDs) > 0 {
		var permissions []models.Permission
		database.DB.Find(&permissions, req.PermissionIDs)
		database.DB.Model(&role).Association("Permissions").Append(permissions)
	}

	database.DB.Preload("Permissions").First(&role, role.ID)
	c.JSON(http.StatusCreated, gin.H{"data": role})
}

func UpdateRole(c *gin.Context) {
	id := c.Param("id")

	var role models.Role
	if err := database.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Role not found"})
		return
	}

	var req CreateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var existing models.Role
	if err := database.DB.Unscoped().Where("LOWER(name) = LOWER(?) AND id <> ?", req.Name, role.ID).First(&existing).Error; err == nil {
		if existing.DeletedAt.Valid {
			database.DB.Model(&existing).Association("Permissions").Clear()
			database.DB.Unscoped().Delete(&existing)
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nama role sudah digunakan oleh role lain"})
			return
		}
	}

	role.Name = req.Name
	role.Description = req.Description

	if err := database.DB.Save(&role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.PermissionIDs != nil {
		var permissions []models.Permission
		if len(req.PermissionIDs) > 0 {
			database.DB.Find(&permissions, req.PermissionIDs)
		}
		database.DB.Model(&role).Association("Permissions").Replace(permissions)
	}

	database.DB.Preload("Permissions").First(&role, role.ID)
	c.JSON(http.StatusOK, gin.H{"data": role})
}

func DeleteRole(c *gin.Context) {
	id := c.Param("id")

	if err := database.DB.Delete(&models.Role{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Role deleted successfully"})
}
