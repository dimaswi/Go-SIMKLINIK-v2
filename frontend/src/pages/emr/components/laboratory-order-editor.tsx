import { Eye, FilePlus2, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { LaboratoryOrderItem, MedicalRecord, MedicalService } from '@/lib/api';
import {
  getLaboratoryCompletedParameterCount,
  getLaboratoryFlagBadgeClassName,
  getLaboratoryOrderItemResultPreview,
  getLaboratoryOrderParameterCount,
  isLaboratoryParameterResultFilled,
  isLaboratoryOrderItemCompleted,
} from '@/lib/laboratory';
import { getSupportingOrderWorkflowBadgeClassName, getSupportingOrderWorkflowLabel } from '../constants';
import { formatDateTime } from '../utils';
import { TableCell, TableRow, TableSection, TextEditor } from './form-fields';

function getLaboratoryItemAbnormalFlagCount(item: LaboratoryOrderItem) {
  const parameterFlags = (item.parameter_results || [])
    .map((parameter) => (parameter.flag || '').trim().toLowerCase())
    .filter((flag) => flag && flag !== 'normal');

  if (parameterFlags.length > 0) {
    return parameterFlags.length;
  }

  const itemFlag = (item.flag || '').trim().toLowerCase();
  return itemFlag && itemFlag !== 'normal' ? 1 : 0;
}

type LaboratoryOrderEditorProps = {
  record: MedicalRecord | null;
  items: LaboratoryOrderItem[];
  services: MedicalService[];
  onAdd: (payload: { medical_service_id: number; instructions: string }) => void;
  onDelete: (itemId: number) => void;
  onCancelOrder?: () => void;
  onPrintTicket?: () => void;
  onPrintResult?: () => void;
  canCancelOrder?: boolean;
  actionState?: {
    canceling?: boolean;
    printingTicket: boolean;
    printingResult: boolean;
  };
  readOnly: boolean;
};

function LaboratoryOrderResultDialog({
  item,
  open,
  onOpenChange,
}: {
  item: LaboratoryOrderItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  const parameterCount = getLaboratoryOrderParameterCount(item);
  const completedParameterCount = getLaboratoryCompletedParameterCount(item);
  const abnormalFlagCount = getLaboratoryItemAbnormalFlagCount(item);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
        <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(15,23,42,0.01),transparent)] px-5 py-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <DialogTitle className="text-lg font-semibold tracking-tight">{item.test_name_snapshot || item.medical_service?.name || item.lab_test?.name || '-'}</DialogTitle>
              <DialogDescription className="max-w-3xl text-xs leading-5">
                Seluruh hasil laboratorium untuk item ini ditampilkan di modal agar daftar order pada halaman EMR tetap ringkas.
              </DialogDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                {parameterCount > 0 ? 'Panel' : 'Single'}
              </Badge>
              {item.test_code_snapshot ? (
                <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {item.test_code_snapshot}
                </Badge>
              ) : null}
              <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                {parameterCount > 0 ? `${completedParameterCount}/${parameterCount} parameter terisi` : (item.result_value || '').trim() ? 'Hasil tersedia' : 'Belum ada hasil'}
              </Badge>
              {abnormalFlagCount > 0 ? (
                <Badge variant="outline" className="rounded-none border-rose-300 bg-rose-50 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-rose-700">
                  {abnormalFlagCount} flag non-normal
                </Badge>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 px-5 py-4">
            <section className="grid gap-3 border border-border/70 bg-background p-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ringkasan</p>
                <p className="text-sm text-foreground/90">{getLaboratoryOrderItemResultPreview(item)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Nilai Rujukan</p>
                <p className="text-sm text-foreground/90">{item.normal_value_snapshot || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Petugas</p>
                <p className="text-sm text-foreground/90">{item.result_by_user?.full_name || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Waktu Hasil</p>
                <p className="text-sm text-foreground/90">{formatDateTime(item.result_date)}</p>
              </div>
            </section>

            {item.instructions ? (
              <section className="border border-border/70 bg-muted/10 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Instruksi Klinis</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{item.instructions}</p>
              </section>
            ) : null}

            {parameterCount > 0 ? (
              <section className="overflow-hidden border border-border/70 bg-background">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead className="bg-muted/20">
                      <tr className="border-b border-border/70 text-left">
                        <th className="px-3 py-2 font-semibold text-foreground/90">Parameter</th>
                        <th className="px-3 py-2 font-semibold text-foreground/90">Rujukan</th>
                        <th className="px-3 py-2 font-semibold text-foreground/90">Hasil</th>
                        <th className="px-3 py-2 font-semibold text-foreground/90">Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(item.parameter_results || []).map((parameter) => (
                        <tr key={parameter.id} className="border-b border-border/60 align-top last:border-b-0">
                          <td className="px-3 py-2 text-[13px] font-medium leading-5 text-foreground/95">{parameter.parameter_name_snapshot || parameter.medical_service_parameter?.name || '-'}</td>
                          <td className="px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                            {[parameter.normal_value_snapshot, parameter.unit_snapshot ? `(${parameter.unit_snapshot})` : ''].filter(Boolean).join(' ') || '-'}
                          </td>
                          <td className="px-3 py-2 text-[11px] leading-5 text-foreground/90">{parameter.result_value || '-'}</td>
                          <td className="px-3 py-2 text-[11px] leading-5 text-foreground/90">
                            {parameter.flag ? (
                              <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getLaboratoryFlagBadgeClassName(parameter.flag)}`}>
                                {parameter.flag}
                              </Badge>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <section className="grid gap-3 border border-border/70 bg-background p-4 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Hasil</p>
                  <p className="text-sm text-foreground/90">{item.result_value || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Flag</p>
                  <div>
                    {item.flag ? (
                      <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getLaboratoryFlagBadgeClassName(item.flag)}`}>
                        {item.flag}
                      </Badge>
                    ) : '-'}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Unit</p>
                  <p className="text-sm text-foreground/90">{item.unit_snapshot || '-'}</p>
                </div>
              </section>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border/70 bg-background/95 px-5 py-4">
          <Button type="button" variant="outline" className="rounded-none ml-auto" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LaboratoryOrderEditor({ record, items, services, onAdd, onDelete, onCancelOrder, onPrintTicket, onPrintResult, canCancelOrder = false, actionState, readOnly }: LaboratoryOrderEditorProps) {
  const [serviceId, setServiceId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedResultItemId, setSelectedResultItemId] = useState<number | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const laboratoryServices = useMemo(
    () => services.filter((service) => ['laboratorium', 'laboratory'].includes((service.category?.name || '').toLowerCase())),
    [services],
  );

  const options = useMemo(
    () => laboratoryServices.map((service) => ({
      value: String(service.id),
      label: [
        service.name,
        (service.parameters?.length || 0) > 0 ? `${service.parameters?.length || 0} parameter` : `Rp ${service.price.toLocaleString('id-ID')}`,
      ].filter(Boolean).join(' · '),
    })),
    [laboratoryServices],
  );

  const workflowStatus = record?.laboratory_workflow_status || 'draft';
  const completedItemCount = useMemo(
    () => items.filter((item) => isLaboratoryOrderItemCompleted(item)).length,
    [items],
  );
  const hasPrintableResults = useMemo(
    () => items.some((item) => {
      if (getLaboratoryOrderParameterCount(item) > 0) {
        return (item.parameter_results || []).some((parameter) => isLaboratoryParameterResultFilled(parameter));
      }
      return Boolean((item.result_value || '').trim());
    }),
    [items],
  );
  const selectedResultItem = useMemo(
    () => items.find((item) => item.id === selectedResultItemId) || null,
    [items, selectedResultItemId],
  );
  const canPrintTicket = Boolean(onPrintTicket && items.length > 0 && workflowStatus !== 'draft' && !actionState?.printingTicket);
  const canPrintResult = Boolean(onPrintResult && workflowStatus === 'completed' && hasPrintableResults && !actionState?.printingResult);
  const showCancelOrderButton = Boolean(canCancelOrder && onCancelOrder);

  useEffect(() => {
    if (selectedResultItemId && !selectedResultItem) {
      setSelectedResultItemId(null);
    }
  }, [selectedResultItem, selectedResultItemId]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSupportingOrderWorkflowBadgeClassName(workflowStatus)}`}>
            {getSupportingOrderWorkflowLabel(workflowStatus)}
          </Badge>
          <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
            {items.length} item
          </Badge>
          <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
            {completedItemCount}/{items.length} selesai
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showCancelOrderButton ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCancelDialogOpen(true)}
              disabled={actionState?.canceling}
            >
              {actionState?.canceling ? 'Membatalkan...' : 'Batal Order'}
            </Button>
          ) : null}
          {canPrintTicket ? (
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={onPrintTicket}>
              <Printer className="mr-1.5 h-4 w-4" />
              {actionState?.printingTicket ? 'Menyiapkan Tiket...' : 'Cetak Tiket'}
            </Button>
          ) : null}
          {canPrintResult ? (
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={onPrintResult}>
              <Printer className="mr-1.5 h-4 w-4" />
              {actionState?.printingResult ? 'Menyiapkan Hasil...' : 'Cetak Hasil'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden border border-border/70 bg-background">
        {items.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">Belum ada order laboratorium.</div>
        ) : (
          <div className="divide-y divide-border/70">
            {items.map((item) => {
              const parameterCount = getLaboratoryOrderParameterCount(item);
              const completedParameterCount = getLaboratoryCompletedParameterCount(item);
              const abnormalFlagCount = getLaboratoryItemAbnormalFlagCount(item);
              const isCompleted = isLaboratoryOrderItemCompleted(item);

              return (
                <div key={item.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground/95">{item.test_name_snapshot || item.medical_service?.name || item.lab_test?.name || '-'}</p>
                      <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                        {parameterCount > 0 ? 'Panel' : 'Single'}
                      </Badge>
                      {item.test_code_snapshot ? (
                        <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {item.test_code_snapshot}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${isCompleted ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}`}>
                        {isCompleted ? 'Lengkap' : 'Belum Lengkap'}
                      </Badge>
                      {abnormalFlagCount > 0 ? (
                        <Badge variant="outline" className="rounded-none border-rose-300 bg-rose-50 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-rose-700">
                          {abnormalFlagCount} flag non-normal
                        </Badge>
                      ) : null}
                    </div>

                    <div className="space-y-1 text-[11px] leading-4 text-muted-foreground">
                      <p>
                        {parameterCount > 0 ? `${parameterCount} parameter` : item.unit_snapshot || '-'}
                        {parameterCount === 0 && item.normal_value_snapshot ? ` · Nilai rujukan ${item.normal_value_snapshot}` : ''}
                      </p>
                      {item.instructions ? <p>Instruksi: {item.instructions}</p> : null}
                    </div>
                  </div>

                  <div className="space-y-2 text-[11px] leading-4">
                    <div>
                      <p className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Status Hasil</p>
                      <p className="mt-1 text-foreground/90">
                        {parameterCount > 0 ? `${completedParameterCount}/${parameterCount} parameter terisi` : (item.result_value || '').trim() ? 'Hasil sudah tersedia' : 'Belum ada hasil terisi'}
                      </p>
                    </div>
                    <div className="grid gap-1 text-muted-foreground">
                      <p>Petugas: {item.result_by_user?.full_name || '-'}</p>
                      <p>Waktu hasil: {formatDateTime(item.result_date)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => setSelectedResultItemId(item.id)}>
                      <Eye className="mr-1.5 h-4 w-4" /> Lihat Hasil
                    </Button>
                    {!readOnly ? (
                      <Button type="button" variant="ghost" size="sm" className="rounded-none text-destructive" onClick={() => onDelete(item.id)}>
                        Hapus
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <LaboratoryOrderResultDialog
        item={selectedResultItem}
        open={Boolean(selectedResultItem)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedResultItemId(null);
          }
        }}
      />

      {!readOnly ? (
        <TableSection title="Tambah Pemeriksaan Laboratorium">
          <TableRow>
            <TableCell label="Pemeriksaan" colSpan={3}>
              <SearchableSelect
                options={options}
                value={serviceId}
                onValueChange={setServiceId}
                placeholder="Pilih pemeriksaan laboratorium"
                searchPlaceholder="Cari pemeriksaan"
                square
              />
            </TableCell>
            <TableCell label="Aksi" className="w-[180px]">
              <div className="flex min-h-8 items-center">
                <Button
                  type="button"
                  className="gap-1.5 rounded-none"
                  disabled={!serviceId}
                  onClick={() => {
                    if (!serviceId) return;
                    onAdd({ medical_service_id: Number(serviceId), instructions });
                    setServiceId('');
                    setInstructions('');
                  }}
                >
                  <FilePlus2 className="h-4 w-4" /> Tambah Item
                </Button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell label="Instruksi Klinis" colSpan={4}>
              <TextEditor label="Instruksi Klinis" hideLabel value={instructions} onChange={setInstructions} disabled={false} rows={3} />
            </TableCell>
          </TableRow>
        </TableSection>
      ) : null}

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={() => {
          setCancelDialogOpen(false);
          onCancelOrder?.();
        }}
        title="Batalkan Order Laboratorium"
        description="Order laboratorium akan dikembalikan ke draft supaya item dan catatan bisa diubah lagi. Aksi ini hanya tersedia sebelum unit laboratorium mulai memproses order."
        confirmText={actionState?.canceling ? 'Membatalkan...' : 'Batalkan Order'}
        cancelText="Kembali"
        variant="destructive"
      />
    </section>
  );
}