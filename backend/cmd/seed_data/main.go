package main

import (
	"log"
	"starter/backend/config"
	"starter/backend/database"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")
	_ = godotenv.Load("../../.env")

	cfg := config.Load()
	if err := database.Connect(cfg.DatabaseDSN); err != nil {
		log.Fatalf("Gagal terhubung ke database: %v", err)
	}

	log.Println("Menjalankan migrasi dan seeder...")
	if err := database.Migrate(); err != nil {
		log.Fatalf("Gagal menjalankan migrasi/seeder: %v", err)
	}

	log.Println("Data dummy obat dan supplier berhasil di-seed!")
}
