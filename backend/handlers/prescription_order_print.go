package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
)

type prescriptionPrintItemView struct {
	Name         string
	Quantity     int
	QuantityLine string
	RuleLine     string
	Dosage       string
	Frequency    string
	Duration     string
	Route        string
	Instructions string
	Notes        string
}

type prescriptionPrintCompoundIngredientView struct {
	Name     string
	Quantity string
	Label    string
	Notes    string
}

type prescriptionPrintCompoundView struct {
	Name            string
	PreparationType string
	OutputQuantity  int
	OutputLine      string
	RuleLine        string
	Dosage          string
	Frequency       string
	Duration        string
	Route           string
	Instructions    string
	Notes           string
	Ingredients     []prescriptionPrintCompoundIngredientView
}

type prescriptionPrintMedicationTableRow struct {
	Values []string
}

type prescriptionReviewInitialData struct {
	IdentitasPasien        bool `json:"identitas_pasien"`
	NamaParafDokter        bool `json:"nama_paraf_dokter"`
	TanggalResep           bool `json:"tanggal_resep"`
	NamaBentukKekuatanObat bool `json:"nama_bentuk_kekuatan_obat"`
	DosisJumlahObat        bool `json:"dosis_jumlah_obat"`
	CaraPemakaian          bool `json:"cara_pemakaian"`
	InteraksiObat          bool `json:"interaksi_obat"`
	Duplikasi              bool `json:"duplikasi"`
	KontraIndikasi         bool `json:"kontra_indikasi"`
	AlergiEfekSamping      bool `json:"alergi_efek_samping"`
}

type prescriptionReviewFinalData struct {
	BenarPasien    bool `json:"benar_pasien"`
	BenarObat      bool `json:"benar_obat"`
	BenarDosis     bool `json:"benar_dosis"`
	BenarWaktu     bool `json:"benar_waktu"`
	BenarRute      bool `json:"benar_rute"`
	PioNamaObat    bool `json:"pio_nama_obat"`
	PioCaraPakai   bool `json:"pio_cara_pakai"`
	PioKegunaan    bool `json:"pio_kegunaan"`
	PioPenyimpanan bool `json:"pio_penyimpanan"`
	PioLainLain    bool `json:"pio_lain_lain"`
}

type prescriptionPrintViewData struct {
	GeneratedAt         time.Time
	Record              models.MedicalRecord
	DoctorName          string
	DoctorSIP           string
	PatientName         string
	PatientGenderAge    string
	PatientBirthDateStr string
	PatientRM           string
	PatientAddress      string
	PrescriptionNo      string
	PrescriptionDateStr string
	PolyclinicName      string
	PaymentType         string
	WeightHeightStr     string
	AllergyNotes        string
	ModeLabel           string
	BatchNotes          string
	HeaderTitle         string
	DocumentTitle       string
	Items               []prescriptionPrintItemView
	Compounds           []prescriptionPrintCompoundView
	PrintedBy           string
	ValidationBaseURL   string
	ReviewInitial       prescriptionReviewInitialData
	ReviewFinal         prescriptionReviewFinalData
	City                string
	PrintDateStr        string
	TimeOrderedStr      string
	TimeDispensedStr    string
}

func PrintPrescriptionOrder(c *gin.Context) {
	recordID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID rekam medis tidak valid"})
		return
	}

	var record models.MedicalRecord
	if err := preloadMedicalRecordRelations(database.DB).
		Preload("Visit").
		Preload("Visit.Patient").
		Preload("Visit.Doctor").
		Preload("Visit.Polyclinic").
		First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri resep tidak ditemukan"})
		return
	}

	if normalizeMedicalRecordSection(record.SectionType) != "prescription" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cetak resep hanya tersedia pada entri resep"})
		return
	}

	source := strings.ToLower(strings.TrimSpace(c.DefaultQuery("source", c.DefaultQuery("type", "pharmacy"))))
	viewData := buildPrescriptionPrintViewData(c, record, source)

	if len(viewData.Items) == 0 && len(viewData.Compounds) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Entri resep belum memiliki item obat"})
		return
	}

	hospitalInfo := resolvePrescriptionHospitalInfo(getInitialAssessmentHospitalInfo())
	pdfBytes, defaultFileName, err := renderPrescriptionOrderPDF(hospitalInfo, viewData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF resep"})
		return
	}

	fileName := defaultFileName
	visitNumber := sanitizePDFFileName(record.Visit.VisitNumber)
	if visitNumber == "" {
		visitNumber = fmt.Sprintf("%d", record.ID)
	}
	if source == "doctor" {
		fileName = fmt.Sprintf("resep-asli-dokter-%s.pdf", visitNumber)
	} else {
		fileName = fmt.Sprintf("resep-farmasi-%s.pdf", visitNumber)
	}

	if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) == prescriptionFulfillmentModePrint && normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) == prescriptionWorkflowStatusDraft {
		now := time.Now()
		_ = database.DB.Model(&models.MedicalRecord{}).Where("id = ?", record.ID).Updates(map[string]interface{}{
			"prescription_workflow_status": prescriptionWorkflowStatusPrinted,
			"prescription_processed_at":    &now,
		}).Error
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func buildPrescriptionPrintViewData(c *gin.Context, record models.MedicalRecord, source string) prescriptionPrintViewData {
	var items []prescriptionPrintItemView
	var compounds []prescriptionPrintCompoundView

	headerTitle := "LEMBAR RESEP FARMASI"
	docTitle := "Lembar Resep Farmasi"

	if source == "doctor" {
		headerTitle = "RESEP ASLI DOKTER"
		docTitle = "Resep Asli Dokter"

		// Cek apakah ada snapshot resep dokter asli yang telah dibekukan
		if strings.TrimSpace(record.PrescriptionDoctorOrderSnapshot) != "" {
			var snapData DoctorPrescriptionSnapshotData
			if err := json.Unmarshal([]byte(record.PrescriptionDoctorOrderSnapshot), &snapData); err == nil && (len(snapData.Items) > 0 || len(snapData.Compounds) > 0) {
				items = make([]prescriptionPrintItemView, 0, len(snapData.Items))
				for _, item := range snapData.Items {
					quantityLine := fmt.Sprintf("%d %s", item.Quantity, fallbackText(item.UnitName))
					ruleParts := []string{strings.TrimSpace(item.Dosage), strings.TrimSpace(item.Frequency), strings.TrimSpace(item.Duration)}
					items = append(items, prescriptionPrintItemView{
						Name:         fallbackText(item.MedicineName),
						Quantity:     item.Quantity,
						QuantityLine: strings.TrimSpace(quantityLine),
						RuleLine:     strings.Join(filterEmptyStrings(ruleParts), " - "),
						Dosage:       strings.TrimSpace(item.Dosage),
						Frequency:    strings.TrimSpace(item.Frequency),
						Duration:     strings.TrimSpace(item.Duration),
						Route:        strings.TrimSpace(item.Route),
						Instructions: strings.TrimSpace(item.Instructions),
						Notes:        strings.TrimSpace(item.Notes),
					})
				}

				compounds = make([]prescriptionPrintCompoundView, 0, len(snapData.Compounds))
				for _, compound := range snapData.Compounds {
					ingredients := make([]prescriptionPrintCompoundIngredientView, 0, len(compound.Ingredients))
					for _, ing := range compound.Ingredients {
						cleanDose := extractCleanCompoundDose(ing.Notes, ing.Quantity, ing.UnitName)
						ingredientLabel := fmt.Sprintf("%d %s %s", ing.Quantity, fallbackText(ing.UnitName), fallbackText(ing.MedicineName))
						ingredients = append(ingredients, prescriptionPrintCompoundIngredientView{
							Name:     fallbackText(ing.MedicineName),
							Quantity: cleanDose,
							Label:    strings.TrimSpace(ingredientLabel),
							Notes:    strings.TrimSpace(ing.Notes),
						})
					}

					ruleParts := []string{strings.TrimSpace(compound.Dosage), strings.TrimSpace(compound.Frequency), strings.TrimSpace(compound.Duration)}
					outputLine := fmt.Sprintf("%d %s", compound.OutputQuantity, fallbackText(compound.OutputUnit))
					if strings.TrimSpace(compound.PreparationType) != "" {
						outputLine = strings.TrimSpace(outputLine + " - " + compound.PreparationType)
					}

					compounds = append(compounds, prescriptionPrintCompoundView{
						Name:            fallbackText(compound.Name),
						PreparationType: strings.TrimSpace(compound.PreparationType),
						OutputQuantity:  compound.OutputQuantity,
						OutputLine:      strings.TrimSpace(outputLine),
						RuleLine:        strings.Join(filterEmptyStrings(ruleParts), " - "),
						Dosage:          strings.TrimSpace(compound.Dosage),
						Frequency:       strings.TrimSpace(compound.Frequency),
						Duration:        strings.TrimSpace(compound.Duration),
						Route:           strings.TrimSpace(compound.Route),
						Instructions:    strings.TrimSpace(compound.Instructions),
						Notes:           strings.TrimSpace(compound.Notes),
						Ingredients:     ingredients,
					})
				}
			}
		}
	}

	// Jika bukan doctor, atau snapshot kosong/belum ada (resep masih asli belum tersentuh perubahan)
	if items == nil && compounds == nil {
		items = make([]prescriptionPrintItemView, 0, len(record.Prescriptions))
		for _, item := range record.Prescriptions {
			quantityLine := fmt.Sprintf("%d %s", item.Quantity, fallbackText(item.Medicine.Unit.Name))
			ruleParts := []string{strings.TrimSpace(item.Dosage), strings.TrimSpace(item.Frequency), strings.TrimSpace(item.Duration)}
			items = append(items, prescriptionPrintItemView{
				Name:         fallbackText(item.Medicine.Name),
				Quantity:     item.Quantity,
				QuantityLine: strings.TrimSpace(quantityLine),
				RuleLine:     strings.Join(filterEmptyStrings(ruleParts), " - "),
				Dosage:       strings.TrimSpace(item.Dosage),
				Frequency:    strings.TrimSpace(item.Frequency),
				Duration:     strings.TrimSpace(item.Duration),
				Route:        strings.TrimSpace(item.Route),
				Instructions: strings.TrimSpace(item.Instructions),
				Notes:        strings.TrimSpace(item.Notes),
			})
		}

		compounds = make([]prescriptionPrintCompoundView, 0, len(record.PrescriptionCompounds))
		for _, compound := range record.PrescriptionCompounds {
			ingredients := make([]prescriptionPrintCompoundIngredientView, 0, len(compound.Items))
			for _, ingredient := range compound.Items {
				cleanDose := extractCleanCompoundDose(ingredient.Notes, ingredient.Quantity, ingredient.Medicine.Unit.Name)
				ingredientLabel := fmt.Sprintf("%d %s %s", ingredient.Quantity, fallbackText(ingredient.Medicine.Unit.Name), fallbackText(ingredient.Medicine.Name))
				ingredients = append(ingredients, prescriptionPrintCompoundIngredientView{
					Name:     fallbackText(ingredient.Medicine.Name),
					Quantity: cleanDose,
					Label:    strings.TrimSpace(ingredientLabel),
					Notes:    strings.TrimSpace(ingredient.Notes),
				})
			}

			ruleParts := []string{strings.TrimSpace(compound.Dosage), strings.TrimSpace(compound.Frequency), strings.TrimSpace(compound.Duration)}
			outputLine := fmt.Sprintf("%d %s", compound.OutputQuantity, fallbackText(compound.OutputUnit))
			if strings.TrimSpace(compound.PreparationType) != "" {
				outputLine = strings.TrimSpace(outputLine + " - " + compound.PreparationType)
			}

			compounds = append(compounds, prescriptionPrintCompoundView{
				Name:            fallbackText(compound.Name),
				PreparationType: strings.TrimSpace(compound.PreparationType),
				OutputQuantity:  compound.OutputQuantity,
				OutputLine:      strings.TrimSpace(outputLine),
				RuleLine:        strings.Join(filterEmptyStrings(ruleParts), " - "),
				Dosage:          strings.TrimSpace(compound.Dosage),
				Frequency:       strings.TrimSpace(compound.Frequency),
				Duration:        strings.TrimSpace(compound.Duration),
				Route:           strings.TrimSpace(compound.Route),
				Instructions:    strings.TrimSpace(compound.Instructions),
				Notes:           strings.TrimSpace(compound.Notes),
				Ingredients:     ingredients,
			})
		}
	}

	modeLabel := "Resep Internal"
	if normalizePrescriptionFulfillmentMode(record.PrescriptionFulfillmentMode) == prescriptionFulfillmentModePrint {
		modeLabel = "Resep Luar / Cetak"
		if source != "doctor" {
			headerTitle = "RESEP & TERAPI"
			docTitle = "Resep & Terapi"
		}
	}

	// Pasien
	patient := record.Visit.Patient
	if patient.ID == 0 {
		patient = record.Patient
	}
	gender := "L"
	if strings.ToLower(patient.Gender) == "female" || strings.ToLower(patient.Gender) == "p" || strings.ToLower(patient.Gender) == "perempuan" {
		gender = "P"
	}
	ageLabel := calculatePatientAgeLabel(patient.BirthDate)
	patientGenderAge := fmt.Sprintf("(%s / %s)", gender, fallbackText(ageLabel))
	if strings.TrimSpace(ageLabel) == "" || ageLabel == "-" {
		patientGenderAge = fmt.Sprintf("(%s / -)", gender)
	}

	birthDateStr := "-"
	if patient.BirthDate != nil && !patient.BirthDate.IsZero() {
		birthDateStr = patient.BirthDate.Format("02-01-2006")
	}

	patientRM := fallbackText(patient.MedicalRecordNumber)
	patientAddress := formatPatientAddress(patient)

	// Dokter
	doctorName := fallbackText(record.Visit.Doctor.FullName)
	if doctorName == "-" && strings.TrimSpace(record.Doctor.FullName) != "" {
		doctorName = strings.TrimSpace(record.Doctor.FullName)
	}
	doctorSIP := strings.TrimSpace(record.Visit.Doctor.SIPNumber)
	if doctorSIP == "" && strings.TrimSpace(record.Doctor.SIPNumber) != "" {
		doctorSIP = strings.TrimSpace(record.Doctor.SIPNumber)
	}
	if doctorSIP == "" {
		doctorSIP = "____________________"
	}

	// Poli & Pembayaran
	polyclinicName := fallbackText(record.Visit.Polyclinic.Name)
	if polyclinicName == "-" && strings.TrimSpace(record.Polyclinic.Name) != "" {
		polyclinicName = strings.TrimSpace(record.Polyclinic.Name)
	}
	paymentType := fallbackText(strings.Title(strings.ToLower(record.Visit.PaymentType)))
	if paymentType == "-" {
		paymentType = "Umum"
	}

	// BB & TB
	weight := record.Weight
	height := record.Height
	if weight == 0 && height == 0 && record.VisitID > 0 {
		var phys models.MedicalRecord
		_ = database.DB.Where("visit_id = ? AND section_type = ? AND (weight > 0 OR height > 0)", record.VisitID, "physical_exam").
			Order("record_date DESC, created_at DESC").First(&phys).Error
		if phys.ID > 0 {
			weight = phys.Weight
			height = phys.Height
		}
	}
	weightHeightStr := "- / -"
	if weight > 0 || height > 0 {
		weightHeightStr = fmt.Sprintf("%.1f kg / %.1f cm", weight, height)
	}

	// Alergi
	allergyNotes := "Tidak ada"
	if strings.TrimSpace(record.AllergyNotes) != "" {
		allergyNotes = strings.TrimSpace(record.AllergyNotes)
	} else if strings.TrimSpace(patient.Allergies) != "" {
		allergyNotes = strings.TrimSpace(patient.Allergies)
	}

	// Nomor Resep
	rxNo := fallbackText(record.Visit.VisitNumber)
	if rxNo != "" && !strings.HasPrefix(strings.ToUpper(rxNo), "RX") {
		rxNo = "RX" + rxNo
	}

	// Tanggal Resep
	rxDate := record.RecordDate
	if record.PrescriptionOrderedAt != nil && !record.PrescriptionOrderedAt.IsZero() {
		rxDate = *record.PrescriptionOrderedAt
	}
	prescriptionDateStr := formatDateIndonesian(rxDate)

	// Waktu
	timeOrderedStr := rxDate.Format("15:04")
	timeDispensedStr := "-"
	if normalizePrescriptionWorkflowStatus(record.PrescriptionWorkflowStatus) == prescriptionWorkflowStatusDispensed {
		if record.PrescriptionProcessedAt != nil && !record.PrescriptionProcessedAt.IsZero() {
			timeDispensedStr = record.PrescriptionProcessedAt.Format("15:04")
		} else {
			timeDispensedStr = record.UpdatedAt.Format("15:04")
		}
	}

	// Reviews
	var revInitial prescriptionReviewInitialData
	if strings.TrimSpace(record.PrescriptionReviewInitial) != "" {
		_ = json.Unmarshal([]byte(record.PrescriptionReviewInitial), &revInitial)
	}
	var revFinal prescriptionReviewFinalData
	if strings.TrimSpace(record.PrescriptionReviewFinal) != "" {
		_ = json.Unmarshal([]byte(record.PrescriptionReviewFinal), &revFinal)
	}

	hospitalInfo := getInitialAssessmentHospitalInfo()
	city := strings.TrimSpace(hospitalInfo.City)
	if city == "" {
		city = "Bojonegoro"
	}

	printDateStr := formatDateIndonesian(time.Now())

	return prescriptionPrintViewData{
		GeneratedAt:         time.Now(),
		Record:              record,
		DoctorName:          doctorName,
		DoctorSIP:           doctorSIP,
		PatientName:         patient.FullName,
		PatientGenderAge:    patientGenderAge,
		PatientBirthDateStr: birthDateStr,
		PatientRM:           patientRM,
		PatientAddress:      patientAddress,
		PrescriptionNo:      rxNo,
		PrescriptionDateStr: prescriptionDateStr,
		PolyclinicName:      polyclinicName,
		PaymentType:         paymentType,
		WeightHeightStr:     weightHeightStr,
		AllergyNotes:        allergyNotes,
		ModeLabel:           modeLabel,
		BatchNotes:          strings.TrimSpace(record.Notes),
		HeaderTitle:         headerTitle,
		DocumentTitle:       docTitle,
		Items:               items,
		Compounds:           compounds,
		PrintedBy:           resolvePrintedByLabel(c),
		ValidationBaseURL:   resolveTTEVerificationBaseURLForRequest(c),
		ReviewInitial:       revInitial,
		ReviewFinal:         revFinal,
		City:                city,
		PrintDateStr:        printDateStr,
		TimeOrderedStr:      timeOrderedStr,
		TimeDispensedStr:    timeDispensedStr,
	}
}

func extractCleanCompoundDose(notes string, fallbackQty int, unitName string) string {
	trimmed := strings.TrimSpace(notes)
	if trimmed != "" {
		lower := strings.ToLower(trimmed)
		if idx := strings.Index(lower, "dosis:"); idx != -1 {
			sub := trimmed[idx+6:]
			for _, sep := range []string{"·", "(", "total potong", "-", ","} {
				if sIdx := strings.Index(strings.ToLower(sub), sep); sIdx != -1 {
					sub = sub[:sIdx]
				}
			}
			clean := strings.TrimSpace(sub)
			if clean != "" {
				return clean
			}
		}
		if sIdx := strings.Index(trimmed, "("); sIdx != -1 {
			clean := strings.TrimSpace(trimmed[:sIdx])
			if clean != "" {
				return clean
			}
		}
		if sIdx := strings.Index(trimmed, "·"); sIdx != -1 {
			clean := strings.TrimSpace(trimmed[:sIdx])
			if clean != "" {
				return clean
			}
		}
		if len(trimmed) <= 15 {
			return trimmed
		}
	}
	if fallbackQty > 0 {
		if strings.TrimSpace(unitName) != "" && strings.ToLower(unitName) != "item" {
			return fmt.Sprintf("%d %s", fallbackQty, unitName)
		}
		return fmt.Sprintf("%d", fallbackQty)
	}
	return ""
}

func fitTextToWidth(pdf *gofpdf.Fpdf, text string, maxWidth float64) string {
	text = strings.TrimSpace(text)
	if pdf.GetStringWidth(text) <= maxWidth {
		return text
	}
	runes := []rune(text)
	for len(runes) > 3 {
		runes = runes[:len(runes)-1]
		if pdf.GetStringWidth(string(runes)+"...") <= maxWidth {
			return string(runes) + "..."
		}
	}
	return text
}

func resolvePrescriptionHospitalInfo(info initialAssessmentHospitalInfo) initialAssessmentHospitalInfo {
	if info.LogoPath == "" || info.LogoType == "" {
		candidates := []string{
			"uploads/print_logo_1775301658869364300.png",
			"uploads/logo_1775301634692518100.png",
			"backend/uploads/print_logo_1775301658869364300.png",
			"backend/uploads/logo_1775301634692518100.png",
		}
		for _, c := range candidates {
			if path, ext, ok := resolveLocalPDFImage(c); ok {
				info.LogoPath = path
				info.LogoType = ext
				break
			}
		}
	}

	if strings.TrimSpace(info.Name) == "" {
		info.Name = "SIMKLINIK"
	}

	return info
}

func formatMFPreparationLabel(prepType string) string {
	lower := strings.ToLower(strings.TrimSpace(prepType))
	switch {
	case strings.Contains(lower, "kapsul") || strings.Contains(lower, "capsul"):
		return "Kapsul"
	case strings.Contains(lower, "pulv") || strings.Contains(lower, "puyer") || strings.Contains(lower, "serbuk"):
		return "Pulv"
	case strings.Contains(lower, "sirup") || strings.Contains(lower, "potio"):
		return "Sirup"
	case strings.Contains(lower, "salep") || strings.Contains(lower, "ung"):
		return "Ung"
	case strings.Contains(lower, "krim") || strings.Contains(lower, "cream"):
		return "Krim"
	default:
		if prepType != "" {
			return strings.Title(prepType)
		}
		return "Kapsul"
	}
}

var signaMultiplierRegex = regexp.MustCompile(`(?i)(\d+)\s*[x×✕✖⨯]\s*(\d+)`)

func formatPrescriptionSigna(signa string) string {
	trimmed := strings.TrimSpace(signa)
	if trimmed == "" {
		return ""
	}
	trimmed = initialAssessmentPDFTextReplacer.Replace(trimmed)
	trimmed = signaMultiplierRegex.ReplaceAllString(trimmed, "${1}x${2}")
	trimmed = strings.Join(strings.Fields(trimmed), " ")
	if !strings.HasPrefix(strings.ToUpper(trimmed), "S ") && !strings.HasPrefix(strings.ToUpper(trimmed), "S. ") {
		trimmed = "S " + trimmed
	}
	return trimmed
}

func drawPrescriptionA5Header(pdf *gofpdf.Fpdf, info initialAssessmentHospitalInfo) float64 {
	left, top, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	currentY := top + 0.5

	hasLogo := info.LogoPath != "" && info.LogoType != ""
	logoSlotWidth := 0.0
	logoGap := 0.0
	logoMaxHeight := 15.0
	logoMaxWidth := 18.0
	if hasLogo {
		logoSlotWidth = 20.0
		logoGap = 2.5
	}

	textStartX := left
	textWidth := contentWidth
	if hasLogo {
		symmetricReserve := logoSlotWidth + logoGap
		textStartX = left + symmetricReserve
		textWidth = contentWidth - (2 * symmetricReserve)
		if textWidth < 80 {
			textStartX = left + logoSlotWidth + logoGap
			textWidth = contentWidth - logoSlotWidth - logoGap
		}
	}

	type headerLine struct {
		text       string
		fontStyle  string
		fontSize   float64
		lineHeight float64
	}

	lines := []headerLine{{
		text:       strings.ToUpper(fallbackText(info.Name)),
		fontStyle:  "B",
		fontSize:   11.5,
		lineHeight: 4.5,
	}}

	addressParts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Address)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.City)); trimmed != "" {
		addressParts = append(addressParts, trimmed)
	}
	if len(addressParts) > 0 {
		lines = append(lines, headerLine{
			text:       strings.Join(addressParts, ", "),
			fontStyle:  "",
			fontSize:   7.2,
			lineHeight: 3.2,
		})
	}

	contactParts := make([]string, 0, 3)
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Phone)); trimmed != "" {
		contactParts = append(contactParts, "Telp: "+trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Email)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if trimmed := strings.TrimSpace(sanitizePDFText(info.Website)); trimmed != "" {
		contactParts = append(contactParts, trimmed)
	}
	if len(contactParts) > 0 {
		lines = append(lines, headerLine{
			text:       strings.Join(contactParts, " | "),
			fontStyle:  "",
			fontSize:   6.8,
			lineHeight: 3.0,
		})
	}

	textBlockHeight := 0.0
	for _, line := range lines {
		trimmedText := strings.TrimSpace(sanitizePDFText(line.text))
		if trimmedText == "" {
			continue
		}
		pdf.SetFont("Arial", line.fontStyle, line.fontSize)
		lineParts := pdf.SplitLines([]byte(trimmedText), textWidth)
		lineCount := len(lineParts)
		if lineCount < 1 {
			lineCount = 1
		}
		textBlockHeight += float64(lineCount) * line.lineHeight
	}

	logoWidth := 0.0
	logoHeight := 0.0
	if hasLogo {
		logoWidth, logoHeight = measureInitialAssessmentHeaderLogo(info.LogoPath, logoMaxHeight, logoMaxWidth)
		logoX := left + ((logoSlotWidth - logoWidth) / 2)
		logoY := currentY + ((textBlockHeight - logoHeight) / 2)
		if logoY < top {
			logoY = top
		}
		drawInitialAssessmentHeaderLogo(pdf, info.LogoPath, info.LogoType, logoX, logoY, logoMaxHeight, logoMaxWidth)
	}

	headerBlockHeight := maxFloat64(textBlockHeight, logoHeight)

	pdf.SetXY(textStartX, currentY)
	for _, line := range lines {
		trimmedText := strings.TrimSpace(sanitizePDFText(line.text))
		if trimmedText == "" {
			continue
		}
		pdf.SetX(textStartX)
		pdf.SetFont("Arial", line.fontStyle, line.fontSize)
		pdf.MultiCell(textWidth, line.lineHeight, trimmedText, "", "C", false)
	}

	lineY := currentY + headerBlockHeight + 1.0
	pdf.SetLineWidth(0.6)
	pdf.Line(left, lineY, pageWidth-right, lineY)
	pdf.SetLineWidth(0.2)
	pdf.Line(left, lineY+0.6, pageWidth-right, lineY+0.6)

	return lineY + 1.8
}

func renderPrescriptionOrderPDF(hospitalInfo initialAssessmentHospitalInfo, data prescriptionPrintViewData) ([]byte, string, error) {
	pdf := gofpdf.New("P", "mm", "A5", "")
	pdf.SetMargins(8, 5, 8)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AliasNbPages("")

	docTitle := "Resep & Terapi"
	if strings.TrimSpace(data.DocumentTitle) != "" {
		docTitle = data.DocumentTitle
	}

	pdf.SetTitle(sanitizePDFText(docTitle), false)
	pdf.SetAuthor(sanitizePDFText(data.PrintedBy), false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.AddPage()

	// 1. Gambar KOP A5
	startBoxY := drawPrescriptionA5Header(pdf, hospitalInfo)

	xLeft := 8.0
	xRight := 140.0
	contentWidth := 132.0
	splitX := 74.0 // Garis tengah pembagi (kiri 66 mm, kanan 66 mm)

	// 2. KOTAK 1: INFORMASI DOKTER & PASIEN (Header Box)
	box1H := 32.5
	pdf.SetLineWidth(0.3)
	pdf.Rect(xLeft, startBoxY, contentWidth, box1H, "D")
	pdf.Line(splitX, startBoxY, splitX, startBoxY+box1H)

	// Sisi Kiri Kotak 1
	leftX := xLeft + 2.5
	curY := startBoxY + 1.8
	lineH := 4.1
	labelW := 19.0
	valW := splitX - leftX - labelW - 3.5

	drawRow := func(label, val string) {
		pdf.SetXY(leftX, curY)
		pdf.SetFont("Arial", "", 7.2)
		pdf.CellFormat(labelW, lineH, label, "", 0, "L", false, 0, "")
		pdf.CellFormat(2.5, lineH, ":", "", 0, "L", false, 0, "")
		fittedVal := fitTextToWidth(pdf, sanitizePDFText(val), valW)
		pdf.CellFormat(valW, lineH, fittedVal, "", 0, "L", false, 0, "")
		curY += lineH
	}

	drawRow("Pengirim", data.DoctorName)
	drawRow("SIP", data.DoctorSIP)
	drawRow("PRO", data.PatientName)
	// Baris Gender/Umur di bawah PRO
	pdf.SetXY(leftX+labelW+2.5, curY)
	pdf.SetFont("Arial", "", 7.0)
	pdf.CellFormat(valW, lineH-0.6, fitTextToWidth(pdf, sanitizePDFText(data.PatientGenderAge), valW), "", 0, "L", false, 0, "")
	curY += lineH - 0.6

	drawRow("Tanggal Lahir", data.PatientBirthDateStr)
	drawRow("No. RM", data.PatientRM)
	drawRow("Alamat", data.PatientAddress)

	// Sisi Kanan Kotak 1
	rightX := splitX + 2.5
	curY = startBoxY + 1.8
	labelWRight := 20.0
	valWRight := xRight - rightX - labelWRight - 3.5

	drawRightRow := func(label, val string) {
		pdf.SetXY(rightX, curY)
		pdf.SetFont("Arial", "", 7.2)
		pdf.CellFormat(labelWRight, lineH, label, "", 0, "L", false, 0, "")
		pdf.CellFormat(2.5, lineH, ":", "", 0, "L", false, 0, "")
		fittedVal := fitTextToWidth(pdf, sanitizePDFText(val), valWRight)
		pdf.CellFormat(valWRight, lineH, fittedVal, "", 0, "L", false, 0, "")
		curY += lineH
	}

	drawRightRow("No. Resep", data.PrescriptionNo)
	drawRightRow("Tanggal Resep", data.PrescriptionDateStr)
	drawRightRow("Ruangan/Poli", data.PolyclinicName)
	drawRightRow("Pembayaran", data.PaymentType)
	drawRightRow("BB / TB", data.WeightHeightStr)
	drawRightRow("Riwayat Alergi", data.AllergyNotes)

	// 3. KOTAK 2: BADAN RESEP & CHECKLIST
	box2Y := startBoxY + box1H
	box2Bottom := 197.5
	box2H := box2Bottom - box2Y

	pdf.SetLineWidth(0.3)
	pdf.Rect(xLeft, box2Y, contentWidth, box2H, "D")
	pdf.Line(splitX, box2Y, splitX, box2Bottom)

	// --- KOLOM KIRI: DAFTAR RESEP R/ ---
	rxCurY := box2Y + 3.0
	rxLeftMargin := xLeft + 2.5
	rxRightEdge := splitX - 2.5

	// Non-Racikan
	for _, item := range data.Items {
		if rxCurY > box2Bottom-15 {
			break
		}
		pdf.SetXY(rxLeftMargin, rxCurY)
		pdf.SetFont("Arial", "BI", 9.0)
		pdf.CellFormat(5.0, 4.0, "R/", "", 0, "L", false, 0, "")

		pdf.SetFont("Arial", "B", 8.0)
		nameW := rxRightEdge - rxLeftMargin - 5.0 - 12.0
		pdf.CellFormat(nameW, 4.0, fitTextToWidth(pdf, sanitizePDFText(item.Name), nameW), "", 0, "L", false, 0, "")

		// Qty rata kanan
		qtyLabel := strings.TrimSpace(item.QuantityLine)
		if item.Quantity > 0 {
			qtyLabel = fmt.Sprintf("%d", item.Quantity)
		}
		pdf.SetFont("Arial", "B", 8.5)
		pdf.CellFormat(12.0, 4.0, sanitizePDFText(qtyLabel), "", 0, "R", false, 0, "")
		rxCurY += 4.0

		// Signa: S 3x1 ...
		signaText := strings.TrimSpace(item.Instructions)
		if signaText == "" {
			signaText = strings.TrimSpace(item.RuleLine)
		}
		signaText = formatPrescriptionSigna(signaText)
		if signaText != "" {
			pdf.SetXY(rxLeftMargin+5.0, rxCurY)
			pdf.SetFont("Arial", "", 7.5)
			pdf.CellFormat(rxRightEdge-rxLeftMargin-5.0, 3.8, fitTextToWidth(pdf, sanitizePDFText(signaText), rxRightEdge-rxLeftMargin-5.0), "", 0, "L", false, 0, "")
			rxCurY += 3.8
		}

		if strings.TrimSpace(item.Notes) != "" {
			pdf.SetXY(rxLeftMargin+5.0, rxCurY)
			pdf.SetFont("Arial", "I", 6.8)
			pdf.CellFormat(rxRightEdge-rxLeftMargin-5.0, 3.5, fitTextToWidth(pdf, sanitizePDFText("Catatan: "+item.Notes), rxRightEdge-rxLeftMargin-5.0), "", 0, "L", false, 0, "")
			rxCurY += 3.5
		}

		rxCurY += 3.5
	}

	// Racikan
	for _, comp := range data.Compounds {
		if rxCurY > box2Bottom-20 {
			break
		}
		pdf.SetXY(rxLeftMargin, rxCurY)
		pdf.SetFont("Arial", "BI", 9.0)
		pdf.CellFormat(5.0, 4.0, "R/", "", 0, "L", false, 0, "")

		pdf.SetFont("Arial", "B", 8.0)
		pdf.CellFormat(rxRightEdge-rxLeftMargin-5.0, 4.0, fitTextToWidth(pdf, sanitizePDFText(comp.Name), rxRightEdge-rxLeftMargin-5.0), "", 0, "L", false, 0, "")
		rxCurY += 4.0

		// Bahan Racikan
		doseW := 16.0
		ingNameW := rxRightEdge - rxLeftMargin - 5.0 - doseW
		for _, ing := range comp.Ingredients {
			if rxCurY > box2Bottom-15 {
				break
			}
			pdf.SetXY(rxLeftMargin+5.0, rxCurY)
			pdf.SetFont("Arial", "", 7.2)
			pdf.CellFormat(ingNameW, 3.5, fitTextToWidth(pdf, sanitizePDFText(ing.Name), ingNameW), "", 0, "L", false, 0, "")
			pdf.SetFont("Arial", "B", 7.2)
			pdf.CellFormat(doseW, 3.5, sanitizePDFText(ing.Quantity), "", 0, "R", false, 0, "")
			rxCurY += 3.5
		}

		// m.f Sediaan No. OutputQty
		prepLabel := comp.PreparationType
		if strings.TrimSpace(prepLabel) == "" {
			prepLabel = formatMFPreparationLabel(comp.RuleLine)
		} else {
			prepLabel = formatMFPreparationLabel(prepLabel)
		}
		if strings.TrimSpace(prepLabel) == "" {
			prepLabel = "Kapsul"
		}
		pdf.SetXY(rxLeftMargin+5.0, rxCurY)
		pdf.SetFont("Arial", "BI", 7.5)
		pdf.CellFormat(6.0, 3.8, "m.f ", "", 0, "L", false, 0, "")
		pdf.SetFont("Arial", "B", 7.5)
		prepText := fmt.Sprintf("%s No.", prepLabel)
		outQtyW := 12.0
		pdf.CellFormat(rxRightEdge-rxLeftMargin-5.0-6.0-outQtyW, 3.8, sanitizePDFText(prepText), "", 0, "L", false, 0, "")
		pdf.SetFont("Arial", "B", 8.0)
		outQtyStr := ""
		if comp.OutputQuantity > 0 {
			outQtyStr = fmt.Sprintf("%d", comp.OutputQuantity)
		}
		pdf.CellFormat(outQtyW, 3.8, sanitizePDFText(outQtyStr), "", 0, "R", false, 0, "")
		rxCurY += 3.8

		// Signa Racikan
		compSigna := strings.TrimSpace(comp.Instructions)
		if compSigna == "" {
			compSigna = strings.TrimSpace(comp.RuleLine)
		}
		compSigna = formatPrescriptionSigna(compSigna)
		if compSigna != "" {
			pdf.SetXY(rxLeftMargin+5.0, rxCurY)
			pdf.SetFont("Arial", "", 7.5)
			pdf.CellFormat(rxRightEdge-rxLeftMargin-5.0, 3.8, fitTextToWidth(pdf, sanitizePDFText(compSigna), rxRightEdge-rxLeftMargin-5.0), "", 0, "L", false, 0, "")
			rxCurY += 3.8
		}

		rxCurY += 3.5
	}

	// --- KOLOM KANAN: CHECKLIST FARMASI & TTD ---
	rightColW := xRight - splitX // 66.0 mm
	chkCurY := box2Y

	// Sub-seksi 1: TELAAH RESEP
	pdf.SetXY(splitX, chkCurY+1.5)
	pdf.SetFont("Arial", "BU", 7.8)
	pdf.CellFormat(rightColW, 4.0, "TELAAH RESEP", "", 0, "C", false, 0, "")
	chkCurY += 6.0

	tList := []struct {
		chk bool
		txt string
	}{
		{data.ReviewInitial.IdentitasPasien, "Lengkap Identitas Pasien"},
		{data.ReviewInitial.NamaParafDokter, "Lengkap Nama & Paraf Dokter"},
		{data.ReviewInitial.TanggalResep, "Tanggal Resep"},
		{data.ReviewInitial.NamaBentukKekuatanObat, "Ada Nama Obat, Bentuk & Kekuatan"},
		{data.ReviewInitial.DosisJumlahObat, "Ada Dosis & Jumlah Obat"},
		{data.ReviewInitial.CaraPemakaian, "Ada Cara Pemakaian"},
		{data.ReviewInitial.InteraksiObat, "Interaksi Obat"},
		{data.ReviewInitial.Duplikasi, "Duplikasi"},
		{data.ReviewInitial.KontraIndikasi, "Kontra Indikasi"},
		{data.ReviewInitial.AlergiEfekSamping, "Alergi / Reaksi Obat Yg Tdk Diinginkan"},
	}

	for _, item := range tList {
		pdf.SetXY(splitX+2.0, chkCurY)
		pdf.SetFont("Arial", "", 6.7)
		mark := "[   ]"
		if item.chk {
			mark = "[ v ]"
		}
		pdf.CellFormat(6.5, 3.2, mark, "", 0, "L", false, 0, "")
		pdf.CellFormat(rightColW-8.5, 3.2, sanitizePDFText(item.txt), "", 0, "L", false, 0, "")
		chkCurY += 3.2
	}
	chkCurY += 1.5
	pdf.SetLineWidth(0.3)
	pdf.Line(splitX, chkCurY, xRight, chkCurY)

	// Sub-seksi 2: VERIFIKASI AKHIR
	pdf.SetXY(splitX, chkCurY+1.5)
	pdf.SetFont("Arial", "BU", 7.8)
	pdf.CellFormat(rightColW, 4.0, "VERIFIKASI AKHIR", "", 0, "C", false, 0, "")
	chkCurY += 6.0

	vList := []struct {
		chk bool
		txt string
	}{
		{data.ReviewFinal.BenarPasien, "Benar Pasien"},
		{data.ReviewFinal.BenarObat, "Benar Obat"},
		{data.ReviewFinal.BenarDosis, "Benar Dosis"},
		{data.ReviewFinal.BenarWaktu, "Benar Waktu Pemberian"},
		{data.ReviewFinal.BenarRute, "Benar Rute Pemberian"},
	}

	for _, item := range vList {
		pdf.SetXY(splitX+2.0, chkCurY)
		pdf.SetFont("Arial", "", 6.7)
		mark := "[   ]"
		if item.chk {
			mark = "[ v ]"
		}
		pdf.CellFormat(6.5, 3.2, mark, "", 0, "L", false, 0, "")
		pdf.CellFormat(rightColW-8.5, 3.2, sanitizePDFText(item.txt), "", 0, "L", false, 0, "")
		chkCurY += 3.2
	}
	chkCurY += 1.5
	pdf.Line(splitX, chkCurY, xRight, chkCurY)

	// Sub-seksi 3: PIO
	pdf.SetXY(splitX, chkCurY+1.5)
	pdf.SetFont("Arial", "BU", 7.8)
	pdf.CellFormat(rightColW, 4.0, "PIO", "", 0, "C", false, 0, "")
	chkCurY += 6.0

	pList := []struct {
		chk bool
		txt string
	}{
		{data.ReviewFinal.PioNamaObat, "Nama Obat"},
		{data.ReviewFinal.PioCaraPakai, "Cara Pakai"},
		{data.ReviewFinal.PioKegunaan, "Kegunaan"},
		{data.ReviewFinal.PioPenyimpanan, "Penyimpanan"},
		{data.ReviewFinal.PioLainLain, "Lain-lain"},
	}

	for _, item := range pList {
		pdf.SetXY(splitX+2.0, chkCurY)
		pdf.SetFont("Arial", "", 6.7)
		mark := "[   ]"
		if item.chk {
			mark = "[ v ]"
		}
		pdf.CellFormat(6.5, 3.2, mark, "", 0, "L", false, 0, "")
		pdf.CellFormat(rightColW-8.5, 3.2, sanitizePDFText(item.txt), "", 0, "L", false, 0, "")
		chkCurY += 3.2
	}
	chkCurY += 1.5
	pdf.Line(splitX, chkCurY, xRight, chkCurY)

	// Sub-seksi 4: Tanda Tangan Penerima (SECARA EKSPLISIT DI KOLOM KANAN)
	signY := chkCurY + 2.5
	pdf.SetXY(splitX, signY)
	pdf.SetFont("Arial", "", 7.0)
	pdf.CellFormat(rightColW, 3.5, sanitizePDFText(fmt.Sprintf("%s, %s", data.City, data.PrintDateStr)), "", 0, "C", false, 0, "")

	signY += 3.8
	pdf.SetXY(splitX, signY)
	pdf.CellFormat(rightColW, 3.5, "Penerima", "", 0, "C", false, 0, "")

	pdf.SetXY(splitX, box2Bottom-7.5)
	pdf.CellFormat(rightColW, 4.0, "(____________________)", "", 0, "C", false, 0, "")

	// 4. FOOTER DI LUAR KOTAK (Paling Bawah)
	footerY := box2Bottom + 1.8
	pdf.SetXY(xLeft, footerY)
	pdf.SetFont("Arial", "I", 7.2)
	pdf.CellFormat(splitX-xLeft, 3.5, sanitizePDFText("Jam Resep Masuk: "+data.TimeOrderedStr), "", 0, "L", false, 0, "")
	pdf.SetXY(splitX, footerY)
	pdf.CellFormat(rightColW, 3.5, sanitizePDFText("Jam Penyerahan Obat: "+data.TimeDispensedStr), "", 0, "L", false, 0, "")

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	patientName := sanitizePDFFileName(data.PatientName)
	if patientName == "" {
		patientName = "pasien"
	}
	rxNo := sanitizePDFFileName(data.PrescriptionNo)
	if rxNo == "" {
		rxNo = fmt.Sprintf("%d", data.Record.ID)
	}
	fileName := fmt.Sprintf("resep-%s-%s.pdf", patientName, rxNo)
	return output.Bytes(), fileName, nil
}

func addPrescriptionMedicationTable(pdf *gofpdf.Fpdf, rows []prescriptionPrintMedicationTableRow) {
	columns := []supportingOrderResultTableColumn{
		{Title: "Jenis", WidthRatio: 0.09, Align: "L"},
		{Title: "Item Obat", WidthRatio: 0.20, Align: "L"},
		{Title: "Qty", WidthRatio: 0.11, Align: "L"},
		{Title: "Dosis", WidthRatio: 0.11, Align: "L"},
		{Title: "Frekuensi", WidthRatio: 0.14, Align: "L"},
		{Title: "Durasi", WidthRatio: 0.10, Align: "L"},
		{Title: "Rute", WidthRatio: 0.10, Align: "L"},
		{Title: "Keterangan", WidthRatio: 0.15, Align: "L"},
	}

	resultRows := make([]supportingOrderResultTableRow, 0, len(rows))
	for _, row := range rows {
		resultRows = append(resultRows, supportingOrderResultTableRow{Values: row.Values})
	}

	addSupportingOrderResultTable(pdf, "DAFTAR OBAT", columns, resultRows, "Tidak ada item obat.")
}

func buildPrescriptionMedicationTableRows(data prescriptionPrintViewData) []prescriptionPrintMedicationTableRow {
	rows := make([]prescriptionPrintMedicationTableRow, 0, len(data.Items)+len(data.Compounds))

	for _, item := range data.Items {
		rows = append(rows, prescriptionPrintMedicationTableRow{
			Values: []string{
				"Non-R",
				fallbackText(item.Name),
				fallbackText(item.QuantityLine),
				fallbackText(item.Dosage),
				fallbackText(item.Frequency),
				fallbackText(item.Duration),
				fallbackText(item.Route),
				buildPrescriptionMedicationDetail(item.Instructions),
			},
		})
	}

	for _, compound := range data.Compounds {
		rows = append(rows, prescriptionPrintMedicationTableRow{
			Values: []string{
				"R",
				fallbackText(compound.Name),
				fallbackText(compound.OutputLine),
				fallbackText(compound.Dosage),
				fallbackText(compound.Frequency),
				fallbackText(compound.Duration),
				fallbackText(compound.Route),
				buildPrescriptionCompoundDetail(compound),
			},
		})
	}

	return rows
}

func buildPrescriptionMedicationDetail(instructions string) string {
	parts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(instructions); trimmed != "" {
		parts = append(parts, trimmed)
	}
	return firstNonEmpty(strings.Join(parts, ""), "-")
}

func buildPrescriptionCompoundDetail(compound prescriptionPrintCompoundView) string {
	parts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(compound.Instructions); trimmed != "" {
		parts = append(parts, trimmed)
	}
	if trimmed := strings.TrimSpace(compound.Notes); trimmed != "" {
		parts = append(parts, trimmed)
	}
	return firstNonEmpty(strings.Join(parts, " | "), "-")
}

func buildPrescriptionCompoundComposition(ingredients []prescriptionPrintCompoundIngredientView) string {
	labels := make([]string, 0, len(ingredients))
	for _, ingredient := range ingredients {
		label := strings.TrimSpace(ingredient.Label)
		if label == "" {
			continue
		}
		if strings.TrimSpace(ingredient.Notes) != "" {
			label += " (" + strings.TrimSpace(ingredient.Notes) + ")"
		}
		labels = append(labels, label)
	}
	return strings.Join(labels, "; ")
}

func addPrescriptionCompoundCompositionSection(pdf *gofpdf.Fpdf, compounds []prescriptionPrintCompoundView) {
	addInitialAssessmentSectionSpacing(pdf)
	addInitialAssessmentSectionTitle(pdf, "DETAIL RACIKAN")

	for index, compound := range compounds {
		if index > 0 {
			addInitialAssessmentSectionSpacing(pdf)
		}

		addInitialAssessmentFullWidthRow(pdf, fallbackText(compound.Name), true)
		addInitialAssessmentKeyValueRow(pdf, "Hasil Jadi", fallbackText(compound.OutputLine))
		if composition := buildPrescriptionCompoundComposition(compound.Ingredients); composition != "" {
			addInitialAssessmentKeyValueRow(pdf, "Komposisi", composition)
		}
		if strings.TrimSpace(compound.Instructions) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Instruksi", compound.Instructions)
		}
		if strings.TrimSpace(compound.Notes) != "" {
			addInitialAssessmentKeyValueRow(pdf, "Catatan", compound.Notes)
		}
	}
}

func addPrescriptionSignatureSection(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, data prescriptionPrintViewData) {
	tteSignature := loadTTESignedSignatureByDocumentKeyWithBaseURL(fmt.Sprintf("prescription:%d", data.Record.ID), data.ValidationBaseURL)
	addOrderPrintSignatureSectionWithTTE(pdf, hospitalInfo, data.GeneratedAt, "Pasien / Wali", data.Record.Visit.Patient.FullName, "Dokter Pemeriksa", data.Record.Visit.Doctor.FullName, tteSignature)
}

func filterEmptyStrings(values []string) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		filtered = append(filtered, strings.TrimSpace(value))
	}
	return filtered
}
