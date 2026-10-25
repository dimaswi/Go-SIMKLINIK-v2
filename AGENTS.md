# SIMKLINIK - Project Memory & Development Guidelines

Dokumen ini berisi kumpulan aturan, standar UI/UX, dan arsitektur teknis yang telah disepakati untuk proyek Go-SIMKLINIK.

---

## 1. Aturan Pengoperasian Agent (User Preferences)
- **Auto Read & Inspection**: Untuk perintah pembacaan file/pencarian seperti `findstr`, `cat`, `Get-Content`, `grep`, ripgrep, pembacaan file source code, jalankan secara langsung dan efisien tanpa perlu konfirmasi berulang.

---

## 2. Standar Cetak Dokumen & PDF (Backend Golang)
File rujukan: [backend/handlers/medical_record_print.go](file:///e:/Golang/Go-SIMKLINIK/backend/handlers/medical_record_print.go)

- **Posisi Tanda Tangan Dokter (TTD)**:
  - Pada dokumen A4 portrait (seperti Surat Keterangan Sakit / Surat Istirahat Dokter), blok Tanda Tangan Dokter harus diposisikan di area bawah yang presisi (standar koordinat `Y = 232 mm`), sehingga tidak menempel atau berhimpitan dengan teks keterangan di atasnya dan tetap proporsional dengan footer margin.
- **Karakter & Encoding Simbol**:
  - Hindari mencetak karakter derajat mentah `°` (misal `37.0°C`) pada engine FPDF / Maroto karena sering mengalami encoding glitch / text corruption. Gunakan penulisan bersih: `37.0 C`.
- **Integritas Tampilan Data (Anti-Raw JSON)**:
  - Dilarang keras mencetak string JSON mentah (misal `{"keluhan": ...}` atau string `[object Object]`) ke dalam lembar cetak surat atau rekam medis. Jika terdapat data JSON/snapshot, data wajib di-parse ke teks yang bersih atau di-render dalam tabel rapi.
- **Terminologi Medis**:
  - **TS**: Singkatan dari *"Teman Sejawat"*, panggilan standar antar sesama dokter dalam korespondensi rujukan/konsultasi medis.

---

## 3. Fitur EMR: Riwayat Rekam Medis Pasien (Longitudinal EMR Drawer)
Komponen frontend: [patient-medical-history-drawer.tsx](file:///e:/Golang/Go-SIMKLINIK/frontend/src/pages/emr/components/patient-medical-history-drawer.tsx)
Header trigger: [sticky-visit-header.tsx](file:///e:/Golang/Go-SIMKLINIK/frontend/src/pages/emr/components/sticky-visit-header.tsx)
Backend handler: [medical_records.go](file:///e:/Golang/Go-SIMKLINIK/backend/handlers/medical_records.go) -> `GetPatientMedicalRecords`

- **UX Drawer 80% Lebar Layar**:
  - Riwayat rekam medis ditampilkan melalui side drawer selebar 80% layar (`max-w-[80vw] w-[80vw]`) agar dokter dapat membaca riwayat komprehensif tanpa kehilangan konteks kunjungan yang sedang aktif.
  - Trigger terletak pada card header utama EMR (sticky visit header) melalui tombol `Riwayat RM`, badge `RM: ...`, dan icon folder rekam medis.
- **Komponen Data yang Wajib Dimuat**:
  Setiap kunjungan medis mengelompokkan:
  1. **Diagnosa**: Kode ICD-10, nama penyakit, jenis (Primer/Sekunder), dan status kasus.
  2. **Keluhan & Pemeriksaan Fisik**: Anamnesis / SOAP, keluhan utama, catatan fisik.
  3. **Tindakan Medis & Prosedur (`actions`)**:
     - Nama tindakan / snapshot layanan (`service_name_snapshot`), kode (`service_code_snapshot`).
     - Jumlah/kuantitas dan catatan prosedur.
     - Target lokasi tindakan (seperti nomor elemen gigi/odontogram jika poli gigi).
     - Tombol **Salin Tindakan** ke clipboard.
  4. **Resep Obat & Terapi**:
     - Obat non-racikan (nama obat, dosis, aturan pakai, jumlah, instruksi).
     - Obat racikan (nama racikan, kemasan, komponen obat di dalamnya).
     - Tombol **Salin Resep** ke clipboard.
- **Backend Preloading**:
  Fungsi `GetPatientMedicalRecords` pada backend wajib selalu melakukan eager loading untuk relasi:
  - `Actions`, `Actions.MedicalService`, `Actions.Doctor`
  - `Prescriptions`, `Prescriptions.Medicine`
  - `PrescriptionCompounds`
  - `Diagnoses`, `Diagnoses.ICD10`
