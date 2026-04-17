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
	pdf := gofpdf.NewCustom(&gofpdf.InitType{
		OrientationStr: "P",
		UnitStr:        "mm",
		Size:           gofpdf.SizeType{Wd: 80, Ht: 90},
	})
	pdf.SetMargins(4, 4, 4)
	pdf.SetAutoPageBreak(true, 4)
	pdf.SetTitle("Tiket Antrian Pendaftaran", false)
	pdf.SetAuthor(fallbackText(printedBy), false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.AddPage()

	statusLabel := registrationQueueStatusLabel(queue.Status)
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
	logoGap := 2.0
	headerTop := pdf.GetY()

	if hasLogo {
		logoWidth, logoHeight = measureInitialAssessmentHeaderLogo(hospitalInfo.LogoPath, 10, 12)
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
		drawInitialAssessmentHeaderLogo(pdf, hospitalInfo.LogoPath, hospitalInfo.LogoType, left, headerTop+0.5, 10, 12)
	}

	pdf.SetXY(textStartX, headerTop)
	pdf.SetFont("Arial", "B", 10)
	pdf.MultiCell(textWidth, 4.1, fallbackText(hospitalName), "", textAlign, false)
	pdf.SetFont("Arial", "", 7.5)
	if addressLine != "" {
		pdf.SetX(textStartX)
		pdf.MultiCell(textWidth, 3.2, addressLine, "", textAlign, false)
	}
	if contactLine != "" {
		pdf.SetX(textStartX)
		pdf.MultiCell(textWidth, 3.2, contactLine, "", textAlign, false)
	}

	headerBottom := pdf.GetY()
	if hasLogo && logoHeight > 0 {
		logoBottom := headerTop + logoHeight + 0.5
		if logoBottom > headerBottom {
			headerBottom = logoBottom
		}
	}
	pdf.SetY(headerBottom + 1)

	pdf.SetDrawColor(120, 120, 120)
	pdf.Line(left, pdf.GetY()+1, pageWidth-right, pdf.GetY()+1)
	pdf.SetY(pdf.GetY() + 2.2)

	pdf.SetFont("Arial", "B", 9)
	pdf.CellFormat(contentWidth, 4.5, "TIKET ANTRIAN PENDAFTARAN", "", 1, "C", false, 0, "")
	pdf.Ln(1.2)

	pdf.SetDrawColor(25, 25, 25)
	pdf.SetFillColor(248, 248, 248)
	bannerTop := pdf.GetY()
	pdf.Rect(left, bannerTop, contentWidth, 24, "DF")
	pdf.SetXY(left, bannerTop+2.5)
	pdf.SetFont("Arial", "", 8)
	pdf.CellFormat(contentWidth, 4, "NOMOR ANTRIAN", "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "B", 28)
	pdf.CellFormat(contentWidth, 12, ticketNumber, "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "B", 9)
	pdf.CellFormat(contentWidth, 4, statusLabel, "", 1, "C", false, 0, "")

	pdf.SetY(bannerTop + 26.5)
	addThermalTicketField(pdf, "Jam Ambil", formatClockFromTime(queue.CreatedAt))
	addThermalTicketField(pdf, "Petugas Cetak", fallbackText(printedBy))

	pdf.SetY(pdf.GetY() + 1)
	pdf.Line(left, pdf.GetY(), pageWidth-right, pdf.GetY())
	pdf.SetY(pdf.GetY() + 1.5)
	pdf.SetFont("Arial", "", 7)
	pdf.MultiCell(contentWidth, 3.2, formatDayDateIndonesian(generatedAt), "", "C", false)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("tiket-antrian-pendaftaran-%s-%s.pdf", ticketNumber, sanitizePDFFileName(queue.QueueDate.Format("2006-01-02")))
	return output.Bytes(), fileName, nil
}

func registrationQueueStatusLabel(status string) string {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case "waiting":
		return "MENUNGGU DIPANGGIL"
	case "called":
		return "SUDAH DIPANGGIL"
	case "processing":
		return "SEDANG DIPROSES"
	case "completed":
		return "SELESAI"
	case "cancelled":
		return "DIBATALKAN"
	default:
		return strings.ToUpper(fallbackText(status))
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

func addThermalTicketField(pdf *gofpdf.Fpdf, label string, value string) {
	pdf.SetFont("Arial", "B", 8)
	pdf.CellFormat(20, 3.8, label, "", 0, "L", false, 0, "")
	pdf.SetFont("Arial", "", 8)
	pdf.MultiCell(0, 3.8, ": "+fallbackText(value), "", "L", false)
}
