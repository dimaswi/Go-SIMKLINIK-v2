package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
)

func PrintRegistrationQueueTicket(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID antrian pendaftaran tidak valid"})
		return
	}

	var queue models.RegistrationQueue
	if err := registrationQueueQuery().First(&queue, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Antrian pendaftaran tidak ditemukan"})
		return
	}

	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderRegistrationQueueTicketPDF(hospitalInfo, queue, resolvePrintedByLabel(c), time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF tiket antrian pendaftaran"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func renderRegistrationQueueTicketPDF(hospitalInfo initialAssessmentHospitalInfo, queue models.RegistrationQueue, printedBy string, generatedAt time.Time) ([]byte, string, error) {
	// Pass 1: Ukur tinggi aktual konten pada kertas thermal 80mm
	measurePdf := gofpdf.NewCustom(&gofpdf.InitType{
		OrientationStr: "P",
		UnitStr:        "mm",
		Size:           gofpdf.SizeType{Wd: 80, Ht: 250},
	})
	measurePdf.SetMargins(3.5, 3.5, 3.5)
	measurePdf.SetAutoPageBreak(false, 0)
	measurePdf.AddPage()

	buildRegistrationQueueTicketContent(measurePdf, hospitalInfo, queue, printedBy, generatedAt)
	contentHeight := measurePdf.GetY() + 3.5 // margin bawah 3.5mm
	if contentHeight < 60.0 {
		contentHeight = 60.0
	}

	// Pass 2: Buat PDF definitif dengan tinggi presisi (pas untuk auto-cut printer thermal 80mm)
	pdf := gofpdf.NewCustom(&gofpdf.InitType{
		OrientationStr: "P",
		UnitStr:        "mm",
		Size:           gofpdf.SizeType{Wd: 80, Ht: contentHeight},
	})
	pdf.SetMargins(3.5, 3.5, 3.5)
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetTitle("Tiket Antrian Pendaftaran", false)
	pdf.SetAuthor(fallbackText(printedBy), false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.AddPage()

	buildRegistrationQueueTicketContent(pdf, hospitalInfo, queue, printedBy, generatedAt)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	ticketNumber := fmt.Sprintf("%03d", queue.TicketNumber)
	fileName := fmt.Sprintf("tiket-antrian-pendaftaran-%s-%s.pdf", ticketNumber, sanitizePDFFileName(queue.QueueDate.Format("2006-01-02")))
	return output.Bytes(), fileName, nil
}

func buildRegistrationQueueTicketContent(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, queue models.RegistrationQueue, printedBy string, generatedAt time.Time) {
	ticketNumber := fmt.Sprintf("%03d", queue.TicketNumber)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	hospitalName := strings.TrimSpace(hospitalInfo.Name)
	addressLine := strings.Trim(strings.Join([]string{strings.TrimSpace(hospitalInfo.Address), strings.TrimSpace(hospitalInfo.City)}, ", "), ", ")
	contactLine := strings.Trim(strings.Join([]string{strings.TrimSpace(hospitalInfo.Phone), strings.TrimSpace(hospitalInfo.Email)}, " | "), " |")
	hasLogo := hospitalInfo.LogoPath != "" && hospitalInfo.LogoType != ""
	textStartX := left
	textWidth := contentWidth
	textAlign := "C"
	logoWidth := 0.0
	logoHeight := 0.0
	logoGap := 2.5
	headerTop := pdf.GetY()

	if hasLogo {
		logoWidth, logoHeight = measureInitialAssessmentHeaderLogo(hospitalInfo.LogoPath, 11, 13)
		textStartX = left + logoWidth + logoGap
		textWidth = contentWidth - logoWidth - logoGap
		textAlign = "L"
		if textWidth < 40 {
			textStartX = left
			textWidth = contentWidth
			textAlign = "C"
			logoWidth = 0
			logoHeight = 0
			hasLogo = false
		}
	}

	if hasLogo {
		drawInitialAssessmentHeaderLogo(pdf, hospitalInfo.LogoPath, hospitalInfo.LogoType, left, headerTop+0.5, 11, 13)
	}

	pdf.SetXY(textStartX, headerTop)
	pdf.SetFont("Arial", "B", 9.5)
	pdf.MultiCell(textWidth, 3.8, fallbackText(hospitalName), "", textAlign, false)
	pdf.SetFont("Arial", "", 7.0)
	if addressLine != "" {
		pdf.SetX(textStartX)
		pdf.MultiCell(textWidth, 3.0, addressLine, "", textAlign, false)
	}
	if contactLine != "" {
		pdf.SetX(textStartX)
		pdf.MultiCell(textWidth, 3.0, contactLine, "", textAlign, false)
	}

	headerBottom := pdf.GetY()
	if hasLogo && logoHeight > 0 {
		logoBottom := headerTop + logoHeight + 0.5
		if logoBottom > headerBottom {
			headerBottom = logoBottom
		}
	}
	pdf.SetY(headerBottom + 1.5)

	// Garis pembatas kop
	pdf.SetDrawColor(160, 160, 160)
	pdf.SetLineWidth(0.3)
	pdf.Line(left, pdf.GetY(), pageWidth-right, pdf.GetY())
	pdf.SetY(pdf.GetY() + 2.0)

	// Judul Tiket
	pdf.SetFont("Arial", "B", 8.5)
	pdf.CellFormat(contentWidth, 4.0, "TIKET ANTRIAN PENDAFTARAN", "", 1, "C", false, 0, "")
	pdf.SetY(pdf.GetY() + 1.5)

	// Kotak Nomor Antrian (Kompak, rapi, tanpa label status)
	bannerTop := pdf.GetY()
	bannerHeight := 18.0
	pdf.SetDrawColor(50, 50, 50)
	pdf.SetFillColor(250, 250, 250)
	pdf.SetLineWidth(0.4)
	pdf.Rect(left, bannerTop, contentWidth, bannerHeight, "DF")

	pdf.SetXY(left, bannerTop+2.0)
	pdf.SetFont("Arial", "B", 8.0)
	// pdf.CellFormat(contentWidth, 3.5, "NOMOR ANTRIAN", "", 1, "C", false, 0, "")

	pdf.SetXY(left, bannerTop+4)
	pdf.SetFont("Arial", "B", 26.0)
	pdf.CellFormat(contentWidth, 10.5, ticketNumber, "", 1, "C", false, 0, "")

	// Pastikan Y berada tepat di bawah kotak dengan jarak rapi (tidak menabrak)
	pdf.SetY(bannerTop + bannerHeight + 3.0)

	// Detail Informasi Antrian (Rata kiri-kanan presisi dengan kolon sejajar)
	addThermalTicketField(pdf, "Jam Ambil", formatClockFromTime(queue.CreatedAt), left, contentWidth)
	if strings.TrimSpace(queue.PatientName) != "" {
		addThermalTicketField(pdf, "Nama", queue.PatientName, left, contentWidth)
	}
	if strings.TrimSpace(queue.NIK) != "" {
		addThermalTicketField(pdf, "NIK", queue.NIK, left, contentWidth)
	}
	if queue.Polyclinic != nil && strings.TrimSpace(queue.Polyclinic.Name) != "" {
		addThermalTicketField(pdf, "Poli Tujuan", queue.Polyclinic.Name, left, contentWidth)
	}
	if queue.Doctor != nil && strings.TrimSpace(queue.Doctor.FullName) != "" {
		addThermalTicketField(pdf, "Dokter", queue.Doctor.FullName, left, contentWidth)
	}
	addThermalTicketField(pdf, "Petugas Cetak", fallbackText(printedBy), left, contentWidth)

	// Garis penutup sebelum footer tanggal
	pdf.SetY(pdf.GetY() + 1.5)
	pdf.SetDrawColor(160, 160, 160)
	pdf.SetLineWidth(0.3)
	pdf.Line(left, pdf.GetY(), pageWidth-right, pdf.GetY())
	pdf.SetY(pdf.GetY() + 2.0)

	// Footer Tanggal & Catatan
	pdf.SetFont("Arial", "", 7.2)
	pdf.MultiCell(contentWidth, 3.2, formatDayDateIndonesian(generatedAt), "", "C", false)
	pdf.SetFont("Arial", "I", 6.8)
	pdf.MultiCell(contentWidth, 3.0, "Silakan menunggu nomor antrian Anda dipanggil.", "", "C", false)
}

func addThermalTicketField(pdf *gofpdf.Fpdf, label string, value string, left float64, contentWidth float64) {
	labelWidth := 23.0
	colonWidth := 3.0
	valueWidth := contentWidth - labelWidth - colonWidth
	fontSize := 7.8
	lineHeight := 3.6

	pdf.SetFont("Arial", "B", fontSize)
	y := pdf.GetY()

	pdf.SetXY(left, y)
	pdf.CellFormat(labelWidth, lineHeight, label, "", 0, "L", false, 0, "")

	pdf.SetXY(left+labelWidth, y)
	pdf.CellFormat(colonWidth, lineHeight, ":", "", 0, "C", false, 0, "")

	pdf.SetXY(left+labelWidth+colonWidth, y)
	pdf.SetFont("Arial", "", fontSize)
	pdf.MultiCell(valueWidth, lineHeight, fallbackText(value), "", "L", false)

	newY := pdf.GetY()
	if newY < y+lineHeight {
		pdf.SetY(y + lineHeight + 0.4)
	} else {
		pdf.SetY(newY + 0.4)
	}
}

func formatOptionalTime(value *time.Time) string {
	if value == nil || value.IsZero() {
		return "-"
	}

	return value.Format("02-01-2006 15:04")
}

func formatPointerTime(value time.Time) string {
	if value.IsZero() {
		return "-"
	}

	return value.Format("02-01-2006 15:04")
}

func formatOptionalClock(value *time.Time) string {
	if value == nil || value.IsZero() {
		return "-"
	}

	return value.Format("15:04")
}

func formatClockFromTime(value time.Time) string {
	if value.IsZero() {
		return "-"
	}

	return value.Format("15:04")
}

func formatDayDateIndonesian(value time.Time) string {
	weekdays := []string{"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"}
	return fmt.Sprintf("%s, %s", weekdays[int(value.Weekday())], formatDateIndonesian(value))
}
