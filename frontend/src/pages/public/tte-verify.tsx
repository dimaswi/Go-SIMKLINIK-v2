import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, Loader2, ShieldCheck } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { publicTteApi, resolveAssetUrl, type TteVerificationResult } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { cn } from '@/lib/utils';

function getTokenFromHash() {
  return decodeURIComponent(window.location.hash.replace(/^#/, '').trim());
}

function buildFallbackResult(reason: string): TteVerificationResult {
  return {
    is_valid: false,
    status_label: 'TTE tidak valid',
    status_tone: 'invalid',
    title: 'Validasi dokumen gagal',
    description: 'Hash verifikasi tidak tersedia atau formatnya tidak dikenali.',
    hospital_name: 'SIMKLINIK',
    hospital_logo_url: '',
    hospital_website: '',
    document_label: '',
    document_key: '',
    signer_name: '',
    signed_at_label: '',
    visit_number: '',
    patient_name: '',
    document_reference: '',
    checked_at_label: '',
    verification_hash: '',
    guidance: 'Pastikan QR dipindai dari dokumen terbaru.',
    reason,
  };
}

export default function PublicTteVerifyPage() {
  const [result, setResult] = useState<TteVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);

  const token = useMemo(() => getTokenFromHash(), []);

  useEffect(() => {
    setPageTitle('Validasi TTE');

    let cancelled = false;

    const load = async () => {
      if (!token) {
        setResult(buildFallbackResult('Hash token verifikasi tidak ditemukan pada URL.'));
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
  const statusMeaning = isValid
    ? 'Dokumen ini cocok dengan data tanda tangan elektronik yang tersimpan di sistem klinik.'
    : 'Dokumen ini belum dapat dipastikan cocok dengan data tanda tangan elektronik yang tersimpan di sistem klinik.';
  const nextStep = isValid
    ? 'Bila data pasien, penandatangan, dan waktu tanda tangan sesuai, dokumen ini dapat digunakan sebagai dokumen yang telah tervalidasi.'
    : 'Bila Anda menerima dokumen ini dari klinik, silakan hubungi petugas untuk meminta pengecekan atau pencetakan ulang dokumen.';

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef6f2_100%)] px-4 py-10 text-slate-900">
        <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-5 py-3 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm font-medium">Memverifikasi dokumen TTE...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef6f2_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <Card className="overflow-hidden border-slate-200/80 shadow-xl shadow-slate-200/70">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(231,245,236,0.92))] px-6 py-6 sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
                    {hospitalLogo ? <img src={hospitalLogo} alt={result?.hospital_name || 'SIMKLINIK'} className="h-10 w-10 object-contain" /> : <ShieldCheck className="h-8 w-8 text-emerald-600" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Validasi TTE</p>
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{result?.hospital_name || 'SIMKLINIK'}</h1>
                    <p className="mt-1 text-sm text-slate-600">Halaman ini membantu memastikan dokumen medis yang Anda pegang sudah tervalidasi oleh klinik.</p>
                  </div>
                </div>
                <div className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold', isValid ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200')}>
                  {isValid ? <BadgeCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {result?.status_label}
                </div>
              </div>
              <div className="mt-5">
                <h2 className="text-2xl font-semibold tracking-tight">{result?.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{result?.description}</p>
              </div>
            </div>
            <CardContent className="space-y-5 px-6 py-6 sm:px-8">
              {result?.reason ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{result.reason}</div> : null}
              {result?.guidance ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">{result.guidance}</div> : null}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Dokumen', result?.document_label],
                  ['Penandatangan', result?.signer_name],
                  ['Waktu Tanda Tangan', result?.signed_at_label],
                  ['Pasien', result?.patient_name],
                  ['Nomor Kunjungan', result?.visit_number],
                  ['Referensi Dokumen', result?.document_reference],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-100">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                    <p className="mt-2 break-words text-base font-semibold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              <div className="text-xs text-slate-500">Diverifikasi pada {result?.checked_at_label || '-'}</div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-slate-200/80 shadow-lg shadow-slate-200/60">
              <CardContent className="space-y-4 px-6 py-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ringkasan Verifikasi</p>
                <div>
                  <p className="text-sm text-slate-500">Hash Verifikasi</p>
                  <p className="mt-1 break-all text-lg font-semibold text-slate-950">{result?.verification_hash || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Status</p>
                  <p className={cn('mt-1 text-lg font-semibold', isValid ? 'text-emerald-700' : 'text-rose-700')}>{result?.status_label || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Arti Hasil Ini</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{statusMeaning}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 shadow-lg shadow-slate-200/60">
              <CardContent className="space-y-3 px-6 py-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Langkah Selanjutnya</p>
                <p className="text-sm leading-6 text-slate-700">{nextStep}</p>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">Yang perlu Anda cocokkan</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">Periksa nama pasien, nama penandatangan, jenis dokumen, dan waktu tanda tangan pada halaman ini dengan dokumen cetak yang Anda bawa.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}