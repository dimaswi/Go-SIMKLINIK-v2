import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Loader2, PillBottle, ShieldCheck, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export interface InitialReviewData {
  identitas_pasien?: boolean;
  nama_paraf_dokter?: boolean;
  tanggal_resep?: boolean;
  nama_bentuk_kekuatan_obat?: boolean;
  dosis_jumlah_obat?: boolean;
  cara_pemakaian?: boolean;
  interaksi_obat?: boolean;
  duplikasi?: boolean;
  kontra_indikasi?: boolean;
  alergi_efek_samping?: boolean;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface FinalReviewData {
  benar_pasien?: boolean;
  benar_obat?: boolean;
  benar_dosis?: boolean;
  benar_waktu?: boolean;
  benar_rute?: boolean;
  pio_nama_obat?: boolean;
  pio_cara_pakai?: boolean;
  pio_kegunaan?: boolean;
  pio_penyimpanan?: boolean;
  pio_lain_lain?: boolean;
  verified_at?: string;
  verified_by?: string;
}

// Checklist items exactly matching Gambar 2
export const INITIAL_CHECKLIST_ITEMS = [
  { key: 'identitas_pasien', label: 'Lengkap Identitas Pasien' },
  { key: 'nama_paraf_dokter', label: 'Lengkap Nama & Paraf Dokter' },
  { key: 'tanggal_resep', label: 'Tanggal Resep' },
  { key: 'nama_bentuk_kekuatan_obat', label: 'Ada Nama Obat, Bentuk & Kekuatan' },
  { key: 'dosis_jumlah_obat', label: 'Ada Dosis & Jumlah Obat' },
  { key: 'cara_pemakaian', label: 'Ada Cara Pemakaian' },
  { key: 'interaksi_obat', label: 'Interaksi Obat' },
  { key: 'duplikasi', label: 'Duplikasi' },
  { key: 'kontra_indikasi', label: 'Kontra Indikasi' },
  { key: 'alergi_efek_samping', label: 'Alergi / Reaksi Obat Yg Tdk Diinginkan' },
] as const;

export const FINAL_VERIFIKASI_ITEMS = [
  { key: 'benar_pasien', label: 'Benar Pasien' },
  { key: 'benar_obat', label: 'Benar Obat' },
  { key: 'benar_dosis', label: 'Benar Dosis' },
  { key: 'benar_waktu', label: 'Benar Waktu Pemberian' },
  { key: 'benar_rute', label: 'Benar Rute Pemberian' },
] as const;

export const FINAL_PIO_ITEMS = [
  { key: 'pio_nama_obat', label: 'Nama Obat' },
  { key: 'pio_cara_pakai', label: 'Cara Pakai' },
  { key: 'pio_kegunaan', label: 'Kegunaan' },
  { key: 'pio_penyimpanan', label: 'Penyimpanan' },
  { key: 'pio_lain_lain', label: 'Lain-lain' },
] as const;

export interface ReviewMedicineItem {
  key?: string;
  name: string;
  quantityLabel?: string;
  ruleLabel?: string;
  kind?: 'non-racikan' | 'racikan';
  notes?: string;
  instructions?: string;
}

// ============================================================================
// Modal 1: TELAAH RESEP (Telaah Awal)
// ============================================================================
interface InitialReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedDataString?: string;
  patientName?: string;
  medicalRecordNumber?: string;
  doctorName?: string;
  polyclinicName?: string;
  orderNumber?: string | number;
  items?: ReviewMedicineItem[];
  isOrderStep?: boolean;
  onConfirm: (data: InitialReviewData) => Promise<void>;
  loading?: boolean;
}

export function InitialReviewModal({
  open,
  onOpenChange,
  savedDataString,
  patientName,
  medicalRecordNumber,
  doctorName,
  polyclinicName,
  orderNumber,
  items = [],
  isOrderStep = false,
  onConfirm,
  loading = false,
}: InitialReviewModalProps) {
  const { user } = useAuthStore();
  const currentUserName = user?.full_name || user?.username || 'Petugas Farmasi';

  const [data, setData] = useState<InitialReviewData>({});

  useEffect(() => {
    if (!open) return;

    if (savedDataString) {
      try {
        setData(JSON.parse(savedDataString));
        return;
      } catch {
        // fallback
      }
    }

    // Default all checked for fast 1-click confirmation
    const defaults: Record<string, boolean> = {};
    INITIAL_CHECKLIST_ITEMS.forEach((item) => {
      defaults[item.key] = true;
    });
    setData(defaults);
  }, [open, savedDataString]);

  const handleToggle = (key: string, checked: boolean) => {
    setData((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const checkedCount = INITIAL_CHECKLIST_ITEMS.filter(
    (item) => Boolean(data[item.key as keyof InitialReviewData])
  ).length;

  const allChecked = checkedCount === INITIAL_CHECKLIST_ITEMS.length;

  const handleCheckAll = (checked: boolean) => {
    const updated: Record<string, boolean> = {};
    INITIAL_CHECKLIST_ITEMS.forEach((item) => {
      updated[item.key] = checked;
    });
    setData((prev) => ({ ...prev, ...updated }));
  };

  const handleSubmit = async () => {
    const nowIso = new Date().toISOString();
    const payload: InitialReviewData = {
      ...data,
      reviewed_at: data.reviewed_at || nowIso,
      reviewed_by: data.reviewed_by || currentUserName,
    };
    await onConfirm(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] w-full p-0 rounded-none shadow-2xl border border-border bg-card overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center border border-border bg-primary/10 text-primary shrink-0">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0 pr-8">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Telaah Resep (Awal)
                </DialogTitle>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-none bg-muted/40 font-mono">
                  10 Parameter
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Pemeriksaan administratif, farmasetik & klinis sebelum resep diproses
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Patient Info Strip */}
        <div className="bg-muted/30 border-b border-border px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-foreground">{patientName || 'Pasien'}</span>
              <span className="text-muted-foreground ml-1.5 font-mono">({medicalRecordNumber || '-'})</span>
              {doctorName && (
                <span className="text-muted-foreground ml-1.5">· dr. {doctorName}</span>
              )}
              {polyclinicName && (
                <span className="text-muted-foreground ml-1">({polyclinicName})</span>
              )}
            </div>
          </div>
          {orderNumber ? (
            <Badge variant="outline" className="rounded-none text-[10px] font-mono border-border/80 bg-background">
              Order #{orderNumber}
            </Badge>
          ) : null}
        </div>

        {/* Info if already reviewed */}
        {data.reviewed_at && (
          <div className="bg-primary/5 border-b border-primary/20 px-4 py-1.5 text-[11px] text-muted-foreground flex items-center justify-between shrink-0">
            <span>
              Ditelusuri: <strong className="text-foreground">{data.reviewed_by || 'Petugas'}</strong>
            </span>
            <span>{new Date(data.reviewed_at).toLocaleString('id-ID')}</span>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Section 1: Daftar Obat Yang Diresepkan Dokter */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <PillBottle className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Daftar Obat Yang Diresepkan ({items.length} Item)
              </span>
            </div>

            {items.length > 0 ? (
              <div className="border border-border/80 divide-y divide-border/60 bg-background">
                {items.map((item, idx) => (
                  <div key={item.key || idx} className="p-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{item.name}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-none px-1.5 py-0 text-[9px] uppercase tracking-wider',
                            item.kind === 'racikan'
                              ? 'border-violet-300 bg-violet-50 text-violet-700'
                              : 'border-slate-300 bg-slate-50 text-slate-700'
                          )}
                        >
                          {item.kind === 'racikan' ? 'Racikan' : 'Non-Racikan'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                        Aturan: <span className="text-foreground">{item.ruleLabel || '-'}</span>
                      </p>
                      {(item.notes || item.instructions) && (
                        <p className="text-[11px] text-muted-foreground italic mt-0.5">
                          Ket: {[item.instructions, item.notes].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {item.quantityLabel && (
                      <div className="shrink-0 text-right">
                        <span className="font-mono font-semibold text-foreground bg-muted/40 px-2 py-0.5 border border-border/60">
                          {item.quantityLabel}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-border/80 p-3 text-center text-xs text-muted-foreground">
                Tidak ada data rincian obat pada resep ini.
              </div>
            )}
          </div>

          {/* Section 2: Checklist Telaah Resep (Awal) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Checklist Telaah Resep (10 Parameter Permenkes)
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 rounded-none shrink-0 bg-background shadow-none"
                onClick={() => handleCheckAll(!allChecked)}
              >
                {allChecked ? 'Batal Semua' : 'Centang Semua'}
              </Button>
            </div>

            <div className="border border-border divide-y divide-border/60 bg-background">
              {INITIAL_CHECKLIST_ITEMS.map((item) => {
                const checked = Boolean(data[item.key as keyof InitialReviewData]);
                return (
                  <label
                    key={item.key}
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-2 cursor-pointer select-none transition-colors text-xs',
                      checked ? 'bg-primary/[0.02] hover:bg-muted/40' : 'hover:bg-muted/20'
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(val) => handleToggle(item.key, Boolean(val))}
                      className="h-4 w-4 rounded-none border-primary/60 data-[state=checked]:bg-primary shrink-0"
                    />
                    <span className={cn('leading-tight flex-1 select-none', checked ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                      {item.label}
                    </span>
                    {checked ? (
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 font-medium border border-emerald-200 dark:border-emerald-800 shrink-0">
                        Sesuai
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 font-medium border border-amber-200 dark:border-amber-800 shrink-0">
                        Belum
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-3.5 border-t border-border bg-muted/15 flex flex-row items-center justify-between gap-2 sm:gap-0 shrink-0">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{checkedCount}</span> dari {INITIAL_CHECKLIST_ITEMS.length} terverifikasi
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none text-xs"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Batal
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-8 rounded-none text-xs bg-primary text-primary-foreground gap-1.5"
              onClick={() => void handleSubmit()}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Memproses...
                </>
              ) : isOrderStep ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Terima & Proses Resep
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Simpan Telaah Resep
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Modal 2: VERIFIKASI AKHIR & PIO (Telaah Akhir)
// ============================================================================
interface FinalReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedDataString?: string;
  patientName?: string;
  medicalRecordNumber?: string;
  doctorName?: string;
  isDispenseStep?: boolean;
  onConfirm: (data: FinalReviewData) => Promise<void>;
  loading?: boolean;
}

export function FinalReviewModal({
  open,
  onOpenChange,
  savedDataString,
  patientName,
  medicalRecordNumber,
  doctorName,
  isDispenseStep = false,
  onConfirm,
  loading = false,
}: FinalReviewModalProps) {
  const { user } = useAuthStore();
  const currentUserName = user?.full_name || user?.username || 'Petugas Farmasi';

  const [data, setData] = useState<FinalReviewData>({});

  useEffect(() => {
    if (!open) return;

    if (savedDataString) {
      try {
        setData(JSON.parse(savedDataString));
        return;
      } catch {
        // fallback
      }
    }

    // Default all checked for fast 1-click confirmation
    const defaults: Record<string, boolean> = {};
    FINAL_VERIFIKASI_ITEMS.forEach((item) => {
      defaults[item.key] = true;
    });
    FINAL_PIO_ITEMS.forEach((item) => {
      defaults[item.key] = true;
    });
    setData(defaults);
  }, [open, savedDataString]);

  const handleToggle = (key: string, checked: boolean) => {
    setData((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const totalFinalItems = FINAL_VERIFIKASI_ITEMS.length + FINAL_PIO_ITEMS.length;

  const checkedCount =
    FINAL_VERIFIKASI_ITEMS.filter((item) => Boolean(data[item.key as keyof FinalReviewData])).length +
    FINAL_PIO_ITEMS.filter((item) => Boolean(data[item.key as keyof FinalReviewData])).length;

  const allChecked = checkedCount === totalFinalItems;

  const handleCheckAll = (checked: boolean) => {
    const updated: Record<string, boolean> = {};
    FINAL_VERIFIKASI_ITEMS.forEach((item) => {
      updated[item.key] = checked;
    });
    FINAL_PIO_ITEMS.forEach((item) => {
      updated[item.key] = checked;
    });
    setData((prev) => ({ ...prev, ...updated }));
  };

  const handleSubmit = async () => {
    const nowIso = new Date().toISOString();
    const payload: FinalReviewData = {
      ...data,
      verified_at: data.verified_at || nowIso,
      verified_by: currentUserName,
    };
    await onConfirm(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] w-full p-0 rounded-none shadow-2xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center border border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0 pr-8">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Verifikasi Akhir & PIO
                </DialogTitle>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-none bg-emerald-50 text-emerald-700 border-emerald-300 font-mono">
                  10 Item
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Verifikasi 5 benar dan Pelayanan Informasi Obat sebelum penyerahan
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Patient Info Strip & Checklist Toolbar */}
        <div className="bg-muted/30 border-b border-border px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-foreground">{patientName || 'Pasien'}</span>
              <span className="text-muted-foreground ml-1.5 font-mono">({medicalRecordNumber || '-'})</span>
              {doctorName && (
                <span className="text-muted-foreground ml-1.5">· dr. {doctorName}</span>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[11px] px-2 rounded-none shrink-0 bg-background shadow-none"
            onClick={() => handleCheckAll(!allChecked)}
          >
            {allChecked ? 'Batal Semua' : 'Centang Semua'}
          </Button>
        </div>

        {/* Info if already verified */}
        {data.verified_at && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-1.5 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <span>
              Diverifikasi: <strong className="text-foreground">{data.verified_by || 'Petugas'}</strong>
            </span>
            <span>{new Date(data.verified_at).toLocaleString('id-ID')}</span>
          </div>
        )}

        {/* Checklist Body (1 Column Clean Medical Form) */}
        <div className="p-4 max-h-[55vh] overflow-y-auto space-y-3">
          {/* Section 1: VERIFIKASI AKHIR */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <span>1. Verifikasi Akhir (5 Benar)</span>
            </div>
            <div className="border border-border divide-y divide-border/60 bg-background">
              {FINAL_VERIFIKASI_ITEMS.map((item) => {
                const checked = Boolean(data[item.key as keyof FinalReviewData]);
                return (
                  <label
                    key={item.key}
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-2.5 cursor-pointer select-none transition-colors text-xs',
                      checked ? 'bg-emerald-50/20 hover:bg-muted/40' : 'hover:bg-muted/20'
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(val) => handleToggle(item.key, Boolean(val))}
                      className="h-4 w-4 rounded-none border-emerald-600/60 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white shrink-0"
                    />
                    <span className={cn('leading-tight flex-1 select-none', checked ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                      {item.label}
                    </span>
                    {checked ? (
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 font-medium border border-emerald-200 dark:border-emerald-800 shrink-0">
                        Sesuai
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 font-medium border border-amber-200 dark:border-amber-800 shrink-0">
                        Belum
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Section 2: PIO */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <span>2. Pelayanan Informasi Obat (PIO)</span>
            </div>
            <div className="border border-border divide-y divide-border/60 bg-background">
              {FINAL_PIO_ITEMS.map((item) => {
                const checked = Boolean(data[item.key as keyof FinalReviewData]);
                return (
                  <label
                    key={item.key}
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-2.5 cursor-pointer select-none transition-colors text-xs',
                      checked ? 'bg-emerald-50/20 hover:bg-muted/40' : 'hover:bg-muted/20'
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(val) => handleToggle(item.key, Boolean(val))}
                      className="h-4 w-4 rounded-none border-emerald-600/60 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white shrink-0"
                    />
                    <span className={cn('leading-tight flex-1 select-none', checked ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                      {item.label}
                    </span>
                    {checked ? (
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 font-medium border border-emerald-200 dark:border-emerald-800 shrink-0">
                        Sesuai
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 font-medium border border-amber-200 dark:border-amber-800 shrink-0">
                        Belum
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-3.5 border-t border-border bg-muted/15 flex flex-row items-center justify-between gap-2 sm:gap-0">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{checkedCount}</span> dari {totalFinalItems} terverifikasi
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none text-xs"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Batal
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-8 rounded-none text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={() => void handleSubmit()}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Memproses...
                </>
              ) : isDispenseStep ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Serahkan Obat & Selesai
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Simpan Verifikasi
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
