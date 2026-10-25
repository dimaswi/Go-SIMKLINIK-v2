import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, FileCheck2, Loader2, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { FinalizeVisitPayload, MedicalRecord } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DISPOSITION_OPTIONS } from '../constants';
import { buildDraft } from '../utils';

type FinalizeVisitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outcomeRecord?: MedicalRecord | null;
  blockers?: string[];
  submitting?: boolean;
  onSubmit: (payload: FinalizeVisitPayload) => Promise<void>;
};

type FormErrors = Partial<Record<keyof FinalizeVisitPayload, string>>;

type InstructionTemplate = {
  title: string;
  value: string;
};

const EMPTY_ERRORS: FormErrors = {};

const DISCHARGE_CONDITION_PRESETS = [
  'Kondisi umum membaik, sadar penuh, tanda vital stabil',
  'Keluhan berkurang, kondisi klinis stabil, rawat jalan',
  'Perbaikan klinis awal, boleh pulang dengan terapi obat',
  'Gejala mereda, tanda bahaya tidak ditemukan',
];

function getDispositionMeta(disposition: string) {
  switch (disposition) {
    case 'kontrol':
      return {
        label: 'Kontrol Ulang',
        tone: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        instructionLabel: 'Instruksi Kontrol',
      };
    case 'rujuk':
      return {
        label: 'Rujuk',
        tone: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
        instructionLabel: 'Instruksi Sebelum Rujuk',
      };
    case 'observasi':
      return {
        label: 'Observasi',
        tone: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
        instructionLabel: 'Instruksi Observasi',
      };
    case 'rawat_inap':
      return {
        label: 'Rawat Inap',
        tone: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
        instructionLabel: 'Catatan Tindak Lanjut',
      };
    case 'rawat_jalan':
      return {
        label: 'Pulang / Rawat Jalan',
        tone: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        instructionLabel: 'Instruksi Pulang',
      };
    default:
      return {
        label: 'Belum Dipilih',
        tone: 'border-border bg-muted text-muted-foreground',
        instructionLabel: 'Instruksi Pulang / Edukasi',
      };
  }
}

function getInstructionTemplates(disposition: string): InstructionTemplate[] {
  switch (disposition) {
    case 'kontrol':
      return [
        {
          title: 'Kontrol standar',
          value: 'Pasien dipulangkan dengan kondisi stabil. Dianjurkan kontrol ulang sesuai jadwal, melanjutkan obat sesuai resep, dan kembali lebih awal bila keluhan memberat.',
        },
        {
          title: 'Kontrol evaluasi terapi',
          value: 'Pasien diminta kontrol ulang untuk evaluasi respons terapi. Edukasi diberikan mengenai kepatuhan obat, istirahat cukup, dan tanda bahaya yang mengharuskan pemeriksaan ulang segera.',
        },
      ];
    case 'rujuk':
      return [
        {
          title: 'Rujukan layanan lanjutan',
          value: 'Pasien dirujuk untuk penanganan lanjutan. Kondisi pasien dijelaskan, dokumen rujukan disiapkan, dan pasien atau keluarga diedukasi untuk segera menuju fasilitas tujuan.',
        },
        {
          title: 'Rujukan keterbatasan fasilitas',
          value: 'Pasien dirujuk karena membutuhkan pemeriksaan atau tindakan yang tidak tersedia di fasilitas saat ini. Edukasi diberikan mengenai urgensi tindak lanjut dan membawa dokumen pendukung.',
        },
      ];
    case 'observasi':
      return [
        {
          title: 'Observasi lanjutan',
          value: 'Pasien memerlukan observasi lanjutan. Instruksi diberikan untuk pemantauan gejala, pembatasan aktivitas tertentu, dan kembali segera bila terjadi perburukan kondisi.',
        },
        {
          title: 'Observasi gejala di rumah',
          value: 'Pasien dipulangkan dengan anjuran observasi mandiri di rumah. Pasien atau keluarga telah diedukasi mengenai tanda bahaya, penggunaan obat, dan kapan harus kembali ke fasilitas kesehatan.',
        },
      ];
    case 'rawat_inap':
      return [
        {
          title: 'Alih rawat inap',
          value: 'Kunjungan ditutup dan pasien direncanakan melanjutkan perawatan rawat inap. Kondisi klinis, hasil evaluasi, dan kebutuhan observasi lanjutan telah dijelaskan kepada pasien atau keluarga.',
        },
      ];
    case 'rawat_jalan':
      return [
        {
          title: 'Pulang rawat jalan',
          value: 'Pasien dipulangkan dengan kondisi stabil. Edukasi diberikan mengenai penggunaan obat, istirahat, diet atau aktivitas yang dianjurkan, serta tanda bahaya yang perlu diwaspadai.',
        },
        {
          title: 'Pulang dengan edukasi',
          value: 'Pasien diperbolehkan pulang dan telah menerima edukasi mengenai diagnosis, terapi yang diberikan, perawatan di rumah, serta anjuran untuk kembali bila keluhan tidak membaik atau memberat.',
        },
      ];
    default:
      return [];
  }
}

function getOutcomeNoteTemplates(disposition: string): InstructionTemplate[] {
  switch (disposition) {
    case 'kontrol':
      return [
        {
          title: 'Outcome kontrol stabil',
          value: 'Kondisi pasien saat pulang stabil, keluhan utama membaik, terapi dapat dilanjutkan rawat jalan, dan pasien dijadwalkan kontrol ulang untuk evaluasi klinis.',
        },
        {
          title: 'Outcome evaluasi lanjutan',
          value: 'Pasien pulang dengan perbaikan klinis awal dan telah diedukasi untuk kontrol ulang sesuai jadwal guna evaluasi respons terapi dan penyesuaian tata laksana bila diperlukan.',
        },
      ];
    case 'rujuk':
      return [
        {
          title: 'Outcome rujuk',
          value: 'Pasien dirujuk untuk tatalaksana lanjutan. Kondisi klinis, alasan rujukan, dan kebutuhan penanganan di fasilitas tujuan telah dijelaskan kepada pasien atau keluarga.',
        },
      ];
    case 'observasi':
      return [
        {
          title: 'Outcome observasi',
          value: 'Pasien dipulangkan dengan anjuran observasi lanjutan. Edukasi diberikan mengenai pemantauan gejala, pembatasan aktivitas, dan indikasi kembali segera bila ada perburukan.',
        },
      ];
    case 'rawat_inap':
      return [
        {
          title: 'Outcome alih rawat',
          value: 'Kunjungan ditutup dan pasien direncanakan melanjutkan perawatan di rawat inap untuk observasi dan penatalaksanaan lebih lanjut sesuai kebutuhan klinis.',
        },
      ];
    case 'rawat_jalan':
      return [
        {
          title: 'Outcome pulang',
          value: 'Pasien dipulangkan dalam kondisi stabil dengan terapi rawat jalan, edukasi penggunaan obat, instruksi perawatan di rumah, dan penjelasan tanda bahaya yang perlu diwaspadai.',
        },
        {
          title: 'Outcome edukasi selesai',
          value: 'Pasien boleh pulang setelah evaluasi akhir. Hasil pemeriksaan, terapi, dan tindak lanjut telah dijelaskan kepada pasien atau keluarga dan dipahami dengan baik.',
        },
      ];
    default:
      return [];
  }
}

export function FinalizeVisitDialog({
  open,
  onOpenChange,
  outcomeRecord,
  blockers = [],
  submitting = false,
  onSubmit,
}: FinalizeVisitDialogProps) {
  const initialDraft = useMemo(() => {
    const draft = buildDraft(outcomeRecord || undefined);
    return {
      follow_up_instruction: draft.follow_up_instruction,
      follow_up_at: draft.follow_up_at,
      disposition: draft.disposition || 'rawat_jalan',
      discharge_condition: draft.discharge_condition,
      referral_destination: draft.referral_destination,
      referral_reason: draft.referral_reason,
      notes: draft.notes,
    } satisfies FinalizeVisitPayload;
  }, [outcomeRecord?.id, outcomeRecord?.updated_at]);

  const [form, setForm] = useState<FinalizeVisitPayload>(initialDraft);
  const [errors, setErrors] = useState<FormErrors>(EMPTY_ERRORS);
  const [selectedInstructionTemplate, setSelectedInstructionTemplate] = useState('');
  const [selectedOutcomeTemplate, setSelectedOutcomeTemplate] = useState('');

  const dispositionMeta = useMemo(() => getDispositionMeta(form.disposition), [form.disposition]);
  const instructionTemplates = useMemo(() => getInstructionTemplates(form.disposition), [form.disposition]);
  const outcomeNoteTemplates = useMemo(() => getOutcomeNoteTemplates(form.disposition), [form.disposition]);
  const showFollowUpAt = form.disposition === 'kontrol';
  const showReferralFields = form.disposition === 'rujuk';

  useEffect(() => {
    if (open) {
      setForm(initialDraft);
      setErrors(EMPTY_ERRORS);
      setSelectedInstructionTemplate('');
      setSelectedOutcomeTemplate('');
    }
  }, [initialDraft, open]);

  useEffect(() => {
    if (!showFollowUpAt && form.follow_up_at) {
      setForm((current) => ({ ...current, follow_up_at: '' }));
    }
  }, [form.follow_up_at, showFollowUpAt]);

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (!form.disposition.trim()) {
      nextErrors.disposition = 'Disposition wajib dipilih.';
    }
    if (!form.discharge_condition.trim()) {
      nextErrors.discharge_condition = 'Kondisi akhir kunjungan wajib diisi.';
    }
    if (showFollowUpAt && !form.follow_up_at.trim()) {
      nextErrors.follow_up_at = 'Tanggal kontrol wajib diisi untuk disposition kontrol.';
    }
    if (showReferralFields) {
      if (!form.referral_destination.trim()) {
        nextErrors.referral_destination = 'Tujuan rujukan wajib diisi.';
      }
      if (!form.referral_reason.trim()) {
        nextErrors.referral_reason = 'Alasan rujukan wajib diisi.';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (blockers.length > 0 || !validate()) {
      return;
    }

    await onSubmit(form);
  };

  const applyInstructionTemplate = (title: string) => {
    setSelectedInstructionTemplate(title);
    const template = instructionTemplates.find((item) => item.title === title);
    if (!template) return;
    setForm((current) => ({ ...current, follow_up_instruction: template.value }));
  };

  const applyOutcomeTemplate = (title: string) => {
    setSelectedOutcomeTemplate(title);
    const template = outcomeNoteTemplates.find((item) => item.title === title);
    if (!template) return;
    setForm((current) => ({ ...current, notes: template.value }));
  };

  // Readiness evaluation for clean footer indicator
  const isFormReady = Boolean(
    form.disposition.trim() &&
    form.discharge_condition.trim() &&
    (!showFollowUpAt || form.follow_up_at.trim()) &&
    (!showReferralFields || (form.referral_destination.trim() && form.referral_reason.trim()))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(1280px,96vw)] sm:max-w-[1280px] max-w-[1280px] p-0 rounded-none overflow-hidden border border-border/70 shadow-2xl">
        {/* Header: Clean & Modern */}
        <div className="border-b border-border/70 bg-muted/20 px-5 py-3">
          <DialogHeader className="p-0 text-left">
            <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
              <div className="flex items-center gap-2.5 flex-wrap">
                <DialogTitle className="text-base font-semibold tracking-tight text-foreground">
                  Finalisasi Kunjungan
                </DialogTitle>
                <Badge
                  variant="outline"
                  className={cn('rounded-none px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider', dispositionMeta.tone)}
                >
                  {dispositionMeta.label}
                </Badge>
              </div>
            </div>
            <DialogDescription className="sr-only">
              Lengkapi form pemulangan pasien sebelum kunjungan dikunci sebagai rekam medis final.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content Body */}
        <div className="p-5 max-h-[calc(90vh-120px)] overflow-y-auto space-y-4">
          {blockers.length > 0 && (
            <Alert variant="destructive" className="rounded-none">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-xs font-semibold">Finalisasi belum bisa dilakukan</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                <ul className="list-disc pl-4 space-y-0.5">
                  {blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* Left Card: Status & Rencana Pemulangan */}
            <div className="border border-border/70 bg-background shadow-none flex flex-col">
              <div className="flex items-center gap-2 border-b border-border/70 bg-muted/15 px-3.5 py-2.5">
                <CalendarClock className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Status & Rencana Pemulangan
                </span>
              </div>

              <div className="p-4 space-y-4">
                {/* Disposition & Control Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Disposition</span>
                      <span className="text-destructive font-mono text-[10px]">*Wajib</span>
                    </label>
                    <SearchableSelect
                      options={DISPOSITION_OPTIONS}
                      value={form.disposition}
                      onValueChange={(value) => setForm((current) => ({ ...current, disposition: value }))}
                      placeholder="Pilih disposition"
                      square
                    />
                    {errors.disposition && <p className="text-[11px] text-destructive">{errors.disposition}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Jadwal Kontrol</span>
                      {showFollowUpAt && <span className="text-destructive font-mono text-[10px]">*Wajib</span>}
                    </label>
                    {showFollowUpAt ? (
                      <div>
                        <Input
                          type="datetime-local"
                          value={form.follow_up_at}
                          onChange={(event) => setForm((current) => ({ ...current, follow_up_at: event.target.value }))}
                          className="h-10 rounded-none text-xs font-mono"
                        />
                        {errors.follow_up_at && <p className="text-[11px] text-destructive mt-1">{errors.follow_up_at}</p>}
                      </div>
                    ) : (
                      <div className="h-10 border border-dashed border-border/70 bg-muted/10 px-3 flex items-center text-xs text-muted-foreground">
                        Tidak diperlukan kontrol
                      </div>
                    )}
                  </div>
                </div>

                {/* Referral Details if Rujuk */}
                {showReferralFields && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-dashed border-border/70 pt-3.5">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                        <span>Tujuan Rujukan</span>
                        <span className="text-destructive font-mono text-[10px]">*Wajib</span>
                      </label>
                      <Input
                        value={form.referral_destination}
                        onChange={(event) => setForm((current) => ({ ...current, referral_destination: event.target.value }))}
                        placeholder="Contoh: RSUD / Poli Spesialis"
                        className="h-10 rounded-none text-xs"
                      />
                      {errors.referral_destination && <p className="text-[11px] text-destructive">{errors.referral_destination}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                        <span>Alasan Rujukan</span>
                        <span className="text-destructive font-mono text-[10px]">*Wajib</span>
                      </label>
                      <Input
                        value={form.referral_reason}
                        onChange={(event) => setForm((current) => ({ ...current, referral_reason: event.target.value }))}
                        placeholder="Contoh: Kebutuhan CT-Scan / Rawat Lanjutan"
                        className="h-10 rounded-none text-xs"
                      />
                      {errors.referral_reason && <p className="text-[11px] text-destructive">{errors.referral_reason}</p>}
                    </div>
                  </div>
                )}

                {/* Kondisi Akhir Kunjungan */}
                <div className="space-y-1.5 border-t border-border/60 pt-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <span>Kondisi Akhir Kunjungan</span>
                      <span className="text-destructive font-mono text-[10px]">*Wajib</span>
                    </label>
                  </div>
                  <Textarea
                    rows={3}
                    value={form.discharge_condition}
                    onChange={(event) => setForm((current) => ({ ...current, discharge_condition: event.target.value }))}
                    placeholder="Tuliskan kondisi klinis akhir sebelum pasien pulang (tanda vital, kesadaran, perbaikan gejala)..."
                    className="rounded-none resize-none text-xs leading-relaxed"
                  />
                  {errors.discharge_condition && <p className="text-[11px] text-destructive">{errors.discharge_condition}</p>}

                  {/* Quick Preset Chips */}
                  <div className="pt-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground mb-1.5">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      <span>Preset Cepat:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DISCHARGE_CONDITION_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setForm((c) => ({ ...c, discharge_condition: preset }))}
                          className="border border-border/80 hover:border-primary/50 bg-muted/20 hover:bg-primary/5 px-2 py-1 text-[11px] text-foreground/90 transition-colors text-left"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Card: Edukasi & Resume Medis */}
            <div className="border border-border/70 bg-background shadow-none flex flex-col">
              <div className="flex items-center gap-2 border-b border-border/70 bg-muted/15 px-3.5 py-2.5">
                <FileCheck2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Edukasi & Resume Medis
                </span>
              </div>

              <div className="p-4 space-y-4">
                {/* Follow up / Discharge Instruction */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {dispositionMeta.instructionLabel}
                    </label>
                    {instructionTemplates.length > 0 && (
                      <div className="w-[170px]">
                        <Select value={selectedInstructionTemplate} onValueChange={applyInstructionTemplate}>
                          <SelectTrigger className="h-7 rounded-none text-[11px] shadow-none bg-muted/20">
                            <SelectValue placeholder="Pilih Template" />
                          </SelectTrigger>
                          <SelectContent>
                            {instructionTemplates.map((template) => (
                              <SelectItem key={template.title} value={template.title} className="text-xs">
                                {template.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <Textarea
                    rows={4}
                    value={form.follow_up_instruction}
                    onChange={(event) => setForm((current) => ({ ...current, follow_up_instruction: event.target.value }))}
                    placeholder="Instruksi pemakaian obat, anjuran istirahat, pantangan makanan, atau tanda bahaya yang harus diwaspadai..."
                    className="rounded-none resize-none text-xs leading-relaxed"
                  />
                </div>

                {/* Outcome Notes */}
                <div className="space-y-1.5 border-t border-border/60 pt-3.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Catatan Outcome Kunjungan
                    </label>
                    {outcomeNoteTemplates.length > 0 && (
                      <div className="w-[170px]">
                        <Select value={selectedOutcomeTemplate} onValueChange={applyOutcomeTemplate}>
                          <SelectTrigger className="h-7 rounded-none text-[11px] shadow-none bg-muted/20">
                            <SelectValue placeholder="Pilih Template" />
                          </SelectTrigger>
                          <SelectContent>
                            {outcomeNoteTemplates.map((template) => (
                              <SelectItem key={template.title} value={template.title} className="text-xs">
                                {template.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <Textarea
                    rows={4}
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Ringkasan kesimpulan evaluasi akhir dokter untuk resume medis..."
                    className="rounded-none resize-none text-xs leading-relaxed"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer: Clean & Informative */}
        <DialogFooter className="border-t border-border/70 px-5 py-3 bg-muted/10 flex flex-row items-center justify-between gap-3">
          <div>
            {blockers.length === 0 && (
              isFormReady ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Form lengkap & siap difinalisasi</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>
                    {!form.discharge_condition.trim()
                      ? 'Kondisi akhir kunjungan wajib diisi'
                      : showFollowUpAt && !form.follow_up_at.trim()
                      ? 'Tanggal kontrol wajib ditentukan'
                      : 'Lengkapi isian wajib'}
                  </span>
                </div>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-none shadow-none h-9 text-xs"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || blockers.length > 0}
              className="gap-2 rounded-none shadow-none h-9 text-xs px-4"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Simpan dan Finalisasi
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}