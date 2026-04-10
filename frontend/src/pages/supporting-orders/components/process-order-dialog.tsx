import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, FileText, FlaskConical, Loader2, Plus, RotateCcw, Save, ScanLine, Stethoscope, Trash2, UserRound, type LucideIcon } from 'lucide-react';
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
import type { MedicalRecord, MedicalService } from '@/lib/api';
import { getLaboratoryAutoFlag, getLaboratoryFlagBadgeClassName, getLaboratoryOrderParameterCount } from '@/lib/laboratory';
import { getRadiologyOrderParameterCount } from '@/lib/radiology';
import { getSupportingOrderWorkflowBadgeClassName, getSupportingOrderWorkflowLabel } from '@/pages/emr/constants';
import { formatDateTime } from '@/pages/emr/utils';
import {
  buildSupportingOrderLines,
  formatSupportingCurrency,
  getSupportingCompletedItemCount,
  getSupportingEstimatedValue,
  getSupportingItemCount,
  getSupportingOrderedAt,
  hasSupportingSavedResults,
  isSupportingProcessAddedItem,
  getSupportingWorkflowStatus,
  type SupportingUnitType,
} from '../utils';

type LaboratoryDraftParameter = {
  id: number;
  result_value: string;
};

type LaboratoryDraftItem = {
  id: number;
  result_value: string;
  parameters: LaboratoryDraftParameter[];
};

type RadiologyDraftItem = {
  id: number;
  findings: string;
  impression: string;
  recommendation: string;
  parameters: Array<{
    id: number;
    result_value: string;
  }>;
};

type SupportingAddOrderItemPayload = {
  medical_service_id: number;
  specimen_template_id?: number;
  instructions: string;
};

type SupportingProcessOrderDialogProps = {
  unitType: SupportingUnitType;
  order: MedicalRecord | null;
  open: boolean;
  canManage: boolean;
  serviceMasters: MedicalService[];
  loadingServiceMasters: boolean;
  addingItem: boolean;
  saving: boolean;
  completing: boolean;
  returning: boolean;
  deletingItemId: number | null;
  onOpenChange: (open: boolean) => void;
  onAddItem: (payload: SupportingAddOrderItemPayload) => Promise<void>;
  onDeleteItem: (itemId: number) => Promise<void>;
  onSaveLaboratoryResults: (items: LaboratoryDraftItem[]) => Promise<void>;
  onSaveRadiologyResults: (items: RadiologyDraftItem[]) => Promise<void>;
  onReturnToOrder: () => Promise<void>;
  onComplete: () => Promise<void>;
};

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

function isServiceForUnit(service: MedicalService, unitType: SupportingUnitType) {
  const categoryName = (service.category?.name || '').trim().toLowerCase();
  if (unitType === 'laboratory') {
    return categoryName === 'laboratorium' || categoryName === 'laboratory';
  }
  return categoryName === 'radiologi' || categoryName === 'radiology';
}

export function SupportingProcessOrderDialog({
  unitType,
  order,
  open,
  canManage,
  serviceMasters,
  loadingServiceMasters,
  addingItem,
  saving,
  completing,
  returning,
  deletingItemId,
  onOpenChange,
  onAddItem,
  onDeleteItem,
  onSaveLaboratoryResults,
  onSaveRadiologyResults,
  onReturnToOrder,
  onComplete,
}: SupportingProcessOrderDialogProps) {
  const [laboratoryItems, setLaboratoryItems] = useState<LaboratoryDraftItem[]>([]);
  const [radiologyItems, setRadiologyItems] = useState<RadiologyDraftItem[]>([]);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<number | null>(null);
  const [confirmReturnOpen, setConfirmReturnOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedSpecimenTemplateId, setSelectedSpecimenTemplateId] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  useEffect(() => {
    if (!open || !order) return;

    if (unitType === 'laboratory') {
      setLaboratoryItems((order.laboratory_order_items || []).map((item) => ({
        id: item.id,
        result_value: item.result_value || '',
        parameters: (item.parameter_results || []).map((parameter) => ({
          id: parameter.id,
          result_value: parameter.result_value || '',
        })),
      })));
      return;
    }

    setRadiologyItems((order.radiology_order_items || []).map((item) => ({
      id: item.id,
      findings: item.findings || '',
      impression: item.impression || '',
      recommendation: item.recommendation || '',
      parameters: (item.parameter_results || []).map((parameter) => ({
        id: parameter.id,
        result_value: parameter.result_value || '',
      })),
    })));
  }, [open, order, unitType]);

  useEffect(() => {
    if (!open) {
      setAddItemModalOpen(false);
      setPendingDeleteItemId(null);
      setConfirmReturnOpen(false);
      setSelectedServiceId('');
      setSelectedSpecimenTemplateId('');
      setAdditionalInstructions('');
    }
  }, [open]);

  const workflowStatus = order ? getSupportingWorkflowStatus(order, unitType) : 'draft';
  const itemCount = order ? getSupportingItemCount(order, unitType) : 0;
  const completedItemCount = order ? getSupportingCompletedItemCount(order, unitType) : 0;
  const orderedAt = order ? getSupportingOrderedAt(order, unitType) : undefined;
  const estimatedValue = order ? getSupportingEstimatedValue(order, unitType) : 0;
  const hasSavedResults = order ? hasSupportingSavedResults(order, unitType) : false;
  const unitLabel = unitType === 'laboratory' ? 'laboratorium' : 'radiologi';
  const UnitIcon = unitType === 'laboratory' ? FlaskConical : ScanLine;

  const canComplete = useMemo(() => {
    if (!canManage || !order || completing) return false;

    if (unitType === 'laboratory') {
      return (order.laboratory_order_items || []).length > 0 && (order.laboratory_order_items || []).every((item) => {
        const draftItem = laboratoryItems.find((draft) => draft.id === item.id);
        const parameterResults = item.parameter_results || [];

        if (parameterResults.length > 0) {
          return parameterResults
            .filter((parameter) => parameter.is_required !== false)
            .every((parameter) => Boolean((draftItem?.parameters.find((draft) => draft.id === parameter.id)?.result_value || '').trim()));
        }

        return Boolean((draftItem?.result_value || '').trim());
      });
    }

    return (order.radiology_order_items || []).length > 0 && (order.radiology_order_items || []).every((item) => {
      const draftItem = radiologyItems.find((draft) => draft.id === item.id);
      const parameterResults = item.parameter_results || [];

      if (parameterResults.length > 0) {
        return parameterResults
          .filter((parameter) => parameter.is_required !== false)
          .every((parameter) => Boolean((draftItem?.parameters.find((draft) => draft.id === parameter.id)?.result_value || '').trim()));
      }

      return Boolean((draftItem?.findings || '').trim() || (draftItem?.impression || '').trim());
    });
  }, [canManage, completing, laboratoryItems, order, radiologyItems, unitType]);
  const canReturnToOrder = Boolean(canManage && order && workflowStatus === 'preparing' && !returning && !hasSavedResults);

  const lines = order ? buildSupportingOrderLines(order, unitType) : [];
  const availableServices = useMemo(
    () => serviceMasters
      .filter((service) => service.is_active && isServiceForUnit(service, unitType))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [serviceMasters, unitType],
  );
  const serviceOptions = useMemo(
    () => availableServices.map((service) => ({
      value: String(service.id),
      label: `${service.name}${service.parameters?.length ? ` · ${service.parameters.length} parameter` : ''}`,
    })),
    [availableServices],
  );
  const selectedService = useMemo(
    () => availableServices.find((service) => String(service.id) === selectedServiceId) || null,
    [availableServices, selectedServiceId],
  );
  const selectedServiceSpecimenOptions = useMemo(
    () => (selectedService?.specimen_options || []).slice().sort((left, right) => {
      if (left.is_default !== right.is_default) {
        return left.is_default ? -1 : 1;
      }
      return (left.sort_order || 0) - (right.sort_order || 0);
    }),
    [selectedService],
  );
  const selectedSpecimenOption = useMemo(
    () => selectedServiceSpecimenOptions.find((option) => String(option.specimen_template_id) === selectedSpecimenTemplateId) || null,
    [selectedServiceSpecimenOptions, selectedSpecimenTemplateId],
  );
  const pendingDeleteItem = useMemo(() => {
    if (!order || pendingDeleteItemId === null) {
      return null;
    }

    if (unitType === 'laboratory') {
      return (order.laboratory_order_items || []).find((item) => item.id === pendingDeleteItemId) || null;
    }

    return (order.radiology_order_items || []).find((item) => item.id === pendingDeleteItemId) || null;
  }, [order, pendingDeleteItemId, unitType]);
  const canSubmitAddItem = Boolean(canManage && selectedServiceId && !addingItem);

  useEffect(() => {
    if (!selectedService) {
      setSelectedSpecimenTemplateId('');
      return;
    }

    const defaultOption = selectedServiceSpecimenOptions.find((option) => option.is_default) || selectedServiceSpecimenOptions[0];
    setSelectedSpecimenTemplateId(defaultOption ? String(defaultOption.specimen_template_id) : '');
  }, [selectedService, selectedServiceSpecimenOptions]);

  const updateLaboratoryItem = (itemId: number, updates: Partial<LaboratoryDraftItem>) => {
    setLaboratoryItems((current) => current.map((item) => item.id === itemId ? { ...item, ...updates } : item));
  };

  const updateLaboratoryParameter = (itemId: number, parameterId: number, updates: Partial<LaboratoryDraftParameter>) => {
    setLaboratoryItems((current) => current.map((item) => item.id === itemId ? {
      ...item,
      parameters: item.parameters.map((parameter) => parameter.id === parameterId ? { ...parameter, ...updates } : parameter),
    } : item));
  };

  const updateRadiologyItem = (itemId: number, updates: Partial<RadiologyDraftItem>) => {
    setRadiologyItems((current) => current.map((item) => item.id === itemId ? { ...item, ...updates } : item));
  };

  const updateRadiologyParameter = (itemId: number, parameterId: number, updates: Partial<RadiologyDraftItem['parameters'][number]>) => {
    setRadiologyItems((current) => current.map((item) => item.id === itemId ? {
      ...item,
      parameters: item.parameters.map((parameter) => parameter.id === parameterId ? { ...parameter, ...updates } : parameter),
    } : item));
  };

  const handleAddItem = async () => {
    if (!selectedServiceId) return;

    await onAddItem({
      medical_service_id: Number(selectedServiceId),
      specimen_template_id: selectedSpecimenTemplateId ? Number(selectedSpecimenTemplateId) : undefined,
      instructions: additionalInstructions,
    });

    setAddItemModalOpen(false);
    setSelectedServiceId('');
    setSelectedSpecimenTemplateId('');
    setAdditionalInstructions('');
  };

  const handleConfirmDeleteItem = async () => {
    if (pendingDeleteItemId === null) {
      return;
    }

    const targetId = pendingDeleteItemId;
    setPendingDeleteItemId(null);
    await onDeleteItem(targetId);
  };

  const pendingDeleteItemName = pendingDeleteItem
    ? ('test_name_snapshot' in pendingDeleteItem
        ? pendingDeleteItem.test_name_snapshot || pendingDeleteItem.medical_service?.name || pendingDeleteItem.lab_test?.name || 'item tambahan ini'
        : pendingDeleteItem.service_name_snapshot || pendingDeleteItem.medical_service?.name || 'item tambahan ini')
    : 'item tambahan ini';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[920px] w-[calc(100vw-1rem)] max-w-7xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0 sm:w-[calc(100vw-1.5rem)]">
        {order ? (
          <>
            <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(15,23,42,0.01),transparent)] px-6 py-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center border border-border/70 bg-background">
                      <UnitIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-semibold tracking-tight">Proses Order {unitType === 'laboratory' ? 'Laboratorium' : 'Radiologi'}</DialogTitle>
                      <DialogDescription className="max-w-2xl text-xs">
                        Unit mengisi hasil langsung pada order yang sama, dapat menambah tindakan bila diperlukan, lalu menandai order selesai agar hasil kembali terlihat di EMR.
                      </DialogDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-14">
                    <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSupportingOrderWorkflowBadgeClassName(workflowStatus)}`}>
                      {getSupportingOrderWorkflowLabel(workflowStatus)}
                    </Badge>
                    <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                      {completedItemCount}/{itemCount} item terisi
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
                    <div className="divide-y divide-border/70">
                      <SummaryRow icon={UserRound} label="Pasien" value={order.patient?.full_name || '-'} helper={order.patient?.medical_record_number || 'No. RM belum tersedia'} />
                      <SummaryRow icon={ClipboardList} label="Kunjungan" value={order.visit?.visit_number || '-'} helper={order.visit?.payment_type ? `Pembayaran ${order.visit.payment_type}` : 'Pembayaran belum tersedia'} />
                      <SummaryRow icon={Stethoscope} label="Dokter / Poli" value={order.doctor?.full_name || '-'} helper={order.polyclinic?.name || '-'} />
                      <SummaryRow icon={CalendarClock} label="Waktu Order" value={formatDateTime(orderedAt)} helper={workflowStatus === 'completed' ? 'Order sudah selesai diproses' : 'Lengkapi hasil sebelum menutup order'} />
                      <SummaryRow icon={FileText} label="Catatan Dokter" value={order.notes?.trim() || 'Tidak ada catatan tambahan.'} />
                    </div>
                  </section>

                  <section className="overflow-hidden border border-border/70 bg-background">
                    <div className="space-y-3 px-4 py-3">
                      <Button
                        type="button"
                        className="w-full rounded-none"
                        disabled={!canManage || loadingServiceMasters}
                        onClick={() => setAddItemModalOpen(true)}
                      >
                        {loadingServiceMasters ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                        {loadingServiceMasters ? 'Memuat master tindakan...' : `Tambah ${unitType === 'laboratory' ? 'Pemeriksaan' : 'Tindakan'}`}
                      </Button>
                    </div>
                  </section>
                </div>
              </aside>

              <section className="min-h-0 min-w-0 bg-background">
                <ScrollArea className="h-full">
                  <div className="space-y-4 px-4 py-4 xl:px-5 xl:py-5">
                    {lines.length === 0 ? (
                      <div className="border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                        Belum ada item order {unitLabel}.
                      </div>
                    ) : unitType === 'laboratory' ? (
                      <div className="space-y-3">
                        {(order.laboratory_order_items || []).map((item, index) => {
                          const draftItem = laboratoryItems.find((draft) => draft.id === item.id) || laboratoryItems[index];
                          const parameterCount = getLaboratoryOrderParameterCount(item);
                          const completedParameterCount = (draftItem?.parameters || []).filter((parameter) => parameter.result_value.trim()).length;
                          const isManualItem = isSupportingProcessAddedItem(order, 'laboratory', item);

                          return (
                            <section key={item.id} className="overflow-hidden border border-border/70 bg-background">
                              <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1">
                                  <h3 className="text-[13px] font-semibold tracking-tight">{item.test_name_snapshot || item.medical_service?.name || item.lab_test?.name || '-'}</h3>
                                  <p className="text-[11px] leading-5 text-muted-foreground">
                                    {[
                                      parameterCount > 0 ? `${parameterCount} parameter` : item.unit_snapshot ? `Unit ${item.unit_snapshot}` : '',
                                      parameterCount === 0 && item.normal_value_snapshot ? `Rujukan ${item.normal_value_snapshot}` : '',
                                      item.specimen?.template_name_snapshot ? `Specimen: ${item.specimen.template_name_snapshot}` : item.specimen?.type_display ? `Specimen: ${item.specimen.type_display}` : '',
                                      item.instructions ? `Instruksi: ${item.instructions}` : '',
                                    ].filter(Boolean).join(' · ')}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {parameterCount > 0 ? <Badge variant="outline" className="w-fit rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">{completedParameterCount}/{parameterCount} parameter</Badge> : null}
                                  {isManualItem ? <Badge variant="outline" className="w-fit rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Tambahan Unit</Badge> : null}
                                  {canManage && isManualItem ? (
                                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-none px-2 text-destructive" onClick={() => setPendingDeleteItemId(item.id)} disabled={deletingItemId === item.id}>
                                      {deletingItemId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                                      Hapus
                                    </Button>
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
                                        <th className="px-3 py-2 font-semibold text-foreground/90">Flag Otomatis</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(item.parameter_results || []).map((parameter) => {
                                        const draftParameter = draftItem?.parameters.find((draft) => draft.id === parameter.id);
                                        const parameterName = parameter.parameter_name_snapshot || parameter.medical_service_parameter?.name || '-';
                                        const referenceLabel = [parameter.normal_value_snapshot, parameter.unit_snapshot ? `(${parameter.unit_snapshot})` : ''].filter(Boolean).join(' ');
                                        const autoFlag = getLaboratoryAutoFlag(draftParameter?.result_value, parameter.normal_value_snapshot);

                                        return (
                                          <tr key={parameter.id} className="border-b border-border/60 align-top last:border-b-0">
                                            <td className="px-3 py-2">
                                              <p className="text-[13px] font-semibold leading-5 text-foreground/95">{parameterName}</p>
                                              {parameter.is_required ? <p className="text-[11px] text-muted-foreground">Wajib diisi</p> : null}
                                            </td>
                                            <td className="px-3 py-2 text-[11px] leading-5 text-muted-foreground">{referenceLabel || '-'}</td>
                                            <td className="px-3 py-2">
                                              <Input
                                                value={draftParameter?.result_value || ''}
                                                onChange={(event) => updateLaboratoryParameter(item.id, parameter.id, { result_value: event.target.value })}
                                                className="rounded-none"
                                                disabled={!canManage}
                                                placeholder="Isi hasil"
                                              />
                                            </td>
                                            <td className="px-3 py-2">
                                              <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getLaboratoryFlagBadgeClassName(autoFlag)}`}>
                                                {autoFlag || 'Belum ada hasil'}
                                              </Badge>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="grid gap-3 border-t border-border/70 px-4 py-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                                  <div className="space-y-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Hasil</p>
                                    <Input
                                      value={draftItem?.result_value || ''}
                                      onChange={(event) => updateLaboratoryItem(item.id, { result_value: event.target.value })}
                                      className="rounded-none"
                                      disabled={!canManage}
                                      placeholder="Contoh: 13.8"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Flag Otomatis</p>
                                    <div className="flex min-h-10 items-center">
                                      <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getLaboratoryFlagBadgeClassName(getLaboratoryAutoFlag(draftItem?.result_value, item.normal_value_snapshot))}`}>
                                        {getLaboratoryAutoFlag(draftItem?.result_value, item.normal_value_snapshot) || 'Belum ada hasil'}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </section>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(order.radiology_order_items || []).map((item, index) => {
                          const draftItem = radiologyItems.find((draft) => draft.id === item.id) || radiologyItems[index];
                          const parameterCount = getRadiologyOrderParameterCount(item);
                          const completedParameterCount = (draftItem?.parameters || []).filter((parameter) => parameter.result_value.trim()).length;
                          const isManualItem = isSupportingProcessAddedItem(order, 'radiology', item);

                          return (
                            <section key={item.id} className="overflow-hidden border border-border/70 bg-background">
                              <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1">
                                  <h3 className="text-[13px] font-semibold tracking-tight">{item.service_name_snapshot || item.medical_service?.name || '-'}</h3>
                                  <p className="text-[11px] leading-5 text-muted-foreground">
                                    {[
                                      parameterCount > 0 ? `${parameterCount} parameter` : '',
                                      item.instructions ? `Instruksi: ${item.instructions}` : '',
                                      item.template_snapshot ? `Template: ${item.template_snapshot}` : '',
                                    ].filter(Boolean).join(' · ')}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {parameterCount > 0 ? <Badge variant="outline" className="w-fit rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">{completedParameterCount}/{parameterCount} parameter</Badge> : null}
                                  {isManualItem ? <Badge variant="outline" className="w-fit rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Tambahan Unit</Badge> : null}
                                  {canManage && isManualItem ? (
                                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-none px-2 text-destructive" onClick={() => setPendingDeleteItemId(item.id)} disabled={deletingItemId === item.id}>
                                      {deletingItemId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                                      Hapus
                                    </Button>
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
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(item.parameter_results || []).map((parameter) => {
                                        const draftParameter = draftItem?.parameters.find((draft) => draft.id === parameter.id);
                                        const parameterName = parameter.parameter_name_snapshot || parameter.medical_service_parameter?.name || '-';
                                        const inputType = parameter.input_type_snapshot || parameter.medical_service_parameter?.input_type || 'text';

                                        return (
                                          <tr key={parameter.id} className="border-b border-border/60 align-top last:border-b-0">
                                            <td className="px-3 py-2">
                                              <p className="text-[13px] font-semibold leading-5 text-foreground/95">{parameterName}</p>
                                              {parameter.is_required ? <p className="text-[11px] text-muted-foreground">Wajib diisi</p> : null}
                                            </td>
                                            <td className="px-3 py-2 text-[11px] leading-5 text-muted-foreground">{parameter.reference_value_snapshot || '-'}</td>
                                            <td className="px-3 py-2">
                                              {inputType === 'textarea' ? (
                                                <Textarea
                                                  value={draftParameter?.result_value || ''}
                                                  onChange={(event) => updateRadiologyParameter(item.id, parameter.id, { result_value: event.target.value })}
                                                  className="min-h-[96px] rounded-none"
                                                  disabled={!canManage}
                                                  placeholder="Isi hasil parameter"
                                                />
                                              ) : (
                                                <Input
                                                  value={draftParameter?.result_value || ''}
                                                  onChange={(event) => updateRadiologyParameter(item.id, parameter.id, { result_value: event.target.value })}
                                                  className="rounded-none"
                                                  disabled={!canManage}
                                                  placeholder="Isi hasil parameter"
                                                />
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="grid gap-3 border-t border-border/70 px-4 py-4 xl:grid-cols-3">
                                  <div className="space-y-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Temuan</p>
                                    <Textarea
                                      value={draftItem?.findings || ''}
                                      onChange={(event) => updateRadiologyItem(item.id, { findings: event.target.value })}
                                      className="min-h-[96px] rounded-none"
                                      disabled={!canManage}
                                      placeholder="Temuan pemeriksaan"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Kesan</p>
                                    <Textarea
                                      value={draftItem?.impression || ''}
                                      onChange={(event) => updateRadiologyItem(item.id, { impression: event.target.value })}
                                      className="min-h-[96px] rounded-none"
                                      disabled={!canManage}
                                      placeholder="Kesan radiologi"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Rekomendasi</p>
                                    <Textarea
                                      value={draftItem?.recommendation || ''}
                                      onChange={(event) => updateRadiologyItem(item.id, { recommendation: event.target.value })}
                                      className="min-h-[96px] rounded-none"
                                      disabled={!canManage}
                                      placeholder="Saran tindak lanjut"
                                    />
                                  </div>
                                </div>
                              )}
                            </section>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </section>
            </div>

            <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-3">
              <p className="mr-auto text-xs leading-5 text-muted-foreground">
                {hasSavedResults
                  ? 'Order tidak bisa dikembalikan ke antrean karena hasil sudah pernah disimpan. Lanjutkan proses atau selesaikan order.'
                  : 'Simpan hasil bila masih bertahap. Tandai selesai hanya jika semua item pada order sudah lengkap.'}
              </p>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              {canManage ? (
                <Button type="button" variant="outline" className="rounded-none" disabled={!canReturnToOrder} onClick={() => setConfirmReturnOpen(true)}>
                  {returning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                  {returning ? 'Mengembalikan...' : 'Kembalikan ke Order'}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                disabled={!canManage || saving}
                onClick={() => {
                  if (unitType === 'laboratory') {
                    void onSaveLaboratoryResults(laboratoryItems);
                    return;
                  }

                  void onSaveRadiologyResults(radiologyItems);
                }}
              >
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Simpan Hasil
              </Button>
              <Button type="button" className="rounded-none" disabled={!canComplete} onClick={() => void onComplete()}>
                {completing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UnitIcon className="mr-1.5 h-4 w-4" />}
                Selesaikan Order
              </Button>
            </DialogFooter>

            <Dialog
              open={addItemModalOpen}
              onOpenChange={(nextOpen) => {
                if (!nextOpen && !addingItem) {
                  setSelectedServiceId('');
                  setSelectedSpecimenTemplateId('');
                  setAdditionalInstructions('');
                }
                setAddItemModalOpen(nextOpen);
              }}
            >
              <DialogContent className="flex h-[calc(100dvh-1.5rem)] max-h-[760px] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0 sm:w-[calc(100vw-1.5rem)]">
                <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(15,23,42,0.01),transparent)] px-5 py-3.5 lg:px-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center border border-border/70 bg-background">
                        <Plus className="h-5 w-5" />
                      </div>
                      <div>
                        <DialogTitle className="text-lg font-semibold tracking-tight">Tambah Tindakan {unitType === 'laboratory' ? 'Laboratorium' : 'Radiologi'}</DialogTitle>
                        <DialogDescription className="mt-1 max-w-2xl text-sm leading-5">
                          Pilih tindakan dari master yang sesuai, tambahkan instruksi bila perlu, lalu masukkan ke order aktif seperti pola tambah item di farmasi.
                        </DialogDescription>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pl-14">
                      <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                        {selectedService?.parameters?.length || 0} parameter
                      </Badge>
                      <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                        {formatSupportingCurrency(selectedService?.price || 0)}
                      </Badge>
                    </div>
                  </div>
                </DialogHeader>

                <ScrollArea className="flex-1 min-h-0">
                  <div className="px-4 py-4 lg:px-5 lg:py-5">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                      <section className="space-y-4 border border-border/70 bg-background p-4">
                        <div className="space-y-1">
                          <h3 className="text-[13px] font-semibold tracking-tight">Pilih Tindakan</h3>
                          <p className="text-[11px] leading-4 text-muted-foreground">Gunakan master tindakan yang sudah dikonfigurasi parameternya agar snapshot order tetap konsisten.</p>
                        </div>

                        <PanelField label="Tindakan" helper={loadingServiceMasters ? 'Master tindakan sedang dimuat' : 'Ketik nama tindakan untuk mencari lebih cepat'}>
                          <SearchableSelect
                            options={serviceOptions}
                            value={selectedServiceId}
                            onValueChange={setSelectedServiceId}
                            placeholder={loadingServiceMasters ? 'Memuat master tindakan...' : 'Pilih tindakan'}
                            searchPlaceholder="Cari tindakan"
                            square
                            disabled={!canManage || loadingServiceMasters}
                          />
                        </PanelField>

                        <PanelField label="Instruksi Tambahan" helper="Opsional. Digunakan bila ada arahan khusus untuk item penunjang ini.">
                          <Textarea
                            value={additionalInstructions}
                            onChange={(event) => setAdditionalInstructions(event.target.value)}
                            className="min-h-[96px] rounded-none"
                            placeholder="Contoh: fokus apikal, lakukan foto tambahan bila perlu"
                            disabled={!canManage}
                          />
                        </PanelField>

                        {unitType === 'laboratory' && selectedServiceSpecimenOptions.length > 0 ? (
                          <PanelField
                            label="Specimen"
                            helper={selectedServiceSpecimenOptions.length > 1 ? 'Pilih specimen yang sesuai bila layanan memiliki lebih dari satu opsi.' : 'Specimen default akan dipakai otomatis dari master layanan.'}
                          >
                            <SearchableSelect
                              options={selectedServiceSpecimenOptions.map((option) => ({
                                value: String(option.specimen_template_id),
                                label: `${option.specimen_template?.name || 'Template specimen'}${option.is_default ? ' · default' : ''}`,
                              }))}
                              value={selectedSpecimenTemplateId}
                              onValueChange={setSelectedSpecimenTemplateId}
                              placeholder="Pilih specimen"
                              searchPlaceholder="Cari specimen"
                              square
                              disabled={!canManage || selectedServiceSpecimenOptions.length <= 1}
                            />
                          </PanelField>
                        ) : null}
                      </section>

                      <aside className="space-y-4">
                        <section className="border border-border/70 bg-muted/10 p-4">
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ringkasan Tindakan</p>
                            <p className="text-sm font-medium text-foreground/95">{selectedService?.name || 'Belum ada tindakan dipilih'}</p>
                            <p className="text-[11px] leading-4 text-muted-foreground">{selectedService?.description || 'Pilih tindakan untuk melihat tarif dan jumlah parameter.'}</p>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                              {selectedService?.parameters?.length || 0} parameter
                            </Badge>
                            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                              {formatSupportingCurrency(selectedService?.price || 0)}
                            </Badge>
                          </div>

                          <div className="mt-4 space-y-2 text-[11px] leading-4">
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-medium text-muted-foreground">Kategori</span>
                              <span className="text-right text-foreground/90">{selectedService?.category?.name || '-'}</span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-medium text-muted-foreground">Parameter</span>
                              <span className="text-right text-foreground/90">{selectedService?.parameters?.length || 0}</span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-medium text-muted-foreground">Tarif</span>
                              <span className="text-right font-semibold text-foreground/95">{formatSupportingCurrency(selectedService?.price || 0)}</span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-medium text-muted-foreground">Specimen</span>
                              <span className="text-right text-foreground/90">{selectedSpecimenOption?.specimen_template?.name || (selectedServiceSpecimenOptions.length > 0 ? 'Pilih specimen' : '-')}</span>
                            </div>
                          </div>
                        </section>
                      </aside>
                    </div>
                  </div>
                </ScrollArea>

                <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
                  <p className="mr-auto text-xs leading-5 text-muted-foreground">Periksa tindakan yang dipilih sebelum menambahkannya ke order aktif.</p>
                  <Button type="button" variant="outline" className="rounded-none" onClick={() => setAddItemModalOpen(false)} disabled={addingItem}>
                    Batal
                  </Button>
                  <Button type="button" className="rounded-none" disabled={!canSubmitAddItem} onClick={() => void handleAddItem()}>
                    {addingItem ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                    {addingItem ? 'Menyimpan...' : `Tambah ke Order ${unitType === 'laboratory' ? 'Laboratorium' : 'Radiologi'}`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <ConfirmDialog
              open={pendingDeleteItemId !== null}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                  setPendingDeleteItemId(null);
                }
              }}
              onConfirm={() => {
                void handleConfirmDeleteItem();
              }}
              title={`Hapus ${unitType === 'laboratory' ? 'Pemeriksaan' : 'Tindakan'} Tambahan`}
              description={`Yakin hapus ${pendingDeleteItemName} dari order ${unitLabel}? Item order dokter tidak akan ikut terhapus.`}
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
              title={`Kembalikan Order ${unitType === 'laboratory' ? 'Laboratorium' : 'Radiologi'}`}
              description={`Order ${unitLabel} akan keluar dari halaman proses dan kembali ke antrean order unit. Hasil yang sudah tersimpan tetap dipertahankan.`}
              confirmText={returning ? 'Mengembalikan...' : 'Kembalikan'}
              cancelText="Batal"
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}