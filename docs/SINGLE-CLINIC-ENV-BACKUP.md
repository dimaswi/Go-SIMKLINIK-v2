# Single-Clinic ENV And Backup Guide

Panduan ini diasumsikan untuk model deployment `1 klinik = 1 VPS`.

## ENV Layout

Gunakan pemisahan file berikut agar konfigurasi tidak tercampur:

- `/.env`
  Digunakan oleh `docker-compose` saat deploy di VPS.
- `/backend/.env`
  Digunakan saat menjalankan backend langsung dengan `go run main.go`.
- `/frontend/.env.local`
  Digunakan saat menjalankan frontend dengan `npm run dev`.

## ENV Minimal Per Klinik

Paling tidak, setiap klinik harus punya nilai berbeda untuk:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- domain frontend pada `CORS_ALLOWED_ORIGINS`
- branding dan credential integrasi yang disimpan di aplikasi

## Rekomendasi Produksi

- Jangan commit file `.env` asli ke repository.
- Simpan salinan `.env` di password manager atau secret vault.
- Untuk satu klinik satu VPS, gunakan nama database dan secret yang unik per klinik.
- Mount volume uploads agar file hasil upload tidak hilang saat container backend diganti.

## Yang Wajib Dibackup

Untuk aplikasi ini, backup minimal harus mencakup tiga komponen:

1. PostgreSQL database
2. Folder uploads backend
3. File konfigurasi deployment

Checklist konkret:

- dump PostgreSQL harian
- arsip folder `uploads`
- salin file `docker-compose.yml`
- salin file `/.env`
- salin konfigurasi reverse proxy seperti nginx/caddy bila dipakai

## Strategi Backup Yang Disarankan

Target sederhana dan realistis:

- backup database setiap hari jam 02:00
- backup uploads setiap hari jam 02:15
- simpan retensi `7` backup harian, `4` backup mingguan, `3` backup bulanan
- kirim salinan ke storage terpisah dari VPS utama

Jangan hanya menyimpan backup di disk VPS yang sama.

## Contoh Backup Database Dengan Docker

```bash
mkdir -p /opt/backups/simklinik

docker exec simklinik-database \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "/opt/backups/simklinik/db-$(date +%F-%H%M).dump"
```

## Contoh Backup Uploads

```bash
mkdir -p /opt/backups/simklinik

tar -czf "/opt/backups/simklinik/uploads-$(date +%F-%H%M).tar.gz" \
  -C /opt/simklinik uploads
```

Sesuaikan path `/opt/simklinik` dengan lokasi project di VPS Anda.

## Contoh Cron Harian

```cron
0 2 * * * docker exec simklinik-database pg_dump -U simklinik -d simklinik -Fc > /opt/backups/simklinik/db-$(date +\%F-\%H\%M).dump
15 2 * * * tar -czf /opt/backups/simklinik/uploads-$(date +\%F-\%H\%M).tar.gz -C /opt/simklinik uploads
```

Jika memakai Docker volume untuk uploads, backup bisa dilakukan dari path volume Docker atau dengan helper container.

## Restore Drill

Backup tanpa restore test itu belum bisa dipercaya. Minimal sebulan sekali lakukan uji restore:

1. restore dump database ke instance PostgreSQL terpisah
2. ekstrak backup uploads
3. jalankan aplikasi di environment uji
4. cek login, data pasien, invoice, dan file upload

## Prioritas Operasional

Urutan prioritas paling aman:

1. amankan `.env` dan secret
2. pastikan volume database dan uploads persisten
3. aktifkan backup otomatis
4. kirim backup ke lokasi offsite
5. lakukan restore test berkala