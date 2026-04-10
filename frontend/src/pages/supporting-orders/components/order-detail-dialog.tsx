import {
  CalendarClock,
  CloudUpload,
  ClipboardList,
  Download,
  Eye,
  FileText,
  FlaskConical,
  Loader2,
  ScanLine,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
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
import type { MedicalRecord } from '@/lib/api';
import { getLaboratoryFlagBadgeClassName, getLaboratoryOrderItemResultPreview, getLaboratoryOrderParameterCount } from '@/lib/laboratory';
import { getRadiologyOrderItemResultPreview, getRadiologyOrderParameterCount } from '@/lib/radiology';
import { getSupportingOrderWorkflowBadgeClassName, getSupportingOrderWorkflowLabel } from '@/pages/emr/constants';
import { formatDateTime } from '@/pages/emr/utils';
import {
  buildSupportingOrderLines,
  formatSupportingCurrency,
  getSupportingCompletedItemCount,
  getSupportingEstimatedValue,
  getSupportingItemCount,
  getSupportingOrderedAt,
  getSupportingProcessedAt,
  getSupportingWorkflowStatus,
  type SupportingUnitType,
} from '../utils';

type SupportingOrderDetailDialogProps = {
  unitType: SupportingUnitType;
  order: MedicalRecord | null;
  open: boolean;
  title: string;
  description: string;
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
  satusehatItemActions?: {
    previewingItemId?: number | null;
    syncingItemId?: number | null;
    onPreviewItem: (itemId: number) => void;
    onSyncItem: (itemId: number) => void;
  };
};

function hasSatusehatItemSync(item: { satusehat_service_request_id?: string; satusehat_observation_id?: string; satusehat_diagnostic_report_id?: string; specimen?: { satusehat_specimen_id?: string } }) {
  return Boolean(item.satusehat_service_request_id || item.satusehat_observation_id || item.satusehat_diagnostic_report_id || item.specimen?.satusehat_specimen_id);
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

export function SupportingOrderDetailDialog({
  unitType,
  order,
  open,
  title,
  description,
  footerNote,
  onOpenChange,
  primaryAction,
  downloadAction,
  satusehatItemActions,
}: SupportingOrderDetailDialogProps) {
  const workflowStatus = order ? getSupportingWorkflowStatus(order, unitType) : 'draft';
  const orderedAt = order ? getSupportingOrderedAt(order, unitType) : undefined;
  const processedAt = order ? getSupportingProcessedAt(order, unitType) : undefined;
  const lines = order ? buildSupportingOrderLines(order, unitType) : [];
  const itemCount = order ? getSupportingItemCount(order, unitType) : 0;
  const completedItemCount = order ? getSupportingCompletedItemCount(order, unitType) : 0;
  const estimatedValue = order ? getSupportingEstimatedValue(order, unitType) : 0;
  const UnitIcon = unitType === 'laboratory' ? FlaskConical : ScanLine;
  const unitLabel = unitType === 'laboratory' ? 'laboratorium' : 'radiologi';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[860px] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0 sm:w-[calc(100vw-2rem)]">
        {order ? (
          <>
            <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(15,23,42,0.01),transparent)] px-6 py-4">
              <div className="space-y-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center border border-border/70 bg-background">
                      <UnitIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
                      <DialogDescription className="max-w-2xl text-xs">{description}</DialogDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-14">
                    <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSupportingOrderWorkflowBadgeClassName(workflowStatus)}`}>
                      {getSupportingOrderWorkflowLabel(workflowStatus)}
                    </Badge>
                    <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                      {completedItemCount}/{itemCount} item {unitLabel}
                    </Badge>
                    <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                      {formatSupportingCurrency(estimatedValue)}
                    </Badge>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col xl:grid xl:grid-cols-[300px_minmax(0,1fr)] xl:items-stretch">
              <aside className="shrink-0 border-b border-border/70 bg-muted/20 xl:h-full xl:border-b-0 xl:border-r">
                <div className="space-y-3 px-4 py-4 xl:px-5 xl:py-5">
                  <section className="overflow-hidden border border-border/70 bg-background">
                    <div className="border-b border-border/70 px-4 py-3">
                      <h3 className="text-[13px] font-semibold tracking-tight">Informasi Order</h3>
                      <p className="text-[11px] leading-4 text-muted-foreground">Ringkasan utama order penunjang untuk validasi unit.</p>
                    </div>
                    <div className="divide-y divide-border/70">
                      <SummaryRow icon={UserRound} label="Pasien" value={order.patient?.full_name || '-'} helper={order.patient?.medical_record_number || 'No. RM belum tersedia'} />
                      <SummaryRow icon={Stethoscope} label="Dokter / Poli" value={order.doctor?.full_name || '-'} helper={order.polyclinic?.name || 'Poli belum tersedia'} />
                      <SummaryRow icon={ClipboardList} label="Kunjungan" value={order.visit?.visit_number || '-'} helper={order.visit?.payment_type ? `Pembayaran ${order.visit.payment_type}` : 'Pembayaran belum tersedia'} />
                      <SummaryRow icon={CalendarClock} label="Waktu Order" value={formatDateTime(orderedAt)} helper={processedAt ? `Diproses ${formatDateTime(processedAt)}` : 'Belum diproses unit'} />
                      <SummaryRow icon={FileText} label="Catatan Dokter" value={order.notes?.trim() || 'Tidak ada catatan tambahan.'} />
                    </div>
                  </section>
                </div>
              </aside>

              <section className="min-h-0 min-w-0 bg-background">
                <ScrollArea className="h-full">
                  <div className="space-y-4 px-4 py-4 xl:px-5 xl:py-5">
                    <section className="space-y-3">
                      {lines.length === 0 ? (
                        <div className="border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                          Belum ada item pada order ini.
                        </div>
                      ) : unitType === 'laboratory' ? (
                        <div className="space-y-3">
                          {(order.laboratory_order_items || []).map((item) => {
                            const parameterCount = getLaboratoryOrderParameterCount(item);

                            return (
                              <section key={item.id} className="overflow-hidden border border-border/70 bg-background">
                                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="space-y-1">
                                    <h4 className="text-[13px] font-semibold tracking-tight text-foreground/95">{item.test_name_snapshot || item.medical_service?.name || item.lab_test?.name || '-'}</h4>
                                    <p className="text-[11px] leading-5 text-muted-foreground">
                                      {[
                                        parameterCount > 0 ? `${parameterCount} parameter` : item.unit_snapshot ? `Unit ${item.unit_snapshot}` : '',
                                        parameterCount === 0 && item.normal_value_snapshot ? `Rujukan ${item.normal_value_snapshot}` : '',
                                        item.instructions ? `Instruksi: ${item.instructions}` : '',
                                      ].filter(Boolean).join(' · ')}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {hasSatusehatItemSync(item) ? (
                                      <Badge variant="outline" className="w-fit rounded-none border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-700">
                                        SATUSEHAT Tersinkron
                                      </Badge>
                                    ) : null}
                                    {parameterCount > 0 ? <Badge variant="outline" className="w-fit rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">Panel</Badge> : null}
                                    {satusehatItemActions ? (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => satusehatItemActions.onPreviewItem(item.id)} disabled={satusehatItemActions.previewingItemId === item.id || satusehatItemActions.syncingItemId === item.id}>
                                          {satusehatItemActions.previewingItemId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
                                          Preview SATUSEHAT
                                        </Button>
                                        <Button type="button" size="sm" className="rounded-none" onClick={() => satusehatItemActions.onSyncItem(item.id)} disabled={satusehatItemActions.previewingItemId === item.id || satusehatItemActions.syncingItemId === item.id}>
                                          {satusehatItemActions.syncingItemId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudUpload className="mr-1.5 h-4 w-4" />}
                                          Sync SATUSEHAT
                                        </Button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                {parameterCount > 0 ? (
                                  <div className="overflow-x-auto border-t border-border/70">
                                    <table className="w-full min-w-[760px] border-collapse text-sm">
                                      <thead className="bg-muted/20">
                                        <tr className="border-b border-border/70 text-left">
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Parameter</th>
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Rujukan</th>
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Hasil</th>
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Flag</th>
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Catatan</th>
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
                                            <td className="px-3 py-2 text-[11px] leading-5 text-foreground/90">{parameter.result_notes || '-'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="border-t border-border/70 px-4 py-3 text-[11px] leading-5 text-foreground/90">
                                    {getLaboratoryOrderItemResultPreview(item)}
                                  </div>
                                )}

                                {item.result_notes?.trim() ? (
                                  <div className="border-t border-border/70 bg-muted/10 px-4 py-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Catatan Panel</p>
                                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-foreground/90">{item.result_notes}</p>
                                  </div>
                                ) : null}
                              </section>
                            );
                          })}
                        </div>
                      ) : (order.radiology_order_items || []).some((item) => getRadiologyOrderParameterCount(item) > 0) ? (
                        <div className="space-y-3">
                          {(order.radiology_order_items || []).map((item) => {
                            const parameterCount = getRadiologyOrderParameterCount(item);

                            return (
                              <section key={item.id} className="overflow-hidden border border-border/70 bg-background">
                                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="space-y-1">
                                    <h4 className="text-[13px] font-semibold tracking-tight text-foreground/95">{item.service_name_snapshot || item.medical_service?.name || '-'}</h4>
                                    <p className="text-[11px] leading-5 text-muted-foreground">
                                      {[
                                        parameterCount > 0 ? `${parameterCount} parameter` : '',
                                        item.instructions ? `Instruksi: ${item.instructions}` : '',
                                        item.template_snapshot ? `Template: ${item.template_snapshot}` : '',
                                      ].filter(Boolean).join(' · ')}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {hasSatusehatItemSync(item) ? (
                                      <Badge variant="outline" className="w-fit rounded-none border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-700">
                                        SATUSEHAT Tersinkron
                                      </Badge>
                                    ) : null}
                                    {parameterCount > 0 ? <Badge variant="outline" className="w-fit rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">Panel</Badge> : null}
                                    {satusehatItemActions ? (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => satusehatItemActions.onPreviewItem(item.id)} disabled={satusehatItemActions.previewingItemId === item.id || satusehatItemActions.syncingItemId === item.id}>
                                          {satusehatItemActions.previewingItemId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
                                          Preview SATUSEHAT
                                        </Button>
                                        <Button type="button" size="sm" className="rounded-none" onClick={() => satusehatItemActions.onSyncItem(item.id)} disabled={satusehatItemActions.previewingItemId === item.id || satusehatItemActions.syncingItemId === item.id}>
                                          {satusehatItemActions.syncingItemId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudUpload className="mr-1.5 h-4 w-4" />}
                                          Sync SATUSEHAT
                                        </Button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                {parameterCount > 0 ? (
                                  <div className="overflow-x-auto border-t border-border/70">
                                    <table className="w-full min-w-[760px] border-collapse text-sm">
                                      <thead className="bg-muted/20">
                                        <tr className="border-b border-border/70 text-left">
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Parameter</th>
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Template</th>
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Hasil</th>
                                          <th className="px-3 py-2 font-semibold text-foreground/90">Catatan</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(item.parameter_results || []).map((parameter) => (
                                          <tr key={parameter.id} className="border-b border-border/60 align-top last:border-b-0">
                                            <td className="px-3 py-2 text-[13px] font-medium leading-5 text-foreground/95">{parameter.parameter_name_snapshot || parameter.medical_service_parameter?.name || '-'}</td>
                                            <td className="px-3 py-2 text-[11px] leading-5 text-muted-foreground">{parameter.reference_value_snapshot || '-'}</td>
                                            <td className="px-3 py-2 text-[11px] leading-5 text-foreground/90">{parameter.result_value || '-'}</td>
                                            <td className="px-3 py-2 text-[11px] leading-5 text-foreground/90">{parameter.result_notes || '-'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="border-t border-border/70 px-4 py-3 text-[11px] leading-5 text-foreground/90">
                                    {getRadiologyOrderItemResultPreview(item)}
                                  </div>
                                )}

                                {item.result_notes?.trim() ? (
                                  <div className="border-t border-border/70 bg-muted/10 px-4 py-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Catatan Panel</p>
                                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-foreground/90">{item.result_notes}</p>
                                  </div>
                                ) : null}
                              </section>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="overflow-hidden border border-border/70 bg-background">
                          <table className="w-full min-w-[760px] border-collapse text-sm">
                            <thead className="bg-muted/20">
                              <tr className="border-b border-border/70 text-left">
                                <th className="px-3 py-2 font-semibold text-foreground/90">Item</th>
                                <th className="px-3 py-2 font-semibold text-foreground/90">Detail Order</th>
                                <th className="px-3 py-2 font-semibold text-foreground/90">Hasil</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((line) => (
                                <tr key={line.key} className="border-b border-border/60 align-top last:border-b-0">
                                  <td className="px-3 py-2 text-[13px] font-semibold leading-5 text-foreground/95">{line.name}</td>
                                  <td className="px-3 py-2 text-[11px] leading-5 text-muted-foreground">{line.detail || '-'}</td>
                                  <td className="px-3 py-2 text-[11px] leading-5 text-foreground/90">{line.result}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </div>
                </ScrollArea>
              </section>
            </div>

            <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
              <p className="mr-auto text-xs leading-5 text-muted-foreground">{footerNote}</p>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              {downloadAction ? (
                <Button type="button" variant="outline" className="rounded-none" onClick={downloadAction.onClick} disabled={downloadAction.disabled || downloadAction.processing}>
                  {downloadAction.processing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                  {downloadAction.processing ? downloadAction.processingLabel : downloadAction.label}
                </Button>
              ) : null}
              {primaryAction ? (
                <Button type="button" className="rounded-none" onClick={primaryAction.onClick} disabled={primaryAction.disabled || primaryAction.processing}>
                  {primaryAction.processing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : primaryAction.icon}
                  {primaryAction.processing ? primaryAction.processingLabel : primaryAction.label}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}