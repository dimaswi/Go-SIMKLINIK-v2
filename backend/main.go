package main

import (
	"log"
	"starter/backend/config"
	"starter/backend/database"
	"starter/backend/handlers"
	"starter/backend/middleware"
	"starter/backend/services"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func init() {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		log.Fatal("Failed to load timezone Asia/Jakarta: ", err)
	}
	time.Local = loc
}

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		if err := godotenv.Load("../.env"); err != nil {
			log.Println("No .env file found, using default configuration")
		}
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

	if err := services.InitSystemBackupManager(cfg); err != nil {
		log.Println("System backup manager initialization warning:", err)
	}

	// Setup Gin router
	r := gin.Default()

	// Serve static files for uploads
	r.Static("/uploads", "./uploads")

	// CORS middleware
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Public routes
	api := r.Group("/api")
	{
		api.POST("/auth/login", handlers.Login)
		api.GET("/settings", handlers.GetSettings) // Public access to settings
		api.POST("/tte/verify", handlers.VerifyTTESignature)
		api.POST("/public/registration-queue", handlers.CreateRegistrationQueue)
		api.GET("/public/registration-queue/today", handlers.GetRegistrationQueues)
		api.GET("/public/polyclinics", handlers.GetPolyclinics)
		api.GET("/public/doctors", handlers.GetDoctors)

		registerBPJSWebhookRoutes(api, "/bpjs/webhook")

		// Protected routes
		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware())
		{
			protected.GET("/auth/profile", handlers.GetProfile)
			protected.GET("/tte/signers", middleware.RequirePermission("document_signatures.request"), handlers.GetTTESigners)
			protected.GET("/tte/visits/:visitId/documents", middleware.RequireAnyPermission("document_signatures.view", "document_signatures.request", "document_signatures.approve"), handlers.GetVisitTTEDocuments)
			protected.POST("/tte/requests", middleware.RequirePermission("document_signatures.request"), handlers.UpsertTTEDocumentRequest)
			protected.GET("/tte/requests/inbox", middleware.RequirePermission("document_signatures.approve"), handlers.GetIncomingTTEDocumentRequests)
			protected.POST("/tte/requests/:id/approve", middleware.RequirePermission("document_signatures.approve"), handlers.ApproveTTEDocumentRequest)
			protected.POST("/tte/requests/:id/reject", middleware.RequirePermission("document_signatures.approve"), handlers.RejectTTEDocumentRequest)

			// Settings routes
			protected.PUT("/settings", middleware.RequirePermission("settings.update"), handlers.UpdateSettings)
			protected.POST("/settings/upload", middleware.RequirePermission("settings.update"), handlers.UploadLogo)
			protected.POST("/settings/print-header-preview", middleware.RequirePermission("settings.view"), handlers.PreviewPrintHeaderPDF)
			protected.GET("/settings/terms-and-conditions/pdf", middleware.RequirePermission("settings.view"), handlers.PrintTermsAndConditionsPDF)
			protected.GET("/system-backups/overview", middleware.RequirePermission("settings.view"), handlers.GetSystemBackupOverview)
			protected.GET("/system-backups/files", middleware.RequirePermission("settings.view"), handlers.ListSystemBackupFiles)
			protected.GET("/system-backups/files/:id/download", middleware.RequirePermission("settings.view"), handlers.DownloadSystemBackupFile)
			protected.POST("/system-backups/run", middleware.RequirePermission("settings.update"), handlers.RunSystemBackup)
			protected.PUT("/system-backups/settings", middleware.RequirePermission("settings.update"), handlers.UpdateSystemBackupSettings)
			registerSATUSEHATRoutes(protected, "/satusehat")
			registerSATUSEHATRoutes(protected, "/integrations/bridge")
			registerBPJSIntegrationRoutes(protected, "/integrations/bridge/bpjs")

			// Users routes (with RBAC)
			protected.GET("/users", middleware.RequirePermission("users.view"), handlers.GetUsers)
			protected.GET("/users/summary", middleware.RequirePermission("users.view"), handlers.GetUsersSummary)
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
			// Dashboard
			// ========================
			protected.GET("/dashboard/summary", handlers.GetDashboardSummary)
			protected.GET("/dashboard/report/pdf", middleware.RequirePermission("dashboard.view"), handlers.GetDashboardReportPDF)
			protected.GET("/dashboard/report/excel", middleware.RequirePermission("dashboard.view"), handlers.GetDashboardReportExcel)
			protected.GET("/reports/management/pdf", middleware.RequirePermission("reports.view"), handlers.GetDashboardReportPDF)
			protected.GET("/reports/management/excel", middleware.RequirePermission("reports.view"), handlers.GetDashboardReportExcel)
			protected.GET("/reports/finance/pdf", middleware.RequirePermission("reports.view"), handlers.GetFinanceReportPDF)
			protected.GET("/reports/finance/excel", middleware.RequirePermission("reports.view"), handlers.GetFinanceReportExcel)
			protected.GET("/reports/preview", middleware.RequirePermission("reports.view"), handlers.GetReportCenterPreview)
			protected.GET("/reports/export/pdf", middleware.RequirePermission("reports.view"), handlers.ExportReportCenterPDF)
			protected.GET("/reports/export/excel", middleware.RequirePermission("reports.view"), handlers.ExportReportCenterExcel)

			// ========================
			// Phase 1: Master Data
			// ========================

			// Polyclinics
			protected.GET("/polyclinics", middleware.RequirePermission("polyclinics.view"), handlers.GetPolyclinics)
			protected.GET("/polyclinics/:id", middleware.RequirePermission("polyclinics.view"), handlers.GetPolyclinic)
			protected.POST("/polyclinics", middleware.RequirePermission("polyclinics.create"), handlers.CreatePolyclinic)
			protected.PUT("/polyclinics/:id", middleware.RequirePermission("polyclinics.update"), handlers.UpdatePolyclinic)
			protected.DELETE("/polyclinics/:id", middleware.RequirePermission("polyclinics.delete"), handlers.DeletePolyclinic)

			// Employees
			protected.GET("/employees", middleware.RequirePermission("employees.view"), handlers.GetEmployees)
			protected.GET("/employees/summary", middleware.RequirePermission("employees.view"), handlers.GetEmployeesSummary)
			protected.GET("/employees/:id", middleware.RequirePermission("employees.view"), handlers.GetEmployee)
			protected.POST("/employees", middleware.RequirePermission("employees.create"), handlers.CreateEmployee)
			protected.PUT("/employees/:id", middleware.RequirePermission("employees.update"), handlers.UpdateEmployee)
			protected.DELETE("/employees/:id", middleware.RequirePermission("employees.delete"), handlers.DeleteEmployee)

			// Doctors
			protected.GET("/doctors", middleware.RequirePermission("doctors.view"), handlers.GetDoctors)
			protected.GET("/doctors/summary", middleware.RequirePermission("doctors.view"), handlers.GetDoctorsSummary)
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
			protected.GET("/regions/provinces", middleware.RequireAnyPermission("patients.view", "patients.create", "patients.update", "visits.create"), handlers.GetProvinces)
			protected.GET("/regions/regencies", middleware.RequireAnyPermission("patients.view", "patients.create", "patients.update", "visits.create"), handlers.GetRegencies)
			protected.GET("/regions/districts", middleware.RequireAnyPermission("patients.view", "patients.create", "patients.update", "visits.create"), handlers.GetDistricts)
			protected.GET("/regions/villages", middleware.RequireAnyPermission("patients.view", "patients.create", "patients.update", "visits.create"), handlers.GetVillages)

			// Medicines
			protected.GET("/medicines", middleware.RequirePermission("medicines.view"), handlers.GetMedicines)
			protected.GET("/medicines/kfa/search", middleware.RequirePermission("medicines.view"), handlers.SearchMedicineKFA)
			protected.GET("/medicines/kfa/:code", middleware.RequirePermission("medicines.view"), handlers.GetMedicineKFADetail)
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
			protected.GET("/specimen-templates", middleware.RequirePermission("medical_services.view"), handlers.GetSpecimenTemplates)
			protected.GET("/specimen-templates/:id", middleware.RequirePermission("medical_services.view"), handlers.GetSpecimenTemplate)
			protected.POST("/specimen-templates", middleware.RequirePermission("medical_services.create"), handlers.CreateSpecimenTemplate)
			protected.PUT("/specimen-templates/:id", middleware.RequirePermission("medical_services.update"), handlers.UpdateSpecimenTemplate)
			protected.DELETE("/specimen-templates/:id", middleware.RequirePermission("medical_services.delete"), handlers.DeleteSpecimenTemplate)
			protected.GET("/medical-services", middleware.RequirePermission("medical_services.view"), handlers.GetMedicalServices)
			protected.GET("/medical-services/:id", middleware.RequirePermission("medical_services.view"), handlers.GetMedicalService)
			protected.POST("/medical-services", middleware.RequirePermission("medical_services.create"), handlers.CreateMedicalService)
			protected.PUT("/medical-services/:id", middleware.RequirePermission("medical_services.update"), handlers.UpdateMedicalService)
			protected.DELETE("/medical-services/:id", middleware.RequirePermission("medical_services.delete"), handlers.DeleteMedicalService)
			protected.GET("/lab-tests", middleware.RequireAnyPermission("medical_records.view", "laboratory.view"), handlers.GetLabTests)

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

			// Physical Exam Image Masters
			protected.GET("/physical-exam-images", middleware.RequireAnyPermission("physical_exam_images.view", "medical_records.view"), handlers.GetPhysicalExamImageMasters)
			protected.GET("/physical-exam-images/:id", middleware.RequireAnyPermission("physical_exam_images.view", "medical_records.view"), handlers.GetPhysicalExamImageMaster)
			protected.POST("/physical-exam-images", middleware.RequirePermission("physical_exam_images.create"), handlers.CreatePhysicalExamImageMaster)
			protected.PUT("/physical-exam-images/:id", middleware.RequirePermission("physical_exam_images.update"), handlers.UpdatePhysicalExamImageMaster)
			protected.DELETE("/physical-exam-images/:id", middleware.RequirePermission("physical_exam_images.delete"), handlers.DeletePhysicalExamImageMaster)

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
			protected.GET("/registration-queue", middleware.RequirePermission("visits.view"), handlers.GetRegistrationQueues)
			protected.GET("/registration-queue/:id", middleware.RequirePermission("visits.view"), handlers.GetRegistrationQueue)
			protected.GET("/registration-queue/:id/print", middleware.RequireAnyPermission("visits.view", "visits.create", "queue.manage"), handlers.PrintRegistrationQueueTicket)
			protected.POST("/registration-queue", middleware.RequireAnyPermission("visits.create", "queue.manage"), handlers.CreateRegistrationQueue)
			protected.POST("/registration-queue/call-next", middleware.RequireAnyPermission("visits.create", "queue.manage"), handlers.CallNextRegistrationQueue)
			protected.PATCH("/registration-queue/:id/status", middleware.RequireAnyPermission("visits.create", "queue.manage"), handlers.UpdateRegistrationQueueStatus)
			protected.DELETE("/registration-queue/:id", middleware.RequireAnyPermission("visits.create", "queue.manage"), handlers.DeleteRegistrationQueue)

			// Visits / Pendaftaran
			protected.GET("/visits", middleware.RequirePermission("visits.view"), handlers.GetVisits)
			protected.GET("/visits/control-schedules", middleware.RequirePermission("visits.view"), handlers.GetControlSchedules)
			protected.GET("/visits/today", middleware.RequirePermission("visits.view"), handlers.GetTodayVisits)
			protected.GET("/visits/active-patient/:patientId", middleware.RequireAnyPermission("visits.view", "visits.create"), handlers.GetActiveVisitByPatient)
			protected.GET("/visits/:id", middleware.RequirePermission("visits.view"), handlers.GetVisit)
			protected.POST("/visits", middleware.RequirePermission("visits.create"), handlers.CreateVisit)
			protected.PUT("/visits/:id", middleware.RequirePermission("visits.update"), handlers.UpdateVisit)
			protected.DELETE("/visits/:id", middleware.RequirePermission("visits.delete"), handlers.DeleteVisit)
			protected.POST("/visits/:id/cancel-workspace", middleware.RequireAnyPermission("medical_records.update", "visits.delete"), handlers.CancelVisitWorkspace)
			protected.PATCH("/visits/:id/status", middleware.RequirePermission("queue.manage"), handlers.UpdateVisitStatus)
			protected.POST("/visits/:id/bpjs/panggil", middleware.RequirePermission("queue.manage"), handlers.CallBPJSQueue)

			// Queue
			protected.GET("/queue/polyclinics", middleware.RequireAnyPermission("queue.view", "queue.manage", "visits.view", "visits.create"), handlers.GetQueuePolyclinicOptions)
			protected.GET("/queue/:polyclinicId", middleware.RequirePermission("queue.view"), handlers.GetQueueByPolyclinic)
			protected.POST("/queue/:polyclinicId/call-next", middleware.RequirePermission("queue.manage"), handlers.CallNextQueue)

			// ========================
			// Phase 3: EMR (Electronic Medical Record)
			// ========================

			// Medical Records
			protected.GET("/medical-records", middleware.RequirePermission("medical_records.view"), handlers.GetMedicalRecords)
			protected.GET("/pharmacy/prescription-orders", middleware.RequireAnyPermission("pharmacy.view", "pharmacy.process", "prescriptions.view", "prescriptions.process"), handlers.GetPharmacyPrescriptionOrders)
			protected.GET("/laboratory/orders", middleware.RequireAnyPermission("laboratory.view", "laboratory.process"), handlers.GetLaboratoryOrders)
			protected.GET("/radiology/orders", middleware.RequireAnyPermission("radiology.view", "radiology.process"), handlers.GetRadiologyOrders)
			protected.GET("/medical-records/references/icd10", middleware.RequirePermission("medical_records.view"), handlers.SearchEMRICD10)
			protected.GET("/medical-records/visit/:visitId/references", middleware.RequirePermission("medical_records.view"), handlers.GetEMRReferences)
			protected.GET("/medical-records/visit/:visitId", middleware.RequirePermission("medical_records.view"), handlers.GetMedicalRecordByVisit)
			protected.GET("/medical-records/visit/:visitId/print/initial-assessment", middleware.RequirePermission("medical_records.view"), handlers.PrintInitialAssessmentEntry)
			protected.GET("/medical-records/visit/:visitId/print/surat", middleware.RequirePermission("medical_records.view"), handlers.PrintSuratEntry)
			protected.GET("/medical-records/visit/:visitId/print/surat-kontrol", middleware.RequirePermission("medical_records.view"), handlers.PrintControlLetter)
			protected.GET("/medical-records/visit/:visitId/print/resume-medis", middleware.RequirePermission("medical_records.view"), handlers.PrintMedicalResumeVisit)
			protected.POST("/medical-records/visit/:visitId/finalize", middleware.RequirePermission("medical_records.finalize"), handlers.FinalizeMedicalRecordVisit)
			protected.POST("/medical-records/visit/:visitId/unfinalize", middleware.RequirePermission("medical_records.finalize"), handlers.CancelFinalizeMedicalRecordVisit)
			protected.GET("/odontogram-entries/visit/:visitId", middleware.RequirePermission("medical_records.view"), handlers.GetOdontogramEntriesByVisit)
			protected.GET("/odontogram-entries/:id/print", middleware.RequirePermission("medical_records.view"), handlers.PrintOdontogramEntry)
			protected.GET("/informed-consents/:id/print", middleware.RequirePermission("medical_records.view"), handlers.PrintInformedConsent)
			protected.GET("/medical-records/:id", middleware.RequirePermission("medical_records.view"), handlers.GetMedicalRecord)
			protected.PUT("/informed-consents/:id", middleware.RequirePermission("medical_records.update"), handlers.UpdateInformedConsent)
			protected.POST("/medical-records/initial-assessment", middleware.RequirePermission("medical_records.create"), handlers.CreateInitialAssessmentEntry)
			protected.POST("/medical-records", middleware.RequirePermission("medical_records.create"), handlers.CreateMedicalRecord)
			protected.POST("/odontogram-entries", middleware.RequirePermission("medical_records.create"), handlers.CreateOdontogramEntry)
			protected.PUT("/medical-records/:id", middleware.RequirePermission("medical_records.update"), handlers.UpdateMedicalRecord)
			protected.PUT("/odontogram-entries/:id", middleware.RequirePermission("medical_records.update"), handlers.UpdateOdontogramEntry)
			protected.POST("/medical-records/:id/cancel", middleware.RequirePermission("medical_records.update"), handlers.CancelMedicalRecord)
			protected.POST("/odontogram-entries/:id/cancel", middleware.RequirePermission("medical_records.update"), handlers.CancelOdontogramEntry)
			protected.DELETE("/medical-records/:id", middleware.RequirePermission("medical_records.update"), handlers.DeleteMedicalRecord)
			protected.DELETE("/odontogram-entries/:id", middleware.RequirePermission("medical_records.update"), handlers.DeleteOdontogramEntry)
			protected.POST("/medical-records/:id/finalize", middleware.RequirePermission("medical_records.finalize"), handlers.FinalizeMedicalRecord)

			// Medical Record - Diagnoses
			protected.POST("/medical-records/:id/diagnoses", middleware.RequirePermission("medical_records.update"), handlers.AddDiagnosis)
			protected.DELETE("/medical-records/:id/diagnoses/:diagnosisId", middleware.RequirePermission("medical_records.update"), handlers.DeleteDiagnosis)

			// Medical Record - Prescriptions
			protected.POST("/medical-records/:id/prescriptions", middleware.RequirePermission("prescriptions.create"), handlers.AddPrescription)
			protected.DELETE("/medical-records/:id/prescriptions/:prescriptionId", middleware.RequirePermission("prescriptions.create"), handlers.DeletePrescription)
			protected.POST("/medical-records/:id/prescription-compounds", middleware.RequirePermission("prescriptions.update"), handlers.AddPrescriptionCompound)
			protected.DELETE("/medical-records/:id/prescription-compounds/:compoundId", middleware.RequirePermission("prescriptions.update"), handlers.DeletePrescriptionCompound)
			protected.POST("/medical-records/:id/prescriptions/submit", middleware.RequirePermission("prescriptions.update"), handlers.SubmitPrescriptionOrder)
			protected.POST("/medical-records/:id/prescriptions/cancel", middleware.RequirePermission("prescriptions.update"), handlers.CancelPrescriptionOrder)
			protected.POST("/medical-records/:id/prescriptions/prepare", middleware.RequireAnyPermission("pharmacy.process", "prescriptions.process", "prescriptions.update"), handlers.PreparePrescriptionOrder)
			protected.POST("/medical-records/:id/prescriptions/return", middleware.RequireAnyPermission("pharmacy.process", "prescriptions.process", "prescriptions.update"), handlers.ReturnPrescriptionOrder)
			protected.POST("/medical-records/:id/prescriptions/ready", middleware.RequireAnyPermission("pharmacy.process", "prescriptions.process", "prescriptions.update"), handlers.ReadyPrescriptionOrder)
			protected.POST("/medical-records/:id/prescriptions/dispense", middleware.RequireAnyPermission("pharmacy.process", "prescriptions.process", "prescriptions.update"), handlers.DispensePrescriptionOrder)
			protected.PUT("/medical-records/:id/pharmacy/compounds/deductions", middleware.RequireAnyPermission("pharmacy.process", "prescriptions.process", "prescriptions.update"), handlers.UpdatePrescriptionCompoundDeductions)
			protected.PUT("/medical-records/:id/prescriptions/review", middleware.RequireAnyPermission("pharmacy.process", "prescriptions.process", "prescriptions.update"), handlers.UpdatePrescriptionReview)
			protected.POST("/medical-records/:id/pharmacy/prescriptions", middleware.RequireAnyPermission("pharmacy.process", "prescriptions.process", "prescriptions.update"), handlers.AddPharmacyPrescription)
			protected.PUT("/medical-records/:id/pharmacy/prescriptions/:prescriptionId", middleware.RequireAnyPermission("pharmacy.process", "prescriptions.process", "prescriptions.update"), handlers.UpdatePharmacyPrescription)
			protected.DELETE("/medical-records/:id/pharmacy/prescriptions/:prescriptionId", middleware.RequireAnyPermission("pharmacy.process", "prescriptions.process", "prescriptions.update"), handlers.DeletePharmacyPrescription)
			protected.GET("/medical-records/:id/print/pharmacy-ticket", middleware.RequireAnyPermission("medical_records.view", "pharmacy.view", "pharmacy.process", "prescriptions.view", "prescriptions.process"), handlers.PrintPharmacyTicket)
			protected.GET("/medical-records/:id/print/prescription", middleware.RequireAnyPermission("medical_records.view", "pharmacy.view", "pharmacy.process", "prescriptions.view", "prescriptions.process"), handlers.PrintPrescriptionOrder)

			// Medical Record - Laboratory Orders
			protected.POST("/medical-records/:id/laboratory/items", middleware.RequireAnyPermission("medical_records.update", "laboratory.process"), handlers.AddLaboratoryOrderItem)
			protected.DELETE("/medical-records/:id/laboratory/items/:itemId", middleware.RequireAnyPermission("medical_records.update", "laboratory.process"), handlers.DeleteLaboratoryOrderItem)
			protected.POST("/medical-records/:id/laboratory/submit", middleware.RequirePermission("medical_records.update"), handlers.SubmitLaboratoryOrder)
			protected.POST("/medical-records/:id/laboratory/cancel", middleware.RequirePermission("medical_records.update"), handlers.CancelLaboratoryOrder)
			protected.POST("/medical-records/:id/laboratory/prepare", middleware.RequireAnyPermission("laboratory.process", "laboratory.view"), handlers.PrepareLaboratoryOrder)
			protected.POST("/medical-records/:id/laboratory/return", middleware.RequireAnyPermission("laboratory.process", "laboratory.view"), handlers.ReturnLaboratoryOrder)
			protected.PUT("/medical-records/:id/laboratory/results", middleware.RequireAnyPermission("laboratory.process", "laboratory.view"), handlers.UpdateLaboratoryOrderResults)
			protected.POST("/medical-records/:id/laboratory/complete", middleware.RequireAnyPermission("laboratory.process", "laboratory.view"), handlers.CompleteLaboratoryOrder)
			protected.GET("/medical-records/:id/print/laboratory-ticket", middleware.RequireAnyPermission("medical_records.view", "laboratory.view", "laboratory.process"), handlers.PrintLaboratoryTicket)
			protected.GET("/medical-records/:id/print/laboratory-result", middleware.RequireAnyPermission("medical_records.view", "laboratory.view", "laboratory.process"), handlers.PrintLaboratoryResult)

			// Medical Record - Radiology Orders
			protected.POST("/medical-records/:id/radiology/items", middleware.RequireAnyPermission("medical_records.update", "radiology.process"), handlers.AddRadiologyOrderItem)
			protected.DELETE("/medical-records/:id/radiology/items/:itemId", middleware.RequireAnyPermission("medical_records.update", "radiology.process"), handlers.DeleteRadiologyOrderItem)
			protected.POST("/medical-records/:id/radiology/submit", middleware.RequirePermission("medical_records.update"), handlers.SubmitRadiologyOrder)
			protected.POST("/medical-records/:id/radiology/cancel", middleware.RequirePermission("medical_records.update"), handlers.CancelRadiologyOrder)
			protected.POST("/medical-records/:id/radiology/prepare", middleware.RequireAnyPermission("radiology.process", "radiology.view"), handlers.PrepareRadiologyOrder)
			protected.POST("/medical-records/:id/radiology/return", middleware.RequireAnyPermission("radiology.process", "radiology.view"), handlers.ReturnRadiologyOrder)
			protected.PUT("/medical-records/:id/radiology/results", middleware.RequireAnyPermission("radiology.process", "radiology.view"), handlers.UpdateRadiologyOrderResults)
			protected.POST("/medical-records/:id/radiology/complete", middleware.RequireAnyPermission("radiology.process", "radiology.view"), handlers.CompleteRadiologyOrder)
			protected.GET("/medical-records/:id/print/radiology-ticket", middleware.RequireAnyPermission("medical_records.view", "radiology.view", "radiology.process"), handlers.PrintRadiologyTicket)
			protected.GET("/medical-records/:id/print/radiology-result", middleware.RequireAnyPermission("medical_records.view", "radiology.view", "radiology.process"), handlers.PrintRadiologyResult)

			// Medical Record - Actions
			protected.GET("/medical-records/:id/print/procedure", middleware.RequirePermission("medical_records.view"), handlers.PrintProcedureRecord)
			protected.POST("/medical-records/:id/actions", middleware.RequirePermission("medical_records.update"), handlers.AddMedicalAction)
			protected.PUT("/medical-records/:id/actions/:actionId", middleware.RequirePermission("medical_records.update"), handlers.UpdateMedicalAction)
			protected.DELETE("/medical-records/:id/actions/:actionId", middleware.RequirePermission("medical_records.update"), handlers.DeleteMedicalAction)

			// Patient Medical History
			protected.GET("/patients/:id/medical-records", middleware.RequirePermission("medical_records.view"), handlers.GetPatientMedicalRecords)

			// ========================
			// Billing / Kasir
			// ========================
			protected.GET("/invoices", middleware.RequirePermission("invoices.view"), handlers.GetInvoices)
			protected.GET("/invoices/stats", middleware.RequirePermission("invoices.view"), handlers.GetBillingStats)
			protected.GET("/invoices/queue", middleware.RequirePermission("invoices.view"), handlers.GetCashierQueue)
			protected.GET("/invoices/:id", middleware.RequirePermission("invoices.view"), handlers.GetInvoice)
			protected.GET("/invoices/:id/print", middleware.RequirePermission("invoices.view"), handlers.PrintInvoice)
			protected.PUT("/invoices/:id", middleware.RequirePermission("invoices.update"), handlers.UpdateInvoice)
			protected.POST("/invoices/:id/pay", middleware.RequirePermission("invoices.pay"), handlers.ProcessPayment)
			protected.POST("/invoices/:id/cancel-payment", middleware.RequirePermission("invoices.pay"), handlers.CancelPayment)
			protected.DELETE("/invoices/:id/payments/:paymentId", middleware.RequirePermission("invoices.pay"), handlers.CancelPayment)
			protected.GET("/invoices/visit/:visitId", middleware.RequirePermission("invoices.view"), handlers.GetInvoiceByVisit)
			protected.POST("/invoices/visit/:visitId/sync", middleware.RequirePermission("invoices.create"), handlers.SyncVisitInvoice)
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

func registerSATUSEHATRoutes(group *gin.RouterGroup, basePath string) {
	group.GET(basePath+"/status", middleware.RequirePermission("settings.view"), handlers.GetSATUSEHATStatus)
	group.GET(basePath+"/logs", middleware.RequirePermission("settings.view"), handlers.GetSATUSEHATLogs)
	group.POST(basePath+"/logs/:id/retry", middleware.RequirePermission("settings.update"), middleware.RequireSATUSEHATEnabled(), handlers.RetrySATUSEHATLog)
	group.POST(basePath+"/test-connection", middleware.RequirePermission("settings.view"), middleware.RequireSATUSEHATEnabled(), handlers.TestSATUSEHATConnection)
	group.GET(basePath+"/organizations/:id/preview", middleware.RequireAnyPermission("settings.view", "polyclinics.view"), handlers.PreviewSATUSEHATOrganization)
	group.GET(basePath+"/locations/:id/preview", middleware.RequireAnyPermission("settings.view", "polyclinics.view"), handlers.PreviewSATUSEHATLocation)
	group.GET(basePath+"/patients/:id/preview", middleware.RequireAnyPermission("settings.view", "patients.view"), handlers.PreviewSATUSEHATPatient)
	group.GET(basePath+"/patients/:id/resolve-preview", middleware.RequireAnyPermission("settings.view", "patients.view"), middleware.RequireSATUSEHATEnabled(), handlers.PreviewSATUSEHATPatientResolve)
	group.GET(basePath+"/employees/:id/practitioner/preview", middleware.RequireAnyPermission("settings.view", "employees.view"), handlers.PreviewSATUSEHATEmployeePractitioner)
	group.GET(basePath+"/practitioners/:id/preview", middleware.RequireAnyPermission("settings.view", "doctors.view"), handlers.PreviewSATUSEHATPractitioner)
	group.GET(basePath+"/encounters/:id/preview", middleware.RequireAnyPermission("settings.view", "visits.view"), handlers.PreviewSATUSEHATEncounter)
	group.GET(basePath+"/medical-records/:id/vital-signs/preview", middleware.RequireAnyPermission("settings.view", "medical_records.view"), handlers.PreviewSATUSEHATVitalSigns)
	group.GET(basePath+"/medical-records/:id/clinical-impression/preview", middleware.RequireAnyPermission("settings.view", "medical_records.view"), handlers.PreviewSATUSEHATClinicalImpression)
	group.GET(basePath+"/medical-actions/:id/procedure/preview", middleware.RequireAnyPermission("settings.view", "medical_records.view"), handlers.PreviewSATUSEHATProcedure)
	group.GET(basePath+"/medical-records/:id/care-plan/preview", middleware.RequireAnyPermission("settings.view", "medical_records.view"), handlers.PreviewSATUSEHATCarePlan)
	group.GET(basePath+"/medical-records/:id/goal/preview", middleware.RequireAnyPermission("settings.view", "medical_records.view"), handlers.PreviewSATUSEHATGoal)
	group.GET(basePath+"/medical-records/:id/allergy-intolerance/preview", middleware.RequireAnyPermission("settings.view", "medical_records.view"), handlers.PreviewSATUSEHATAllergyIntolerance)
	group.GET(basePath+"/medical-records/:id/composition/preview", middleware.RequireAnyPermission("settings.view", "medical_records.view"), handlers.PreviewSATUSEHATComposition)
	group.GET(basePath+"/medical-records/:id/family-member-history/preview", middleware.RequireAnyPermission("settings.view", "medical_records.view"), handlers.PreviewSATUSEHATFamilyMemberHistory)
	group.GET(basePath+"/laboratory-order-items/:id/preview", middleware.RequireAnyPermission("settings.view", "laboratory.view", "medical_records.view"), handlers.PreviewSATUSEHATLaboratoryItem)
	group.GET(basePath+"/radiology-order-items/:id/preview", middleware.RequireAnyPermission("settings.view", "radiology.view", "medical_records.view"), handlers.PreviewSATUSEHATRadiologyItem)
	group.GET(basePath+"/prescriptions/:id/preview", middleware.RequireAnyPermission("settings.view", "pharmacy.view", "pharmacy.process", "prescriptions.view", "medical_records.view"), handlers.PreviewSATUSEHATPrescription)
	group.GET(basePath+"/dispensings/:id/preview", middleware.RequireAnyPermission("settings.view", "pharmacy.view", "pharmacy.process", "prescriptions.view", "prescriptions.process"), handlers.PreviewSATUSEHATDispensing)
	group.GET(basePath+"/diagnoses/:id/preview", middleware.RequireAnyPermission("settings.view", "medical_records.view"), handlers.PreviewSATUSEHATDiagnosis)
	group.POST(basePath+"/organizations/:id/sync", middleware.RequireAnyPermission("settings.update", "polyclinics.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATOrganization)
	group.POST(basePath+"/locations/:id/sync", middleware.RequireAnyPermission("settings.update", "polyclinics.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATLocation)
	group.POST(basePath+"/patients/:id/sync", middleware.RequireAnyPermission("settings.update", "patients.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATPatient)
	group.POST(basePath+"/employees/:id/practitioner/sync", middleware.RequireAnyPermission("settings.update", "employees.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATEmployeePractitioner)
	group.POST(basePath+"/practitioners/:id/sync", middleware.RequireAnyPermission("settings.update", "doctors.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATPractitioner)
	group.POST(basePath+"/encounters/:id/sync", middleware.RequireAnyPermission("settings.update", "visits.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATEncounter)
	group.POST(basePath+"/medical-records/:id/vital-signs/sync", middleware.RequireAnyPermission("settings.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATVitalSigns)
	group.POST(basePath+"/medical-records/:id/clinical-impression/sync", middleware.RequireAnyPermission("settings.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATClinicalImpression)
	group.POST(basePath+"/medical-actions/:id/procedure/sync", middleware.RequireAnyPermission("settings.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATProcedure)
	group.POST(basePath+"/medical-records/:id/care-plan/sync", middleware.RequireAnyPermission("settings.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATCarePlan)
	group.POST(basePath+"/medical-records/:id/goal/sync", middleware.RequireAnyPermission("settings.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATGoal)
	group.POST(basePath+"/medical-records/:id/allergy-intolerance/sync", middleware.RequireAnyPermission("settings.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATAllergyIntolerance)
	group.POST(basePath+"/medical-records/:id/composition/sync", middleware.RequireAnyPermission("settings.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATComposition)
	group.POST(basePath+"/medical-records/:id/family-member-history/sync", middleware.RequireAnyPermission("settings.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATFamilyMemberHistory)
	group.POST(basePath+"/laboratory-order-items/:id/sync", middleware.RequireAnyPermission("settings.update", "laboratory.process", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATLaboratoryItem)
	group.POST(basePath+"/radiology-order-items/:id/sync", middleware.RequireAnyPermission("settings.update", "radiology.process", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATRadiologyItem)
	group.POST(basePath+"/medicines/:id/sync", middleware.RequireAnyPermission("settings.update", "medicines.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATMedicine)
	group.POST(basePath+"/prescriptions/:id/sync", middleware.RequireAnyPermission("settings.update", "pharmacy.process", "prescriptions.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATPrescription)
	group.POST(basePath+"/dispensings/:id/sync", middleware.RequireAnyPermission("settings.update", "pharmacy.process", "prescriptions.process", "prescriptions.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATDispensing)
	group.POST(basePath+"/diagnoses/:id/sync", middleware.RequireAnyPermission("settings.update", "medical_records.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATDiagnosis)
	group.GET(basePath+"/visits/:id/auto-sync", middleware.RequireAnyPermission("settings.view", "medical_records.view", "visits.view"), handlers.GetSATUSEHATAutoByVisit)
	group.POST(basePath+"/visits/:id/auto-sync", middleware.RequireAnyPermission("settings.update", "medical_records.update", "visits.update"), middleware.RequireSATUSEHATEnabled(), handlers.SyncSATUSEHATAutoByVisit)
}

func registerBPJSWebhookRoutes(api *gin.RouterGroup, basePath string) {
	bpjsGroup := api.Group(basePath)
	bpjsGroup.Use(middleware.RequireBPJSAntreanEnabled())

	// /auth is unprotected, validates x-username/x-password to give a token
	bpjsGroup.GET("/auth", handlers.AuthBPJSWebhook)

	// other webhooks are protected by standard AuthMiddleware using the token
	protectedWebhook := bpjsGroup.Group("")
	protectedWebhook.Use(middleware.AuthMiddleware())

	protectedWebhook.POST("/antrean", handlers.BPJSAddAntrean)
	protectedWebhook.PUT("/antrean/batal", handlers.BPJSCancelAntrean)
	protectedWebhook.POST("/antrean/batal", handlers.BPJSCancelAntrean) // support both just in case
}

func registerBPJSIntegrationRoutes(group *gin.RouterGroup, basePath string) {
	bpjsAccess := middleware.RequireAnyPermission("settings.view", "polyclinics.view", "polyclinics.update", "doctors.view", "doctors.update")
	group.GET(basePath+"/status", bpjsAccess, handlers.GetBPJSStatus)
	group.GET(basePath+"/logs", middleware.RequirePermission("settings.view"), handlers.GetBPJSLogs)
	group.GET(basePath+"/antrean/references/poli", bpjsAccess, handlers.GetBPJSReferencePoli)
	group.GET(basePath+"/antrean/references/dokter", bpjsAccess, handlers.GetBPJSReferenceDoctor)
	group.POST(basePath+"/antrean/test-connection", middleware.RequirePermission("settings.view"), handlers.TestBPJSAntreanConnection)
	group.POST(basePath+"/pcare/test-connection", middleware.RequirePermission("settings.view"), handlers.TestBPJSPCareConnection)
}
