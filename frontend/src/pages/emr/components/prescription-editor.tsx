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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MedicalRecord, Medicine, Prescription, PrescriptionCompound } from '@/lib/api';
import {
  PRESCRIPTION_COMPOUND_PREPARATION_OPTIONS,
  PRESCRIPTION_DURATION_OPTIONS,
  PRESCRIPTION_FULFILLMENT_OPTIONS,
  PRESCRIPTION_FREQUENCY_OPTIONS,
  PRESCRIPTION_INSTRUCTION_OPTIONS,
  PRESCRIPTION_ROUTE_OPTIONS,
  getPrescriptionWorkflowBadgeClassName,
  getPrescriptionFulfillmentLabel,
  getPrescriptionWorkflowLabel,
} from '../constants';
import { cn } from '@/lib/utils';
import type { MedicalRecordDraft } from '../types';
import { FilePlus2, FlaskConical, Printer, XCircle } from 'lucide-react';
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
  const [ingredientDraft, setIngredientDraft] = useState({
    medicineId: '',
    quantity: 1,
    notes: '',
  });
  const [compoundPayload, setCompoundPayload] = useState({
    name: '',
    preparation_type: 'puyer',
    output_quantity: 10,
    output_unit: 'bungkus',
    dosage: '',
    frequency: '',
    duration: '',
    route: 'oral',
    instructions: '',
    notes: '',
    items: [] as Array<{ medicine_id: number; quantity: number; notes: string }>,
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

  const medicineOptions = medicines.map((medicine) => ({
    value: String(medicine.id),
    label: `${medicine.name}${medicine.strength ? ` ${medicine.strength}` : ''} · stok ${medicine.current_stock}`,
  }));

  const ingredientLabel = (medicineIdValue: number) => {
    const medicine = medicines.find((item) => item.id === medicineIdValue);
    if (!medicine) return '-';
    return `${medicine.name}${medicine.strength ? ` ${medicine.strength}` : ''}`;
  };

  const preparationLabel = (value?: string) => PRESCRIPTION_COMPOUND_PREPARATION_OPTIONS.find((option) => option.value === value)?.label || value || 'Racikan';

  const buildPrescriptionPrice = (item: Prescription) => (item.medicine?.selling_price || 0) * item.quantity;
  const buildCompoundPrice = (item: PrescriptionCompound) => (item.items || []).reduce((total, ingredient) => total + ((ingredient.medicine?.selling_price || 0) * ingredient.quantity), 0);

  const orderItems = useMemo<OrderListItem[]>(() => {
    const mappedPrescriptions: OrderListItem[] = prescriptions.map((item) => ({
      key: `prescription-${item.id}`,
      kind: 'non-racikan',
      name: item.medicine?.name || '-',
      quantityLabel: `${item.quantity} ${item.medicine?.unit?.name || 'item'}`,
      ruleLabel: [item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || 'Aturan belum lengkap',
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
      ruleLabel: [item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || 'Aturan belum lengkap',
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
  const compoundDraftTotal = useMemo(
    () => compoundPayload.items.reduce((total, item) => {
      const medicine = medicines.find((entry) => entry.id === item.medicine_id);
      return total + ((medicine?.selling_price || 0) * item.quantity);
    }, 0),
    [compoundPayload.items, medicines]
  );

  const resetNonCompoundComposer = () => {
    setMedicineId('');
    setPayload({ quantity: 1, dosage: '', frequency: '', duration: '', route: 'oral', instructions: '', notes: '' });
  };

  const resetCompoundComposer = () => {
    setCompoundPayload({
      name: '',
      preparation_type: 'puyer',
      output_quantity: 10,
      output_unit: 'bungkus',
      dosage: '',
      frequency: '',
      duration: '',
      route: 'oral',
      instructions: '',
      notes: '',
      items: [],
    });
    setIngredientDraft({ medicineId: '', quantity: 1, notes: '' });
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
    if (!compoundPayload.name.trim() || compoundPayload.items.length === 0 || compoundPayload.output_quantity < 1) return;

    onAddCompound({
      ...compoundPayload,
      name: compoundPayload.name.trim(),
      output_unit: compoundPayload.output_unit.trim(),
      dosage: compoundPayload.dosage.trim(),
      frequency: compoundPayload.frequency.trim(),
      duration: compoundPayload.duration.trim(),
      instructions: compoundPayload.instructions.trim(),
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
            <p className="mt-0.5 text-xs text-muted-foreground">Semua item obat ditampilkan dalam satu tabel. Klik baris untuk membuka detail item.</p>
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
              <Button type="button" className="gap-1.5 rounded-none" onClick={() => setAddModalOpen(true)}>
                <FilePlus2 className="h-4 w-4" /> Tambah Obat
              </Button>
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
                  <th className="px-3 py-2 font-semibold text-foreground/90">Aturan</th>
                  <th className="w-[160px] px-3 py-2 text-right font-semibold text-foreground/90">Harga</th>
                  <th className="w-[88px] px-3 py-2 text-right font-semibold text-foreground/90">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => {
                  const additionalNotes = [
                    item.instructions?.trim(),
                    item.notes?.trim() ? `Catatan: ${item.notes.trim()}` : null,
                  ].filter(Boolean);

                  return (
                    <tr
                      key={item.key}
                      className="cursor-pointer border-b border-border/60 align-top transition hover:bg-muted/20"
                      onClick={() => openDetailItem(item)}
                    >
                      <td className="px-3 py-2">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[13px] font-semibold leading-4 text-foreground/95">{item.name}</p>
                            <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.14em]">
                              {item.kind === 'non-racikan' ? 'Non-Racikan' : 'Racikan'}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
                            <span>{item.quantityLabel}</span>
                            <span aria-hidden="true">•</span>
                            <span>{item.status}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-0.5 text-[11px] leading-4 text-muted-foreground">
                          <p className="text-foreground/80">{item.ruleLabel}</p>
                          {additionalNotes.length > 0 ? <p>{additionalNotes.join(' • ')}</p> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.price)}</td>
                      <td className="px-3 py-2 text-right">
                        {canEditItems ? (
                          item.kind === 'non-racikan' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 rounded-none px-2 text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDelete((item.data as Prescription).id);
                              }}
                            >
                              Hapus
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 rounded-none px-2 text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteCompound?.((item.data as PrescriptionCompound).id);
                              }}
                            >
                              Hapus
                            </Button>
                          )
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
          <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
            <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(15,23,42,0.01),transparent)] px-6 py-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center border border-border/70 bg-background">
                      {composerMode === 'non-racikan' ? <FilePlus2 className="h-5 w-5" /> : <FlaskConical className="h-5 w-5" />}
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-semibold tracking-tight">Tambah Item Obat</DialogTitle>
                      <DialogDescription className="max-w-2xl text-xs">
                        Modal ini dipusatkan untuk entri resep. Gunakan tab untuk berpindah antara obat non-racikan dan racikan tanpa keluar dari alur input.
                      </DialogDescription>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pl-14">
                  <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                    {composerMode === 'non-racikan' ? 'Non-Racikan' : 'Racikan'}
                  </Badge>
                  <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                    {orderItems.length} item
                  </Badge>
                  <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                    {formatCurrency(totalPrice)}
                  </Badge>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden">
              <aside className="border-b border-border/70 bg-muted/20 px-5 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-6">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ringkasan Cepat</p>
                    {composerMode === 'non-racikan' ? (
                      <div className="space-y-2">
                        <ModalStatCard
                          label="Obat Terpilih"
                          value={selectedMedicine ? `${selectedMedicine.name}${selectedMedicine.strength ? ` ${selectedMedicine.strength}` : ''}` : 'Belum dipilih'}
                          helper={selectedMedicine ? `${selectedMedicine.current_stock} stok tersedia` : 'Pilih obat untuk memuat data master.'}
                        />
                        <ModalStatCard
                          label="Dosis Master"
                          value={selectedMedicine?.strength || '-'}
                          helper="Diambil otomatis dari data master obat."
                        />
                        <ModalStatCard
                          label="Estimasi Nilai"
                          value={formatCurrency(selectedMedicineLineTotal)}
                          helper={`${payload.quantity} ${selectedMedicine?.unit?.name || 'item'} x ${formatCurrency(selectedMedicine?.selling_price || 0)}`}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <ModalStatCard
                          label="Nama Racikan"
                          value={compoundPayload.name || 'Belum diisi'}
                          helper={preparationLabel(compoundPayload.preparation_type)}
                        />
                        <ModalStatCard
                          label="Komposisi"
                          value={`${compoundPayload.items.length} bahan`}
                          helper={`${compoundPayload.output_quantity} ${compoundPayload.output_unit || 'hasil'} output`}
                        />
                        <ModalStatCard
                          label="Estimasi Nilai"
                          value={formatCurrency(compoundDraftTotal)}
                          helper="Akumulasi harga bahan pada racikan draft."
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-border/70 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Panduan</p>
                    <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                      {composerMode === 'non-racikan' ? (
                        <>
                          <p>1. Pilih obat dari master agar dosis, stok, dan harga dasar langsung terbaca.</p>
                          <p>2. Lengkapi frekuensi, durasi, rute, dan aturan pakai dari pilihan yang tersedia.</p>
                          <p>3. Simpan item saat ringkasan di panel ini sudah sesuai.</p>
                        </>
                      ) : (
                        <>
                          <p>1. Isi nama racikan dan hasil jadi untuk mendefinisikan output resep.</p>
                          <p>2. Tambahkan bahan satu per satu sampai komposisi racikan lengkap.</p>
                          <p>3. Periksa estimasi nilai bahan sebelum menambahkan racikan ke resep.</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </aside>

              <div className="min-h-0 px-5 py-5 lg:overflow-y-auto lg:px-6 lg:py-6">
                <Tabs value={composerMode} onValueChange={(value) => setComposerMode(value as ComposerMode)}>
                  <div className="flex flex-col gap-4 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[13px] font-semibold tracking-tight">Form Entri Resep</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Struktur form tetap sama, tetapi tata letaknya dipadatkan agar lebih nyaman dibaca di modal besar.
                      </p>
                    </div>
                    <TabsList className="grid h-10 w-full grid-cols-2 rounded-none bg-muted/60 md:w-[320px]">
                      <TabsTrigger value="non-racikan" className="rounded-none">Non-Racikan</TabsTrigger>
                      <TabsTrigger value="racikan" className="rounded-none">Racikan</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="non-racikan" className="mt-5">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <ModalStatCard
                          label="Harga Satuan"
                          value={formatCurrency(selectedMedicine?.selling_price || 0)}
                          helper={selectedMedicine ? 'Mengikuti harga jual master obat.' : 'Belum ada obat terpilih.'}
                        />
                        <ModalStatCard
                          label="Stok Tersedia"
                          value={selectedMedicine?.current_stock ?? '-'}
                          helper={selectedMedicine?.unit?.name || 'satuan master obat'}
                        />
                        <ModalStatCard
                          label="Rute Pemberian"
                          value={payload.route || '-'}
                          helper="Dapat disesuaikan sesuai kebutuhan klinis."
                        />
                      </div>

                      <TableSection>
                        <PaperTableRow>
                          <PaperTableCell label="Obat" colSpan={2}>
                            <SearchableSelect
                              options={medicineOptions}
                              value={medicineId}
                              onValueChange={handleMedicineChange}
                              placeholder="Pilih obat"
                              searchPlaceholder="Cari obat"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                          <PaperTableCell label="Qty">
                            <NumberInput label="Qty" hideLabel value={payload.quantity} onChange={(value) => setPayload((prev) => ({ ...prev, quantity: value || 1 }))} disabled={false} min={1} />
                          </PaperTableCell>
                          <PaperTableCell label="Rute">
                            <SearchableSelect
                              options={PRESCRIPTION_ROUTE_OPTIONS}
                              value={payload.route}
                              onValueChange={(value) => setPayload((prev) => ({ ...prev, route: value }))}
                              placeholder="Rute"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                        </PaperTableRow>
                        <PaperTableRow>
                          <PaperTableCell label="Dosis">
                            <div className="space-y-1">
                              <Input value={payload.dosage} readOnly disabled className={PAPER_INPUT_CLASSNAME} placeholder="Mengikuti master obat" />
                              <p className="text-[11px] text-muted-foreground">
                                {selectedMedicine?.strength
                                  ? `Diambil dari master obat: ${selectedMedicine.strength}`
                                  : 'Pilih obat terlebih dahulu. Jika kosong, lengkapi kekuatan/dosis di master obat.'}
                              </p>
                            </div>
                          </PaperTableCell>
                          <PaperTableCell label="Frekuensi">
                            <SearchableSelect
                              options={PRESCRIPTION_FREQUENCY_OPTIONS}
                              value={payload.frequency}
                              onValueChange={(value) => setPayload((prev) => ({ ...prev, frequency: value }))}
                              placeholder="Pilih frekuensi"
                              searchPlaceholder="Cari frekuensi"
                              noneLabel="Kosongkan frekuensi"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                          <PaperTableCell label="Durasi">
                            <SearchableSelect
                              options={PRESCRIPTION_DURATION_OPTIONS}
                              value={payload.duration}
                              onValueChange={(value) => setPayload((prev) => ({ ...prev, duration: value }))}
                              placeholder="Pilih durasi"
                              searchPlaceholder="Cari durasi"
                              noneLabel="Kosongkan durasi"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                          <PaperTableCell label="Aturan Pakai">
                            <SearchableSelect
                              options={PRESCRIPTION_INSTRUCTION_OPTIONS}
                              value={payload.instructions}
                              onValueChange={(value) => setPayload((prev) => ({ ...prev, instructions: value }))}
                              placeholder="Pilih aturan pakai"
                              searchPlaceholder="Cari aturan pakai"
                              noneLabel="Kosongkan aturan pakai"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                        </PaperTableRow>
                        <PaperTableRow>
                          <PaperTableCell label="Catatan" colSpan={4}>
                            <TextEditor label="Catatan" hideLabel value={payload.notes} onChange={(value) => setPayload((prev) => ({ ...prev, notes: value }))} disabled={false} rows={2} />
                          </PaperTableCell>
                        </PaperTableRow>
                      </TableSection>
                    </div>
                  </TabsContent>

                  <TabsContent value="racikan" className="mt-5">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <ModalStatCard
                          label="Bentuk Racikan"
                          value={preparationLabel(compoundPayload.preparation_type)}
                          helper="Dipakai untuk menandai jenis hasil racikan."
                        />
                        <ModalStatCard
                          label="Output"
                          value={`${compoundPayload.output_quantity} ${compoundPayload.output_unit || 'hasil'}`}
                          helper="Jumlah hasil jadi untuk satu racikan."
                        />
                        <ModalStatCard
                          label="Bahan Aktif"
                          value={`${compoundPayload.items.length} bahan`}
                          helper="Jumlah item bahan yang sudah disusun di draft."
                        />
                      </div>

                      <TableSection>
                        <PaperTableRow>
                          <PaperTableCell label="Nama Racikan" colSpan={2}>
                            <Input value={compoundPayload.name} onChange={(event) => setCompoundPayload((prev) => ({ ...prev, name: event.target.value }))} className={PAPER_INPUT_CLASSNAME} placeholder="Contoh: Puyer demam" />
                          </PaperTableCell>
                          <PaperTableCell label="Jenis Racikan">
                            <SearchableSelect
                              options={PRESCRIPTION_COMPOUND_PREPARATION_OPTIONS}
                              value={compoundPayload.preparation_type}
                              onValueChange={(value) => setCompoundPayload((prev) => ({ ...prev, preparation_type: value }))}
                              placeholder="Pilih bentuk racikan"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                          <PaperTableCell label="Hasil Jadi">
                            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                              <NumberInput label="Jumlah" hideLabel value={compoundPayload.output_quantity} onChange={(value) => setCompoundPayload((prev) => ({ ...prev, output_quantity: value || 1 }))} disabled={false} min={1} />
                              <Input value={compoundPayload.output_unit} onChange={(event) => setCompoundPayload((prev) => ({ ...prev, output_unit: event.target.value }))} className={PAPER_INPUT_CLASSNAME} placeholder="bungkus" />
                            </div>
                          </PaperTableCell>
                        </PaperTableRow>
                        <PaperTableRow>
                          <PaperTableCell label="Dosis">
                            <Input value={compoundPayload.dosage} onChange={(event) => setCompoundPayload((prev) => ({ ...prev, dosage: event.target.value }))} className={PAPER_INPUT_CLASSNAME} placeholder="1 bungkus" />
                          </PaperTableCell>
                          <PaperTableCell label="Frekuensi">
                            <SearchableSelect
                              options={PRESCRIPTION_FREQUENCY_OPTIONS}
                              value={compoundPayload.frequency}
                              onValueChange={(value) => setCompoundPayload((prev) => ({ ...prev, frequency: value }))}
                              placeholder="Pilih frekuensi"
                              searchPlaceholder="Cari frekuensi"
                              noneLabel="Kosongkan frekuensi"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                          <PaperTableCell label="Durasi">
                            <SearchableSelect
                              options={PRESCRIPTION_DURATION_OPTIONS}
                              value={compoundPayload.duration}
                              onValueChange={(value) => setCompoundPayload((prev) => ({ ...prev, duration: value }))}
                              placeholder="Pilih durasi"
                              searchPlaceholder="Cari durasi"
                              noneLabel="Kosongkan durasi"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                          <PaperTableCell label="Rute">
                            <SearchableSelect
                              options={PRESCRIPTION_ROUTE_OPTIONS}
                              value={compoundPayload.route}
                              onValueChange={(value) => setCompoundPayload((prev) => ({ ...prev, route: value }))}
                              placeholder="Rute"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                        </PaperTableRow>
                        <PaperTableRow>
                          <PaperTableCell label="Aturan Pakai" colSpan={2}>
                            <SearchableSelect
                              options={PRESCRIPTION_INSTRUCTION_OPTIONS}
                              value={compoundPayload.instructions}
                              onValueChange={(value) => setCompoundPayload((prev) => ({ ...prev, instructions: value }))}
                              placeholder="Pilih aturan pakai"
                              searchPlaceholder="Cari aturan pakai"
                              noneLabel="Kosongkan aturan pakai"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                          <PaperTableCell label="Catatan" colSpan={2}>
                            <TextEditor label="Catatan" hideLabel value={compoundPayload.notes} onChange={(value) => setCompoundPayload((prev) => ({ ...prev, notes: value }))} disabled={false} rows={2} />
                          </PaperTableCell>
                        </PaperTableRow>
                        <PaperTableRow>
                          <PaperTableCell label="Bahan Obat" colSpan={2}>
                            <SearchableSelect
                              options={medicineOptions}
                              value={ingredientDraft.medicineId}
                              onValueChange={(value) => setIngredientDraft((prev) => ({ ...prev, medicineId: value }))}
                              placeholder="Pilih bahan racikan"
                              searchPlaceholder="Cari obat"
                              square
                              className={PAPER_SELECT_TRIGGER_CLASSNAME}
                            />
                          </PaperTableCell>
                          <PaperTableCell label="Jumlah Bahan">
                            <NumberInput label="Jumlah Bahan" hideLabel value={ingredientDraft.quantity} onChange={(value) => setIngredientDraft((prev) => ({ ...prev, quantity: value || 1 }))} disabled={false} min={1} />
                          </PaperTableCell>
                          <PaperTableCell label="Catatan Bahan">
                            <div className="space-y-2">
                              <Input value={ingredientDraft.notes} onChange={(event) => setIngredientDraft((prev) => ({ ...prev, notes: event.target.value }))} className={PAPER_INPUT_CLASSNAME} placeholder="Opsional" />
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-none"
                                disabled={!ingredientDraft.medicineId}
                                onClick={() => {
                                  if (!ingredientDraft.medicineId) return;
                                  setCompoundPayload((prev) => ({
                                    ...prev,
                                    items: [
                                      ...prev.items,
                                      {
                                        medicine_id: Number(ingredientDraft.medicineId),
                                        quantity: ingredientDraft.quantity || 1,
                                        notes: ingredientDraft.notes,
                                      },
                                    ],
                                  }));
                                  setIngredientDraft({ medicineId: '', quantity: 1, notes: '' });
                                }}
                              >
                                Tambah Bahan
                              </Button>
                            </div>
                          </PaperTableCell>
                        </PaperTableRow>
                        <PaperTableRow>
                          <PaperTableCell label="Komposisi Racikan" colSpan={4}>
                            {compoundPayload.items.length === 0 ? (
                              <div className="border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">Belum ada bahan racikan. Tambahkan bahan untuk membangun formula.</div>
                            ) : (
                              <div className="space-y-1.5">
                                {compoundPayload.items.map((item, index) => (
                                  <div key={`${item.medicine_id}-${index}`} className="flex items-center justify-between gap-3 border border-border/70 bg-muted/10 px-2.5 py-2 text-sm">
                                    <p className="min-w-0 text-sm text-foreground/90">
                                      {index + 1}. {item.quantity} {medicines.find((medicine) => medicine.id === item.medicine_id)?.unit?.name || ''} {ingredientLabel(item.medicine_id)}{item.notes ? ` (${item.notes})` : ''}
                                    </p>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="rounded-none text-destructive"
                                      onClick={() => setCompoundPayload((prev) => ({
                                        ...prev,
                                        items: prev.items.filter((_, itemIndex) => itemIndex !== index),
                                      }))}
                                    >
                                      Hapus
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </PaperTableCell>
                        </PaperTableRow>
                      </TableSection>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
              <p className="mr-auto text-xs leading-5 text-muted-foreground">
                {composerMode === 'non-racikan'
                  ? 'Periksa obat, jumlah, dan aturan pakai sebelum menyimpan item ke resep.'
                  : 'Pastikan formula racikan dan komposisi bahan sudah lengkap sebelum ditambahkan.'}
              </p>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => setAddModalOpen(false)}>
                Batal
              </Button>
              {composerMode === 'non-racikan' ? (
                <Button type="button" className="gap-1.5 rounded-none" disabled={!medicineId} onClick={handleAddPrescription}>
                  <FilePlus2 className="h-4 w-4" /> Tambah Obat
                </Button>
              ) : (
                <Button type="button" className="gap-1.5 rounded-none" disabled={!compoundPayload.name.trim() || compoundPayload.items.length === 0} onClick={submitCompound}>
                  <FlaskConical className="h-4 w-4" /> Tambah Racikan
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={Boolean(detailItem)} onOpenChange={(open) => {
        if (!open) setDetailItem(null);
      }}>
        <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
          <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(15,23,42,0.01),transparent)] px-6 py-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center border border-border/70 bg-background">
                    {detailItem?.kind === 'non-racikan' ? <FilePlus2 className="h-5 w-5" /> : <FlaskConical className="h-5 w-5" />}
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-semibold tracking-tight">
                      {detailItem?.kind === 'non-racikan' ? 'Detail Obat Non-Racikan' : 'Detail Obat Racikan'}
                    </DialogTitle>
                    <DialogDescription className="max-w-2xl text-xs">
                      {detailItem?.kind === 'non-racikan'
                        ? 'Menampilkan detail obat jadi yang dipilih pada resep, termasuk informasi master obat dan regimen pemberian.'
                        : 'Menampilkan formula racikan, aturan pakai, dan komposisi bahan yang digunakan untuk resep ini.'}
                    </DialogDescription>
                  </div>
                </div>
              </div>

              {detailItem ? (
                <div className="flex flex-wrap items-center gap-2 pl-14">
                  <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                    {detailItem.kind === 'non-racikan' ? 'Non-Racikan' : 'Racikan'}
                  </Badge>
                  <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                    {detailItem.item.status || '-'}
                  </Badge>
                  <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                    {formatCurrency(detailItem.kind === 'non-racikan' ? buildPrescriptionPrice(detailItem.item) : buildCompoundPrice(detailItem.item))}
                  </Badge>
                  <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                    {detailItem.kind === 'non-racikan'
                      ? `${detailItem.item.quantity} ${detailItem.item.medicine?.unit?.name || 'item'}`
                      : `${detailItem.item.output_quantity} ${detailItem.item.output_unit || 'hasil'}`}
                  </Badge>
                </div>
              ) : null}
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 lg:px-6 lg:py-6">
            {detailItem?.kind === 'non-racikan' ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <ModalStatCard
                    label="Nama Obat"
                    value={detailItem.item.medicine?.name || '-'}
                    helper={detailItem.item.medicine?.generic_name || 'Nama generik belum tersedia'}
                  />
                  <ModalStatCard
                    label="Kekuatan"
                    value={detailItem.item.medicine?.strength || '-'}
                    helper={detailItem.item.medicine?.form || 'Bentuk obat belum diisi'}
                  />
                  <ModalStatCard
                    label="Stok Saat Ini"
                    value={detailItem.item.medicine?.current_stock ?? 0}
                    helper={detailItem.item.medicine?.unit?.name || 'satuan master obat'}
                  />
                  <ModalStatCard
                    label="Harga Satuan"
                    value={formatCurrency(detailItem.item.medicine?.selling_price || 0)}
                    helper={detailItem.item.medicine?.manufacturer || 'Pabrikan belum diisi'}
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
                    <PaperTableCell label="Harga">
                      <div className="text-sm font-medium">{formatCurrency(buildPrescriptionPrice(detailItem.item))}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                  <PaperTableRow>
                    <PaperTableCell label="Dosis">
                      <div className="text-sm">{detailItem.item.dosage || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Frekuensi">
                      <div className="text-sm">{detailItem.item.frequency || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Durasi">
                      <div className="text-sm">{detailItem.item.duration || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Rute">
                      <div className="text-sm">{detailItem.item.route || '-'}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                  <PaperTableRow>
                    <PaperTableCell label="Instruksi" colSpan={2}>
                      <div className="text-sm whitespace-pre-wrap">{detailItem.item.instructions || '-'}</div>
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
                <div className="grid gap-3 md:grid-cols-4">
                  <ModalStatCard
                    label="Nama Racikan"
                    value={detailItem.item.name || '-'}
                    helper={preparationLabel(detailItem.item.preparation_type)}
                  />
                  <ModalStatCard
                    label="Output"
                    value={`${detailItem.item.output_quantity} ${detailItem.item.output_unit || 'hasil'}`}
                    helper={detailItem.item.route || 'Rute belum diisi'}
                  />
                  <ModalStatCard
                    label="Bahan"
                    value={`${detailItem.item.items?.length || 0} item`}
                    helper="Jumlah bahan dalam formula racikan ini."
                  />
                  <ModalStatCard
                    label="Nilai Racikan"
                    value={formatCurrency(buildCompoundPrice(detailItem.item))}
                    helper="Akumulasi harga dari seluruh bahan racikan."
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
                    <PaperTableCell label="Harga">
                      <div className="text-sm font-medium">{formatCurrency(buildCompoundPrice(detailItem.item))}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                  <PaperTableRow>
                    <PaperTableCell label="Hasil Jadi">
                      <div className="text-sm">{detailItem.item.output_quantity} {detailItem.item.output_unit || 'hasil'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Dosis">
                      <div className="text-sm">{detailItem.item.dosage || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Frekuensi">
                      <div className="text-sm">{detailItem.item.frequency || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Durasi">
                      <div className="text-sm">{detailItem.item.duration || '-'}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                  <PaperTableRow>
                    <PaperTableCell label="Instruksi" colSpan={2}>
                      <div className="text-sm whitespace-pre-wrap">{detailItem.item.instructions || '-'}</div>
                    </PaperTableCell>
                    <PaperTableCell label="Catatan" colSpan={2}>
                      <div className="text-sm whitespace-pre-wrap">{detailItem.item.notes || '-'}</div>
                    </PaperTableCell>
                  </PaperTableRow>
                </TableSection>

                <section className="space-y-1.5">
                  <div className="px-0.5">
                    <h3 className="text-[13px] font-semibold tracking-tight">Bahan Obat Racikan</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Komposisi bahan yang digunakan untuk satu batch racikan.</p>
                  </div>
                  <div className="overflow-x-auto border border-border/70">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead className="bg-muted/25">
                        <tr className="border-b border-border/70 text-left">
                          <th className="px-3 py-2.5 font-semibold text-foreground/90">Bahan</th>
                          <th className="w-[120px] px-3 py-2.5 text-right font-semibold text-foreground/90">Jumlah</th>
                          <th className="w-[140px] px-3 py-2.5 text-right font-semibold text-foreground/90">Harga</th>
                          <th className="px-3 py-2.5 font-semibold text-foreground/90">Catatan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detailItem.item.items || []).map((ingredient) => (
                          <tr key={ingredient.id} className="border-b border-border/60 align-top last:border-b-0">
                            <td className="px-3 py-2.5">
                              <div className="space-y-0.5">
                                <p className="font-medium">{ingredient.medicine?.name || '-'}</p>
                                <p className="text-xs text-muted-foreground">{[ingredient.medicine?.strength, ingredient.medicine?.form].filter(Boolean).join(' · ') || '-'}</p>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right">{ingredient.quantity} {ingredient.medicine?.unit?.name || 'item'}</td>
                            <td className="px-3 py-2.5 text-right">{formatCurrency((ingredient.medicine?.selling_price || 0) * ingredient.quantity)}</td>
                            <td className="px-3 py-2.5">{ingredient.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
            <Button type="button" variant="outline" className="rounded-none" onClick={() => setDetailItem(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
