# WS DARI SERVER FKTP (API YANG AKAN DI HIT BPJS DARI SERVER FKTP)

## [GET] GENERATE TOKEN : {BASE_URL}/auth
Header : 
    x-username : {username}
    x-password : {password}

Format : JSON

```
{
    "response" : {
        "token" : "hasil generate token dari server fktp"
    },
    "metadata" : {
        "status" : "Ok",
        "code" : "200"
    }
}
```
## [GET] STATUS ANTREAN : {BASE_URL}/antrean/status/{kode_poli}/{tanggalperiksa}
Header : 
    x-token : {token dari server fktp}
    x-username : {username}

Format : JSON

```
{
    "response": {
        "namapoli": "Poli Umum",
        "totalantrean": "25",
        "sisaantrean": "4",
        "antreanpanggil": "A21",
        "keterangan": ""
    },
    "metadata": {
        "message": "Ok",
        "code": 200
    }
}
```

## [POST] AMBIL ANTRIAN : {BASE_URL}/antrean
Header :
    x-token : {token dari server fktp}
    x-username : {username}

Format : JSON

Request :
```
{
    "nomorkartu": "00012345678",
    "nik": "3212345678987654",
    "kodepoli": "001",
    "tanggalperiksa": "2020-01-28",
    "keluhan": "sakit kepala"
}
```

Response :
```
{
    "response": {
        "nomorantrean" : "A12",
        "angkaantrean" : "12",
        "namapoli" : "Poli Umum",
        "sisaantrean" : "4",
        "antreanpanggil" : "A8",
        "keterangan" : "Apabila antrean terlewat harap mengambil antrean kembali."
    },
    "metadata": {
        "message": "Ok",
        "code": 200
    }
}
```

## [GET] AMBIL ANTRIAN : {BASE_URL}/antrean/sisapeserta/{nomorkartu_jkn}/{kode_poli}/{tanggalperiksa}
Header :
    x-token : {token dari server fktp}
    x-username : {username}

Format : JSON

Response :
```
{
    "response": {
        "nomorantrean" : "A20",
        "namapoli" : "Poli Umum",
        "sisaantrean" : "4",
        "antreanpanggil" : "A8",
        "keterangan" : ""
    },
    "metadata": {
        "message": "Ok",
        "code": 200
    }
}
```

## [POST] PASIEN BARU : {BASE_URL}/peserta
Header :
    x-token : {token dari server fktp}
    x-username : {username}

Format : JSON

Request :
```
{
    "nomorkartu": "00012345678",
    "nik": "3212345678987654",
    "nomorkk": "3212345678987654",
    "nama": "sumarsono",
    "jeniskelamin": "L",
    "tanggallahir": "1985-03-01",
    "alamat": "alamat yang muncul merupakan alamat lengkap",
    "kodeprop": "11",
    "namaprop": "Jawa Barat",
    "kodedati2": "0120",
    "namadati2": "Kab. Bandung",
    "kodekec": "1319",
    "namakec": "Soreang",
    "kodekel": "D2105",
    "namakel": "Cingcin",
    "rw": "001",
    "rt": "013"
}
```

Response :
```
{
    "metadata": {
        "message": "Ok",
        "code": 200
    }
}
```

Catatan : 
- Metadata code:
    200: Sukses
    201: Gagal
- Selain metadata code 200, agar message pada metadata diisi sesuai dengan kondisi di lapangan

## [PUT] BATAL ANTREAN : {BASE_URL}/antrean/batal
Header :
    x-token : {token dari server fktp}
    x-username : {username}

Format : JSON

Request :
```
{
    "nomorkartu": "00012345678",
    "kodepoli": "001",
    "tanggalperiksa": "2020-01-28"
}
```

Response :
```
"metadata": {
    "code": 200,
    "message": "OK"
}
```

Catatan : 
- Metadata code:
    200: Sukses
    201: Gagal
- Selain metadata code 200, agar message pada metadata diisi sesuai dengan kondisi di lapangan

## [POST] AMBIL ANTREAN V2 : {BASE_URL}/antrean
Header :
    x-token : {token dari server fktp}
    x-username : {username}

Format : JSON

Request :
```
{
    "nomorkartu": "0000012345678",
    "nik": "3212345678987654",
    "kodepoli": "001",
    "tanggalperiksa": "2020-01-28",
    "keluhan": "sakit kepala",
    "kodedokter": 123456,
    "jampraktek": "08:00-12:00",
    "norm": "654321",
    "nohp": "081234567890"
}
```

Response :
```
{
    "response": {
        "nomorantrean" : "A12",
        "angkaantrean" : 12,
        "namapoli" : "Poli Umum",
        "sisaantrean" : "4",
        "antreanpanggil" : "A8",
        "keterangan" : "Apabila antrean terlewat harap mengambil antrean kembali."
    },
    "metadata": {
        "message": "Ok",
        "code": 200
    }
}
```

Catatan : 
- Metadata code:
    200: Sukses
    201: Gagal
    202: Pasien Baru
- Selain metadata code 200, agar message pada metadata diisi sesuai dengan kondisi di lapangan
- Jika metadata code 202 maka akan hit api PASIEN BARU

## [GET] STATUS ANTREAN V2 : {BASE_URL}/antrean/status/{kode_poli}/{tanggalperiksa}
Header :
    x-token : {token dari server fktp}
    x-username : {username}

Format : JSON

Response :
```
{
    "response": [
        {
            "namapoli" : "Poli Umum",
            "totalantrean" : "25",
            "sisaantrean" : 4,
            "antreanpanggil" : "A1-21",
            "keterangan" : "",
            "kodedokter" : 123456,
            "namadokter" : "Dr. Ali",
            "jampraktek" : "08:00-13:00"
        },
        {
            "namapoli" : "Poli Umum",
            "totalantrean" : "11",
            "sisaantrean" : 1,
            "antreanpanggil" : "A2-10",
            "keterangan" : "",
            "kodedokter" : 123466,
            "namadokter" : "Dr. Adi",
            "jampraktek" : "08:00-12:00"
        }
    ],
    "metadata": {
        "message": "Ok",
        "code": 200
    }
}
```

Catatan :
- Metadata code:
    200: Sukses
    201: Gagal
- Selain metadata code 200, agar message pada metadata diisi sesuai dengan kondisi di lapangan

## BATAL ANTREAN V2 : {BASE_URL}/antrean/batal
Header :
    x-token : {token dari server fktp}
    x-username : {username}

Format : JSON

Request :
```
{
    "nomorkartu": "00012345678",
    "kodepoli": "001",
    "tanggalperiksa": "2020-01-28",
    "keterangan": "peserta batal hadir"
}
```

Response :
```
{
    "metadata": {
        "message": "Ok",
        "code": 200
    }
}
```

Catatan : 
- Metadata code:
    200: Sukses
    201: Gagal
- Selain metadata code 200, agar message pada metadata diisi sesuai dengan kondisi di lapangan



# WS DARI BPJS (API YANG AKAN DIGUNAKAN OLEH FKTP)

## [GET] REFERENSI POLI : {BASE URL}/{Service Name}/ref/poli/tanggal/{tanggal}
Header :
    x-cons-id: {cons id akses}
    x-timestamp: {timestamp akses}
    x-signature: {signature akses}
    user_key: {userkey akses}

Respon : Perlu dilakukan dekripsi disisi client
```
{
  "metadata": {
    "code": 1,
    "message": "OK"
  },
  "response": {
    "list": [
      {
        "namapoli": "POLI UMUM",
        "nmsubspesialis": "AKUPUNTUR MEDIK",
        "kdsubspesialis": "AKP",
        "kodepoli": "001"
      },
      {
        "namapoli": "POLI GIGI & MULUT",
        "kodepoli": "002"
      }
    ]
  }
}
```

## [GET] REFERENSI DOKTER : {BASE_URL}/{Service Name}/ref/dokter/tanggal/{tanggal}
Header :
    x-cons-id: {cons id akses}
    x-timestamp: {timestamp akses}
    x-signature: {signature akses}
    user_key: {userkey akses}

Respon : Perlu dilakukan dekripsi disisi client
```
{
    "metadata": {
        "code": 1,
        "message": "OK"
    },
    "response": {
        "list": [
            {
                "namadokter": "drg. Kusumawati Sukadi, Sp.BM",
                "kodedokter": 700,
                "jampraktek": "07:00-12:00",
                "kapasitas": 100
            },
            {
                "namadokter": "Dr. Dr. Noer Rachma, Sp.KFR",
                "kodedokter": 854,
                "jampraktek": "12:00-16:00",
                "kapasitas": 60
            }
        ]
    }
}     
```

## [POST] AMBIL ANTRIAN : {BASE URL}/{Service Name}/antrean/add
Header :
    x-cons-id: {cons id akses}
    x-timestamp: {timestamp akses}
    x-signature: {signature akses}
    user_key: {userkey akses}

Format : JSON

Request :
```
{
   "nomorkartu": "{noka pasien BPJS,diisi kosong jika NON JKN}",
   "nik": "{nik pasien}",
   "nohp": "{no hp pasien}",
   "kodepoli": "{memakai kode subspesialis BPJS}",
   "namapoli": "{nama poli}",
   "norm": "{no rekam medis pasien}",
   "tanggalperiksa": "{tanggal periksa}",
   "kodedokter": {kode dokter BPJS},
   "namadokter": "{nama dokter}",
   "jampraktek": "{jam praktek dokter}",
   "nomorantrean": "{nomor antrean pasien}",
   "angkaantrean": {angka antrean},
   "keterangan": "{informasi untuk pasien}"
}   
```

Response : Perlu dilakukan dekripsi disisi client
```
{
   "metadata": {
      "message": "Ok",
      "code": 200
   }
}
```

## [POST] UPDATE/PANGGIL ANTRIAN : {BASE URL}/{Service Name}/antrean/panggil
Header :
    x-cons-id: {cons id akses}
    x-timestamp: {timestamp akses}
    x-signature: {signature akses}
    user_key: {userkey akses}

Format : JSON

Request :
```
{
   "tanggalperiksa": "2024-03-01",
   "kodepoli": "001",
   "nomorkartu": "0000034563234",
   "status": 1, ---> Status 1 = Hadir; Status 2 = Tidak Hadir
   "waktu": 1616559330000 ---> Waktu dalam bentuk timestamp milisecond
}
```

Response : Perlu dilakukan dekripsi disisi client
```
{
   "metadata": {
      "message": "Ok",
      "code": 200
   }
}
```

## [POST] BATAL ANTREAN : {BASE URL}/{Service Name}/antrean/batal
Header :
    x-cons-id: {cons id akses}
    x-timestamp: {timestamp akses}
    x-signature: {signature akses}
    user_key: {userkey akses}

Format : JSON

Request :
```
{
   "tanggalperiksa": "2024-01-03",
   "kodepoli": "001",
   "nomorkartu": "0000045258563",
   "alasan": "Terjadi perubahan jadwal dokter"
}
```

Response : Perlu dilakukan dekripsi disisi client
```
{
   "metadata": {
      "message": "Ok",
      "code": 200
   }
}
```

# CONTOH PHP UNTUK CREATE SIGNATURE DAN UNTUK DEKRIPSI RESPONSE DARI BPJS
1. X-cons-id, merupakan kode consumer (pengakses web-service). Kode ini akan diberikan oleh BPJS Kesehatan.
2. X-timestamp, merupakan waktu yang akan di-generate oleh client saat ingin memanggil setiap service. Format waktu ini ditulis dengan format unix-based-time (berisi angka, tidak dalam format tanggal sebagaimana mestinya). Format waktu menggunakan Coordinated Universal Time ( UTC), dalam penggunaannya untuk mendapatkan timestamp, rumus yang digunakan adalah (local time in UTC timezone in seconds) - (1970-01-01 in seconds).
3. X-signature, merupakan hasil dari pembuatan signature yang dibuat oleh client. Signature yang digunakan menggunakan pola HMAC-SHA256.
4. X-authorization, merupakan kombinasi dari username dan password dari aplikasi yang akan di bridging (PCare), dan untuk menghasilkan enkripsi dari authorization dapat menggunakan pola Base64 Basic.

username : usernamePcare
password : passwordPcare
kdAplikasi : 095
Authorization : Base64(username:password:kdAplikasi)

5. user_key, merupakan key untuk mengakses webservice. Setiap service consumer memiliki user_key masing-masing.

6. CONTOH CREATE SIGNATURE
```
<?php 
    $data = "testtesttest";
    $secretKey = "secretkey";
    // Computes the timestamp
    date_default_timezone_set('UTC');
    $tStamp = strval(time()-strtotime('1970-01-01 00:00:00'));
    // Computes the signature by hashing the salt with the secret key as the key
    $signature = hash_hmac('sha256', $data."&".$tStamp, $secretKey, true);
     
    // base64 encode…
    $encodedSignature = base64_encode($signature);
    // urlencode…
    // $encodedSignature = urlencode($encodedSignature);
     
    echo "X-cons-id: " .$data ." ";
    echo "X-timestamp:" .$tStamp ." ";
    echo "X-signature: " .$encodedSignature;
?>
```

7. CONTOH DEKRIPSI
```
<?php 
    require_once 'vendor/autoload.php';
    
    // function decrypt
    function stringDecrypt($key, $string){
        $encrypt_method = 'AES-256-CBC';
        // hash
        $key_hash = hex2bin(hash('sha256', $key));
        // iv - encrypt method AES-256-CBC expects 16 bytes - else you will get a warning
        $iv = substr(hex2bin(hash('sha256', $key)), 0, 16);
        $output = openssl_decrypt(base64_decode($string), $encrypt_method, $key_hash, OPENSSL_RAW_DATA, $iv);
        return $output;
    }
    
    // function lzstring decompress 
    // download libraries lzstring : https://github.com/nullpunkt/lz-string-php
    function decompress($string){
        return \LZCompressor\LZString::decompressFromEncodedURIComponent($string);
    }
?>
```