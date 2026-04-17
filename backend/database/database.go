package database

import (
	"bufio"
	"errors"
	"fmt"
	"log"
	"os"
	"starter/backend/models"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var DB *gorm.DB

func prepareMedicalRecordSchema() {
	DB.Exec("DROP INDEX IF EXISTS idx_medical_records_visit_id")
}

func backfillMedicalRecordSectionType() {
	DB.Exec("UPDATE medical_records SET section_type = 'anamnesis' WHERE COALESCE(section_type, '') = ''")
}

func backfillMedicalRecordSheetKey() {
	DB.Exec(`
		UPDATE medical_records
		SET sheet_key = CASE
			WHEN section_type IN ('anamnesis', 'physical_exam', 'assessment')
				AND LOWER(COALESCE(entry_group_key, '')) LIKE 'pengkajian-gigi%' THEN 'pengkajian-awal-gigi'
			WHEN section_type IN ('anamnesis', 'physical_exam', 'assessment') THEN 'pengkajian-awal-medis'
			ELSE COALESCE(sheet_key, '')
		END
		WHERE COALESCE(sheet_key, '') = ''
	`)
}

func dropLegacyLaboratoryForeignKeys() {
	DB.Exec("ALTER TABLE laboratory_order_items DROP CONSTRAINT IF EXISTS fk_laboratory_order_items_lab_test")
	DB.Exec("ALTER TABLE laboratory_order_items DROP CONSTRAINT IF EXISTS fk_laboratory_order_items_medical_service")
	DB.Exec("ALTER TABLE laboratory_order_parameter_results DROP CONSTRAINT IF EXISTS fk_laboratory_order_parameter_results_lab_test_parameter")
	DB.Exec("ALTER TABLE laboratory_order_parameter_results DROP CONSTRAINT IF EXISTS fk_laboratory_order_parameter_results_medical_service_parameter")
}

type legacyLaboratoryOrderBackfillRow struct {
	ID               uint
	LegacyLabTestID  uint   `gorm:"column:lab_test_id"`
	TestCodeSnapshot string `gorm:"column:test_code_snapshot"`
	TestNameSnapshot string `gorm:"column:test_name_snapshot"`
}

type legacyLaboratoryParameterBackfillRow struct {
	ID                      uint
	LegacyParameterID       *uint  `gorm:"column:lab_test_parameter_id"`
	MedicalServiceID        uint   `gorm:"column:medical_service_id"`
	ParameterCodeSnapshot   string `gorm:"column:parameter_code_snapshot"`
	ParameterNameSnapshot   string `gorm:"column:parameter_name_snapshot"`
	InputTypeSnapshot       string `gorm:"column:input_type_snapshot"`
	UnitSnapshot            string `gorm:"column:unit_snapshot"`
	NormalValueSnapshot     string `gorm:"column:normal_value_snapshot"`
	SortOrder               int    `gorm:"column:sort_order"`
	IsRequired              bool   `gorm:"column:is_required"`
	LegacyParameterExists   bool   `gorm:"column:legacy_parameter_exists"`
	CurrentParameterMatches bool   `gorm:"column:current_parameter_matches"`
}

func normalizeMigrationText(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeMigrationInputType(value string) string {
	switch normalizeMigrationText(value) {
	case "number":
		return "number"
	case "textarea":
		return "textarea"
	default:
		return "text"
	}
}

func ensureServiceCategory(name string) (models.ServiceCategory, error) {
	var category models.ServiceCategory
	err := DB.Where("LOWER(name) = ?", normalizeMigrationText(name)).First(&category).Error
	if err == nil {
		return category, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return category, err
	}

	category = models.ServiceCategory{Name: name}
	return category, DB.Create(&category).Error
}

func medicalServiceMatchesSnapshot(service models.MedicalService, code, name string) bool {
	if normalizedCode := normalizeMigrationText(code); normalizedCode != "" && normalizeMigrationText(service.Code) == normalizedCode {
		return true
	}
	if normalizedName := normalizeMigrationText(name); normalizedName != "" && normalizeMigrationText(service.Name) == normalizedName {
		return true
	}
	return false
}

func findMedicalServiceForMigration(categoryID uint, code, name string) (*models.MedicalService, error) {
	var service models.MedicalService
	query := DB.Unscoped().Where("category_id = ?", categoryID)

	normalizedCode := normalizeMigrationText(code)
	normalizedName := normalizeMigrationText(name)

	var err error
	switch {
	case normalizedCode != "" && normalizedName != "":
		err = query.Where("LOWER(code) = ? OR LOWER(name) = ?", normalizedCode, normalizedName).First(&service).Error
	case normalizedCode != "":
		err = query.Where("LOWER(code) = ?", normalizedCode).First(&service).Error
	case normalizedName != "":
		err = query.Where("LOWER(name) = ?", normalizedName).First(&service).Error
	default:
		return nil, nil
	}

	if err == nil {
		return &service, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return nil, err
}

func guessLegacyLaboratoryInputType(parameter models.LabTestParameter) string {
	if strings.TrimSpace(parameter.Unit) != "" {
		return "number"
	}
	combinedReference := parameter.NormalValueMale + parameter.NormalValueFemale
	if strings.ContainsAny(combinedReference, "0123456789") {
		return "number"
	}
	return "text"
}

func findMedicalServiceParameterForMigration(serviceID uint, code, name string) (*models.MedicalServiceParameter, error) {
	var parameter models.MedicalServiceParameter
	query := DB.Unscoped().Where("medical_service_id = ?", serviceID)

	normalizedCode := normalizeMigrationText(code)
	normalizedName := normalizeMigrationText(name)

	var err error
	switch {
	case normalizedCode != "" && normalizedName != "":
		err = query.Where("LOWER(code) = ? OR LOWER(name) = ?", normalizedCode, normalizedName).First(&parameter).Error
	case normalizedCode != "":
		err = query.Where("LOWER(code) = ?", normalizedCode).First(&parameter).Error
	case normalizedName != "":
		err = query.Where("LOWER(name) = ?", normalizedName).First(&parameter).Error
	default:
		return nil, nil
	}

	if err == nil {
		return &parameter, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return nil, err
}

func findOrCreateMedicalServiceParameterForMigration(serviceID uint, code, name, inputType, unit, referenceValueMale, referenceValueFemale string, sortOrder int, isRequired bool) (*models.MedicalServiceParameter, error) {
	parameter, err := findMedicalServiceParameterForMigration(serviceID, code, name)
	if err != nil || parameter != nil {
		return parameter, err
	}

	created := models.MedicalServiceParameter{
		MedicalServiceID:     serviceID,
		Code:                 strings.TrimSpace(code),
		Name:                 strings.TrimSpace(name),
		InputType:            normalizeMigrationInputType(inputType),
		Unit:                 strings.TrimSpace(unit),
		ReferenceValueMale:   strings.TrimSpace(referenceValueMale),
		ReferenceValueFemale: strings.TrimSpace(referenceValueFemale),
		SortOrder:            sortOrder,
		IsRequired:           isRequired,
	}
	if created.Name == "" {
		created.Name = fmt.Sprintf("Legacy Parameter %d", serviceID)
	}
	if created.SortOrder == 0 {
		created.SortOrder = 1
	}

	if err := DB.Create(&created).Error; err != nil {
		return nil, err
	}
	return &created, nil
}

func syncMedicalServiceParametersFromLegacyLabTest(serviceID, labTestID uint) error {
	if !DB.Migrator().HasTable("lab_test_parameters") {
		return nil
	}

	var parameters []models.LabTestParameter
	if err := DB.Unscoped().Where("lab_test_id = ?", labTestID).Order("sort_order ASC").Order("id ASC").Find(&parameters).Error; err != nil {
		return err
	}

	for _, parameter := range parameters {
		if strings.TrimSpace(parameter.Name) == "" {
			continue
		}

		_, err := findOrCreateMedicalServiceParameterForMigration(
			serviceID,
			parameter.Code,
			parameter.Name,
			guessLegacyLaboratoryInputType(parameter),
			parameter.Unit,
			parameter.NormalValueMale,
			parameter.NormalValueFemale,
			parameter.SortOrder,
			parameter.IsRequired,
		)
		if err != nil {
			return err
		}
	}

	return nil
}

func findOrCreateMedicalServiceFromLegacyLab(categoryID uint, code, name string, price float64, isActive bool, description string) (*models.MedicalService, error) {
	service, err := findMedicalServiceForMigration(categoryID, code, name)
	if err != nil || service != nil {
		return service, err
	}

	created := models.MedicalService{
		Code:        strings.TrimSpace(code),
		Name:        strings.TrimSpace(name),
		CategoryID:  categoryID,
		Price:       price,
		IsActive:    isActive,
		Description: strings.TrimSpace(description),
	}
	if created.Code == "" {
		created.Code = fmt.Sprintf("MIG-LAB-%04d", categoryID)
	}
	if created.Name == "" {
		created.Name = fmt.Sprintf("Legacy Laboratorium %s", strings.TrimPrefix(created.Code, "MIG-"))
	}

	if err := DB.Create(&created).Error; err != nil {
		return nil, err
	}
	return &created, nil
}

func resolveMedicalServiceForLegacyLaboratoryOrder(row legacyLaboratoryOrderBackfillRow, categoryID uint) (*models.MedicalService, error) {
	if DB.Migrator().HasTable("lab_tests") && row.LegacyLabTestID != 0 {
		var legacyTest models.LabTest
		if err := DB.Unscoped().First(&legacyTest, row.LegacyLabTestID).Error; err == nil {
			service, err := findOrCreateMedicalServiceFromLegacyLab(
				categoryID,
				legacyTest.Code,
				legacyTest.Name,
				legacyTest.Price,
				legacyTest.IsActive,
				"Migrated from legacy lab test master",
			)
			if err != nil {
				return nil, err
			}
			if service != nil {
				if err := syncMedicalServiceParametersFromLegacyLabTest(service.ID, legacyTest.ID); err != nil {
					return nil, err
				}
			}
			return service, nil
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	return findOrCreateMedicalServiceFromLegacyLab(
		categoryID,
		row.TestCodeSnapshot,
		row.TestNameSnapshot,
		0,
		false,
		"Migrated from legacy laboratory order snapshot",
	)
}

func backfillLegacyLaboratoryOrderMedicalServiceReferences() error {
	if !DB.Migrator().HasTable("laboratory_order_items") {
		return nil
	}

	laboratoryCategory, err := ensureServiceCategory("Laboratorium")
	if err != nil {
		return err
	}

	var rows []legacyLaboratoryOrderBackfillRow
	if err := DB.Table("laboratory_order_items").
		Select("id, lab_test_id, test_code_snapshot, test_name_snapshot").
		Find(&rows).Error; err != nil {
		return err
	}

	for _, row := range rows {
		if row.LegacyLabTestID == 0 {
			continue
		}

		var currentService models.MedicalService
		err := DB.Unscoped().First(&currentService, row.LegacyLabTestID).Error
		if err == nil && medicalServiceMatchesSnapshot(currentService, row.TestCodeSnapshot, row.TestNameSnapshot) {
			continue
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		service, err := resolveMedicalServiceForLegacyLaboratoryOrder(row, laboratoryCategory.ID)
		if err != nil {
			return err
		}
		if service == nil || service.ID == 0 {
			return fmt.Errorf("failed to resolve medical service for legacy laboratory order item %d", row.ID)
		}

		if err := DB.Table("laboratory_order_items").Where("id = ?", row.ID).Update("lab_test_id", service.ID).Error; err != nil {
			return err
		}
	}

	return nil
}

func backfillLegacyLaboratoryOrderParameterReferences() error {
	if !DB.Migrator().HasTable("laboratory_order_parameter_results") {
		return nil
	}

	var rows []legacyLaboratoryParameterBackfillRow
	if err := DB.Table("laboratory_order_parameter_results AS lopr").
		Select(`lopr.id,
			lopr.lab_test_parameter_id,
			loi.lab_test_id AS medical_service_id,
			lopr.parameter_code_snapshot,
			lopr.parameter_name_snapshot,
			lopr.input_type_snapshot,
			lopr.unit_snapshot,
			lopr.normal_value_snapshot,
			lopr.sort_order,
			lopr.is_required,
			CASE WHEN ltp.id IS NULL THEN FALSE ELSE TRUE END AS legacy_parameter_exists,
			CASE WHEN msp.id IS NOT NULL AND msp.medical_service_id = loi.lab_test_id THEN TRUE ELSE FALSE END AS current_parameter_matches`).
		Joins("JOIN laboratory_order_items loi ON loi.id = lopr.laboratory_order_item_id").
		Joins("LEFT JOIN lab_test_parameters ltp ON ltp.id = lopr.lab_test_parameter_id").
		Joins("LEFT JOIN medical_service_parameters msp ON msp.id = lopr.lab_test_parameter_id").
		Find(&rows).Error; err != nil {
		return err
	}

	for _, row := range rows {
		if row.LegacyParameterID == nil || *row.LegacyParameterID == 0 {
			continue
		}
		if row.CurrentParameterMatches {
			continue
		}

		var targetParameter *models.MedicalServiceParameter

		if row.LegacyParameterExists && DB.Migrator().HasTable("lab_test_parameters") {
			var legacyParameter models.LabTestParameter
			if err := DB.Unscoped().First(&legacyParameter, *row.LegacyParameterID).Error; err == nil {
				targetParameter, err = findOrCreateMedicalServiceParameterForMigration(
					row.MedicalServiceID,
					legacyParameter.Code,
					legacyParameter.Name,
					guessLegacyLaboratoryInputType(legacyParameter),
					legacyParameter.Unit,
					legacyParameter.NormalValueMale,
					legacyParameter.NormalValueFemale,
					legacyParameter.SortOrder,
					legacyParameter.IsRequired,
				)
				if err != nil {
					return err
				}
			} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		if targetParameter == nil && row.MedicalServiceID != 0 {
			parameter, err := findOrCreateMedicalServiceParameterForMigration(
				row.MedicalServiceID,
				row.ParameterCodeSnapshot,
				row.ParameterNameSnapshot,
				row.InputTypeSnapshot,
				row.UnitSnapshot,
				row.NormalValueSnapshot,
				row.NormalValueSnapshot,
				row.SortOrder,
				row.IsRequired,
			)
			if err != nil {
				return err
			}
			targetParameter = parameter
		}

		updates := map[string]any{"lab_test_parameter_id": nil}
		if targetParameter != nil && targetParameter.ID != 0 {
			updates["lab_test_parameter_id"] = targetParameter.ID
		}

		if err := DB.Table("laboratory_order_parameter_results").Where("id = ?", row.ID).Updates(updates).Error; err != nil {
			return err
		}
	}

	return nil
}

func backfillLegacyLaboratorySupportingOrderReferences() error {
	if err := backfillLegacyLaboratoryOrderMedicalServiceReferences(); err != nil {
		return err
	}
	if err := backfillLegacyLaboratoryOrderParameterReferences(); err != nil {
		return err
	}
	return nil
}

func Connect(dsn string) error {
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return err
	}

	// Ensure PostgreSQL session uses local timezone for DATE() calculations
	DB.Exec("SET timezone = 'Asia/Jakarta'")

	log.Println("Database connected successfully")
	return nil
}

func ensureDoctorCompatibilityColumns() error {
	if !DB.Migrator().HasColumn(&models.Doctor{}, "nip_number") {
		if err := DB.Exec("ALTER TABLE doctors ADD COLUMN IF NOT EXISTS nip_number VARCHAR(50)").Error; err != nil {
			return err
		}
		if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_doctors_nip_number ON doctors (nip_number)").Error; err != nil {
			return err
		}
	}

	return nil
}

func Migrate() error {
	prepareMedicalRecordSchema()

	// Auto-migrate master tables first so legacy laboratory data can be backfilled
	err := DB.AutoMigrate(
		// Core RBAC & Settings
		&models.Role{},
		&models.Permission{},
		&models.RolePermission{},
		&models.User{},
		&models.Setting{},
		&models.SystemBackupFile{},
		&models.DocumentSignatureRequest{},
		&models.BPJSLog{},
		&models.SATUSEHATLog{},
		&models.SATUSEHATAutoSyncSnapshot{},

		// Phase 1: Master Data
		&models.Polyclinic{},
		&models.MedicineCategory{},
		&models.Unit{},
		&models.ServiceCategory{},
		&models.PaymentMethod{},
		&models.Supplier{},
		&models.PhysicalExamImageMaster{},
		&models.ICD10{},
		&models.Province{},
		&models.Regency{},
		&models.District{},
		&models.Village{},
		&models.Employee{},
		&models.Doctor{},
		&models.DoctorSchedule{},
		&models.Medicine{},
		&models.SpecimenTemplate{},
		&models.MedicalService{},
		&models.MedicalServiceParameter{},
		&models.MedicalServiceSpecimen{},
		&models.LabTestCategory{},
		&models.LabTest{},
		&models.LabTestParameter{},

		// Purchasing & Stock
		&models.PurchaseOrder{},
		&models.PurchaseOrderItem{},
		&models.StockMovement{},

		// Phase 2: Front Office
		&models.Patient{},
		&models.RegistrationCounter{},
		&models.QueueCounter{},
		&models.Visit{},
		&models.RegistrationQueue{},

		// Phase 3: EMR base tables
		&models.MedicalRecord{},
		&models.MedicalRecordDiagnosis{},
		&models.MedicalRecordImagePick{},
		&models.MedicalRecordImagePickMarker{},
		&models.Prescription{},
		&models.PrescriptionCompound{},
		&models.PrescriptionCompoundItem{},
		&models.RadiologyOrderItem{},
		&models.RadiologyOrderParameterResult{},
		&models.Dispensing{},
		&models.MedicalAction{},
		&models.MedicalActionParameterValue{},
		&models.MedicalActionTarget{},
		&models.OdontogramEntry{},
		&models.OdontogramTooth{},
		&models.OdontogramSurfaceFinding{},
		&models.InformedConsent{},
		&models.VisitFinalizationLog{},

		// Phase 4: Kasir / Billing
		&models.Invoice{},
		&models.InvoiceItem{},
		&models.Payment{},
	)

	if err != nil {
		return err
	}

	if err := ensureDoctorCompatibilityColumns(); err != nil {
		return err
	}

	if err := backfillMedicalServiceMetadata(); err != nil {
		return err
	}

	dropLegacyLaboratoryForeignKeys()

	if err := backfillLegacyLaboratorySupportingOrderReferences(); err != nil {
		return err
	}

	// Migrate legacy laboratory tables after backfill so foreign keys can be created safely
	err = DB.AutoMigrate(

		&models.LaboratoryOrderItem{},
		&models.LaboratoryOrderSpecimen{},
		&models.LaboratoryOrderParameterResult{},
	)

	if err != nil {
		return err
	}

	backfillMedicalRecordSectionType()
	backfillMedicalRecordSheetKey()

	log.Println("Database migrated successfully")
	return SeedData()
}

// CleanMigrate drops all tables and recreates them for fresh database structure
func CleanMigrate() error {
	// Drop tables in reverse order to handle foreign key constraints
	DB.Exec("DROP TABLE IF EXISTS stock_movements CASCADE")
	DB.Exec("DROP TABLE IF EXISTS purchase_order_items CASCADE")
	DB.Exec("DROP TABLE IF EXISTS purchase_orders CASCADE")
	DB.Exec("DROP TABLE IF EXISTS document_signature_requests CASCADE")
	DB.Exec("DROP TABLE IF EXISTS bpjs_logs CASCADE")
	DB.Exec("DROP TABLE IF EXISTS odontogram_surface_findings CASCADE")
	DB.Exec("DROP TABLE IF EXISTS odontogram_teeth CASCADE")
	DB.Exec("DROP TABLE IF EXISTS odontogram_entries CASCADE")
	DB.Exec("DROP TABLE IF EXISTS informed_consents CASCADE")
	DB.Exec("DROP TABLE IF EXISTS dispensings CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medical_action_targets CASCADE")
	DB.Exec("DROP TABLE IF EXISTS radiology_order_parameter_results CASCADE")
	DB.Exec("DROP TABLE IF EXISTS radiology_order_items CASCADE")
	DB.Exec("DROP TABLE IF EXISTS laboratory_order_parameter_results CASCADE")
	DB.Exec("DROP TABLE IF EXISTS laboratory_order_items CASCADE")
	DB.Exec("DROP TABLE IF EXISTS lab_request_items CASCADE")
	DB.Exec("DROP TABLE IF EXISTS lab_requests CASCADE")
	DB.Exec("DROP TABLE IF EXISTS lab_test_parameters CASCADE")
	DB.Exec("DROP TABLE IF EXISTS lab_tests CASCADE")
	DB.Exec("DROP TABLE IF EXISTS lab_test_categories CASCADE")
	DB.Exec("DROP TABLE IF EXISTS prescription_compound_items CASCADE")
	DB.Exec("DROP TABLE IF EXISTS prescription_compounds CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medical_record_image_pick_markers CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medical_record_image_picks CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medical_actions CASCADE")
	DB.Exec("DROP TABLE IF EXISTS prescriptions CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medical_record_diagnoses CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medical_records CASCADE")
	DB.Exec("DROP TABLE IF EXISTS villages CASCADE")
	DB.Exec("DROP TABLE IF EXISTS districts CASCADE")
	DB.Exec("DROP TABLE IF EXISTS regencies CASCADE")
	DB.Exec("DROP TABLE IF EXISTS provinces CASCADE")
	DB.Exec("DROP TABLE IF EXISTS registration_queues CASCADE")
	DB.Exec("DROP TABLE IF EXISTS visits CASCADE")
	DB.Exec("DROP TABLE IF EXISTS registration_counters CASCADE")
	DB.Exec("DROP TABLE IF EXISTS queue_counters CASCADE")
	DB.Exec("DROP TABLE IF EXISTS patients CASCADE")
	DB.Exec("DROP TABLE IF EXISTS doctor_polyclinics CASCADE")
	DB.Exec("DROP TABLE IF EXISTS doctor_schedules CASCADE")
	DB.Exec("DROP TABLE IF EXISTS employees CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medical_service_parameters CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medical_services CASCADE")
	DB.Exec("DROP TABLE IF EXISTS medicines CASCADE")
	DB.Exec("DROP TABLE IF EXISTS doctors CASCADE")
	DB.Exec("DROP TABLE IF EXISTS icd10s CASCADE")
	DB.Exec("DROP TABLE IF EXISTS suppliers CASCADE")
	DB.Exec("DROP TABLE IF EXISTS payment_methods CASCADE")
	DB.Exec("DROP TABLE IF EXISTS service_categories CASCADE")
	DB.Exec("DROP TABLE IF EXISTS physical_exam_image_masters CASCADE")
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
		{Name: "reports.view", Module: "Laporan", Category: "Reports", Description: "Access report center and report exports", Actions: `["read"]`},
		{Name: "settings.view", Module: "System Settings", Category: "Settings", Description: "View system settings", Actions: `["read"]`},
		{Name: "settings.update", Module: "System Settings", Category: "Settings", Description: "Update system settings", Actions: `["update"]`},
		{Name: "profile.view", Module: "Profile Management", Category: "Account", Description: "View own profile", Actions: `["read"]`},
		{Name: "profile.update", Module: "Profile Management", Category: "Account", Description: "Update own profile", Actions: `["update"]`},

		// Phase 1: Master Data Permissions
		{Name: "polyclinics.view", Module: "Master Data", Category: "Polyclinics", Description: "View polyclinics", Actions: `["read"]`},
		{Name: "polyclinics.create", Module: "Master Data", Category: "Polyclinics", Description: "Create polyclinics", Actions: `["create"]`},
		{Name: "polyclinics.update", Module: "Master Data", Category: "Polyclinics", Description: "Update polyclinics", Actions: `["update"]`},
		{Name: "polyclinics.delete", Module: "Master Data", Category: "Polyclinics", Description: "Delete polyclinics", Actions: `["delete"]`},

		{Name: "employees.view", Module: "Master Data", Category: "Employees", Description: "View employees", Actions: `["read"]`},
		{Name: "employees.create", Module: "Master Data", Category: "Employees", Description: "Create employees", Actions: `["create"]`},
		{Name: "employees.update", Module: "Master Data", Category: "Employees", Description: "Update employees", Actions: `["update"]`},
		{Name: "employees.delete", Module: "Master Data", Category: "Employees", Description: "Delete employees", Actions: `["delete"]`},

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

		{Name: "laboratory.view", Module: "Penunjang", Category: "Laboratorium", Description: "View laboratory orders and results", Actions: `["read"]`},
		{Name: "laboratory.process", Module: "Penunjang", Category: "Laboratorium", Description: "Process laboratory orders and fill results", Actions: `["process"]`},
		{Name: "pharmacy.view", Module: "Penunjang", Category: "Farmasi", Description: "View pharmacy queues and prescription handover status", Actions: `["read"]`},
		{Name: "pharmacy.process", Module: "Penunjang", Category: "Farmasi", Description: "Process pharmacy workflow from receiving to dispensing", Actions: `["process"]`},
		{Name: "radiology.view", Module: "Penunjang", Category: "Radiologi", Description: "View radiology orders and results", Actions: `["read"]`},
		{Name: "radiology.process", Module: "Penunjang", Category: "Radiologi", Description: "Process radiology orders and fill results", Actions: `["process"]`},

		{Name: "payment_methods.view", Module: "Master Data", Category: "Payment Methods", Description: "View payment methods", Actions: `["read"]`},
		{Name: "payment_methods.create", Module: "Master Data", Category: "Payment Methods", Description: "Create payment methods", Actions: `["create"]`},
		{Name: "payment_methods.update", Module: "Master Data", Category: "Payment Methods", Description: "Update payment methods", Actions: `["update"]`},
		{Name: "payment_methods.delete", Module: "Master Data", Category: "Payment Methods", Description: "Delete payment methods", Actions: `["delete"]`},

		{Name: "physical_exam_images.view", Module: "Master Data", Category: "Physical Exam Images", Description: "View physical exam image masters", Actions: `["read"]`},
		{Name: "physical_exam_images.create", Module: "Master Data", Category: "Physical Exam Images", Description: "Create physical exam image masters", Actions: `["create"]`},
		{Name: "physical_exam_images.update", Module: "Master Data", Category: "Physical Exam Images", Description: "Update physical exam image masters", Actions: `["update"]`},
		{Name: "physical_exam_images.delete", Module: "Master Data", Category: "Physical Exam Images", Description: "Delete physical exam image masters", Actions: `["delete"]`},

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

		{Name: "document_signatures.view", Module: "EMR", Category: "TTE Internal", Description: "View internal TTE request status and documents", Actions: `["read"]`},
		{Name: "document_signatures.request", Module: "EMR", Category: "TTE Internal", Description: "Create or update internal TTE requests", Actions: `["request"]`},
		{Name: "document_signatures.approve", Module: "EMR", Category: "TTE Internal", Description: "Approve internal TTE requests assigned to user", Actions: `["approve"]`},

		{Name: "prescriptions.view", Module: "EMR", Category: "Prescriptions", Description: "View prescriptions", Actions: `["read"]`},
		{Name: "prescriptions.create", Module: "EMR", Category: "Prescriptions", Description: "Create prescriptions", Actions: `["create"]`},
		{Name: "prescriptions.update", Module: "EMR", Category: "Prescriptions", Description: "Update prescriptions", Actions: `["update"]`},
		{Name: "prescriptions.process", Module: "EMR", Category: "Prescriptions", Description: "Process prescription fulfillment and dispensing", Actions: `["process"]`},

		{Name: "informed_consent.view", Module: "EMR", Category: "Informed Consent", Description: "View informed consent", Actions: `["read"]`},
		{Name: "informed_consent.create", Module: "EMR", Category: "Informed Consent", Description: "Create informed consent", Actions: `["create"]`},

		// Kasir / Billing
		{Name: "invoices.view", Module: "Kasir", Category: "Invoices", Description: "View invoices and billing queue", Actions: `["read"]`},
		{Name: "invoices.create", Module: "Kasir", Category: "Invoices", Description: "Create and sync invoices from visits", Actions: `["create"]`},
		{Name: "invoices.update", Module: "Kasir", Category: "Invoices", Description: "Update invoice discount, tax, and cancel", Actions: `["update"]`},
		{Name: "invoices.pay", Module: "Kasir", Category: "Invoices", Description: "Process payments for invoices", Actions: `["pay"]`},
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
	DB.Where("name IN ?", []string{"profile.view", "profile.update", "dashboard.view", "reports.view"}).Find(&limitedPermissions)
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
		{Key: "system_backup_auto_enabled", Value: "1"},
		{Key: "system_backup_cron", Value: "0 2 * * *"},
		{Key: "system_backup_retention_days", Value: "7"},
		{Key: "system_backup_include_uploads", Value: "1"},
		{Key: "system_backup_last_status", Value: "idle"},
		{Key: "system_backup_last_message", Value: "Belum ada backup yang dijalankan."},
		{Key: "satusehat_sandbox_auth_url", Value: "https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1"},
		{Key: "satusehat_production_auth_url", Value: "https://api-satusehat.kemkes.go.id/oauth2/v1"},
		{Key: "satusehat_sandbox_fhir_url", Value: "https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1"},
		{Key: "satusehat_production_fhir_url", Value: "https://api-satusehat.kemkes.go.id/fhir-r4/v1"},
		{Key: "satusehat_enabled", Value: "1"},
		{Key: "satusehat_active_mode", Value: "sandbox"},
		{Key: "satusehat_organization_id", Value: ""},
		{Key: "satusehat_client_id", Value: ""},
		{Key: "satusehat_client_secret", Value: ""},
	}

	for _, setting := range defaultSettings {
		DB.Where(models.Setting{Key: setting.Key}).FirstOrCreate(&setting)
	}

	// Seed Phase 1: Master Data
	seedMasterData()

	return nil
}

func backfillMedicalServiceMetadata() error {
	if !DB.Migrator().HasTable(&models.MedicalService{}) {
		return nil
	}

	if err := DB.Exec(`
		UPDATE medical_services
		SET service_domain = CASE
			WHEN LOWER(COALESCE(service_categories.name, '')) IN ('laboratorium', 'laboratory') THEN 'laboratory'
			WHEN LOWER(COALESCE(service_categories.name, '')) IN ('radiologi', 'radiology') THEN 'radiology'
			ELSE 'general'
		END
		FROM service_categories
		WHERE medical_services.category_id = service_categories.id
			AND COALESCE(NULLIF(BTRIM(medical_services.service_domain), ''), '') = ''
	`).Error; err != nil {
		return err
	}

	if err := DB.Exec(`
		UPDATE medical_services
		SET service_domain = 'general'
		WHERE COALESCE(NULLIF(BTRIM(service_domain), ''), '') = ''
	`).Error; err != nil {
		return err
	}

	if err := DB.Exec(`
		UPDATE medical_services
		SET target_scope = 'none'
		WHERE COALESCE(NULLIF(BTRIM(target_scope), ''), '') = ''
	`).Error; err != nil {
		return err
	}

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
		{Name: "Radiologi"},
		{Name: "Farmasi"},
	}
	for _, sc := range serviceCategories {
		DB.Where(models.ServiceCategory{Name: sc.Name}).FirstOrCreate(&sc)
	}

	labCategories := []models.LabTestCategory{
		{Name: "Hematologi"},
		{Name: "Kimia Klinik"},
		{Name: "Urinalisis"},
	}
	for _, category := range labCategories {
		DB.Where(models.LabTestCategory{Name: category.Name}).FirstOrCreate(&category)
	}

	var hematologyCategory models.LabTestCategory
	var chemistryCategory models.LabTestCategory
	var urinalysisCategory models.LabTestCategory
	DB.Where("name = ?", "Hematologi").First(&hematologyCategory)
	DB.Where("name = ?", "Kimia Klinik").First(&chemistryCategory)
	DB.Where("name = ?", "Urinalisis").First(&urinalysisCategory)

	labTests := []models.LabTest{
		{Code: "LAB-CBC", Name: "Darah Lengkap", CategoryID: hematologyCategory.ID, Unit: "panel", NormalValueMale: "Lihat detail parameter", NormalValueFemale: "Lihat detail parameter", Price: 85000, IsActive: true, SortOrder: 1},
		{Code: "LAB-GLU", Name: "Glukosa Sewaktu", CategoryID: chemistryCategory.ID, Unit: "mg/dL", NormalValueMale: "70 - 140", NormalValueFemale: "70 - 140", Price: 30000, IsActive: true, SortOrder: 2},
		{Code: "LAB-URN", Name: "Urinalisis Rutin", CategoryID: urinalysisCategory.ID, Unit: "panel", NormalValueMale: "Lihat detail parameter", NormalValueFemale: "Lihat detail parameter", Price: 40000, IsActive: true, SortOrder: 3},
	}
	for _, test := range labTests {
		DB.Where(models.LabTest{Code: test.Code}).FirstOrCreate(&test)
	}

	var completeBloodCount models.LabTest
	var bloodGlucose models.LabTest
	var routineUrinalysis models.LabTest
	DB.Where("code = ?", "LAB-CBC").First(&completeBloodCount)
	DB.Where("code = ?", "LAB-GLU").First(&bloodGlucose)
	DB.Where("code = ?", "LAB-URN").First(&routineUrinalysis)

	labParameters := []models.LabTestParameter{
		{LabTestID: completeBloodCount.ID, Code: "HB", Name: "Hemoglobin", Unit: "g/dL", NormalValueMale: "13 - 17", NormalValueFemale: "12 - 15", SortOrder: 1, IsRequired: true},
		{LabTestID: completeBloodCount.ID, Code: "HCT", Name: "Hematokrit", Unit: "%", NormalValueMale: "40 - 50", NormalValueFemale: "36 - 44", SortOrder: 2, IsRequired: true},
		{LabTestID: completeBloodCount.ID, Code: "WBC", Name: "Leukosit", Unit: "/uL", NormalValueMale: "4.000 - 11.000", NormalValueFemale: "4.000 - 11.000", SortOrder: 3, IsRequired: true},
		{LabTestID: completeBloodCount.ID, Code: "PLT", Name: "Trombosit", Unit: "/uL", NormalValueMale: "150.000 - 450.000", NormalValueFemale: "150.000 - 450.000", SortOrder: 4, IsRequired: true},
		{LabTestID: completeBloodCount.ID, Code: "RBC", Name: "Eritrosit", Unit: "juta/uL", NormalValueMale: "4.5 - 5.9", NormalValueFemale: "4.1 - 5.1", SortOrder: 5, IsRequired: true},
		{LabTestID: completeBloodCount.ID, Code: "MCV", Name: "MCV", Unit: "fL", NormalValueMale: "80 - 100", NormalValueFemale: "80 - 100", SortOrder: 6, IsRequired: true},
		{LabTestID: completeBloodCount.ID, Code: "MCH", Name: "MCH", Unit: "pg", NormalValueMale: "27 - 33", NormalValueFemale: "27 - 33", SortOrder: 7, IsRequired: true},
		{LabTestID: completeBloodCount.ID, Code: "MCHC", Name: "MCHC", Unit: "g/dL", NormalValueMale: "32 - 36", NormalValueFemale: "32 - 36", SortOrder: 8, IsRequired: true},
		{LabTestID: bloodGlucose.ID, Code: "GLU", Name: "Glukosa Sewaktu", Unit: "mg/dL", NormalValueMale: "70 - 140", NormalValueFemale: "70 - 140", SortOrder: 1, IsRequired: true},
		{LabTestID: routineUrinalysis.ID, Code: "COLOR", Name: "Warna", Unit: "", NormalValueMale: "Kuning jernih", NormalValueFemale: "Kuning jernih", SortOrder: 1, IsRequired: true},
		{LabTestID: routineUrinalysis.ID, Code: "PROT", Name: "Protein", Unit: "", NormalValueMale: "Negatif", NormalValueFemale: "Negatif", SortOrder: 2, IsRequired: true},
		{LabTestID: routineUrinalysis.ID, Code: "GLU-URI", Name: "Glukosa Urin", Unit: "", NormalValueMale: "Negatif", NormalValueFemale: "Negatif", SortOrder: 3, IsRequired: true},
		{LabTestID: routineUrinalysis.ID, Code: "LEU", Name: "Leukosit Urin", Unit: "/LPB", NormalValueMale: "0 - 5", NormalValueFemale: "0 - 5", SortOrder: 4, IsRequired: true},
	}
	for _, parameter := range labParameters {
		if parameter.LabTestID == 0 {
			continue
		}
		DB.Where(models.LabTestParameter{LabTestID: parameter.LabTestID, Code: parameter.Code}).FirstOrCreate(&parameter)
	}

	var medicalProcedureCategory models.ServiceCategory
	var laboratoryCategory models.ServiceCategory
	var radiologyCategory models.ServiceCategory
	DB.Where("name = ?", "Tindakan Medis").First(&medicalProcedureCategory)
	DB.Where("name = ?", "Laboratorium").First(&laboratoryCategory)
	DB.Where("name = ?", "Radiologi").First(&radiologyCategory)

	serviceMasters := []models.MedicalService{}
	if medicalProcedureCategory.ID != 0 {
		serviceMasters = append(serviceMasters,
			models.MedicalService{Code: "SRV-DEN-0001", Name: "Konsultasi Dokter Gigi", CategoryID: medicalProcedureCategory.ID, ServiceDomain: "dental", TargetScope: "none", Price: 75000, IsActive: true, Description: "Konsultasi pemeriksaan umum dokter gigi."},
			models.MedicalService{Code: "SRV-DEN-0002", Name: "Tambal Komposit 1 Permukaan", CategoryID: medicalProcedureCategory.ID, ServiceDomain: "dental", TargetScope: "surface", SupportsOdontogramSync: true, Price: 175000, IsActive: true, Description: "Restorasi komposit untuk satu permukaan gigi."},
			models.MedicalService{Code: "SRV-DEN-0003", Name: "Ekstraksi Gigi", CategoryID: medicalProcedureCategory.ID, ServiceDomain: "dental", TargetScope: "tooth", RequiresConsent: true, SupportsOdontogramSync: true, Price: 250000, IsActive: true, Description: "Pencabutan satu gigi sesuai indikasi klinis."},
			models.MedicalService{Code: "SRV-DEN-0004", Name: "Scaling Per Kuadran", CategoryID: medicalProcedureCategory.ID, ServiceDomain: "dental", TargetScope: "quadrant", Price: 200000, IsActive: true, Description: "Scaling supragingiva dan subgingiva per kuadran."},
			models.MedicalService{Code: "SRV-DEN-0005", Name: "Aplikasi Fissure Sealant", CategoryID: medicalProcedureCategory.ID, ServiceDomain: "dental", TargetScope: "surface", SupportsOdontogramSync: true, Price: 150000, IsActive: true, Description: "Aplikasi sealant pada pit dan fissure gigi posterior."},
		)
	}
	if laboratoryCategory.ID != 0 {
		serviceMasters = append(serviceMasters,
			models.MedicalService{Code: "SRV-LAB-0001", Name: "Darah Lengkap", CategoryID: laboratoryCategory.ID, ServiceDomain: "laboratory", TargetScope: "none", Price: 85000, IsActive: true, Description: "Panel hematologi lengkap dengan parameter CBC."},
			models.MedicalService{Code: "SRV-LAB-0002", Name: "Glukosa Sewaktu", CategoryID: laboratoryCategory.ID, ServiceDomain: "laboratory", TargetScope: "none", Price: 30000, IsActive: true, Description: "Pemeriksaan glukosa darah sewaktu."},
			models.MedicalService{Code: "SRV-LAB-0003", Name: "Urinalisis Rutin", CategoryID: laboratoryCategory.ID, ServiceDomain: "laboratory", TargetScope: "none", Price: 40000, IsActive: true, Description: "Panel urinalisis dasar dengan beberapa parameter rutin."},
		)
	}
	if radiologyCategory.ID != 0 {
		serviceMasters = append(serviceMasters,
			models.MedicalService{Code: "SRV-RAD-0001", Name: "X-Ray Thorax", CategoryID: radiologyCategory.ID, ServiceDomain: "radiology", TargetScope: "none", Price: 150000, IsActive: true, Description: "Template hasil radiologi thorax."},
			models.MedicalService{Code: "SRV-RAD-0002", Name: "USG Abdomen", CategoryID: radiologyCategory.ID, ServiceDomain: "radiology", TargetScope: "none", Price: 250000, IsActive: true, Description: "Template hasil radiologi abdomen."},
		)
	}
	for _, service := range serviceMasters {
		DB.Where(models.MedicalService{Code: service.Code}).FirstOrCreate(&service)
	}

	var completeBloodCountService models.MedicalService
	var bloodGlucoseService models.MedicalService
	var routineUrinalysisService models.MedicalService
	var xrayThoraxService models.MedicalService
	var usgAbdomenService models.MedicalService
	DB.Where("code = ?", "SRV-LAB-0001").First(&completeBloodCountService)
	DB.Where("code = ?", "SRV-LAB-0002").First(&bloodGlucoseService)
	DB.Where("code = ?", "SRV-LAB-0003").First(&routineUrinalysisService)
	DB.Where("code = ?", "SRV-RAD-0001").First(&xrayThoraxService)
	DB.Where("code = ?", "SRV-RAD-0002").First(&usgAbdomenService)

	serviceParameters := []models.MedicalServiceParameter{
		{MedicalServiceID: completeBloodCountService.ID, Code: "HB", Name: "Hemoglobin", InputType: "number", Unit: "g/dL", ReferenceValueMale: "13 - 17", ReferenceValueFemale: "12 - 15", SortOrder: 1, IsRequired: true},
		{MedicalServiceID: completeBloodCountService.ID, Code: "HCT", Name: "Hematokrit", InputType: "number", Unit: "%", ReferenceValueMale: "40 - 50", ReferenceValueFemale: "36 - 44", SortOrder: 2, IsRequired: true},
		{MedicalServiceID: completeBloodCountService.ID, Code: "WBC", Name: "Leukosit", InputType: "number", Unit: "/uL", ReferenceValueMale: "4.000 - 11.000", ReferenceValueFemale: "4.000 - 11.000", SortOrder: 3, IsRequired: true},
		{MedicalServiceID: completeBloodCountService.ID, Code: "PLT", Name: "Trombosit", InputType: "number", Unit: "/uL", ReferenceValueMale: "150.000 - 450.000", ReferenceValueFemale: "150.000 - 450.000", SortOrder: 4, IsRequired: true},
		{MedicalServiceID: bloodGlucoseService.ID, Code: "GLU", Name: "Glukosa Sewaktu", InputType: "number", Unit: "mg/dL", ReferenceValueMale: "70 - 140", ReferenceValueFemale: "70 - 140", SortOrder: 1, IsRequired: true},
		{MedicalServiceID: routineUrinalysisService.ID, Code: "COLOR", Name: "Warna", InputType: "text", Unit: "", ReferenceValueMale: "Kuning jernih", ReferenceValueFemale: "Kuning jernih", SortOrder: 1, IsRequired: true},
		{MedicalServiceID: routineUrinalysisService.ID, Code: "PROT", Name: "Protein", InputType: "text", Unit: "", ReferenceValueMale: "Negatif", ReferenceValueFemale: "Negatif", SortOrder: 2, IsRequired: true},
		{MedicalServiceID: routineUrinalysisService.ID, Code: "LEU", Name: "Leukosit Urin", InputType: "text", Unit: "/LPB", ReferenceValueMale: "0 - 5", ReferenceValueFemale: "0 - 5", SortOrder: 3, IsRequired: true},
		{MedicalServiceID: xrayThoraxService.ID, Code: "FINDINGS", Name: "Temuan", InputType: "textarea", Unit: "", ReferenceValueMale: "", ReferenceValueFemale: "", SortOrder: 1, IsRequired: true},
		{MedicalServiceID: xrayThoraxService.ID, Code: "IMPRESSION", Name: "Kesan", InputType: "textarea", Unit: "", ReferenceValueMale: "", ReferenceValueFemale: "", SortOrder: 2, IsRequired: true},
		{MedicalServiceID: xrayThoraxService.ID, Code: "RECOMMENDATION", Name: "Rekomendasi", InputType: "textarea", Unit: "", ReferenceValueMale: "", ReferenceValueFemale: "", SortOrder: 3, IsRequired: false},
		{MedicalServiceID: usgAbdomenService.ID, Code: "FINDINGS", Name: "Temuan", InputType: "textarea", Unit: "", ReferenceValueMale: "", ReferenceValueFemale: "", SortOrder: 1, IsRequired: true},
		{MedicalServiceID: usgAbdomenService.ID, Code: "IMPRESSION", Name: "Kesan", InputType: "textarea", Unit: "", ReferenceValueMale: "", ReferenceValueFemale: "", SortOrder: 2, IsRequired: true},
		{MedicalServiceID: usgAbdomenService.ID, Code: "RECOMMENDATION", Name: "Rekomendasi", InputType: "textarea", Unit: "", ReferenceValueMale: "", ReferenceValueFemale: "", SortOrder: 3, IsRequired: false},
	}
	for _, parameter := range serviceParameters {
		if parameter.MedicalServiceID == 0 {
			continue
		}
		DB.Where(models.MedicalServiceParameter{MedicalServiceID: parameter.MedicalServiceID, Code: parameter.Code}).FirstOrCreate(&parameter)
	}

	specimenTemplates := []models.SpecimenTemplate{
		{Code: "SPEC-BLOOD-VENOUS", Name: "Darah Vena", Description: "Spesimen darah vena untuk pemeriksaan hematologi dan kimia klinik.", TypeSystem: "http://snomed.info/sct", TypeCode: "122555007", TypeDisplay: "Venous blood specimen", CollectionMethodSystem: "http://snomed.info/sct", CollectionMethodCode: "82078001", CollectionMethodDisplay: "Collection of blood specimen for laboratory", IsActive: true},
		{Code: "SPEC-BLOOD-CAP", Name: "Darah Kapiler", Description: "Spesimen darah kapiler untuk pemeriksaan point-of-care tertentu.", TypeSystem: "http://snomed.info/sct", TypeCode: "119297000", TypeDisplay: "Blood specimen", CollectionMethodSystem: "http://snomed.info/sct", CollectionMethodCode: "278450005", CollectionMethodDisplay: "Capillary blood specimen collection", IsActive: true},
		{Code: "SPEC-URINE-MIDSTREAM", Name: "Urine Midstream", Description: "Spesimen urin porsi tengah untuk urinalisis rutin.", TypeSystem: "http://snomed.info/sct", TypeCode: "122575003", TypeDisplay: "Urine specimen", CollectionMethodSystem: "http://snomed.info/sct", CollectionMethodCode: "386089008", CollectionMethodDisplay: "Collection of urine specimen", IsActive: true},
	}
	for _, template := range specimenTemplates {
		DB.Where(models.SpecimenTemplate{Code: template.Code}).FirstOrCreate(&template)
	}

	var venousBloodTemplate models.SpecimenTemplate
	var capillaryBloodTemplate models.SpecimenTemplate
	var midstreamUrineTemplate models.SpecimenTemplate
	DB.Where("code = ?", "SPEC-BLOOD-VENOUS").First(&venousBloodTemplate)
	DB.Where("code = ?", "SPEC-BLOOD-CAP").First(&capillaryBloodTemplate)
	DB.Where("code = ?", "SPEC-URINE-MIDSTREAM").First(&midstreamUrineTemplate)

	serviceSpecimens := []models.MedicalServiceSpecimen{
		{MedicalServiceID: completeBloodCountService.ID, SpecimenTemplateID: venousBloodTemplate.ID, SortOrder: 1, IsDefault: true, Notes: "Default untuk CBC standar."},
		{MedicalServiceID: bloodGlucoseService.ID, SpecimenTemplateID: venousBloodTemplate.ID, SortOrder: 1, IsDefault: true, Notes: "Default untuk glukosa laboratorium rutin."},
		{MedicalServiceID: bloodGlucoseService.ID, SpecimenTemplateID: capillaryBloodTemplate.ID, SortOrder: 2, IsDefault: false, Notes: "Opsi bila pemeriksaan dilakukan dari darah kapiler."},
		{MedicalServiceID: routineUrinalysisService.ID, SpecimenTemplateID: midstreamUrineTemplate.ID, SortOrder: 1, IsDefault: true, Notes: "Default untuk urinalisis rutin."},
	}
	for _, serviceSpecimen := range serviceSpecimens {
		if serviceSpecimen.MedicalServiceID == 0 || serviceSpecimen.SpecimenTemplateID == 0 {
			continue
		}
		DB.Where(models.MedicalServiceSpecimen{MedicalServiceID: serviceSpecimen.MedicalServiceID, SpecimenTemplateID: serviceSpecimen.SpecimenTemplateID}).FirstOrCreate(&serviceSpecimen)
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

	// Seed ICD-10 & ICD-9-CM codes from TSV dataset
	seedICD10FromTSV()

	log.Println("Master data seeded successfully")
}

// seedICD10FromTSV reads dataset/icd.tsv and upserts all valid codes (VALIDCODE=1).
func seedICD10FromTSV() {
	// Skip if codes already seeded (check for >100 entries)
	var count int64
	DB.Model(&models.ICD10{}).Count(&count)
	if count > 1000 {
		log.Printf("ICD codes already seeded (%d entries), skipping TSV import", count)
		return
	}

	tsvPath := "dataset/icd.tsv"
	if _, err := os.Stat(tsvPath); os.IsNotExist(err) {
		// Try relative to binary location
		tsvPath = "../dataset/icd.tsv"
		if _, err := os.Stat(tsvPath); os.IsNotExist(err) {
			log.Println("WARNING: dataset/icd.tsv not found, skipping ICD seed from TSV")
			return
		}
	}

	file, err := os.Open(tsvPath)
	if err != nil {
		log.Printf("WARNING: cannot open %s: %v", tsvPath, err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

	// Skip header
	if !scanner.Scan() {
		log.Println("WARNING: icd.tsv is empty")
		return
	}

	batch := make([]models.ICD10, 0, 500)
	imported := 0

	for scanner.Scan() {
		line := scanner.Text()
		cols := strings.Split(line, "\t")
		if len(cols) < 5 {
			continue
		}

		code := strings.TrimSpace(cols[0])
		display := strings.TrimSpace(cols[2])
		system := strings.TrimSpace(cols[3])
		validCode := strings.TrimSpace(cols[4])

		// Only import valid codes
		if validCode != "1" || code == "" || display == "" {
			continue
		}

		// Truncate display if needed
		if len(display) > 512 {
			display = display[:512]
		}

		// Determine chapter from code prefix
		chapter := mapICDChapter(code, system)

		batch = append(batch, models.ICD10{
			Code:    code,
			Name:    display,
			System:  system,
			Chapter: chapter,
		})

		if len(batch) >= 500 {
			DB.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "code"}},
				DoUpdates: clause.AssignmentColumns([]string{"name", "system", "chapter", "updated_at"}),
			}).Create(&batch)
			imported += len(batch)
			batch = batch[:0]
		}
	}

	if len(batch) > 0 {
		DB.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "code"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "system", "chapter", "updated_at"}),
		}).Create(&batch)
		imported += len(batch)
	}

	log.Printf("ICD codes seeded from TSV: %d entries imported", imported)
}

// mapICDChapter returns ICD-10 chapter from code prefix letter.
func mapICDChapter(code, system string) string {
	if strings.Contains(system, "ICD9CM") {
		return "ICD-9-CM"
	}
	if len(code) == 0 {
		return ""
	}
	switch code[0] {
	case 'A', 'B':
		return "I"
	case 'C', 'D':
		if len(code) >= 3 {
			numPart := code[1:3]
			if numPart >= "00" && numPart <= "48" {
				return "II"
			}
			if code[0] == 'D' && numPart >= "50" && numPart <= "89" {
				return "III"
			}
		}
		if code[0] == 'C' {
			return "II"
		}
		return "III"
	case 'E':
		return "IV"
	case 'F':
		return "V"
	case 'G':
		return "VI"
	case 'H':
		if len(code) >= 3 {
			numPart := code[1:3]
			if numPart >= "00" && numPart <= "59" {
				return "VII"
			}
		}
		return "VIII"
	case 'I':
		return "IX"
	case 'J':
		return "X"
	case 'K':
		return "XI"
	case 'L':
		return "XII"
	case 'M':
		return "XIII"
	case 'N':
		return "XIV"
	case 'O':
		return "XV"
	case 'P':
		return "XVI"
	case 'Q':
		return "XVII"
	case 'R':
		return "XVIII"
	case 'S', 'T':
		return "XIX"
	case 'V', 'W', 'X', 'Y':
		return "XX"
	case 'Z':
		return "XXI"
	case 'U':
		return "XXII"
	default:
		return ""
	}
}
