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
import { Separator } from '@/components/ui/separator';
import type { MedicalRecord } from '@/lib/api';
import { getPrescriptionWorkflowLabel } from '@/pages/emr/constants';
import {
  WORKFLOW_BADGE_CLASSNAME,
  buildOrderLines,
  formatCurrency,
  formatDateTime,
  getRecordStockSummary,
  getRecordTotalPrice,
} from '../utils';
import { CalendarClock, CheckCircle2, ClipboardList, CloudUpload, Download, Eye, Loader2, PillBottle, Stethoscope, UserRound, type LucideIcon } from 'lucide-react';

type OrderDetailDialogProps = {
  order: MedicalRecord | null;
  open: boolean;
  title: string;
  description: string ;
  footerNote: string;
  onOpenChange: (open: boolean) => void;
  primaryAction?: {
    label: string;
    processingLabel: string;
    processing: boolean;
    disabled?: boolean;
    onClick: () => void;
    icon: React.ReactNode;
  };
  downloadAction?: {
    label: string;
    processingLabel: string;
    processing: boolean;
    disabled?: boolean;
    onClick: () => void;
  };
  satusehatPrescriptionActions?: {
    previewingPrescriptionId?: number | null;
    syncingPrescriptionId?: number | null;
    onPreviewPrescription: (prescriptionId: number) => void;
    onSyncPrescription: (prescriptionId: number) => void;
  };
};

function DetailMetaCard({
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
    <div className="border border-border/70 bg-muted/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center border border-border/70 bg-background">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <div className="mt-1 text-sm font-medium text-foreground/95">{value}</div>
          {helper ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function OrderDetailDialog({
  order,
  open,
  title,
  description,
  footerNote,
  onOpenChange,
  primaryAction,
  downloadAction,
  satusehatPrescriptionActions,
}: OrderDetailDialogProps) {
  const orderLines = order ? buildOrderLines(order) : [];
  const totalPrice = order ? getRecordTotalPrice(order) : 0;
  const stockSummary = order ? getRecordStockSummary(order) : null;
  const workflowStatus = order?.prescription_workflow_status || 'draft';
  const workflowBadgeClassName = WORKFLOW_BADGE_CLASSNAME[workflowStatus] || WORKFLOW_BADGE_CLASSNAME.draft;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
        {order ? (
          <>
            <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(15,23,42,0.01),transparent)] px-6 py-4">
              <div className="space-y-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center border border-border/70 bg-background">
                      <PillBottle className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
                      <DialogDescription className="max-w-2xl text-xs">{description}</DialogDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-14">
                    <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${workflowBadgeClassName}`}>
                      {getPrescriptionWorkflowLabel(workflowStatus)}
                    </Badge>
                    <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                      {orderLines.length} item obat
                    </Badge>
                    <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                      {formatCurrency(totalPrice)}
                    </Badge>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-5 px-5 py-5 lg:px-6 lg:py-6">
                <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-3 border border-border/70 bg-background p-4">
                    <div className="space-y-1">
                      <h3 className="text-[13px] font-semibold tracking-tight">Ringkasan Pasien & Kunjungan</h3>
                      <p className="text-xs text-muted-foreground">Informasi utama yang dibutuhkan farmasi sebelum order diproses atau diserahkan.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <DetailMetaCard icon={UserRound} label="Pasien" value={order.patient?.full_name || '-'} helper={order.patient?.medical_record_number || 'No. RM belum tersedia'} />
                      <DetailMetaCard icon={Stethoscope} label="Dokter" value={order.doctor?.full_name || '-'} helper={order.polyclinic?.name || 'Poli belum tersedia'} />
                      <DetailMetaCard icon={ClipboardList} label="Kunjungan" value={order.visit?.visit_number || '-'} helper={order.visit?.payment_type ? `Pembayaran ${order.visit.payment_type}` : 'Pembayaran belum tersedia'} />
                      <DetailMetaCard icon={CalendarClock} label="Tanggal Order" value={formatDateTime(order.prescription_ordered_at || order.record_date)} helper={order.record_date ? `Dibuat ${formatDateTime(order.record_date)}` : undefined} />
                    </div>
                  </div>

                  <div className="space-y-3 border border-border/70 bg-background p-4">
                    <div className="space-y-1">
                      <h3 className="text-[13px] font-semibold tracking-tight">Kesiapan Farmasi</h3>
                      <p className="text-xs text-muted-foreground">Cek status stok dan catatan resep sebelum order dilanjutkan ke tahap berikutnya.</p>
                    </div>

                    <div className="border border-border/70 bg-muted/10 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Status Stok</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {stockSummary ? <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${stockSummary.badgeClassName}`}>{stockSummary.label}</Badge> : null}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{stockSummary?.helper || '-'}</p>
                    </div>

                    <div className="border border-border/70 bg-muted/10 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Catatan Resep</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/95">{order.notes?.trim() || 'Tidak ada catatan resep pada order ini.'}</p>
                    </div>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-[13px] font-semibold tracking-tight">Daftar Item Resep</h3>
                    <p className="text-xs text-muted-foreground">Ringkasan item obat, aturan pakai, dan nilai resep pada order ini.</p>
                  </div>

                  {orderLines.length === 0 ? (
                    <div className="border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                      Belum ada item obat pada order ini.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-border/70 bg-background">
                      <table className="w-full min-w-[980px] border-collapse text-sm">
                        <thead className="bg-muted/20">
                          <tr className="border-b border-border/70 text-left">
                            <th className="px-3 py-2 font-semibold text-foreground/90">Item</th>
                            <th className="px-3 py-2 font-semibold text-foreground/90">Aturan & Catatan</th>
                            <th className="w-[160px] px-3 py-2 text-right font-semibold text-foreground/90">Nilai</th>
                            {satusehatPrescriptionActions ? <th className="w-[240px] px-3 py-2 text-right font-semibold text-foreground/90">SATUSEHAT</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {orderLines.map((item) => {
                            const detailParts = [
                              item.instructions?.trim(),
                              item.notes?.trim() ? `Catatan: ${item.notes.trim()}` : null,
                            ].filter(Boolean);

                            return (
                              <tr key={item.key} className="border-b border-border/60 align-top last:border-b-0">
                                <td className="px-3 py-2">
                                  <div className="space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-[13px] font-semibold leading-4 text-foreground/95">{item.name}</p>
                                      <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[9px] uppercase tracking-[0.14em]">
                                        {item.kind === 'non-racikan' ? 'Non-Racikan' : 'Racikan'}
                                      </Badge>
                                      {item.satusehatMedicationRequestId ? (
                                        <Badge variant="outline" className="rounded-none border-emerald-300 bg-emerald-50 px-1.5 py-0 text-[9px] uppercase tracking-[0.14em] text-emerald-700">
                                          <CheckCircle2 className="mr-1 h-3 w-3 inline text-emerald-600" />
                                          Tersinkron
                                        </Badge>
                                      ) : item.kind === 'non-racikan' ? (
                                        <Badge variant="outline" className="rounded-none border-border bg-muted/30 px-1.5 py-0 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                                          Belum Sync
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <p className="text-[11px] leading-4 text-muted-foreground">{item.quantityLabel}</p>
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="space-y-0.5 text-[11px] leading-4">
                                    <p>
                                      <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Aturan</span>{' '}
                                      <span className="text-foreground/90">{item.ruleLabel}</span>
                                    </p>
                                    {detailParts.length > 0 ? <p className="text-muted-foreground">{detailParts.join(' • ')}</p> : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <p className="font-semibold text-foreground/95">{formatCurrency(item.price)}</p>
                                </td>
                                {satusehatPrescriptionActions ? (
                                  <td className="px-3 py-2">
                                    {item.kind === 'non-racikan' && item.source_id ? (
                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => satusehatPrescriptionActions.onPreviewPrescription(item.source_id!)} disabled={satusehatPrescriptionActions.previewingPrescriptionId === item.source_id || satusehatPrescriptionActions.syncingPrescriptionId === item.source_id}>
                                          {satusehatPrescriptionActions.previewingPrescriptionId === item.source_id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
                                          Preview
                                        </Button>
                                        <Button type="button" size="sm" className="rounded-none" onClick={() => satusehatPrescriptionActions.onSyncPrescription(item.source_id!)} disabled={satusehatPrescriptionActions.previewingPrescriptionId === item.source_id || satusehatPrescriptionActions.syncingPrescriptionId === item.source_id}>
                                          {satusehatPrescriptionActions.syncingPrescriptionId === item.source_id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudUpload className="mr-1.5 h-4 w-4" />}
                                          Sync
                                        </Button>
                                      </div>
                                    ) : (
                                      <p className="text-right text-[11px] text-muted-foreground">Racikan belum didukung.</p>
                                    )}
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            </ScrollArea>

            <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
              <p className="mr-auto text-xs leading-5 text-muted-foreground">{footerNote}</p>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              {downloadAction && (
                <Button type="button" variant="outline" className="rounded-none" onClick={downloadAction.onClick} disabled={downloadAction.disabled || downloadAction.processing}>
                  {downloadAction.processing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                  {downloadAction.processing ? downloadAction.processingLabel : downloadAction.label}
                </Button>
              )}
              {primaryAction && (
                <Button type="button" className="rounded-none" onClick={primaryAction.onClick} disabled={primaryAction.disabled || primaryAction.processing}>
                  {primaryAction.processing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : primaryAction.icon}
                  {primaryAction.processing ? primaryAction.processingLabel : primaryAction.label}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}