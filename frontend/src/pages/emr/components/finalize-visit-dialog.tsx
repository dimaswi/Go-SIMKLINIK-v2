import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, FileCheck2, Loader2 } from 'lucide-react';
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

type ExpandableTextareaField =
  | 'discharge_condition'
  | 'referral_destination'
  | 'referral_reason'
  | 'follow_up_instruction'
  | 'notes';

const EMPTY_ERRORS: FormErrors = {};

function getDispositionMeta(disposition: string) {
  switch (disposition) {
    case 'kontrol':
      return {
        label: 'Kontrol ulang',
        tone: 'border-amber-300 bg-amber-50 text-amber-900',
        panelClass: 'border-amber-200 bg-amber-50/80',
        iconClass: 'border-amber-200 bg-amber-100 text-amber-700',
        summary: 'Pasien pulang dengan jadwal kontrol yang harus ditentukan.',
        focusNote: 'Lengkapi jadwal kontrol dan instruksi evaluasi terapi sebelum kunjungan dikunci.',
        instructionLabel: 'Instruksi Kontrol',
      };
    case 'rujuk':
      return {
        label: 'Rujuk',
        tone: 'border-rose-300 bg-rose-50 text-rose-900',
        panelClass: 'border-rose-200 bg-rose-50/80',
        iconClass: 'border-rose-200 bg-rose-100 text-rose-700',
        summary: 'Lengkapi tujuan dan alasan rujukan sebelum finalisasi.',
        focusNote: 'Rujukan harus menjelaskan tujuan layanan dan alasan klinis secara ringkas.',
        instructionLabel: 'Instruksi Sebelum Rujuk',
      };
    case 'observasi':
      return {
        label: 'Observasi',
        tone: 'border-sky-300 bg-sky-50 text-sky-900',
        panelClass: 'border-sky-200 bg-sky-50/80',
        iconClass: 'border-sky-200 bg-sky-100 text-sky-700',
        summary: 'Pasien membutuhkan observasi lanjutan atau pemantauan khusus.',
        focusNote: 'Jelaskan observasi lanjutan dan tanda bahaya yang harus dipantau setelah pulang.',
        instructionLabel: 'Instruksi Observasi',
      };
    case 'rawat_inap':
      return {
        label: 'Rawat Inap',
        tone: 'border-violet-300 bg-violet-50 text-violet-900',
        panelClass: 'border-violet-200 bg-violet-50/80',
        iconClass: 'border-violet-200 bg-violet-100 text-violet-700',
        summary: 'Kunjungan rawat jalan ditutup dengan tindak lanjut rawat inap.',
        focusNote: 'Pastikan outcome menjelaskan alasan alih rawat dan rencana tindak lanjut awal.',
        instructionLabel: 'Catatan Tindak Lanjut',
      };
    case 'rawat_jalan':
      return {
        label: 'Pulang / Rawat Jalan',
        tone: 'border-emerald-300 bg-emerald-50 text-emerald-900',
        panelClass: 'border-emerald-200 bg-emerald-50/80',
        iconClass: 'border-emerald-200 bg-emerald-100 text-emerald-700',
        summary: 'Pasien dapat dipulangkan dan menerima instruksi perawatan lanjutan.',
        focusNote: 'Tuliskan kondisi pulang, edukasi obat, dan instruksi tindak lanjut yang mudah dipahami.',
        instructionLabel: 'Instruksi Pulang',
      };
    default:
      return {
        label: 'Belum dipilih',
        tone: 'border-border bg-muted text-muted-foreground',
        panelClass: 'border-border bg-muted/30',
        iconClass: 'border-border bg-background text-muted-foreground',
        summary: 'Pilih disposition untuk menyesuaikan isian pemulangan pasien.',
        focusNote: 'Pilih disposition lebih dulu agar instruksi dan validasi finalisasi menyesuaikan alur pasien.',
        instructionLabel: 'Instruksi Pulang atau Tindak Lanjut',
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
          title: 'Rujukan karena keterbatasan fasilitas',
          value: 'Pasien dirujuk karena membutuhkan pemeriksaan atau tindakan yang tidak tersedia di fasilitas saat ini. Edukasi diberikan mengenai urgensi tindak lanjut dan pentingnya membawa dokumen pendukung.',
        },
      ];
    case 'observasi':
      return [
        {
          title: 'Observasi lanjutan',
          value: 'Pasien memerlukan observasi lanjutan. Instruksi diberikan untuk pemantauan gejala, pembatasan aktivitas tertentu, dan kembali segera bila terjadi perburukan kondisi.',
        },
        {
          title: 'Observasi gejala',
          value: 'Pasien dipulangkan dengan anjuran observasi mandiri di rumah. Pasien atau keluarga telah diedukasi mengenai tanda bahaya, penggunaan obat, dan kapan harus kembali ke fasilitas kesehatan.',
        },
      ];
    case 'rawat_inap':
      return [
        {
          title: 'Alih ke rawat inap',
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

function formatPreviewDateTime(value: string) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
      disposition: draft.disposition,
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
  const [activeTextarea, setActiveTextarea] = useState<ExpandableTextareaField | null>(null);
  const dispositionMeta = useMemo(() => getDispositionMeta(form.disposition), [form.disposition]);
  const instructionTemplates = useMemo(() => getInstructionTemplates(form.disposition), [form.disposition]);
  const outcomeNoteTemplates = useMemo(() => getOutcomeNoteTemplates(form.disposition), [form.disposition]);
  const showFollowUpAt = form.disposition === 'kontrol';
  const showReferralFields = form.disposition === 'rujuk';
  const resumePreview = useMemo(() => {
    const parts = [
      form.disposition ? `Disposition: ${dispositionMeta.label}.` : '',
      form.discharge_condition ? `Kondisi akhir: ${form.discharge_condition.trim()}.` : '',
      showFollowUpAt && form.follow_up_at ? `Kontrol ulang pada ${formatPreviewDateTime(form.follow_up_at)}.` : '',
      showReferralFields && form.referral_destination ? `Tujuan rujukan: ${form.referral_destination.trim()}.` : '',
      showReferralFields && form.referral_reason ? `Alasan rujukan: ${form.referral_reason.trim()}.` : '',
      form.follow_up_instruction ? `Instruksi: ${form.follow_up_instruction.trim()}.` : '',
      form.notes ? `Catatan outcome: ${form.notes.trim()}.` : '',
    ].filter(Boolean);

    return parts.join(' ');
  }, [dispositionMeta.label, form, showFollowUpAt, showReferralFields]);
  const previewRows = useMemo(() => ([
    { label: 'Disposition', value: dispositionMeta.label },
    { label: 'Kondisi akhir', value: form.discharge_condition.trim() || '-' },
    { label: 'Kontrol', value: showFollowUpAt ? (form.follow_up_at ? formatPreviewDateTime(form.follow_up_at) : '-') : 'Tidak ada kontrol' },
    { label: 'Instruksi', value: form.follow_up_instruction.trim() || 'Belum ada instruksi tambahan.' },
  ]), [dispositionMeta.label, form.discharge_condition, form.follow_up_at, form.follow_up_instruction, showFollowUpAt]);
  const completionRows = useMemo(() => ([
    {
      label: 'Disposition',
      detail: form.disposition.trim() ? dispositionMeta.label : 'Belum dipilih',
      complete: Boolean(form.disposition.trim()),
    },
    {
      label: 'Kondisi akhir',
      detail: form.discharge_condition.trim() ? 'Sudah diisi' : 'Masih kosong',
      complete: Boolean(form.discharge_condition.trim()),
    },
    {
      label: 'Jadwal kontrol',
      detail: showFollowUpAt
        ? (form.follow_up_at.trim() ? formatPreviewDateTime(form.follow_up_at) : 'Masih kosong')
        : 'Tidak diperlukan',
      complete: showFollowUpAt ? Boolean(form.follow_up_at.trim()) : true,
    },
    {
      label: 'Data rujukan',
      detail: showReferralFields
        ? (form.referral_destination.trim() && form.referral_reason.trim() ? 'Sudah lengkap' : 'Belum lengkap')
        : 'Tidak diperlukan',
      complete: showReferralFields ? Boolean(form.referral_destination.trim() && form.referral_reason.trim()) : true,
    },
  ]), [dispositionMeta.label, form.discharge_condition, form.disposition, form.follow_up_at, form.referral_destination, form.referral_reason, showFollowUpAt, showReferralFields]);

  useEffect(() => {
    if (open) {
      setForm(initialDraft);
      setErrors(EMPTY_ERRORS);
      setSelectedInstructionTemplate('');
      setSelectedOutcomeTemplate('');
      setActiveTextarea(null);
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

  const getTextareaClassName = (field: ExpandableTextareaField, compactHeight: string, expandedHeight: string) => {
    return cn(
      'rounded-none resize-none transition-[min-height] duration-150',
      activeTextarea === field ? expandedHeight : compactHeight,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(1120px,calc(100vw-24px))] max-w-7xl overflow-hidden rounded-none border border-border/70 p-0">
        <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,1))] px-4 py-2.5">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="text-lg font-semibold tracking-tight">Finalisasi Kunjungan</DialogTitle>
                <DialogDescription className="text-xs leading-5 text-muted-foreground">
                  Lengkapi form pemulangan pasien sebelum kunjungan dikunci sebagai rekam medis final.
                </DialogDescription>
              </div>
              <Badge variant="outline" className={cn('rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]', dispositionMeta.tone)}>
                {dispositionMeta.label}
              </Badge>
            </div>
          </DialogHeader>
        </div>

        <div className="px-4 py-3">
          <div className="space-y-3">
          {blockers.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Finalisasi belum bisa dilakukan</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {blockers.length === 0 && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {completionRows.map((item) => (
                <div key={item.label} className={cn('border px-3 py-2', dispositionMeta.panelClass)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-sm font-medium text-foreground/90">{item.detail}</p>
                    </div>
                    <div className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border', item.complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>
                      <CheckCircle2 className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
              <section className="border border-border/70 bg-background">
                <div className="border-b border-border/70 bg-muted/10 px-3 py-2">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center border border-border/70 bg-background text-foreground/75">
                      <CalendarClock className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">Status Pemulangan</h3>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 px-3 py-3">
                  <div className="grid gap-2.5 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">Disposition</label>
                      <SearchableSelect
                        options={DISPOSITION_OPTIONS}
                        value={form.disposition}
                        onValueChange={(value) => setForm((current) => ({ ...current, disposition: value }))}
                        placeholder="Pilih disposition"
                      />
                      {errors.disposition ? <p className="text-xs text-destructive">{errors.disposition}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">Tanggal Kontrol</label>
                      {showFollowUpAt ? (
                        <>
                          <Input
                            type="datetime-local"
                            value={form.follow_up_at}
                            onChange={(event) => setForm((current) => ({ ...current, follow_up_at: event.target.value }))}
                            className="h-10 rounded-none"
                          />
                          {errors.follow_up_at ? <p className="text-xs text-destructive">{errors.follow_up_at}</p> : null}
                        </>
                      ) : (
                        <div className="flex h-10 items-center border border-dashed border-border/70 bg-muted/10 px-3 text-sm text-muted-foreground">
                          Tidak diperlukan untuk disposition saat ini.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2.5 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">Kondisi Akhir Kunjungan</label>
                      <Textarea
                        rows={2}
                        value={form.discharge_condition}
                        onChange={(event) => setForm((current) => ({ ...current, discharge_condition: event.target.value }))}
                        onFocus={() => setActiveTextarea('discharge_condition')}
                        onBlur={() => setActiveTextarea((current) => (current === 'discharge_condition' ? null : current))}
                        placeholder="Contoh: kondisi umum membaik, sadar penuh, pasien boleh pulang"
                        className={getTextareaClassName('discharge_condition', 'min-h-[52px]', 'min-h-[68px]')}
                      />
                      {errors.discharge_condition ? <p className="text-xs text-destructive">{errors.discharge_condition}</p> : null}
                    </div>

                    {showReferralFields && (
                      <>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">Tujuan Rujukan</label>
                          <Textarea
                            rows={2}
                            value={form.referral_destination}
                            onChange={(event) => setForm((current) => ({ ...current, referral_destination: event.target.value }))}
                            onFocus={() => setActiveTextarea('referral_destination')}
                            onBlur={() => setActiveTextarea((current) => (current === 'referral_destination' ? null : current))}
                            placeholder="Fasilitas atau poli tujuan"
                            className={getTextareaClassName('referral_destination', 'min-h-[52px]', 'min-h-[68px]')}
                          />
                          {errors.referral_destination ? <p className="text-xs text-destructive">{errors.referral_destination}</p> : null}
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">Alasan Rujukan</label>
                          <Textarea
                            rows={2}
                            value={form.referral_reason}
                            onChange={(event) => setForm((current) => ({ ...current, referral_reason: event.target.value }))}
                            onFocus={() => setActiveTextarea('referral_reason')}
                            onBlur={() => setActiveTextarea((current) => (current === 'referral_reason' ? null : current))}
                            placeholder="Alasan klinis atau kebutuhan lanjutan"
                            className={getTextareaClassName('referral_reason', 'min-h-[52px]', 'min-h-[68px]')}
                          />
                          {errors.referral_reason ? <p className="text-xs text-destructive">{errors.referral_reason}</p> : null}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              <section className="border border-border/70 bg-background">
                <div className="border-b border-border/70 bg-muted/10 px-3 py-2">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center border border-border/70 bg-background text-foreground/75">
                      <FileCheck2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">Resume dan Tindak Lanjut</h3>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2.5 px-3 py-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">{dispositionMeta.instructionLabel}</label>
                      {instructionTemplates.length > 0 ? (
                        <div className="w-[168px] shrink-0">
                          <Select value={selectedInstructionTemplate} onValueChange={applyInstructionTemplate}>
                            <SelectTrigger className="h-8 rounded-none text-xs shadow-none">
                              <SelectValue placeholder="Template instruksi" />
                            </SelectTrigger>
                            <SelectContent>
                              {instructionTemplates.map((template) => (
                                <SelectItem key={template.title} value={template.title}>
                                  {template.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>
                    <Textarea
                      rows={3}
                      value={form.follow_up_instruction}
                      onChange={(event) => setForm((current) => ({ ...current, follow_up_instruction: event.target.value }))}
                      onFocus={() => setActiveTextarea('follow_up_instruction')}
                      onBlur={() => setActiveTextarea((current) => (current === 'follow_up_instruction' ? null : current))}
                      placeholder="Instruksi obat, edukasi, atau tindak lanjut"
                      className={getTextareaClassName('follow_up_instruction', 'min-h-[88px]', 'min-h-[110px]')}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">Catatan Outcome</label>
                      {outcomeNoteTemplates.length > 0 ? (
                        <div className="w-[168px] shrink-0">
                          <Select value={selectedOutcomeTemplate} onValueChange={applyOutcomeTemplate}>
                            <SelectTrigger className="h-8 rounded-none text-xs shadow-none">
                              <SelectValue placeholder="Template outcome" />
                            </SelectTrigger>
                            <SelectContent>
                              {outcomeNoteTemplates.map((template) => (
                                <SelectItem key={template.title} value={template.title}>
                                  {template.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>
                    <Textarea
                      rows={3}
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      onFocus={() => setActiveTextarea('notes')}
                      onBlur={() => setActiveTextarea((current) => (current === 'notes' ? null : current))}
                      placeholder="Ringkasan hasil kunjungan untuk resume medis"
                      className={getTextareaClassName('notes', 'min-h-[88px]', 'min-h-[110px]')}
                    />
                  </div>
                </div>
              </section>
          </div>

          <section className={cn('border px-3 py-3', dispositionMeta.panelClass)}>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)] xl:items-start">
              {previewRows.map((row) => (
                <div key={row.label} className="border border-border/70 bg-background px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{row.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-foreground/90">{row.value}</p>
                </div>
              ))}

              <div className="border border-border/70 bg-background px-2.5 py-2 sm:col-span-2 xl:col-span-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Preview Resume</p>
                <p className="mt-1 line-clamp-4 text-[12px] leading-4 text-muted-foreground">
                  {resumePreview || 'Ringkasan finalisasi akan tampil setelah form diisi.'}
                </p>
              </div>
            </div>
          </section>
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 px-4 py-2.5">
          <Button variant="outline" className="rounded-none shadow-none" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || blockers.length > 0} className="gap-2 rounded-none shadow-none">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simpan dan Finalisasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}