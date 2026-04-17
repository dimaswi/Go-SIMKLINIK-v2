# VPS Docker Deploy Without Source Code

Panduan ini dipakai jika image backend dan frontend sudah Anda build sendiri lalu di-push ke Docker Hub atau registry lain. Client atau VPS tidak perlu menerima source code aplikasi.

## Yang Saya Cek Dari Repo Saat Ini

Konfigurasi env saat ini memang berasal dari kode yang ada sekarang, bukan asumsi:

- Backend membaca env dari `backend/config/config.go`.
- Backend lokal saat ini masih punya `backend/.env` dengan format lama `DATABASE_DSN`, dan ini tetap didukung.
- Template backend yang lebih rapi sudah ada di `backend/.env.example` memakai `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`, `DATABASE_SSLMODE`, dan `DATABASE_TIMEZONE`.
- Frontend membaca `VITE_API_URL` di `frontend/src/lib/api.ts`.
- Untuk image release, frontend harus dibuild dengan `VITE_API_URL=/api` supaya browser mengakses API lewat nginx container, bukan `http://localhost:8080/api`.

## File Yang Dibutuhkan Di VPS

Siapkan file berikut di server:

- `docker-compose.release.yml`
- `.env`

File `.env` bisa dibuat dari `.env.release.example`.

Perlu dibedakan:

- `.env` di VPS adalah runtime env untuk `docker compose`
- `VITE_API_URL` adalah build-time env untuk image frontend saat Anda build image di sisi Anda

## Isi `.env` Minimal

Yang wajib Anda isi di VPS:

- `BACKEND_IMAGE`
- `FRONTEND_IMAGE`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `JWT_SECRET`
- `FRONTEND_PORT`
- `CORS_ALLOWED_ORIGINS`

## Port Yang Biasanya Diubah

Yang biasa Anda ganti hanya:

- `FRONTEND_PORT`

Ini adalah port yang dibuka ke browser user dari luar VPS.

Contoh:

- `FRONTEND_PORT=3000` berarti aplikasi dibuka lewat `http://IP-VPS:3000`
- `FRONTEND_PORT=8088` berarti aplikasi dibuka lewat `http://IP-VPS:8088`

`BACKEND_PORT` juga bisa diganti, tetapi biasanya tidak perlu karena backend di compose release dibind ke `127.0.0.1:${BACKEND_PORT}` dan tidak diekspos publik langsung.

Contoh kapan `BACKEND_PORT` perlu diganti:

- port `8080` di VPS sudah dipakai service lain
- Anda punya reverse proxy lokal yang memang mengarah ke backend port tertentu

Yang sengaja tidak dimasukkan ke runtime env VPS:

- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`

Nilai-nilai itu sudah dirakit oleh `docker-compose.release.yml` dari `POSTGRES_*` dan nama service internal Docker.

- `VITE_API_URL`

Ini bukan runtime env VPS. Nilai ini harus dipakai saat build image frontend.

## Build Image Yang Benar Sebelum Push Ke Docker Hub

Frontend image release harus dibuild dengan `VITE_API_URL=/api`.

Contoh:

```powershell
docker build -t yourdockerhub/simklinik-backend:1.0.0 ./backend
docker build --build-arg VITE_API_URL=/api -t yourdockerhub/simklinik-frontend:1.0.0 ./frontend
docker push yourdockerhub/simklinik-backend:1.0.0
docker push yourdockerhub/simklinik-frontend:1.0.0
```

Kalau frontend dibuild tanpa `VITE_API_URL=/api`, hasil build sekarang akan fallback ke `http://localhost:8080/api` karena itu default di kode frontend.

Contoh:

```env
BACKEND_IMAGE=docker.io/yourdockerhub/simklinik-backend:1.0.0
FRONTEND_IMAGE=docker.io/yourdockerhub/simklinik-frontend:1.0.0

POSTGRES_USER=simklinik
POSTGRES_PASSWORD=ganti-password-kuat
POSTGRES_DB=simklinik
JWT_SECRET=ganti-random-secret-yang-panjang

BACKEND_PORT=8080
FRONTEND_PORT=3000

DATABASE_SSLMODE=disable
DATABASE_TIMEZONE=Asia/Jakarta
CORS_ALLOWED_ORIGINS=https://domain-klinik-anda.com

BACKUP_DEFAULT_CRON=0 2 * * *
BACKUP_DEFAULT_RETENTION_DAYS=7
BACKUP_DEFAULT_INCLUDE_UPLOADS=true
```

## Langkah Uji Di VPS

1. Install Docker Engine dan Docker Compose plugin.
2. Login ke Docker Hub jika image Anda private.
3. Upload `docker-compose.release.yml` dan `.env` ke VPS.
4. Jalankan pull image:

```powershell
docker compose -f docker-compose.release.yml --env-file .env pull
```

5. Jalankan container:

```powershell
docker compose -f docker-compose.release.yml --env-file .env up -d
```

6. Cek status:

```powershell
docker compose -f docker-compose.release.yml --env-file .env ps
```

7. Cek log bila ada masalah:

```powershell
docker compose -f docker-compose.release.yml --env-file .env logs -f simklinik-backend
docker compose -f docker-compose.release.yml --env-file .env logs -f simklinik-frontend
```

## Akses Setelah Naik

- Frontend: `http://IP-VPS:FRONTEND_PORT`
- Backend host port hanya dibind ke `127.0.0.1`, jadi tidak terbuka ke publik secara langsung.

Ini sengaja supaya browser client lewat frontend saja, dan API backend tidak langsung diekspos keluar.

## Update Versi Image

Untuk menghindari salah istilah:

- dari source code Anda ke Docker Hub: `push`
- dari Docker Hub ke VPS: `pull`

Jadi jika Anda mengubah sistem di repo ini, langkah yang benar adalah:

1. build image baru
2. push image baru ke Docker Hub
3. login ke VPS
4. pull image baru dari Docker Hub
5. jalankan ulang stack

Jika Anda push image baru:

1. ganti tag image di `.env`
2. pull image baru
3. restart stack

Perintahnya:

```powershell
docker compose -f docker-compose.release.yml --env-file .env pull
docker compose -f docker-compose.release.yml --env-file .env up -d
```

Contoh jika update dari `1.0.0` ke `1.0.1`:

```env
BACKEND_IMAGE=docker.io/dimasw347/simklinik-backend:1.0.1
FRONTEND_IMAGE=docker.io/dimasw347/simklinik-frontend:1.0.1
```

Lalu jalankan lagi:

```powershell
docker compose -f docker-compose.release.yml --env-file .env pull
docker compose -f docker-compose.release.yml --env-file .env up -d
docker compose -f docker-compose.release.yml --env-file .env ps
```

Volume database, uploads, dan backups tetap dipakai, jadi data tidak hilang hanya karena image aplikasi diganti.

## Jika Update Dilakukan Oleh Kita

Kalau yang melakukan update adalah Anda sebagai vendor, bukan client, maka alurnya seperti ini:

1. build dan push image versi baru ke Docker Hub
2. login ke VPS client via SSH
3. ubah `BACKEND_IMAGE` dan `FRONTEND_IMAGE` di `.env` VPS ke tag baru
4. jalankan `pull` lalu `up -d`
5. cek `ps`, log backend, dan uji login atau menu penting

Contoh alur dari sisi vendor:

```powershell
.\scripts\build-and-push-release.ps1 -DockerHubUser dimasw347 -VersionTag 1.0.1
```

Lalu di VPS client:

```env
BACKEND_IMAGE=docker.io/dimasw347/simklinik-backend:1.0.1
FRONTEND_IMAGE=docker.io/dimasw347/simklinik-frontend:1.0.1
```

Setelah itu jalankan:

```powershell
docker compose -f docker-compose.release.yml --env-file .env pull
docker compose -f docker-compose.release.yml --env-file .env up -d
docker compose -f docker-compose.release.yml --env-file .env ps
```

Dengan model ini client tidak perlu build source code. Client juga tidak perlu melakukan apa-apa jika VPS tetap dikelola oleh Anda dan Anda yang mengerjakan update lewat SSH.

## Langkah Aman Sebelum Update

Sebelum update production, minimal lakukan ini:

1. backup database
2. catat tag image lama yang sedang dipakai
3. pull image baru dulu sebelum restart stack
4. setelah update, cek `ps` dan log backend

Contoh backup database manual dari VPS:

```powershell
docker exec simklinik-database pg_dump -U simklinik -d simklinik > simklinik-backup-before-update.sql
```

Jika username atau database Anda berbeda, sesuaikan dengan nilai `POSTGRES_USER` dan `POSTGRES_DB` di `.env`.

## Rollback Jika Update Bermasalah

Kalau versi baru bermasalah, rollback paling sederhana adalah kembali ke tag image sebelumnya.

Contoh:

```env
BACKEND_IMAGE=docker.io/dimasw347/simklinik-backend:1.0.0
FRONTEND_IMAGE=docker.io/dimasw347/simklinik-frontend:1.0.0
```

Lalu jalankan:

```powershell
docker compose -f docker-compose.release.yml --env-file .env pull
docker compose -f docker-compose.release.yml --env-file .env up -d
```

Kalau masalahnya hanya di frontend, Anda cukup rollback `FRONTEND_IMAGE`. Kalau masalahnya hanya di backend, cukup rollback `BACKEND_IMAGE`.

## Backup Data Penting

Data berikut tidak ikut hilang saat container diganti karena disimpan di volume Docker:

- database PostgreSQL
- uploads
- backups

Volume yang dipakai:

- `simklinik_postgres_data`
- `simklinik_uploads`
- `simklinik_backups`

## Catatan Penting

- VPS tidak perlu source code jika image sudah tersedia di registry.
- Frontend tetap berupa hasil build JavaScript, jadi bukan source TypeScript asli.
- Logic sensitif tetap sebaiknya ditempatkan di backend.
- Jika ingin domain production, pasang reverse proxy nginx atau caddy di depan port frontend.