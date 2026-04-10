# SATUSEHAT Rawat Jalan Mapping

Dokumen ini memetakan collection SATUSEHAT rawat jalan ke model dan workflow SIMKLINIK yang sudah ada saat ini.

## Ringkasan Workflow SIMKLINIK

1. Registrasi pasien rawat jalan dibuat sebagai `Visit`.
2. Konsultasi klinis berjalan di `MedicalRecord` yang terhubung ke `Visit`, `Patient`, `Doctor`, dan `Polyclinic`.
3. Diagnosis disimpan di child table `MedicalRecordDiagnosis`.
4. Resep disimpan di `Prescription` dan `PrescriptionCompound`, lalu dispensing aktual dicatat di `Dispensing`.
5. Order laboratorium dan radiologi disimpan di `LaboratoryOrderItem` dan `RadiologyOrderItem` dengan detail hasil pada tabel parameter result masing-masing.
6. Tindakan medis disimpan di `MedicalAction`.
7. Penagihan dan pembayaran dikelola oleh `Invoice`, `InvoiceItem`, dan `Payment`.

## Mapping Resource SATUSEHAT ke SIMKLINIK

| Resource SATUSEHAT | Model SIMKLINIK | Sumber field utama | Catatan |
| --- | --- | --- | --- |
| Patient | `Patient` | `medical_record_number`, `nik`, `full_name`, `birth_date`, `gender`, `address`, `city`, `province`, `postal_code`, `phone`, `email` | Data demografi pasien sudah cukup kuat untuk fondasi resource Patient. |
| Encounter | `Visit` | `visit_number`, `visit_date`, `patient_id`, `doctor_id`, `polyclinic_id`, `queue_number`, `status`, `complaint`, `payment_type` | `Visit` adalah header encounter paling kuat di SIMKLINIK. |
| Practitioner | `Doctor` | `full_name`, `nip_number`, `sip_number`, `specialization`, `phone` | Saat ini dokter adalah kandidat utama untuk SATUSEHAT Practitioner. |
| PractitionerRole | `Doctor` + relasi `Polyclinics` | relasi many-to-many dokter-poli | Belum ada model role formal; sementara bisa diturunkan dari assignment poli. |
| Organization | `Polyclinic` dan setting aplikasi | `name`, `code`, `description` | Saat ini Organization unit layanan diturunkan dari master `Polyclinic`, dengan `satusehat_organization_id` tersimpan per poli. |
| Location | `Polyclinic` | `name`, `code`, `description` | Saat ini Location ruangan diturunkan dari master `Polyclinic` sebagai `Ruang {nama_poli}` dan menyimpan `satusehat_location_id` per poli. |
| Condition (chief complaint / problems) | `MedicalRecord`, `MedicalRecordDiagnosis` | `chief_complaint`, `working_diagnosis`, `differential_diagnosis`, child diagnoses ICD-10 | Keluhan utama masih teks bebas; diagnosis sudah lebih siap karena memakai ICD-10. |
| Observation (vital signs) | `MedicalRecord` | `bp_systolic`, `bp_diastolic`, `heart_rate`, `temperature`, `respiratory_rate`, `spo2`, `height`, `weight`, `bmi`, `pain_scale`, `consciousness` | Cocok untuk Observation, tetapi coding LOINC belum ada. |
| ClinicalImpression | `MedicalRecord` | `assessment`, `subjective`, `physical_examination`, `supporting_examination`, `plan` | Bagian assessment klinis bisa dibentuk dari isi rekam medis. |
| AllergyIntolerance | `Patient` dan `MedicalRecord` | `allergies`, `allergy_notes`, `clinical_alert` | Saat ini masih dominan teks bebas, belum terstruktur per alergen/reaksi. |
| FamilyMemberHistory | `MedicalRecord` | `family_history` | Ada sebagai narasi, belum berbentuk struktur relasi keluarga. |
| CarePlan | `MedicalRecord` | `plan`, `follow_up_instruction`, `follow_up_at` | Belum ada model care plan khusus, tetapi rencana tindak lanjut sudah tersedia. |
| ServiceRequest (laboratorium) | `MedicalRecord` + `LaboratoryOrderItem` | `medical_service_id`, `test_code_snapshot`, `test_name_snapshot`, `instructions` | Workflow order lab sudah ada dan cukup dekat dengan ServiceRequest. |
| Specimen (laboratorium) | Master `MedicalService` laboratorium + transaksi `LaboratoryOrderItem` | Default atau opsi spesimen diturunkan dari tindakan medis/layanan laboratorium, lalu dibentuk menjadi data spesimen transaksi saat order berjalan | Collection SATUSEHAT laboratorium tetap memakai resource `Specimen` terpisah yang dihubungkan ke `ServiceRequest`, tetapi user sebaiknya tidak memilih template specimen manual jika sudah bisa diturunkan dari master layanan. |
| Observation / DiagnosticReport (laboratorium) | `LaboratoryOrderItem`, `LaboratoryOrderParameterResult` | `result_value`, `result_notes`, `flag`, `result_date`, parameter results | Hasil lab paling siap untuk dikonversi ke Observation dan DiagnosticReport. |
| ServiceRequest (radiologi) | `MedicalRecord` + `RadiologyOrderItem` | `medical_service_id`, `service_code_snapshot`, `service_name_snapshot`, `instructions` | Order radiologi juga sudah mengikuti pola order header + item. |
| DiagnosticReport (radiologi) | `RadiologyOrderItem`, `RadiologyOrderParameterResult` | `findings`, `impression`, `recommendation`, `result_notes`, `result_date` | Report radiologi cukup kuat karena sudah ada narasi klinis. |
| Procedure | `MedicalAction` | `medical_service_id`, `doctor_id`, `service_code_snapshot`, `service_name_snapshot`, `notes`, `quantity` | Kandidat langsung untuk SATUSEHAT Procedure. |
| Medication (master farmasi) | `Medicine` | `code`, `name`, `generic_name`, `form`, `strength`, `manufacturer` | Untuk mengikuti contoh SATUSEHAT, `Medicine.code` idealnya menyimpan kode KFA; `form` dan `manufacturer` juga sebaiknya dimapping untuk resource Medication master. |
| MedicationRequest | `Prescription`, `PrescriptionCompound` | `medicine_id`, `quantity`, `dosage`, `frequency`, `duration`, `route`, `instructions`, `notes` | Collection SATUSEHAT farmasi umumnya memakai `medicationReference` ke resource `Medication`, bukan hanya codeable concept inline. |
| MedicationDispense | `Dispensing` | `visit_id`, `medical_record_id`, `prescription_id`, `medicine_id`, `quantity`, `batch_number`, `dispensed_at`, `dispensed_by`, `status` | Data dispensing aktual sudah tersedia, tetapi idealnya tetap memakai master `Medication` ber-KFA dan `authorizingPrescription` dari `MedicationRequest`. |
| Composition / Resume | `MedicalRecord` + child tables | ringkasan dari anamnesis, pemeriksaan, diagnosis, tindakan, resep, lab, radiologi | Belum ada model FHIR composition, tapi bahan ringkasannya sudah lengkap. |
| Account / Billing | `Invoice`, `InvoiceItem`, `Payment` | `invoice_number`, `sub_total`, `discount`, `tax`, `total_amount`, `status`, pembayaran | Ini opsional untuk fase klinis awal, tapi bisa disiapkan belakangan. |

## Mapping Master Referensi dan Resource Transaksi

### Laboratorium

Urutan resource yang paling dekat dengan collection SATUSEHAT untuk laboratorium adalah:

1. `Patient`
2. `Encounter`
3. `ServiceRequest`
4. `Specimen`
5. `Observation`
6. `DiagnosticReport`

Catatan penting:

- `Specimen` bukan sekadar detail tambahan. Pada contoh SATUSEHAT, hasil laboratorium merujuk ke `Specimen/{id}`.
- Keputusan desain yang disarankan: mapping specimen ditempel di master tindakan medis atau layanan laboratorium (`MedicalService`), agar user tidak perlu memilih template specimen manual setiap kali membuat order.
- Implementasi master yang lebih rapi: gunakan `SpecimenTemplate` sebagai kamus specimen reusable, lalu hubungkan ke layanan laboratorium melalui relasi `MedicalServiceSpecimen`.
- Jika satu layanan hanya punya satu specimen, sistem langsung menurunkan specimen default dari master layanan.
- Jika satu layanan punya lebih dari satu kemungkinan specimen, simpan sebagai opsi specimen pada master layanan dan minta user memilih hanya saat order memang ambigu.
- SIMKLINIK tetap perlu menyimpan data spesimen transaksi per order, minimal jenis spesimen, waktu pengambilan, waktu diterima, dan penghubung ke `LaboratoryOrderItem`; fondasi ini sekarang diarahkan ke tabel transaksi specimen turunan dari master layanan.

### Farmasi

Untuk farmasi, resource master yang paling penting biasanya adalah `Medication`, dan identitas produk obatnya umumnya memakai KFA.

Urutan mapping yang disarankan:

1. `Medicine` lokal -> `Medication`
2. `Prescription` -> `MedicationRequest`
3. `Dispensing` -> `MedicationDispense`

Field master farmasi yang perlu diprioritaskan pada `Medicine`:

- `code` -> kode KFA produk obat
- `name` / `generic_name` -> display obat
- `form` -> bentuk sediaan untuk resource `Medication`
- `strength` -> kekuatan sediaan
- `manufacturer` -> pabrikan, idealnya nanti bisa dimapping ke `Organization`

Catatan implementasi:

- Kalau `Medicine.code` masih kode internal seperti `OBT-001` atau format lokal lain, itu belum bisa dianggap sebagai kode KFA.
- `MedicationRequest` dan `MedicationDispense` akan lebih konsisten bila memakai `medicationReference` ke resource `Medication` yang sudah lebih dulu tersinkron.
- Untuk obat racikan, KFA biasanya tetap dibutuhkan minimal pada komponen bahan aktif atau perlu strategi master tersendiri sesuai profil SATUSEHAT yang dipakai.

## Model SIMKLINIK yang Paling Penting untuk Integrasi

- `backend/models/patient.go`
- `backend/models/visit.go`
- `backend/models/medical_record.go`
- `backend/models/medical_record_diagnosis.go`
- `backend/models/prescription.go`
- `backend/models/prescription_compound.go`
- `backend/models/dispensing.go`
- `backend/models/laboratory_order_item.go`
- `backend/models/laboratory_order_parameter_result.go`
- `backend/models/radiology_order_item.go`
- `backend/models/radiology_order_parameter_result.go`
- `backend/models/medical_action.go`
- `backend/models/medicine.go`
- `backend/models/specimen_template.go`
- `backend/models/medical_service_specimen.go`
- `backend/models/laboratory_order_specimen.go`

Status implementasi saat ini untuk laboratorium:

- Preview dan sync item laboratorium sekarang sudah mencakup urutan `ServiceRequest -> Specimen -> Observation -> DiagnosticReport`.
- Resource `Observation` dan `DiagnosticReport` laboratorium kini membawa reference ke `Specimen/{id}` bila specimen transaksi tersedia dan valid.
- ID hasil sinkronisasi `Specimen` disimpan pada `laboratory_order_specimens.satusehat_specimen_id` agar update berikutnya dapat memakai pola upsert yang sama dengan resource SATUSEHAT lain.

## Gap yang Masih Ada

### 1. External ID SATUSEHAT belum ada

Model inti seperti `Patient`, `Visit`, dan `MedicalRecord` belum punya field untuk menyimpan ID resource SATUSEHAT. Tanpa ini, sinkronisasi update atau referensi ulang akan sulit.

Rekomendasi awal:

- `satusehat_patient_id` pada `Patient`
- `satusehat_encounter_id` pada `Visit`
- field resource ID tambahan sesuai kebutuhan pada order, hasil, resep, dan dispensing

### 2. Coding standar belum tersedia

SIMKLINIK sudah punya nilai klinis, tapi belum punya layer kode standar seperti LOINC, SNOMED, ATC, atau kode referensi SATUSEHAT pada banyak field.

Contoh:

- vital signs di `MedicalRecord` belum punya mapping LOINC
- `Medicine.code` masih internal, belum jelas kode KFA/ATC
- layanan lab/radiologi masih butuh penyesuaian kode referensi eksternal

### 3. Facility organization dan location masih disederhanakan dari master poli

SATUSEHAT collection memakai Organization dan Location secara eksplisit, termasuk struktur unit dan ruangan. SIMKLINIK sekarang sudah bisa menurunkan Organization dan Location dari `Polyclinic`, menyimpan ID SATUSEHAT per poli, dan memakai `satusehat_location_id` poli pada payload `Encounter`. Namun struktur ini masih level awal karena belum memodelkan hirarki fasilitas yang lebih rinci di luar poli.

### 4. Data alergi, riwayat keluarga, dan care plan masih naratif

Beberapa kebutuhan collection SATUSEHAT tersedia dalam bentuk teks bebas, bukan struktur terpisah.

Contoh:

- `Patient.allergies`
- `MedicalRecord.family_history`
- `MedicalRecord.plan`
- `MedicalRecord.follow_up_instruction`

Ini tetap bisa di-export, tetapi tahap awal akan banyak memakai narasi, belum resource yang sangat granular.

## Urutan Implementasi yang Disarankan

### Fase 1: pondasi integrasi

1. Tambahkan field external ID SATUSEHAT pada model inti.
2. Buat service untuk memilih endpoint aktif dari settings SATUSEHAT.
3. Buat OAuth token fetcher dari `satusehat_active_mode`, `satusehat_client_id`, `satusehat_client_secret`, `satusehat_*_auth_url`.

### Fase 2: resource paling siap

1. `Patient` dari model pasien.
2. `Practitioner` dari model dokter.
3. `Encounter` dari model visit.

### Fase 3: data klinis inti

1. `Observation` dari vital sign dan pemeriksaan utama.
2. `Condition` dari diagnosis ICD-10.
3. `ClinicalImpression` dari assessment rekam medis.

### Fase 4: order dan hasil penunjang

1. `ServiceRequest` laboratorium.
2. `Observation` dan `DiagnosticReport` laboratorium.
3. `ServiceRequest` radiologi.
4. `DiagnosticReport` radiologi.

### Fase 5: farmasi dan tindakan

1. `MedicationRequest` dari resep.
2. `MedicationDispense` dari dispensing.
3. `Procedure` dari medical action.

### Fase 6: resume dan dokumen

1. `Composition` untuk resume rawat jalan.
2. perluasan informed consent, media, dan audit trail bila dibutuhkan.

## Prioritas Mapping Praktis untuk SIMKLINIK

Kalau target awal adalah integrasi rawat jalan yang realistis, urutan paling efektif adalah:

1. Patient
2. Practitioner
3. Encounter
4. Observation vital signs
5. Condition diagnosis
6. ClinicalImpression
7. ServiceRequest + DiagnosticReport laboratorium
8. ServiceRequest + DiagnosticReport radiologi
9. MedicationRequest + MedicationDispense
10. Procedure

Dengan urutan ini, SIMKLINIK bisa mulai mengirim data klinis yang paling kuat dulu tanpa menunggu seluruh resource SATUSEHAT selesai sekaligus.

## Implementasi Fase Awal yang Sudah Disiapkan

Backend sekarang sudah memiliki fondasi awal untuk memulai integrasi SATUSEHAT rawat jalan:

1. Field external SATUSEHAT ID ditambahkan pada model inti:
	- `Patient.satusehat_patient_id`
	- `Doctor.satusehat_practitioner_id`
	- `Visit.satusehat_encounter_id`
2. Service konfigurasi SATUSEHAT membaca mode aktif, auth URL, FHIR URL, organization ID, client ID, dan client secret dari settings.
3. Service token awal sudah tersedia untuk menguji koneksi OAuth2 sesuai mode aktif sandbox atau production.
4. Endpoint preview resource awal sudah tersedia untuk memeriksa payload Organization poli, Location poli, Patient, Practitioner, dan Encounter sebelum mulai submit ke SATUSEHAT.

Endpoint backend fase awal:

- `GET /api/satusehat/status`
- `POST /api/satusehat/test-connection`
- `GET /api/satusehat/organizations/:id/preview`
- `GET /api/satusehat/locations/:id/preview`
- `GET /api/satusehat/patients/:id/preview`
- `GET /api/satusehat/practitioners/:id/preview`
- `GET /api/satusehat/encounters/:id/preview`
- `GET /api/satusehat/medical-records/:id/vital-signs/preview`
- `GET /api/satusehat/medical-records/:id/clinical-impression/preview`
- `GET /api/satusehat/laboratory-order-items/:id/preview`
- `GET /api/satusehat/radiology-order-items/:id/preview`
- `GET /api/satusehat/prescriptions/:id/preview`
- `GET /api/satusehat/dispensings/:id/preview`
- `GET /api/satusehat/diagnoses/:id/preview`
- `POST /api/satusehat/organizations/:id/sync`
- `POST /api/satusehat/locations/:id/sync`
- `POST /api/satusehat/patients/:id/sync`
- `POST /api/satusehat/practitioners/:id/sync`
- `POST /api/satusehat/encounters/:id/sync`
- `POST /api/satusehat/medical-records/:id/vital-signs/sync`
- `POST /api/satusehat/medical-records/:id/clinical-impression/sync`
- `POST /api/satusehat/laboratory-order-items/:id/sync`
- `POST /api/satusehat/radiology-order-items/:id/sync`
- `POST /api/satusehat/prescriptions/:id/sync`
- `POST /api/satusehat/dispensings/:id/sync`
- `POST /api/satusehat/diagnoses/:id/sync`

Tujuan fase ini adalah memastikan konfigurasi dan mapping resource dasar sudah bisa diverifikasi dulu sebelum masuk ke submission workflow yang lebih kompleks seperti Observation, Condition, DiagnosticReport, MedicationRequest, dan MedicationDispense.

Alur sinkron awal yang disarankan:

1. Sync `Patient`
2. Sync `Practitioner`
3. Sync `Organization` poli terkait
4. Sync `Location` poli terkait
5. Sync `Encounter`

Urutan ini penting karena payload Encounter membutuhkan reference ke SATUSEHAT Patient ID, SATUSEHAT Practitioner ID, dan SATUSEHAT Location ID poli yang sudah tersimpan lebih dahulu di SIMKLINIK.

Fase klinis awal berikutnya yang sekarang sudah disiapkan:

1. Vital signs dari `MedicalRecord` dapat dipecah menjadi beberapa resource `Observation` dan disimpan balik per key observation ke field `satusehat_vital_sign_ids`.
2. Diagnosis dari `MedicalRecordDiagnosis` dapat dikirim sebagai resource `Condition` dan menyimpan balik `satusehat_condition_id`.
3. Assessment rekam medis dapat dikirim sebagai `ClinicalImpression` dan menyimpan balik `satusehat_clinical_impression_id`.
4. Item laboratorium dapat dikirim sebagai `ServiceRequest`, lalu jika hasil tersedia akan dilanjutkan menjadi `Observation` dan `DiagnosticReport` dengan ID SATUSEHAT tersimpan pada item order dan parameter result.
5. Item radiologi dapat dikirim sebagai `ServiceRequest`, parameter terstruktur menjadi `Observation`, dan hasil naratif temuan/impression menjadi `DiagnosticReport` dengan ID SATUSEHAT tersimpan pada item order dan parameter result.
6. Resep obat non-racikan dapat dikirim sebagai `MedicationRequest`, lalu dispensing aktual dapat dikirim sebagai `MedicationDispense` dengan referensi ke `MedicationRequest` yang sudah tersinkron.

Dependensi penting untuk fase klinis ini:

1. `Patient` sudah tersinkron agar reference `subject` valid.
2. `Encounter` sudah tersinkron agar reference `encounter` valid.
3. `Doctor` idealnya juga sudah tersinkron agar `performer` atau `recorder` bisa dikirim dengan reference SATUSEHAT yang benar.