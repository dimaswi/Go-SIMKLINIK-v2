package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
)

type termsConditionArticle struct {
	Title   string
	Summary string
	Clauses []string
}

var termsConditionArticles = []termsConditionArticle{
	{
		Title:   "Akses Dan Tanggung Jawab Akun",
		Summary: "Setiap penggunaan akun dalam SIMKLINIK harus sesuai role, permission, dan kewenangan kerja yang sah di lingkungan klinik.",
		Clauses: []string{
			"Setiap user wajib menggunakan akun pribadi dan dilarang membagikan username, password, atau sesi login kepada pihak lain.",
			"Hak akses mengikuti role dan permission yang ditetapkan administrator, sehingga pengguna tidak diperkenankan mencoba melewati pembatasan menu, endpoint, atau data yang bukan kewenangannya.",
			"Seluruh aktivitas yang tercatat melalui akun pengguna menjadi tanggung jawab pemilik akun sepanjang sesi masih aktif atau belum diamankan dengan logout yang semestinya.",
			"Perubahan data master, settings, branding, dan pengelolaan akses hanya boleh dilakukan oleh personel yang mendapat mandat resmi dari pengelola fasilitas kesehatan.",
		},
	},
	{
		Title:   "Data Pasien Dan Rekam Medis",
		Summary: "Data klinis, identitas pasien, serta dokumen penunjang wajib dicatat secara akurat, lengkap, dan menjaga kerahasiaan medis.",
		Clauses: []string{
			"Data pasien, diagnosis, tindakan, resep, hasil penunjang, dan persetujuan tindakan wajib diinput sesuai kondisi pelayanan yang sebenarnya.",
			"Pengguna dilarang mengakses, menyalin, memindahkan, atau menyebarkan data pasien di luar kebutuhan operasional dan kewenangan profesinya.",
			"Kesalahan input yang berdampak klinis, administratif, atau finansial harus segera diperbaiki mengikuti prosedur internal agar jejak data tetap dapat ditelusuri.",
			"Dokumen cetak, PDF, hasil ekspor, dan lampiran yang dihasilkan sistem tetap dianggap bagian dari catatan layanan dan harus dijaga kerahasiaannya.",
		},
	},
	{
		Title:   "Penggunaan Fitur Operasional",
		Summary: "Registrasi, EMR, farmasi, laboratorium, radiologi, dan kasir wajib digunakan mengikuti workflow resmi yang tersedia di sistem.",
		Clauses: []string{
			"Nomor antrian, visit, order layanan, resep, serta transaksi billing harus dibuat melalui alur resmi aplikasi agar status pelayanan tetap sinkron antar unit.",
			"Pengguna tidak diperkenankan memanipulasi status layanan hanya untuk mempercepat proses administratif apabila kondisi riil pelayanan belum sesuai.",
			"Dokter, apoteker, analis, radiografer, dan petugas kasir wajib memastikan data yang disimpan sudah final sebelum dokumen dicetak, layanan dilanjutkan, atau visit dinyatakan selesai.",
			"Setiap penggunaan fitur yang memengaruhi stok, invoice, hasil layanan, atau penyelesaian kunjungan harus mengikuti validasi sistem yang tersedia.",
		},
	},
	{
		Title:   "Backup, Audit, Dan Keamanan Sistem",
		Summary: "Penggunaan aplikasi tunduk pada disiplin backup, pemantauan audit operasional, dan pengamanan perangkat serta lingkungan server.",
		Clauses: []string{
			"Administrator wajib memantau hasil backup, kapasitas penyimpanan, dan retensi file backup secara berkala melalui fitur monitoring yang tersedia.",
			"Perubahan settings penting, unggah aset, aktivitas sinkronisasi, dan transaksi operasional dapat menjadi bagian dari jejak audit penggunaan sistem.",
			"Pengguna wajib menjaga keamanan perangkat, browser, dan jaringan yang digunakan untuk mengakses aplikasi guna mencegah kebocoran data atau penyalahgunaan akses.",
			"Jika ditemukan insiden keamanan, kehilangan data, atau akses tidak sah, tim operasional wajib segera melakukan mitigasi sesuai prosedur internal klinik.",
		},
	},
	{
		Title:   "Integrasi Eksternal Dan Sinkronisasi",
		Summary: "Integrasi eksternal seperti SATUSEHAT hanya boleh dipakai dengan kredensial resmi dan data yang telah diverifikasi oleh klinik.",
		Clauses: []string{
			"Setiap credential integrasi, base URL, organization ID, client ID, client secret, dan parameter teknis lain harus dikelola oleh personel yang berwenang.",
			"Preview dan sinkronisasi resource hanya boleh dijalankan terhadap data yang sudah lolos verifikasi internal agar tidak menimbulkan duplikasi atau penolakan dari sistem mitra.",
			"Kegagalan sinkronisasi, retry, dan status log integrasi harus ditinjau terlebih dahulu sebelum data dianggap berhasil terkirim ke pihak eksternal.",
			"Roadmap atau modul integrasi yang belum aktif tidak boleh diperlakukan sebagai fitur produksi sampai benar-benar tersedia pada versi berjalan.",
		},
	},
	{
		Title:   "Batasan Layanan Dan Perubahan Ketentuan",
		Summary: "Ketentuan ini mengikat penggunaan aplikasi internal dan dapat diperbarui mengikuti perubahan proses bisnis, regulasi, atau kapabilitas sistem.",
		Clauses: []string{
			"SIMKLINIK disediakan untuk mendukung operasional klinik dan tidak menggantikan pertimbangan profesional medis, administratif, ataupun hukum.",
			"Keputusan layanan kepada pasien tetap berada pada tenaga profesional dan penanggung jawab fasilitas kesehatan.",
			"Tim pengelola sistem berhak memperbarui Terms & Conditions apabila terdapat perubahan modul, kebijakan keamanan, proses operasional, atau integrasi eksternal.",
			"Dengan tetap menggunakan aplikasi setelah ketentuan diperbarui, setiap pengguna dianggap telah memahami dan menerima versi terbaru dokumen ini.",
		},
	},
}

func PrintTermsAndConditionsPDF(c *gin.Context) {
	hospitalInfo := getInitialAssessmentHospitalInfo()
	pdfBytes, fileName, err := renderTermsAndConditionsPDF(hospitalInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat PDF Terms & Conditions"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", fileName))
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func renderTermsAndConditionsPDF(hospitalInfo initialAssessmentHospitalInfo) ([]byte, string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	defer clearInitialAssessmentPDFPageContentStartOverrides(pdf)
	pdf.SetMargins(initialAssessmentPDFMarginLeft, initialAssessmentPDFMarginTop, initialAssessmentPDFMarginRight)
	pdf.SetAutoPageBreak(true, initialAssessmentPDFMarginBottom)
	pdf.AliasNbPages("")
	pdf.SetTitle("Terms & Conditions", false)
	pdf.SetCreator("SIMKLINIK", false)
	pdf.SetHeaderFuncMode(func() {
		addInitialAssessmentPDFHeader(pdf, hospitalInfo, "TERMS & CONDITIONS", "Policy V1")
	}, true)
	pdf.SetFooterFunc(func() {
		pdf.SetY(-8)
		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(90, 90, 90)
		pdf.CellFormat(95, 4, "Dokumen ketentuan penggunaan internal SIMKLINIK", "", 0, "L", false, 0, "")
		pdf.CellFormat(0, 4, fmt.Sprintf("Halaman %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AddPage()
	pdf.SetY(initialAssessmentPDFPageContentStartForPDF(pdf, pdf.PageNo()))

	addTermsDocumentIntro(pdf)

	for index, article := range termsConditionArticles {
		addTermsArticle(pdf, index+1, article)
	}

	addTermsClosing(pdf)

	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		return nil, "", err
	}

	fileName := fmt.Sprintf("terms-and-conditions-%s.pdf", sanitizePDFFileName(fallbackText(hospitalInfo.Name)))
	return output.Bytes(), fileName, nil
}

func addTermsDocumentIntro(pdf *gofpdf.Fpdf) {
	addInitialAssessmentSectionTitle(pdf, "PERNYATAAN UMUM")
	addInitialAssessmentFullWidthRow(pdf, "Dokumen ini merupakan ketentuan penggunaan resmi untuk seluruh user internal yang mengakses dan mengoperasikan SIMKLINIK dalam kegiatan pelayanan, administrasi, penunjang medis, dan pengelolaan sistem.", false)
	addInitialAssessmentFullWidthRow(pdf, "Dengan menggunakan aplikasi, setiap pengguna dianggap memahami bahwa seluruh input data, perubahan status layanan, penggunaan fitur cetak, proses sinkronisasi, dan aktivitas administrasi digital wajib mengikuti SOP internal klinik, kewenangan jabatan, serta prinsip kerahasiaan data pasien.", false)
	pdf.SetY(pdf.GetY() + 2)
	addInitialAssessmentFieldSection(pdf, "IDENTITAS DOKUMEN", []initialAssessmentPrintField{
		{Label: "Nama Dokumen", Value: "Terms & Conditions"},
		{Label: "Versi", Value: "Policy V1"},
		{Label: "Tanggal Berlaku", Value: "12 Apr 2026"},
		{Label: "Status", Value: "Aktif"},
	}, "-")
}

func addTermsArticle(pdf *gofpdf.Fpdf, articleNumber int, article termsConditionArticle) {
	ensureInitialAssessmentPDFSpace(pdf, 26)
	addInitialAssessmentSectionTitle(pdf, fmt.Sprintf("PASAL %d - %s", articleNumber, strings.ToUpper(article.Title)))
	addInitialAssessmentFullWidthRow(pdf, article.Summary, false)

	left, _, right, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	contentWidth := pageWidth - left - right
	lineHeight := 5.2
	textWidth := contentWidth - 8

	for index, clause := range article.Clauses {
		clauseText := fmt.Sprintf("(%d) %s", index+1, sanitizePDFText(clause))
		lines := pdf.SplitLines([]byte(clauseText), textWidth)
		neededHeight := maxFloat64(6, float64(len(lines))*lineHeight+1)
		ensureInitialAssessmentPDFSpace(pdf, neededHeight)
		pdf.SetX(left)
		pdf.SetFont("Arial", "", 10)
		pdf.MultiCell(contentWidth, lineHeight, clauseText, "", "J", false)
		pdf.SetY(pdf.GetY() + 0.8)
	}

	pdf.SetY(pdf.GetY() + 1.5)
}

func addTermsClosing(pdf *gofpdf.Fpdf) {
	addInitialAssessmentSectionTitle(pdf, "PENUTUP")
	addInitialAssessmentFullWidthRow(pdf, "Dokumen ini menjadi acuan minimum penggunaan sistem pada versi aktif dan tetap dapat ditinjau ulang oleh pengelola aplikasi apabila terjadi perubahan regulasi, penyesuaian proses bisnis, pengembangan modul, atau kebutuhan penguatan keamanan informasi.", false)
	addInitialAssessmentFullWidthRow(pdf, "Setiap pengguna wajib mematuhi ketentuan ini selama tetap menggunakan SIMKLINIK sebagai sistem operasional klinik.", false)
}
