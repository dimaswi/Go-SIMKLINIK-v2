# SATUSEHAT Log Filter and Retry

Dokumen ini menjelaskan endpoint operasional baru untuk investigasi dan pemulihan sinkronisasi SATUSEHAT.

## 1. Filter Log SATUSEHAT

Endpoint:

- `GET /api/satusehat/logs`

Query parameter:

- `limit` (opsional, default `50`, maksimum `200`)
- `resource_type` (opsional, contoh: `Observation`, `ServiceRequest`)
- `operation` (opsional, contoh: `sync`, `token`, `retry-sync`)
- `success` (opsional, nilai: `true`/`false` atau `1`/`0`)

Contoh penggunaan:

- Log sync gagal:
  - `GET /api/satusehat/logs?operation=sync&success=false&limit=100`
- Log retry yang sukses:
  - `GET /api/satusehat/logs?operation=retry-sync&success=true`
- Log resource tertentu:
  - `GET /api/satusehat/logs?resource_type=MedicationRequest&success=false`

## 2. Retry Log Sync Gagal

Endpoint:

- `POST /api/satusehat/logs/:id/retry`

Aturan retry:

- Hanya log dengan `operation=sync` dan `success=false` yang bisa di-retry.
- Endpoint log harus masih berada dalam base URL FHIR SATUSEHAT aktif.
- Request replay menggunakan token terbaru dan idempotency key.

Contoh penggunaan:

- Retry log dengan ID `1234`:
  - `POST /api/satusehat/logs/1234/retry`

Contoh respons sukses (ringkas):

```json
{
  "message": "Retry log SATUSEHAT berhasil diproses",
  "data": {
    "log_id": 1234,
    "result": {
      "method": "POST",
      "status_code": 201,
      "resource_type": "Observation",
      "resource_id": "..."
    }
  }
}
```

Contoh respons gagal (ringkas):

```json
{
  "error": "hanya log operation=sync yang bisa di-retry",
  "log_id": 1234
}
```

## 3. Alur Operasional Disarankan

1. Filter log gagal terlebih dahulu dengan `operation=sync&success=false`.
2. Prioritaskan retry untuk resource yang tidak punya dependency kompleks.
3. Setelah retry, cek ulang log dengan `operation=retry-sync`.
4. Jika tetap gagal, periksa `error_message` dan `response_body` pada log.
