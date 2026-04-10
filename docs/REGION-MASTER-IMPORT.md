# Region Master Import

Master wilayah Indonesia sekarang disiapkan sebagai tabel backend terpisah agar frontend tidak perlu membawa dataset CSV besar.

## Struktur tabel

- `provinces`
  - `id BIGINT PRIMARY KEY`
  - `name VARCHAR(120) NOT NULL`
- `regencies`
  - `id BIGINT PRIMARY KEY`
  - `province_id BIGINT NOT NULL REFERENCES provinces(id)`
  - `name VARCHAR(160) NOT NULL`
- `districts`
  - `id BIGINT PRIMARY KEY`
  - `regency_id BIGINT NOT NULL REFERENCES regencies(id)`
  - `name VARCHAR(160) NOT NULL`
- `villages`
  - `id BIGINT PRIMARY KEY`
  - `district_id BIGINT NOT NULL REFERENCES districts(id)`
  - `name VARCHAR(180) NOT NULL`

## Sumber data CSV

- [dataset/provinces.csv](dataset/provinces.csv)
- [dataset/regencies.csv](dataset/regencies.csv)
- [dataset/districts.csv](dataset/districts.csv)
- [dataset/villages.csv](dataset/villages.csv)

Semua file memakai delimiter `;` dengan header.

## Import via DBeaver

Jika preview DBeaver menampilkan satu kolom seperti `id;regency_id;name`, berarti delimiter masih salah.

Gunakan pengaturan berikut pada wizard import CSV:

- Format: `CSV`
- Encoding: `UTF-8`
- Header: aktif
- Delimiter / Separator: `;`
- Quote char: `"`
- Escape char: biarkan default atau `\`

Preview yang benar harus menjadi beberapa kolom terpisah, misalnya untuk `districts.csv`:

- `id`
- `regency_id`
- `name`

Kalau preview masih satu kolom, jangan lanjut ke tahap mapping karena pasti salah.

Urutan import di DBeaver tetap:

1. `provinces.csv` ke tabel `provinces`
2. `regencies.csv` ke tabel `regencies`
3. `districts.csv` ke tabel `districts`
4. `villages.csv` ke tabel `villages`

Mapping kolom yang benar:

- `provinces`: `id -> id`, `name -> name`
- `regencies`: `id -> id`, `province_id -> province_id`, `name -> name`
- `districts`: `id -> id`, `regency_id -> regency_id`, `name -> name`
- `villages`: `id -> id`, `district_id -> district_id`, `name -> name`

## Urutan import

1. `provinces`
2. `regencies`
3. `districts`
4. `villages`

## File SQL siap pakai

Gunakan [dataset/postgres_region_master_import.sql](dataset/postgres_region_master_import.sql).

File itu berisi:

- DDL tabel jika Anda ingin membuatnya langsung dari DBMS
- Index dasar untuk lookup dan pencarian
- Template `COPY` PostgreSQL yang cocok dengan CSV Anda

## Endpoint backend

Setelah tabel terisi, backend menyediakan endpoint read-only berikut:

- `GET /api/regions/provinces`
- `GET /api/regions/regencies?province_id=<id>`
- `GET /api/regions/districts?regency_id=<id>`
- `GET /api/regions/villages?district_id=<id>`

Semua endpoint juga mendukung query `q` untuk filter nama.

## Catatan integrasi

Saat ini data pasien existing masih menyimpan nama wilayah dalam field teks (`province`, `city`, `kecamatan`, `kelurahan`).
Master wilayah ini disiapkan dulu sebagai sumber lookup backend yang stabil. Langkah berikutnya setelah import selesai adalah mengganti form frontend agar mengambil opsi alamat dari endpoint ini.