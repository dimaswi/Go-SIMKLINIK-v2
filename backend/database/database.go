package database

import (
	"log"
	"starter/backend/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Connect(dsn string) error {
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return err
	}

	log.Println("Database connected successfully")
	return nil
}

func Migrate() error {
	// Auto-migrate all models with proper order for foreign key dependencies
	err := DB.AutoMigrate(
		// Core RBAC & Settings
		&models.Role{},
		&models.Permission{},
		&models.RolePermission{},
		&models.User{},
		&models.Setting{},

		// Phase 1: Master Data
		&models.Polyclinic{},
		&models.MedicineCategory{},
		&models.Unit{},
		&models.ServiceCategory{},
		&models.PaymentMethod{},
		&models.Supplier{},
		&models.ICD10{},
		&models.Doctor{},
		&models.DoctorSchedule{},
		&models.Medicine{},
		&models.MedicalService{},

		// Purchasing & Stock
		&models.PurchaseOrder{},
		&models.PurchaseOrderItem{},
		&models.StockMovement{},

		// Phase 2: Front Office
		&models.Patient{},
		&models.QueueCounter{},
		&models.Visit{},

		// Phase 3: EMR (Electronic Medical Record)
		&models.MedicalRecord{},
		&models.MedicalRecordDiagnosis{},
		&models.Prescription{},
		&models.MedicalAction{},
		&models.InformedConsent{},
	)

	if err != nil {
		return err
	}

	log.Println("Database migrated successfully")
	return SeedData()
}

// CleanMigrate drops all tables and recreates them for fresh database structure
func CleanMigrate() error {
	// Drop tables in reverse order to handle foreign key constraints
	DB.Exec("DROP TABLE IF EXISTS stock_movements CASCADE")
	DB.Exec("DROP TABLE IF EXISTS purchase_order_items CASCADE")
	DB.Exec("DROP TABLE IF EXISTS purchase_orders CASCADE")
	DB.Exec("DROP TABLE IF EXISTS visits CASCADE")
	DB.Exec("DROP TABLE IF EXISTS queue_counters CASCADE")
	DB.Exec("DROP TABLE IF EXISTS patients CASCADE")
	DB.Exec("DROP TABLE IF EXISTS doctor_polyclinics CASCADE")
	DB.Exec("DROP TABLE IF EXISTS doctor_schedules CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medical_services CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medicines CASCADE")
	DB.Exec("DROP TABLE IF EXISTS doctors CASCADE")
	DB.Exec("DROP TABLE IF EXISTS icd10s CASCADE")
	DB.Exec("DROP TABLE IF EXISTS suppliers CASCADE")
	DB.Exec("DROP TABLE IF EXISTS payment_methods CASCADE")
	DB.Exec("DROP TABLE IF EXISTS service_categories CASCADE")
	DB.Exec("DROP TABLE IF EXISTS units CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medicine_categories CASCADE")
	DB.Exec("DROP TABLE IF EXISTS polyclinics CASCADE")
	DB.Exec("DROP TABLE IF EXISTS role_permissions CASCADE")
	DB.Exec("DROP TABLE IF EXISTS users CASCADE")
	DB.Exec("DROP TABLE IF EXISTS permissions CASCADE")
	DB.Exec("DROP TABLE IF EXISTS roles CASCADE")
	DB.Exec("DROP TABLE IF EXISTS settings CASCADE")

	log.Println("Dropped existing tables for clean migration")

	// Now run normal migration
	return Migrate()
}

func SeedData() error {
	// Seed granular permissions that match frontend permission checks
	permissions := []models.Permission{
		// Users Management
		{Name: "users.view", Module: "User Management", Category: "Users", Description: "View users list and details", Actions: `["read"]`},
		{Name: "users.create", Module: "User Management", Category: "Users", Description: "Create new users", Actions: `["create"]`},
		{Name: "users.update", Module: "User Management", Category: "Users", Description: "Update existing users", Actions: `["update"]`},
		{Name: "users.delete", Module: "User Management", Category: "Users", Description: "Delete users", Actions: `["delete"]`},

		// Roles Management
		{Name: "roles.view", Module: "Role Management", Category: "Roles", Description: "View roles list and details", Actions: `["read"]`},
		{Name: "roles.create", Module: "Role Management", Category: "Roles", Description: "Create new roles", Actions: `["create"]`},
		{Name: "roles.update", Module: "Role Management", Category: "Roles", Description: "Update existing roles", Actions: `["update"]`},
		{Name: "roles.delete", Module: "Role Management", Category: "Roles", Description: "Delete roles", Actions: `["delete"]`},
		{Name: "roles.assign_permissions", Module: "Role Management", Category: "Roles", Description: "Assign permissions to roles", Actions: `["assign"]`},

		// Permissions Management
		{Name: "permissions.view", Module: "Permission Management", Category: "Permissions", Description: "View permissions list and details", Actions: `["read"]`},
		{Name: "permissions.create", Module: "Permission Management", Category: "Permissions", Description: "Create new permissions", Actions: `["create"]`},
		{Name: "permissions.update", Module: "Permission Management", Category: "Permissions", Description: "Update existing permissions", Actions: `["update"]`},
		{Name: "permissions.delete", Module: "Permission Management", Category: "Permissions", Description: "Delete permissions", Actions: `["delete"]`},

		// System & Dashboard
		{Name: "dashboard.view", Module: "Dashboard", Category: "Analytics", Description: "Access dashboard and reports", Actions: `["read"]`},
		{Name: "settings.view", Module: "System Settings", Category: "Settings", Description: "View system settings", Actions: `["read"]`},
		{Name: "settings.update", Module: "System Settings", Category: "Settings", Description: "Update system settings", Actions: `["update"]`},
		{Name: "profile.view", Module: "Profile Management", Category: "Account", Description: "View own profile", Actions: `["read"]`},
		{Name: "profile.update", Module: "Profile Management", Category: "Account", Description: "Update own profile", Actions: `["update"]`},

		// Phase 1: Master Data Permissions
		{Name: "polyclinics.view", Module: "Master Data", Category: "Polyclinics", Description: "View polyclinics", Actions: `["read"]`},
		{Name: "polyclinics.create", Module: "Master Data", Category: "Polyclinics", Description: "Create polyclinics", Actions: `["create"]`},
		{Name: "polyclinics.update", Module: "Master Data", Category: "Polyclinics", Description: "Update polyclinics", Actions: `["update"]`},
		{Name: "polyclinics.delete", Module: "Master Data", Category: "Polyclinics", Description: "Delete polyclinics", Actions: `["delete"]`},

		{Name: "doctors.view", Module: "Master Data", Category: "Doctors", Description: "View doctors", Actions: `["read"]`},
		{Name: "doctors.create", Module: "Master Data", Category: "Doctors", Description: "Create doctors", Actions: `["create"]`},
		{Name: "doctors.update", Module: "Master Data", Category: "Doctors", Description: "Update doctors", Actions: `["update"]`},
		{Name: "doctors.delete", Module: "Master Data", Category: "Doctors", Description: "Delete doctors", Actions: `["delete"]`},

		{Name: "doctor_schedules.view", Module: "Master Data", Category: "Doctor Schedules", Description: "View doctor schedules", Actions: `["read"]`},
		{Name: "doctor_schedules.create", Module: "Master Data", Category: "Doctor Schedules", Description: "Create doctor schedules", Actions: `["create"]`},
		{Name: "doctor_schedules.update", Module: "Master Data", Category: "Doctor Schedules", Description: "Update doctor schedules", Actions: `["update"]`},
		{Name: "doctor_schedules.delete", Module: "Master Data", Category: "Doctor Schedules", Description: "Delete doctor schedules", Actions: `["delete"]`},

		{Name: "medicines.view", Module: "Master Data", Category: "Medicines", Description: "View medicines", Actions: `["read"]`},
		{Name: "medicines.create", Module: "Master Data", Category: "Medicines", Description: "Create medicines", Actions: `["create"]`},
		{Name: "medicines.update", Module: "Master Data", Category: "Medicines", Description: "Update medicines", Actions: `["update"]`},
		{Name: "medicines.delete", Module: "Master Data", Category: "Medicines", Description: "Delete medicines", Actions: `["delete"]`},

		{Name: "medical_services.view", Module: "Master Data", Category: "Medical Services", Description: "View medical services", Actions: `["read"]`},
		{Name: "medical_services.create", Module: "Master Data", Category: "Medical Services", Description: "Create medical services", Actions: `["create"]`},
		{Name: "medical_services.update", Module: "Master Data", Category: "Medical Services", Description: "Update medical services", Actions: `["update"]`},
		{Name: "medical_services.delete", Module: "Master Data", Category: "Medical Services", Description: "Delete medical services", Actions: `["delete"]`},

		{Name: "suppliers.view", Module: "Master Data", Category: "Suppliers", Description: "View suppliers", Actions: `["read"]`},
		{Name: "suppliers.create", Module: "Master Data", Category: "Suppliers", Description: "Create suppliers", Actions: `["create"]`},
		{Name: "suppliers.update", Module: "Master Data", Category: "Suppliers", Description: "Update suppliers", Actions: `["update"]`},
		{Name: "suppliers.delete", Module: "Master Data", Category: "Suppliers", Description: "Delete suppliers", Actions: `["delete"]`},

		{Name: "medicine_categories.view", Module: "Master Data", Category: "Medicine Categories", Description: "View medicine categories", Actions: `["read"]`},
		{Name: "medicine_categories.create", Module: "Master Data", Category: "Medicine Categories", Description: "Create medicine categories", Actions: `["create"]`},
		{Name: "medicine_categories.update", Module: "Master Data", Category: "Medicine Categories", Description: "Update medicine categories", Actions: `["update"]`},
		{Name: "medicine_categories.delete", Module: "Master Data", Category: "Medicine Categories", Description: "Delete medicine categories", Actions: `["delete"]`},

		{Name: "units.view", Module: "Master Data", Category: "Units", Description: "View units", Actions: `["read"]`},
		{Name: "units.create", Module: "Master Data", Category: "Units", Description: "Create units", Actions: `["create"]`},
		{Name: "units.update", Module: "Master Data", Category: "Units", Description: "Update units", Actions: `["update"]`},
		{Name: "units.delete", Module: "Master Data", Category: "Units", Description: "Delete units", Actions: `["delete"]`},

		{Name: "service_categories.view", Module: "Master Data", Category: "Service Categories", Description: "View service categories", Actions: `["read"]`},
		{Name: "service_categories.create", Module: "Master Data", Category: "Service Categories", Description: "Create service categories", Actions: `["create"]`},
		{Name: "service_categories.update", Module: "Master Data", Category: "Service Categories", Description: "Update service categories", Actions: `["update"]`},
		{Name: "service_categories.delete", Module: "Master Data", Category: "Service Categories", Description: "Delete service categories", Actions: `["delete"]`},

		{Name: "payment_methods.view", Module: "Master Data", Category: "Payment Methods", Description: "View payment methods", Actions: `["read"]`},
		{Name: "payment_methods.create", Module: "Master Data", Category: "Payment Methods", Description: "Create payment methods", Actions: `["create"]`},
		{Name: "payment_methods.update", Module: "Master Data", Category: "Payment Methods", Description: "Update payment methods", Actions: `["update"]`},
		{Name: "payment_methods.delete", Module: "Master Data", Category: "Payment Methods", Description: "Delete payment methods", Actions: `["delete"]`},

		// Purchasing & Stock
		{Name: "purchase_orders.view", Module: "Pembelian", Category: "Purchase Orders", Description: "View purchase orders", Actions: `["read"]`},
		{Name: "purchase_orders.create", Module: "Pembelian", Category: "Purchase Orders", Description: "Create purchase orders", Actions: `["create"]`},
		{Name: "purchase_orders.update", Module: "Pembelian", Category: "Purchase Orders", Description: "Update purchase orders", Actions: `["update"]`},
		{Name: "purchase_orders.delete", Module: "Pembelian", Category: "Purchase Orders", Description: "Delete purchase orders", Actions: `["delete"]`},
		{Name: "purchase_orders.receive", Module: "Pembelian", Category: "Purchase Orders", Description: "Receive purchase orders into stock", Actions: `["receive"]`},
		{Name: "stock_movements.view", Module: "Pembelian", Category: "Stock Movements", Description: "View stock movement history", Actions: `["read"]`},

		{Name: "icd10.view", Module: "Master Data", Category: "ICD10", Description: "View ICD-10 codes", Actions: `["read"]`},

		// Phase 2: Front Office Permissions
		{Name: "patients.view", Module: "Front Office", Category: "Patients", Description: "View patients", Actions: `["read"]`},
		{Name: "patients.create", Module: "Front Office", Category: "Patients", Description: "Create patients", Actions: `["create"]`},
		{Name: "patients.update", Module: "Front Office", Category: "Patients", Description: "Update patients", Actions: `["update"]`},
		{Name: "patients.delete", Module: "Front Office", Category: "Patients", Description: "Delete patients", Actions: `["delete"]`},

		{Name: "visits.view", Module: "Front Office", Category: "Visits", Description: "View visits", Actions: `["read"]`},
		{Name: "visits.create", Module: "Front Office", Category: "Visits", Description: "Register new visits", Actions: `["create"]`},
		{Name: "visits.update", Module: "Front Office", Category: "Visits", Description: "Update visits", Actions: `["update"]`},
		{Name: "visits.delete", Module: "Front Office", Category: "Visits", Description: "Delete visits", Actions: `["delete"]`},

		{Name: "queue.view", Module: "Front Office", Category: "Queue", Description: "View queue status", Actions: `["read"]`},
		{Name: "queue.manage", Module: "Front Office", Category: "Queue", Description: "Manage queue (call next, update status)", Actions: `["update"]`},

		// Phase 3: EMR (Electronic Medical Record) Permissions
		{Name: "medical_records.view", Module: "EMR", Category: "Medical Records", Description: "View medical records", Actions: `["read"]`},
		{Name: "medical_records.create", Module: "EMR", Category: "Medical Records", Description: "Create medical records", Actions: `["create"]`},
		{Name: "medical_records.update", Module: "EMR", Category: "Medical Records", Description: "Update medical records", Actions: `["update"]`},
		{Name: "medical_records.finalize", Module: "EMR", Category: "Medical Records", Description: "Finalize medical records", Actions: `["finalize"]`},

		{Name: "prescriptions.view", Module: "EMR", Category: "Prescriptions", Description: "View prescriptions", Actions: `["read"]`},
		{Name: "prescriptions.create", Module: "EMR", Category: "Prescriptions", Description: "Create prescriptions", Actions: `["create"]`},
		{Name: "prescriptions.update", Module: "EMR", Category: "Prescriptions", Description: "Update prescriptions", Actions: `["update"]`},

		{Name: "informed_consent.view", Module: "EMR", Category: "Informed Consent", Description: "View informed consent", Actions: `["read"]`},
		{Name: "informed_consent.create", Module: "EMR", Category: "Informed Consent", Description: "Create informed consent", Actions: `["create"]`},
	}

	for _, perm := range permissions {
		DB.Where(models.Permission{Name: perm.Name}).FirstOrCreate(&perm)
	}

	// Create default roles
	var adminRole models.Role
	DB.Where(models.Role{Name: "admin"}).FirstOrCreate(&adminRole, models.Role{
		Name:        "admin",
		Description: "Administrator with full access",
	})

	var userRole models.Role
	DB.Where(models.Role{Name: "user"}).FirstOrCreate(&userRole, models.Role{
		Name:        "user",
		Description: "Regular user with limited access",
	})

	// Assign all permissions to admin role
	var allPermissions []models.Permission
	DB.Find(&allPermissions)
	if len(allPermissions) > 0 {
		DB.Model(&adminRole).Association("Permissions").Replace(allPermissions)
	}

	// Assign limited permissions to user role
	var limitedPermissions []models.Permission
	DB.Where("name IN ?", []string{"profile.view", "profile.update", "dashboard.view"}).Find(&limitedPermissions)
	if len(limitedPermissions) > 0 {
		DB.Model(&userRole).Association("Permissions").Replace(limitedPermissions)
	}

	// Create default admin user
	var adminUser models.User
	result := DB.Where(models.User{Email: "admin@simrs.com"}).FirstOrCreate(&adminUser, models.User{
		Email:    "admin@simrs.com",
		Username: "admin",
		FullName: "System Administrator",
		IsActive: true,
		RoleID:   adminRole.ID,
	})

	if result.RowsAffected > 0 {
		adminUser.HashPassword("admin123")
		DB.Save(&adminUser)
		log.Println("Default admin user created: admin@simrs.com / admin123")
	}

	// Create default settings
	defaultSettings := []models.Setting{
		{Key: "app_name", Value: "SIMKLINIK"},
		{Key: "app_subtitle", Value: "Sistem Informasi Manajemen Klinik"},
	}

	for _, setting := range defaultSettings {
		DB.Where(models.Setting{Key: setting.Key}).FirstOrCreate(&setting)
	}

	// Seed Phase 1: Master Data
	seedMasterData()

	return nil
}

func seedMasterData() {
	// Seed Medicine Categories
	medicineCategories := []models.MedicineCategory{
		{Name: "Analgesik", Description: "Obat pereda nyeri"},
		{Name: "Antibiotik", Description: "Obat anti infeksi bakteri"},
		{Name: "Antihipertensi", Description: "Obat tekanan darah tinggi"},
		{Name: "Antidiabetes", Description: "Obat diabetes mellitus"},
		{Name: "Vitamin & Suplemen", Description: "Vitamin dan suplemen kesehatan"},
		{Name: "Obat Maag", Description: "Obat gangguan lambung"},
		{Name: "Antihistamin", Description: "Obat alergi"},
		{Name: "Antipiretik", Description: "Obat penurun demam"},
		{Name: "Antitusif & Ekspektoran", Description: "Obat batuk dan pengencer dahak"},
		{Name: "Kortikosteroid", Description: "Obat anti radang steroid"},
		{Name: "Antiseptik", Description: "Obat antiseptik dan desinfektan"},
		{Name: "Obat Mata", Description: "Obat tetes dan salep mata"},
		{Name: "Obat THT", Description: "Obat telinga, hidung, tenggorokan"},
		{Name: "Obat Kulit", Description: "Obat topikal untuk kulit"},
		{Name: "Obat Saluran Cerna", Description: "Obat pencernaan"},
	}
	for _, mc := range medicineCategories {
		DB.Where(models.MedicineCategory{Name: mc.Name}).FirstOrCreate(&mc)
	}

	// Seed Units
	units := []models.Unit{
		{Name: "Tablet"},
		{Name: "Kapsul"},
		{Name: "Botol"},
		{Name: "Tube"},
		{Name: "Ampul"},
		{Name: "Sachet"},
		{Name: "Strip"},
		{Name: "Vial"},
		{Name: "Sendok"},
		{Name: "Tetes"},
	}
	for _, u := range units {
		DB.Where(models.Unit{Name: u.Name}).FirstOrCreate(&u)
	}

	// Seed Service Categories
	serviceCategories := []models.ServiceCategory{
		{Name: "Konsultasi"},
		{Name: "Tindakan Medis"},
		{Name: "Laboratorium"},
		{Name: "Farmasi"},
	}
	for _, sc := range serviceCategories {
		DB.Where(models.ServiceCategory{Name: sc.Name}).FirstOrCreate(&sc)
	}

	// Seed Payment Methods
	paymentMethods := []models.PaymentMethod{
		{Name: "Tunai", IsActive: true},
		{Name: "Debit", IsActive: true},
		{Name: "Kartu Kredit", IsActive: true},
		{Name: "Transfer Bank", IsActive: true},
	}
	for _, pm := range paymentMethods {
		DB.Where(models.PaymentMethod{Name: pm.Name}).FirstOrCreate(&pm)
	}

	// Seed Default Polyclinics
	polyclinics := []models.Polyclinic{
		{Name: "Poli Umum", Code: "POL-UMUM", Description: "Poliklinik Umum", IsActive: true, Color: "#3B82F6", Icon: "stethoscope", SortOrder: 1},
		{Name: "Poli Gigi", Code: "POL-GIGI", Description: "Poliklinik Gigi dan Mulut", IsActive: true, Color: "#10B981", Icon: "smile", SortOrder: 2},
	}
	for _, p := range polyclinics {
		DB.Where(models.Polyclinic{Code: p.Code}).FirstOrCreate(&p)
	}

	// Seed ICD-10 Codes (common diagnoses)
	icd10Codes := []models.ICD10{
		{Code: "J00", Name: "Acute nasopharyngitis (common cold)", NameID: "Nasofaringitis akut (flu)", Category: "Diseases of the respiratory system", Chapter: "X"},
		{Code: "J06.9", Name: "Acute upper respiratory infection, unspecified", NameID: "ISPA (Infeksi Saluran Pernapasan Atas)", Category: "Diseases of the respiratory system", Chapter: "X"},
		{Code: "J20.9", Name: "Acute bronchitis, unspecified", NameID: "Bronkitis akut", Category: "Diseases of the respiratory system", Chapter: "X"},
		{Code: "J18.9", Name: "Pneumonia, unspecified organism", NameID: "Pneumonia", Category: "Diseases of the respiratory system", Chapter: "X"},
		{Code: "J45.9", Name: "Asthma, unspecified", NameID: "Asma", Category: "Diseases of the respiratory system", Chapter: "X"},
		{Code: "K29.7", Name: "Gastritis, unspecified", NameID: "Gastritis (Maag)", Category: "Diseases of the digestive system", Chapter: "XI"},
		{Code: "K30", Name: "Functional dyspepsia", NameID: "Dispepsia fungsional", Category: "Diseases of the digestive system", Chapter: "XI"},
		{Code: "A09", Name: "Infectious gastroenteritis and colitis, unspecified", NameID: "Gastroenteritis (diare)", Category: "Certain infectious and parasitic diseases", Chapter: "I"},
		{Code: "E11", Name: "Type 2 diabetes mellitus", NameID: "Diabetes Melitus Tipe 2", Category: "Endocrine, nutritional and metabolic diseases", Chapter: "IV"},
		{Code: "E11.9", Name: "Type 2 diabetes mellitus without complications", NameID: "DM Tipe 2 tanpa komplikasi", Category: "Endocrine, nutritional and metabolic diseases", Chapter: "IV"},
		{Code: "I10", Name: "Essential (primary) hypertension", NameID: "Hipertensi primer", Category: "Diseases of the circulatory system", Chapter: "IX"},
		{Code: "I11.9", Name: "Hypertensive heart disease without heart failure", NameID: "Penyakit jantung hipertensi tanpa gagal jantung", Category: "Diseases of the circulatory system", Chapter: "IX"},
		{Code: "M54.5", Name: "Low back pain", NameID: "Nyeri punggung bawah", Category: "Diseases of the musculoskeletal system", Chapter: "XIII"},
		{Code: "M79.3", Name: "Panniculitis, unspecified", NameID: "Panikulitis", Category: "Diseases of the musculoskeletal system", Chapter: "XIII"},
		{Code: "R50.9", Name: "Fever, unspecified", NameID: "Demam", Category: "Symptoms and signs", Chapter: "XVIII"},
		{Code: "R51", Name: "Headache", NameID: "Sakit kepala (Cephalgia)", Category: "Symptoms and signs", Chapter: "XVIII"},
		{Code: "R10.4", Name: "Other and unspecified abdominal pain", NameID: "Nyeri perut", Category: "Symptoms and signs", Chapter: "XVIII"},
		{Code: "R11", Name: "Nausea and vomiting", NameID: "Mual dan muntah", Category: "Symptoms and signs", Chapter: "XVIII"},
		{Code: "L30.9", Name: "Dermatitis, unspecified", NameID: "Dermatitis", Category: "Diseases of the skin", Chapter: "XII"},
		{Code: "L20.9", Name: "Atopic dermatitis, unspecified", NameID: "Dermatitis atopik", Category: "Diseases of the skin", Chapter: "XII"},
		{Code: "B35.4", Name: "Tinea corporis", NameID: "Tinea korporis (kurap)", Category: "Certain infectious and parasitic diseases", Chapter: "I"},
		{Code: "H10.9", Name: "Conjunctivitis, unspecified", NameID: "Konjungtivitis", Category: "Diseases of the eye", Chapter: "VII"},
		{Code: "H66.9", Name: "Otitis media, unspecified", NameID: "Otitis media", Category: "Diseases of the ear", Chapter: "VIII"},
		{Code: "J02.9", Name: "Acute pharyngitis, unspecified", NameID: "Faringitis akut", Category: "Diseases of the respiratory system", Chapter: "X"},
		{Code: "J03.9", Name: "Acute tonsillitis, unspecified", NameID: "Tonsilitis akut", Category: "Diseases of the respiratory system", Chapter: "X"},
		{Code: "N39.0", Name: "Urinary tract infection, site not specified", NameID: "Infeksi saluran kemih (ISK)", Category: "Diseases of the genitourinary system", Chapter: "XIV"},
		{Code: "K04.7", Name: "Periapical abscess without sinus", NameID: "Abses periapikal (gigi)", Category: "Diseases of the digestive system", Chapter: "XI"},
		{Code: "K02.9", Name: "Dental caries, unspecified", NameID: "Karies gigi", Category: "Diseases of the digestive system", Chapter: "XI"},
		{Code: "K05.1", Name: "Chronic gingivitis", NameID: "Gingivitis kronis", Category: "Diseases of the digestive system", Chapter: "XI"},
		{Code: "E78.5", Name: "Hyperlipidemia, unspecified", NameID: "Hiperlipidemia", Category: "Endocrine, nutritional and metabolic diseases", Chapter: "IV"},
		{Code: "E79.0", Name: "Hyperuricemia without signs of gout", NameID: "Hiperurisemia (asam urat tinggi)", Category: "Endocrine, nutritional and metabolic diseases", Chapter: "IV"},
		{Code: "M10.9", Name: "Gout, unspecified", NameID: "Gout (asam urat)", Category: "Diseases of the musculoskeletal system", Chapter: "XIII"},
		{Code: "G43.9", Name: "Migraine, unspecified", NameID: "Migrain", Category: "Diseases of the nervous system", Chapter: "VI"},
		{Code: "R42", Name: "Dizziness and giddiness", NameID: "Pusing (vertigo)", Category: "Symptoms and signs", Chapter: "XVIII"},
		{Code: "B01.9", Name: "Varicella without complication", NameID: "Cacar air (varicella)", Category: "Certain infectious and parasitic diseases", Chapter: "I"},
		{Code: "A01.0", Name: "Typhoid fever", NameID: "Demam tifoid (tipes)", Category: "Certain infectious and parasitic diseases", Chapter: "I"},
		{Code: "A15.0", Name: "Tuberculosis of lung", NameID: "TBC paru", Category: "Certain infectious and parasitic diseases", Chapter: "I"},
		{Code: "B82.9", Name: "Intestinal parasitism, unspecified", NameID: "Cacingan", Category: "Certain infectious and parasitic diseases", Chapter: "I"},
		{Code: "L50.9", Name: "Urticaria, unspecified", NameID: "Urtikaria (biduran)", Category: "Diseases of the skin", Chapter: "XII"},
		{Code: "T78.4", Name: "Allergy, unspecified", NameID: "Alergi", Category: "Injury and poisoning", Chapter: "XIX"},
	}
	for _, icd := range icd10Codes {
		DB.Where(models.ICD10{Code: icd.Code}).FirstOrCreate(&icd)
	}

	log.Println("Master data seeded successfully")
}
