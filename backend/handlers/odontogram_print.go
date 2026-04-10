package handlers

import (
	"bytes"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"starter/backend/database"
	"starter/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
)

// ---------------------------------------------------------------------------
// Tooth definitions for the standard 4-row chart (FDI numbering)
// ---------------------------------------------------------------------------

type odontogramPrintToothDef struct {
	number   string
	row      string // permanent_upper, primary_upper, primary_lower, permanent_lower
	position int    // 0-based left-to-right position in that row
	kind     string // anterior | posterior
}

var odontogramPrintTeethDefinitions []odontogramPrintToothDef

func init() {
	permanentUpperNumbers := []string{"18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"}
	primaryUpperNumbers := []string{"55", "54", "53", "52", "51", "61", "62", "63", "64", "65"}
	primaryLowerNumbers := []string{"85", "84", "83", "82", "81", "71", "72", "73", "74", "75"}
	permanentLowerNumbers := []string{"48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"}

	addRow := func(numbers []string, row string) {
		for i, num := range numbers {
			lastDigit := num[len(num)-1]
			kind := "posterior"
			if lastDigit == '1' || lastDigit == '2' || lastDigit == '3' {
				kind = "anterior"
			}
			odontogramPrintTeethDefinitions = append(odontogramPrintTeethDefinitions, odontogramPrintToothDef{
				number:   num,
				row:      row,
				position: i,
				kind:     kind,
			})
		}
	}

	addRow(permanentUpperNumbers, "permanent_upper")
	addRow(primaryUpperNumbers, "primary_upper")
	addRow(primaryLowerNumbers, "primary_lower")
	addRow(permanentLowerNumbers, "permanent_lower")
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

var odontogramToothConditionLabels = map[string]string{
	"sound":         "Sehat (Sound)",
	"missing":       "Missing",
	"extracted":     "Extracted",
	"retained_root": "Retained Root",
	"impacted":      "Impacted",
	"implant":       "Implant",
	"crown":         "Crown",
	"mobility":      "Mobility",
}

var odontogramSurfaceConditionLabels = map[string]string{
	"sound":       "Sound",
	"caries":      "Karies",
	"restoration": "Restorasi",
	"sealant":     "Sealant",
	"fracture":    "Fraktur",
	"wear":        "Aus/Wear",
	"calculus":    "Kalkulus",
}

var odontogramSurfaceCodeLabels = map[string]string{
	"occlusal": "Oklusal",
	"incisal":  "Insisal",
	"mesial":   "Mesial",
	"distal":   "Distal",
	"buccal":   "Bukal",
	"lingual":  "Lingual",
	"labial":   "Labial",
	"palatal":  "Palatal",
}

var odontogramToothConditionOrder = []string{
	"missing",
	"extracted",
	"retained_root",
	"impacted",
	"implant",
	"crown",
	"mobility",
}

var odontogramToothConditionIndicatorCodes = map[string]string{
	"missing":       "MIS",
	"extracted":     "EXT",
	"retained_root": "RAR",
	"impacted":      "IMP",
	"implant":       "IMP-L",
	"crown":         "CRN",
	"mobility":      "MOB",
}

var odontogramSurfaceConditionOrder = []string{
	"caries",
	"restoration",
	"sealant",
	"fracture",
	"wear",
	"calculus",
}

func odontogramToothConditionLabel(code string) string {
	if label, ok := odontogramToothConditionLabels[code]; ok {
		return label
	}
	return code
}

func odontogramSurfaceConditionLabel(code string) string {
	if label, ok := odontogramSurfaceConditionLabels[code]; ok {
		return label
	}
	return code
}

func odontogramSurfaceCodeLabel(code string) string {
	if label, ok := odontogramSurfaceCodeLabels[code]; ok {
		return label
	}
	return code
}

func odontogramToothConditionIndicatorCode(code string) string {
	if label, ok := odontogramToothConditionIndicatorCodes[code]; ok {
		return label
	}
	return strings.ToUpper(strings.TrimSpace(code))
}

func odontogramPDFToothConditionAccent(condition string) (int, int, int) {
	switch condition {
	case "missing":
		return 100, 116, 139
	case "extracted":
		return 251, 113, 133
	case "retained_root":
		return 245, 158, 11
	case "impacted":
		return 167, 139, 250
	case "implant":
		return 34, 211, 238
	case "crown":
		return 250, 204, 21
	case "mobility":
		return 251, 146, 60
	default:
		return 148, 163, 184
	}
}

// ---------------------------------------------------------------------------
// Tooth shape drawing helpers for the PDF
// ---------------------------------------------------------------------------

const (
	odontogramPDFToothSize            = 9.5 // mm per tooth cell
	odontogramPDFToothGap             = 0.8 // mm gap between teeth
	odontogramPDFRowGap               = 1.8 // mm gap between rows
	odontogramPDFLineWidth            = 0.2 // mm line width
	odontogramPDFToothLabelHeight     = 3.0 // mm tooth number height
	odontogramPDFToothLabelGap        = 0.8 // mm spacing around tooth number
	odontogramPDFConditionBadgeHeight = 3.2 // mm indicator badge height
	odontogramPDFConditionBadgeGap    = 0.6 // mm spacing between tooth and indicator badge
)

func odontogramPDFRowStartX(pdf *gofpdf.Fpdf, count int) float64 {
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	totalRowWidth := float64(count)*odontogramPDFToothSize + float64(count-1)*odontogramPDFToothGap
	return left + (contentWidth-totalRowWidth)/2
}

func drawOdontogramPDFToothPosterior(pdf *gofpdf.Fpdf, x, y, size float64, toothMap map[string]models.OdontogramTooth, toothNumber string) {
	tooth, hasTooth := toothMap[toothNumber]
	innerMargin := size * 0.30
	ix := x + innerMargin
	iy := y + innerMargin
	iw := size - 2*innerMargin
	ih := iw

	// Fill surfaces
	if hasTooth {
		for _, sf := range tooth.SurfaceFindings {
			if sf.ConditionCode == "" || sf.ConditionCode == "sound" {
				continue
			}
			r, g, b := odontogramPDFSurfaceFillColor(sf.ConditionCode)
			pdf.SetFillColor(r, g, b)
			switch sf.SurfaceCode {
			case "buccal", "labial":
				drawTrapezoid(pdf, x, y, x+size, y, ix+iw, iy, ix, iy)
			case "lingual", "palatal":
				drawTrapezoid(pdf, x, y+size, ix, iy+ih, ix+iw, iy+ih, x+size, y+size)
			case "mesial":
				drawTrapezoid(pdf, x, y, ix, iy, ix, iy+ih, x, y+size)
			case "distal":
				drawTrapezoid(pdf, x+size, y, x+size, y+size, ix+iw, iy+ih, ix+iw, iy)
			case "occlusal", "incisal":
				pdf.Rect(ix, iy, iw, ih, "F")
			}
		}
	}

	// Overlay for whole tooth
	if hasTooth {
		drawOdontogramPDFToothOverlay(pdf, x, y, size, tooth.ToothCondition)
	}

	// Outline
	pdf.SetDrawColor(60, 60, 60)
	pdf.SetLineWidth(odontogramPDFLineWidth)
	pdf.Rect(x, y, size, size, "D")
	pdf.Rect(ix, iy, iw, ih, "D")
	pdf.Line(x, y, ix, iy)
	pdf.Line(x+size, y, ix+iw, iy)
	pdf.Line(x, y+size, ix, iy+ih)
	pdf.Line(x+size, y+size, ix+iw, iy+ih)
}

func drawOdontogramPDFToothAnterior(pdf *gofpdf.Fpdf, x, y, size float64, toothMap map[string]models.OdontogramTooth, toothNumber string) {
	tooth, hasTooth := toothMap[toothNumber]
	midY := y + size/2
	cxL := x + size*0.30
	cxR := x + size*0.70

	// Fill surfaces
	if hasTooth {
		for _, sf := range tooth.SurfaceFindings {
			if sf.ConditionCode == "" || sf.ConditionCode == "sound" {
				continue
			}
			r, g, b := odontogramPDFSurfaceFillColor(sf.ConditionCode)
			pdf.SetFillColor(r, g, b)
			switch sf.SurfaceCode {
			case "labial", "buccal":
				drawTriangle(pdf, x, y, x+size, y, cxL, midY)
				drawTriangle(pdf, x+size, y, cxR, midY, cxL, midY)
			case "lingual", "palatal":
				drawTriangle(pdf, x, y+size, cxL, midY, x+size, y+size)
				drawTriangle(pdf, x+size, y+size, cxL, midY, cxR, midY)
			case "mesial":
				drawTriangle(pdf, x, y, cxL, midY, x, y+size)
			case "distal":
				drawTriangle(pdf, x+size, y, x+size, y+size, cxR, midY)
			case "incisal", "occlusal":
				drawQuad(pdf, cxL, midY-size*0.06, cxR, midY-size*0.06, cxR, midY+size*0.06, cxL, midY+size*0.06)
			}
		}
	}

	// Overlay
	if hasTooth {
		drawOdontogramPDFToothOverlay(pdf, x, y, size, tooth.ToothCondition)
	}

	// Outline: outer square + converging lines + horizontal center line
	pdf.SetDrawColor(60, 60, 60)
	pdf.SetLineWidth(odontogramPDFLineWidth)
	pdf.Rect(x, y, size, size, "D")
	pdf.Line(x, y, cxL, midY)
	pdf.Line(x+size, y, cxR, midY)
	pdf.Line(x, y+size, cxL, midY)
	pdf.Line(x+size, y+size, cxR, midY)
	pdf.Line(cxL, midY, cxR, midY)
}

func drawOdontogramPDFToothOverlay(pdf *gofpdf.Fpdf, x, y, size float64, condition string) {
	switch condition {
	case "missing", "extracted":
		if condition == "extracted" {
			pdf.SetDrawColor(220, 38, 38)
		} else {
			pdf.SetDrawColor(100, 116, 139)
		}
		pdf.SetLineWidth(0.4)
		m := size * 0.1
		pdf.Line(x+m, y+m, x+size-m, y+size-m)
		pdf.Line(x+size-m, y+m, x+m, y+size-m)
		pdf.SetDrawColor(60, 60, 60)
		pdf.SetLineWidth(odontogramPDFLineWidth)
	case "implant":
		pdf.SetDrawColor(8, 145, 178)
		pdf.SetLineWidth(0.3)
		centerX := x + size*0.5
		centerY := y + size*0.42
		radius := size * 0.15
		pdf.Circle(centerX, centerY, radius, "D")
		pdf.Line(centerX, centerY+radius, centerX, y+size*0.78)
		pdf.Line(centerX-size*0.12, y+size*0.67, centerX+size*0.12, y+size*0.67)
		pdf.SetDrawColor(60, 60, 60)
		pdf.SetLineWidth(odontogramPDFLineWidth)
	case "retained_root":
		pdf.SetDrawColor(180, 83, 9)
		pdf.SetLineWidth(0.35)
		lineY := y + size*0.74
		pdf.Line(x+size*0.28, lineY, x+size*0.72, lineY)
		pdf.SetDrawColor(60, 60, 60)
		pdf.SetLineWidth(odontogramPDFLineWidth)
	case "impacted":
		pdf.SetDrawColor(124, 58, 237)
		pdf.SetLineWidth(0.35)
		m := size * 0.14
		pdf.Line(x+m, y+size-m, x+size-m, y+m)
		pdf.SetDrawColor(60, 60, 60)
		pdf.SetLineWidth(odontogramPDFLineWidth)
	case "mobility":
		pdf.SetDrawColor(234, 88, 12)
		pdf.SetLineWidth(0.35)
		pdf.Line(x+size*0.18, y+size*0.80, x+size*0.38, y+size*0.60)
		pdf.Line(x+size*0.38, y+size*0.60, x+size*0.56, y+size*0.82)
		pdf.Line(x+size*0.56, y+size*0.82, x+size*0.82, y+size*0.64)
		pdf.SetDrawColor(60, 60, 60)
		pdf.SetLineWidth(odontogramPDFLineWidth)
	case "crown":
		pdf.SetDrawColor(202, 138, 4)
		pdf.SetLineWidth(0.3)
		inset := size * 0.18
		pdf.Rect(x+inset, y+inset, size-(2*inset), size-(2*inset), "D")
		pdf.SetDrawColor(60, 60, 60)
		pdf.SetLineWidth(odontogramPDFLineWidth)
	}
}

func drawOdontogramPDFConditionBadge(pdf *gofpdf.Fpdf, x, y, width float64, condition string) {
	if condition == "" || condition == "sound" {
		return
	}

	code := odontogramToothConditionIndicatorCode(condition)
	if code == "" {
		return
	}

	r, g, b := odontogramPDFToothConditionAccent(condition)
	badgeX := x + 0.1
	badgeW := width - 0.2

	pdf.SetFillColor(255, 255, 255)
	pdf.SetDrawColor(r, g, b)
	pdf.Rect(badgeX, y, badgeW, odontogramPDFConditionBadgeHeight, "FD")
	pdf.SetXY(badgeX, y+0.1)
	pdf.SetTextColor(r, g, b)
	pdf.SetFont("Arial", "B", 4.4)
	pdf.CellFormat(badgeW, odontogramPDFConditionBadgeHeight-0.2, code, "", 0, "C", false, 0, "")
	pdf.SetDrawColor(60, 60, 60)
	pdf.SetTextColor(0, 0, 0)
}

func odontogramPDFSurfaceFillColor(conditionCode string) (int, int, int) {
	switch conditionCode {
	case "caries":
		return 239, 68, 68 // red
	case "restoration":
		return 59, 130, 246 // blue
	case "sealant":
		return 34, 197, 94 // green
	case "fracture":
		return 249, 115, 22 // orange
	case "wear":
		return 234, 179, 8 // amber
	case "calculus":
		return 168, 85, 247 // purple
	default:
		return 200, 200, 200 // gray fallback
	}
}

func drawTrapezoid(pdf *gofpdf.Fpdf, x1, y1, x2, y2, x3, y3, x4, y4 float64) {
	points := []gofpdf.PointType{{X: x1, Y: y1}, {X: x2, Y: y2}, {X: x3, Y: y3}, {X: x4, Y: y4}}
	pdf.Polygon(points, "F")
}

func drawTriangle(pdf *gofpdf.Fpdf, x1, y1, x2, y2, x3, y3 float64) {
	points := []gofpdf.PointType{{X: x1, Y: y1}, {X: x2, Y: y2}, {X: x3, Y: y3}}
	pdf.Polygon(points, "F")
}

func drawQuad(pdf *gofpdf.Fpdf, x1, y1, x2, y2, x3, y3, x4, y4 float64) {
	points := []gofpdf.PointType{{X: x1, Y: y1}, {X: x2, Y: y2}, {X: x3, Y: y3}, {X: x4, Y: y4}}
	pdf.Polygon(points, "F")
}

// ---------------------------------------------------------------------------
// Draw one row of odontogram
// ---------------------------------------------------------------------------

func drawOdontogramPDFRow(pdf *gofpdf.Fpdf, startX, startY float64, defs []odontogramPrintToothDef, toothMap map[string]models.OdontogramTooth, labelAbove bool) {
	toothSize := odontogramPDFToothSize
	gap := odontogramPDFToothGap

	for i, def := range defs {
		tx := startX + float64(i)*(toothSize+gap)
		condition := "sound"
		if tooth, ok := toothMap[def.number]; ok && strings.TrimSpace(tooth.ToothCondition) != "" {
			condition = tooth.ToothCondition
		}

		// Label
		pdf.SetFont("Arial", "B", 6)
		pdf.SetTextColor(40, 40, 40)
		if labelAbove {
			pdf.SetXY(tx, startY-odontogramPDFToothLabelGap-odontogramPDFToothLabelHeight)
		} else {
			pdf.SetXY(tx, startY+toothSize+odontogramPDFConditionBadgeGap+odontogramPDFConditionBadgeHeight+odontogramPDFToothLabelGap)
		}
		pdf.CellFormat(toothSize, odontogramPDFToothLabelHeight, def.number, "", 0, "C", false, 0, "")

		// Draw tooth
		if def.kind == "anterior" {
			drawOdontogramPDFToothAnterior(pdf, tx, startY, toothSize, toothMap, def.number)
		} else {
			drawOdontogramPDFToothPosterior(pdf, tx, startY, toothSize, toothMap, def.number)
		}

		drawOdontogramPDFConditionBadge(pdf, tx, startY+toothSize+odontogramPDFConditionBadgeGap, toothSize, condition)
	}

	pdf.SetTextColor(0, 0, 0)
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

func addOdontogramPDFSummaryTable(pdf *gofpdf.Fpdf, teeth []models.OdontogramTooth) {
	// Collect teeth with findings
	type toothSummary struct {
		toothNumber    string
		toothCondition string
		notes          string
		surfaces       []models.OdontogramSurfaceFinding
	}

	var summaries []toothSummary
	for _, tooth := range teeth {
		if tooth.ToothCondition == "sound" && len(tooth.SurfaceFindings) == 0 && strings.TrimSpace(tooth.Notes) == "" {
			continue
		}
		summaries = append(summaries, toothSummary{
			toothNumber:    tooth.ToothNumber,
			toothCondition: tooth.ToothCondition,
			notes:          strings.TrimSpace(tooth.Notes),
			surfaces:       tooth.SurfaceFindings,
		})
	}

	if len(summaries) == 0 {
		return
	}

	// Sort by tooth number
	sort.Slice(summaries, func(i, j int) bool {
		a, _ := strconv.Atoi(summaries[i].toothNumber)
		b, _ := strconv.Atoi(summaries[j].toothNumber)
		return a < b
	})

	addInitialAssessmentSectionTitle(pdf, "DETAIL TEMUAN GIGI")

	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right

	colNoW := 10.0
	colToothW := 16.0
	colCondW := 34.0
	colSurfaceW := contentWidth - colNoW - colToothW - colCondW
	rowH := 6.0

	drawHeader := func() {
		pdf.SetFont("Arial", "B", 8)
		pdf.SetFillColor(235, 235, 235)
		pdf.SetDrawColor(150, 150, 150)
		pdf.CellFormat(colNoW, rowH, " No", "1", 0, "C", true, 0, "")
		pdf.CellFormat(colToothW, rowH, " Gigi", "1", 0, "C", true, 0, "")
		pdf.CellFormat(colCondW, rowH, " Kondisi", "1", 0, "L", true, 0, "")
		pdf.CellFormat(colSurfaceW, rowH, " Temuan / Catatan", "1", 1, "L", true, 0, "")
	}

	drawHeader()

	// Table rows
	pdf.SetFont("Arial", "", 8)
	pdf.SetFillColor(255, 255, 255)

	for idx, summary := range summaries {
		surfaceText := buildOdontogramSurfaceText(summary.surfaces)
		if summary.notes != "" {
			if surfaceText != "" {
				surfaceText += " | "
			}
			surfaceText += "Catatan: " + sanitizePDFText(summary.notes)
		}

		condLabel := odontogramToothConditionLabel(summary.toothCondition)
		surfaceLines := pdf.SplitLines([]byte(sanitizePDFText(surfaceText)), colSurfaceW-2)
		lineCount := len(surfaceLines)
		if lineCount < 1 {
			lineCount = 1
		}
		cellH := float64(lineCount) * 4.0
		if cellH < rowH {
			cellH = rowH
		}

		_, pageHeight := pdf.GetPageSize()
		if pdf.GetY()+cellH+1 > pageHeight-initialAssessmentPDFMarginBottom {
			pdf.AddPage()
			pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))
			drawHeader()
			pdf.SetFont("Arial", "", 8)
		}

		fillRow := idx%2 == 1
		if fillRow {
			pdf.SetFillColor(248, 250, 252)
		} else {
			pdf.SetFillColor(255, 255, 255)
		}

		xStart := pdf.GetX()
		yStart := pdf.GetY()
		pdf.CellFormat(colNoW, cellH, fmt.Sprintf(" %d", idx+1), "1", 0, "C", fillRow, 0, "")
		pdf.CellFormat(colToothW, cellH, " "+summary.toothNumber, "1", 0, "C", fillRow, 0, "")
		pdf.CellFormat(colCondW, cellH, " "+sanitizePDFText(condLabel), "1", 0, "L", fillRow, 0, "")

		// Multi-line surface cell
		surfaceX := xStart + colNoW + colToothW + colCondW
		surfaceRectStyle := "D"
		if fillRow {
			surfaceRectStyle = "FD"
		}
		pdf.Rect(surfaceX, yStart, colSurfaceW, cellH, surfaceRectStyle)
		pdf.SetXY(surfaceX+1, yStart+0.5)
		pdf.MultiCell(colSurfaceW-2, 4.0, sanitizePDFText(surfaceText), "", "L", false)

		pdf.SetXY(left, yStart+cellH)
	}

	addInitialAssessmentSectionSpacing(pdf)
}

func buildOdontogramSurfaceText(findings []models.OdontogramSurfaceFinding) string {
	var parts []string
	for _, sf := range findings {
		if sf.ConditionCode == "" || sf.ConditionCode == "sound" {
			continue
		}
		label := odontogramSurfaceCodeLabel(sf.SurfaceCode) + ": " + odontogramSurfaceConditionLabel(sf.ConditionCode)
		if notes := strings.TrimSpace(sf.Notes); notes != "" {
			label += " (" + notes + ")"
		}
		parts = append(parts, label)
	}
	return strings.Join(parts, ", ")
}

func buildOdontogramPDFCountSummary(counts map[string]int, preferredOrder []string, labelFunc func(string) string, noun string, emptyText string) string {
	if len(counts) == 0 {
		return emptyText
	}

	parts := make([]string, 0, len(counts))
	used := make(map[string]bool, len(preferredOrder))

	for _, code := range preferredOrder {
		if count := counts[code]; count > 0 {
			parts = append(parts, fmt.Sprintf("%s %d %s", labelFunc(code), count, noun))
			used[code] = true
		}
	}

	var remaining []string
	for code, count := range counts {
		if count > 0 && !used[code] {
			remaining = append(remaining, code)
		}
	}
	sort.Strings(remaining)

	for _, code := range remaining {
		parts = append(parts, fmt.Sprintf("%s %d %s", labelFunc(code), counts[code], noun))
	}

	if len(parts) == 0 {
		return emptyText
	}

	return strings.Join(parts, ", ")
}

// ---------------------------------------------------------------------------
// Statistics section
// ---------------------------------------------------------------------------

func addOdontogramPDFStatistics(pdf *gofpdf.Fpdf, teeth []models.OdontogramTooth) {
	totalMarked := 0
	totalSurfaceFindings := 0
	conditionCounts := make(map[string]int)
	surfaceCounts := make(map[string]int)

	for _, tooth := range teeth {
		if tooth.ToothCondition != "sound" || len(tooth.SurfaceFindings) > 0 {
			totalMarked++
		}
		if tooth.ToothCondition != "sound" {
			conditionCounts[tooth.ToothCondition]++
		}
		for _, sf := range tooth.SurfaceFindings {
			if sf.ConditionCode != "sound" {
				totalSurfaceFindings++
				surfaceCounts[sf.ConditionCode]++
			}
		}
	}

	addInitialAssessmentSectionTitle(pdf, "RINGKASAN ODONTOGRAM")
	addInitialAssessmentKeyValueRow(
		pdf,
		"Total temuan",
		fmt.Sprintf("%d gigi bertanda, %d permukaan dengan temuan.", totalMarked, totalSurfaceFindings),
	)
	addInitialAssessmentKeyValueRow(
		pdf,
		"Kondisi gigi",
		buildOdontogramPDFCountSummary(conditionCounts, odontogramToothConditionOrder, odontogramToothConditionLabel, "gigi", "Tidak ada kondisi gigi khusus."),
	)
	addInitialAssessmentKeyValueRow(
		pdf,
		"Temuan permukaan",
		buildOdontogramPDFCountSummary(surfaceCounts, odontogramSurfaceConditionOrder, odontogramSurfaceConditionLabel, "permukaan", "Tidak ada temuan permukaan khusus."),
	)
	addInitialAssessmentSectionSpacing(pdf)
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

func addOdontogramPDFLegend(pdf *gofpdf.Fpdf) {
	ensureInitialAssessmentPDFSpace(pdf, 32)

	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right

	legends := []struct {
		label   string
		r, g, b int
	}{
		{"Karies", 239, 68, 68},
		{"Restorasi", 59, 130, 246},
		{"Sealant", 34, 197, 94},
		{"Fraktur", 249, 115, 22},
		{"Aus/Wear", 234, 179, 8},
		{"Kalkulus", 168, 85, 247},
	}

	cols := 3
	colWidth := contentWidth / float64(cols)
	boxSize := 3.5
	rowHeight := 4.8
	pdf.SetFont("Arial", "B", 8)
	pdf.SetTextColor(70, 70, 70)
	pdf.SetXY(left, pdf.GetY()+0.5)
	pdf.CellFormat(contentWidth, 4, "Keterangan warna permukaan:", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 8)

	startX := left
	startY := pdf.GetY() + 0.8
	for i, legend := range legends {
		col := i % cols
		row := i / cols
		bx := startX + float64(col)*colWidth
		by := startY + float64(row)*rowHeight

		pdf.SetFillColor(legend.r, legend.g, legend.b)
		pdf.SetDrawColor(120, 120, 120)
		pdf.Rect(bx, by, boxSize, boxSize, "FD")
		pdf.SetXY(bx+boxSize+1.5, by-0.1)
		pdf.SetTextColor(30, 30, 30)
		pdf.CellFormat(colWidth-boxSize-2, boxSize, legend.label, "", 0, "L", false, 0, "")
	}

	pdf.SetTextColor(0, 0, 0)
	rows := int(math.Ceil(float64(len(legends)) / float64(cols)))
	pdf.SetY(startY + float64(rows)*rowHeight + 1.5)

	pdf.SetFont("Arial", "B", 8)
	pdf.SetTextColor(70, 70, 70)
	pdf.SetXY(left, pdf.GetY()+0.5)
	pdf.CellFormat(contentWidth, 4, "Indikator kondisi gigi:", "", 1, "L", false, 0, "")

	indicatorCols := 4
	indicatorColWidth := contentWidth / float64(indicatorCols)
	indicatorSampleSize := 5.0
	indicatorRowHeight := 7.0
	indicatorStartY := pdf.GetY() + 0.8
	pdf.SetFont("Arial", "", 7)

	for i, condition := range odontogramToothConditionOrder {
		col := i % indicatorCols
		row := i / indicatorCols
		bx := left + float64(col)*indicatorColWidth
		by := indicatorStartY + float64(row)*indicatorRowHeight

		drawOdontogramPDFToothPosterior(pdf, bx, by, indicatorSampleSize, nil, "")
		drawOdontogramPDFToothOverlay(pdf, bx, by, indicatorSampleSize, condition)

		indicatorText := odontogramToothConditionIndicatorCode(condition) + " " + odontogramToothConditionLabel(condition)
		pdf.SetXY(bx+indicatorSampleSize+1.4, by+0.7)
		pdf.SetTextColor(30, 30, 30)
		pdf.CellFormat(indicatorColWidth-indicatorSampleSize-1.4, 3.2, indicatorText, "", 0, "L", false, 0, "")
	}

	pdf.SetTextColor(0, 0, 0)
	indicatorRows := int(math.Ceil(float64(len(odontogramToothConditionOrder)) / float64(indicatorCols)))
	pdf.SetY(indicatorStartY + float64(indicatorRows)*indicatorRowHeight + 1)
	addInitialAssessmentSectionSpacing(pdf)
}

// ---------------------------------------------------------------------------
// Main print handler
// ---------------------------------------------------------------------------

func PrintOdontogramEntry(c *gin.Context) {
	entryID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || entryID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID entri odontogram tidak valid"})
		return
	}

	var entry models.OdontogramEntry
	if err := preloadOdontogramEntryRelations(database.DB).First(&entry, uint(entryID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entri odontogram tidak ditemukan"})
		return
	}

	hospitalInfo := getInitialAssessmentHospitalInfo()
	generatedAt := time.Now()

	// Build PDF
	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)
	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle("Odontogram", false)
	pdf.SetCreator("SIMKLINIK", false)

	pdf.SetHeaderFuncMode(func() {
		if pdf.PageNo() != 1 {
			return
		}
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, "ODONTOGRAM", fallbackText(entry.Visit.VisitNumber))
	}, true)

	pdf.SetFooterFunc(func() {
		pdf.SetY(-8)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(90, 90, 90)
		pdf.CellFormat(90, 4, "Dicetak: "+formatDateTimeIndonesian(generatedAt), "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})

	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	// ---- Data Pasien & Data Kunjungan ----
	patientFields := buildInitialAssessmentPatientFields(entry.Patient)
	visitFields := []initialAssessmentPrintField{
		{Label: "No. Kunjungan", Value: fallbackText(entry.Visit.VisitNumber)},
		{Label: "Tanggal Kunjungan", Value: formatDatePointer(&entry.Visit.VisitDate)},
		{Label: "Poliklinik", Value: fallbackText(entry.Polyclinic.Name)},
		{Label: "Dokter", Value: fallbackText(entry.Doctor.FullName)},
		{Label: "Status Entri", Value: odontogramStatusLabel(entry.Status)},
	}

	addInitialAssessmentCompactFieldSection(pdf, "DATA PASIEN", patientFields, "Data pasien tidak tersedia.")
	addInitialAssessmentCompactFieldSection(pdf, "DATA KUNJUNGAN", visitFields, "Data kunjungan tidak tersedia.")

	// ---- Odontogram Chart ----
	addInitialAssessmentSectionTitle(pdf, "ODONTOGRAM CHART")

	// Build tooth map for lookup
	toothMap := make(map[string]models.OdontogramTooth, len(entry.Teeth))
	for _, tooth := range entry.Teeth {
		toothMap[tooth.ToothNumber] = tooth
	}

	// Collect rows
	rowDefs := map[string][]odontogramPrintToothDef{
		"permanent_upper": {},
		"primary_upper":   {},
		"primary_lower":   {},
		"permanent_lower": {},
	}
	for _, def := range odontogramPrintTeethDefinitions {
		rowDefs[def.row] = append(rowDefs[def.row], def)
	}

	chartTopPadding := 3.0
	rowAdvance := odontogramPDFToothSize + odontogramPDFConditionBadgeGap + odontogramPDFConditionBadgeHeight + odontogramPDFToothLabelGap + odontogramPDFToothLabelHeight + odontogramPDFRowGap
	chartNeededHeight := chartTopPadding + odontogramPDFToothLabelHeight + odontogramPDFToothLabelGap + (3 * rowAdvance) + odontogramPDFToothSize + odontogramPDFConditionBadgeGap + odontogramPDFConditionBadgeHeight + odontogramPDFToothLabelGap + odontogramPDFToothLabelHeight + 2
	ensureInitialAssessmentPDFSpace(pdf, chartNeededHeight)

	currentY := pdf.GetY() + chartTopPadding + odontogramPDFToothLabelHeight + odontogramPDFToothLabelGap

	// Row 1: permanent upper (16 teeth) — label above
	startX := odontogramPDFRowStartX(pdf, 16)
	drawOdontogramPDFRow(pdf, startX, currentY, rowDefs["permanent_upper"], toothMap, true)
	currentY += rowAdvance

	// Row 2: primary upper (10 teeth) — label above
	startX = odontogramPDFRowStartX(pdf, 10)
	drawOdontogramPDFRow(pdf, startX, currentY, rowDefs["primary_upper"], toothMap, true)
	currentY += rowAdvance

	// Row 3: primary lower (10 teeth) — label below
	startX = odontogramPDFRowStartX(pdf, 10)
	drawOdontogramPDFRow(pdf, startX, currentY, rowDefs["primary_lower"], toothMap, false)
	currentY += rowAdvance

	// Row 4: permanent lower (16 teeth) — label below
	startX = odontogramPDFRowStartX(pdf, 16)
	drawOdontogramPDFRow(pdf, startX, currentY, rowDefs["permanent_lower"], toothMap, false)
	currentY += odontogramPDFToothSize + odontogramPDFConditionBadgeGap + odontogramPDFConditionBadgeHeight + odontogramPDFToothLabelGap + odontogramPDFToothLabelHeight + 2

	pdf.SetY(currentY)

	// ---- Legend ----
	addOdontogramPDFLegend(pdf)

	// ---- Statistics ----
	addOdontogramPDFStatistics(pdf, entry.Teeth)

	// ---- Notes section ----
	if trimmedNotes := strings.TrimSpace(entry.Notes); trimmedNotes != "" {
		addInitialAssessmentSectionTitle(pdf, "CATATAN ENTRI")
		ensureInitialAssessmentPDFSpace(pdf, 8)
		left, _, right, _ := pdf.GetMargins()
		pageWidth, _ := pdf.GetPageSize()
		contentWidth := pageWidth - left - right
		pdf.SetFont("Arial", "", 9)
		pdf.MultiCell(contentWidth, 4.5, sanitizePDFText(trimmedNotes), "", "L", false)
		addInitialAssessmentSectionSpacing(pdf)
	}

	// ---- Detail findings table ----
	addOdontogramPDFSummaryTable(pdf, entry.Teeth)

	// ---- Signature ----
	addOdontogramPDFSignature(pdf, hospitalInfo, entry, generatedAt)

	// Output
	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF odontogram"})
		return
	}

	fileName := fmt.Sprintf("odontogram-%s-%s.pdf", sanitizePDFFileName(entry.Patient.FullName), sanitizePDFFileName(entry.Visit.VisitNumber))
	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", output.Bytes())
}

func odontogramStatusLabel(status string) string {
	switch status {
	case "draft":
		return "Draf"
	case "final":
		return "Final"
	case "cancelled":
		return "Dibatalkan"
	default:
		return status
	}
}

func addOdontogramPDFSignature(pdf *gofpdf.Fpdf, hospitalInfo initialAssessmentHospitalInfo, entry models.OdontogramEntry, generatedAt time.Time) {
	ensureInitialAssessmentPDFSpace(pdf, 30)
	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	columnGap := 12.0
	columnWidth := (contentWidth - columnGap) / 2
	leftColumnX := left
	rightColumnX := left + columnWidth + columnGap
	currentY := pdf.GetY() + 4

	signatureLocation := strings.TrimSpace(hospitalInfo.City)
	signatureDate := formatDateIndonesian(generatedAt)
	locationDateLabel := signatureDate
	if signatureLocation != "" {
		locationDateLabel = signatureLocation + ", " + signatureDate
	}

	pdf.SetFont("Arial", "", 9)
	pdf.SetXY(rightColumnX, currentY)
	pdf.CellFormat(columnWidth, 5, locationDateLabel, "", 1, "C", false, 0, "")

	currentY = pdf.GetY() + 2
	pdf.SetXY(leftColumnX, currentY)
	pdf.CellFormat(columnWidth, 5, "Pasien / Keluarga", "", 0, "C", false, 0, "")
	pdf.SetXY(rightColumnX, currentY)
	pdf.CellFormat(columnWidth, 5, "Dokter Pemeriksa", "", 1, "C", false, 0, "")

	lineWidth := minFloat64(52, columnWidth-26)
	leftLineX := leftColumnX + ((columnWidth - lineWidth) / 2)
	rightLineX := rightColumnX + ((columnWidth - lineWidth) / 2)
	signatureLineY := pdf.GetY() + 12
	pdf.SetDrawColor(60, 60, 60)
	pdf.Line(leftLineX, signatureLineY, leftLineX+lineWidth, signatureLineY)
	pdf.Line(rightLineX, signatureLineY, rightLineX+lineWidth, signatureLineY)

	pdf.SetFont("Arial", "B", 9)
	pdf.SetY(signatureLineY + 2.5)
	pdf.SetXY(leftColumnX, pdf.GetY())
	pdf.CellFormat(columnWidth, 5, fallbackText(entry.Patient.FullName), "", 0, "C", false, 0, "")
	pdf.SetXY(rightColumnX, pdf.GetY())
	pdf.CellFormat(columnWidth, 5, fallbackText(entry.Doctor.FullName), "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 9)
	pdf.SetY(pdf.GetY() + 2)
}
