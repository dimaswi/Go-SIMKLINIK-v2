package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"starter/backend/config"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/boombuler/barcode"
	barcodeqr "github.com/boombuler/barcode/qr"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jung-kurt/gofpdf"
	"gorm.io/gorm"
)

type ttePrintSignatureInfo struct {
	RequestID     uint
	DocumentKey   string
	DocumentLabel string
	SignerName    string
	SignedAt      *time.Time
	ValidationURL string
}

type tteVerificationClaims struct {
	RequestID   uint   `json:"request_id"`
	DocumentKey string `json:"document_key"`
	SignedUnix  int64  `json:"signed_unix"`
	Signature   string `json:"-"`
	jwt.RegisteredClaims
}

func loadTTESignedSignatureByDocumentKey(documentKey string) *ttePrintSignatureInfo {
	return loadTTESignedSignatureByDocumentKeyWithBaseURL(documentKey, "")
}

func loadTTESignedSignatureByDocumentKeyWithBaseURL(documentKey string, baseURL string) *ttePrintSignatureInfo {
	trimmedKey := strings.TrimSpace(documentKey)
	if trimmedKey == "" {
		return nil
	}

	var request models.DocumentSignatureRequest
	if err := database.DB.
		Select("id", "document_key", "document_label", "requested_to_user_id", "signature_name_snapshot", "signed_at").
		Where("document_key = ? AND status = ?", trimmedKey, tteStatusSigned).
		First(&request).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil
		}
		return nil
	}

	signerName := strings.TrimSpace(request.SignatureNameSnapshot)
	if signerName == "" && request.RequestedToUserID != 0 {
		var signer models.User
		if err := database.DB.Select("full_name", "username", "email").First(&signer, request.RequestedToUserID).Error; err == nil {
			signerName = tteResolveUserDisplayName(signer)
		}
	}

	validationURL := ""
	if token, err := buildTTESignatureVerificationToken(request); err == nil {
		validationURL = buildTTESignatureVerificationURLWithBaseURL(token, baseURL)
	}

	return &ttePrintSignatureInfo{
		RequestID:     request.ID,
		DocumentKey:   strings.TrimSpace(request.DocumentKey),
		DocumentLabel: strings.TrimSpace(request.DocumentLabel),
		SignerName:    firstNonEmpty(signerName, "Signer Internal"),
		SignedAt:      request.SignedAt,
		ValidationURL: validationURL,
	}
}

func buildTTESignatureVerificationToken(request models.DocumentSignatureRequest) (string, error) {
	signedUnix := int64(0)
	if request.SignedAt != nil && !request.SignedAt.IsZero() {
		signedUnix = request.SignedAt.Unix()
	}

	requestIDPart := strconv.FormatUint(uint64(request.ID), 36)
	signedUnixPart := strconv.FormatInt(signedUnix, 36)
	signature := computeTTESignatureVerificationMAC(request.ID, strings.TrimSpace(request.DocumentKey), signedUnix)
	if signature == "" {
		return "", errors.New("signature verification secret is empty")
	}

	return fmt.Sprintf("h1.%s.%s.%s", requestIDPart, signedUnixPart, signature), nil
}

func parseTTESignatureVerificationToken(rawToken string) (*tteVerificationClaims, error) {
	trimmedToken := strings.TrimSpace(rawToken)
	if strings.HasPrefix(trimmedToken, "h1.") {
		return parseCompactTTESignatureVerificationToken(trimmedToken)
	}

	claims := &tteVerificationClaims{}
	token, err := jwt.ParseWithClaims(trimmedToken, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(config.Load().JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}

func parseCompactTTESignatureVerificationToken(rawToken string) (*tteVerificationClaims, error) {
	parts := strings.Split(rawToken, ".")
	if len(parts) != 4 || parts[0] != "h1" {
		return nil, errors.New("invalid compact verification token")
	}

	requestID, err := strconv.ParseUint(parts[1], 36, 64)
	if err != nil {
		return nil, err
	}
	signedUnix, err := strconv.ParseInt(parts[2], 36, 64)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(parts[3]) == "" {
		return nil, errors.New("missing compact verification signature")
	}

	return &tteVerificationClaims{
		RequestID:  uint(requestID),
		SignedUnix: signedUnix,
		Signature:  strings.TrimSpace(parts[3]),
	}, nil
}

func computeTTESignatureVerificationMAC(requestID uint, documentKey string, signedUnix int64) string {
	secret := strings.TrimSpace(config.Load().JWTSecret)
	if secret == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(fmt.Sprintf("%d|%s|%d", requestID, strings.TrimSpace(documentKey), signedUnix)))
	checksum := mac.Sum(nil)
	return base64.RawURLEncoding.EncodeToString(checksum[:12])
}

func validateTTESignatureVerificationClaims(claims *tteVerificationClaims, request models.DocumentSignatureRequest) bool {
	if claims == nil {
		return false
	}

	requestSignedUnix := int64(0)
	if request.SignedAt != nil && !request.SignedAt.IsZero() {
		requestSignedUnix = request.SignedAt.Unix()
	}
	if requestSignedUnix != claims.SignedUnix {
		return false
	}

	if strings.TrimSpace(claims.Signature) == "" {
		return strings.TrimSpace(request.DocumentKey) == strings.TrimSpace(claims.DocumentKey)
	}

	expectedSignature := computeTTESignatureVerificationMAC(request.ID, request.DocumentKey, requestSignedUnix)
	if expectedSignature == "" {
		return false
	}

	return subtle.ConstantTimeCompare([]byte(expectedSignature), []byte(strings.TrimSpace(claims.Signature))) == 1
}

func buildTTESignatureVerificationURL(token string) string {
	return buildTTESignatureVerificationURLWithBaseURL(token, "")
}

func buildTTESignatureVerificationURLWithBaseURL(token string, baseURL string) string {
	resolvedBaseURL := strings.TrimSpace(baseURL)
	if resolvedBaseURL == "" {
		resolvedBaseURL = resolveTTESignatureVerificationBaseURL()
	}
	if resolvedBaseURL == "" || strings.TrimSpace(token) == "" {
		return ""
	}
	return strings.TrimRight(resolvedBaseURL, "/") + "/tte/verify#" + url.PathEscape(token)
}

func resolveTTEVerificationBaseURLForRequest(c *gin.Context) string {
	if c == nil || c.Request == nil {
		return resolveTTESignatureVerificationBaseURL()
	}

	origin := strings.TrimSpace(c.GetHeader("Origin"))
	if origin != "" {
		return strings.TrimRight(origin, "/")
	}

	host := strings.TrimSpace(firstNonEmpty(extractForwardedHeaderValue(c.GetHeader("X-Forwarded-Host")), c.Request.Host))
	if host == "" {
		return resolveTTESignatureVerificationBaseURL()
	}

	scheme := strings.TrimSpace(strings.ToLower(extractForwardedHeaderValue(c.GetHeader("X-Forwarded-Proto"))))
	if scheme == "" {
		if c.Request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

	return scheme + "://" + host
}

func extractForwardedHeaderValue(rawValue string) string {
	trimmed := strings.TrimSpace(rawValue)
	if trimmed == "" {
		return ""
	}
	parts := strings.Split(trimmed, ",")
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimSpace(parts[0])
}

func resolveTTESignatureVerificationBaseURL() string {
	hospitalInfo := getInitialAssessmentHospitalInfo()
	website := strings.TrimSpace(hospitalInfo.Website)
	if website != "" {
		if strings.HasPrefix(strings.ToLower(website), "http://") || strings.HasPrefix(strings.ToLower(website), "https://") {
			return strings.TrimRight(website, "/")
		}
		return "https://" + strings.Trim(strings.TrimRight(website, "/"), "/")
	}

	serverPort := strings.TrimSpace(config.Load().ServerPort)
	if serverPort == "" {
		serverPort = "8080"
	}
	return "http://localhost:" + serverPort
}

func resolveTTEPrintSignatureName(signature *ttePrintSignatureInfo, fallback string) string {
	if signature == nil {
		return fallback
	}
	return firstNonEmpty(strings.TrimSpace(signature.SignerName), fallback)
}

func resolveTTEPrintSignatureTime(signature *ttePrintSignatureInfo, fallback time.Time) time.Time {
	if signature != nil && signature.SignedAt != nil && !signature.SignedAt.IsZero() {
		return *signature.SignedAt
	}
	return fallback
}

func hasTTEQRCode(signature *ttePrintSignatureInfo) bool {
	return signature != nil && strings.TrimSpace(signature.ValidationURL) != ""
}

func resolveTTESignatureQRCodeSize(width float64) float64 {
	qrSize := minFloat64(26.0, width-4)
	if qrSize < 18 {
		qrSize = 18
	}
	return qrSize
}

func resolveTTESignatureAnnotationReservedHeight(width float64, signature *ttePrintSignatureInfo) float64 {
	if hasTTEQRCode(signature) {
		return resolveTTESignatureQRCodeSize(width)
	}
	return 6.7
}

func drawTTESignatureAnnotation(pdf *gofpdf.Fpdf, x float64, y float64, width float64, signature *ttePrintSignatureInfo) {
	if signature == nil {
		return
	}

	qrFilePath, err := createTTESignatureQRCodeFile(signature)
	if err != nil {
		annotationText := "Ditandatangani secara elektronik"
		detailText := "TTE Internal SIMKLINIK"
		if signature.SignedAt != nil && !signature.SignedAt.IsZero() {
			detailText = formatDateTimeIndonesian(*signature.SignedAt)
		}

		pdf.SetFont("Arial", "", 7.2)
		pdf.SetTextColor(24, 104, 74)
		pdf.SetXY(x+1, y)
		pdf.CellFormat(width-2, 3.3, annotationText, "", 0, "C", false, 0, "")
		pdf.SetFont("Arial", "", 6.8)
		pdf.SetTextColor(90, 90, 90)
		pdf.SetXY(x+1, y+3.7)
		pdf.CellFormat(width-2, 3.0, detailText, "", 0, "C", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
		return
	}
	defer os.Remove(qrFilePath)

	qrSize := resolveTTESignatureQRCodeSize(width)
	qrX := x + ((width - qrSize) / 2)
	pdf.ImageOptions(qrFilePath, qrX, y, qrSize, qrSize, false, gofpdf.ImageOptions{ImageType: "PNG"}, 0, "")
}

func createTTESignatureQRCodeFile(signature *ttePrintSignatureInfo) (string, error) {
	if signature == nil || strings.TrimSpace(signature.ValidationURL) == "" {
		return "", os.ErrInvalid
	}

	qrCode, err := barcodeqr.Encode(signature.ValidationURL, barcodeqr.H, barcodeqr.Auto)
	if err != nil {
		return "", err
	}

	scaledQRCode, err := barcode.Scale(qrCode, 560, 560)
	if err != nil {
		return "", err
	}

	canvas := image.NewRGBA(scaledQRCode.Bounds())
	draw.Draw(canvas, canvas.Bounds(), scaledQRCode, image.Point{}, draw.Src)
	applyTTESignatureLogoOverlay(canvas)

	tempFile, err := os.CreateTemp("", "tte-qrcode-*.png")
	if err != nil {
		return "", err
	}
	defer tempFile.Close()

	if err := png.Encode(tempFile, canvas); err != nil {
		_ = os.Remove(tempFile.Name())
		return "", err
	}

	return tempFile.Name(), nil
}

func applyTTESignatureLogoOverlay(dst *image.RGBA) {
	hospitalInfo := getInitialAssessmentHospitalInfo()
	logoPath := strings.TrimSpace(hospitalInfo.LogoPath)
	if logoPath == "" {
		return
	}

	logoFile, err := os.Open(filepath.Clean(logoPath))
	if err != nil {
		return
	}
	defer logoFile.Close()

	logoImage, _, err := image.Decode(logoFile)
	if err != nil {
		return
	}

	logoImage = cropTTESignatureLogoImage(logoImage)

	bounds := dst.Bounds()
	badgeDiameter := bounds.Dx() / 3
	if badgeDiameter < 96 {
		badgeDiameter = 96
	}
	if badgeDiameter > 124 {
		badgeDiameter = 124
	}
	logoBoxSize := int(float64(badgeDiameter) * 0.8)

	resizedLogo, logoWidth, logoHeight := resizeTTESignatureImageToFit(logoImage, float64(logoBoxSize), float64(logoBoxSize))
	centerX := bounds.Min.X + (bounds.Dx() / 2)
	centerY := bounds.Min.Y + (bounds.Dy() / 2)
	drawTTESignatureCircularBadge(dst, centerX, centerY, badgeDiameter/2)
	logoRect := image.Rect(centerX-(logoWidth/2), centerY-(logoHeight/2), centerX+(logoWidth/2), centerY+(logoHeight/2))
	draw.Draw(dst, logoRect, resizedLogo, resizedLogo.Bounds().Min, draw.Over)
}

func drawTTESignatureCircularBadge(dst *image.RGBA, centerX int, centerY int, radius int) {
	if radius <= 0 {
		return
	}
	innerRadiusSquared := radius * radius
	outerRadius := radius + 2
	outerRadiusSquared := outerRadius * outerRadius

	for y := centerY - outerRadius; y <= centerY+outerRadius; y++ {
		for x := centerX - outerRadius; x <= centerX+outerRadius; x++ {
			if !image.Pt(x, y).In(dst.Bounds()) {
				continue
			}
			dx := x - centerX
			dy := y - centerY
			distanceSquared := (dx * dx) + (dy * dy)
			switch {
			case distanceSquared <= innerRadiusSquared:
				dst.Set(x, y, color.White)
			case distanceSquared <= outerRadiusSquared:
				dst.Set(x, y, color.RGBA{R: 227, G: 232, B: 239, A: 255})
			}
		}
	}
}

func cropTTESignatureLogoImage(src image.Image) image.Image {
	bounds := src.Bounds()
	minX := bounds.Max.X
	minY := bounds.Max.Y
	maxX := bounds.Min.X
	maxY := bounds.Min.Y
	found := false

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := src.At(x, y).RGBA()
			if a <= 0x0800 {
				continue
			}
			if r >= 0xF000 && g >= 0xF000 && b >= 0xF000 {
				continue
			}
			if x < minX {
				minX = x
			}
			if y < minY {
				minY = y
			}
			if x > maxX {
				maxX = x
			}
			if y > maxY {
				maxY = y
			}
			found = true
		}
	}

	if !found {
		return src
	}

	croppedBounds := image.Rect(0, 0, (maxX-minX)+1, (maxY-minY)+1)
	cropped := image.NewRGBA(croppedBounds)
	draw.Draw(cropped, croppedBounds, src, image.Point{X: minX, Y: minY}, draw.Src)
	return cropped
}

func resizeTTESignatureImageToFit(src image.Image, maxWidth float64, maxHeight float64) (*image.RGBA, int, int) {
	srcBounds := src.Bounds()
	if srcBounds.Dx() == 0 || srcBounds.Dy() == 0 {
		return image.NewRGBA(image.Rect(0, 0, 1, 1)), 1, 1
	}

	widthRatio := maxWidth / float64(srcBounds.Dx())
	heightRatio := maxHeight / float64(srcBounds.Dy())
	scale := minFloat64(widthRatio, heightRatio)
	if scale <= 0 {
		scale = 1
	}
	targetWidth := maxInt(1, int(float64(srcBounds.Dx())*scale))
	targetHeight := maxInt(1, int(float64(srcBounds.Dy())*scale))
	dst := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))

	for y := 0; y < dst.Bounds().Dy(); y++ {
		srcY := srcBounds.Min.Y + (y*srcBounds.Dy())/dst.Bounds().Dy()
		for x := 0; x < dst.Bounds().Dx(); x++ {
			srcX := srcBounds.Min.X + (x*srcBounds.Dx())/dst.Bounds().Dx()
			dst.Set(x, y, src.At(srcX, srcY))
		}
	}

	return dst, targetWidth, targetHeight
}
