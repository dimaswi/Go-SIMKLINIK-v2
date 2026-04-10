-- Struktur master wilayah Indonesia untuk PostgreSQL.
-- File CSV sumber memakai delimiter ';' dan header sesuai dataset yang Anda kirim.
-- Jalankan file ini per blok, dari atas ke bawah.
-- Tidak memakai BEGIN/COMMIT agar aman di tool SQL yang auto-commit.

-- STEP 1: buat tabel jika belum ada.

CREATE TABLE IF NOT EXISTS provinces (
	id BIGINT PRIMARY KEY,
	name VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS regencies (
	id BIGINT PRIMARY KEY,
	province_id BIGINT NOT NULL REFERENCES provinces(id) ON UPDATE CASCADE ON DELETE RESTRICT,
	name VARCHAR(160) NOT NULL
);

CREATE TABLE IF NOT EXISTS districts (
	id BIGINT PRIMARY KEY,
	regency_id BIGINT NOT NULL REFERENCES regencies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
	name VARCHAR(160) NOT NULL
);

CREATE TABLE IF NOT EXISTS villages (
	id BIGINT PRIMARY KEY,
	district_id BIGINT NOT NULL REFERENCES districts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
	name VARCHAR(180) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provinces_name ON provinces(name);
CREATE INDEX IF NOT EXISTS idx_regencies_province_id ON regencies(province_id);
CREATE INDEX IF NOT EXISTS idx_regencies_name ON regencies(name);
CREATE INDEX IF NOT EXISTS idx_districts_regency_id ON districts(regency_id);
CREATE INDEX IF NOT EXISTS idx_districts_name ON districts(name);
CREATE INDEX IF NOT EXISTS idx_villages_district_id ON villages(district_id);
CREATE INDEX IF NOT EXISTS idx_villages_name ON villages(name);

-- STEP 2: import ulang seluruh data wilayah.
-- Jalankan blok ini setelah STEP 1 sukses.
-- Sesuaikan path file CSV dengan server PostgreSQL / tool DBMS yang Anda pakai.

TRUNCATE TABLE villages, districts, regencies, provinces RESTART IDENTITY CASCADE;
COPY provinces (id, name)
FROM 'E:/Golang/Go-SIMKLINIK/dataset/provinces.csv'
WITH (FORMAT csv, HEADER true, DELIMITER ';', QUOTE '"');
COPY regencies (id, province_id, name)
FROM 'E:/Golang/Go-SIMKLINIK/dataset/regencies.csv'
WITH (FORMAT csv, HEADER true, DELIMITER ';', QUOTE '"');
COPY districts (id, regency_id, name)
FROM 'E:/Golang/Go-SIMKLINIK/dataset/districts.csv'
WITH (FORMAT csv, HEADER true, DELIMITER ';', QUOTE '"');
COPY villages (id, district_id, name)
FROM 'E:/Golang/Go-SIMKLINIK/dataset/villages.csv'
WITH (FORMAT csv, HEADER true, DELIMITER ';', QUOTE '"');
