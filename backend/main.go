package main

import (
	"log"
	"starter/backend/config"
	"starter/backend/database"
	"starter/backend/handlers"
	"starter/backend/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using default configuration")
	}

	// Load config
	cfg := config.Load()

	// Set JWT secret
	middleware.SetJWTSecret(cfg.JWTSecret)

	// Connect to database
	if err := database.Connect(cfg.DatabaseDSN); err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Run migrations
	if err := database.Migrate(); err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Setup Gin router
	r := gin.Default()

	// Serve static files for uploads
	r.Static("/uploads", "./uploads")

	// CORS middleware
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Public routes
	api := r.Group("/api")
	{
		api.POST("/auth/login", handlers.Login)
		api.GET("/settings", handlers.GetSettings) // Public access to settings

		// Protected routes
		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware())
		{
			protected.GET("/auth/profile", handlers.GetProfile)

			// Settings routes
			protected.PUT("/settings", handlers.UpdateSettings)
			protected.POST("/settings/upload", handlers.UploadLogo)

			// Users routes (with RBAC)
			protected.GET("/users", middleware.RequirePermission("users.view"), handlers.GetUsers)
			protected.GET("/users/:id", middleware.RequirePermission("users.view"), handlers.GetUser)
			protected.POST("/users", middleware.RequirePermission("users.create"), handlers.CreateUser)
			protected.PUT("/users/:id", middleware.RequirePermission("users.update"), handlers.UpdateUser)
			protected.DELETE("/users/:id", middleware.RequirePermission("users.delete"), handlers.DeleteUser)

			// Roles routes (with RBAC)
			protected.GET("/roles", middleware.RequirePermission("roles.view"), handlers.GetRoles)
			protected.GET("/roles/:id", middleware.RequirePermission("roles.view"), handlers.GetRole)
			protected.POST("/roles", middleware.RequirePermission("roles.create"), handlers.CreateRole)
			protected.PUT("/roles/:id", middleware.RequirePermission("roles.update"), handlers.UpdateRole)
			protected.DELETE("/roles/:id", middleware.RequirePermission("roles.delete"), handlers.DeleteRole)

			// Permissions routes
			protected.GET("/permissions", middleware.RequirePermission("permissions.view"), handlers.GetPermissions)
			protected.GET("/permissions/by-module", middleware.RequirePermission("permissions.view"), handlers.GetPermissionsByModule)
			protected.GET("/permissions/:id", middleware.RequirePermission("permissions.view"), handlers.GetPermission)
			protected.POST("/permissions", middleware.RequirePermission("permissions.create"), handlers.CreatePermission)
			protected.PUT("/permissions/:id", middleware.RequirePermission("permissions.update"), handlers.UpdatePermission)
			protected.DELETE("/permissions/:id", middleware.RequirePermission("permissions.delete"), handlers.DeletePermission)

			// ========================
			// Phase 1: Master Data
			// ========================

			// Polyclinics
			protected.GET("/polyclinics", middleware.RequirePermission("polyclinics.view"), handlers.GetPolyclinics)
			protected.GET("/polyclinics/:id", middleware.RequirePermission("polyclinics.view"), handlers.GetPolyclinic)
			protected.POST("/polyclinics", middleware.RequirePermission("polyclinics.create"), handlers.CreatePolyclinic)
			protected.PUT("/polyclinics/:id", middleware.RequirePermission("polyclinics.update"), handlers.UpdatePolyclinic)
			protected.DELETE("/polyclinics/:id", middleware.RequirePermission("polyclinics.delete"), handlers.DeletePolyclinic)

			// Doctors
			protected.GET("/doctors", middleware.RequirePermission("doctors.view"), handlers.GetDoctors)
			protected.GET("/doctors/:id", middleware.RequirePermission("doctors.view"), handlers.GetDoctor)
			protected.POST("/doctors", middleware.RequirePermission("doctors.create"), handlers.CreateDoctor)
			protected.PUT("/doctors/:id", middleware.RequirePermission("doctors.update"), handlers.UpdateDoctor)
			protected.DELETE("/doctors/:id", middleware.RequirePermission("doctors.delete"), handlers.DeleteDoctor)

			// Doctor Schedules
			protected.GET("/doctor-schedules", middleware.RequirePermission("doctor_schedules.view"), handlers.GetDoctorSchedules)
			protected.GET("/doctor-schedules/:id", middleware.RequirePermission("doctor_schedules.view"), handlers.GetDoctorSchedule)
			protected.POST("/doctor-schedules", middleware.RequirePermission("doctor_schedules.create"), handlers.CreateDoctorSchedule)
			protected.PUT("/doctor-schedules/:id", middleware.RequirePermission("doctor_schedules.update"), handlers.UpdateDoctorSchedule)
			protected.DELETE("/doctor-schedules/:id", middleware.RequirePermission("doctor_schedules.delete"), handlers.DeleteDoctorSchedule)

			// ICD-10 (read-only search)
			protected.GET("/icd10", middleware.RequirePermission("icd10.view"), handlers.GetICD10)

			// Medicines
			protected.GET("/medicines", middleware.RequirePermission("medicines.view"), handlers.GetMedicines)
			protected.GET("/medicines/:id", middleware.RequirePermission("medicines.view"), handlers.GetMedicine)
			protected.POST("/medicines", middleware.RequirePermission("medicines.create"), handlers.CreateMedicine)
			protected.PUT("/medicines/:id", middleware.RequirePermission("medicines.update"), handlers.UpdateMedicine)
			protected.DELETE("/medicines/:id", middleware.RequirePermission("medicines.delete"), handlers.DeleteMedicine)

			// Medicine Categories
			protected.GET("/medicine-categories", middleware.RequirePermission("medicines.view"), handlers.GetMedicineCategories)
			protected.GET("/medicine-categories/:id", middleware.RequirePermission("medicines.view"), handlers.GetMedicineCategory)
			protected.POST("/medicine-categories", middleware.RequirePermission("medicines.create"), handlers.CreateMedicineCategory)
			protected.PUT("/medicine-categories/:id", middleware.RequirePermission("medicines.update"), handlers.UpdateMedicineCategory)
			protected.DELETE("/medicine-categories/:id", middleware.RequirePermission("medicines.delete"), handlers.DeleteMedicineCategory)

			// Units
			protected.GET("/units", middleware.RequirePermission("medicines.view"), handlers.GetUnits)
			protected.GET("/units/:id", middleware.RequirePermission("medicines.view"), handlers.GetUnit)
			protected.POST("/units", middleware.RequirePermission("medicines.create"), handlers.CreateUnit)
			protected.PUT("/units/:id", middleware.RequirePermission("medicines.update"), handlers.UpdateUnit)
			protected.DELETE("/units/:id", middleware.RequirePermission("medicines.delete"), handlers.DeleteUnit)

			// Medical Services
			protected.GET("/medical-services", middleware.RequirePermission("medical_services.view"), handlers.GetMedicalServices)
			protected.GET("/medical-services/:id", middleware.RequirePermission("medical_services.view"), handlers.GetMedicalService)
			protected.POST("/medical-services", middleware.RequirePermission("medical_services.create"), handlers.CreateMedicalService)
			protected.PUT("/medical-services/:id", middleware.RequirePermission("medical_services.update"), handlers.UpdateMedicalService)
			protected.DELETE("/medical-services/:id", middleware.RequirePermission("medical_services.delete"), handlers.DeleteMedicalService)

			// Service Categories
			protected.GET("/service-categories", middleware.RequirePermission("medical_services.view"), handlers.GetServiceCategories)
			protected.GET("/service-categories/:id", middleware.RequirePermission("medical_services.view"), handlers.GetServiceCategory)
			protected.POST("/service-categories", middleware.RequirePermission("medical_services.create"), handlers.CreateServiceCategory)
			protected.PUT("/service-categories/:id", middleware.RequirePermission("medical_services.update"), handlers.UpdateServiceCategory)
			protected.DELETE("/service-categories/:id", middleware.RequirePermission("medical_services.delete"), handlers.DeleteServiceCategory)

			// Payment Methods
			protected.GET("/payment-methods", middleware.RequirePermission("settings.view"), handlers.GetPaymentMethods)
			protected.GET("/payment-methods/:id", middleware.RequirePermission("settings.view"), handlers.GetPaymentMethod)
			protected.POST("/payment-methods", middleware.RequirePermission("settings.update"), handlers.CreatePaymentMethod)
			protected.PUT("/payment-methods/:id", middleware.RequirePermission("settings.update"), handlers.UpdatePaymentMethod)
			protected.DELETE("/payment-methods/:id", middleware.RequirePermission("settings.update"), handlers.DeletePaymentMethod)

			// Suppliers
			protected.GET("/suppliers", middleware.RequirePermission("suppliers.view"), handlers.GetSuppliers)
			protected.GET("/suppliers/:id", middleware.RequirePermission("suppliers.view"), handlers.GetSupplier)
			protected.POST("/suppliers", middleware.RequirePermission("suppliers.create"), handlers.CreateSupplier)
			protected.PUT("/suppliers/:id", middleware.RequirePermission("suppliers.update"), handlers.UpdateSupplier)
			protected.DELETE("/suppliers/:id", middleware.RequirePermission("suppliers.delete"), handlers.DeleteSupplier)

			// ========================
			// Purchasing & Stock
			// ========================

			// Purchase Orders
			protected.GET("/purchase-orders", middleware.RequirePermission("purchase_orders.view"), handlers.GetPurchaseOrders)
			protected.GET("/purchase-orders/:id", middleware.RequirePermission("purchase_orders.view"), handlers.GetPurchaseOrder)
			protected.POST("/purchase-orders", middleware.RequirePermission("purchase_orders.create"), handlers.CreatePurchaseOrder)
			protected.PUT("/purchase-orders/:id", middleware.RequirePermission("purchase_orders.update"), handlers.UpdatePurchaseOrder)
			protected.DELETE("/purchase-orders/:id", middleware.RequirePermission("purchase_orders.delete"), handlers.DeletePurchaseOrder)
			protected.POST("/purchase-orders/:id/receive", middleware.RequirePermission("purchase_orders.receive"), handlers.ReceivePurchaseOrder)

			// Stock Movements
			protected.GET("/stock-movements", middleware.RequirePermission("stock_movements.view"), handlers.GetStockMovements)

			// ========================
			// Phase 2: Front Office
			// ========================

			// Patients
			protected.GET("/patients", middleware.RequirePermission("patients.view"), handlers.GetPatients)
			protected.GET("/patients/:id", middleware.RequirePermission("patients.view"), handlers.GetPatient)
			protected.GET("/patients/:id/history", middleware.RequirePermission("patients.view"), handlers.GetPatientHistory)
			protected.POST("/patients", middleware.RequirePermission("patients.create"), handlers.CreatePatient)
			protected.PUT("/patients/:id", middleware.RequirePermission("patients.update"), handlers.UpdatePatient)
			protected.DELETE("/patients/:id", middleware.RequirePermission("patients.delete"), handlers.DeletePatient)

			// Visits / Pendaftaran
			protected.GET("/visits", middleware.RequirePermission("visits.view"), handlers.GetVisits)
			protected.GET("/visits/today", middleware.RequirePermission("visits.view"), handlers.GetTodayVisits)
			protected.GET("/visits/:id", middleware.RequirePermission("visits.view"), handlers.GetVisit)
			protected.POST("/visits", middleware.RequirePermission("visits.create"), handlers.CreateVisit)
			protected.PUT("/visits/:id", middleware.RequirePermission("visits.update"), handlers.UpdateVisit)
			protected.DELETE("/visits/:id", middleware.RequirePermission("visits.delete"), handlers.DeleteVisit)
			protected.PATCH("/visits/:id/status", middleware.RequirePermission("queue.manage"), handlers.UpdateVisitStatus)

			// Queue
			protected.GET("/queue/:polyclinicId", middleware.RequirePermission("queue.view"), handlers.GetQueueByPolyclinic)
			protected.POST("/queue/:polyclinicId/call-next", middleware.RequirePermission("queue.manage"), handlers.CallNextQueue)

			// ========================
			// Phase 3: EMR (Electronic Medical Record)
			// ========================

			// Medical Records
			protected.GET("/medical-records", middleware.RequirePermission("medical_records.view"), handlers.GetMedicalRecords)
			protected.GET("/medical-records/:id", middleware.RequirePermission("medical_records.view"), handlers.GetMedicalRecord)
			protected.POST("/medical-records", middleware.RequirePermission("medical_records.create"), handlers.CreateMedicalRecord)
			protected.PUT("/medical-records/:id", middleware.RequirePermission("medical_records.update"), handlers.UpdateMedicalRecord)
			protected.POST("/medical-records/:id/finalize", middleware.RequirePermission("medical_records.finalize"), handlers.FinalizeMedicalRecord)
			protected.GET("/medical-records/visit/:visitId", middleware.RequirePermission("medical_records.view"), handlers.GetMedicalRecordByVisit)

			// Medical Record - Diagnoses
			protected.POST("/medical-records/:id/diagnoses", middleware.RequirePermission("medical_records.update"), handlers.AddDiagnosis)
			protected.DELETE("/medical-records/:id/diagnoses/:diagnosisId", middleware.RequirePermission("medical_records.update"), handlers.DeleteDiagnosis)

			// Medical Record - Prescriptions
			protected.POST("/medical-records/:id/prescriptions", middleware.RequirePermission("prescriptions.create"), handlers.AddPrescription)
			protected.DELETE("/medical-records/:id/prescriptions/:prescriptionId", middleware.RequirePermission("prescriptions.create"), handlers.DeletePrescription)

			// Medical Record - Actions
			protected.POST("/medical-records/:id/actions", middleware.RequirePermission("medical_records.update"), handlers.AddMedicalAction)
			protected.DELETE("/medical-records/:id/actions/:actionId", middleware.RequirePermission("medical_records.update"), handlers.DeleteMedicalAction)

			// Patient Medical History
			protected.GET("/patients/:id/medical-records", middleware.RequirePermission("medical_records.view"), handlers.GetPatientMedicalRecords)
		}
	}

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	log.Printf("Server starting on port %s...", cfg.ServerPort)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
