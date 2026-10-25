import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { MedicalRecord, Medicine, Prescription, PrescriptionCompound } from '@/lib/api';
import {
  PRESCRIPTION_COMPOUND_PREPARATION_OPTIONS,
  PRESCRIPTION_FULFILLMENT_OPTIONS,
  PRESCRIPTION_SIGNA_OPTIONS,
  getPrescriptionWorkflowBadgeClassName,
  getPrescriptionFulfillmentLabel,
  getPrescriptionWorkflowLabel,
} from '../constants';
import { cn } from '@/lib/utils';
import type { MedicalRecordDraft } from '../types';
import { CheckCircle2, FilePlus2, FlaskConical, Printer, Search, Trash2, XCircle } from 'lucide-react';
import {
  NumberInput,
  PAPER_INPUT_CLASSNAME,
  PAPER_SELECT_TRIGGER_CLASSNAME,
  TableCell as PaperTableCell,
  TableRow as PaperTableRow,
  TableSection,
  TextEditor,
} from './form-fields';

type PrescriptionEditorProps = {
  record: MedicalRecord | null;
  draft: MedicalRecordDraft;
  setDraft: React.Dispatch<React.SetStateAction<MedicalRecordDraft>>;
  prescriptions: Prescription[];
  compounds: PrescriptionCompound[];
  medicines: Medicine[];
  onAdd: (payload: { medicine_id: number; quantity: number; dosage: string; frequency: string; duration: string; route: string; instructions: string; notes: string }) => void;
  onDelete: (prescriptionId: number) => void;
  onAddCompound?: (payload: {
    name: string;
    preparation_type: string;
    output_quantity: number;
    output_unit: string;
    dosage: string;
    frequency: string;
    duration: string;
    route: string;
    instructions: string;
    notes: string;
    items: Array<{ medicine_id: number; quantity: number; notes: string }>;
  }) => void;
  onDeleteCompound?: (compoundId: number) => void;
  onSubmitOrder?: () => void;
  onCancelOrder?: () => void;
  onPrintOrder?: () => void;
  onPrintTicket?: () => void;
  canCancelOrder?: boolean;
  actionState?: {
    submitting: boolean;
    canceling?: boolean;
    printingPrescription: boolean;
    printingTicket: boolean;
  };
  readOnly: boolean;
};

type ComposerMode = 'non-racikan' | 'racikan';

type DetailItem =
  | { kind: 'non-racikan'; item: Prescription }
  | { kind: 'racikan'; item: PrescriptionCompound };

export const JENIS_RACIKAN_OPTIONS = [
  { value: 'R.01 Kapsul', label: 'R.01 Kapsul', code: 'R.01', type: 'kapsul_racik', unit: 'bungkus', defaultDose: '1 kapsul' },
  { value: 'R.02 Pulveres', label: 'R.02 Pulveres', code: 'R.02', type: 'pulveres', unit: 'bungkus', defaultDose: '1 bungkus' },
  { value: 'R.03 Sirup', label: 'R.03 Sirup', code: 'R.03', type: 'sirup_racik', unit: 'botol', defaultDose: '1 sendok teh (5 ml)' },
  { value: 'R.04 Salep', label: 'R.04 Salep', code: 'R.04', type: 'salep_racik', unit: 'pot', defaultDose: 'Oleskan tipis' },
  { value: 'R.05 Krim', label: 'R.05 Krim', code: 'R.05', type: 'krim_racik', unit: 'tube', defaultDose: 'Oleskan tipis' },
  { value: 'R.06 Suspensi', label: 'R.06 Suspensi', code: 'R.06', type: 'suspensi', unit: 'botol', defaultDose: '1 sendok takar (5 ml)' },
  { value: 'R.07 Lainnya', label: 'R.07 Lainnya', code: 'R.07', type: 'pulvis', unit: 'bungkus', defaultDose: '1 bungkus' },
] as const;

type OrderListItem = {
  key: string;
  kind: 'non-racikan' | 'racikan';
  name: string;
  quantityLabel: string;
  ruleLabel: string;
  price: number;
  createdAt?: string;
  status: string;
  instructions: string;
  notes: string;
  data: Prescription | PrescriptionCompound;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function parseDosageMultiplier(dosageStr: string, medicineStrength?: string): number {
  if (!dosageStr) return 1;
  const clean = dosageStr.toLowerCase().trim();

  // Fraction like 1/2, 1/4, 3/4
  const fractionMatch = clean.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fractionMatch) {
    const num = parseFloat(fractionMatch[1]);
    const den = parseFloat(fractionMatch[2]);
    if (den > 0) return num / den;
  }

  // Decimal or integer like 0.5 tab, 1 tab, 2 tab
  const tabMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(tab|tablet|kapsul|cap|bungkus)?/);
  if (tabMatch && !clean.includes('mg') && !clean.includes('gr') && !clean.includes('ml')) {
    const val = parseFloat(tabMatch[1]);
    if (!isNaN(val) && val > 0) return val;
  }

  // mg vs medicine strength mg (e.g. 250 mg with medicine strength 500 mg)
  const mgMatch = clean.match(/^(\d+(?:\.\d+)?)\s*mg/);
  if (mgMatch && medicineStrength) {
    const doseMg = parseFloat(mgMatch[1]);
    const strMatch = medicineStrength.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*mg/);
    if (strMatch) {
      const medMg = parseFloat(strMatch[1]);
      if (medMg > 0) {
        return doseMg / medMg;
      }
    }
  }

  const numFallback = parseFloat(clean);
  if (!isNaN(numFallback) && numFallback > 0) {
    return numFallback;
  }
  return 1;
}

function calculateEstimatedQuantity(dosageStr: string, outputQuantity: number, medicineStrength?: string): number {
  const multiplier = parseDosageMultiplier(dosageStr, medicineStrength);
  const total = multiplier * Math.max(1, outputQuantity);
  return Math.max(1, Math.ceil(total));
}

function ModalStatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
}) {
  return (
    <div className="border border-border/70 bg-background/80 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground/95">{value}</div>
      {helper ? <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{helper}</div> : null}
    </div>
  );
}

export function PrescriptionEditor({
  record,
  draft,
  setDraft,
  prescriptions,
  compounds,
  medicines,
  onAdd,
  onDelete,
  onAddCompound,
  onDeleteCompound,
  onCancelOrder,
  onPrintOrder,
  onPrintTicket,
  canCancelOrder = false,
  actionState,
  readOnly,
}: PrescriptionEditorProps) {
  const [composerMode, setComposerMode] = useState<ComposerMode>('non-racikan');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null);
  const [medicineId, setMedicineId] = useState('');
  const [payload, setPayload] = useState({
    quantity: 1,
    dosage: '',
    frequency: '',
    duration: '',
    route: 'oral',
    instructions: '',
    notes: '',
  });
  const [recipeCode, setRecipeCode] = useState('R.01');
  const [selectedJenisRacikan, setSelectedJenisRacikan] = useState('R.01 Kapsul');
  const [medicineSearchQuery, setMedicineSearchQuery] = useState('');
  const [compoundPayload, setCompoundPayload] = useState({
    name: '',
    preparation_type: 'kapsul_racik',
    output_quantity: 1,
    output_unit: 'bungkus',
    dosage: '',
    frequency: '',
    duration: '',
    route: 'oral',
    instructions: '',
    notes: '',
    items: [] as Array<{ medicine_id: number; quantity: number; dosage?: string; notes: string }>,
  });

  const workflowStatus = record?.prescription_workflow_status || 'draft';
  const persistedFulfillmentMode = record?.prescription_fulfillment_mode || '';
  const hasItems = prescriptions.length + compounds.length > 0;
  const workflowLocked = workflowStatus !== 'draft';
  const canEditItems = !readOnly && !workflowLocked;
  const canPrintPrescription = Boolean(
    onPrintOrder
    && persistedFulfillmentMode === 'print'
    && hasItems
    && workflowStatus !== 'printed'
    && !actionState?.printingPrescription
  ) || Boolean(
    onPrintOrder
    && persistedFulfillmentMode === 'internal'
    && hasItems
    && workflowStatus !== 'draft'
    && !actionState?.printingPrescription
  );
  const canPrintTicket = Boolean(
    onPrintTicket
    && persistedFulfillmentMode === 'internal'
    && hasItems
    && workflowStatus !== 'draft'
    && !actionState?.printingTicket
  );
  const showCancelOrderButton = Boolean(canCancelOrder && onCancelOrder);
  const selectedMedicine = useMemo(
    () => medicines.find((item) => String(item.id) === medicineId) || null,
    [medicineId, medicines]
  );

  const formatMedicineName = (name: string, strength?: string) => {
    const trimmedName = name.trim();
    const trimmedStrength = strength?.trim();
    if (trimmedStrength && !trimmedName.toLowerCase().includes(trimmedStrength.toLowerCase())) {
      return `${trimmedName} ${trimmedStrength}`;
    }
    return trimmedName;
  };

  const medicineOptions = medicines.map((medicine) => ({
    value: String(medicine.id),
    label: `${formatMedicineName(medicine.name, medicine.strength)} · stok ${medicine.current_stock}`,
  }));

  const preparationLabel = (value?: string) => PRESCRIPTION_COMPOUND_PREPARATION_OPTIONS.find((option) => option.value === value)?.label || value || 'Racikan';

  const buildPrescriptionPrice = (item: Prescription) => (item.medicine?.selling_price || 0) * item.quantity;
  const buildCompoundPrice = (item: PrescriptionCompound) => (item.items || []).reduce((total, ingredient) => total + ((ingredient.medicine?.selling_price || 0) * ingredient.quantity), 0);

  const orderItems = useMemo<OrderListItem[]>(() => {
    const mappedPrescriptions: OrderListItem[] = prescriptions.map((item) => ({
      key: `prescription-${item.id}`,
      kind: 'non-racikan',
      name: item.medicine?.name || '-',
      quantityLabel: `${item.quantity} ${item.medicine?.unit?.name || 'item'}`,
      ruleLabel: item.instructions || [item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || 'Aturan belum lengkap',
      price: buildPrescriptionPrice(item),
      createdAt: item.created_at,
      status: item.status,
      instructions: item.instructions,
      notes: item.notes,
      data: item,
    }));

    const mappedCompounds: OrderListItem[] = compounds.map((item) => ({
      key: `compound-${item.id}`,
      kind: 'racikan',
      name: item.name,
      quantityLabel: `${item.output_quantity} ${item.output_unit || 'hasil'} · ${preparationLabel(item.preparation_type)}`,
      ruleLabel: item.instructions || [item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || 'Aturan belum lengkap',
      price: buildCompoundPrice(item),
      createdAt: item.created_at,
      status: item.status,
      instructions: item.instructions,
      notes: item.notes,
      data: item,
    }));

    return [...mappedPrescriptions, ...mappedCompounds].sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [compounds, prescriptions]);

  const totalPrice = useMemo(() => orderItems.reduce((total, item) => total + item.price, 0), [orderItems]);
  const selectedMedicineLineTotal = useMemo(
    () => (selectedMedicine?.selling_price || 0) * payload.quantity,
    [payload.quantity, selectedMedicine]
  );
  const resetNonCompoundComposer = () => {
    setMedicineId('');
    setPayload({ quantity: 1, dosage: '', frequency: '', duration: '', route: 'oral', instructions: '', notes: '' });
  };

  const filteredMedicines = useMemo(() => {
    if (!medicineSearchQuery.trim()) return medicines.slice(0, 100);
    const q = medicineSearchQuery.toLowerCase().trim();
    return medicines.filter((m) =>
      m.name?.toLowerCase().includes(q) ||
      m.code?.toLowerCase().includes(q) ||
      m.generic_name?.toLowerCase().includes(q) ||
      m.strength?.toLowerCase().includes(q)
    ).slice(0, 100);
  }, [medicines, medicineSearchQuery]);

  const unselectedMedicines = useMemo(() => {
    const selectedIds = new Set(compoundPayload.items.map((i) => i.medicine_id));
    return filteredMedicines.filter((m) => !selectedIds.has(m.id));
  }, [filteredMedicines, compoundPayload.items]);

  const resetCompoundComposer = () => {
    setRecipeCode('R.01');
    setSelectedJenisRacikan('R.01 Kapsul');
    setCompoundPayload({
      name: '',
      preparation_type: 'kapsul_racik',
      output_quantity: 1,
      output_unit: 'bungkus',
      dosage: '',
      frequency: '',
      duration: '',
      route: 'oral',
      instructions: '',
      notes: '',
      items: [],
    });
    setMedicineSearchQuery('');
  };

  const handleJenisRacikanChange = (value: string) => {
    setSelectedJenisRacikan(value);
    const selected = JENIS_RACIKAN_OPTIONS.find((opt) => opt.value === value);
    if (selected) {
      setRecipeCode(selected.code);
      setCompoundPayload((prev) => ({
        ...prev,
        preparation_type: selected.type,
        output_unit: selected.unit,
        dosage: prev.dosage || selected.defaultDose,
      }));
    }
  };

  const handleAddMedicineToCompound = (med: Medicine) => {
    if (compoundPayload.items.some((item) => item.medicine_id === med.id)) {
      return;
    }
    const defaultDose = med.strength || '1 tab';
    const estimatedQty = calculateEstimatedQuantity(defaultDose, compoundPayload.output_quantity || 1, med.strength);
    const unitName = med.unit?.name || 'tab';

    setCompoundPayload((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          medicine_id: med.id,
          quantity: estimatedQty,
          dosage: defaultDose,
          notes: `Dosis: ${defaultDose} (Total potong: ${estimatedQty} ${unitName})`,
        },
      ],
    }));
  };

  const handleItemDosageChange = (index: number, newDosage: string) => {
    setCompoundPayload((prev) => {
      const nextItems = [...prev.items];
      const target = nextItems[index];
      if (!target) return prev;
      const med = medicines.find((m) => m.id === target.medicine_id);
      const newQty = calculateEstimatedQuantity(newDosage, prev.output_quantity || 1, med?.strength);
      const unitName = med?.unit?.name || 'tab';

      nextItems[index] = {
        ...target,
        dosage: newDosage,
        quantity: newQty,
        notes: `Dosis: ${newDosage} (Total potong: ${newQty} ${unitName})`,
      };
      return { ...prev, items: nextItems };
    });
  };


  const handleRemoveCompoundItem = (index: number) => {
    setCompoundPayload((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleOutputQuantityChange = (newQty: number) => {
    setCompoundPayload((prev) => {
      const nextItems = prev.items.map((item) => {
        const med = medicines.find((m) => m.id === item.medicine_id);
        const dose = item.dosage || '1 tab';
        const recalculatedQty = calculateEstimatedQuantity(dose, newQty, med?.strength);
        const unitName = med?.unit?.name || 'tab';
        return {
          ...item,
          quantity: recalculatedQty,
          notes: `Dosis: ${dose} (Total potong: ${recalculatedQty} ${unitName})`,
        };
      });
      return {
        ...prev,
        output_quantity: newQty,
        items: nextItems,
      };
    });
  };

  const handleMedicineChange = (value: string) => {
    setMedicineId(value);
    const selected = medicines.find((item) => String(item.id) === value) || null;
    setPayload((prev) => ({
      ...prev,
      dosage: selected?.strength || '',
    }));
  };

  const handleAddPrescription = () => {
    if (!medicineId) return;
    onAdd({ ...payload, medicine_id: Number(medicineId) });
    resetNonCompoundComposer();
    setAddModalOpen(false);
  };

  const openDetailItem = (item: OrderListItem) => {
    setDetailItem(item.kind === 'non-racikan'
      ? { kind: 'non-racikan', item: item.data as Prescription }
      : { kind: 'racikan', item: item.data as PrescriptionCompound });
  };

  const submitCompound = () => {
    if (!onAddCompound) return;
    if (compoundPayload.items.length === 0 || compoundPayload.output_quantity < 1) return;

    const currentCode = recipeCode.trim() || 'R.01';
    let finalName = compoundPayload.name.trim();
    if (finalName) {
      if (currentCode && !finalName.toLowerCase().startsWith(currentCode.toLowerCase())) {
        finalName = `${currentCode} - ${finalName}`;
      }
    } else {
      finalName = selectedJenisRacikan || `${currentCode} Kapsul`;
    }

    onAddCompound({
      ...compoundPayload,
      name: finalName,
      output_quantity: compoundPayload.output_quantity || 1,
      output_unit: compoundPayload.output_unit.trim() || 'bungkus',
      dosage: compoundPayload.dosage.trim(),
      frequency: compoundPayload.frequency.trim(),
      duration: compoundPayload.duration.trim(),
      instructions: compoundPayload.instructions.trim(),
      notes: compoundPayload.notes.trim(),
      items: compoundPayload.items.map((item) => {
        const med = medicines.find((m) => m.id === item.medicine_id);
        const unitName = med?.unit?.name || 'tab';
        const dose = item.dosage || '1 tab';
        const qty = Math.max(1, Math.ceil(item.quantity || 1));
        const formattedNotes = item.notes?.trim() || `Dosis: ${dose} (Total potong: ${qty} ${unitName})`;

        return {
          medicine_id: item.medicine_id,
          quantity: qty,
          notes: formattedNotes,
        };
      }),
    });
    resetCompoundComposer();
    setAddModalOpen(false);
  };

  return (
    <section className="space-y-3">
      <TableSection>
        <PaperTableRow>
          <PaperTableCell label="Mode Pemenuhan">
            <SearchableSelect
              options={PRESCRIPTION_FULFILLMENT_OPTIONS}
              value={draft.prescription_fulfillment_mode}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, prescription_fulfillment_mode: (value as '' | 'internal' | 'print') || '' }))}
              placeholder="Pilih mode pemenuhan"
              disabled={!canEditItems}
              square
              className={PAPER_SELECT_TRIGGER_CLASSNAME}
            />
          </PaperTableCell>
          <PaperTableCell label="Status Order">
            <div className="flex min-h-[28px] items-center">
              <Badge
                variant="outline"
                className={cn(
                  'rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]',
                  getPrescriptionWorkflowBadgeClassName(workflowStatus),
                )}
              >
                {getPrescriptionWorkflowLabel(workflowStatus)}
              </Badge>
            </div>
          </PaperTableCell>
          <PaperTableCell label="Ringkasan">
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{getPrescriptionFulfillmentLabel(draft.prescription_fulfillment_mode)}</p>
              <p>{hasItems ? `${orderItems.length} item obat · ${formatCurrency(totalPrice)}` : 'Belum ada item obat'}</p>
            </div>
          </PaperTableCell>
        </PaperTableRow>
        <PaperTableRow>
          <PaperTableCell label="Catatan Resep" colSpan={3}>
            <TextEditor label="Catatan Resep" hideLabel value={draft.notes} onChange={(value) => setDraft((prev) => ({ ...prev, notes: value }))} disabled={!canEditItems} rows={2} />
          </PaperTableCell>
        </PaperTableRow>
      </TableSection>

      <section className="space-y-2 border border-border/70 bg-background p-3">
        <div className="flex flex-col gap-3 px-0.5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[13px] font-semibold tracking-tight">Daftar Obat</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
              {orderItems.length} item
            </Badge>
            {showCancelOrderButton && (
              <Button
                type="button"
                variant="outline"
                className="rounded-none border-destructive/40 text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setCancelDialogOpen(true)}
                disabled={actionState?.canceling}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                {actionState?.canceling ? 'Membatalkan...' : 'Batal Order'}
              </Button>
            )}
            {canPrintTicket && (
              <Button
                type="button"
                variant="outline"
                className="rounded-none shadow-none"
                onClick={onPrintTicket}
              >
                <Printer className="mr-1.5 h-4 w-4" />
                {actionState?.printingTicket ? 'Menyiapkan Tiket...' : 'Cetak Tiket'}
              </Button>
            )}
            {canPrintPrescription && (
              <Button
                type="button"
                variant="outline"
                className="rounded-none shadow-none"
                onClick={onPrintOrder}
              >
                <Printer className="mr-1.5 h-4 w-4" />
                {actionState?.printingPrescription ? 'Menyiapkan...' : 'Cetak Resep'}
              </Button>
            )}
            {canEditItems && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5 rounded-none shadow-none"
                  onClick={() => {
                    setComposerMode('non-racikan');
                    setAddModalOpen(true);
                  }}
                >
                  <FilePlus2 className="h-4 w-4" /> Tambah Non-Racikan
                </Button>
                <Button
                  type="button"
                  className="gap-1.5 rounded-none"
                  onClick={() => {
                    setComposerMode('racikan');
                    resetCompoundComposer();
                    setAddModalOpen(true);
                  }}
                >
                  <FlaskConical className="h-4 w-4" /> Tambah Racikan
                </Button>
              </div>
            )}
          </div>
        </div>

        {orderItems.length === 0 ? (
          <div className="border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">Belum ada item obat pada resep ini.</div>
        ) : (
          <div className="overflow-x-auto border border-border/70">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-muted/25">
                <tr className="border-b border-border/70 text-left">
                  <th className="px-3 py-2 font-semibold text-foreground/90">Item Obat</th>
                  <th className="px-3 py-2 font-semibold text-foreground/90">Aturan / Signa</th>
                  <th className="w-[160px] px-3 py-2 text-right font-semibold text-foreground/90">Harga</th>
                  <th className="w-[64px] px-3 py-2 text-right font-semibold text-foreground/90">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => {
                  const ruleText = item.instructions || item.ruleLabel;
                  const extraNote = item.notes?.trim() && item.notes.trim() !== item.instructions?.trim()
                    ? item.notes.trim()
                    : null;

                  return (
                    <tr
                      key={item.key}
                      className="cursor-pointer border-b border-border/60 align-middle transition hover:bg-muted/20"
                      onClick={() => openDetailItem(item)}
                    >
                      <td className="px-3 py-2">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.kind === 'racikan' && (
                              <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[10px] font-bold tracking-wider font-mono bg-primary/10 text-primary border-primary/30">
                                {item.name.match(/^R\/?\s*\d+/i)?.[0]?.toUpperCase() || 'R/'}
                              </Badge>
                            )}
                            <p className="text-[13px] font-semibold leading-4 text-foreground/95">
                              {item.kind === 'racikan' && item.name.match(/^R\/?\s*\d+\s*[-:]?\s*/i)
                                ? item.name.replace(/^R\/?\s*\d+\s*[-:]?\s*/i, '') || item.name
                                : item.name}
                            </p>
                            <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.14em]">
                              {item.kind === 'non-racikan' ? 'Non-Racikan' : 'Racikan'}
                            </Badge>
                          </div>
                          <div className="text-[11px] leading-4 text-muted-foreground">
                            {item.quantityLabel}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-0.5 text-xs">
                          <p className="font-medium text-foreground/90">{ruleText}</p>
                          {extraNote ? <p className="text-[11px] text-muted-foreground">Catatan: {extraNote}</p> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.price)}</td>
                      <td className="px-3 py-2 text-right">
                        {canEditItems ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Hapus obat"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (item.kind === 'non-racikan') {
                                onDelete((item.data as Prescription).id);
                              } else {
                                onDeleteCompound?.((item.data as PrescriptionCompound).id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/25">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
                    Grand Total
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground/95">{formatCurrency(totalPrice)}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={() => {
          setCancelDialogOpen(false);
          onCancelOrder?.();
        }}
        title="Batalkan Order Resep"
        description="Order resep akan dikembalikan ke draft supaya bisa diedit lagi. Aksi ini hanya tersedia sebelum farmasi mulai memproses order."
        confirmText={actionState?.canceling ? 'Membatalkan...' : 'Batalkan Order'}
        cancelText="Kembali"
        variant="destructive"
      />

      {canEditItems && (
        <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
          <DialogContent
            className={cn(
              "flex w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden sm:rounded-xl border border-border/70 p-0 transition-all duration-200",
              composerMode === 'racikan'
                ? "max-w-6xl h-[88vh] max-h-[92vh]"
                : "max-w-4xl max-h-[90vh]"
            )}
          >
            <Tabs
              value={composerMode}
              onValueChange={(value) => {
                const nextMode = value as ComposerMode;
                setComposerMode(nextMode);
                if (nextMode === 'racikan' && !compoundPayload.name && compoundPayload.items.length === 0) {
                  setRecipeCode('R.01');
                  setSelectedJenisRacikan('R.01 Kapsul');
                }
              }}
              className="flex h-full min-h-0 flex-col"
            >
              <DialogHeader className="border-b border-border/70 px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pr-8">
                  <div>
                    <DialogTitle className="text-lg font-bold text-foreground">
                      {composerMode === 'non-racikan' ? 'Tambah Item Obat Non-Racikan' : 'Tambah Racikan'}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                      {composerMode === 'non-racikan'
                        ? 'Pilih obat dan tentukan aturan pakai untuk resep non-racikan.'
                        : 'Tentukan aturan pakai dan pilih bahan obat beserta dosisnya.'}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                <TabsContent value="non-racikan" className="mt-0 space-y-4">
                  {selectedMedicine && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <ModalStatCard
                        label="Harga Satuan"
                        value={formatCurrency(selectedMedicine.selling_price || 0)}
                      />
                      <ModalStatCard
                        label="Stok Tersedia"
                        value={`${selectedMedicine.current_stock ?? '-'} ${selectedMedicine.unit?.name || ''}`}
                      />
                      <ModalStatCard
                        label="Estimasi Total"
                        value={formatCurrency(selectedMedicineLineTotal)}
                      />
                    </div>
                  )}

                  <TableSection>
                    <PaperTableRow>
                      <PaperTableCell label="Obat" colSpan={4}>
                        <SearchableSelect
                          options={medicineOptions}
                          value={medicineId}
                          onValueChange={handleMedicineChange}
                          placeholder="Pilih obat"
                          searchPlaceholder="Cari obat..."
                          square
                          className={PAPER_SELECT_TRIGGER_CLASSNAME}
                        />
                      </PaperTableCell>
                    </PaperTableRow>
                    <PaperTableRow>
                      <PaperTableCell label="Jumlah" colSpan={2}>
                        <NumberInput
                          label="Jumlah"
                          hideLabel
                          value={payload.quantity}
                          onChange={(value) => setPayload((prev) => ({ ...prev, quantity: value || 1 }))}
                          disabled={false}
                          min={1}
                        />
                      </PaperTableCell>
                      <PaperTableCell label="Dosis" colSpan={2}>
                        <Input
                          value={payload.dosage}
                          onChange={(event) => setPayload((prev) => ({ ...prev, dosage: event.target.value }))}
                          className={PAPER_INPUT_CLASSNAME}
                          placeholder="Contoh: 10 mg / 1 tablet"
                        />
                      </PaperTableCell>
                    </PaperTableRow>
                    <PaperTableRow>
                      <PaperTableCell label="Signa" colSpan={4}>
                        <SearchableSelect
                          options={PRESCRIPTION_SIGNA_OPTIONS}
                          value={payload.instructions}
                          onValueChange={(value) => setPayload((prev) => ({ ...prev, instructions: value }))}
                          placeholder="Pilih atau ketik signa (contoh: 3 × 1 Setelah Makan)"
                          searchPlaceholder="Cari atau ketik signa..."
                          square
                          allowCustom
                          className={PAPER_SELECT_TRIGGER_CLASSNAME}
                        />
                      </PaperTableCell>
                    </PaperTableRow>
                    <PaperTableRow>
                      <PaperTableCell label="Catatan Tambahan" colSpan={4}>
                        <TextEditor
                          label="Catatan"
                          hideLabel
                          value={payload.notes}
                          onChange={(value) => setPayload((prev) => ({ ...prev, notes: value }))}
                          placeholder="Opsional"
                          disabled={false}
                          rows={2}
                        />
                      </PaperTableCell>
                    </PaperTableRow>
                  </TableSection>
                </TabsContent>

                <TabsContent value="racikan" className="mt-0 space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                    {/* KARTU KIRI: Informasi Racikan */}
                    <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3.5 shadow-sm">
                      <div className="flex items-start justify-between border-b border-border/60 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Informasi Racikan</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">Isi identitas racikan dan aturan pakai utamanya.</p>
                        </div>
                        <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-xs font-medium border-border/80 bg-background text-foreground/80">
                          {compoundPayload.items.length} komponen
                        </Badge>
                      </div>

                      {/* Row 1: Nama Racikan & Jenis Racikan */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground/90">Nama Racikan</label>
                          <Input
                            value={compoundPayload.name}
                            onChange={(e) => setCompoundPayload((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="Contoh: Racikan Demam Anak"
                            className="rounded-md h-9 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground/90">Jenis Racikan</label>
                          <Select
                            value={selectedJenisRacikan}
                            onValueChange={handleJenisRacikanChange}
                          >
                            <SelectTrigger className="rounded-md h-9 text-xs bg-background">
                              <SelectValue placeholder="Pilih jenis racikan" />
                            </SelectTrigger>
                            <SelectContent className="z-[9999]">
                              {JENIS_RACIKAN_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className="text-xs cursor-pointer">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Row 2: Jumlah Hasil, Satuan Hasil, Dosis */}
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground/90">Jumlah Hasil</label>
                          <Input
                            type="number"
                            min={1}
                            value={compoundPayload.output_quantity || ''}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              handleOutputQuantityChange(val);
                            }}
                            className="rounded-md h-9 text-xs font-medium"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground/90">Satuan Hasil</label>
                          <Input
                            value={compoundPayload.output_unit}
                            onChange={(e) => setCompoundPayload((prev) => ({ ...prev, output_unit: e.target.value }))}
                            placeholder="bungkus"
                            className="rounded-md h-9 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground/90">Dosis</label>
                          <Input
                            value={compoundPayload.dosage}
                            onChange={(e) => setCompoundPayload((prev) => ({ ...prev, dosage: e.target.value }))}
                            placeholder="Contoh: 1 bungkus"
                            className="rounded-md h-9 text-xs"
                          />
                        </div>
                      </div>

                      {/* Row 3: Signa & Catatan */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground/90">Signa</label>
                          <SearchableSelect
                            options={PRESCRIPTION_SIGNA_OPTIONS}
                            value={compoundPayload.instructions}
                            onValueChange={(val) => setCompoundPayload((prev) => ({ ...prev, instructions: val }))}
                            placeholder="Pilih atau ketik signa"
                            searchPlaceholder="Cari atau ketik signa..."
                            allowCustom
                            className="rounded-md h-9 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground/90">Catatan</label>
                          <Input
                            value={compoundPayload.notes}
                            onChange={(e) => setCompoundPayload((prev) => ({ ...prev, notes: e.target.value }))}
                            placeholder="Catatan racikan (opsional)"
                            className="rounded-md h-9 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* KARTU KANAN: Pilih Bahan Obat */}
                    <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3.5 shadow-sm">
                      <div className="flex items-start justify-between border-b border-border/60 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Pilih Bahan Obat</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">Klik obat untuk menambah dan mengisi dosis bahan.</p>
                        </div>
                        <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-xs font-medium border-border/80 bg-background text-foreground/80">
                          {compoundPayload.items.length} dipilih
                        </Badge>
                      </div>

                      {/* Input Pencarian */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={medicineSearchQuery}
                          onChange={(e) => setMedicineSearchQuery(e.target.value)}
                          placeholder="Cari nama atau kode obat..."
                          className="pl-9 h-9 text-xs rounded-md"
                        />
                      </div>

                      {/* Bahan Terpilih */}
                      {compoundPayload.items.length > 0 && (
                        <div className="rounded-md border border-border/70 overflow-hidden bg-background">
                          <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground/90 border-b border-border/60 bg-muted/20">
                            <CheckCircle2 className="h-4 w-4 text-foreground/75" />
                            <span>Bahan Terpilih ({compoundPayload.items.length})</span>
                          </div>
                          <div className="divide-y divide-border/60 max-h-[190px] overflow-y-auto">
                            {compoundPayload.items.map((item, idx) => {
                              const med = medicines.find((m) => m.id === item.medicine_id);
                              const code = med?.code || `OBT${String(item.medicine_id).padStart(7, '0')}`;
                              return (
                                <div key={`${item.medicine_id}-${idx}`} className="flex items-center justify-between p-3 gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground/95 truncate">
                                      {med?.name || `Obat #${item.medicine_id}`}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {code}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-muted-foreground font-medium">Dosis:</span>
                                    <Input
                                      value={item.dosage || ''}
                                      onChange={(e) => handleItemDosageChange(idx, e.target.value)}
                                      placeholder="Dosis"
                                      className="w-24 h-8 text-xs rounded-md font-medium"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleRemoveCompoundItem(idx)}
                                      className="h-8 w-8 text-destructive border-destructive/30 hover:bg-destructive/10 rounded-md shrink-0"
                                      title="Hapus bahan"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Pilih Bahan Lainnya */}
                      <div className="space-y-1.5 pt-0.5">
                        <p className="text-xs font-semibold text-muted-foreground">Pilih Bahan Lainnya:</p>
                        <div className="rounded-md border border-border/70 divide-y divide-border/60 max-h-[220px] overflow-y-auto bg-background">
                          {unselectedMedicines.length === 0 ? (
                            <div className="p-6 text-center text-xs text-muted-foreground">
                              {compoundPayload.items.length > 0 && !medicineSearchQuery.trim()
                                ? 'Semua obat yang cocok sudah dipilih'
                                : `Tidak ada obat yang cocok dengan pencarian "${medicineSearchQuery}"`}
                            </div>
                          ) : (
                            unselectedMedicines.map((med) => (
                              <div
                                key={med.id}
                                className="flex items-center justify-between p-3 hover:bg-muted/30 transition gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-foreground/95 truncate">{med.name}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {med.code || `OBT${String(med.id).padStart(7, '0')}`} • {med.form || '-'} • {med.strength || '-'}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddMedicineToCompound(med)}
                                  className="h-7 px-3 text-xs font-medium shrink-0 rounded-md hover:bg-muted"
                                >
                                  + Pilih
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>

              <DialogFooter className="flex items-center justify-end gap-2 border-t border-border/70 bg-background/95 px-6 py-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-md"
                  onClick={() => setAddModalOpen(false)}
                >
                  Tutup
                </Button>
                {composerMode === 'non-racikan' ? (
                  <Button
                    type="button"
                    className="gap-1.5 rounded-md"
                    disabled={!medicineId}
                    onClick={handleAddPrescription}
                  >
                    <FilePlus2 className="h-4 w-4" /> Tambah Obat
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="gap-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 font-medium"
                    disabled={compoundPayload.items.length === 0 || compoundPayload.output_quantity < 1}
                    onClick={submitCompound}
                  >
                    Simpan Racikan
                  </Button>
                )}
              </DialogFooter>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={Boolean(detailItem)} onOpenChange={(open) => {
        if (!open) setDetailItem(null);
      }}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center border border-border/70 bg-muted/20">
                  {detailItem?.kind === 'non-racikan' ? <FilePlus2 className="h-5 w-5" /> : <FlaskConical className="h-5 w-5" />}
                </div>
                <div>
                  <DialogTitle className="text-base font-semibold tracking-tight">
                    {detailItem?.kind === 'non-racikan' ? 'Detail Obat Non-Racikan' : 'Detail Obat Racikan'}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Detail informasi obat resep
                  </DialogDescription>
                </div>
              </div>

              {detailItem ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                    {detailItem.kind === 'non-racikan' ? 'Non-Racikan' : 'Racikan'}
                  </Badge>
                  <Badge variant="outline" className="rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                    {detailItem.item.status || '-'}
                  </Badge>
                  <Badge variant="outline" className="rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                    {formatCurrency(detailItem.kind === 'non-racikan' ? buildPrescriptionPrice(detailItem.item) : buildCompoundPrice(detailItem.item))}
                  </Badge>
                </div>
              ) : null}
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            {detailItem?.kind === 'non-racikan' ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <ModalStatCard
                    label="Nama Obat"
                    value={detailItem.item.medicine?.name || '-'}
                  />
                  <ModalStatCard
                    label="Kekuatan"
                    value={detailItem.item.medicine?.strength || '-'}
                  />
                  <ModalStatCard
                    label="Stok Saat Ini"
                    value={`${detailItem.item.medicine?.current_stock ?? 0} ${detailItem.item.medicine?.unit?.name || ''}`}
                  />
                  <ModalStatCard
                    label="Harga Satuan"
                    value={formatCurrency(detailItem.item.medicine?.selling_price || 0)}
                  />
                </div>

                <TableSection title="Informasi Item">
                  <PaperTableRow>
                    <PaperTableCell label="Nama Obat">
                      <div className="text-sm">{detailItem.item.medicine?.name || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Kekuatan / Bentuk">
                      <div className="text-sm">{[detailItem.item.medicine?.strength, detailItem.item.medicine?.form].filter(Boolean).join(' · ') || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Jumlah">
                      <div className="text-sm">{detailItem.item.quantity} {detailItem.item.medicine?.unit?.name || 'item'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Dosis">
                      <div className="text-sm">{detailItem.item.dosage || '-'}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                  <PaperTableRow>
                    <PaperTableCell label="Signa" colSpan={2}>
                      <div className="text-sm font-medium">{detailItem.item.instructions || [detailItem.item.dosage, detailItem.item.frequency, detailItem.item.duration].filter(Boolean).join(' · ') || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Catatan" colSpan={2}>
                      <div className="text-sm whitespace-pre-wrap">{detailItem.item.notes || '-'}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                </TableSection>

                <TableSection title="Detail Master Obat">
                  <PaperTableRow>
                    <PaperTableCell label="Nama Generik">
                      <div className="text-sm">{detailItem.item.medicine?.generic_name || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Pabrikan">
                      <div className="text-sm">{detailItem.item.medicine?.manufacturer || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Stok Saat Ini">
                      <div className="text-sm">{detailItem.item.medicine?.current_stock ?? 0}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Harga Satuan">
                      <div className="text-sm">{formatCurrency(detailItem.item.medicine?.selling_price || 0)}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                </TableSection>
              </div>
            ) : detailItem?.kind === 'racikan' ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <ModalStatCard
                    label="Nama Racikan"
                    value={detailItem.item.name || '-'}
                  />
                  <ModalStatCard
                    label="Hasil Jadi"
                    value={`${detailItem.item.output_quantity} ${detailItem.item.output_unit || 'hasil'}`}
                  />
                  <ModalStatCard
                    label="Jumlah Bahan"
                    value={`${detailItem.item.items?.length || 0} item`}
                  />
                  <ModalStatCard
                    label="Total Nilai"
                    value={formatCurrency(buildCompoundPrice(detailItem.item))}
                  />
                </div>

                <TableSection title="Informasi Racikan">
                  <PaperTableRow>
                    <PaperTableCell label="Nama Racikan" colSpan={2}>
                      <div className="text-sm">{detailItem.item.name || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Jenis">
                      <div className="text-sm">{preparationLabel(detailItem.item.preparation_type)}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Hasil Jadi">
                      <div className="text-sm">{detailItem.item.output_quantity} {detailItem.item.output_unit || 'hasil'}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                  <PaperTableRow>
                    <PaperTableCell label="Signa" colSpan={2}>
                      <div className="text-sm font-medium">{detailItem.item.instructions || [detailItem.item.dosage, detailItem.item.frequency, detailItem.item.duration].filter(Boolean).join(' · ') || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Catatan" colSpan={2}>
                      <div className="text-sm whitespace-pre-wrap">{detailItem.item.notes || '-'}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                </TableSection>

                <section className="space-y-1.5">
                  <div className="px-0.5">
                    <h3 className="text-[13px] font-semibold tracking-tight">Bahan Obat Racikan</h3>
                  </div>
                  <div className="overflow-x-auto border border-border/70">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead className="bg-muted/25">
                        <tr className="border-b border-border/70 text-left">
                          <th className="px-3 py-2.5 font-semibold text-foreground/90">Bahan</th>
                          <th className="px-3 py-2.5 font-semibold text-foreground/90">Dosis / Takaran</th>
                          <th className="w-[140px] px-3 py-2.5 text-right font-semibold text-foreground/90">Harga Satuan</th>
                          <th className="px-3 py-2.5 font-semibold text-foreground/90">Catatan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detailItem.item.items || []).map((ingredient) => {
                          const doseMatch = ingredient.notes?.match(/Dosis:\s*([^·]+)/i)?.[1]?.trim();
                          const extraNote = ingredient.notes?.replace(/Dosis:\s*[^·]+(·\s*)?/i, '').trim();

                          return (
                            <tr key={ingredient.id} className="border-b border-border/60 align-top last:border-b-0">
                              <td className="px-3 py-2.5">
                                <div className="space-y-0.5">
                                  <p className="font-medium">{ingredient.medicine?.name || '-'}</p>
                                  <p className="text-xs text-muted-foreground">{[ingredient.medicine?.strength, ingredient.medicine?.form].filter(Boolean).join(' · ') || '-'}</p>
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                {doseMatch ? (
                                  <Badge variant="outline" className="rounded-none bg-primary/10 text-primary border-primary/25 font-mono text-xs font-semibold">
                                    {doseMatch}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">{formatCurrency(ingredient.medicine?.selling_price || 0)}</td>
                              <td className="px-3 py-2.5 text-xs text-foreground/90">{extraNote || (!doseMatch && ingredient.notes) || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-3">
            <Button type="button" variant="outline" className="rounded-none" onClick={() => setDetailItem(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
