# SIMKLINIK Dental Procedure Feature

## Tujuan

Membangun fitur tindakan gigi yang:

1. Tetap memakai pondasi `MedicalRecord -> MedicalAction -> MedicalService` yang sudah ada.
2. Menambahkan konteks target klinis gigi seperti gigi, permukaan, kuadran, rahang, atau full mouth.
3. Terintegrasi dengan odontogram yang sudah tersedia.
4. Aman untuk billing, printing, informed consent, dan histori rekam medis.
5. Tidak membuat modul paralel yang duplikatif dengan alur tindakan umum.

## Kondisi Saat Ini di Repo

### Backend yang sudah tersedia

1. `MedicalAction` sudah ada di [backend/models/medical_action.go](../backend/models/medical_action.go).
2. `MedicalRecord` sudah memiliki relasi `Actions` di [backend/models/medical_record.go](../backend/models/medical_record.go).
3. Endpoint tambah dan hapus tindakan sudah ada di [backend/handlers/medical_records.go](../backend/handlers/medical_records.go).
4. `MedicalService` sudah dipakai sebagai master layanan di [backend/models/medical_service.go](../backend/models/medical_service.go).
5. Odontogram sudah tersedia lengkap dengan CRUD dan print.

### Frontend yang sudah tersedia

1. Section `procedure` sudah ada pada EMR.
2. Editor tindakan dasar sudah ada di [frontend/src/pages/emr/components/procedure-editor.tsx](../frontend/src/pages/emr/components/procedure-editor.tsx).
3. `sheet.tsx`, `form.tsx`, dan `section-editor-body.tsx` sudah punya alur tambah dan hapus tindakan.
4. Odontogram sheet dan odontogram chart sudah tersedia.

### Gap yang belum tertangani

1. Tindakan masih generik dan belum menyimpan target gigi.
2. Belum ada relasi tindakan ke tooth number atau surface.
3. Belum ada filter layanan khusus dental.
4. Belum ada sinkronisasi tindakan ke odontogram.
5. Belum ada format print tindakan gigi yang menyebut target klinis.
6. Belum ada validasi layanan yang mewajibkan target.

## Prinsip Desain

1. Tindakan gigi adalah ekstensi dari `MedicalAction`, bukan modul baru yang terpisah.
2. Target tindakan harus tersimpan terstruktur, bukan hanya di `notes`.
3. Histori tindakan harus tetap valid walaupun master layanan berubah.
4. Odontogram dan tindakan saling terhubung, tetapi tidak boleh saling mengubah diam-diam tanpa konfirmasi pengguna.
5. Implementasi harus tetap kompatibel dengan tindakan umum non-dental.

## Ruang Lingkup Fitur

### Masuk scope

1. Menambah tindakan gigi per entri `procedure`.
2. Menentukan target tindakan: full mouth, arch, quadrant, tooth, surface.
3. Menampilkan target pada daftar tindakan, ringkasan, print, dan billing context.
4. Menentukan layanan mana yang merupakan layanan dental.
5. Menyambungkan tindakan gigi ke odontogram aktif di kunjungan.
6. Menyediakan opsi sinkronisasi perubahan tindakan ke odontogram.
7. Menyediakan validasi backend dan frontend yang lengkap.
8. Menyediakan edit tindakan, bukan hanya add dan delete.

### Di luar scope awal

1. Treatment plan multi-visit jangka panjang.
2. Penjadwalan recall otomatis berbasis tindakan.
3. Klaim asuransi tindakan gigi.
4. CAD/CAM, prosthodontic workflow kompleks, atau lab order gigi eksternal.

## User Story yang Harus Didukung

1. Dokter gigi memilih layanan tambal komposit dan menetapkan target gigi 11 permukaan distal.
2. Dokter gigi memilih scaling full mouth tanpa harus memilih gigi satu per satu.
3. Dokter gigi memilih ekstraksi gigi 38 dan sistem bisa menawarkan sinkronisasi ke odontogram sebagai `extracted`.
4. Dokter gigi memilih crown gigi 14 dan target tindakan tampil di daftar tindakan serta PDF.
5. Dokter dapat mengedit tindakan bila salah target tanpa harus menghapus seluruh batch catatan.
6. Billing dapat membaca layanan tindakan seperti biasa, tetapi label detail tetap menyebut target klinis.
7. Jika layanan membutuhkan informed consent, UI memberi peringatan dan menghubungkan ke consent yang relevan.

## Model Data yang Direkomendasikan

### 1. Ubah `MedicalService`

Tambahkan field berikut ke [backend/models/medical_service.go](../backend/models/medical_service.go):

```go
ServiceDomain          string `gorm:"size:20;default:'general';index" json:"service_domain"`
TargetScope            string `gorm:"size:20;default:'none'" json:"target_scope"`
RequiresConsent        bool   `gorm:"default:false" json:"requires_consent"`
SupportsOdontogramSync bool   `gorm:"default:false" json:"supports_odontogram_sync"`
```

Nilai yang direkomendasikan:

1. `service_domain`: `general`, `dental`
2. `target_scope`: `none`, `full_mouth`, `arch`, `quadrant`, `tooth`, `surface`

Tujuan:

1. Memfilter layanan khusus dental di editor tindakan.
2. Menentukan apakah UI wajib meminta target.
3. Menentukan apakah layanan dapat menawarkan sinkronisasi ke odontogram.

### 2. Ubah `MedicalAction`

Tambahkan field snapshot ke [backend/models/medical_action.go](../backend/models/medical_action.go):

```go
MedicalServiceCodeSnapshot string                `gorm:"size:20" json:"medical_service_code_snapshot"`
MedicalServiceNameSnapshot string                `gorm:"size:200" json:"medical_service_name_snapshot"`
ServiceDomainSnapshot      string                `gorm:"size:20" json:"service_domain_snapshot"`
TargetScopeSnapshot        string                `gorm:"size:20" json:"target_scope_snapshot"`
Targets                    []MedicalActionTarget `gorm:"foreignKey:MedicalActionID" json:"targets,omitempty"`
```

Tujuan:

1. Histori aman bila nama atau konfigurasi layanan master berubah.
2. Response API langsung memuat target tindakan.

### 3. Tambah model baru `MedicalActionTarget`

Buat file baru [backend/models/medical_action_target.go](../backend/models/medical_action_target.go):

```go
type MedicalActionTarget struct {
    ID               uint           `gorm:"primarykey" json:"id"`
    CreatedAt        time.Time      `json:"created_at"`
    UpdatedAt        time.Time      `json:"updated_at"`
    DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
    MedicalActionID  uint           `gorm:"not null;index" json:"medical_action_id"`
    TargetScope      string         `gorm:"size:20;not null" json:"target_scope"`
    ToothNumber      string         `gorm:"size:8;index" json:"tooth_number"`
    SurfaceCodesJSON string         `gorm:"type:text" json:"surface_codes_json"`
    Quadrant         string         `gorm:"size:10" json:"quadrant"`
    Arch             string         `gorm:"size:10" json:"arch"`
    SortOrder        int            `gorm:"default:1" json:"sort_order"`
    Notes            string         `gorm:"type:text" json:"notes"`
}
```

Gunakan helper JSON slice di handler untuk expose `surface_codes: string[]` pada API. Simpan sebagai text JSON supaya sederhana dan konsisten dengan repo saat ini.

### 4. Relasi ke odontogram

Tidak perlu foreign key keras ke `OdontogramTooth` atau `OdontogramSurfaceFinding` untuk MVP. Simpan snapshot target klinis pada tindakan. Alasan:

1. Odontogram bisa direvisi berkali-kali.
2. Tindakan adalah catatan klinis yang harus tetap stabil walaupun chart berubah setelahnya.
3. Link longgar ke odontogram entry bisa ditambahkan nanti bila benar-benar diperlukan.

## Aturan Validasi Data

### Validasi `MedicalService`

1. `service_domain` wajib salah satu dari `general` atau `dental`.
2. `target_scope` wajib salah satu dari `none`, `full_mouth`, `arch`, `quadrant`, `tooth`, `surface`.
3. Bila `service_domain = general`, `target_scope` default `none`.
4. Bila `service_domain = dental`, `target_scope` boleh selain `none`.

### Validasi `MedicalAction`

1. `quantity >= 1`.
2. `medical_service_id` harus aktif dan valid.
3. Jika layanan dental memiliki `target_scope != none`, request harus membawa target minimal satu.
4. Jika `target_scope = tooth`, setiap target wajib punya `tooth_number` dan tidak perlu `surface_codes`.
5. Jika `target_scope = surface`, setiap target wajib punya `tooth_number` dan `surface_codes` minimal satu.
6. Jika `target_scope = quadrant`, setiap target wajib punya `quadrant`.
7. Jika `target_scope = arch`, setiap target wajib punya `arch`.
8. Jika `target_scope = full_mouth`, backend boleh menerima satu target dengan `target_scope = full_mouth` tanpa field lain.
9. `tooth_number` harus valid mengikuti definisi FDI yang sudah dipakai odontogram.
10. `surface_codes` harus valid dan tidak boleh duplikat.
11. Untuk gigi anterior, jangan terima `occlusal`.
12. Untuk gigi posterior, jangan terima `incisal`.

## Kontrak API yang Direkomendasikan

### Tambah tindakan

Endpoint lama di [backend/handlers/medical_records.go](../backend/handlers/medical_records.go#L1576) diperluas menjadi:

`POST /medical-records/:id/actions`

Request:

```json
{
  "medical_service_id": 14,
  "quantity": 1,
  "notes": "Restorasi komposit kelas III",
  "targets": [
    {
      "target_scope": "surface",
      "tooth_number": "11",
      "surface_codes": ["distal"]
    }
  ],
  "odontogram_sync": {
    "enabled": true,
    "odontogram_entry_id": 12,
    "mode": "suggested"
  }
}
```

### Edit tindakan

Tambahkan endpoint baru:

`PUT /medical-records/:id/actions/:actionId`

Alasan:

1. Tindakan gigi sering perlu koreksi target.
2. Delete lalu add ulang membuat histori UI lebih berantakan.

### Hapus tindakan

Endpoint lama tetap dipakai:

`DELETE /medical-records/:id/actions/:actionId`

Hapus child targets dalam transaksi yang sama.

### Response action

Response `MedicalAction` perlu preload:

1. `MedicalService`
2. `Doctor`
3. `Targets`

Contoh response:

```json
{
  "id": 91,
  "medical_record_id": 301,
  "medical_service_id": 14,
  "medical_service_name_snapshot": "Tambal Komposit",
  "service_domain_snapshot": "dental",
  "target_scope_snapshot": "surface",
  "quantity": 1,
  "price": 250000,
  "notes": "Restorasi komposit kelas III",
  "targets": [
    {
      "id": 301,
      "target_scope": "surface",
      "tooth_number": "11",
      "surface_codes": ["distal"]
    }
  ]
}
```

### Filter layanan tindakan

Perluas `GET /medical-services` di [backend/handlers/medical_services.go](../backend/handlers/medical_services.go) dengan query:

1. `service_domain=dental`
2. `target_scope=surface`
3. `supports_odontogram_sync=true`

## Integrasi Odontogram

### Prinsip

Odontogram dan tindakan harus saling mendukung, tetapi tidak digabung secara paksa.

### Skenario integrasi yang didukung

1. Pilih target tindakan dari odontogram aktif pada kunjungan.
2. Tampilkan tindakan yang sudah direkam sebagai daftar terpisah dari chart.
3. Tawarkan sinkronisasi setelah simpan tindakan bila layanan mendukung.

### Bentuk sinkronisasi yang direkomendasikan

1. `extraction` atau `odontektomi`: set `tooth_condition = extracted`
2. `implant`: set `tooth_condition = implant`
3. `crown`: set `tooth_condition = crown`
4. `filling` atau `restoration`: set `surface condition = restoration`
5. `sealant`: set `surface condition = sealant`

### Aturan sinkronisasi

1. Tidak otomatis berjalan tanpa konfirmasi dokter.
2. Harus memilih `odontogram_entry_id` yang akan diperbarui bila satu kunjungan punya lebih dari satu entry odontogram.
3. Bila tidak ada odontogram aktif, tindakan tetap boleh disimpan tanpa sinkronisasi.
4. Sinkronisasi harus tercatat dalam response atau audit log sederhana pada notes sistem bila diperlukan nanti.

## Desain Frontend

### Ubah tipe API di [frontend/src/lib/api.ts](../frontend/src/lib/api.ts)

Tambahkan tipe:

1. `MedicalActionTarget`
2. Field dental baru pada `MedicalService`
3. Field snapshot dan `targets` pada `MedicalActionItem`

Tambahkan method baru:

1. `medicalRecordsApi.updateAction(recordId, actionId, payload)`

### Ubah editor tindakan di [frontend/src/pages/emr/components/procedure-editor.tsx](../frontend/src/pages/emr/components/procedure-editor.tsx)

Editor tindakan baru sebaiknya mendukung:

1. Filter layanan berdasarkan `service_domain`.
2. Preview target sebelum simpan.
3. Edit tindakan existing.
4. Ringkasan target yang jelas di daftar tindakan.

Tampilan yang direkomendasikan:

1. Panel kiri: daftar tindakan yang sudah direkam.
2. Panel kanan: form input tindakan.
3. Saat memilih layanan, form target menyesuaikan otomatis dengan `target_scope`.

### Komponen frontend baru yang direkomendasikan

1. `dental-action-target-picker.tsx`
2. `dental-action-target-summary.tsx`
3. `dental-action-edit-dialog.tsx`
4. `dental-service-filter.tsx`

### Perilaku picker target

Untuk tiap `target_scope`:

1. `none`: tidak tampilkan picker.
2. `full_mouth`: tampilkan badge otomatis `Full Mouth`.
3. `arch`: pilih `upper` atau `lower`.
4. `quadrant`: pilih `Q1`, `Q2`, `Q3`, `Q4` atau label klinis yang konsisten.
5. `tooth`: pilih satu atau banyak gigi dari odontogram atau input FDI.
6. `surface`: pilih gigi lalu pilih permukaannya.

### Integrasi dengan odontogram UI

Jika kunjungan memiliki odontogram aktif:

1. Procedure editor bisa membuka modal pemilih target berbasis chart.
2. User klik gigi atau permukaan pada chart untuk membentuk target.
3. Target hasil pilih chart tampil sebagai chips.

Jika tidak ada odontogram aktif:

1. Tetap sediakan input manual tooth number.
2. Tetap validasi FDI number di frontend.

## Integrasi ke EMR Page

File yang harus disentuh:

1. [frontend/src/pages/emr/components/section-editor-body.tsx](../frontend/src/pages/emr/components/section-editor-body.tsx)
2. [frontend/src/pages/emr/sheet.tsx](../frontend/src/pages/emr/sheet.tsx)
3. [frontend/src/pages/emr/form.tsx](../frontend/src/pages/emr/form.tsx)

Perubahan:

1. `onAddAction` payload diperluas dengan `targets` dan `odontogram_sync`.
2. Tambahkan `onUpdateAction`.
3. Saat load record, `actions.targets` wajib tersedia.
4. Service list yang dikirim ke procedure editor harus menyertakan field dental baru.

## Billing dan Invoice

### Prinsip

Billing tetap mengambil nominal dari `MedicalAction`, tetapi deskripsi item harus bisa menyebut target klinis.

### Rekomendasi

1. Harga di `MedicalAction.price` tetap menyimpan unit price snapshot.
2. Total biaya = `price * quantity`.
3. Saat invoice item dibuat dari tindakan, gunakan label:
   `Tambal Komposit - 11 distal`
4. Jika target lebih dari satu, gunakan format ringkas:
   `Scaling - Full Mouth`
   `Fluoride Varnish - 11, 12, 21, 22`

## Informed Consent

Gunakan field `requires_consent` pada `MedicalService`.

Saat user memilih layanan dengan `requires_consent = true`:

1. Tampilkan warning di procedure editor.
2. Tautkan user ke informed consent pada batch `procedure` yang sama.
3. Status ringkasan EMR yang sekarang sudah membaca consent untuk section procedure tetap bisa dipakai.

## Printing

### Yang perlu dicetak

Pada PDF tindakan atau ringkasan rekam medis, setiap tindakan dental harus menampilkan:

1. Nama layanan.
2. Jumlah.
3. Target.
4. Catatan.
5. Dokter operator.

### Format target yang direkomendasikan

1. `11 distal`
2. `14 mesial, distal`
3. `Q1`
4. `Rahang atas`
5. `Full Mouth`

Jika belum ada print tindakan terpisah, minimal update bagian procedure pada print rekam medis agar target tidak hilang.

## Backward Compatibility

1. Tindakan lama tanpa target harus tetap tampil normal.
2. Frontend harus menganggap `targets` boleh kosong.
3. `MedicalService` lama tanpa `service_domain` otomatis dianggap `general`.
4. `target_scope` lama default `none`.

## Migrasi Database

### AutoMigrate

Tambahkan pada [backend/database/database.go](../backend/database/database.go):

1. field baru `MedicalService`
2. field baru `MedicalAction`
3. model baru `MedicalActionTarget`

### Seed data

Tambahkan layanan dental umum bila belum ada, misalnya:

1. Tambal Komposit
2. Tambal GIC
3. Sealant
4. Scaling
5. Ekstraksi Sederhana
6. Crown
7. Implant
8. Aplikasi Fluoride

Set `service_domain`, `target_scope`, `requires_consent`, dan `supports_odontogram_sync` sesuai kebutuhan.

## File yang Perlu Diubah

### Backend

1. [backend/models/medical_service.go](../backend/models/medical_service.go)
2. [backend/models/medical_action.go](../backend/models/medical_action.go)
3. `backend/models/medical_action_target.go`
4. [backend/models/medical_record.go](../backend/models/medical_record.go)
5. [backend/handlers/medical_services.go](../backend/handlers/medical_services.go)
6. [backend/handlers/medical_records.go](../backend/handlers/medical_records.go)
7. [backend/handlers/odontograms.go](../backend/handlers/odontograms.go)
8. [backend/database/database.go](../backend/database/database.go)
9. PDF print file yang menampilkan procedure bila ada.

### Frontend

1. [frontend/src/lib/api.ts](../frontend/src/lib/api.ts)
2. [frontend/src/pages/emr/components/procedure-editor.tsx](../frontend/src/pages/emr/components/procedure-editor.tsx)
3. [frontend/src/pages/emr/components/section-editor-body.tsx](../frontend/src/pages/emr/components/section-editor-body.tsx)
4. [frontend/src/pages/emr/sheet.tsx](../frontend/src/pages/emr/sheet.tsx)
5. [frontend/src/pages/emr/form.tsx](../frontend/src/pages/emr/form.tsx)
6. Komponen dental target baru.
7. Jika perlu, helper shared di folder odontogram untuk validasi target.

## Urutan Implementasi yang Direkomendasikan

### Fase A - Data model dan API

1. Tambah model dan migrasi.
2. Tambah filter field pada medical service.
3. Perluas add action.
4. Tambah update action.
5. Preload targets pada medical record queries.

### Fase B - UI tindakan gigi

1. Tambah field dental pada tipe API.
2. Ubah procedure editor agar paham target scope.
3. Tambah daftar target pada setiap action.
4. Tambah edit action.

### Fase C - Integrasi odontogram

1. Load odontogram aktif pada page procedure bila sheet dental.
2. Tambah picker target dari chart.
3. Tambah opsi sinkronisasi ke odontogram.

### Fase D - Printing dan billing context

1. Tampilkan target pada print procedure atau print rekam medis.
2. Tampilkan target pada label invoice item.

## Acceptance Criteria

Fitur dianggap selesai bila:

1. Dokter bisa menambah tindakan dental dengan target gigi atau permukaan.
2. Data target tersimpan terstruktur di backend.
3. Tindakan tampil kembali dengan target yang sama saat record dibuka ulang.
4. Dokter bisa mengedit target tindakan.
5. Service dental yang butuh target tidak bisa disimpan tanpa target.
6. Tindakan umum non-dental tetap berjalan tanpa perubahan perilaku.
7. Target tampil di UI daftar tindakan.
8. Target tampil di hasil cetak.
9. Integrasi odontogram berjalan dengan konfirmasi pengguna.
10. Build backend dan frontend tetap lolos.

## Checklist Testing

### Backend

1. Add action `target_scope = none`.
2. Add action `target_scope = tooth` dengan satu gigi.
3. Add action `target_scope = surface` dengan satu gigi banyak permukaan.
4. Add action `target_scope = full_mouth`.
5. Reject action tanpa target untuk layanan dental wajib target.
6. Reject `surface_codes` tidak valid.
7. Reject tooth number tidak valid.
8. Update action mengubah target.
9. Delete action menghapus targets child.
10. Get record preload targets dengan benar.

### Frontend

1. Procedure editor menyesuaikan UI saat layanan dipilih.
2. Tindakan lama tanpa target tetap bisa dibuka.
3. Edit action memuat target existing.
4. Picker odontogram menghasilkan target yang benar.
5. Ringkasan target tampil konsisten.

### Build

1. `cd backend && go build ./...`
2. `cd frontend && npm run build`

## Rekomendasi Final

Implementasi terbaik untuk SIMKLINIK ini adalah:

1. Pertahankan `MedicalAction` sebagai header item tindakan.
2. Tambahkan `MedicalActionTarget` sebagai child target klinis.
3. Tambahkan metadata dental pada `MedicalService`.
4. Tambahkan edit action dan integrasi odontogram yang eksplisit.
5. Tampilkan target pada UI, print, dan billing context.

Dengan desain ini, tindakan gigi akan konsisten dengan arsitektur repo saat ini, tetap fleksibel untuk kasus dental yang kompleks, dan tidak memecah alur tindakan umum yang sudah berjalan.