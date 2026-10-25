package main

import (
	"bufio"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"starter/backend/config"
	"starter/backend/database"
	"starter/backend/models"

	"github.com/joho/godotenv"
	"gorm.io/gorm/clause"
)

const sqlSourceURL = "https://raw.githubusercontent.com/cahyadsn/wilayah/master/db/wilayah.sql"

func main() {
	startTime := time.Now()
	log.Println("=== Memulai Seeder Wilayah Indonesia (Opsi A: Seluruh Indonesia) ===")

	// 1. Load .env
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")
	_ = godotenv.Load("../../.env")

	cfg := config.Load()
	if err := database.Connect(cfg.DatabaseDSN); err != nil {
		log.Fatalf("Gagal terhubung ke database: %v", err)
	}

	// 2. Unduh dataset wilayah.sql dari repository resmi
	log.Printf("Mengunduh data wilayah dari %s ...\n", sqlSourceURL)
	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Get(sqlSourceURL)
	if err != nil {
		log.Fatalf("Gagal mengunduh file wilayah.sql: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Fatalf("Gagal mengunduh file wilayah.sql, status: %d", resp.StatusCode)
	}

	// 3. Parsing baris per baris
	log.Println("Mengurai data wilayah (Provinsi, Kabupaten/Kota, Kecamatan, Kelurahan)...")
	scanner := bufio.NewScanner(resp.Body)
	// Buffer besar untuk baris SQL panjang jika ada
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)

	lineRegex := regexp.MustCompile(`\('([0-9\.]+)',\s*'([^']+)'\)`)

	provinceMap := make(map[int64]models.Province)
	regencyMap := make(map[int64]models.Regency)
	districtMap := make(map[int64]models.District)
	villageMap := make(map[int64]models.Village)

	var (
		provinces []models.Province
		regencies []models.Regency
		districts []models.District
		villages  []models.Village
	)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "('") {
			continue
		}

		matches := lineRegex.FindAllStringSubmatch(line, -1)
		for _, match := range matches {
			if len(match) < 3 {
				continue
			}
			rawCode := match[1]
			name := strings.TrimSpace(match[2])
			parts := strings.Split(rawCode, ".")

			switch len(parts) {
			case 1:
				// Level 1: Provinsi (contoh: 11)
				id, err := strconv.ParseInt(parts[0], 10, 64)
				if err == nil && id > 0 {
					if _, exists := provinceMap[id]; !exists {
						p := models.Province{ID: id, Name: name}
						provinceMap[id] = p
						provinces = append(provinces, p)
					}
				}
			case 2:
				// Level 2: Kabupaten / Kota (contoh: 11.01 -> 1101, province_id: 11)
				id, err := strconv.ParseInt(parts[0]+parts[1], 10, 64)
				provID, errP := strconv.ParseInt(parts[0], 10, 64)
				if err == nil && errP == nil && id > 0 {
					if _, exists := regencyMap[id]; !exists {
						r := models.Regency{ID: id, ProvinceID: provID, Name: name}
						regencyMap[id] = r
						regencies = append(regencies, r)
					}
				}
			case 3:
				// Level 3: Kecamatan (contoh: 11.01.01 -> 110101, regency_id: 1101)
				id, err := strconv.ParseInt(parts[0]+parts[1]+parts[2], 10, 64)
				regID, errR := strconv.ParseInt(parts[0]+parts[1], 10, 64)
				if err == nil && errR == nil && id > 0 {
					if _, exists := districtMap[id]; !exists {
						d := models.District{ID: id, RegencyID: regID, Name: name}
						districtMap[id] = d
						districts = append(districts, d)
					}
				}
			case 4:
				// Level 4: Kelurahan / Desa (contoh: 11.01.01.2001 -> 1101012001, district_id: 110101)
				id, err := strconv.ParseInt(parts[0]+parts[1]+parts[2]+parts[3], 10, 64)
				distID, errD := strconv.ParseInt(parts[0]+parts[1]+parts[2], 10, 64)
				if err == nil && errD == nil && id > 0 {
					if _, exists := villageMap[id]; !exists {
						v := models.Village{ID: id, DistrictID: distID, Name: name}
						villageMap[id] = v
						villages = append(villages, v)
					}
				}
			}
		}
	}

	if err := scanner.Err(); err != nil {
		log.Fatalf("Terjadi error saat membaca data wilayah: %v", err)
	}

	log.Printf("Data terurai: %d Provinsi, %d Kabupaten/Kota, %d Kecamatan, %d Kelurahan/Desa\n",
		len(provinces), len(regencies), len(districts), len(villages))

	if len(provinces) == 0 {
		log.Fatal("Tidak ada data provinsi yang ditemukan. Proses dihentikan.")
	}

	// 4. Insert ke database secara berurutan sesuai relasi foreign key
	log.Println("Menyimpan Provinsi ke database...")
	if err := database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"name"}),
	}).CreateInBatches(provinces, 100).Error; err != nil {
		log.Fatalf("Gagal insert provinsi: %v", err)
	}
	log.Printf("✓ %d Provinsi berhasil disimpan.\n", len(provinces))

	log.Println("Menyimpan Kabupaten/Kota ke database...")
	if err := database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"province_id", "name"}),
	}).CreateInBatches(regencies, 500).Error; err != nil {
		log.Fatalf("Gagal insert kabupaten/kota: %v", err)
	}
	log.Printf("✓ %d Kabupaten/Kota berhasil disimpan.\n", len(regencies))

	log.Println("Menyimpan Kecamatan ke database...")
	if err := database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"regency_id", "name"}),
	}).CreateInBatches(districts, 1000).Error; err != nil {
		log.Fatalf("Gagal insert kecamatan: %v", err)
	}
	log.Printf("✓ %d Kecamatan berhasil disimpan.\n", len(districts))

	log.Println("Menyimpan Kelurahan/Desa ke database (80.000+ data, mohon tunggu sebentar)...")
	if err := database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"district_id", "name"}),
	}).CreateInBatches(villages, 2000).Error; err != nil {
		log.Fatalf("Gagal insert kelurahan/desa: %v", err)
	}
	log.Printf("✓ %d Kelurahan/Desa berhasil disimpan.\n", len(villages))

	elapsed := time.Since(startTime)
	fmt.Printf("\n🎉 SUKSES! Seluruh data wilayah Indonesia telah berhasil diseed dalam waktu %v.\n", elapsed.Round(time.Millisecond))
	os.Exit(0)
}
