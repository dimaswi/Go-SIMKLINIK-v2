import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  MedicalActionItem,
  MedicalActionMutationPayload,
  MedicalActionParameterValue,
  MedicalActionParameterValuePayload,
  MedicalActionTarget,
  MedicalServiceParameter,
  MedicalService,
  MedicalServiceDomain,
  MedicalServiceTargetScope,
  OdontogramEntry,
  OdontogramSurfaceCondition,
  OdontogramToothCondition,
} from '@/lib/api';
import { Eye, FilePlus2, Printer, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  ODONTOGRAM_SURFACE_LABELS,
  ODONTOGRAM_SURFACE_OPTIONS,
  ODONTOGRAM_WHOLE_TOOTH_OPTIONS,
  buildOdontogramDraft,
  getOdontogramEntrySummary,
  getOdontogramToothDefinitions,
  sortOdontogramEntries,
  type OdontogramSurfaceCode,
} from '../odontogram';
import { OdontogramChart } from './odontogram-chart';
import { NumberInput, PAPER_SELECT_TRIGGER_CLASSNAME, TableCell, TableRow, TableSection, TextEditor } from './form-fields';

type ProcedureEditorProps = {
  actions: MedicalActionItem[];
  services: MedicalService[];
  odontogramEntries: OdontogramEntry[];
  onAdd: (payload: MedicalActionMutationPayload) => Promise<boolean | void> | boolean | void;
  onUpdate?: (actionId: number, payload: MedicalActionMutationPayload) => Promise<boolean | void> | boolean | void;
  onDelete: (actionId: number) => Promise<boolean | void> | boolean | void;
  onPrint?: () => void;
  printing?: boolean;
  readOnly: boolean;
};

type TargetDraft = {
  arch: string;
  quadrant: string;
  tooth_number: string;
  surface_codes: string[];
  notes: string;
};

type MedicalActionParameterDraft = {
  medical_service_parameter_id?: number;
  parameter_code_snapshot: string;
  parameter_name_snapshot: string;
  input_type_snapshot: string;
  unit_snapshot: string;
  sort_order: number;
  is_required: boolean;
  result_value: string;
  result_notes: string;
  medical_service_parameter?: MedicalServiceParameter;
};

const SERVICE_DOMAIN_LABELS: Record<MedicalServiceDomain, string> = {
  general: 'Umum',
  dental: 'Dental',
  laboratory: 'Laboratorium',
  radiology: 'Radiologi',
};

const TARGET_SCOPE_LABELS: Record<MedicalServiceTargetScope, string> = {
  none: 'Tanpa target',
  full_mouth: 'Seluruh mulut',
  arch: 'Rahang',
  quadrant: 'Kuadran',
  tooth: 'Gigi',
  surface: 'Permukaan',
};

const SUPPORTING_CATEGORY_TOKENS = ['laboratorium', 'laboratory', 'radiologi', 'radiology'];
const SUPPORTING_CODE_PREFIXES = ['SRV-LAB-', 'SRV-RAD-', 'MIG-LAB-', 'MIG-RAD-'];

const ARCH_OPTIONS = [
  { value: 'upper', label: 'Rahang atas' },
  { value: 'lower', label: 'Rahang bawah' },
];

const QUADRANT_OPTIONS = [
  { value: 'upper_right', label: 'Kuadran kanan atas' },
  { value: 'upper_left', label: 'Kuadran kiri atas' },
  { value: 'lower_left', label: 'Kuadran kiri bawah' },
  { value: 'lower_right', label: 'Kuadran kanan bawah' },
];

const EMPTY_TARGET_DRAFT: TargetDraft = {
  arch: '',
  quadrant: '',
  tooth_number: '',
  surface_codes: [],
  notes: '',
};

function normalizeServiceDomain(value?: string | null): MedicalServiceDomain {
  if (value === 'dental' || value === 'laboratory' || value === 'radiology') {
    return value;
  }

  return 'general';
}

function normalizeTargetScope(value?: string | null): MedicalServiceTargetScope {
  switch (value) {
    case 'full_mouth':
    case 'arch':
    case 'quadrant':
    case 'tooth':
    case 'surface':
      return value;
    default:
      return 'none';
  }
}

function normalizeLookupValue(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function hasCategoryToken(categoryName: string, tokens: string[]) {
  return tokens.some((token) => categoryName === token || categoryName.includes(token));
}

function isProcedureService(service: MedicalService) {
  const categoryName = normalizeLookupValue(service.category?.name);
  if (categoryName && hasCategoryToken(categoryName, SUPPORTING_CATEGORY_TOKENS)) {
    return false;
  }

  const serviceCode = (service.code || '').toUpperCase();
  if (SUPPORTING_CODE_PREFIXES.some((prefix) => serviceCode.startsWith(prefix))) {
    return false;
  }

  const domain = normalizeServiceDomain(service.service_domain);
  if (domain === 'laboratory' || domain === 'radiology') {
    return false;
  }

  return domain === 'general' || domain === 'dental';
}

function buildTargetKey(target: MedicalActionTarget) {
  return [
    target.target_type,
    target.arch,
    target.quadrant,
    target.tooth_number,
    (target.surface_codes || []).join(','),
  ].join('|');
}

function formatTarget(target: MedicalActionTarget) {
  switch (normalizeTargetScope(target.target_type)) {
    case 'full_mouth':
      return 'Seluruh mulut';
    case 'arch':
      return target.arch === 'upper' ? 'Rahang atas' : 'Rahang bawah';
    case 'quadrant':
      return QUADRANT_OPTIONS.find((option) => option.value === target.quadrant)?.label || target.quadrant || '-';
    case 'tooth':
      return `Gigi ${target.tooth_number}`;
    case 'surface':
      return `Gigi ${target.tooth_number}: ${(target.surface_codes || []).map((surfaceCode) => ODONTOGRAM_SURFACE_LABELS[surfaceCode as keyof typeof ODONTOGRAM_SURFACE_LABELS] || surfaceCode).join(', ')}`;
    default:
      return 'Tanpa target';
  }
}

function formatTargetDetail(target: MedicalActionTarget) {
  const base = formatTarget(target);
  return target.notes ? `${base} · ${target.notes}` : base;
}

function buildTargetDetailLines(targets: MedicalActionTarget[]) {
  return targets.map((target) => formatTargetDetail(target));
}

function buildDentalActionSummary(action: MedicalActionItem) {
  const actionLabel = action.medical_service?.name || action.service_name_snapshot || 'Tindakan gigi';
  const targets = action.targets || [];

  if (targets.length === 0) {
    return [actionLabel];
  }

  return buildTargetDetailLines(targets).map((detail) => `${actionLabel} pada ${detail}`);
}

function formatPendingTarget(scope: MedicalServiceTargetScope, draft: TargetDraft) {
  switch (scope) {
    case 'arch':
      return ARCH_OPTIONS.find((option) => option.value === draft.arch)?.label || 'Belum ada rahang dipilih';
    case 'quadrant':
      return QUADRANT_OPTIONS.find((option) => option.value === draft.quadrant)?.label || 'Belum ada kuadran dipilih';
    case 'tooth':
      return draft.tooth_number ? `Gigi ${draft.tooth_number}` : 'Belum ada gigi dipilih';
    case 'surface': {
      if (!draft.tooth_number) {
        return 'Belum ada gigi dipilih';
      }
      if (draft.surface_codes.length === 0) {
        return `Gigi ${draft.tooth_number} belum punya permukaan terpilih`;
      }
      return `Gigi ${draft.tooth_number}: ${draft.surface_codes.map((surfaceCode) => ODONTOGRAM_SURFACE_LABELS[surfaceCode as keyof typeof ODONTOGRAM_SURFACE_LABELS] || surfaceCode).join(', ')}`;
    }
    default:
      return 'Target akan terisi otomatis';
  }
}

function getTargetSelectionGuide(scope: MedicalServiceTargetScope) {
  switch (scope) {
    case 'full_mouth':
      return 'Layanan ini tidak perlu memilih gigi spesifik karena targetnya seluruh mulut.';
    case 'arch':
      return 'Pilih rahang target. Tidak perlu memilih gigi spesifik.';
    case 'quadrant':
      return 'Pilih kuadran target. Tidak perlu memilih permukaan gigi.';
    case 'tooth':
      return 'Pilih gigi spesifik di chart odontogram. Tidak perlu memilih bagian gigi.';
    case 'surface':
      return 'Pilih gigi dan permukaan spesifik di chart odontogram karena tindakan ditujukan ke bagian gigi tertentu.';
    default:
      return 'Layanan ini tidak membutuhkan target anatomi.';
  }
}

function canAddPendingTarget(scope: MedicalServiceTargetScope, draft: TargetDraft) {
  switch (scope) {
    case 'arch':
      return Boolean(draft.arch);
    case 'quadrant':
      return Boolean(draft.quadrant);
    case 'tooth':
      return Boolean(draft.tooth_number);
    case 'surface':
      return Boolean(draft.tooth_number) && draft.surface_codes.length > 0;
    default:
      return false;
  }
}

function getWholeToothConditionLabel(condition: OdontogramToothCondition) {
  return ODONTOGRAM_WHOLE_TOOTH_OPTIONS.find((item) => item.value === condition)?.label || condition;
}

function getSurfaceConditionLabel(condition: OdontogramSurfaceCondition) {
  return ODONTOGRAM_SURFACE_OPTIONS.find((item) => item.value === condition)?.label || condition;
}

function SetupSummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="border border-border/70 bg-background/90 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground/95">{value}</p>
      {helper ? <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function ModalPanel({
  title,
  helper,
  headerRight,
  className,
  children,
}: {
  title: string;
  helper?: string;
  headerRight?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('border border-border/70 bg-background/95 p-4 shadow-sm', className)}>
      <div className="mb-3 space-y-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm font-semibold tracking-tight text-foreground sm:whitespace-nowrap">{title}</p>
          {headerRight ? <div className="w-full sm:w-[420px] sm:shrink-0">{headerRight}</div> : null}
        </div>
        {helper ? <p className="text-xs leading-5 text-muted-foreground">{helper}</p> : null}
      </div>
      {children}
    </section>
  );
}

function getActionParameterName(parameter: MedicalActionParameterValue | MedicalActionParameterDraft) {
  return parameter.parameter_name_snapshot || parameter.medical_service_parameter?.name || '-';
}

function getActionParameterInputType(parameter: MedicalActionParameterValue | MedicalActionParameterDraft) {
  return (parameter.input_type_snapshot || parameter.medical_service_parameter?.input_type || 'text').toLowerCase();
}

function isActionParameterFilled(parameter?: Pick<MedicalActionParameterValue, 'result_value' | 'result_notes'> | Pick<MedicalActionParameterDraft, 'result_value' | 'result_notes'> | null) {
  if (!parameter) return false;
  return Boolean((parameter.result_value || '').trim() || (parameter.result_notes || '').trim());
}

function getActionParameterPreview(action: MedicalActionItem) {
  const filled = (action.parameter_values || [])
    .filter((parameter) => isActionParameterFilled(parameter))
    .slice(0, 2)
    .map((parameter) => {
      const value = (parameter.result_value || '').trim() || (parameter.result_notes || '').trim() || '-';
      return `${getActionParameterName(parameter)}: ${value}`;
    });

  return filled.join(' · ');
}

function buildActionParameterDrafts(action: MedicalActionItem): MedicalActionParameterDraft[] {
  const existingByParameterID = new Map<number, MedicalActionParameterValue>();
  const existingByName = new Map<string, MedicalActionParameterValue>();

  for (const parameter of action.parameter_values || []) {
    if (parameter.medical_service_parameter_id) {
      existingByParameterID.set(parameter.medical_service_parameter_id, parameter);
    }
    existingByName.set(`${parameter.parameter_code_snapshot}|${parameter.parameter_name_snapshot}`.toLowerCase(), parameter);
  }

  const serviceParameters = [...(action.medical_service?.parameters || [])]
    .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0) || left.id - right.id);

  if (serviceParameters.length > 0) {
    return serviceParameters.map((parameter, index) => {
      const existing = existingByParameterID.get(parameter.id)
        || existingByName.get(`${parameter.code || ''}|${parameter.name || ''}`.toLowerCase());

      return {
        medical_service_parameter_id: parameter.id,
        parameter_code_snapshot: existing?.parameter_code_snapshot || parameter.code || '',
        parameter_name_snapshot: existing?.parameter_name_snapshot || parameter.name || '',
        input_type_snapshot: existing?.input_type_snapshot || parameter.input_type || 'text',
        unit_snapshot: existing?.unit_snapshot || parameter.unit || '',
        sort_order: existing?.sort_order || parameter.sort_order || index + 1,
        is_required: existing?.is_required ?? (parameter.is_required !== false),
        result_value: existing?.result_value || '',
        result_notes: existing?.result_notes || '',
        medical_service_parameter: existing?.medical_service_parameter || parameter,
      };
    });
  }

  return [...(action.parameter_values || [])]
    .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0) || left.id - right.id)
    .map((parameter) => ({
      medical_service_parameter_id: parameter.medical_service_parameter_id,
      parameter_code_snapshot: parameter.parameter_code_snapshot || '',
      parameter_name_snapshot: parameter.parameter_name_snapshot || '',
      input_type_snapshot: parameter.input_type_snapshot || 'text',
      unit_snapshot: parameter.unit_snapshot || '',
      sort_order: parameter.sort_order || 0,
      is_required: parameter.is_required !== false,
      result_value: parameter.result_value || '',
      result_notes: parameter.result_notes || '',
      medical_service_parameter: parameter.medical_service_parameter,
    }));
}

function buildActionParameterPayload(drafts: MedicalActionParameterDraft[]): MedicalActionParameterValuePayload[] {
  return drafts.map((parameter) => ({
    medical_service_parameter_id: parameter.medical_service_parameter_id,
    result_value: parameter.result_value,
    result_notes: parameter.result_notes,
  }));
}

function buildActionMutationPayloadFromItem(action: MedicalActionItem, parameterValues?: MedicalActionParameterValuePayload[]): MedicalActionMutationPayload {
  return {
    medical_service_id: action.medical_service_id,
    quantity: action.quantity || 1,
    notes: action.notes || '',
    targets: (action.targets || []).map((target) => ({
      target_type: target.target_type,
      arch: target.arch || '',
      quadrant: target.quadrant || '',
      tooth_number: target.tooth_number || '',
      surface_codes: [...(target.surface_codes || [])],
      notes: target.notes || '',
    })),
    parameter_values: parameterValues,
  };
}

function ActionParameterDialog({
  actionLabel,
  open,
  readOnly,
  drafts,
  saving,
  footerNote,
  saveLabel,
  onOpenChange,
  onChange,
  onSave,
}: {
  actionLabel: string;
  open: boolean;
  readOnly: boolean;
  drafts: MedicalActionParameterDraft[];
  saving: boolean;
  footerNote?: string;
  saveLabel?: string;
  onOpenChange: (open: boolean) => void;
  onChange: (index: number, updates: Partial<MedicalActionParameterDraft>) => void;
  onSave: () => void;
}) {
  if (!open) return null;

  const filledCount = drafts.filter((parameter) => isActionParameterFilled(parameter)).length;
  const requiredCount = drafts.filter((parameter) => parameter.is_required).length;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!saving ? onOpenChange(nextOpen) : undefined)}>
      <DialogContent className="h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-[1600px] overflow-hidden rounded-none border border-border/70 p-0">
        <div className="grid h-full max-h-[calc(100vh-1rem)] min-h-[720px] overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex flex-col bg-[linear-gradient(180deg,#1c1917,#292524,#44403c)] text-stone-50">
            <DialogHeader className="border-b border-white/10 px-5 py-5">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/90">Workspace Parameter</p>
                  <p className="text-lg font-semibold tracking-tight">{actionLabel || 'Tindakan'}</p>
                  <p className="text-xs leading-5 text-stone-300">Ringkasan parameter di kiri, editor di kanan.</p>
                </div>
                <div className="grid gap-3">
                  <SetupSummaryCard label="Terisi" value={`${filledCount}/${drafts.length}`} helper="Nilai atau catatan sudah masuk." />
                  <SetupSummaryCard label="Wajib" value={`${requiredCount}`} helper="Parameter yang perlu diperhatikan lebih dulu." />
                  <SetupSummaryCard label="Mode" value={readOnly ? 'Lihat Saja' : 'Bisa Diedit'} helper={readOnly ? 'Modal dibuka dalam mode baca.' : 'Perubahan tersimpan per tindakan.'} />
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-xs leading-5 text-stone-300">
              <div className="border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-100">Status Parameter</p>
                <div className="mt-2 space-y-2">
                  {drafts.length === 0 ? (
                    <p>Belum ada template parameter untuk tindakan ini.</p>
                  ) : (
                    drafts.map((parameter, index) => (
                      <div key={`${getActionParameterName(parameter)}-${index}`} className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-stone-100">{getActionParameterName(parameter)}</p>
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">{getActionParameterInputType(parameter)}{parameter.unit_snapshot ? ` · ${parameter.unit_snapshot}` : ''}</p>
                        </div>
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-stone-200">
                          {isActionParameterFilled(parameter) ? 'siap' : parameter.is_required ? 'wajib' : 'kosong'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-100">Alur Isi</p>
                <div className="mt-2 space-y-1.5">
                  <p>1. Isi nilai utama dulu untuk parameter yang wajib.</p>
                  <p>2. Tambahkan catatan singkat hanya bila ada konteks klinis tambahan.</p>
                  <p>3. Simpan setelah semua parameter penting sudah terbaca jelas.</p>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex min-h-0 flex-col bg-[linear-gradient(180deg,rgba(255,251,235,0.45),rgba(255,255,255,1))]">
            <div className="border-b border-border/70 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold tracking-tight text-foreground">Editor Parameter</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Isi parameter per item tindakan.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">{filledCount}/{drafts.length} terisi</Badge>
                  {requiredCount > 0 && <Badge className="rounded-none border-0 bg-stone-800 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white">{requiredCount} wajib</Badge>}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {drafts.length === 0 ? (
                <section className="border border-dashed border-border/70 bg-white px-4 py-10 text-center text-sm text-muted-foreground">
                  Tindakan ini tidak memiliki template parameter.
                </section>
              ) : (
                <ModalPanel title="Daftar Parameter" helper="Setiap parameter ditata dalam row kecil agar cepat dibaca dan tidak memanjang ke bawah.">
                  <div className="overflow-auto border border-border/70 bg-white">
                    <div className="hidden min-w-[1080px] grid-cols-[minmax(240px,1.2fr)_120px_minmax(260px,1fr)_minmax(260px,1fr)_120px] border-b border-border/70 bg-muted/20 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
                      <div className="px-3 py-3">Parameter</div>
                      <div className="px-3 py-3">Tipe</div>
                      <div className="px-3 py-3">Nilai</div>
                      <div className="px-3 py-3">Catatan</div>
                      <div className="px-3 py-3">Status</div>
                    </div>

                    <div className="min-w-0 lg:min-w-[1080px]">
                      {drafts.map((parameter, index) => {
                        const parameterName = getActionParameterName(parameter);
                        const inputType = getActionParameterInputType(parameter);
                        const filled = isActionParameterFilled(parameter);
                        const statusClassName = filled
                          ? 'border-stone-900 bg-stone-900 text-white'
                          : parameter.is_required
                            ? 'border-amber-300 bg-amber-50 text-amber-950'
                            : 'border-border bg-white text-muted-foreground';

                        return (
                          <div key={`${parameter.medical_service_parameter_id || parameter.parameter_code_snapshot || parameter.parameter_name_snapshot}-${index}`} className="border-b border-border/70 last:border-b-0">
                            <div className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(240px,1.2fr)_120px_minmax(260px,1fr)_minmax(260px,1fr)_120px] lg:items-center">
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">{parameterName}</p>
                                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                  {parameter.unit_snapshot && <span>Unit: {parameter.unit_snapshot}</span>}
                                  {parameter.is_required && <span>Wajib diisi</span>}
                                </div>
                              </div>

                              <div className="text-xs text-muted-foreground lg:text-[11px]">
                                <span className="inline-flex border border-border/70 px-2 py-1 uppercase tracking-wide">{inputType}</span>
                              </div>

                              <div className="space-y-1 lg:space-y-0">
                                <Label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground lg:hidden">Nilai</Label>
                                {inputType === 'textarea' ? (
                                  <Textarea
                                    value={parameter.result_value}
                                    onChange={(event) => onChange(index, { result_value: event.target.value })}
                                    className="min-h-[68px] rounded-none border-border/70 bg-white px-3 py-2 text-sm shadow-none"
                                    placeholder={`Isi ${parameterName.toLowerCase()}`}
                                    disabled={readOnly || saving}
                                  />
                                ) : (
                                  <Input
                                    type={inputType === 'number' ? 'number' : 'text'}
                                    value={parameter.result_value}
                                    onChange={(event) => onChange(index, { result_value: event.target.value })}
                                    className="h-9 rounded-none border-border/70 bg-white text-sm shadow-none"
                                    placeholder={`Isi ${parameterName.toLowerCase()}`}
                                    disabled={readOnly || saving}
                                  />
                                )}
                              </div>

                              <div className="space-y-1 lg:space-y-0">
                                <Label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground lg:hidden">Catatan</Label>
                                <Input
                                  value={parameter.result_notes}
                                  onChange={(event) => onChange(index, { result_notes: event.target.value })}
                                  className="h-9 rounded-none border-border/70 bg-white text-sm shadow-none"
                                  placeholder="Catatan singkat bila perlu"
                                  disabled={readOnly || saving}
                                />
                              </div>

                              <div className="flex items-center lg:justify-end">
                                <span className={cn('inline-flex w-fit border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]', statusClassName)}>
                                  {filled ? 'Terisi' : parameter.is_required ? 'Wajib' : 'Kosong'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </ModalPanel>
              )}
            </div>

            <DialogFooter className="border-t border-border/70 bg-background/95 px-5 py-4">
              <p className="mr-auto text-xs leading-5 text-muted-foreground">{footerNote || 'Parameter disimpan per item tindakan, jadi setiap tindakan bisa memiliki nilai parameter yang berbeda.'}</p>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)} disabled={saving}>
                Tutup
              </Button>
              {!readOnly && drafts.length > 0 && (
                <Button type="button" className="rounded-none" onClick={onSave} disabled={saving}>
                  {saving ? 'Menyimpan...' : (saveLabel || 'Simpan Parameter')}
                </Button>
              )}
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DentalProcedureSetupDialog({
  open,
  readOnly,
  serviceName,
  targetScope,
  targetGuide,
  targets,
  targetDraft,
  pendingTargetSummary,
  odontogramEntryOptions,
  chartEntryId,
  targetPickerDraft,
  chartSelectedSurfaceCode,
  availableSurfaceCodes,
  syncEnabled,
  canSyncOdontogram,
  syncEntryId,
  syncToothCondition,
  syncSurfaceCondition,
  onOpenChange,
  onChartEntryChange,
  onSetArch,
  onSetQuadrant,
  onSetTargetNotes,
  onSelectTooth,
  onSelectSurface,
  onToggleSurface,
  onClearSurfaceSelection,
  onAddTarget,
  onRemoveTarget,
  onSyncEnabledChange,
  onSyncEntryChange,
  onSyncToothConditionChange,
  onSyncSurfaceConditionChange,
}: {
  open: boolean;
  readOnly: boolean;
  serviceName: string;
  targetScope: MedicalServiceTargetScope;
  targetGuide: string;
  targets: MedicalActionTarget[];
  targetDraft: TargetDraft;
  pendingTargetSummary: string;
  odontogramEntryOptions: Array<{ value: string; label: string }>;
  chartEntryId: string;
  targetPickerEntry: OdontogramEntry | null;
  targetPickerDraft: ReturnType<typeof buildOdontogramDraft>;
  chartSelectedSurfaceCode: OdontogramSurfaceCode | null;
  availableSurfaceCodes: OdontogramSurfaceCode[];
  syncEnabled: boolean;
  canSyncOdontogram: boolean;
  syncEntryId: string;
  syncToothCondition: OdontogramToothCondition;
  syncSurfaceCondition: OdontogramSurfaceCondition;
  onOpenChange: (open: boolean) => void;
  onChartEntryChange: (value: string) => void;
  onSetArch: (value: string) => void;
  onSetQuadrant: (value: string) => void;
  onSetTargetNotes: (value: string) => void;
  onSelectTooth: (toothNumber: string) => void;
  onSelectSurface: (toothNumber: string, surfaceCode: OdontogramSurfaceCode) => void;
  onToggleSurface: (surfaceCode: OdontogramSurfaceCode) => void;
  onClearSurfaceSelection: () => void;
  onAddTarget: () => void;
  onRemoveTarget: (index: number) => void;
  onSyncEnabledChange: (checked: boolean) => void;
  onSyncEntryChange: (value: string) => void;
  onSyncToothConditionChange: (value: OdontogramToothCondition) => void;
  onSyncSurfaceConditionChange: (value: OdontogramSurfaceCondition) => void;
}) {
  if (!open) return null;

  const canAddTarget = canAddPendingTarget(targetScope, targetDraft);
  const hasTargetList = targetScope !== 'none' && targetScope !== 'full_mouth';
  const syncSummary = !canSyncOdontogram
    ? 'Sinkronisasi odontogram tidak tersedia untuk konfigurasi target ini.'
    : !syncEnabled
      ? 'Sinkronisasi odontogram belum diaktifkan.'
      : `Sinkronisasi aktif ke odontogram ${syncEntryId || '-'} dengan ${targetScope === 'tooth' ? getWholeToothConditionLabel(syncToothCondition) : getSurfaceConditionLabel(syncSurfaceCondition)}.`;
  const savedTargetDetails = buildTargetDetailLines(targets);
  const activeDraftDetail = targetDraft.notes ? `${pendingTargetSummary} · ${targetDraft.notes}` : pendingTargetSummary;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(97vh-0.35rem)] w-[calc(100vw-0.5rem)] max-w-[1760px] overflow-hidden rounded-none border border-border/70 p-0">
        <div className="grid max-h-[calc(100vh-0.35rem)] min-h-[760px] overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex flex-col bg-[linear-gradient(180deg,#1c1917,#292524,#44403c)] text-stone-50">
            <DialogHeader className="border-b border-white/10 px-5 py-5">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/90">Dental Workspace</p>
                  <p className="text-lg font-semibold tracking-tight">{serviceName || 'Tindakan Gigi'}</p>
                  <p className="text-xs leading-5 text-stone-300">Atur target gigi dan sinkronisasi odontogram dari panel ini.</p>
                </div>
                <div className="grid gap-3">
                  <SetupSummaryCard label="Target" value={TARGET_SCOPE_LABELS[targetScope]} helper={targetGuide} />
                  <SetupSummaryCard label="Detail Gigi Aktif" value={activeDraftDetail} helper="Draft target yang sedang aktif sebelum ditambahkan ke daftar target." />
                  <SetupSummaryCard label="Sync" value={canSyncOdontogram ? (syncEnabled ? 'Aktif' : 'Siap dipakai') : 'Tidak tersedia'} helper={syncSummary} />
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-xs leading-5 text-stone-300">
              <div className="border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-100">Detail Gigi</p>
                <div className="mt-2 space-y-2">
                  {savedTargetDetails.length === 0 ? (
                    <p>Belum ada target gigi yang tersimpan.</p>
                  ) : (
                    savedTargetDetails.map((detail, index) => (
                      <div key={`${detail}-${index}`} className="border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
                        {detail}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-100">Alur Kerja</p>
                <div className="mt-2 space-y-1.5">
                  <p>1. Tentukan target gigi atau permukaan.</p>
                  <p>2. Tambahkan ke daftar target agar tersimpan.</p>
                  <p>3. Aktifkan sinkronisasi odontogram bila ingin langsung mengubah draft odontogram.</p>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex min-h-0 flex-col bg-[linear-gradient(180deg,rgba(255,251,235,0.45),rgba(255,255,255,1))]">
            <div className="border-b border-border/70 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold tracking-tight text-foreground">Pengaturan Detail Tindakan Gigi</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Kelola target aktif, daftar target, chart, dan sinkronisasi.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">{targets.length} target</Badge>
                  {targetScope === 'full_mouth' && <Badge className="rounded-none border-0 bg-stone-800 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white">Seluruh mulut</Badge>}
                  {canSyncOdontogram && <Badge className={cn('rounded-none border-0 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white', syncEnabled ? 'bg-sky-700' : 'bg-slate-500')}>{syncEnabled ? 'Sync aktif' : 'Sync siap'}</Badge>}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5 lg:py-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
                <div className="space-y-4">
                  {(targetScope === 'arch' || targetScope === 'quadrant') && (
                    <ModalPanel title="Pilih Target Anatomi" helper="Gunakan bagian ini untuk memilih rahang atau kuadran yang menjadi target tindakan.">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-end">
                        {targetScope === 'arch' ? (
                          <div className="space-y-1">
                            <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/75">Target Rahang</Label>
                            <SearchableSelect
                              options={ARCH_OPTIONS}
                              value={targetDraft.arch}
                              onValueChange={onSetArch}
                              placeholder="Pilih rahang"
                              searchPlaceholder="Cari rahang..."
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/75">Target Kuadran</Label>
                            <SearchableSelect
                              options={QUADRANT_OPTIONS}
                              value={targetDraft.quadrant}
                              onValueChange={onSetQuadrant}
                              placeholder="Pilih kuadran"
                              searchPlaceholder="Cari kuadran..."
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </div>
                        )}
                        <Button type="button" className="gap-1.5 rounded-none" variant="outline" onClick={onAddTarget} disabled={!canAddTarget || readOnly}>
                          <FilePlus2 className="h-4 w-4" /> Tambah Target
                        </Button>
                      </div>
                    </ModalPanel>
                  )}

                  {(targetScope === 'tooth' || targetScope === 'surface') && (
                    <ModalPanel
                      title="Pilih Gigi di Odontogram"
                      className="lg:min-h-[650px]"
                      headerRight={
                        <SearchableSelect
                          options={odontogramEntryOptions}
                          value={chartEntryId}
                          onValueChange={onChartEntryChange}
                          placeholder="Pilih entri chart"
                          searchPlaceholder="Cari entri odontogram..."
                          square
                          className={cn(PAPER_SELECT_TRIGGER_CLASSNAME, 'w-full')}
                        />
                      }
                    >

                      <div className="mt-4 overflow-auto border border-border/70 bg-white p-2 sm:p-3">
                        <div className="min-w-[860px]">
                          <OdontogramChart
                            draft={targetPickerDraft}
                            readOnly={false}
                            selectedToothNumber={targetDraft.tooth_number || null}
                            selectedSurfaceCode={chartSelectedSurfaceCode}
                            selectedSurfaceCodes={targetDraft.tooth_number ? targetDraft.surface_codes as OdontogramSurfaceCode[] : []}
                            selectionMode="target-picker"
                            showSelectionSummary
                            onSelectTooth={onSelectTooth}
                            onSelectSurface={(toothNumber, surfaceCode) => {
                              if (targetScope === 'surface') {
                                onSelectSurface(toothNumber, surfaceCode);
                                return;
                              }
                              onSelectTooth(toothNumber);
                            }}
                          />
                        </div>
                      </div>

                      {targetScope === 'surface' && (
                        <div className="mt-4 space-y-2 border border-border/70 bg-stone-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              {targetDraft.tooth_number
                                ? `Detail permukaan untuk Gigi ${targetDraft.tooth_number}. Pilih beberapa permukaan bila tindakan mengenai lebih dari satu bagian.`
                                : 'Pilih gigi terlebih dahulu, lalu tentukan permukaan yang akan dikerjakan.'}
                            </p>
                            {targetDraft.tooth_number && targetDraft.surface_codes.length > 0 && (
                              <Button type="button" variant="ghost" size="sm" className="h-7 rounded-none px-2 text-xs" onClick={onClearSurfaceSelection}>
                                Reset Permukaan
                              </Button>
                            )}
                          </div>
                          {targetDraft.tooth_number ? (
                            <div className="flex flex-wrap gap-2">
                              {availableSurfaceCodes.map((surfaceCode) => {
                                const selected = targetDraft.surface_codes.includes(surfaceCode);
                                return (
                                  <Button
                                    key={`${targetDraft.tooth_number}-${surfaceCode}`}
                                    type="button"
                                    variant="outline"
                                    className={selected ? 'rounded-none border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-50' : 'rounded-none bg-white'}
                                    onClick={() => onToggleSurface(surfaceCode)}
                                  >
                                    {ODONTOGRAM_SURFACE_LABELS[surfaceCode]}
                                  </Button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Belum ada gigi dipilih untuk pemilihan permukaan.</p>
                          )}
                        </div>
                      )}
                    </ModalPanel>
                  )}

                  {targetScope === 'full_mouth' && (
                    <ModalPanel title="Target Seluruh Mulut" helper="Layanan ini tidak membutuhkan pemilihan gigi individual.">
                      <div className="border border-border/70 bg-stone-50 px-4 py-4 text-sm text-muted-foreground">
                        Tindakan otomatis ditandai untuk seluruh mulut. Anda dapat langsung fokus pada sinkronisasi odontogram atau catatan klinis bila diperlukan.
                      </div>
                    </ModalPanel>
                  )}

                  {canSyncOdontogram && (
                    <ModalPanel title="Sinkronisasi ke Odontogram" helper="Aktifkan bila hasil tindakan juga harus menandai odontogram draft yang dipilih.">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4 border border-border/70 bg-white px-3 py-3">
                          <div>
                            <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/75">Sinkronisasi Odontogram</Label>
                            <p className="mt-1 text-xs text-muted-foreground">Jika aktif, saat tindakan disimpan sistem juga akan menandai odontogram draft. Jika mati, tindakan hanya tersimpan di daftar tindakan.</p>
                          </div>
                          <Switch checked={syncEnabled} onCheckedChange={onSyncEnabledChange} />
                        </div>

                        {syncEnabled && (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/75">Entri Odontogram</Label>
                              <SearchableSelect
                                options={odontogramEntryOptions}
                                value={syncEntryId}
                                onValueChange={onSyncEntryChange}
                                placeholder="Pilih odontogram draft"
                                searchPlaceholder="Cari entri odontogram..."
                                square
                                className={PAPER_SELECT_TRIGGER_CLASSNAME}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/75">{targetScope === 'tooth' ? 'Kondisi Gigi' : 'Kondisi Permukaan'}</Label>
                              <SearchableSelect
                                options={(targetScope === 'tooth'
                                  ? ODONTOGRAM_WHOLE_TOOTH_OPTIONS.map((item) => ({ value: item.value, label: item.label }))
                                  : ODONTOGRAM_SURFACE_OPTIONS.map((item) => ({ value: item.value, label: item.label })))}
                                value={targetScope === 'tooth' ? syncToothCondition : syncSurfaceCondition}
                                onValueChange={(value) => {
                                  if (targetScope === 'tooth') {
                                    onSyncToothConditionChange(value as OdontogramToothCondition);
                                    return;
                                  }
                                  onSyncSurfaceConditionChange(value as OdontogramSurfaceCondition);
                                }}
                                placeholder="Pilih kondisi"
                                searchPlaceholder="Cari kondisi..."
                                square
                                className={PAPER_SELECT_TRIGGER_CLASSNAME}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </ModalPanel>
                  )}
                </div>

                <div className="space-y-4">
                  <ModalPanel title="Detail Gigi Aktif" helper="Ringkasan target yang sedang Anda susun sebelum ditambahkan.">
                    <div className="space-y-3">
                      <div className="border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">{activeDraftDetail}</div>
                      {!targetDraft.notes && <p className="text-xs text-muted-foreground">Belum ada catatan target draft.</p>}
                    </div>
                  </ModalPanel>

                  {hasTargetList && (
                    <ModalPanel title="Daftar Detail Gigi Tersimpan" helper="Semua target yang akan ikut tersimpan bersama tindakan ini.">
                      {savedTargetDetails.length === 0 ? (
                        <div className="border border-dashed border-border/70 bg-background px-3 py-6 text-center text-sm text-muted-foreground">
                          Belum ada target gigi yang tersimpan.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {savedTargetDetails.map((detail, index) => (
                            <div key={`${detail}-${index}`} className="flex items-start justify-between gap-3 border border-border/70 bg-white px-3 py-3 text-sm">
                              <p className="min-w-0 flex-1 break-words text-foreground">{detail}</p>
                              {!readOnly && (
                                <Button type="button" variant="ghost" size="sm" className="rounded-none text-destructive" onClick={() => onRemoveTarget(index)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ModalPanel>
                  )}

                  <ModalPanel title="Catatan Target Draft" helper="Isi bila ada konteks klinis spesifik untuk gigi atau area yang dipilih.">
                    <div className="space-y-3">
                      <Textarea
                        value={targetDraft.notes}
                        onChange={(event) => onSetTargetNotes(event.target.value)}
                        className="min-h-[120px] rounded-none border-border/70 bg-white shadow-none"
                        placeholder="Catatan spesifik target, misalnya mesial-distal karies atau gigi goyah."
                        disabled={readOnly}
                      />
                      <Button type="button" className="w-full gap-1.5 rounded-none" variant="outline" onClick={onAddTarget} disabled={!canAddTarget || readOnly || targetScope === 'full_mouth' || targetScope === 'none'}>
                        <FilePlus2 className="h-4 w-4" /> Tambahkan Detail Gigi Ini
                      </Button>
                    </div>
                  </ModalPanel>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-border/70 bg-background/95 px-5 py-3">
              <p className="mr-auto text-xs leading-5 text-muted-foreground">Pengaturan target, detail gigi, dan sinkronisasi ini akan dipakai saat Anda menyimpan tindakan.</p>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
                Selesai
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DentalActionDetailDialog({
  action,
  odontogramEntries,
  open,
  onOpenChange,
}: {
  action: MedicalActionItem | null;
  odontogramEntries: OdontogramEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const actionLabel = action?.medical_service?.name || action?.service_name_snapshot || 'Tindakan gigi';
  const actionTargetScope = normalizeTargetScope(action?.medical_service?.target_scope || action?.target_scope_snapshot);
  const targetDetailLines = buildTargetDetailLines(action?.targets || []);
  const dentalActionSummary = action ? buildDentalActionSummary(action) : [];
  const sortedOdontogramEntries = useMemo(() => sortOdontogramEntries(odontogramEntries), [odontogramEntries]);
  const odontogramEntryOptions = useMemo(
    () => sortedOdontogramEntries.map((entry) => ({ value: String(entry.id), label: `Odontogram #${entry.id} — ${getOdontogramEntrySummary(entry)}` })),
    [sortedOdontogramEntries]
  );
  const [detailEntryId, setDetailEntryId] = useState('');
  const [focusedTargetIndex, setFocusedTargetIndex] = useState(0);

  useEffect(() => {
    setFocusedTargetIndex(0);
    setDetailEntryId(sortedOdontogramEntries[0] ? String(sortedOdontogramEntries[0].id) : '');
  }, [action?.id, sortedOdontogramEntries]);

  const selectedOdontogramEntry = useMemo(
    () => sortedOdontogramEntries.find((entry) => String(entry.id) === detailEntryId) || sortedOdontogramEntries[0] || null,
    [detailEntryId, sortedOdontogramEntries]
  );
  const detailChartDraft = useMemo(
    () => buildOdontogramDraft(selectedOdontogramEntry || undefined),
    [selectedOdontogramEntry?.id, selectedOdontogramEntry?.updated_at]
  );
  const focusedTarget = (action?.targets || [])[focusedTargetIndex] || null;
  const focusedTargetScope = normalizeTargetScope(focusedTarget?.target_type);
  const focusedSurfaceCodes = focusedTargetScope === 'surface'
    ? ((focusedTarget?.surface_codes || []) as OdontogramSurfaceCode[])
    : [];

  if (!open || !action) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100vh-0.35rem)] w-[calc(100vw-0.5rem)] max-w-[1760px] overflow-hidden rounded-none border border-border/70 p-0">
        <div className="grid h-full max-h-[calc(100vh-0.35rem)] min-h-[760px] overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex flex-col bg-[linear-gradient(180deg,#1c1917,#292524,#44403c)] text-stone-50">
            <DialogHeader className="border-b border-white/10 px-5 py-5">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/90">Dental Workspace</p>
                  <p className="text-lg font-semibold tracking-tight">{actionLabel}</p>
                  <p className="text-xs leading-5 text-stone-300">Ringkasan target dan referensi odontogram tindakan.</p>
                </div>
                <div className="grid gap-3">
                  <SetupSummaryCard label="Target" value={TARGET_SCOPE_LABELS[actionTargetScope]} helper="Jenis target anatomi yang tersimpan." />
                  <SetupSummaryCard label="Jumlah Target" value={String((action.targets || []).length)} helper="Detail gigi yang tercatat pada tindakan ini." />
                  <SetupSummaryCard label="Qty" value={String(action.quantity || 1)} helper="Jumlah tindakan tersimpan." />
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-xs leading-5 text-stone-300">
              <div className="border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-100">Ringkasan Tindakan</p>
                <div className="mt-2 space-y-2">
                  {dentalActionSummary.length === 0 ? (
                    <p>Belum ada ringkasan tindakan gigi.</p>
                  ) : (
                    dentalActionSummary.map((summary, index) => (
                      <div key={`${summary}-${index}`} className="border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
                        {summary}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-100">Detail Gigi</p>
                <div className="mt-2 space-y-2">
                  {targetDetailLines.length === 0 ? (
                    <p>Belum ada target gigi yang tersimpan.</p>
                  ) : (
                    targetDetailLines.map((detail, index) => (
                      <div key={`${detail}-${index}`} className="border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
                        {detail}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {action.notes && (
                <div className="border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-100">Catatan</p>
                  <p className="mt-2">{action.notes}</p>
                </div>
              )}
            </div>
          </aside>

          <div className="flex min-h-0 flex-col bg-[linear-gradient(180deg,rgba(255,251,235,0.45),rgba(255,255,255,1))]">
            <div className="border-b border-border/70 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold tracking-tight text-foreground">Detail Gigi Tersimpan</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Workspace ini menampilkan ringkasan tindakan, fokus target, dan odontogram referensi dalam layout yang sama seperti modal pengaturan gigi.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {odontogramEntryOptions.length > 0 && <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">{odontogramEntryOptions.length} odontogram</Badge>}
                  {focusedTarget && <Badge className="rounded-none border-0 bg-stone-800 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white">Target aktif</Badge>}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5 lg:py-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.45fr)]">
                <div className="space-y-4">
                  <ModalPanel title="Odontogram Referensi" helper="Area utama untuk mengecek target gigi dan odontogram tindakan yang tersimpan.">
                    <div className="space-y-4">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
                        {odontogramEntryOptions.length > 0 ? (
                          <div className="space-y-1">
                            <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/75">Entri Odontogram</Label>
                            <SearchableSelect
                              options={odontogramEntryOptions}
                              value={detailEntryId}
                              onValueChange={setDetailEntryId}
                              placeholder="Pilih entri odontogram"
                              searchPlaceholder="Cari entri odontogram..."
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </div>
                        ) : (
                          <div className="border border-dashed border-border/70 bg-white px-3 py-3 text-sm text-muted-foreground lg:col-span-2">
                            Tidak ada entri odontogram yang tersedia. Chart kosong tetap ditampilkan sebagai referensi anatomi.
                          </div>
                        )}

                        {selectedOdontogramEntry && (
                          <div className="space-y-1">
                            <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/75">Ringkasan Entri</Label>
                            <div className="border border-border/70 bg-white px-3 py-2 text-sm text-foreground">
                              Odontogram #{selectedOdontogramEntry.id} — {getOdontogramEntrySummary(selectedOdontogramEntry)}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="max-h-[700px] overflow-auto border border-border/70 bg-white p-3">
                        <div className="min-w-[920px]">
                          <OdontogramChart
                            draft={detailChartDraft}
                            readOnly
                            selectedToothNumber={focusedTarget?.tooth_number || null}
                            selectedSurfaceCode={null}
                            selectedSurfaceCodes={focusedSurfaceCodes}
                            selectionMode="target-picker"
                            showSelectionSummary
                            onSelectTooth={() => undefined}
                            onSelectSurface={() => undefined}
                          />
                        </div>
                      </div>
                    </div>
                  </ModalPanel>
                </div>

                <div className="space-y-4">
                  {targetDetailLines.length > 0 && (
                    <ModalPanel title="Fokus Target" helper="Pilih target untuk melihat highlight gigi dan permukaan yang sesuai pada odontogram.">
                      <div className="flex flex-wrap gap-2">
                        {targetDetailLines.map((detail, index) => (
                          <Button
                            key={`${detail}-${index}`}
                            type="button"
                            variant="outline"
                            className={cn(
                              'rounded-none bg-white',
                              focusedTargetIndex === index && 'border-stone-900 bg-stone-900 text-white hover:bg-stone-900'
                            )}
                            onClick={() => setFocusedTargetIndex(index)}
                          >
                            {detail}
                          </Button>
                        ))}
                      </div>
                    </ModalPanel>
                  )}

                  <ModalPanel title="Target Tersimpan" helper="Semua detail target gigi yang tercatat pada tindakan ini.">
                    {targetDetailLines.length === 0 ? (
                      <div className="border border-dashed border-border/70 bg-white px-3 py-6 text-center text-sm text-muted-foreground">
                        Tindakan ini tidak memiliki target gigi tersimpan.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {targetDetailLines.map((detail, index) => (
                          <div key={`${detail}-${index}`} className="border border-border/70 bg-white px-3 py-3 text-sm text-foreground">
                            {detail}
                          </div>
                        ))}
                      </div>
                    )}
                  </ModalPanel>

                  {action.notes && (
                    <ModalPanel title="Catatan Tindakan" helper="Catatan umum yang disimpan pada item tindakan ini.">
                      <div className="border border-border/70 bg-white px-3 py-3 text-sm text-foreground">
                        {action.notes}
                      </div>
                    </ModalPanel>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-border/70 bg-background/95 px-5 py-3">
              <p className="mr-auto text-xs leading-5 text-muted-foreground">Gunakan modal ini untuk memeriksa tindakan gigi yang sudah tersimpan dari daftar tindakan.</p>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ProcedureEditor({
  actions,
  services,
  odontogramEntries,
  onAdd,
  onUpdate,
  onDelete,
  onPrint,
  printing = false,
  readOnly,
}: ProcedureEditorProps) {
  const [editingActionId, setEditingActionId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [targets, setTargets] = useState<MedicalActionTarget[]>([]);
  const [targetDraft, setTargetDraft] = useState<TargetDraft>(EMPTY_TARGET_DRAFT);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [chartEntryId, setChartEntryId] = useState('');
  const [syncEntryId, setSyncEntryId] = useState('');
  const [syncToothCondition, setSyncToothCondition] = useState<OdontogramToothCondition>('sound');
  const [syncSurfaceCondition, setSyncSurfaceCondition] = useState<OdontogramSurfaceCondition>('sound');
  const [chartSelectedSurfaceCode, setChartSelectedSurfaceCode] = useState<OdontogramSurfaceCode | null>(null);
  const [parameterActionId, setParameterActionId] = useState<number | null>(null);
  const [parameterDrafts, setParameterDrafts] = useState<MedicalActionParameterDraft[]>([]);
  const [savingParameters, setSavingParameters] = useState(false);
  const [dentalSetupOpen, setDentalSetupOpen] = useState(false);
  const [dentalDetailActionId, setDentalDetailActionId] = useState<number | null>(null);

  const procedureServices = useMemo(
    () => services.filter(isProcedureService),
    [services]
  );

  const serviceOptions = useMemo(() => procedureServices.map((service) => ({
    value: String(service.id),
    label: `${service.name} — Rp ${service.price.toLocaleString('id-ID')}`,
  })), [procedureServices]);

  const selectedService = useMemo(
    () => procedureServices.find((service) => String(service.id) === serviceId) || null,
    [procedureServices, serviceId]
  );
  const selectedServiceDomain = normalizeServiceDomain(selectedService?.service_domain);
  const selectedTargetScope = normalizeTargetScope(selectedService?.target_scope);
  const availableSurfaceCodes = useMemo(() => {
    const definition = getOdontogramToothDefinitions().find((item) => item.toothNumber === targetDraft.tooth_number);
    return definition?.surfaceCodes || [];
  }, [targetDraft.tooth_number]);
  const draftOdontogramEntries = useMemo(
    () => odontogramEntries.filter((entry) => entry.status === 'draft'),
    [odontogramEntries]
  );
  const odontogramEntryOptions = useMemo(
    () => draftOdontogramEntries.map((entry) => ({ value: String(entry.id), label: `Odontogram #${entry.id} — ${getOdontogramEntrySummary(entry)}` })),
    [draftOdontogramEntries]
  );
  const targetPickerEntry = useMemo(
    () => draftOdontogramEntries.find((entry) => String(entry.id) === chartEntryId) || draftOdontogramEntries[0] || null,
    [chartEntryId, draftOdontogramEntries]
  );
  const targetPickerDraft = useMemo(
    () => buildOdontogramDraft(targetPickerEntry || undefined),
    [targetPickerEntry?.id, targetPickerEntry?.updated_at]
  );
  const pendingTargetSummary = useMemo(
    () => formatPendingTarget(selectedTargetScope, targetDraft),
    [selectedTargetScope, targetDraft]
  );
  const selectedParameterAction = useMemo(
    () => actions.find((action) => action.id === parameterActionId) || null,
    [actions, parameterActionId]
  );
  const selectedDentalDetailAction = useMemo(
    () => actions.find((action) => action.id === dentalDetailActionId) || null,
    [actions, dentalDetailActionId]
  );
  const dentalConfigurationRequired = selectedServiceDomain === 'dental'
    && (selectedTargetScope !== 'none' || Boolean(selectedService?.supports_odontogram_sync));

  useEffect(() => {
    if (draftOdontogramEntries.length === 0) {
      if (chartEntryId !== '') {
        setChartEntryId('');
      }
      if (syncEntryId !== '') {
        setSyncEntryId('');
      }
      return;
    }

    const hasSelectedChartEntry = draftOdontogramEntries.some((entry) => String(entry.id) === chartEntryId);
    if (!hasSelectedChartEntry) {
      setChartEntryId(String(draftOdontogramEntries[0].id));
    }
  }, [chartEntryId, draftOdontogramEntries, syncEntryId]);

  useEffect(() => {
    if (!syncEnabled || draftOdontogramEntries.length === 0) {
      return;
    }

    const hasSelectedSyncEntry = draftOdontogramEntries.some((entry) => String(entry.id) === syncEntryId);
    if (hasSelectedSyncEntry) {
      return;
    }

    setSyncEntryId(chartEntryId || String(draftOdontogramEntries[0].id));
  }, [chartEntryId, draftOdontogramEntries, syncEnabled, syncEntryId]);

  useEffect(() => {
    if (selectedTargetScope !== 'surface') {
      setChartSelectedSurfaceCode(null);
      return;
    }

    if (!targetDraft.tooth_number) {
      setChartSelectedSurfaceCode(null);
      return;
    }

    setChartSelectedSurfaceCode((currentSurfaceCode: OdontogramSurfaceCode | null) => {
      if (currentSurfaceCode && targetDraft.surface_codes.includes(currentSurfaceCode)) {
        return currentSurfaceCode;
      }

      const nextSurfaceCode = targetDraft.surface_codes.find((surfaceCode) => availableSurfaceCodes.includes(surfaceCode as OdontogramSurfaceCode));
      return (nextSurfaceCode as OdontogramSurfaceCode | undefined) || null;
    });
  }, [availableSurfaceCodes, selectedTargetScope, targetDraft.surface_codes, targetDraft.tooth_number]);

  useEffect(() => {
    if (!selectedParameterAction) {
      setParameterDrafts([]);
      return;
    }

    setParameterDrafts(buildActionParameterDrafts(selectedParameterAction));
  }, [selectedParameterAction]);

  const resetForm = () => {
    setEditingActionId(null);
    setServiceId('');
    setQuantity(1);
    setNotes('');
    setTargets([]);
    setTargetDraft(EMPTY_TARGET_DRAFT);
    setSyncEnabled(false);
    setSyncEntryId('');
    setSyncToothCondition('sound');
    setSyncSurfaceCondition('sound');
    setChartSelectedSurfaceCode(null);
    setDentalSetupOpen(false);
  };

  const handleServiceChange = (value: string) => {
    setServiceId(value);
    setTargets([]);
    setTargetDraft(EMPTY_TARGET_DRAFT);
    setSyncEnabled(false);
    setSyncEntryId('');
    setSyncToothCondition('sound');
    setSyncSurfaceCondition('sound');
    setChartSelectedSurfaceCode(null);
    setDentalSetupOpen(false);
  };

  const handleChartEntryChange = (value: string) => {
    setChartEntryId((currentChartEntryId) => {
      if (syncEnabled && (!syncEntryId || syncEntryId === currentChartEntryId)) {
        setSyncEntryId(value);
      }
      return value;
    });
  };

  const handleTargetChartToothSelect = (toothNumber: string) => {
    if (selectedTargetScope !== 'surface' || targetDraft.tooth_number !== toothNumber) {
      setChartSelectedSurfaceCode(null);
    }

    setTargetDraft((current) => ({
      ...current,
      tooth_number: toothNumber,
      surface_codes: current.tooth_number === toothNumber ? current.surface_codes : [],
    }));
  };

  const handleTargetChartSurfaceSelect = (toothNumber: string, surfaceCode: OdontogramSurfaceCode) => {
    setChartSelectedSurfaceCode(surfaceCode);
    setTargetDraft((current) => {
      const nextSurfaceCodes = current.tooth_number === toothNumber
        ? current.surface_codes.includes(surfaceCode)
          ? current.surface_codes.filter((item) => item !== surfaceCode)
          : [...current.surface_codes, surfaceCode]
        : [surfaceCode];

      return {
        ...current,
        tooth_number: toothNumber,
        surface_codes: nextSurfaceCodes,
      };
    });
  };

  const handleTargetSurfaceToggle = (surfaceCode: OdontogramSurfaceCode) => {
    if (!targetDraft.tooth_number) {
      return;
    }

    handleTargetChartSurfaceSelect(targetDraft.tooth_number, surfaceCode);
  };

  const clearTargetSurfaceSelection = () => {
    setChartSelectedSurfaceCode(null);
    setTargetDraft((current) => ({
      ...current,
      surface_codes: [],
    }));
  };

  const addTarget = () => {
    if (selectedTargetScope === 'none' || selectedTargetScope === 'full_mouth') {
      return;
    }

    let nextTarget: MedicalActionTarget | null = null;
    if (selectedTargetScope === 'arch' && targetDraft.arch) {
      nextTarget = { target_type: 'arch', arch: targetDraft.arch, quadrant: '', tooth_number: '', surface_codes: [], notes: targetDraft.notes };
    }
    if (selectedTargetScope === 'quadrant' && targetDraft.quadrant) {
      nextTarget = { target_type: 'quadrant', arch: '', quadrant: targetDraft.quadrant, tooth_number: '', surface_codes: [], notes: targetDraft.notes };
    }
    if (selectedTargetScope === 'tooth' && targetDraft.tooth_number) {
      nextTarget = { target_type: 'tooth', arch: '', quadrant: '', tooth_number: targetDraft.tooth_number, surface_codes: [], notes: targetDraft.notes };
    }
    if (selectedTargetScope === 'surface' && targetDraft.tooth_number && targetDraft.surface_codes.length > 0) {
      nextTarget = { target_type: 'surface', arch: '', quadrant: '', tooth_number: targetDraft.tooth_number, surface_codes: targetDraft.surface_codes, notes: targetDraft.notes };
    }

    if (!nextTarget) {
      return;
    }

    setTargets((currentTargets) => {
      const nextKey = buildTargetKey(nextTarget!);
      if (currentTargets.some((target) => buildTargetKey(target) === nextKey)) {
        return currentTargets;
      }
      return [...currentTargets, nextTarget!];
    });
    setTargetDraft(EMPTY_TARGET_DRAFT);
    setChartSelectedSurfaceCode(null);
  };

  const removeTarget = (index: number) => {
    setTargets((currentTargets) => currentTargets.filter((_, targetIndex) => targetIndex !== index));
  };

  const canSyncOdontogram = selectedServiceDomain === 'dental'
    && Boolean(selectedService?.supports_odontogram_sync)
    && (selectedTargetScope === 'tooth' || selectedTargetScope === 'surface')
    && draftOdontogramEntries.length > 0;

  const canSubmit = Boolean(serviceId)
    && quantity > 0
    && (selectedTargetScope === 'none' || selectedTargetScope === 'full_mouth' || targets.length > 0)
    && (!syncEnabled || (syncEntryId !== '' && (selectedTargetScope === 'tooth' ? Boolean(syncToothCondition) : Boolean(syncSurfaceCondition))));

  const handleSubmit = async () => {
    if (!selectedService || !canSubmit) {
      return;
    }

    const payload: MedicalActionMutationPayload = {
      medical_service_id: selectedService.id,
      quantity,
      notes,
      targets,
      odontogram_sync: syncEnabled && syncEntryId
        ? {
            entry_id: Number(syncEntryId),
            ...(selectedTargetScope === 'tooth'
              ? { tooth_condition: syncToothCondition }
              : { surface_condition: syncSurfaceCondition }),
          }
        : null,
    };

    if (editingActionId && onUpdate) {
      const saved = await onUpdate(editingActionId, payload);
      if (saved === false) {
        return;
      }
    } else {
      const saved = await onAdd(payload);
      if (saved === false) {
        return;
      }
    }

    resetForm();
  };

  const openParameterDialog = (action: MedicalActionItem) => {
    setParameterActionId(action.id);
  };

  const closeParameterDialog = (open: boolean) => {
    if (!open) {
      setParameterActionId(null);
      setSavingParameters(false);
    }
  };

  const updateParameterDraft = (index: number, updates: Partial<MedicalActionParameterDraft>) => {
    setParameterDrafts((currentDrafts) => currentDrafts.map((parameter, parameterIndex) => (
      parameterIndex === index ? { ...parameter, ...updates } : parameter
    )));
  };

  const saveActionParameters = async () => {
    if (!selectedParameterAction || !onUpdate) {
      return;
    }

    setSavingParameters(true);
    try {
      const saved = await onUpdate(
        selectedParameterAction.id,
        buildActionMutationPayloadFromItem(selectedParameterAction, buildActionParameterPayload(parameterDrafts))
      );
      if (saved === false) {
        return;
      }
      setParameterActionId(null);
    } finally {
      setSavingParameters(false);
    }
  };

  const openDentalDetailDialog = (action: MedicalActionItem) => {
    setDentalDetailActionId(action.id);
  };

  const closeDentalDetailDialog = (open: boolean) => {
    if (!open) {
      setDentalDetailActionId(null);
    }
  };

  return (
    <section className="space-y-2">

      {!readOnly && (
        <TableSection>
          <TableRow>
            <TableCell label="Layanan / Tindakan" colSpan={2}>
              <SearchableSelect
                options={serviceOptions}
                value={serviceId}
                onValueChange={handleServiceChange}
                placeholder="Pilih tindakan"
                searchPlaceholder="Cari layanan"
                square
                className={PAPER_SELECT_TRIGGER_CLASSNAME}
              />
            </TableCell>
            <TableCell label="Jumlah">
              <NumberInput label="Jumlah" hideLabel value={quantity} onChange={(value) => setQuantity(value || 1)} disabled={false} min={1} />
            </TableCell>
            <TableCell label="Aksi" className="w-[180px]">
              <div className="flex min-h-8 items-center gap-2">
                <Button
                  type="button"
                  className="gap-1.5 rounded-none"
                  disabled={!canSubmit}
                  onClick={() => {
                    void handleSubmit();
                  }}
                >
                  <FilePlus2 className="h-4 w-4" /> {editingActionId ? 'Simpan' : 'Tambah'}
                </Button>
                {editingActionId && (
                  <Button type="button" variant="outline" className="rounded-none" onClick={resetForm}>
                    <RotateCcw className="h-4 w-4" /> Batal
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell label="Catatan" colSpan={4}>
              <TextEditor label="Catatan" hideLabel value={notes} onChange={setNotes} disabled={false} rows={3} />
            </TableCell>
          </TableRow>
          {selectedService && (
            <TableRow>
              <TableCell label="Metadata Layanan" colSpan={4}>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="rounded-none px-2 py-0 uppercase tracking-wide">{SERVICE_DOMAIN_LABELS[selectedServiceDomain]}</Badge>
                  <Badge variant="outline" className="rounded-none px-2 py-0 uppercase tracking-wide">{TARGET_SCOPE_LABELS[selectedTargetScope]}</Badge>
                  {(selectedService.parameters?.length || 0) > 0 && <Badge variant="outline" className="rounded-none px-2 py-0 uppercase tracking-wide">{selectedService.parameters?.length || 0} parameter</Badge>}
                  {selectedService.requires_consent && <Badge className="rounded-none border-0 bg-amber-600 px-2 py-0 uppercase tracking-wide text-white">Butuh consent</Badge>}
                  {selectedService.supports_odontogram_sync && <Badge className="rounded-none border-0 bg-sky-700 px-2 py-0 uppercase tracking-wide text-white">Odontogram sync</Badge>}
                </div>
              </TableCell>
            </TableRow>
          )}
          {selectedService?.requires_consent && (
            <TableRow>
              <TableCell label="Informed Consent" colSpan={4}>
                <p className="text-xs text-amber-700">Draft informed consent akan dibuat otomatis saat tindakan ini disimpan. Anda bisa meninjaunya di sheet Informed Consent.</p>
              </TableCell>
            </TableRow>
          )}
          {selectedService && (selectedService.parameters?.length || 0) > 0 && (
            <TableRow>
              <TableCell label="Parameter Tindakan" colSpan={4}>
                <div className="flex flex-col gap-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Layanan ini memiliki {selectedService.parameters?.length || 0} parameter. Parameter belum diisi dari form atas.</p>
                    <p className="text-xs text-muted-foreground">Klik Tambah Tindakan terlebih dahulu. Setelah item masuk ke daftar, gunakan tombol Isi Parameter atau Edit Parameter pada baris tindakan tersebut.</p>
                  </div>
                  <Badge variant="outline" className="w-fit rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                    Parameter diisi dari daftar tindakan
                  </Badge>
                </div>
              </TableCell>
            </TableRow>
          )}
          {dentalConfigurationRequired && (
            <TableRow>
              <TableCell label="Konfigurasi Tindakan Gigi" colSpan={4}>
                <div className="grid gap-3 border border-border/70 bg-[linear-gradient(135deg,rgba(2,132,199,0.04),transparent)] p-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-foreground/70">Ringkasan Pengisian</p>
                      <p className="text-xs leading-5 text-muted-foreground">{selectedTargetScope === 'none' ? 'Tindakan ini tidak butuh target anatomi, tetapi pengaturan gigi tetap tersedia bila layanan dental memerlukan konfigurasi tambahan.' : getTargetSelectionGuide(selectedTargetScope)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wide">{TARGET_SCOPE_LABELS[selectedTargetScope]}</Badge>
                      {selectedTargetScope === 'full_mouth' && (
                        <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wide">Target otomatis seluruh mulut</Badge>
                      )}
                      {selectedTargetScope !== 'none' && selectedTargetScope !== 'full_mouth' && (
                        <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wide">{targets.length} target tersimpan</Badge>
                      )}
                      {canSyncOdontogram && (
                        <Badge variant={syncEnabled ? 'secondary' : 'outline'} className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wide">
                          {syncEnabled ? 'Odontogram sync aktif' : 'Odontogram sync nonaktif'}
                        </Badge>
                      )}
                    </div>
                    {selectedTargetScope !== 'none' && selectedTargetScope !== 'full_mouth' && (
                      targets.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Belum ada target yang disimpan. Atur target dari modal agar tindakan gigi lebih presisi.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {targets.map((target, index) => (
                            <Badge key={`${buildTargetKey(target)}-${index}`} variant="outline" className="rounded-none px-2 py-0 text-[10px] text-muted-foreground">
                              {formatTarget(target)}
                            </Badge>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                  <div className="flex items-center justify-start lg:justify-end">
                    <Button type="button" className="gap-1.5 rounded-none" onClick={() => setDentalSetupOpen(true)}>
                      <SlidersHorizontal className="h-4 w-4" /> Atur Tindakan Gigi
                    </Button>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableSection>
      )}

      <div className="border border-border/70 bg-background">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Daftar Tindakan</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Parameter tindakan diisi dari daftar ini melalui modal per item, supaya tabel utama tetap ringkas.</p>
          </div>
          {onPrint && actions.length > 0 && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-none" onClick={onPrint} disabled={printing}>
              <Printer className="h-4 w-4" />
              {printing ? 'Menyiapkan Cetak...' : 'Cetak Tindakan'}
            </Button>
          )}
        </div>
        {actions.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">Belum ada tindakan.</div>
        ) : (
          actions.map((action) => {
            const actionDomain = normalizeServiceDomain(action.medical_service?.service_domain || action.service_domain_snapshot);
            const actionTargetScope = normalizeTargetScope(action.medical_service?.target_scope || action.target_scope_snapshot);
            const parameterCount = action.parameter_values?.length || action.medical_service?.parameters?.length || 0;
            const filledParameterCount = (action.parameter_values || []).filter((parameter) => isActionParameterFilled(parameter)).length;
            const parameterPreview = getActionParameterPreview(action);
            const targetDetailLines = buildTargetDetailLines(action.targets || []);
            const dentalActionSummary = buildDentalActionSummary(action);

            return (
              <div key={action.id} className="border-t border-border/70 px-3 py-3 first:border-t-0">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-medium">{action.medical_service?.name || action.service_name_snapshot || '-'}</p>
                      <Badge variant="secondary" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wide">{SERVICE_DOMAIN_LABELS[actionDomain]}</Badge>
                      <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wide">{TARGET_SCOPE_LABELS[actionTargetScope]}</Badge>
                      {action.requires_consent_snapshot && <Badge className="rounded-none border-0 bg-amber-600 px-2 py-0 text-[10px] uppercase tracking-wide text-white">Consent</Badge>}
                      {parameterCount > 0 && <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wide">{filledParameterCount}/{parameterCount} parameter</Badge>}
                    </div>
                    {(action.targets || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(action.targets || []).map((target, index) => (
                          <Badge key={`${action.id}-${index}-${buildTargetKey(target)}`} variant="outline" className="rounded-none px-2 py-0 text-[10px] text-muted-foreground">
                            {formatTarget(target)}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {actionDomain === 'dental' && targetDetailLines.length > 0 && (
                      <div className="space-y-3 border border-amber-200 bg-amber-50/60 px-3 py-3">
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-900">Ringkasan Tindakan Gigi</p>
                          <p className="text-xs text-amber-950/80">Berikut tindakan yang dikerjakan beserta lokasi giginya.</p>
                        </div>
                        <div className="space-y-2 text-xs leading-5 text-amber-950">
                          {dentalActionSummary.map((detail, index) => (
                            <div key={`${detail}-${index}`} className="border border-amber-200/80 bg-white/70 px-2.5 py-2">
                              {detail}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {action.notes && <p className="break-words text-xs text-muted-foreground">{action.notes}</p>}
                    {parameterCount > 0 && (
                      <p className="break-words text-xs text-red-700">
                        {parameterPreview || 'Parameter tindakan tersedia tetapi belum diisi.'}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center md:justify-end">
                    {actionDomain === 'dental' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-none"
                        onClick={() => openDentalDetailDialog(action)}
                      >
                        <Eye className="h-4 w-4" /> Detail Gigi
                      </Button>
                    )}
                    {/* <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wide">Qty {action.quantity}</Badge>
                    <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wide">Rp {action.price.toLocaleString('id-ID')}</Badge> */}
                    {parameterCount > 0 && (
                      <Button
                        type="button"
                        variant={readOnly ? 'outline' : 'default'}
                        size="sm"
                        className="gap-1.5 rounded-none"
                        onClick={() => openParameterDialog(action)}
                      >
                        {readOnly ? <Eye className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
                        {readOnly ? 'Lihat Parameter' : filledParameterCount > 0 ? 'Edit Parameter' : 'Isi Parameter'}
                      </Button>
                    )}
                    {/* {!readOnly && onUpdate && (
                      <Button type="button" variant="ghost" size="sm" className="rounded-none" onClick={() => handleEditAction(action)}>
                        <Edit className="h-4 w-4 text-yellow-700" />
                      </Button>
                    )} */}
                    {!readOnly && (
                      <Button type="button" variant="ghost" size="sm" className="rounded-none text-destructive" onClick={() => onDelete(action.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ActionParameterDialog
        actionLabel={selectedParameterAction?.medical_service?.name || selectedParameterAction?.service_name_snapshot || '-'}
        open={Boolean(selectedParameterAction)}
        readOnly={readOnly}
        drafts={parameterDrafts}
        saving={savingParameters}
        onOpenChange={closeParameterDialog}
        onChange={updateParameterDraft}
        onSave={() => {
          void saveActionParameters();
        }}
      />

      <DentalProcedureSetupDialog
        open={dentalSetupOpen}
        readOnly={readOnly}
        serviceName={selectedService?.name || 'Tindakan Gigi'}
        targetScope={selectedTargetScope}
        targetGuide={getTargetSelectionGuide(selectedTargetScope)}
        targets={targets}
        targetDraft={targetDraft}
        pendingTargetSummary={pendingTargetSummary}
        odontogramEntryOptions={odontogramEntryOptions}
        chartEntryId={chartEntryId}
        targetPickerEntry={targetPickerEntry}
        targetPickerDraft={targetPickerDraft}
        chartSelectedSurfaceCode={chartSelectedSurfaceCode}
        availableSurfaceCodes={availableSurfaceCodes as OdontogramSurfaceCode[]}
        syncEnabled={syncEnabled}
        canSyncOdontogram={canSyncOdontogram}
        syncEntryId={syncEntryId}
        syncToothCondition={syncToothCondition}
        syncSurfaceCondition={syncSurfaceCondition}
        onOpenChange={setDentalSetupOpen}
        onChartEntryChange={handleChartEntryChange}
        onSetArch={(value) => setTargetDraft((current) => ({ ...current, arch: value }))}
        onSetQuadrant={(value) => setTargetDraft((current) => ({ ...current, quadrant: value }))}
        onSetTargetNotes={(value) => setTargetDraft((current) => ({ ...current, notes: value }))}
        onSelectTooth={handleTargetChartToothSelect}
        onSelectSurface={handleTargetChartSurfaceSelect}
        onToggleSurface={handleTargetSurfaceToggle}
        onClearSurfaceSelection={clearTargetSurfaceSelection}
        onAddTarget={addTarget}
        onRemoveTarget={removeTarget}
        onSyncEnabledChange={setSyncEnabled}
        onSyncEntryChange={setSyncEntryId}
        onSyncToothConditionChange={setSyncToothCondition}
        onSyncSurfaceConditionChange={setSyncSurfaceCondition}
      />

      <DentalActionDetailDialog
        action={selectedDentalDetailAction}
        odontogramEntries={odontogramEntries}
        open={Boolean(selectedDentalDetailAction)}
        onOpenChange={closeDentalDetailDialog}
      />
    </section>
  );
}
