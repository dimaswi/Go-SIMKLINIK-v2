# SIMKLINIK — Sistem Informasi Manajemen Klinik

## Ringkasan Proyek

Membangun sistem manajemen klinik lengkap di atas starter kit **Go (Gin + GORM) + React (Vite + Zustand + Radix UI)**. Sistem mencakup seluruh operasional klinik dari **front office** (pendaftaran pasien, antrian poliklinik) hingga **back office** (kasir, apotek, laporan) untuk klinik rawat jalan multi-tipe.

Implementasi dibagi menjadi **8 fase**, setiap fase bisa di-deploy dan diverifikasi secara independen.

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Go 1.21, Gin, GORM, PostgreSQL 15, JWT |
| Frontend | React 19, TypeScript, Vite, Zustand, Radix UI, Tailwind CSS |
| Tabel Data | TanStack React Table v8 |
| Form | React Hook Form + Zod |
| Grafik | Recharts |
| Notifikasi | Sonner |
| Deploy | Docker + Docker Compose |

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Pendaftaran│ │   EMR    │ │ Farmasi  │ │  Kasir   │  ...      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │
│       │             │            │             │                 │
│  ┌────┴─────────────┴────────────┴─────────────┴──────────────┐ │
│  │              Axios HTTP Client + Zustand Store              │ │
│  └─────────────────────────┬──────────────────────────────────┘ │
└────────────────────────────┼────────────────────────────────────┘
                             │ REST API (JSON)
┌────────────────────────────┼────────────────────────────────────┐
│                        BACKEND (Go/Gin)                         │
│  ┌─────────────────────────┴──────────────────────────────────┐ │
│  │              Router + Middleware (JWT + RBAC)                │ │
│  └─────────────────────────┬──────────────────────────────────┘ │
│  ┌────────┐ ┌────────┐ ┌──┴─────┐ ┌────────┐ ┌────────┐       │
│  │Handler │ │Handler │ │Handler │ │Handler │ │Handler │  ...   │
│  │Patient │ │  EMR   │ │Farmasi │ │ Kasir  │ │Laporan │       │
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘       │
│      │          │          │          │          │              │
│  ┌───┴──────────┴──────────┴──────────┴──────────┴───────────┐ │
│  │                    GORM ORM Layer                          │ │
│  └──────────────────────────┬────────────────────────────────┘ │
└─────────────────────────────┼──────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   PostgreSQL 15   │
                    └───────────────────┘
```

---

## Diagram Relasi Data Utama

```
Patient ──< Visit ──── MedicalRecord ──< Prescription ────── Medicine
   │           │              │                                  │
   │           │              ├──< MedicalRecordDiagnosis ────── ICD10
   │           │              ├──< MedicalAction ────── MedicalService
   │           │              ├──< LabRequest ──< LabRequestItem ── LabTest
   │           │              └──── InformedConsent
   │           │
   │           ├──── Polyclinic
   │           ├──── Doctor ──< DoctorSchedule
   │           └──── Invoice ──< InvoiceItem
   │                    └──< Payment ──── PaymentMethod
   │
   └── HasMany: Visit, MedicalRecord

Medicine ──< StockMovement
   │
   └──< PurchaseOrderItem ──── PurchaseOrder ──── Supplier
```

---

## Urutan Implementasi & Dependensi

```
Fase 1 (Master Data)          ← HARUS pertama (semua fase lain bergantung pada ini)
   │
   ├── Fase 2 (Front Office)  ← bergantung pada Fase 1
   │      │
   │      ├── Fase 3 (EMR)    ← bergantung pada Fase 2 (Visit → MedicalRecord)
   │      │      │
   │      │      ├── Fase 4 (Farmasi)      ← bergantung pada Fase 3 (Prescription)
   │      │      ├── Fase 6 (Laboratorium)  ← bergantung pada Fase 3 (LabRequest dari EMR)
   │      │      └── Fase 5 (Billing)       ← bergantung pada Fase 3+4 (biaya layanan + obat)
   │      │             │
   │      │             └── Fase 7 (Dokumen) ← bergantung pada Fase 3+5 (data cetak)
   │      │
   │      └── Fase 7 (Dokumen) ← sebagian, beberapa dokumen bergantung pada Fase 3
   │
   └── Fase 8 (Laporan)       ← terakhir, agregasi data dari semua modul
```

> **Catatan**: Fase 4 dan Fase 6 bisa dibangun secara paralel (keduanya bergantung pada Fase 3 tapi tidak saling bergantung).

---

## Fase 1: Master Data (Fondasi)

### Tujuan
Membuat seluruh tabel referensi/master data yang menjadi fondasi modul lainnya.

### Model Backend

| Model | File | Field Utama | Relasi |
|-------|------|-------------|--------|
| **Polyclinic** | `polyclinic.go` | ID, Name, Code, Description, IsActive, Color, Icon, SortOrder | HasMany: DoctorSchedule |
| **Doctor** | `doctor.go` | ID, UserID (FK nullable), FullName, SIPNumber (SIP), Specialization, Phone, Photo, IsActive | ManyToMany: Polyclinic; HasMany: DoctorSchedule, MedicalRecord |
| **DoctorSchedule** | `doctor_schedule.go` | ID, DoctorID, PolyclinicID, DayOfWeek (0-6), StartTime, EndTime, MaxPatients, IsActive | BelongsTo: Doctor, Polyclinic |
| **ICD10** | `icd10.go` | ID, Code (unique indexed), Name, NameID (Bahasa Indonesia), Category, Chapter | Seed data standar |
| **Medicine** | `medicine.go` | ID, Code (unique), Name, GenericName, CategoryID, UnitID, Type (obat/alkes/bmhp), Form (tablet/sirup/injeksi/dll), Strength, Manufacturer, MinStock, CurrentStock, PurchasePrice, SellingPrice, IsActive | BelongsTo: MedicineCategory, Unit |
| **MedicineCategory** | `medicine_category.go` | ID, Name, Description | HasMany: Medicine |
| **Unit** | `unit.go` | ID, Name (tablet, botol, tube, ampul, strip, dll) | HasMany: Medicine |
| **MedicalService** | `medical_service.go` | ID, Code, Name, CategoryID, PolyclinicID (nullable), Price, IsActive, Description | BelongsTo: ServiceCategory, Polyclinic |
| **ServiceCategory** | `service_category.go` | ID, Name (Konsultasi, Tindakan, Laboratorium, Farmasi) | HasMany: MedicalService |
| **PaymentMethod** | `payment_method.go` | ID, Name (Tunai, Debit, Kartu Kredit, Transfer), IsActive | — |
| **Supplier** | `supplier.go` | ID, Name, ContactPerson, Phone, Email, Address, IsActive | HasMany: PurchaseOrder |

### Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET/POST | `/api/polyclinics` | Daftar & buat poliklinik |
| GET/PUT/DELETE | `/api/polyclinics/:id` | Detail, ubah, hapus poliklinik |
| GET/POST | `/api/doctors` | Daftar & buat dokter |
| GET/PUT/DELETE | `/api/doctors/:id` | Detail, ubah, hapus dokter |
| GET/POST | `/api/doctor-schedules` | Daftar & buat jadwal dokter |
| GET/PUT/DELETE | `/api/doctor-schedules/:id` | Detail, ubah, hapus jadwal |
| GET | `/api/icd10?q=` | Cari kode ICD-10 (read-only) |
| GET/POST | `/api/medicines` | Daftar & buat obat |
| GET/PUT/DELETE | `/api/medicines/:id` | Detail, ubah, hapus obat |
| GET/POST | `/api/medicine-categories` | CRUD kategori obat |
| GET/PUT/DELETE | `/api/medicine-categories/:id` | Detail, ubah, hapus kategori |
| GET/POST | `/api/units` | CRUD satuan |
| GET/PUT/DELETE | `/api/units/:id` | Detail, ubah, hapus satuan |
| GET/POST | `/api/medical-services` | CRUD layanan medis |
| GET/PUT/DELETE | `/api/medical-services/:id` | Detail, ubah, hapus layanan |
| GET/POST | `/api/service-categories` | CRUD kategori layanan |
| GET/PUT/DELETE | `/api/service-categories/:id` | Detail, ubah, hapus kategori |
| GET/POST | `/api/payment-methods` | CRUD metode pembayaran |
| GET/PUT/DELETE | `/api/payment-methods/:id` | Detail, ubah, hapus metode |
| GET/POST | `/api/suppliers` | CRUD supplier |
| GET/PUT/DELETE | `/api/suppliers/:id` | Detail, ubah, hapus supplier |

### Halaman Frontend

| Direktori | Halaman | Deskripsi |
|-----------|---------|-----------|
| `pages/polyclinics/` | index, create, edit, show, columns | Manajemen poliklinik |
| `pages/doctors/` | index, create, edit, show, columns | Manajemen dokter + jadwal |
| `pages/medicines/` | index, create, edit, show, columns | Manajemen obat |
| `pages/medical-services/` | index, create, edit, columns | Manajemen tarif layanan |
| `pages/suppliers/` | index, create, edit, columns | Manajemen supplier |
| `pages/settings/` | (extend) | Kategori obat, satuan, kategori layanan, metode bayar |

### Permission

```
polyclinics.view, polyclinics.create, polyclinics.update, polyclinics.delete
doctors.view, doctors.create, doctors.update, doctors.delete
doctor_schedules.view, doctor_schedules.create, doctor_schedules.update, doctor_schedules.delete
medicines.view, medicines.create, medicines.update, medicines.delete
medical_services.view, medical_services.create, medical_services.update, medical_services.delete
suppliers.view, suppliers.create, suppliers.update, suppliers.delete
icd10.view
```

### Update Sidebar

Tambah grup menu **"Master Data"** dengan sub-item:
- 📋 Poliklinik
- 👨‍⚕️ Dokter
- 💊 Obat
- 🏷️ Layanan/Tarif
- 🏭 Supplier

---

## Fase 2: Front Office — Pendaftaran & Antrian

### Tujuan
Pendaftaran pasien (baru & lama), manajemen antrian per poli, layar display antrian.

### Model Backend

| Model | File | Field Utama | Relasi |
|-------|------|-------------|--------|
| **Patient** | `patient.go` | ID, MedicalRecordNumber (auto: `RM-YYYYMMDD-XXXX`), NIK (unique nullable), FullName, BirthDate, BirthPlace, Gender (L/P), BloodType, MaritalStatus, Religion, Education, Occupation, Address, RT, RW, Kelurahan, Kecamatan, City, Province, PostalCode, Phone, Email, EmergencyContactName, EmergencyContactPhone, EmergencyContactRelation, InsuranceType (umum/bpjs/asuransi), InsuranceNumber, Allergies, Notes, Photo, IsActive | HasMany: Visit, MedicalRecord |
| **Visit** | `visit.go` | ID, VisitNumber (auto: `VIS-YYYYMMDD-XXXX`), PatientID, VisitDate, PolyclinicID, DoctorID, QueueNumber (int per poli per hari), QueueStatus (waiting/in_consultation/done/cancelled), PaymentType (umum/bpjs/insurance), InsuranceNumber, Complaint (keluhan utama), VisitType (baru/lama), Priority (normal/urgent), Status (registered/in_progress/completed/cancelled), RegisteredBy (FK ke User) | BelongsTo: Patient, Polyclinic, Doctor; HasOne: MedicalRecord, Invoice |
| **QueueCounter** | `queue_counter.go` | ID, PolyclinicID, Date, LastNumber | Helper nomor antrian harian |

### Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET/POST | `/api/patients` | Daftar & buat pasien (`?q=` cari nama/NIK/MRN) |
| GET/PUT/DELETE | `/api/patients/:id` | Detail, ubah, hapus pasien |
| GET | `/api/patients/:id/history` | Riwayat kunjungan pasien |
| GET/POST | `/api/visits` | Daftar & buat kunjungan (= pendaftaran baru) |
| GET | `/api/visits/today` | Kunjungan hari ini (`?poli=&doctor=&status=`) |
| GET/PUT/DELETE | `/api/visits/:id` | Detail, ubah, hapus kunjungan |
| PATCH | `/api/visits/:id/status` | Update status antrian/kunjungan |
| GET | `/api/queue/:polyclinicId` | Status antrian per poli |
| POST | `/api/queue/:polyclinicId/call-next` | Panggil antrian berikutnya |

### Halaman Frontend

| Direktori | Halaman | Deskripsi |
|-----------|---------|-----------|
| `pages/patients/` | index, create, edit, show | Daftar pasien (searchable), form pendaftaran lengkap, detail + tab riwayat |
| `pages/registration/` | index | Pendaftaran kunjungan: cari pasien → pilih poli/dokter → daftar |
| `pages/queue/` | index, display | Dashboard antrian (kanban: Menunggu → Konsultasi → Selesai) |
| `pages/queue/display` | — | Layar display antrian (font besar, auto-refresh, untuk TV ruang tunggu) |

### Permission

```
patients.view, patients.create, patients.update, patients.delete
visits.view, visits.create, visits.update, visits.delete
queue.view, queue.manage
```

### Update Sidebar

Tambah grup menu **"Front Office"** dengan sub-item:
- 📝 Pendaftaran
- 👥 Data Pasien
- 📟 Antrian

---

## Fase 3: Klinis — Rekam Medis Elektronik (EMR)

### Tujuan
Rekam medis berbasis SOAP, tanda vital, diagnosis ICD-10, resep, tindakan medis, informed consent.

### Model Backend

| Model | File | Field Utama | Relasi |
|-------|------|-------------|--------|
| **MedicalRecord** | `medical_record.go` | ID, VisitID (unique), PatientID, DoctorID, PolyclinicID, RecordDate, **Subjective** (keluhan pasien), **Objective**: TD Sistolik/Diastolik, Nadi, Suhu, RR, SpO2, TB, BB, IMT (kalkulasi), PemeriksaanFisik, **Assessment** (penilaian), **Plan** (rencana), Notes, Status (draft/final) | HasMany: Diagnosis, Prescription, MedicalAction, LabRequest, InformedConsent |
| **MedicalRecordDiagnosis** | `medical_record_diagnosis.go` | ID, MedicalRecordID, ICD10ID, DiagnosisType (primer/sekunder), Notes | BelongsTo: MedicalRecord, ICD10 |
| **Prescription** | `prescription.go` | ID, MedicalRecordID, MedicineID, Quantity, Dosage (misal "3x1"), Frequency, Duration, Route (oral/topikal/injeksi), Instructions (signa/aturan pakai), Notes, Status (prescribed/dispensed/cancelled) | BelongsTo: MedicalRecord, Medicine |
| **MedicalAction** | `medical_action.go` | ID, MedicalRecordID, MedicalServiceID, DoctorID, Notes, Quantity, Price (snapshot dari MedicalService) | BelongsTo: MedicalRecord, MedicalService, Doctor |
| **InformedConsent** | `informed_consent.go` | ID, MedicalRecordID, PatientID, DoctorID, ActionName, ActionDescription, Risks, Benefits, PatientDecision (setuju/tolak), ConsentDate, WitnessName, Notes | BelongsTo: MedicalRecord, Patient, Doctor |

### Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET/POST | `/api/medical-records` | Daftar & buat rekam medis |
| GET/PUT | `/api/medical-records/:id` | Detail & ubah rekam medis (dengan diagnosis, resep, tindakan) |
| POST | `/api/medical-records/:id/finalize` | Kunci rekam medis (tidak bisa diubah lagi) |
| GET | `/api/patients/:id/medical-records` | Riwayat EMR pasien |
| CRUD | `/api/medical-records/:id/prescriptions` | Resep dalam rekam medis |
| CRUD | `/api/medical-records/:id/diagnoses` | Diagnosis dalam rekam medis |
| CRUD | `/api/medical-records/:id/actions` | Tindakan medis |
| CRUD | `/api/medical-records/:id/informed-consent` | Informed consent |

### Halaman Frontend

| Direktori | Halaman | Deskripsi |
|-----------|---------|-----------|
| `pages/emr/` | form (tabbed) | Form rekam medis berbasis SOAP |
| | **Tab 1 - Subjective** | Keluhan pasien, riwayat penyakit |
| | **Tab 2 - Objective** | Form tanda vital, pemeriksaan fisik |
| | **Tab 3 - Assessment** | Pencarian diagnosis ICD-10 (autocomplete), primer/sekunder |
| | **Tab 4 - Plan** | Builder resep obat, tindakan medis, permintaan lab, rujukan |
| | **Tab 5 - Informed Consent** | Jika diperlukan |
| `pages/emr/history/` | :patientId | Tampilan timeline riwayat rekam medis |

> **Integrasi**: Diakses dari dashboard antrian saat dokter klik **"Mulai Konsultasi"**

### Permission

```
medical_records.view, medical_records.create, medical_records.update, medical_records.finalize
prescriptions.view, prescriptions.create, prescriptions.update
informed_consent.view, informed_consent.create
```

### Update Sidebar

Tambah grup menu **"Klinik"** dengan sub-item:
- 📋 Rekam Medis
- 📜 Riwayat Pasien

---

## Fase 4: Farmasi & Inventori

### Tujuan
Dispensing obat dari resep, manajemen stok, pemesanan pembelian (Purchase Order).

### Model Backend

| Model | File | Field Utama | Relasi |
|-------|------|-------------|--------|
| **StockMovement** | `stock_movement.go` | ID, MedicineID, Type (masuk/keluar/penyesuaian/retur), Quantity, PreviousStock, NewStock, ReferenceType (purchase_order/prescription/adjustment/return), ReferenceID, BatchNumber, ExpiryDate, Notes, CreatedBy | BelongsTo: Medicine, User |
| **PurchaseOrder** | `purchase_order.go` | ID, PONumber (auto: `PO-YYYYMMDD-XXXX`), SupplierID, OrderDate, ReceivedDate, Status (draft/ordered/partial/received/cancelled), TotalAmount, Notes, CreatedBy | HasMany: PurchaseOrderItem; BelongsTo: Supplier |
| **PurchaseOrderItem** | `purchase_order_item.go` | ID, PurchaseOrderID, MedicineID, Quantity, ReceivedQuantity, UnitPrice, TotalPrice, BatchNumber, ExpiryDate | BelongsTo: PurchaseOrder, Medicine |
| **Dispensing** | `dispensing.go` | ID, VisitID, PrescriptionID, MedicineID, Quantity, BatchNumber, DispensedBy, DispensedAt, Status (pending/dispensed/partial/returned), Notes | BelongsTo: Visit, Medicine, User |

### Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/pharmacy/queue` | Antrian resep yang perlu didispensing |
| POST | `/api/pharmacy/dispense` | Dispensing obat |
| GET | `/api/pharmacy/history` | Riwayat dispensing |
| GET | `/api/stock/movements` | Riwayat pergerakan stok |
| POST | `/api/stock/adjust` | Penyesuaian stok manual |
| GET | `/api/stock/alerts` | Alert stok rendah / kadaluarsa |
| GET/POST | `/api/purchase-orders` | Daftar & buat PO |
| GET/PUT/DELETE | `/api/purchase-orders/:id` | Detail, ubah, hapus PO |
| POST | `/api/purchase-orders/:id/receive` | Terima barang → update stok |

### Halaman Frontend

| Direktori | Halaman | Deskripsi |
|-----------|---------|-----------|
| `pages/pharmacy/` | index | Dashboard apotek: antrian resep, form dispensing, riwayat |
| `pages/stock/` | index | Manajemen inventori: daftar stok, log pergerakan, penyesuaian |
| `pages/purchase-orders/` | index, create, show | Manajemen PO dengan workflow terima barang |

### Permission

```
pharmacy.view, pharmacy.dispense
stock.view, stock.adjust
purchase_orders.view, purchase_orders.create, purchase_orders.update, purchase_orders.receive
```

### Update Sidebar

Tambah grup menu **"Farmasi"** dengan sub-item:
- 💊 Apotek/Dispensing
- 📦 Stok Obat
- 📋 Pemesanan (PO)

---

## Fase 5: Kasir & Billing

### Tujuan
Pembuatan invoice otomatis dari kunjungan, proses pembayaran, cetak kwitansi.

### Model Backend

| Model | File | Field Utama | Relasi |
|-------|------|-------------|--------|
| **Invoice** | `invoice.go` | ID, InvoiceNumber (auto: `INV-YYYYMMDD-XXXX`), VisitID (unique), PatientID, InvoiceDate, SubTotal, Discount, DiscountType (persentase/nominal), Tax, TotalAmount, Status (belum_bayar/sebagian/lunas/batal/refund), Notes, CreatedBy | HasMany: InvoiceItem, Payment; BelongsTo: Visit, Patient |
| **InvoiceItem** | `invoice_item.go` | ID, InvoiceID, ItemType (layanan/obat/lab), ReferenceID, Description, Quantity, UnitPrice, Discount, TotalPrice | BelongsTo: Invoice |
| **Payment** | `payment.go` | ID, InvoiceID, PaymentMethodID, Amount, PaymentDate, ReferenceNumber (untuk kartu/transfer), ReceivedBy, Notes | BelongsTo: Invoice, PaymentMethod |

### Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET/POST | `/api/invoices` | Daftar & buat invoice |
| GET | `/api/invoices/:id` | Detail invoice |
| POST | `/api/invoices/generate/:visitId` | Auto-generate invoice dari layanan/obat/lab kunjungan |
| POST | `/api/invoices/:id/pay` | Proses pembayaran |
| GET | `/api/invoices/:id/print` | Data invoice untuk cetak |
| GET | `/api/cashier/summary` | Ringkasan kasir harian |
| POST | `/api/cashier/close` | Tutup kasir harian |

### Halaman Frontend

| Direktori | Halaman | Deskripsi |
|-----------|---------|-----------|
| `pages/cashier/` | index | Dashboard kasir: tagihan pending, form bayar, ringkasan harian |
| `pages/invoices/` | index, show | Daftar invoice dengan filter, detail invoice (cetak) |

### Permission

```
invoices.view, invoices.create, invoices.update
payments.view, payments.create, payments.refund
cashier.view, cashier.close
```

### Update Sidebar

Tambah grup menu **"Kasir"** dengan sub-item:
- 💰 Pembayaran
- 🧾 Invoice

---

## Fase 6: Laboratorium

### Tujuan
Pemesanan tes lab dari EMR, pelacakan sampel, input hasil, rujukan lab eksternal.

### Model Backend

| Model | File | Field Utama | Relasi |
|-------|------|-------------|--------|
| **LabTest** (master) | `lab_test.go` | ID, Code, Name, CategoryID, Unit, NilaiNormalPria, NilaiNormalWanita, Price, IsActive, SortOrder | BelongsTo: LabTestCategory |
| **LabTestCategory** | `lab_test_category.go` | ID, Name (Hematologi, Kimia Darah, Urinalisa, Serologi, dll) | HasMany: LabTest |
| **LabRequest** | `lab_request.go` | ID, RequestNumber (auto: `LAB-YYYYMMDD-XXXX`), MedicalRecordID, PatientID, DoctorID, RequestDate, Type (internal/eksternal), ExternalLabName, Status (diminta/sampel_diambil/proses/selesai/batal), Notes, Priority (normal/urgent) | HasMany: LabRequestItem; BelongsTo: MedicalRecord, Patient, Doctor |
| **LabRequestItem** | `lab_request_item.go` | ID, LabRequestID, LabTestID, Result, Unit, NormalValue, Flag (normal/rendah/tinggi/kritis), ResultDate, ResultBy | BelongsTo: LabRequest, LabTest |

### Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET/POST | `/api/lab-tests` | CRUD master tes lab |
| GET/PUT/DELETE | `/api/lab-tests/:id` | Detail, ubah, hapus tes |
| GET/POST | `/api/lab-test-categories` | CRUD kategori tes |
| GET/PUT/DELETE | `/api/lab-test-categories/:id` | Detail, ubah, hapus kategori |
| GET/POST | `/api/lab-requests` | Daftar & buat permintaan lab |
| GET | `/api/lab-requests/:id` | Detail permintaan + hasil |
| PATCH | `/api/lab-requests/:id/collect-sample` | Tandai sampel diambil |
| POST/PUT | `/api/lab-requests/:id/results` | Input hasil lab |
| PATCH | `/api/lab-requests/:id/complete` | Tandai selesai |
| GET | `/api/lab-requests/:id/print` | Data hasil lab untuk cetak |

### Halaman Frontend

| Direktori | Halaman | Deskripsi |
|-----------|---------|-----------|
| `pages/laboratory/` | index | Dashboard lab: antrian permintaan, form input hasil, daftar selesai |
| `pages/lab-tests/` | index, create, edit | Manajemen master tes lab |

### Permission

```
lab_tests.view, lab_tests.create, lab_tests.update, lab_tests.delete
lab_requests.view, lab_requests.create, lab_requests.update, lab_requests.results, lab_requests.complete
```

### Update Sidebar

Tambah grup menu **"Laboratorium"** dengan sub-item:
- 🔬 Dashboard Lab
- 📋 Master Tes Lab

---

## Fase 7: Dokumen & Cetak

### Tujuan
Generate dan cetak surat medis, resep, kwitansi, informed consent, hasil lab.

### Jenis Dokumen

| No | Dokumen | Sumber Data | Akses Dari |
|----|---------|-------------|------------|
| 1 | **Surat Keterangan Sakit** | Data pasien, diagnosis, durasi istirahat | Halaman EMR |
| 2 | **Surat Keterangan Sehat** | Data pasien, hasil pemeriksaan | Halaman EMR |
| 3 | **Surat Rujukan** | Data pasien, diagnosis, tujuan rujukan | Halaman EMR |
| 4 | **Resep Obat (Cetak)** | Info dokter, pasien, daftar resep | Halaman EMR |
| 5 | **Kwitansi/Invoice** | Item tagihan terperinci + info pembayaran | Halaman Kasir |
| 6 | **Informed Consent** | Detail tindakan, risiko, keputusan pasien | Halaman EMR |
| 7 | **Hasil Laboratorium** | Hasil tes dengan nilai normal | Dashboard Lab |

### Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/documents/surat-sakit/:visitId` | Data surat sakit |
| GET | `/api/documents/surat-sehat/:visitId` | Data surat sehat |
| GET/POST | `/api/documents/surat-rujukan/:visitId` | Data surat rujukan |
| GET | `/api/documents/resep/:medicalRecordId` | Data resep cetak |
| GET | `/api/documents/invoice/:invoiceId` | Data invoice cetak |
| GET | `/api/documents/informed-consent/:id` | Data informed consent |
| GET | `/api/documents/lab-result/:labRequestId` | Data hasil lab cetak |

### Implementasi Frontend

- Komponen template cetak di `components/documents/`
- Menggunakan CSS `@media print` untuk tampilan cetak khusus
- Fungsi `window.print()` — tanpa PDF server-side (lebih sederhana)
- Tombol cetak tersedia di halaman terkait

### Permission

```
documents.surat_sakit, documents.surat_sehat, documents.surat_rujukan
documents.resep, documents.invoice, documents.lab_result
```

---

## Fase 8: Laporan & Dashboard Analitik

### Tujuan
Pelaporan komprehensif untuk pengambilan keputusan manajemen klinik.

### Jenis Laporan

| Kategori | Detail | Visualisasi |
|----------|--------|-------------|
| **Dashboard KPI** | Kunjungan hari ini (vs kemarin), pasien baru, pendapatan hari ini, antrian pending, alert stok rendah, tren kunjungan & pendapatan bulanan, top 5 poli & dokter | Kartu KPI, Line chart, Bar chart |
| **Laporan Kunjungan** | Jumlah kunjungan harian/bulanan/tahunan, per poli/dokter/tipe bayar, pasien baru vs lama, rata-rata waktu tunggu | Line chart, Pie chart, Tabel |
| **10 Besar Penyakit** | Ranking frekuensi diagnosis ICD-10, filter per rentang tanggal & poli | Bar chart horizontal, Tabel |
| **Laporan Pendapatan** | Rincian pendapatan harian/bulanan (layanan, obat, lab), per poli/dokter/metode bayar, piutang, laporan tutup kasir | Stacked bar, Line trend, Tabel |
| **Laporan Farmasi** | Nilai stok, obat fast/slow moving, peringatan kadaluarsa, riwayat pembelian per supplier | Bar chart, Alert list, Tabel |
| **Laporan Laboratorium** | Frekuensi tes, turnaround time (permintaan → hasil) | Bar chart, Tabel |

### Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/reports/dashboard` | Ringkasan KPI dashboard |
| GET | `/api/reports/visits?from=&to=&group_by=` | Statistik kunjungan |
| GET | `/api/reports/diseases?from=&to=&poli=` | 10 besar penyakit |
| GET | `/api/reports/revenue?from=&to=&group_by=` | Rincian pendapatan |
| GET | `/api/reports/pharmacy` | Statistik farmasi/inventori |
| GET | `/api/reports/lab` | Statistik laboratorium |

### Halaman Frontend

| Direktori | Halaman | Deskripsi |
|-----------|---------|-----------|
| `pages/dashboard/` | (extend) | Perkaya dengan kartu KPI + grafik tren |
| `pages/reports/visits` | — | Laporan kunjungan dengan grafik |
| `pages/reports/diseases` | — | 10 besar penyakit (bar chart) |
| `pages/reports/revenue` | — | Grafik dan tabel pendapatan |
| `pages/reports/pharmacy` | — | Laporan stok & dispensing |
| `pages/reports/lab` | — | Laporan utilisasi lab |

> Semua laporan: date range picker, tombol ekspor CSV

### Permission

```
reports.visits, reports.diseases, reports.revenue, reports.pharmacy, reports.lab
dashboard.view (existing, data diperluas)
```

### Update Sidebar

Tambah grup menu **"Laporan"** dengan sub-item:
- 📊 Dashboard
- 📈 Kunjungan
- 🏥 Penyakit
- 💰 Pendapatan
- 💊 Farmasi
- 🔬 Laboratorium

---

## Data Seed yang Diperlukan

| No | Data | Jumlah | Contoh |
|----|------|--------|--------|
| 1 | **Kode ICD-10** | 100-200 kode umum | J00 (Nasofaringitis akut), J06.9 (ISPA), K29.7 (Gastritis), E11 (DM Tipe 2), I10 (Hipertensi) |
| 2 | **Kategori Obat** | ~15 kategori | Analgesik, Antibiotik, Antihipertensi, Antidiabetes, Vitamin, Obat Maag, Antihistamin, Antipiretik |
| 3 | **Satuan Obat** | ~10 satuan | Tablet, Kapsul, Botol, Tube, Ampul, Sachet, Strip, Vial, Sendok, Tetes |
| 4 | **Bentuk Sediaan** | ~10 bentuk | Tablet, Kapsul, Sirup, Salep, Krim, Injeksi, Suspensi, Tetes Mata, Tetes Telinga, Suppositoria |
| 5 | **Kategori Tes Lab** | ~6 kategori | Hematologi, Kimia Darah, Urinalisa, Serologi, Imunologi, Mikrobiologi |
| 6 | **Tes Lab Umum** | ~30 tes | Darah Lengkap, Gula Darah Puasa, Kolesterol Total, Asam Urat, SGOT/SGPT, Ureum, Kreatinin, HbA1c |
| 7 | **Kategori Layanan** | 4 kategori | Konsultasi, Tindakan Medis, Laboratorium, Farmasi |
| 8 | **Metode Pembayaran** | 4 metode | Tunai, Debit, Kartu Kredit, Transfer Bank |
| 9 | **Permission Baru** | ~60 permission | Lihat daftar per fase di atas |
| 10 | **Poliklinik Default** | 2 contoh | Poli Umum, Poli Gigi (admin bisa tambah sendiri) |

---

## Alur Kerja Utama (End-to-End Flow)

### Alur Pasien Rawat Jalan

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  PENDAFTARAN │───>│   ANTRIAN    │───>│  KONSULTASI  │───>│   FARMASI    │───>│    KASIR     │
│  Front Desk  │    │  Ruang Tunggu│    │   Dokter     │    │   Apotek     │    │  Pembayaran  │
│              │    │              │    │              │    │              │    │              │
│ - Cari/Daftar│    │ - Menunggu   │    │ - SOAP       │    │ - Verifikasi │    │ - Auto-invoice│
│   Pasien     │    │ - Dipanggil  │    │ - Diagnosis  │    │   Resep      │    │ - Proses bayar│
│ - Pilih Poli │    │ - Konsultasi │    │ - Resep Obat │    │ - Dispensing │    │ - Cetak      │
│ - Pilih Dokter│   │ - Selesai    │    │ - Tindakan   │    │ - Update Stok│    │   Kwitansi   │
│ - Cetak Nomor│    │              │    │ - Rujukan Lab│    │              │    │              │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Alur Laboratorium

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ PERMINTAAN   │───>│ PENGAMBILAN  │───>│ INPUT HASIL  │───>│ CETAK HASIL  │
│ dari EMR     │    │ SAMPEL       │    │ Lab Analis   │    │              │
│              │    │              │    │              │    │              │
│ - Pilih tes  │    │ - Tandai     │    │ - Input nilai│    │ - Cetak PDF  │
│ - Prioritas  │    │   sampel     │    │ - Flag       │    │ - Kirim ke   │
│ - Internal/  │    │   diambil    │    │   abnormal   │    │   dokter     │
│   Eksternal  │    │              │    │ - Tandai     │    │ - Billing    │
│              │    │              │    │   selesai    │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Alur Inventori/Stok

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ PURCHASE     │───>│ TERIMA       │───>│ STOK         │───>│ DISPENSING   │
│ ORDER        │    │ BARANG       │    │ TERSEDIA     │    │ (Keluar)     │
│              │    │              │    │              │    │              │
│ - Buat PO    │    │ - Cek qty    │    │ - Monitor    │    │ - Dari resep │
│ - Pilih      │    │ - Input batch│    │ - Alert min  │    │ - Kurangi    │
│   supplier   │    │ - Expiry date│    │ - Penyesuaian│    │   stok       │
│ - Kirim ke   │    │ - Update stok│    │              │    │ - Catat      │
│   supplier   │    │              │    │              │    │   movement   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## Struktur Navigasi Sidebar (Lengkap)

```
📊 Dashboard

📋 FRONT OFFICE
├── 📝 Pendaftaran
├── 👥 Data Pasien
└── 📟 Antrian

🏥 KLINIK
├── 📋 Rekam Medis
└── 📜 Riwayat Pasien

💊 FARMASI
├── 💊 Apotek/Dispensing
├── 📦 Stok Obat
└── 📋 Pemesanan (PO)

💰 KASIR
├── 💰 Pembayaran
└── 🧾 Invoice

🔬 LABORATORIUM
├── 🔬 Dashboard Lab
└── 📋 Master Tes Lab

📈 LAPORAN
├── 📈 Kunjungan
├── 🏥 Penyakit
├── 💰 Pendapatan
├── 💊 Farmasi
└── 🔬 Laboratorium

⚙️ MASTER DATA
├── 🏠 Poliklinik
├── 👨‍⚕️ Dokter
├── 💊 Obat
├── 🏷️ Layanan/Tarif
└── 🏭 Supplier

👤 PENGATURAN
├── 👤 Pengguna
├── 🔑 Peran
├── 🛡️ Hak Akses
└── ⚙️ Pengaturan Aplikasi
```

---

## Keputusan Teknis

| Keputusan | Detail |
|-----------|--------|
| **Cakupan** | Klinik rawat jalan, multi-tipe poliklinik dinamis |
| **Sistem Antrian** | Poll-based (frontend poll API setiap beberapa detik), bukan WebSocket — lebih sederhana, cukup untuk skala klinik |
| **Pencetakan** | Browser print (`window.print()`) dengan CSS `@media print` — tanpa PDF server-side |
| **Manajemen Stok** | FIFO implisit (tracking batch & expiry), bukan full warehouse management |
| **Bahasa UI** | Label UI dalam Bahasa Indonesia, kode dalam Bahasa Inggris |
| **Database** | Single PostgreSQL, single clinic deployment |
| **Tidak Termasuk (saat ini)** | Integrasi BPJS (PCare/VClaim), rawat inap, janji temu online, telemedicine, multi-cabang, aplikasi mobile |

---

## Verifikasi Per Fase

### Checklist Umum
- [ ] Migrasi database berhasil (tabel terbuat dengan benar)
- [ ] Seed data terisi dengan benar
- [ ] Semua endpoint API berfungsi (CRUD + edge case)
- [ ] Permission RBAC berfungsi (admin full akses, role lain terbatas)
- [ ] Halaman frontend tampil dan responsif
- [ ] Form validasi berjalan (frontend + backend)
- [ ] Pencarian dan filter berjalan
- [ ] Soft delete berfungsi

### Verifikasi Integrasi (Setelah Semua Fase)
- [ ] Alur lengkap: Pendaftaran → Antrian → EMR → Farmasi → Kasir → Cetak kwitansi
- [ ] Alur lab: EMR → Permintaan lab → Ambil sampel → Input hasil → Cetak → Billing
- [ ] Alur stok: PO → Terima → Stok update → Resep → Dispensing → Stok berkurang
- [ ] Laporan menampilkan data agregasi yang benar
- [ ] Role custom (misal "Dokter" — hanya EMR + resep) berjalan sesuai
- [ ] Template cetak tampil benar di Chrome & Firefox
- [ ] Responsif di tablet (umum digunakan di klinik)

---

## Ringkasan Total

| Komponen | Jumlah |
|----------|--------|
| Model Backend | ~30 model |
| Handler Backend | ~15 file handler |
| Endpoint API | ~80 endpoint |
| Halaman Frontend | ~40 halaman |
| Permission Baru | ~60 permission |
| Fase Implementasi | 8 fase |
| Seed Data | ICD-10, obat, tes lab, kategori, dll |

---

*Dokumen ini adalah panduan implementasi lengkap SIMKLINIK. Setiap fase dibangun secara bertahap dengan verifikasi independen sebelum lanjut ke fase berikutnya.*
