# SIMKLINIK Roadmap 30-60-90 Hari

Dokumen ini memecah peningkatan sistem ke tiga fase implementasi dengan fokus stabilitas operasional, kualitas data, dan skalabilitas.

## Sasaran Utama

- Menurunkan kegagalan sinkronisasi eksternal (khususnya SATUSEHAT).
- Mempercepat investigasi insiden produksi melalui observability yang jelas.
- Mengurangi risiko regresi alur klinis dan billing saat rilis fitur baru.

## 30 Hari (Fondasi Operasional)

1. Integrasi SATUSEHAT lebih tahan gagal
- Tambahkan endpoint retry untuk log sync gagal.
- Tambahkan guard duplikasi in-flight untuk mencegah submit ganda saat klik berulang.
- Tambahkan filter log berdasarkan `success`, `resource_type`, dan `operation`.

2. Monitoring minimum yang actionable
- Definisikan metrik harian: success rate sync, median latency sync, jumlah retry.
- Dashboard operasional sederhana dari log SATUSEHAT.

3. Standarisasi runbook insiden
- SOP saat SATUSEHAT down.
- SOP retry aman berbasis log.

## 60 Hari (Kualitas Data & Keamanan)

1. Data quality guardrails lintas modul
- Validasi wajib coding system klinis sebelum submit eksternal.
- Checklist data siap sync per resource.

2. Audit trail end-to-end
- Simpan before/after untuk perubahan klinis kritis.
- Tampilkan actor, timestamp, dan alasan aksi.

3. Hardening keamanan
- Rate limit login dan endpoint sinkronisasi.
- Review periodik permission per role.

## 90 Hari (Skala & Reliabilitas Lanjut)

1. Test strategy berlapis
- Contract test API.
- Integration test alur utama: pendaftaran -> EMR -> order -> billing -> sync.
- Smoke test pasca-deploy otomatis.

2. Performance and scalability
- Profiling query list besar (queue, EMR, order, invoice).
- Optimasi indeks dan pagination.

3. Disaster recovery readiness
- Jadwal drill restore berkala.
- Target RTO/RPO eksplisit dan terukur.

## Deliverable yang sudah diimplementasikan (fase 30 hari)

- Endpoint retry log sync SATUSEHAT gagal.
- Filter log SATUSEHAT berdasarkan status sukses/gagal.
- Guard duplikasi in-flight pada submit resource SATUSEHAT.

## KPI yang disarankan

- Sync success rate >= 98% per hari.
- Waktu pemulihan insiden sinkronisasi <= 30 menit.
- Jumlah submit duplikat turun >= 80%.
- Tidak ada deploy produksi tanpa smoke test hijau.
