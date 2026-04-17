## BPJS FKTP + P-Care Roadmap Prompt

Susun roadmap implementasi BPJS Antrean Online FKTP dan P-Care untuk SIMKLINIK dengan fokus pada klinik rawat jalan. Gunakan sistem lokal sebagai source of truth untuk pasien, tiket pendaftaran, dan visit. Jangan masukkan VClaim atau SEP ke scope awal.

## Objective

Hasil akhir yang diinginkan adalah alur pendaftaran dan pelayanan yang bisa berjalan dalam dua mode:

1. Jika integrasi BPJS tidak aktif, sistem tetap memakai flow pendaftaran normal yang sudah ada.
2. Jika integrasi BPJS aktif, sistem dapat memakai flow BPJS untuk antrean FKTP dan melanjutkan sinkronisasi ke P-Care tanpa memecah domain data lokal.

## Fixed Decisions

- Scope awal mencakup Antrean Online FKTP dan P-Care untuk klinik.
- VClaim dan SEP di luar scope awal.
- Antrean FKTP harus diselesaikan dan di-hardening lebih dulu sebelum modul P-Care penuh dibangun.
- Toggle dan readiness harus dipisahkan antara Antrean FKTP dan P-Care, bukan satu flag BPJS global.
- Inbound antrean BPJS sebaiknya membuat atau menghubungkan antrian pendaftaran lokal terlebih dulu sebelum menjadi visit final.

## Current State

- Konfigurasi BPJS Antrean sudah ada di backend dan frontend, tetapi masih sederhana.
- Outbound hook BPJS dari visit sudah ada untuk beberapa aksi seperti tambah, batal, dan panggil antrean.
- Inbound webhook Antrean FKTP di backend masih stub dan belum menjadi transaksi nyata.
- P-Care belum diimplementasikan.
- Front office registration saat ini masih berpusat pada flow lokal.

## Required Output

Buat hasil refinement dalam bentuk berikut:

1. Roadmap fase per fase yang realistis dan berurutan.
2. Breakdown teknis backend dan frontend untuk tiap fase.
3. Daftar perubahan model, route, service, dan UI yang paling mungkin dibutuhkan.
4. Risiko implementasi dan keputusan arsitektur penting.
5. Verification checklist untuk setiap fase dan untuk end-to-end flow.
6. Penjelasan alur kerja target untuk mode normal dan mode BPJS aktif, dari pendaftaran sampai masuk ke EMR dan lanjut ke proses pelayanan terkait.
7. Penjelasan perubahan UI dan UX yang dibutuhkan, termasuk halaman mana yang berubah, perilaku baru yang muncul, field mana yang otomatis, field mana yang dikunci, dan dampaknya ke petugas front office atau pengguna klinik.

## Workflow Explanation Required

Jelaskan alur kerja yang diusulkan secara eksplisit dan mudah dibaca untuk dua kondisi berikut:

1. Flow normal saat integrasi BPJS tidak aktif.
2. Flow BPJS saat Antrean FKTP aktif dan saat modul P-Care mulai dipakai.

Untuk masing-masing flow, jelaskan minimal:

- Titik masuk proses.
- Peran petugas atau user yang terlibat.
- Perpindahan status tiket, antrean, atau visit.
- Kapan data tetap lokal dan kapan sinkron ke BPJS.
- Titik keputusan yang membuat sistem memilih flow normal atau flow BPJS.
- Dampak ke langkah sebelum EMR, saat masuk EMR, dan setelah pelayanan selesai.

## UI and UX Changes Required

Jelaskan perubahan UI dan UX yang diperlukan, bukan hanya perubahan endpoint atau model. Bahas minimal area berikut:

1. Halaman settings integrations.
2. Halaman pendaftaran atau front office.
3. Halaman antrean atau monitoring operasional jika diperlukan.
4. Titik di EMR atau workspace dokter yang perlu tahu status BPJS atau P-Care.

Untuk setiap area UI, jelaskan minimal:

- Tujuan perubahan.
- Komponen atau section yang perlu ditambah, diubah, atau dipisah.
- Perbedaan perilaku saat BPJS nonaktif vs aktif.
- Data apa yang diisi otomatis dari BPJS dan apa yang tetap manual.
- Validasi atau feedback yang harus muncul ke user.
- Risiko UX yang perlu dihindari, misalnya front office kehilangan kontrol, status integrasi tidak jelas, atau terlalu banyak field teknis tampil ke user operasional.

## Planning Rules

- Prioritaskan reuse atas alur pendaftaran lokal yang sudah ada.
- Hindari membuat domain data BPJS terpisah jika bisa direpresentasikan sebagai metadata atau status pada entitas lokal.
- Gunakan orchestration layer bersama agar manual registration dan inbound BPJS memakai mesin bisnis yang sama.
- Pisahkan concern konfigurasi, observability, orchestration, dan UI supaya roadmap tidak tercampur.
- Tempatkan P-Care setelah fondasi Antrean FKTP, konfigurasi, dan logging cukup stabil.
- Saat membahas UI dan UX, prioritaskan kejelasan operasional untuk front office, dokter, dan admin dibanding menampilkan detail integrasi teknis secara langsung.
- Saat membahas workflow, jelaskan bentuk transisi user-facing, bukan hanya urutan API internal.

## Proposed Work Phases

1. Phase 1: Split konfigurasi BPJS menjadi domain Antrean FKTP dan P-Care, lengkap dengan readiness, test connection, dan status per domain.
2. Phase 1: Rapikan observability dan logging transaksi integrasi agar error inbound dan outbound tidak silent.
3. Phase 1: Perluas UI settings integrations agar bisa mengelola Antrean FKTP dan P-Care secara terpisah.
4. Phase 2: Implementasikan endpoint inbound Antrean FKTP secara penuh sesuai dokumen BPJS: auth, status antrean, tambah antrean, sisa antrean peserta, pasien baru, dan batal antrean.
5. Phase 2: Refactor alur pendaftaran lokal menjadi service atau orchestrator bersama yang bisa dipakai oleh flow manual dan flow BPJS.
6. Phase 2: Tambahkan metadata source registration dan branching rules agar sistem bisa memilih flow BPJS atau flow normal tanpa duplikasi domain.
7. Phase 2: Sesuaikan frontend pendaftaran agar mendukung dual flow dan tetap menjaga kontrol front office.
8. Phase 3: Bangun package client P-Care baru dengan config, auth or signature, endpoint methods, error normalization, dan health check.
9. Phase 3: Implementasikan lookup atau referensi P-Care lebih dulu, lalu submit pelayanan: pendaftaran atau kunjungan, diagnosa, tindakan, obat.
10. Phase 3: Tambahkan rujukan P-Care setelah flow pelayanan inti cukup stabil.
11. Phase 4: Tambahkan retry manual, audit trail, monitoring operasional, dan validasi end-to-end.

## Relevant Files

- e:/Golang/Go-SIMKLINIK/backend/main.go
- e:/Golang/Go-SIMKLINIK/backend/handlers/bpjs_webhook.go
- e:/Golang/Go-SIMKLINIK/backend/handlers/visits.go
- e:/Golang/Go-SIMKLINIK/backend/handlers/registration_queue.go
- e:/Golang/Go-SIMKLINIK/backend/handlers/settings.go
- e:/Golang/Go-SIMKLINIK/backend/services/bpjs/config.go
- e:/Golang/Go-SIMKLINIK/backend/services/bpjs/client.go
- e:/Golang/Go-SIMKLINIK/backend/middleware/bpjs.go
- e:/Golang/Go-SIMKLINIK/backend/models/visit.go
- e:/Golang/Go-SIMKLINIK/backend/models/registration_queue.go
- e:/Golang/Go-SIMKLINIK/backend/models/patient.go
- e:/Golang/Go-SIMKLINIK/backend/models/polyclinic.go
- e:/Golang/Go-SIMKLINIK/backend/models/doctor.go
- e:/Golang/Go-SIMKLINIK/frontend/src/pages/settings/integrations.tsx
- e:/Golang/Go-SIMKLINIK/frontend/src/lib/api.ts
- e:/Golang/Go-SIMKLINIK/frontend/src/pages/registration/create.tsx
- e:/Golang/Go-SIMKLINIK/frontend/src/pages/emr/workspace.tsx
- e:/Golang/Go-SIMKLINIK/docs/[ANTRIAN FKTP] WS FKTP.md
- e:/Golang/Go-SIMKLINIK/docs/SIMKLINIK-Plan.md

## Acceptance Criteria

- Saat BPJS nonaktif, flow pendaftaran lama tetap berjalan tanpa regresi.
- Saat Antrean FKTP aktif, inbound dan outbound antrean berjalan dengan data lokal yang konsisten.
- Saat P-Care aktif, submit pelayanan bisa dibangun di atas visit dan EMR lokal tanpa domain paralel baru.
- Admin dapat melihat readiness, log error, dan retry status integrasi.
- Konfigurasi Antrean FKTP dan P-Care bisa diaktifkan terpisah.

## Verification Focus

1. Verifikasi konfigurasi dan readiness per domain integrasi.
2. Verifikasi endpoint inbound Antrean FKTP sesuai kontrak BPJS.
3. Verifikasi branching pendaftaran antara flow lokal dan flow BPJS.
4. Verifikasi outbound antrean dari visit lokal setelah refactor orchestration.
5. Verifikasi lookup dan submit P-Care bertahap.
6. Verifikasi retry, logging, dan monitoring transaksi.
7. Verifikasi build minimum: `cd backend && go build ./...` dan `cd frontend && npm run build`.

## Constraints

- Jangan perluas scope ke VClaim atau SEP.
- Jangan usulkan desain yang memaksa migrasi total dari flow lokal yang sudah ada.
- Hindari solusi yang membuat BPJS menjadi source of truth utama.
- Jaga roadmap tetap pragmatis, bertahap, dan dapat diimplementasikan pada codebase ini.