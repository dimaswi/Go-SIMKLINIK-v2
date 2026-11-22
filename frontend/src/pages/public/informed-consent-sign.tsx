import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CheckCircle2, Loader2, PenTool, Users } from 'lucide-react';
import { SignaturePadCanvas } from '@/components/signature-pad-canvas';
import { Input } from '@/components/ui/input';
import {
  publicInformedConsentsApi,
  type PublicInformedConsentSignSession,
} from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { cn } from '@/lib/utils';

function getTokenFromLocation() {
  const hashToken = decodeURIComponent(window.location.hash.replace(/^#/, '').trim());
  if (hashToken) return hashToken;
  const params = new URLSearchParams(window.location.search);
  return (params.get('token') || '').trim();
}

export default function PublicInformedConsentSignPage() {
  const token = useMemo(() => getTokenFromLocation(), []);
  const [session, setSession] = useState<PublicInformedConsentSignSession | null>(null);
  const [activeRole, setActiveRole] = useState<'patient' | 'witness'>('patient');
  const [patientName, setPatientName] = useState('');
  const [witnessName, setWitnessName] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    setPageTitle('Pad Tanda Tangan');

    if (!token) {
      setErrorMessage('Token tanda tangan tidak ditemukan pada QR.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    publicInformedConsentsApi
      .getSession(token)
      .then((res) => {
        if (cancelled) return;
        const data = res.data.data;
        setSession(data);
        setActiveRole(data.role === 'witness' ? 'witness' : 'patient');
        setPatientName(data.consent_giver_name || data.patient_name || '');
        setWitnessName(data.witness_name || '');
      })
      .catch((err: any) => {
        if (cancelled) return;
        setErrorMessage(err.response?.data?.error || 'Sesi tanda tangan tidak ditemukan.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSwitchRole = (nextRole: 'patient' | 'witness') => {
    setActiveRole(nextRole);
    setErrorMessage('');
    setSavedNotice('');
  };

  const handleSaveSignature = async (signatureData: string) => {
    if (!token || !session) return;
    const isPatientRole = activeRole === 'patient';
    const currentName = isPatientRole
      ? patientName.trim() || session.consent_giver_name || session.patient_name || ''
      : witnessName.trim() || session.witness_name || '';

    if (!currentName) {
      setErrorMessage(
        isPatientRole
          ? 'Nama Pasien / Wali wajib diisi sebelum menyimpan.'
          : 'Nama Saksi wajib diisi sebelum menyimpan.'
      );
      return;
    }

    setErrorMessage('');
    setSavedNotice('');
    setSubmitting(true);
    try {
      const response = await publicInformedConsentsApi.submitSignature({
        token,
        role: activeRole,
        signer_name: currentName,
        signature_data: signatureData,
      });
      const updated = response.data.data;
      setSession(updated);
      if (updated.consent_giver_name) setPatientName(updated.consent_giver_name);
      if (updated.witness_name !== undefined) setWitnessName(updated.witness_name || '');

      if (isPatientRole && !updated.witness_signature) {
        setSavedNotice('TTD Pasien / Wali tersimpan! Silakan lanjutkan TTD Saksi.');
        setActiveRole('witness');
      } else if (!isPatientRole && !updated.patient_signature) {
        setSavedNotice('TTD Saksi tersimpan! Silakan lanjutkan TTD Pasien / Wali.');
        setActiveRole('patient');
      } else {
        setSavedNotice(
          isPatientRole
            ? 'TTD Pasien / Wali berhasil disimpan ke komputer klinik!'
            : 'TTD Saksi berhasil disimpan ke komputer klinik!'
        );
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || 'Gagal menyimpan tanda tangan.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-white p-4 text-slate-900">
        <div className="flex items-center gap-2.5 border border-slate-300 bg-white px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-slate-900" />
          <span className="text-sm font-medium">Menyiapkan pad tanda tangan...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-white p-4 text-slate-900">
        <div className="w-full max-w-md border border-slate-300 bg-white p-6 text-center">
          <AlertTriangle className="mx-auto h-9 w-9 text-rose-600" />
          <h1 className="mt-2 text-base font-bold">QR Tanda Tangan Tidak Valid</h1>
          <p className="mt-1 text-xs text-slate-600">{errorMessage || 'Sesi tanda tangan tidak ditemukan.'}</p>
        </div>
      </div>
    );
  }

  const hasPatientSig = Boolean(session.patient_signature);
  const hasWitnessSig = Boolean(session.witness_signature);
  const activeSignature =
    activeRole === 'patient' ? session.patient_signature || '' : session.witness_signature || '';

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-white text-slate-950">
      {/* Top Bar Compact + Tab Perpindahan Pasien / Wali & Saksi */}
      <header className="shrink-0 border-b border-slate-300 bg-slate-50 px-3 pt-2.5 pb-2">
        <div className="flex items-center justify-between gap-2 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <PenTool className="h-4 w-4 shrink-0 text-slate-900" />
            <div className="min-w-0">
              <h1 className="truncate text-xs font-bold uppercase tracking-wide text-slate-900">
                Pad TTD Informed Consent
              </h1>
              <p className="truncate text-[11px] text-slate-500">
                {session.action_name || 'Tindakan Medis'} · {session.patient_name}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-slate-600">
            {(hasPatientSig ? 1 : 0) + (hasWitnessSig ? 1 : 0)}/2 TTD
          </span>
        </div>

        {/* Tab Switcher Pasien / Wali <-> Saksi */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => handleSwitchRole('patient')}
            className={cn(
              'flex items-center justify-between border px-3 py-2 text-left text-xs font-bold transition-colors',
              activeRole === 'patient'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            )}
          >
            <span className="truncate">1. Pasien / Wali</span>
            {hasPatientSig ? (
              <BadgeCheck
                className={cn(
                  'h-4 w-4 shrink-0',
                  activeRole === 'patient' ? 'text-emerald-300' : 'text-emerald-600'
                )}
              />
            ) : (
              <span
                className={cn(
                  'text-[10px] font-normal',
                  activeRole === 'patient' ? 'text-slate-300' : 'text-slate-400'
                )}
              >
                Belum
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSwitchRole('witness')}
            className={cn(
              'flex items-center justify-between border px-3 py-2 text-left text-xs font-bold transition-colors',
              activeRole === 'witness'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            )}
          >
            <span className="flex items-center gap-1 truncate">
              <Users className="h-3.5 w-3.5 shrink-0" />
              2. Saksi
            </span>
            {hasWitnessSig ? (
              <BadgeCheck
                className={cn(
                  'h-4 w-4 shrink-0',
                  activeRole === 'witness' ? 'text-emerald-300' : 'text-emerald-600'
                )}
              />
            ) : (
              <span
                className={cn(
                  'text-[10px] font-normal',
                  activeRole === 'witness' ? 'text-slate-300' : 'text-slate-400'
                )}
              >
                Belum
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Full Height */}
      <main className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
        {savedNotice ? (
          <div className="flex shrink-0 items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span className="font-semibold">{savedNotice}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="shrink-0 border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="shrink-0 space-y-1">
          <label className="text-xs font-semibold text-slate-700">
            {activeRole === 'patient' ? 'Nama Pasien / Wali *' : 'Nama Saksi *'}
          </label>
          <Input
            value={activeRole === 'patient' ? patientName : witnessName}
            onChange={(e) =>
              activeRole === 'patient'
                ? setPatientName(e.target.value)
                : setWitnessName(e.target.value)
            }
            disabled={session.is_locked || submitting}
            placeholder={
              activeRole === 'patient'
                ? 'Ketik nama pasien / wali...'
                : 'Ketik nama saksi...'
            }
            className="h-9 rounded-none text-sm"
          />
        </div>

        <SignaturePadCanvas
          key={activeRole}
          initialSignature={activeSignature}
          disabled={session.is_locked}
          fillHeight
          placeholder={
            activeRole === 'patient'
              ? 'Goreskan TTD Pasien / Wali di area ini'
              : 'Goreskan TTD Saksi di area ini'
          }
          saving={submitting}
          saveLabel={
            activeRole === 'patient' ? 'Simpan TTD Pasien / Wali' : 'Simpan TTD Saksi'
          }
          onSave={(dataUrl) => void handleSaveSignature(dataUrl)}
        />
      </main>
    </div>
  );
}
