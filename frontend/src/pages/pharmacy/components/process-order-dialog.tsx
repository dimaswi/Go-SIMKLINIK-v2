import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import type { MedicalRecord, Medicine } from '@/lib/api';
import {
  PRESCRIPTION_DURATION_OPTIONS,
  PRESCRIPTION_FREQUENCY_OPTIONS,
  PRESCRIPTION_INSTRUCTION_OPTIONS,
  PRESCRIPTION_ROUTE_OPTIONS,
  getPrescriptionWorkflowLabel,
} from '@/pages/emr/constants';
import {
  WORKFLOW_BADGE_CLASSNAME,
  buildCompoundPrice,
  buildOrderLines,
  formatCurrency,
  formatDateTime,
  getCompoundIngredientStockStatus,
  getCompoundStockStatus,
  isPharmacyProcessAddedPrescription,
  getPrescriptionStockStatus,
  getRecordStockIssueCount,
} from '../utils';
import {
  CalendarClock,
  Loader2,
  PackageCheck,
  PillBottle,
  Plus,
  RotateCcw,
  ShieldAlert,
  Stethoscope,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

type AddPrescriptionPayload = {
  medicine_id: number;
  quantity: number;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  notes: string;
};

type ProcessOrderDialogProps = {
  order: MedicalRecord | null;
  medicines: Medicine[];
  loadingMedicines: boolean;
  open: boolean;
  canManage: boolean;
  addingMedicine: boolean;
  deletingPrescriptionId: number | null;
  returningOrder: boolean;
  markingReady: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPrescription: (payload: AddPrescriptionPayload) => Promise<void>;
  onDeletePrescription: (prescriptionId: number) => Promise<void>;
  onReturnToOrder: () => Promise<void>;
  onMarkReady: () => Promise<void>;
};

const INITIAL_PAYLOAD = {
  quantity: 1,
  dosage: '',
  frequency: '',
  duration: '',
  route: 'oral',
  instructions: '',
  notes: '',
};

function PanelField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="space-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {helper ? <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-border/70 bg-muted/10">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <div className="text-sm font-medium text-foreground/95">{value}</div>
        {helper ? <div className="text-[11px] leading-4 text-muted-foreground">{helper}</div> : null}
      </div>
    </div>
  );
}

// function InlineMetric({
//   label,
//   value,
//   valueClassName,
// }: {
//   label: string;
//   value: React.ReactNode;
//   valueClassName?: string;
// }) {
//   return (
//     <div className="flex min-w-[140px] items-baseline gap-2">
//       <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
//       <span className={valueClassName || 'text-sm font-semibold text-foreground/95'}>{value}</span>
//     </div>
//   );
// }

export function ProcessOrderDialog({
  order,
  medicines,
  loadingMedicines,
  open,
  canManage,
  addingMedicine,
  deletingPrescriptionId,
  returningOrder,
  markingReady,
  onOpenChange,
  onAddPrescription,
  onDeletePrescription,
  onReturnToOrder,
  onMarkReady,
}: ProcessOrderDialogProps) {
  const [addMedicineModalOpen, setAddMedicineModalOpen] = useState(false);
  const [pendingDeletePrescriptionId, setPendingDeletePrescriptionId] = useState<number | null>(null);
  const [confirmReturnOpen, setConfirmReturnOpen] = useState(false);
  const [medicineId, setMedicineId] = useState('');
  const [payload, setPayload] = useState(INITIAL_PAYLOAD);

  useEffect(() => {
    if (!open) {
      setAddMedicineModalOpen(false);
      setPendingDeletePrescriptionId(null);
      setConfirmReturnOpen(false);
      setMedicineId('');
      setPayload(INITIAL_PAYLOAD);
    }
  }, [open]);

  const selectedMedicine = useMemo(
    () => medicines.find((item) => String(item.id) === medicineId) || null,
    [medicineId, medicines],
  );

  const selectedLineTotal = useMemo(
    () => (selectedMedicine?.selling_price || 0) * payload.quantity,
    [payload.quantity, selectedMedicine],
  );
  const pendingDeletePrescription = useMemo(
    () => (order?.prescriptions || []).find((item) => item.id === pendingDeletePrescriptionId) || null,
    [order, pendingDeletePrescriptionId],
  );

  const medicineOptions = useMemo(
    () => medicines.map((medicine) => ({
      value: String(medicine.id),
      label: `${medicine.name}${medicine.strength ? ` ${medicine.strength}` : ''} · stok ${medicine.current_stock}`,
    })),
    [medicines],
  );

  const stockIssueCount = useMemo(() => (order ? getRecordStockIssueCount(order) : 0), [order]);
//   const totalPrice = useMemo(() => (order ? getRecordTotalPrice(order) : 0), [order]);
  const totalItems = useMemo(() => (order ? buildOrderLines(order).length : 0), [order]);
  const selectedMedicineStockSafe = Boolean(selectedMedicine && (selectedMedicine.current_stock || 0) >= payload.quantity);
  const selectedMedicineStockBadgeClassName = !selectedMedicine
    ? 'border-slate-300 bg-slate-50 text-slate-700'
    : selectedMedicineStockSafe
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
      : 'border-rose-300 bg-rose-50 text-rose-700';
  const workflowStatus = order?.prescription_workflow_status || 'draft';
  const workflowBadgeClassName = WORKFLOW_BADGE_CLASSNAME[workflowStatus] || WORKFLOW_BADGE_CLASSNAME.draft;
  const canSubmitAdd = Boolean(canManage && medicineId && payload.quantity > 0 && !addingMedicine);
  const canMarkReady = Boolean(
    canManage
      && order
      && order.prescription_workflow_status === 'preparing'
      && totalItems > 0
      && stockIssueCount === 0
      && !markingReady,
  );
  const canReturnToOrder = Boolean(
    canManage
      && order
      && order.prescription_workflow_status === 'preparing'
      && !returningOrder,
  );

  const handleMedicineChange = (value: string) => {
    setMedicineId(value);
    const selected = medicines.find((item) => String(item.id) === value) || null;
    setPayload((prev) => ({
      ...prev,
      dosage: selected?.strength || '',
    }));
  };

  const handleAdd = async () => {
    if (!medicineId) return;

    await onAddPrescription({
      medicine_id: Number(medicineId),
      quantity: payload.quantity,
      dosage: payload.dosage,
      frequency: payload.frequency,
      duration: payload.duration,
      route: payload.route,
      instructions: payload.instructions,
      notes: payload.notes,
    });

    setAddMedicineModalOpen(false);
    setMedicineId('');
    setPayload(INITIAL_PAYLOAD);
  };

  const handleConfirmDeletePrescription = async () => {
    if (pendingDeletePrescriptionId === null) {
      return;
    }

    const targetId = pendingDeletePrescriptionId;
    setPendingDeletePrescriptionId(null);
    await onDeletePrescription(targetId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-1rem)] w-[calc(100vw-1.5rem)] max-w-7xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
        {order ? (
          <>
            <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(15,23,42,0.01),transparent)] px-6 py-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center border border-border/70 bg-background">
                      <PillBottle className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-semibold tracking-tight">Proses Resep Farmasi</DialogTitle>
                      <DialogDescription className="max-w-2xl text-xs">
                        Farmasi dapat memverifikasi stok, menambah obat non-racikan bila diperlukan, lalu menandai order siap diserahkan ke pasien.
                      </DialogDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-14">
                    <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${workflowBadgeClassName}`}>
                      {getPrescriptionWorkflowLabel(workflowStatus)}
                    </Badge>
                    <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                      {totalItems} item aktif
                    </Badge>
                    <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${stockIssueCount === 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-rose-300 bg-rose-50 text-rose-700'}`}>
                      {stockIssueCount === 0 ? 'Stok aman' : `${stockIssueCount} isu stok`}
                    </Badge>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col xl:grid xl:grid-cols-[280px_minmax(0,1fr)] xl:items-stretch">
              <aside className="shrink-0 border-b border-border/70 bg-muted/20 xl:h-full xl:border-b-0 xl:border-r">
                  <div className="space-y-3 px-4 py-4 xl:px-5 xl:py-5">
                    <section className="overflow-hidden border border-border/70 bg-background">
                      <div className="border-b border-border/70 px-4 py-3">
                        <h3 className="text-[13px] font-semibold tracking-tight">Informasi Order</h3>
                        <p className="text-[11px] leading-4 text-muted-foreground">Pasien, dokter, dan waktu order sebagai acuan proses farmasi.</p>
                      </div>
                      <div className="divide-y divide-border/70">
                        <SummaryRow icon={UserRound} label="Pasien" value={order.patient?.full_name || '-'} helper={order.patient?.medical_record_number || 'No. RM belum tersedia'} />
                        <SummaryRow icon={Stethoscope} label="Dokter / Poli" value={order.doctor?.full_name || '-'} helper={order.polyclinic?.name || 'Poli belum tersedia'} />
                        <SummaryRow icon={CalendarClock} label="Waktu Order" value={formatDateTime(order.prescription_ordered_at || order.record_date)} helper={order.visit?.visit_number || 'Nomor kunjungan belum tersedia'} />
                        {order.notes?.trim() ? (
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Catatan Resep</p>
                            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-foreground/90">{order.notes.trim()}</p>
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {stockIssueCount > 0 && (
                      <Alert className="rounded-none border-amber-300 bg-amber-50/70 text-amber-900">
                        <ShieldAlert className="h-4 w-4" />
                        <AlertDescription>
                          Ada item yang stoknya belum mencukupi. Lengkapi atau ubah item resep sebelum menandai resep siap diserahkan.
                        </AlertDescription>
                      </Alert>
                    )}

                    <section className="border border-border/70 bg-background">
                      <div className="border-b border-border/70 px-4 py-3">
                        <h3 className="text-[13px] font-semibold tracking-tight">Tambah Obat Non-Racikan</h3>
                        <p className="text-[11px] leading-4 text-muted-foreground">Form penambahan obat dipisah ke modal khusus supaya area proses resep tetap fokus untuk review order.</p>
                      </div>
                      <div className="space-y-3 p-4">
                        <Button
                          type="button"
                          className="w-full rounded-none"
                          disabled={!canManage || loadingMedicines}
                          onClick={() => setAddMedicineModalOpen(true)}
                        >
                          {loadingMedicines ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                          {loadingMedicines ? 'Memuat Master Obat...' : 'Tambah Obat'}
                        </Button>

                        <p className="text-[11px] leading-4 text-muted-foreground">
                          {loadingMedicines
                            ? 'Master obat sedang dimuat sebelum form dapat digunakan.'
                            : `${medicines.length} obat tersedia untuk dipilih dan ditambahkan ke resep ini.`}
                        </p>
                      </div>
                    </section>
                  </div>
              </aside>

              <section className="min-h-0 min-w-0 bg-background">
                <ScrollArea className="h-full">
                  <div className="space-y-4 px-4 py-4 xl:px-5 xl:py-5">

                    <section className="space-y-3">
                      <div className="space-y-1">
                        <h4 className="text-[13px] font-semibold tracking-tight">Item Non-Racikan</h4>
                        <p className="text-xs text-muted-foreground">Obat standar yang bisa ditambah atau dihapus selama order masih pada tahap proses.</p>
                      </div>

                      {(order.prescriptions || []).length === 0 ? (
                        <div className="border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                          Belum ada item non-racikan pada resep ini.
                        </div>
                      ) : (
                        <div className="overflow-hidden border border-border/70 bg-background">
                          <div className="divide-y divide-border/70">
                            {(order.prescriptions || []).map((item) => {
                              const stockStatus = getPrescriptionStockStatus(item);
                              const isManualItem = isPharmacyProcessAddedPrescription(order, item);
                              const detailParts = [
                                item.instructions?.trim(),
                                item.notes?.trim() ? `Catatan: ${item.notes.trim()}` : null,
                              ].filter(Boolean);

                              return (
                                <div key={`prescription-${item.id}`} className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                                  <div className="min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-[13px] font-semibold leading-4 text-foreground/95">{item.medicine?.name || '-'}</p>
                                      <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.14em]">Non-Racikan</Badge>
                                      {isManualItem ? <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Tambahan Farmasi</Badge> : null}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
                                      <span>{item.quantity} {item.medicine?.unit?.name || 'item'}</span>
                                      {item.dosage ? <span aria-hidden="true">•</span> : null}
                                      {item.dosage ? <span>{item.dosage}</span> : null}
                                    </div>
                                    <div className="space-y-0.5 text-[11px] leading-4">
                                      <p>
                                        <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Aturan</span>{' '}
                                        <span className="text-foreground/90">{[item.frequency, item.duration, item.route].filter(Boolean).join(' · ') || 'Aturan belum lengkap'}</span>
                                      </p>
                                      {detailParts.length > 0 ? <p className="text-muted-foreground">{detailParts.join(' • ')}</p> : null}
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-2 lg:items-end">
                                    <div className="space-y-1 lg:text-right">
                                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                        <Badge variant="outline" className={`rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.14em] ${stockStatus.badgeClassName}`}>{stockStatus.label}</Badge>
                                        <p className="text-[11px] leading-4 text-muted-foreground">{stockStatus.helper}</p>
                                      </div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Subtotal</p>
                                      <p className="text-sm font-semibold text-foreground/95">{formatCurrency((item.medicine?.selling_price || 0) * item.quantity)}</p>
                                    </div>

                                    {canManage && isManualItem ? (
                                      <Button type="button" variant="outline" size="sm" className="h-7 rounded-none px-2 text-destructive" onClick={() => setPendingDeletePrescriptionId(item.id)} disabled={deletingPrescriptionId === item.id}>
                                        {deletingPrescriptionId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                                        Hapus
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="space-y-3">
                      <div className="space-y-1">
                        <h4 className="text-[13px] font-semibold tracking-tight">Item Racikan</h4>
                        <p className="text-xs text-muted-foreground">Rincian racikan beserta bahan penyusunnya ditampilkan untuk membantu verifikasi kesiapan stok.</p>
                      </div>

                      {(order.prescription_compounds || []).length === 0 ? (
                        <div className="border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                          Tidak ada item racikan pada resep ini.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {(order.prescription_compounds || []).map((compound) => {
                            const stockStatus = getCompoundStockStatus(compound);
                            const compoundDetailParts = [
                              compound.instructions?.trim(),
                              compound.notes?.trim() ? `Catatan: ${compound.notes.trim()}` : null,
                            ].filter(Boolean);

                            return (
                              <div key={`compound-${compound.id}`} className="overflow-hidden border border-border/70 bg-background">
                                <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-[13px] font-semibold leading-4 text-foreground/95">{compound.name || '-'}</p>
                                      <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.14em]">Racikan</Badge>
                                      <Badge variant="outline" className={`rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.14em] ${stockStatus.badgeClassName}`}>{stockStatus.label}</Badge>
                                    </div>

                                    <p className="text-[11px] leading-4">
                                      <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Aturan</span>{' '}
                                      <span className="text-foreground/90">{[compound.dosage, compound.frequency, compound.duration, compound.route].filter(Boolean).join(' · ') || 'Aturan belum lengkap'}</span>
                                    </p>

                                    {compoundDetailParts.length > 0 ? <p className="text-[11px] leading-4 text-muted-foreground">{compoundDetailParts.join(' • ')}</p> : null}
                                  </div>

                                  <div className="w-full border border-border/70 bg-muted/10 px-4 py-3 lg:w-[280px]">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ringkasan Racikan</p>
                                    <div className="mt-2 space-y-1 text-[11px] leading-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <span className="font-medium text-muted-foreground">Nama Racikan</span>
                                        <span className="text-right text-foreground/90">{compound.name || '-'}</span>
                                      </div>
                                      <div className="flex items-start justify-between gap-3">
                                        <span className="font-medium text-muted-foreground">Hasil Jadi</span>
                                        <span className="text-right text-foreground/90">{compound.output_quantity} {compound.output_unit || 'hasil'}</span>
                                      </div>
                                      <div className="flex items-start justify-between gap-3">
                                        <span className="font-medium text-muted-foreground">Jumlah Bahan</span>
                                        <span className="text-right text-foreground/90">{(compound.items || []).length} bahan</span>
                                      </div>
                                      <div className="flex items-start justify-between gap-3 pt-1">
                                        <span className="font-medium text-muted-foreground">Subtotal</span>
                                        <span className="text-right font-semibold text-foreground/95">{formatCurrency(buildCompoundPrice(compound))}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {(compound.items || []).length > 0 ? (
                                  <div className="overflow-x-auto border-t border-border/70">
                                    <table className="w-full min-w-[560px] border-collapse text-sm">
                                      <thead className="bg-muted/20">
                                        <tr className="border-b border-border/70 text-left">
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Bahan</th>
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Dosis / Bahan</th>
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Stok</th>
                                          <th className="px-3 py-2 text-right font-semibold text-foreground/90">Nilai</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(compound.items || []).map((ingredient) => {
                                          const ingredientStock = getCompoundIngredientStockStatus(ingredient);
                                          const doseMatch = ingredient.notes?.match(/Dosis:\s*([^·]+)/i)?.[1]?.trim();
                                          const extraNote = ingredient.notes?.replace(/Dosis:\s*[^·]+(·\s*)?/i, '').trim();

                                          return (
                                            <tr key={`compound-${compound.id}-ingredient-${ingredient.id}`} className="border-b border-border/50 align-top last:border-b-0">
                                              <td className="px-3 py-2 text-sm text-foreground/95">
                                                <div className="space-y-0.5">
                                                  <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="font-medium">{ingredient.medicine?.name || '-'} {ingredient.medicine?.strength || ''}</span>
                                                    {doseMatch ? (
                                                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 rounded-none bg-primary/10 text-primary border-primary/25">
                                                        Dosis: {doseMatch}
                                                      </Badge>
                                                    ) : null}
                                                  </div>
                                                  {extraNote ? (
                                                    <p className="text-[11px] text-muted-foreground">{extraNote}</p>
                                                  ) : null}
                                                </div>
                                              </td>
                                              <td className="px-3 py-2">
                                                <Badge variant="outline" className={`rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.14em] ${ingredientStock.badgeClassName}`}>{ingredientStock.label}</Badge>
                                              </td>
                                              <td className="px-3 py-2 text-right text-sm font-medium text-foreground/95">{formatCurrency((ingredient.medicine?.selling_price || 0) * ingredient.quantity)}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>
                </ScrollArea>
              </section>
            </div>

            <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-3">
              <p className="mr-auto text-xs leading-5 text-muted-foreground">Saat resep sudah lengkap dan stok aman, tandai resep siap diserahkan agar muncul di halaman serahkan resep.</p>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              {canManage && (
                <Button type="button" variant="outline" className="rounded-none" disabled={!canReturnToOrder} onClick={() => setConfirmReturnOpen(true)}>
                  {returningOrder ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                  {returningOrder ? 'Mengembalikan...' : 'Kembalikan ke Order'}
                </Button>
              )}
              {canManage && (
                <Button type="button" className="rounded-none" disabled={!canMarkReady} onClick={() => void onMarkReady()}>
                  {markingReady ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
                  {markingReady ? 'Menyimpan...' : 'Tandai Siap Diserahkan'}
                </Button>
              )}
            </DialogFooter>

            <Dialog
              open={addMedicineModalOpen}
              onOpenChange={(nextOpen) => {
                if (!nextOpen && !addingMedicine) {
                  setMedicineId('');
                  setPayload(INITIAL_PAYLOAD);
                }
                setAddMedicineModalOpen(nextOpen);
              }}
            >
              <DialogContent className="flex h-[calc(100vh-1.5rem)] max-h-[760px] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
                <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(15,23,42,0.01),transparent)] px-5 py-3.5 lg:px-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center border border-border/70 bg-background">
                        <Plus className="h-5 w-5" />
                      </div>
                      <div>
                        <DialogTitle className="text-lg font-semibold tracking-tight">Tambah Obat Non-Racikan</DialogTitle>
                        <DialogDescription className="mt-1 max-w-2xl text-sm leading-5">
                          Pilih obat dari master, lengkapi regimen, lalu tambahkan ke resep aktif tanpa mengganggu fokus verifikasi order utama.
                        </DialogDescription>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pl-14">
                      <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${selectedMedicineStockBadgeClassName}`}>
                        {!selectedMedicine ? 'Belum pilih obat' : `${selectedMedicine.current_stock} tersedia`}
                      </Badge>
                      <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                        {formatCurrency(selectedLineTotal)}
                      </Badge>
                    </div>
                  </div>
                </DialogHeader>

                <ScrollArea className="flex-1 min-h-0">
                  <div className="px-4 py-4 lg:px-5 lg:py-5">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                      <section className="space-y-4 border border-border/70 bg-background p-4">
                        <div className="space-y-1">
                          <h3 className="text-[13px] font-semibold tracking-tight">Input Obat & Regimen</h3>
                          <p className="text-[11px] leading-4 text-muted-foreground">Pilih obat lalu isi jumlah, dosis, rute, dan aturan pakai dalam satu alur yang ringkas.</p>
                        </div>

                        <PanelField label="Obat" helper={loadingMedicines ? 'Master obat sedang dimuat' : 'Ketik nama obat untuk mencari lebih cepat'}>
                          <SearchableSelect
                            options={medicineOptions}
                            value={medicineId}
                            onValueChange={handleMedicineChange}
                            placeholder={loadingMedicines ? 'Memuat master obat...' : 'Pilih obat'}
                            searchPlaceholder="Cari obat"
                            square
                            disabled={!canManage || loadingMedicines}
                          />
                        </PanelField>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <PanelField label="Jumlah">
                            <Input
                              type="number"
                              min={1}
                              value={payload.quantity}
                              onChange={(event) => setPayload((prev) => ({ ...prev, quantity: Number(event.target.value) || 1 }))}
                              className="rounded-none"
                              placeholder="Qty"
                              disabled={!canManage}
                            />
                          </PanelField>
                          <PanelField label="Dosis / Kekuatan">
                            <Input
                              value={payload.dosage}
                              onChange={(event) => setPayload((prev) => ({ ...prev, dosage: event.target.value }))}
                              className="rounded-none"
                              placeholder="Dosis / kekuatan"
                              disabled={!canManage}
                            />
                          </PanelField>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <PanelField label="Rute Pemberian">
                            <SearchableSelect
                              options={PRESCRIPTION_ROUTE_OPTIONS}
                              value={payload.route}
                              onValueChange={(value) => setPayload((prev) => ({ ...prev, route: value }))}
                              placeholder="Rute"
                              square
                              disabled={!canManage}
                            />
                          </PanelField>
                          <PanelField label="Frekuensi">
                            <SearchableSelect
                              options={PRESCRIPTION_FREQUENCY_OPTIONS}
                              value={payload.frequency}
                              onValueChange={(value) => setPayload((prev) => ({ ...prev, frequency: value }))}
                              placeholder="Frekuensi"
                              searchPlaceholder="Cari frekuensi"
                              noneLabel="Kosongkan frekuensi"
                              square
                              disabled={!canManage}
                            />
                          </PanelField>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <PanelField label="Durasi">
                            <SearchableSelect
                              options={PRESCRIPTION_DURATION_OPTIONS}
                              value={payload.duration}
                              onValueChange={(value) => setPayload((prev) => ({ ...prev, duration: value }))}
                              placeholder="Durasi"
                              searchPlaceholder="Cari durasi"
                              noneLabel="Kosongkan durasi"
                              square
                              disabled={!canManage}
                            />
                          </PanelField>
                          <PanelField label="Instruksi Pemakaian">
                            <SearchableSelect
                              options={PRESCRIPTION_INSTRUCTION_OPTIONS}
                              value={payload.instructions}
                              onValueChange={(value) => setPayload((prev) => ({ ...prev, instructions: value }))}
                              placeholder="Aturan pakai"
                              searchPlaceholder="Cari aturan pakai"
                              noneLabel="Kosongkan aturan pakai"
                              square
                              disabled={!canManage}
                            />
                          </PanelField>
                        </div>

                        <PanelField label="Catatan Farmasi" helper="Opsional. Gunakan jika ada arahan tambahan untuk proses resep ini.">
                          <Textarea
                            value={payload.notes}
                            onChange={(event) => setPayload((prev) => ({ ...prev, notes: event.target.value }))}
                            className="min-h-[72px] rounded-none"
                            placeholder="Catatan tambahan farmasi"
                            disabled={!canManage}
                          />
                        </PanelField>
                      </section>

                      <aside className="space-y-4">
                        <section className="border border-border/70 bg-muted/10 p-4">
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ringkasan Obat</p>
                            <p className="text-sm font-medium text-foreground/95">{selectedMedicine?.name || 'Belum ada obat dipilih'}</p>
                            <p className="text-[11px] leading-4 text-muted-foreground">{selectedMedicine?.generic_name || selectedMedicine?.strength || 'Pilih obat untuk melihat ringkasan stok dan harga.'}</p>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${selectedMedicineStockBadgeClassName}`}>
                              {!selectedMedicine ? 'Pilih obat' : `${selectedMedicine.current_stock} tersedia`}
                            </Badge>
                            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                              {formatCurrency(selectedLineTotal)}
                            </Badge>
                          </div>

                          <div className="mt-4 space-y-2 text-[11px] leading-4">
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-medium text-muted-foreground">Harga Satuan</span>
                              <span className="text-right text-foreground/90">{formatCurrency(selectedMedicine?.selling_price || 0)}</span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-medium text-muted-foreground">Subtotal</span>
                              <span className="text-right font-semibold text-foreground/95">{formatCurrency(selectedLineTotal)}</span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-medium text-muted-foreground">Ketersediaan</span>
                              <span className="text-right text-foreground/90">{selectedMedicine ? `${selectedMedicine.current_stock} unit` : '-'}</span>
                            </div>
                          </div>
                        </section>

                        <section className="border border-dashed border-border/70 bg-background p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Catatan UX</p>
                          <p className="mt-1 text-[11px] leading-5 text-foreground/90">Modal ini sengaja dipadatkan agar seluruh field utama tetap terlihat tanpa ketabrak footer pada tinggi layar laptop standar.</p>
                        </section>
                      </aside>
                    </div>
                  </div>
                </ScrollArea>

                <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
                  <p className="mr-auto text-xs leading-5 text-muted-foreground">Periksa ringkasan obat dan regimen sebelum menyimpan item ke resep aktif.</p>
                  <Button type="button" variant="outline" className="rounded-none" onClick={() => setAddMedicineModalOpen(false)} disabled={addingMedicine}>
                    Batal
                  </Button>
                  <Button type="button" className="rounded-none" disabled={!canSubmitAdd} onClick={() => void handleAdd()}>
                    {addingMedicine ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                    {addingMedicine ? 'Menyimpan...' : 'Tambah Obat ke Resep'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <ConfirmDialog
              open={pendingDeletePrescriptionId !== null}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                  setPendingDeletePrescriptionId(null);
                }
              }}
              onConfirm={() => {
                void handleConfirmDeletePrescription();
              }}
              title="Hapus Obat Tambahan Farmasi"
              description={`Yakin hapus ${pendingDeletePrescription?.medicine?.name || 'obat tambahan ini'} dari resep proses? Item order dokter tidak akan ikut terhapus.`}
              confirmText="Hapus"
              cancelText="Batal"
              variant="destructive"
            />

            <ConfirmDialog
              open={confirmReturnOpen}
              onOpenChange={setConfirmReturnOpen}
              onConfirm={() => {
                setConfirmReturnOpen(false);
                void onReturnToOrder();
              }}
              title="Kembalikan Resep ke Antrean Order"
              description="Resep akan keluar dari halaman proses dan kembali ke antrean order farmasi. Item tambahan yang sudah dimasukkan farmasi tetap tersimpan."
              confirmText={returningOrder ? 'Mengembalikan...' : 'Kembalikan'}
              cancelText="Batal"
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
