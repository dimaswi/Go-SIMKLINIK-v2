import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';

import { publicTteApi, resolveAssetUrl, type TteVerificationResult } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { cn } from '@/lib/utils';

function getTokenFromHash() {
  const hashToken = decodeURIComponent(window.location.hash.replace(/^#/, '').trim());
  if (hashToken) return hashToken;
  const params = new URLSearchParams(window.location.search);
  return (params.get('token') || '').trim();
}

function buildFallbackResult(reason: string): TteVerificationResult {
  return {
    is_valid: false,
    status_label: 'TIDAK VALID',
    status_tone: 'invalid',
    title: 'Validasi Dokumen Gagal',
    description: 'Kode QR verifikasi tidak tersedia atau formatnya tidak dikenali.',
    hospital_name: 'SIMKLINIK',
    hospital_address: '',
    hospital_contact: '',
    hospital_logo_url: '',
    hospital_website: '',
    document_label: '-',
    document_key: '-',
    signer_name: '-',
    signed_at_label: '-',
    visit_number: '-',
    patient_name: '-',
    medical_record_number: '-',
    polyclinic_name: '-',
    document_reference: '-',
    checked_at_label: '-',
    verification_hash: '-',
    guidance: 'Pastikan kode QR dipindai dari dokumen cetak terbaru.',
    reason,
  };
}

export default function PublicTteVerifyPage() {
  const [result, setResult] = useState<TteVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);

  const token = useMemo(() => getTokenFromHash(), []);

  useEffect(() => {
    setPageTitle('Verifikasi Tanda Tangan Elektronik (TTE)');

    let cancelled = false;

    const load = async () => {
      if (!token) {
        setResult(buildFallbackResult('Token verifikasi tidak ditemukan pada tautan QR.'));
        setLoading(false);
        return;
      }

      try {
        const response = await publicTteApi.verify(token);
        if (!cancelled) {
          setResult(response.data.data);
        }
      } catch {
        if (!cancelled) {
          setResult(buildFallbackResult('Layanan verifikasi tidak dapat dijangkau saat ini.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const hospitalLogo = resolveAssetUrl(result?.hospital_logo_url);
  const isValid = Boolean(result?.is_valid);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center bg-slate-100 p-4 text-slate-950">
        <div className="flex items-center gap-3 border border-slate-400 bg-white px-5 py-3.5 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-900" />
          <span className="text-sm font-semibold">Memverifikasi tanda tangan elektronik...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-slate-100 text-slate-950 sm:px-4 sm:py-6">
      <div className="mx-auto w-full max-w-2xl bg-white sm:shadow-sm">
        {/* Bingkai Dokumen Resmi Menyatu (Gaya Cetakan PDF SIMKLINIK) */}
        <div className="border-y border-slate-900 sm:border">
          {/* 1. KOP KLINIK */}
          <div className="border-b-2 border-slate-900 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-3.5">
              {hospitalLogo ? (
                <img
                  src={hospitalLogo}
                  alt={result?.hospital_name || 'SIMKLINIK'}
                  className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-slate-900 bg-white">
                  <ShieldCheck className="h-6 w-6 text-slate-900" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Sertifikat Verifikasi Tanda Tangan Elektronik (TTE)
                </p>
                <h1 className="truncate text-base font-extrabold uppercase tracking-tight text-slate-950 sm:text-lg">
                  {result?.hospital_name || 'SIMKLINIK'}
                </h1>
                {result?.hospital_address ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-700">{result.hospital_address}</p>
                ) : null}
                {result?.hospital_contact || result?.hospital_website ? (
                  <p className="text-[11px] leading-snug text-slate-600">
                    {[result?.hospital_contact, result?.hospital_website].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* 2. BANNER STATUS VERIFIKASI */}
          <div
            className={cn(
              'flex items-center justify-between gap-3 border-b border-slate-900 px-4 py-3 sm:px-5',
              isValid ? 'bg-emerald-50/90' : 'bg-rose-50/90'
            )}
          >
            <div className="flex items-center gap-2.5">
              {isValid ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" />
              ) : (
                <XCircle className="h-6 w-6 shrink-0 text-rose-700" />
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'text-xs font-extrabold uppercase tracking-wider',
                      isValid ? 'text-emerald-800' : 'text-rose-800'
                    )}
                  >
                    {result?.status_label || (isValid ? 'TERVERIFIKASI SAH' : 'TIDAK VALID')}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-800">{result?.title}</p>
              </div>
            </div>
            <span
              className={cn(
                'shrink-0 border px-2.5 py-1 font-mono text-[11px] font-bold uppercase',
                isValid
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-rose-700 bg-rose-700 text-white'
              )}
            >
              {isValid ? 'SAH / VALID' : 'INVALID'}
            </span>
          </div>

          {/* Pesan Gagal bila Tidak Valid */}
          {!isValid && result?.reason ? (
            <div className="flex items-start gap-2.5 border-b border-slate-900 bg-rose-50/40 px-4 py-3 text-xs text-rose-900 sm:px-5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
              <div>
                <p className="font-bold">Alasan Penolakan Verifikasi:</p>
                <p className="mt-0.5">{result.reason}</p>
              </div>
            </div>
          ) : null}

          {/* 3. SEKSI: DATA PENGESAHAN & PENANDATANGAN */}
          <div className="border-b border-slate-900 bg-slate-100 px-4 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-950">
            Data Pengesahan & Penandatangan
          </div>
          <div className="divide-y divide-slate-300 border-b border-slate-900 text-xs">
            <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
              <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                Nama Penandatangan
              </div>
              <div className="px-3 py-2.5 font-bold text-slate-950">{result?.signer_name || '-'}</div>
            </div>
            <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
              <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                Nama Dokumen
              </div>
              <div className="px-3 py-2.5 font-bold text-slate-950">{result?.document_label || '-'}</div>
            </div>
            <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
              <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                Jenis Dokumen
              </div>
              <div className="px-3 py-2.5 text-slate-900">{result?.document_reference || '-'}</div>
            </div>
            <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
              <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                Waktu TTD Elektronik
              </div>
              <div className="px-3 py-2.5 font-semibold text-slate-900">{result?.signed_at_label || '-'}</div>
            </div>
          </div>

          {/* 4. SEKSI: IDENTITAS PASIEN & KUNJUNGAN */}
          <div className="border-b border-slate-900 bg-slate-100 px-4 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-950">
            Identitas Pasien & Kunjungan
          </div>
          <div className="divide-y divide-slate-300 border-b border-slate-900 text-xs">
            <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
              <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                Nama Pasien
              </div>
              <div className="px-3 py-2.5 font-bold text-slate-950">{result?.patient_name || '-'}</div>
            </div>
            {result?.medical_record_number ? (
              <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
                <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                  No. Rekam Medis
                </div>
                <div className="px-3 py-2.5 font-mono font-semibold text-slate-900">
                  {result.medical_record_number}
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
              <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                No. Kunjungan
              </div>
              <div className="px-3 py-2.5 font-mono font-semibold text-slate-900">
                {result?.visit_number || '-'}
              </div>
            </div>
            {result?.polyclinic_name ? (
              <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
                <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                  Poliklinik / Unit
                </div>
                <div className="px-3 py-2.5 text-slate-900">{result.polyclinic_name}</div>
              </div>
            ) : null}
          </div>

          {/* 5. SEKSI: JEJAK KRIPTOGRAFI & AUDIT */}
          <div className="border-b border-slate-900 bg-slate-100 px-4 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-950">
            Jejak Audit & Hash Verifikasi
          </div>
          <div className="divide-y divide-slate-300 text-xs">
            <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
              <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                Hash Verifikasi
              </div>
              <div className="px-3 py-2.5 font-mono font-bold tracking-wide text-slate-950">
                {result?.verification_hash || '-'}
              </div>
            </div>
            <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[175px_1fr]">
              <div className="border-r border-slate-300 bg-slate-50/70 px-3 py-2.5 font-semibold text-slate-700">
                Waktu Pengecekan
              </div>
              <div className="px-3 py-2.5 text-slate-800">{result?.checked_at_label || '-'}</div>
            </div>
            <div className="bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-700">
              <strong className="font-bold text-slate-900">Keterangan Resmi: </strong>
              {result?.description}{' '}
              {result?.guidance}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
