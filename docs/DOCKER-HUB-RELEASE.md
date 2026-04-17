# Docker Hub Release Flow

Panduan ini untuk Anda sebagai vendor atau pemilik sistem yang akan build image sendiri lalu mendistribusikan aplikasi ke VPS client tanpa mengirim source code.

## Arah Alur Yang Benar

Istilah yang benar untuk alur rilis ini adalah:

1. source code Anda diubah di laptop atau server build Anda
2. image baru di-build dari source code itu
3. image baru di-push ke Docker Hub
4. VPS client melakukan pull dari Docker Hub
5. VPS menjalankan container baru dari image hasil pull

Jadi bukan `pull ke Docker Hub`.

- Ke Docker Hub: `push`
- Dari Docker Hub ke VPS: `pull`

## Sebelum Build

Pastikan:

- Anda sudah login ke Docker Hub.
- `frontend` image dibuild dengan `VITE_API_URL=/api`.
- `backend/.dockerignore` dan `frontend/.dockerignore` ikut dipakai agar context build tidak membawa file lokal yang tidak perlu.

## Build Dan Push Manual

```powershell
docker build -t dimasw347/simklinik-backend:1.0.0 ./backend
docker build --build-arg VITE_API_URL=/api -t dimasw347/simklinik-frontend:1.0.0 ./frontend
docker push dimasw347/simklinik-backend:1.0.0
docker push dimasw347/simklinik-frontend:1.0.0
```

## Build Dan Push Dengan Script

Gunakan script berikut dari root repo:

```powershell
.\scripts\build-and-push-release.ps1 -DockerHubUser dimasw347 -VersionTag 1.0.0
```

Script akan:

- build image backend
- build image frontend dengan `VITE_API_URL=/api`
- push keduanya ke Docker Hub
- menampilkan nilai `BACKEND_IMAGE` dan `FRONTEND_IMAGE` yang siap dimasukkan ke `.env` VPS

Contoh jika Anda sudah mengubah source code dan ingin merilis update versi `1.0.1` ke Docker Hub:

```powershell
.\scripts\build-and-push-release.ps1 -DockerHubUser dimasw347 -VersionTag 1.0.1
```

Perintah ini melakukan build image baru lalu push ke Docker Hub. Setelah itu, VPS client baru melakukan pull image versi `1.0.1`.

## File Yang Dikirim Ke VPS Client

Minimal:

- `docker-compose.release.yml`
- `.env`
- panduan singkat deploy

Client tidak perlu folder source backend atau frontend.

## Trial Deploy Di VPS

Setelah file `.env` diisi benar di VPS, jalankan:

```powershell
.\scripts\deploy-vps-trial.ps1 -EnvFile .env
```

Atau manual:

```powershell
docker compose -f docker-compose.release.yml --env-file .env pull
docker compose -f docker-compose.release.yml --env-file .env up -d
docker compose -f docker-compose.release.yml --env-file .env ps
```

## Vendor Managed Update Flow

Jika update dikerjakan oleh Anda, bukan oleh client, maka client cukup memakai sistem seperti biasa dan Anda menangani rilis dari sisi vendor.

Alurnya:

1. build dan push image baru ke Docker Hub
2. SSH ke VPS client
3. ubah tag image di `.env`
4. jalankan `docker compose pull`
5. jalankan `docker compose up -d`
6. verifikasi aplikasi setelah update

Contoh rilis versi baru:

```powershell
.\scripts\build-and-push-release.ps1 -DockerHubUser dimasw347 -VersionTag 1.0.1
```

Contoh update di VPS:

```powershell
docker compose -f docker-compose.release.yml --env-file .env pull
docker compose -f docker-compose.release.yml --env-file .env up -d
docker compose -f docker-compose.release.yml --env-file .env ps
docker compose -f docker-compose.release.yml --env-file .env logs --tail 100 simklinik-backend
```

Model ini cocok jika VPS client tetap berada di bawah maintenance Anda. Client tidak menerima source code dan tidak perlu melakukan build sendiri.

## Checklist Setelah Naik

- frontend bisa dibuka dari browser pada `FRONTEND_PORT`
- login berhasil
- backend container status healthy atau running
- database volume terbentuk
- uploads dan backups volume terbentuk
- tidak ada error migration pada log backend

## Troubleshooting Tidak Bisa Konek Database VPS

Jika tool seperti DBeaver menampilkan `Connection attempt timed out` saat konek langsung ke `IP_VPS:5432`, itu biasanya normal pada setup release ini.

Penyebab:

1. Database dijalankan di container internal Docker network.
2. Port database tidak dibuka ke internet publik.
3. Firewall/security group VPS umumnya juga memblokir akses langsung ke 5432.

Mulai rilis ini, port PostgreSQL dipublish hanya ke localhost VPS (`127.0.0.1`) agar tetap aman:

```yaml
simklinik-database:
	ports:
		- "127.0.0.1:${POSTGRES_PORT:-15432}:5432"
```

Jadi akses dari laptop harus lewat SSH tunnel, bukan direct ke IP publik.

Langkah koneksi aman via SSH tunnel:

1. Buka tunnel dari laptop:

```bash
ssh -L 15432:127.0.0.1:15432 user@IP_VPS
```

2. Di DBeaver gunakan parameter berikut:
	 - Host: `127.0.0.1`
	 - Port: `15432`
	 - Database: sesuai `POSTGRES_DB`
	 - Username: sesuai `POSTGRES_USER`
	 - Password: sesuai `POSTGRES_PASSWORD`

Alternatif tanpa membuka koneksi dari laptop:

```bash
docker compose -f docker-compose.release.yml --env-file .env exec simklinik-database psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Catatan keamanan:

1. Hindari membuka `0.0.0.0:5432` ke publik kecuali benar-benar diperlukan.
2. Jika terpaksa dibuka publik, batasi IP source lewat firewall/security group dan aktifkan TLS.

## Troubleshooting Upload Pending Di VPS

Jika upload logo atau aset settings terlihat terus pending di browser, cek poin berikut:

1. Pastikan image frontend juga ikut di-update, bukan hanya backend.
2. Pastikan frontend nginx sudah mem-proxy path `/api` dan `/uploads` ke backend.
3. Pastikan size upload tidak tertahan limit default proxy.
4. Setelah ganti image, jalankan ulang pull dan up -d.

Langkah update paling aman:

1. Build dan push kedua image (backend + frontend) dengan tag versi yang sama.
2. Ubah `BACKEND_IMAGE` dan `FRONTEND_IMAGE` di `.env` VPS ke tag baru.
3. Jalankan:

	docker compose -f docker-compose.release.yml --env-file .env pull
	docker compose -f docker-compose.release.yml --env-file .env up -d
	docker compose -f docker-compose.release.yml --env-file .env ps

Jika masih pending, cek log container:

	docker compose -f docker-compose.release.yml --env-file .env logs --tail 100 simklinik-frontend
	docker compose -f docker-compose.release.yml --env-file .env logs --tail 100 simklinik-backend

## Troubleshooting Cloudflare Tunnel (IP Bisa, Domain Gagal Upload)

Jika upload berhasil saat akses lewat IP langsung, tetapi gagal saat lewat domain Cloudflare Tunnel, masalah biasanya ada di jalur request Tunnel, bukan di aplikasi inti.

Penyebab paling umum: request body dikirim chunked oleh tunnel dan parser multipart origin tidak menerima payload dengan stabil.

Langkah yang direkomendasikan di VPS (cloudflared):

1. Buka konfigurasi tunnel cloudflared.
2. Pada ingress hostname aplikasi, tambahkan `originRequest.disableChunkedEncoding: true`.
3. Pastikan service tetap mengarah ke frontend origin, misalnya `http://localhost:3300`.
4. Restart service cloudflared.

Contoh konfigurasi:

```yaml
ingress:
	- hostname: simrs.domain-anda.com
		service: http://localhost:3300
		originRequest:
			disableChunkedEncoding: true
	- service: http_status:404
```

Lalu restart:

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

Alternatif jika cloudflared dijalankan via Docker Compose release:

```bash
cp cloudflared/config.yml.example cloudflared/config.yml
docker compose -f docker-compose.release.yml --env-file .env --profile tunnel up -d
docker compose -f docker-compose.release.yml --env-file .env logs --tail 100 simklinik-cloudflared
```

Checklist setelah restart:

1. Upload dari domain tidak lagi berhenti di status `canceled`.
2. Request `/api/settings/upload` mengembalikan HTTP 200.
3. Jika masih gagal, cek log cloudflared dan log frontend/backend container secara bersamaan.

## Troubleshooting Cloudflare Memblokir Path SATUSEHAT

Pada sebagian zona Cloudflare, request ke path `/api/satusehat/*` bisa kena WAF rule dan diblokir sebelum sampai ke VPS.

Rilis ini menambahkan alias path SATUSEHAT yang lebih aman dari blokir path-based:

1. Frontend sekarang menggunakan `/api/integrations/bridge/*`.
2. Backend tetap menerima route lama `/api/satusehat/*` untuk kompatibilitas.
3. Jadi fitur SATUSEHAT tetap jalan walau path lama diblokir Cloudflare.

Checklist deploy:

1. Pastikan image backend dan frontend sama-sama sudah diupdate ke tag terbaru.
2. Jalankan pull dan restart compose release.
3. Tes endpoint SATUSEHAT dari UI (status, preview, sync, auto-sync).

Opsional di Cloudflare dashboard:

1. Buat WAF Skip Rule untuk path `/api/satusehat*` dan `/api/integrations/bridge*` agar request API internal tidak tertahan challenge/rule managed.

## Troubleshooting SATUSEHAT Token 403 (Dari VPS/IP Public)

Jika test connection mengembalikan error seperti:

```json
{
	"error": "gagal mengambil token SATUSEHAT: ... 403 Forbidden"
}
```

berarti request dari backend sudah sampai ke endpoint auth SATUSEHAT, tetapi ditolak oleh sisi SATUSEHAT atau policy jaringan keluar VPS.

Checklist wajib:

1. Pastikan mode aktif sesuai credential:
	 - `sandbox` harus pakai URL staging (`api-satusehat-stg...`) + client sandbox.
	 - `production` harus pakai URL production (`api-satusehat...`) + client production.
2. Pastikan `auth_url` benar sampai suffix `/oauth2/v1` (bukan domain root saja).
3. Untuk mode production, pastikan IP public egress VPS sudah didaftarkan/di-whitelist di SATUSEHAT.
4. Pada sebagian tenant sandbox, akses token juga bisa dibatasi policy jaringan. Jika tetap 403 di sandbox, konfirmasi ke tim SATUSEHAT apakah IP egress VPS sandbox Anda juga perlu di-allowlist.
5. Cek apakah environment proxy aktif di container backend (`HTTP_PROXY`/`HTTPS_PROXY`). Proxy jaringan bisa mengembalikan HTML `403` walau URL SATUSEHAT sudah benar.
6. Jalankan uji langsung dari VPS dengan curl untuk memastikan respons asli:

Image backend terbaru sudah menyertakan `curl`. Jika masih muncul `sh: curl: not found`, berarti VPS masih memakai image lama. Anda bisa install sementara:

```bash
docker compose -f docker-compose.release.yml --env-file .env exec simklinik-backend sh -lc "apk add --no-cache curl"
```

Lalu jalankan uji token berikut:

```bash
curl -i -X POST "https://api-satusehat.kemkes.go.id/oauth2/v1/accesstoken" \
	-H "Content-Type: application/x-www-form-urlencoded" \
	--data-urlencode "grant_type=client_credentials" \
	--data-urlencode "client_id=ISI_CLIENT_ID" \
	--data-urlencode "client_secret=ISI_CLIENT_SECRET"
```

Jika dari domain Anda hanya muncul pesan generic `Test koneksi SATUSEHAT gagal dijalankan`, cek Network tab browser untuk endpoint test connection dan lihat status code/responsenya. Jika yang kembali HTML 403 dari edge, tambahkan skip rule Cloudflare untuk:

- `/api/integrations/bridge*`
- `/api/satusehat*` (route lama kompatibilitas)