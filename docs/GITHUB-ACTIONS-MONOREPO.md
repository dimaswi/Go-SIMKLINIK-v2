# GitHub Actions Monorepo

File utama workflow ada di [.github/workflows/ci.yml](../.github/workflows/ci.yml).

## Kenapa ini disebut monorepo

Satu repository ini menyimpan dua aplikasi berbeda:

- `backend/` untuk Go API
- `frontend/` untuk React + Vite

Monorepo CI berarti satu workflow GitHub Actions menangani keduanya, tetapi setiap job fokus pada folder dan toolchain masing-masing.

## Cara membaca workflow

### 1. Trigger

```yaml
on:
  push:
  pull_request:
  workflow_dispatch:
```

Workflow akan berjalan saat:

- ada `push` ke branch tertentu
- ada `pull_request`
- Anda klik manual dari tab Actions dengan `workflow_dispatch`

### 2. Job terpisah per aplikasi

Ada dua job utama:

- `backend`
- `frontend`

Ini pola paling dasar dan paling umum untuk monorepo kecil sampai menengah.

### 3. `working-directory`

```yaml
defaults:
  run:
    working-directory: backend
```

Bagian ini penting. Tanpa ini, command akan dijalankan dari root repo. Dengan ini, job backend otomatis menjalankan `go build` dari folder `backend/`, dan job frontend dari `frontend/`.

### 4. Dependency cache

- Go memakai cache berdasarkan `backend/go.sum`
- Node memakai cache npm berdasarkan `frontend/package-lock.json`

Tujuannya mempercepat run berikutnya.

### 5. Quality gate

Backend sekarang menjalankan:

```yaml
go build ./...
go test ./...
```

Frontend sekarang menjalankan:

```yaml
npm ci
npm run build
```

Kalau salah satu gagal, workflow akan merah.

## Kenapa contoh ini bagus untuk belajar

- Tidak terlalu banyak abstraction
- Tidak memakai reusable workflow dulu
- Tidak memakai matrix dulu
- Langsung menunjukkan pemisahan backend dan frontend dalam satu repo

## Pengembangan berikutnya

Kalau nanti Anda ingin workflow lebih hemat dan lebih "monorepo-aware", biasanya ditambah:

1. `paths` atau `paths-filter` supaya job backend hanya jalan jika folder `backend/` berubah.
2. Job `docker` untuk build image dari `backend/Dockerfile` dan `frontend/Dockerfile`.
3. Job `deploy` yang berjalan hanya di branch `main`.
4. Upload artifact hasil frontend build.

## Cara pakai

1. Push file ini ke GitHub.
2. Buka tab `Actions` di repository GitHub.
3. Pilih workflow `Monorepo CI`.
4. Lihat job `Backend Build` dan `Frontend Build`.

Kalau salah satu gagal, buka log step yang merah untuk melihat command mana yang error.