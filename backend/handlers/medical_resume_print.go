package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
)

type medicalResumePrintViewData struct {
	GeneratedAt                time.Time
	PrintedBy                  string
	ValidationBaseURL          string
	Visit                      models.Visit
	DocumentFields             []initialAssessmentPrintField
	PatientFields              []initialAssessmentPrintField
	VisitFields                []initialAssessmentPrintField
	AnamnesisFields            []initialAssessmentPrintField
	PhysicalExamFields         []initialAssessmentPrintField
	AssessmentFields           []initialAssessmentPrintField
	OutcomeFields              []initialAssessmentPrintField
	Diagnoses                  []initialAssessmentPrintDiagnosisView
	PhysicalExamImageSummaries []string
	PharmacyRows               []supportingOrderResultTableRow
	LaboratoryRows             []supportingOrderResultTableRow
	RadiologyRows              []supportingOrderResultTableRow
	ProcedureRows              []supportingOrderResultTableRow
	OdontogramRows             []supportingOrderResultTableRow
	PrescriptionSummaries      []string
	LaboratorySummaries        []string
	RadiologySummaries         []string
	ProcedureSummaries         []string
	ConsentSummaries           []string
	OdontogramSummaries        []string
}

func PrintMedicalResumeVisit(c *gin.Context) {
	visitID, err := strconv.Atoi(c.Param("visitId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visit ID"})
		return
	}

	var visit models.Visit
	if err := database.DB.
		Preload("Patient").
		Preload("Doctor").
		Preload("Polyclinic").
		First(&visit, uint(visitID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Kunjungan tidak ditemukan"})
		return
	}

	var records []models.MedicalRecord
	if err := preloadMedicalRecordRelations(database.DB).
		Where("visit_id = ?", uint(visitID)).
		Order("record_date ASC").
		Order("created_at ASC").
		Order("id ASC").
		Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var odontogramEntries []models.OdontogramEntry
	if err := preloadOdontogramEntryRelations(database.DB).
		Where("visit_id = ?", uint(visitID)).
		Order("created_at ASC").
		Order("id ASC").
		Find(&odontogramEntries).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	viewData := buildMedicalResumePrintViewData(c, visit, records, odontogramEntries)
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderMedicalResumePDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF resume medis"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func buildMedicalResumePrintViewData(c *gin.Context, visit models.Visit, records []models.MedicalRecord, odontogramEntries []models.OdontogramEntry) medicalResumePrintViewData {
	generatedAt := time.Now()
	activeRecords := filterPrintableMedicalResumeRecords(records)
	sectionRecords := make(map[string]*models.MedicalRecord, 4)
	for index := range activeRecords {
		record := &activeRecords[index]
		sectionRecords[normalizeMedicalRecordSection(record.SectionType)] = record
	}

	printedBy := resolvePrintedByLabel(c)
	anamnesisRecord := sectionRecords["anamnesis"]
	physicalExamRecord := sectionRecords["physical_exam"]
	assessmentRecord := sectionRecords["assessment"]
	outcomeRecord := sectionRecords["outcome"]
	activeOdontogramEntries := filterPrintableOdontogramEntries(odontogramEntries)

	return medicalResumePrintViewData{
		GeneratedAt:                generatedAt,
		PrintedBy:                  printedBy,
		ValidationBaseURL:          resolveTTEVerificationBaseURLForRequest(c),
		Visit:                      visit,
		DocumentFields:             buildMedicalResumeDocumentFields(visit, generatedAt, printedBy, activeRecords, activeOdontogramEntries, outcomeRecord),
		PatientFields:              buildInitialAssessmentPatientFields(visit.Patient),
		VisitFields:                buildInitialAssessmentVisitFields(visit),
		AnamnesisFields:            buildInitialAssessmentAnamnesisFields(anamnesisRecord),
		PhysicalExamFields:         buildInitialAssessmentPhysicalExamFields(physicalExamRecord),
		AssessmentFields:           buildMedicalResumeAssessmentFields(assessmentRecord),
		OutcomeFields:              buildMedicalResumeOutcomeFields(outcomeRecord),
		Diagnoses:                  buildInitialAssessmentDiagnosisViews(assessmentRecord),
		PhysicalExamImageSummaries: buildMedicalResumePhysicalExamImageSummaries(activeRecords),
		PharmacyRows:               buildMedicalResumePharmacyRows(activeRecords),
		LaboratoryRows:             buildMedicalResumeLaboratoryRows(activeRecords),
		RadiologyRows:              buildMedicalResumeRadiologyRows(activeRecords),
		ProcedureRows:              buildMedicalResumeProcedureRows(activeRecords),
		OdontogramRows:             buildMedicalResumeOdontogramRows(activeOdontogramEntries),
		PrescriptionSummaries:      buildMedicalResumePrescriptionSummaries(activeRecords),
		LaboratorySummaries:        buildMedicalResumeLaboratorySummaries(activeRecords),
		RadiologySummaries:         buildMedicalResumeRadiologySummaries(activeRecords),
		ProcedureSummaries:         buildMedicalResumeProcedureSummaries(activeRecords),
		ConsentSummaries:           buildMedicalResumeConsentSummaries(activeRecords, visit.Patient),
		OdontogramSummaries:        buildMedicalResumeOdontogramSummaries(activeOdontogramEntries),
	}
}

func renderMedicalResumePDF(hospitalInfo initialAssessmentHospitalInfo, data medicalResumePrintViewData) ([]byte, string, error) {
	pdf := newInitialAssessmentStyledPDF("Resume Medis", data.PrintedBy, data.GeneratedAt)
	beginInitialAssessmentStyledSection(pdf, hospitalInfo, "RESUME MEDIS", fallbackText(data.Visit.VisitNumber))
	tteSignature := loadTTESignedSignatureByDocumentKeyWithBaseURL(fmt.Sprintf("resume_medis:visit:%d", data.Visit.ID), data.ValidationBaseURL)

	addInitialAssessmentFieldSection(pdf, "INFORMASI DOKUMEN", filterMedicalResumeFields(data.DocumentFields), "Informasi dokumen tidak tersedia.")
	addInitialAssessmentFieldSection(pdf, "DATA PASIEN", filterMedicalResumeFields(data.PatientFields), "Data pasien tidak tersedia.")
	addInitialAssessmentFieldSection(pdf, "DATA KUNJUNGAN", filterMedicalResumeFields(data.VisitFields), "Data kunjungan tidak tersedia.")
	addInitialAssessmentFieldSection(pdf, "ANAMNESIS", filterMedicalResumeFields(data.AnamnesisFields), "Tidak ada ringkasan anamnesis.")
	addInitialAssessmentFieldSection(pdf, "PEMERIKSAAN FISIK", filterMedicalResumeFields(data.PhysicalExamFields), "Tidak ada ringkasan pemeriksaan fisik.")
	addInitialAssessmentFieldSection(pdf, "ASSESSMENT DAN RENCANA", filterMedicalResumeFields(data.AssessmentFields), "Tidak ada ringkasan assessment.")
	addInitialAssessmentDiagnosisSection(pdf, data.Diagnoses)
	addInitialAssessmentFieldSection(pdf, "PEMULANGAN DAN TINDAK LANJUT", filterMedicalResumeFields(data.OutcomeFields), "Outcome finalisasi belum tersedia.")

	if len(data.PhysicalExamImageSummaries) > 0 {
		addMedicalResumeNarrativeSection(pdf, "GAMBAR PEMERIKSAAN FISIK", data.PhysicalExamImageSummaries, "Tidak ada ringkasan gambar pemeriksaan fisik.")
	}
	addSupportingOrderResultTable(pdf, "TINDAKAN DAN PROSEDUR", buildMedicalResumeProcedureColumns(), data.ProcedureRows, "Tidak ada tindakan tercatat.")
	addSupportingOrderResultTable(pdf, "RESEP DAN FARMASI", buildMedicalResumePharmacyColumns(), data.PharmacyRows, "Tidak ada resep aktif.")
	addSupportingOrderResultTable(pdf, "LABORATORIUM", buildMedicalResumeLaboratoryColumns(), data.LaboratoryRows, "Tidak ada order laboratorium.")
	addSupportingOrderResultTable(pdf, "RADIOLOGI", buildMedicalResumeRadiologyColumns(), data.RadiologyRows, "Tidak ada order radiologi.")
	if len(data.ConsentSummaries) > 0 {
		addMedicalResumeNarrativeSection(pdf, "INFORMED CONSENT", data.ConsentSummaries, "Tidak ada informed consent tercatat.")
	}
	addSupportingOrderResultTable(pdf, "ODONTOGRAM", buildMedicalResumeOdontogramColumns(), data.OdontogramRows, "Tidak ada odontogram tercatat.")

	addOrderPrintSignatureSectionWithTTE(pdf, hospitalInfo, data.GeneratedAt, "Pasien / Keluarga", data.Visit.Patient.FullName, "Dokter Pemeriksa", data.Visit.Doctor.FullName, tteSignature)

	pdfBytes, err := outputInitialAssessmentStyledPDF(pdf)
	if err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("resume-medis-%s-%s.pdf", sanitizePDFFileName(data.Visit.Patient.FullName), sanitizePDFFileName(data.Visit.VisitNumber))
	return pdfBytes, fileName, nil
}

func filterPrintableMedicalResumeRecords(records []models.MedicalRecord) []models.MedicalRecord {
	filtered := make([]models.MedicalRecord, 0, len(records))
	for _, record := range records {
		if strings.EqualFold(strings.TrimSpace(record.Status), "cancelled") {
			continue
		}
		filtered = append(filtered, record)
	}
	return filtered
}

func filterPrintableOdontogramEntries(entries []models.OdontogramEntry) []models.OdontogramEntry {
	filtered := make([]models.OdontogramEntry, 0, len(entries))
	for _, entry := range entries {
		if normalizeOdontogramStatus(entry.Status) == odontogramStatusCancel {
			continue
		}
		filtered = append(filtered, entry)
	}
	return filtered
}

func buildMedicalResumeDocumentFields(visit models.Visit, generatedAt time.Time, printedBy string, records []models.MedicalRecord, odontogramEntries []models.OdontogramEntry, outcomeRecord *models.MedicalRecord) []initialAssessmentPrintField {
	totalActions := countMedicalResumeActions(records)
	finalizedAt := "-"
	if outcomeRecord != nil {
		finalizedAt = formatDateTimeIndonesian(resolveMedicalResumeRecordTime(*outcomeRecord))
	} else if strings.EqualFold(strings.TrimSpace(visit.Status), "completed") {
		finalizedAt = formatDateTimeIndonesian(visit.UpdatedAt)
	}

	return []initialAssessmentPrintField{
		{Label: "Jenis Dokumen", Value: "Resume Medis"},
		{Label: "Status Kunjungan", Value: medicalResumeVisitStatusLabel(visit.Status)},
		{Label: "Tanggal Finalisasi", Value: finalizedAt},
		{Label: "Tanggal Cetak", Value: formatDateTimeIndonesian(generatedAt)},
		{Label: "Petugas Cetak", Value: fallbackText(printedBy)},
		{Label: "Total Entri EMR", Value: fmt.Sprintf("%d", len(records))},
		{Label: "Total Tindakan", Value: fmt.Sprintf("%d", totalActions)},
		{Label: "Total Entri Odontogram", Value: fmt.Sprintf("%d", len(odontogramEntries))},
		{Label: "Outcome Akhir", Value: medicalResumeDispositionLabel(resolveMedicalResumeDisposition(outcomeRecord))},
	}
}

func buildMedicalResumeAssessmentFields(record *models.MedicalRecord) []initialAssessmentPrintField {
	if record == nil {
		return nil
	}

	return []initialAssessmentPrintField{
		{Label: "Diagnosis Kerja", Value: fallbackText(record.WorkingDiagnosis)},
		{Label: "Diagnosis Banding", Value: fallbackText(record.DifferentialDiagnosis)},
		{Label: "Assessment", Value: fallbackText(record.Assessment)},
		{Label: "Rencana", Value: fallbackText(record.Plan)},
		{Label: "Catatan", Value: fallbackText(record.Notes)},
	}
}

func buildMedicalResumeOutcomeFields(record *models.MedicalRecord) []initialAssessmentPrintField {
	if record == nil {
		return nil
	}

	followUpAt := "-"
	if record.FollowUpAt != nil && !record.FollowUpAt.IsZero() {
		followUpAt = formatDateTimeIndonesian(*record.FollowUpAt)
	}

	return []initialAssessmentPrintField{
		{Label: "Disposisi", Value: medicalResumeDispositionLabel(record.Disposition)},
		{Label: "Kondisi Pulang", Value: fallbackText(record.DischargeCondition)},
		{Label: "Instruksi Tindak Lanjut", Value: fallbackText(record.FollowUpInstruction)},
		{Label: "Jadwal Kontrol", Value: followUpAt},
		{Label: "Tujuan Rujukan", Value: fallbackText(record.ReferralDestination)},
		{Label: "Alasan Rujukan", Value: fallbackText(record.ReferralReason)},
		{Label: "Catatan Final", Value: fallbackText(record.Notes)},
	}
}

func buildMedicalResumePhysicalExamImageSummaries(records []models.MedicalRecord) []string {
	summaries := make([]string, 0)
	for _, record := range records {
		for _, imagePick := range record.PhysicalExamImages {
			parts := []string{fallbackText(imagePick.PhysicalExamImageMaster.Name)}
			if location := strings.TrimSpace(imagePick.PhysicalExamImageMaster.Location); location != "" {
				parts = append(parts, "Lokasi "+location)
			}
			if notes := strings.TrimSpace(imagePick.Notes); notes != "" {
				parts = append(parts, "Catatan "+notes)
			}
			markerLabels := make([]string, 0, len(imagePick.Markers))
			for _, marker := range imagePick.Markers {
				if label := strings.TrimSpace(marker.MarkerLabel); label != "" {
					markerLabels = append(markerLabels, label)
				}
			}
			if len(markerLabels) > 0 {
				parts = append(parts, "Marker "+strings.Join(markerLabels, ", "))
			}
			summaries = append(summaries, buildMedicalResumeSummaryWithRecord(record, parts...))
		}
	}
	return summaries
}

func buildMedicalResumePrescriptionSummaries(records []models.MedicalRecord) []string {
	summaries := make([]string, 0)
	for _, record := range records {
		for _, prescription := range record.Prescriptions {
			name := firstNonEmpty(strings.TrimSpace(prescription.Medicine.Name), strings.TrimSpace(prescription.Medicine.GenericName), fmt.Sprintf("Obat #%d", prescription.ID))
			parts := []string{name}
			if quantityLine := buildMedicalResumePrescriptionQuantityLine(prescription.Quantity, prescription.Medicine.Unit.Name); quantityLine != "" {
				parts = append(parts, "Jumlah "+quantityLine)
			}
			if regimen := buildMedicalResumeRegimenLine(prescription.Dosage, prescription.Frequency, prescription.Duration, prescription.Route); regimen != "" {
				parts = append(parts, "Aturan "+regimen)
			}
			if instructions := strings.TrimSpace(prescription.Instructions); instructions != "" {
				parts = append(parts, "Instruksi "+instructions)
			}
			if notes := strings.TrimSpace(prescription.Notes); notes != "" {
				parts = append(parts, "Catatan "+notes)
			}
			summaries = append(summaries, buildMedicalResumeSummaryWithRecord(record, parts...))
		}

		for _, compound := range record.PrescriptionCompounds {
			parts := []string{firstNonEmpty(strings.TrimSpace(compound.Name), fmt.Sprintf("Racikan #%d", compound.ID))}
			if outputLine := buildMedicalResumeCompoundOutputLine(compound); outputLine != "" {
				parts = append(parts, outputLine)
			}
			if regimen := buildMedicalResumeRegimenLine(compound.Dosage, compound.Frequency, compound.Duration, compound.Route); regimen != "" {
				parts = append(parts, "Aturan "+regimen)
			}
			ingredients := make([]string, 0, len(compound.Items))
			for _, item := range compound.Items {
				itemName := firstNonEmpty(strings.TrimSpace(item.Medicine.Name), fmt.Sprintf("Obat #%d", item.MedicineID))
				quantityLine := buildMedicalResumePrescriptionQuantityLine(item.Quantity, item.Medicine.Unit.Name)
				if quantityLine != "" {
					ingredients = append(ingredients, itemName+" "+quantityLine)
				} else {
					ingredients = append(ingredients, itemName)
				}
			}
			if len(ingredients) > 0 {
				parts = append(parts, "Komposisi "+strings.Join(ingredients, "; "))
			}
			if instructions := strings.TrimSpace(compound.Instructions); instructions != "" {
				parts = append(parts, "Instruksi "+instructions)
			}
			if notes := strings.TrimSpace(compound.Notes); notes != "" {
				parts = append(parts, "Catatan "+notes)
			}
			summaries = append(summaries, buildMedicalResumeSummaryWithRecord(record, parts...))
		}
	}
	return summaries
}

func buildMedicalResumePharmacyRows(records []models.MedicalRecord) []supportingOrderResultTableRow {
	rows := make([]supportingOrderResultTableRow, 0)
	for _, record := range records {
		recordTime := formatDateTimeIndonesian(resolveMedicalResumeRecordTime(record))
		for _, prescription := range record.Prescriptions {
			rows = append(rows, supportingOrderResultTableRow{Values: []string{
				recordTime,
				"Non-R",
				firstNonEmpty(strings.TrimSpace(prescription.Medicine.Name), strings.TrimSpace(prescription.Medicine.GenericName), fmt.Sprintf("Obat #%d", prescription.ID)),
				buildMedicalResumePrescriptionQuantityLine(prescription.Quantity, prescription.Medicine.Unit.Name),
				firstNonEmpty(buildMedicalResumeRegimenLine(prescription.Dosage, prescription.Frequency, prescription.Duration, prescription.Route), "-"),
				joinMedicalResumeParts(
					strings.TrimSpace(prescription.Instructions),
					strings.TrimSpace(prescription.Notes),
				),
			}})
		}

		for _, compound := range record.PrescriptionCompounds {
			ingredients := make([]string, 0, len(compound.Items))
			for _, item := range compound.Items {
				ingredients = append(ingredients, strings.TrimSpace(firstNonEmpty(item.Medicine.Name, fmt.Sprintf("Obat #%d", item.MedicineID)))+" "+strings.TrimSpace(buildMedicalResumePrescriptionQuantityLine(item.Quantity, item.Medicine.Unit.Name)))
			}
			rows = append(rows, supportingOrderResultTableRow{Values: []string{
				recordTime,
				"R",
				firstNonEmpty(strings.TrimSpace(compound.Name), fmt.Sprintf("Racikan #%d", compound.ID)),
				firstNonEmpty(buildMedicalResumeCompoundOutputLine(compound), "-"),
				firstNonEmpty(buildMedicalResumeRegimenLine(compound.Dosage, compound.Frequency, compound.Duration, compound.Route), "-"),
				joinMedicalResumeParts(
					strings.Join(ingredients, "; "),
					strings.TrimSpace(compound.Instructions),
					strings.TrimSpace(compound.Notes),
				),
			}})
		}
	}
	return rows
}

func buildMedicalResumeLaboratorySummaries(records []models.MedicalRecord) []string {
	summaries := make([]string, 0)
	for _, record := range records {
		for _, item := range record.LaboratoryOrderItems {
			parts := []string{resolveLaboratoryItemTitle(item), "Status " + supportingOrderWorkflowStatusLabel(record.LaboratoryWorkflowStatus)}
			parameterResults := make([]string, 0, len(item.ParameterResults))
			for _, parameter := range item.ParameterResults {
				valueParts := []string{strings.TrimSpace(parameter.ResultValue)}
				if unit := strings.TrimSpace(firstNonEmpty(parameter.UnitSnapshot, valueOrEmptyMedicalServiceParameterUnit(parameter.MedicalServiceParameter))); unit != "" {
					valueParts = append(valueParts, unit)
				}
				valueLine := strings.TrimSpace(strings.Join(valueParts, " "))
				if valueLine == "" {
					continue
				}
				parameterResults = append(parameterResults, resolveLaboratoryParameterName(parameter)+": "+valueLine)
			}
			if len(parameterResults) > 0 {
				parts = append(parts, "Hasil "+strings.Join(parameterResults, "; "))
			} else if resultValue := strings.TrimSpace(item.ResultValue); resultValue != "" {
				parts = append(parts, "Hasil "+resultValue)
			}
			if resultNotes := strings.TrimSpace(item.ResultNotes); resultNotes != "" {
				parts = append(parts, "Catatan hasil "+resultNotes)
			}
			if instructions := strings.TrimSpace(item.Instructions); instructions != "" {
				parts = append(parts, "Instruksi "+instructions)
			}
			if item.ResultDate != nil && !item.ResultDate.IsZero() {
				parts = append(parts, "Tanggal hasil "+formatDateTimeIndonesian(*item.ResultDate))
			}
			summaries = append(summaries, buildMedicalResumeSummaryWithRecord(record, parts...))
		}
	}
	return summaries
}

func buildMedicalResumeLaboratoryRows(records []models.MedicalRecord) []supportingOrderResultTableRow {
	rows := make([]supportingOrderResultTableRow, 0)
	for _, record := range records {
		recordTime := formatDateTimeIndonesian(resolveMedicalResumeRecordTime(record))
		status := supportingOrderWorkflowStatusLabel(record.LaboratoryWorkflowStatus)
		for _, item := range record.LaboratoryOrderItems {
			parameterResults := make([]string, 0, len(item.ParameterResults))
			for _, parameter := range item.ParameterResults {
				valueParts := []string{strings.TrimSpace(parameter.ResultValue)}
				if unit := strings.TrimSpace(firstNonEmpty(parameter.UnitSnapshot, valueOrEmptyMedicalServiceParameterUnit(parameter.MedicalServiceParameter))); unit != "" {
					valueParts = append(valueParts, unit)
				}
				valueLine := strings.TrimSpace(strings.Join(valueParts, " "))
				if valueLine == "" {
					continue
				}
				parameterResults = append(parameterResults, resolveLaboratoryParameterName(parameter)+": "+valueLine)
			}
			rows = append(rows, supportingOrderResultTableRow{Flag: strings.TrimSpace(item.Flag), Values: []string{
				recordTime,
				resolveLaboratoryItemTitle(item),
				status,
				firstNonEmpty(strings.TrimSpace(item.Instructions), "-"),
				firstNonEmpty(strings.Join(parameterResults, "; "), strings.TrimSpace(item.ResultValue), "-"),
				joinMedicalResumeParts(strings.TrimSpace(item.ResultNotes), formatMedicalResumeOptionalDate(item.ResultDate)),
			}})
		}
	}
	return rows
}

func buildMedicalResumeRadiologySummaries(records []models.MedicalRecord) []string {
	summaries := make([]string, 0)
	for _, record := range records {
		for _, item := range record.RadiologyOrderItems {
			parts := []string{resolveRadiologyItemTitle(item), "Status " + supportingOrderWorkflowStatusLabel(record.RadiologyWorkflowStatus)}
			if findings := strings.TrimSpace(item.Findings); findings != "" {
				parts = append(parts, "Temuan "+findings)
			}
			if impression := strings.TrimSpace(item.Impression); impression != "" {
				parts = append(parts, "Impresi "+impression)
			}
			if recommendation := strings.TrimSpace(item.Recommendation); recommendation != "" {
				parts = append(parts, "Rekomendasi "+recommendation)
			}
			if resultNotes := strings.TrimSpace(item.ResultNotes); resultNotes != "" {
				parts = append(parts, "Catatan hasil "+resultNotes)
			}
			if instructions := strings.TrimSpace(item.Instructions); instructions != "" {
				parts = append(parts, "Instruksi "+instructions)
			}
			if item.ResultDate != nil && !item.ResultDate.IsZero() {
				parts = append(parts, "Tanggal hasil "+formatDateTimeIndonesian(*item.ResultDate))
			}
			summaries = append(summaries, buildMedicalResumeSummaryWithRecord(record, parts...))
		}
	}
	return summaries
}

func buildMedicalResumeRadiologyRows(records []models.MedicalRecord) []supportingOrderResultTableRow {
	rows := make([]supportingOrderResultTableRow, 0)
	for _, record := range records {
		recordTime := formatDateTimeIndonesian(resolveMedicalResumeRecordTime(record))
		status := supportingOrderWorkflowStatusLabel(record.RadiologyWorkflowStatus)
		for _, item := range record.RadiologyOrderItems {
			rows = append(rows, supportingOrderResultTableRow{Values: []string{
				recordTime,
				resolveRadiologyItemTitle(item),
				status,
				firstNonEmpty(strings.TrimSpace(item.Instructions), "-"),
				joinMedicalResumeParts(strings.TrimSpace(item.Findings), strings.TrimSpace(item.Impression), strings.TrimSpace(item.Recommendation)),
				joinMedicalResumeParts(strings.TrimSpace(item.ResultNotes), formatMedicalResumeOptionalDate(item.ResultDate)),
			}})
		}
	}
	return rows
}

func buildMedicalResumeProcedureSummaries(records []models.MedicalRecord) []string {
	summaries := make([]string, 0)
	for _, record := range records {
		for _, action := range record.Actions {
			parts := []string{firstNonEmpty(strings.TrimSpace(action.ServiceNameSnapshot), strings.TrimSpace(action.MedicalService.Name), fmt.Sprintf("Tindakan #%d", action.ID))}
			if doctorName := strings.TrimSpace(action.Doctor.FullName); doctorName != "" {
				parts = append(parts, "Operator dr. "+doctorName)
			}
			if action.Quantity > 0 {
				parts = append(parts, fmt.Sprintf("Qty %d", action.Quantity))
			}
			if targetSummary := buildMedicalResumeActionTargetSummary(action.Targets); targetSummary != "" {
				parts = append(parts, "Target "+targetSummary)
			}
			if parameterSummary := buildMedicalResumeActionParameterSummary(action.ParameterValues); parameterSummary != "" {
				parts = append(parts, "Parameter "+parameterSummary)
			}
			if notes := strings.TrimSpace(action.Notes); notes != "" {
				parts = append(parts, "Catatan "+notes)
			}
			summaries = append(summaries, buildMedicalResumeSummaryWithRecord(record, parts...))
		}

		if notes := strings.TrimSpace(record.Notes); notes != "" && normalizeMedicalRecordSection(record.SectionType) == "procedure" {
			summaries = append(summaries, buildMedicalResumeSummaryWithRecord(record, "Catatan tindakan", notes))
		}
	}
	return summaries
}

func buildMedicalResumeProcedureRows(records []models.MedicalRecord) []supportingOrderResultTableRow {
	rows := make([]supportingOrderResultTableRow, 0)
	for _, record := range records {
		recordTime := formatDateTimeIndonesian(resolveMedicalResumeRecordTime(record))
		for _, action := range record.Actions {
			rows = append(rows, supportingOrderResultTableRow{Values: []string{
				recordTime,
				joinMedicalResumeParts(
					firstNonEmpty(strings.TrimSpace(action.ServiceNameSnapshot), strings.TrimSpace(action.MedicalService.Name), fmt.Sprintf("Tindakan #%d", action.ID)),
					formatMedicalResumeActionOperatorAndQuantity(action),
				),
				firstNonEmpty(buildMedicalResumeActionTargetSummary(action.Targets), "-"),
				firstNonEmpty(buildMedicalResumeActionParameterSummary(action.ParameterValues), "-"),
				joinMedicalResumeParts(strings.TrimSpace(action.Notes), formatMedicalResumeProcedureRecordNotes(record)),
			}})
		}

		if len(record.Actions) == 0 {
			if procedureNotes := formatMedicalResumeProcedureRecordNotes(record); procedureNotes != "" {
				rows = append(rows, supportingOrderResultTableRow{Values: []string{
					recordTime,
					"Catatan tindakan",
					"-",
					"-",
					procedureNotes,
				}})
			}
		}
	}
	return rows
}

func buildMedicalResumeConsentSummaries(records []models.MedicalRecord, patient models.Patient) []string {
	summaries := make([]string, 0)
	for _, record := range records {
		for _, consent := range record.InformedConsents {
			parts := []string{firstNonEmpty(strings.TrimSpace(consent.ActionName), fmt.Sprintf("Consent #%d", consent.ID))}
			parts = append(parts, "Keputusan "+medicalResumeConsentDecisionLabel(consent.PatientDecision))
			consentGiver := firstNonEmpty(strings.TrimSpace(consent.ConsentGiverName), strings.TrimSpace(patient.FullName))
			if consentGiver != "" && consentGiver != "-" {
				parts = append(parts, "Pemberi persetujuan "+consentGiver)
			}
			if !consent.ConsentDate.IsZero() {
				parts = append(parts, "Tanggal consent "+formatDateTimeIndonesian(consent.ConsentDate))
			}
			if notes := strings.TrimSpace(consent.Notes); notes != "" {
				parts = append(parts, "Catatan "+notes)
			}
			summaries = append(summaries, buildMedicalResumeSummaryWithRecord(record, parts...))
		}
	}
	return summaries
}

func buildMedicalResumeOdontogramSummaries(entries []models.OdontogramEntry) []string {
	summaries := make([]string, 0, len(entries))
	for _, entry := range entries {
		markedTeeth := 0
		surfaceFindings := 0
		for _, tooth := range entry.Teeth {
			hasFinding := normalizeOdontogramCondition(tooth.ToothCondition) != odontogramConditionSound || strings.TrimSpace(tooth.Notes) != ""
			for _, surface := range tooth.SurfaceFindings {
				if normalizeOdontogramCondition(surface.ConditionCode) != odontogramConditionSound || strings.TrimSpace(surface.Notes) != "" {
					surfaceFindings++
					hasFinding = true
				}
			}
			if hasFinding {
				markedTeeth++
			}
		}

		parts := []string{
			"Chart " + medicalResumeOdontogramChartLabel(entry.ChartType),
			"Status " + odontogramStatusLabel(entry.Status),
			fmt.Sprintf("%d gigi bertanda", markedTeeth),
			fmt.Sprintf("%d temuan permukaan", surfaceFindings),
		}
		if notes := strings.TrimSpace(entry.Notes); notes != "" {
			parts = append(parts, "Catatan "+notes)
		}
		summaries = append(summaries, buildMedicalResumeOdontogramSummary(entry, parts...))
	}
	return summaries
}

func buildMedicalResumeOdontogramRows(entries []models.OdontogramEntry) []supportingOrderResultTableRow {
	rows := make([]supportingOrderResultTableRow, 0)
	for _, entry := range entries {
		entryTime := entry.CreatedAt
		if entryTime.IsZero() {
			entryTime = entry.UpdatedAt
		}
		formattedTime := formatDateTimeIndonesian(entryTime)
		chartLabel := medicalResumeOdontogramChartLabel(entry.ChartType)
		for _, tooth := range entry.Teeth {
			surfaceText := buildOdontogramSurfaceText(tooth.SurfaceFindings)
			conditionLabel := odontogramToothConditionLabel(tooth.ToothCondition)
			if normalizeOdontogramCondition(tooth.ToothCondition) == odontogramConditionSound && strings.TrimSpace(surfaceText) == "" && strings.TrimSpace(tooth.Notes) == "" {
				continue
			}

			rows = append(rows, supportingOrderResultTableRow{Values: []string{
				formattedTime,
				chartLabel,
				firstNonEmpty(strings.TrimSpace(tooth.ToothNumber), "-"),
				firstNonEmpty(strings.TrimSpace(conditionLabel), "-"),
				joinMedicalResumeParts(surfaceText, strings.TrimSpace(tooth.Notes)),
			}})
		}
	}
	return rows
}

func addMedicalResumeNarrativeSection(pdf *gofpdf.Fpdf, title string, items []string, emptyMessage string) {
	addInitialAssessmentSectionTitle(pdf, title)
	if len(items) == 0 {
		addInitialAssessmentFullWidthRow(pdf, firstNonEmpty(emptyMessage, "Tidak ada data."), false)
		addInitialAssessmentSectionSpacing(pdf)
		return
	}

	for index, item := range items {
		addInitialAssessmentFullWidthRow(pdf, fmt.Sprintf("%d. %s", index+1, firstNonEmpty(item, "-")), false)
	}
	addInitialAssessmentSectionSpacing(pdf)
}

func buildMedicalResumePharmacyColumns() []supportingOrderResultTableColumn {
	return []supportingOrderResultTableColumn{
		{Title: "Waktu", WidthRatio: 0.14, Align: "L"},
		{Title: "Jenis", WidthRatio: 0.07, Align: "C"},
		{Title: "Item", WidthRatio: 0.23, Align: "L"},
		{Title: "Qty", WidthRatio: 0.11, Align: "L"},
		{Title: "Aturan", WidthRatio: 0.18, Align: "L"},
		{Title: "Keterangan", WidthRatio: 0.27, Align: "L"},
	}
}

func buildMedicalResumeLaboratoryColumns() []supportingOrderResultTableColumn {
	return []supportingOrderResultTableColumn{
		{Title: "Waktu", WidthRatio: 0.14, Align: "L"},
		{Title: "Pemeriksaan", WidthRatio: 0.20, Align: "L"},
		{Title: "Status", WidthRatio: 0.10, Align: "C"},
		{Title: "Instruksi", WidthRatio: 0.16, Align: "L"},
		{Title: "Hasil", WidthRatio: 0.22, Align: "L"},
		{Title: "Catatan", WidthRatio: 0.18, Align: "L"},
	}
}

func buildMedicalResumeRadiologyColumns() []supportingOrderResultTableColumn {
	return []supportingOrderResultTableColumn{
		{Title: "Waktu", WidthRatio: 0.14, Align: "L"},
		{Title: "Pemeriksaan", WidthRatio: 0.18, Align: "L"},
		{Title: "Status", WidthRatio: 0.10, Align: "C"},
		{Title: "Instruksi", WidthRatio: 0.14, Align: "L"},
		{Title: "Hasil Ringkas", WidthRatio: 0.28, Align: "L"},
		{Title: "Catatan", WidthRatio: 0.16, Align: "L"},
	}
}

func buildMedicalResumeProcedureColumns() []supportingOrderResultTableColumn {
	return []supportingOrderResultTableColumn{
		{Title: "Waktu", WidthRatio: 0.14, Align: "L"},
		{Title: "Tindakan", WidthRatio: 0.20, Align: "L"},
		{Title: "Target", WidthRatio: 0.16, Align: "L"},
		{Title: "Parameter", WidthRatio: 0.28, Align: "L"},
		{Title: "Catatan", WidthRatio: 0.22, Align: "L"},
	}
}

func buildMedicalResumeOdontogramColumns() []supportingOrderResultTableColumn {
	return []supportingOrderResultTableColumn{
		{Title: "Waktu", WidthRatio: 0.15, Align: "L"},
		{Title: "Chart", WidthRatio: 0.11, Align: "L"},
		{Title: "Gigi", WidthRatio: 0.08, Align: "C"},
		{Title: "Kondisi", WidthRatio: 0.16, Align: "L"},
		{Title: "Temuan / Catatan", WidthRatio: 0.50, Align: "L"},
	}
}

func filterMedicalResumeFields(fields []initialAssessmentPrintField) []initialAssessmentPrintField {
	filtered := make([]initialAssessmentPrintField, 0, len(fields))
	for _, field := range fields {
		label := strings.TrimSpace(sanitizePDFText(field.Label))
		value := strings.TrimSpace(sanitizePDFText(field.Value))
		if label == "" || label == "-" || value == "" || value == "-" {
			continue
		}
		filtered = append(filtered, initialAssessmentPrintField{
			Label: label,
			Value: value,
		})
	}
	return filtered
}

func countMedicalResumeActions(records []models.MedicalRecord) int {
	total := 0
	for _, record := range records {
		total += len(record.Actions)
	}
	return total
}

func buildMedicalResumeSummaryWithRecord(record models.MedicalRecord, parts ...string) string {
	filtered := filterMedicalResumeParts(parts)
	if len(filtered) == 0 {
		return "-"
	}
	return fmt.Sprintf("[%s] %s", formatDateTimeIndonesian(resolveMedicalResumeRecordTime(record)), strings.Join(filtered, ". "))
}

func buildMedicalResumeOdontogramSummary(entry models.OdontogramEntry, parts ...string) string {
	filtered := filterMedicalResumeParts(parts)
	if len(filtered) == 0 {
		return "-"
	}
	entryTime := entry.CreatedAt
	if entryTime.IsZero() {
		entryTime = entry.UpdatedAt
	}
	return fmt.Sprintf("[%s] %s", formatDateTimeIndonesian(entryTime), strings.Join(filtered, ". "))
}

func filterMedicalResumeParts(parts []string) []string {
	filtered := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(sanitizePDFText(part))
		if trimmed == "" || trimmed == "-" {
			continue
		}
		filtered = append(filtered, trimmed)
	}
	return filtered
}

func joinMedicalResumeParts(parts ...string) string {
	filtered := filterMedicalResumeParts(parts)
	if len(filtered) == 0 {
		return "-"
	}
	return strings.Join(filtered, " | ")
}

func resolveMedicalResumeRecordTime(record models.MedicalRecord) time.Time {
	if !record.RecordDate.IsZero() {
		return record.RecordDate
	}
	if !record.UpdatedAt.IsZero() {
		return record.UpdatedAt
	}
	return record.CreatedAt
}

func resolveMedicalResumeDisposition(record *models.MedicalRecord) string {
	if record == nil {
		return ""
	}
	return record.Disposition
}

func buildMedicalResumePrescriptionQuantityLine(quantity int, unitName string) string {
	if quantity <= 0 {
		return strings.TrimSpace(unitName)
	}
	if trimmedUnit := strings.TrimSpace(unitName); trimmedUnit != "" {
		return fmt.Sprintf("%d %s", quantity, trimmedUnit)
	}
	return fmt.Sprintf("%d", quantity)
}

func buildMedicalResumeRegimenLine(dosage string, frequency string, duration string, route string) string {
	parts := make([]string, 0, 4)
	if trimmed := strings.TrimSpace(dosage); trimmed != "" {
		parts = append(parts, "dosis "+trimmed)
	}
	if trimmed := strings.TrimSpace(frequency); trimmed != "" {
		parts = append(parts, "frekuensi "+trimmed)
	}
	if trimmed := strings.TrimSpace(duration); trimmed != "" {
		parts = append(parts, "durasi "+trimmed)
	}
	if trimmed := strings.TrimSpace(route); trimmed != "" {
		parts = append(parts, "rute "+trimmed)
	}
	return strings.Join(parts, ", ")
}

func buildMedicalResumeCompoundOutputLine(compound models.PrescriptionCompound) string {
	parts := make([]string, 0, 3)
	if compound.OutputQuantity > 0 {
		if outputUnit := strings.TrimSpace(compound.OutputUnit); outputUnit != "" {
			parts = append(parts, fmt.Sprintf("Hasil %d %s", compound.OutputQuantity, outputUnit))
		} else {
			parts = append(parts, fmt.Sprintf("Hasil %d", compound.OutputQuantity))
		}
	}
	if preparationType := strings.TrimSpace(compound.PreparationType); preparationType != "" {
		parts = append(parts, "Bentuk "+preparationType)
	}
	return strings.Join(parts, ", ")
}

func buildMedicalResumeActionTargetSummary(targets []models.MedicalActionTarget) string {
	parts := make([]string, 0, len(targets))
	for _, target := range targets {
		targetParts := make([]string, 0, 4)
		if toothNumber := strings.TrimSpace(target.ToothNumber); toothNumber != "" {
			targetParts = append(targetParts, "gigi "+toothNumber)
		}
		if len(target.SurfaceCodes) > 0 {
			targetParts = append(targetParts, "permukaan "+strings.Join(target.SurfaceCodes, ","))
		}
		if toothNumber := strings.TrimSpace(target.ToothNumber); toothNumber == "" {
			if quadrant := strings.TrimSpace(target.Quadrant); quadrant != "" {
				targetParts = append(targetParts, "kuadran "+quadrant)
			}
			if arch := strings.TrimSpace(target.Arch); arch != "" {
				targetParts = append(targetParts, arch)
			}
		}
		if len(targetParts) == 0 {
			targetParts = append(targetParts, firstNonEmpty(strings.TrimSpace(target.TargetType), "target tindakan"))
		}
		label := strings.Join(targetParts, " ")
		if notes := strings.TrimSpace(target.Notes); notes != "" {
			label += " (" + notes + ")"
		}
		parts = append(parts, label)
	}
	return strings.Join(parts, "; ")
}

func buildMedicalResumeActionParameterSummary(parameters []models.MedicalActionParameterValue) string {
	parts := make([]string, 0, len(parameters))
	for _, parameter := range parameters {
		label := firstNonEmpty(strings.TrimSpace(parameter.ParameterNameSnapshot), valueOrEmptyMedicalServiceParameterName(parameter.MedicalServiceParameter), fmt.Sprintf("Parameter #%d", parameter.ID))
		valueParts := []string{strings.TrimSpace(parameter.ResultValue)}
		if unit := strings.TrimSpace(firstNonEmpty(parameter.UnitSnapshot, valueOrEmptyMedicalServiceParameterUnit(parameter.MedicalServiceParameter))); unit != "" {
			valueParts = append(valueParts, unit)
		}
		valueLine := strings.TrimSpace(strings.Join(valueParts, " "))
		if valueLine == "" {
			continue
		}
		if notes := strings.TrimSpace(parameter.ResultNotes); notes != "" {
			parts = append(parts, label+": "+valueLine+" ("+notes+")")
			continue
		}
		parts = append(parts, label+": "+valueLine)
	}
	return strings.Join(parts, "; ")
}

func formatMedicalResumeOptionalDate(value *time.Time) string {
	if value == nil || value.IsZero() {
		return ""
	}
	return "Tanggal " + formatDateTimeIndonesian(*value)
}

func formatMedicalResumeActionOperatorAndQuantity(action models.MedicalAction) string {
	parts := make([]string, 0, 2)
	if doctorName := strings.TrimSpace(action.Doctor.FullName); doctorName != "" {
		parts = append(parts, "dr. "+doctorName)
	}
	if action.Quantity > 0 {
		parts = append(parts, fmt.Sprintf("Qty %d", action.Quantity))
	}
	return strings.Join(parts, " | ")
}

func formatMedicalResumeProcedureRecordNotes(record models.MedicalRecord) string {
	if normalizeMedicalRecordSection(record.SectionType) != "procedure" {
		return ""
	}
	return strings.TrimSpace(record.Notes)
}

func valueOrEmptyMedicalServiceParameterName(parameter *models.MedicalServiceParameter) string {
	if parameter == nil {
		return ""
	}
	return strings.TrimSpace(parameter.Name)
}

func valueOrEmptyMedicalServiceParameterUnit(parameter *models.MedicalServiceParameter) string {
	if parameter == nil {
		return ""
	}
	return strings.TrimSpace(parameter.Unit)
}

func medicalResumeVisitStatusLabel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "registered":
		return "Terdaftar"
	case "in_progress":
		return "Sedang Berjalan"
	case "completed":
		return "Final"
	case "cancelled":
		return "Dibatalkan"
	default:
		return fallbackText(value)
	}
}

func medicalResumeDispositionLabel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "kontrol":
		return "Kontrol ulang"
	case "rujuk":
		return "Rujuk"
	case "observasi":
		return "Observasi"
	case "rawat_inap":
		return "Rawat Inap"
	case "rawat_jalan":
		return "Pulang / Rawat Jalan"
	default:
		return fallbackText(value)
	}
}

func medicalResumeConsentDecisionLabel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "approved":
		return "Disetujui"
	case "declined":
		return "Ditolak"
	case "pending":
		return "Pending"
	default:
		return fallbackText(value)
	}
}

func medicalResumeOdontogramChartLabel(value string) string {
	switch normalizeOdontogramChartType(value) {
	case odontogramChartPrimary:
		return "Gigi sulung"
	default:
		return "Gigi permanen"
	}
}
