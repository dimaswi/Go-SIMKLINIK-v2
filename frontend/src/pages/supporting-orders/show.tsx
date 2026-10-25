import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FlaskConical,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  ScanLine,
  Trash2,
  UserRound,
} from 'lucide-react';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import {
  laboratoryApi,
  medicalRecordsApi,
  medicalServicesApi,
  radiologyApi,
  type LaboratoryOrderItem,
  type MedicalRecord,
  type MedicalService,
  type RadiologyOrderItem,
} from '@/lib/api';
import { downloadBlobResponse } from '../../lib/blob-download';
import { setPageTitle } from '@/lib/page-title';
import { getLaboratoryAutoFlag, getLaboratoryFlagBadgeClassName } from '@/lib/laboratory';
import {
  getSupportingOrderWorkflowBadgeClassName,
  getSupportingOrderWorkflowLabel,
} from '@/pages/emr/constants';
import { formatDateTime } from '@/pages/emr/utils';
import {
  formatSupportingCurrency,
  getSupportingEstimatedValue,
  getSupportingOrderedAt,
  getSupportingWorkflowStatus,
  type SupportingUnitType,
} from './utils';

export default function SupportingOrderShowPage({ unitType }: { unitType: SupportingUnitType }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();

  const isLab = unitType === 'laboratory';
  const unitTitle = isLab ? 'Laboratorium' : 'Radiologi';
  const rootPath = isLab ? '/laboratory' : '/radiology';
  const apiClient = isLab ? laboratoryApi : radiologyApi;
  const canManage = hasPermission(isLab ? 'laboratory.process' : 'radiology.process');

  const [order, setOrder] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [returning, setReturning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [serviceMasters, setServiceMasters] = useState<MedicalService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [itemInstructions, setItemInstructions] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [confirmReturnOpen, setConfirmReturnOpen] = useState(false);
  const [patientModalOpen, setPatientModalOpen] = useState(false);

  // Form states for drafts
  const [labDrafts, setLabDrafts] = useState<
    Record<number, { result_value: string; parameters: Record<number, string> }>
  >({});
  const [radDrafts, setRadDrafts] = useState<
    Record<
      number,
      { findings: string; impression: string; recommendation: string; parameters: Record<number, string> }
    >
  >({});

  const loadOrderDetail = useCallback(async () => {
    if (!id) return;
    try {
      const response = await medicalRecordsApi.getById(Number(id));
      const record = response.data.data;
      setOrder(record);

      // Initialize drafts
      if (isLab) {
        const nextLabDrafts: Record<
          number,
          { result_value: string; parameters: Record<number, string> }
        > = {};
        (record.laboratory_order_items || []).forEach((item: LaboratoryOrderItem) => {
          const paramMap: Record<number, string> = {};
          (item.parameter_results || []).forEach((p) => {
            paramMap[p.id] = p.result_value || '';
          });
          nextLabDrafts[item.id] = {
            result_value: item.result_value || '',
            parameters: paramMap,
          };
        });
        setLabDrafts(nextLabDrafts);
      } else {
        const nextRadDrafts: Record<
          number,
          { findings: string; impression: string; recommendation: string; parameters: Record<number, string> }
        > = {};
        (record.radiology_order_items || []).forEach((item: RadiologyOrderItem) => {
          const paramMap: Record<number, string> = {};
          (item.parameter_results || []).forEach((p) => {
            paramMap[p.id] = p.result_value || '';
          });
          nextRadDrafts[item.id] = {
            findings: item.findings || '',
            impression: item.impression || '',
            recommendation: item.recommendation || '',
            parameters: paramMap,
          };
        });
        setRadDrafts(nextRadDrafts);
      }
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: `Gagal memuat order ${unitTitle.toLowerCase()}`,
        description: err.response?.data?.error || 'Order tidak ditemukan atau tidak dapat diakses.',
      });
    }
  }, [id, isLab, toast, unitTitle]);

  const loadServices = useCallback(async () => {
    try {
      const response = await medicalServicesApi.getAll('is_active=1&per_page=500');
      const services = response.data.data || [];
      const filtered = services.filter((s: MedicalService) => {
        const cat = (s.category?.name || '').trim().toLowerCase();
        if (isLab) return cat === 'laboratorium' || cat === 'laboratory';
        return cat === 'radiologi' || cat === 'radiology';
      });
      setServiceMasters(filtered);
    } catch {
      // ignore
    }
  }, [isLab]);

  useEffect(() => {
    setPageTitle(`Detail Order ${unitTitle}`);

    const run = async () => {
      setLoading(true);
      await Promise.all([loadOrderDetail(), loadServices()]);
      setLoading(false);
    };

    void run();
  }, [loadOrderDetail, loadServices, unitTitle]);

  const status = order ? getSupportingWorkflowStatus(order, unitType) : 'draft';
  const isCompleted = status === 'completed';
  const isPreparing = status === 'preparing';
  const isOrdered = status === 'ordered';

  // Handle: Terima order (ordered -> preparing)
  const handleReceiveOrder = async () => {
    if (!order || !canManage) return;
    setReceiving(true);
    try {
      await apiClient.prepareOrder(order.id);
      toast({
        title: 'Order berhasil diterima',
        description: `Order ${unitTitle} sekarang dalam proses pemeriksaan.`,
      });
      await loadOrderDetail();
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menerima order',
        description: err.response?.data?.error || 'Terjadi kesalahan saat menerima order.',
      });
    } finally {
      setReceiving(false);
    }
  };

  // Handle: Simpan progres hasil pemeriksaan
  const handleSaveDrafts = async () => {
    if (!order || !canManage) return;
    setSaving(true);
    try {
      if (isLab) {
        const payload = (order.laboratory_order_items || []).map((item) => ({
          id: item.id,
          result_value: labDrafts[item.id]?.result_value ?? item.result_value ?? '',
          parameters: (item.parameter_results || []).map((p) => ({
            id: p.id,
            result_value: labDrafts[item.id]?.parameters?.[p.id] ?? p.result_value ?? '',
          })),
        }));
        await laboratoryApi.updateResults(order.id, { items: payload });
      } else {
        const payload = (order.radiology_order_items || []).map((item) => {
          const draft = radDrafts[item.id] || { findings: '', impression: '', recommendation: '', parameters: {} };
          let f = draft.findings ?? item.findings ?? '';
          let imp = draft.impression ?? item.impression ?? '';
          let rec = draft.recommendation ?? item.recommendation ?? '';

          (item.parameter_results || []).forEach((p) => {
            const code = (p.parameter_code_snapshot || p.medical_service_parameter?.code || '').toUpperCase().trim();
            const name = (p.parameter_name_snapshot || p.medical_service_parameter?.name || '').toLowerCase().trim();
            const val = draft.parameters?.[p.id] ?? p.result_value ?? '';
            if (code === 'FINDINGS' || name.includes('temuan')) {
              f = val;
            } else if (code === 'IMPRESSION' || name.includes('kesan')) {
              imp = val;
            } else if (code === 'RECOMMENDATION' || name.includes('rekomendasi') || name.includes('anjuran')) {
              rec = val;
            }
          });

          return {
            id: item.id,
            findings: f,
            impression: imp,
            recommendation: rec,
            parameters: (item.parameter_results || []).map((p) => ({
              id: p.id,
              result_value: draft.parameters?.[p.id] ?? p.result_value ?? '',
            })),
          };
        });
        await radiologyApi.updateResults(order.id, { items: payload });
      }
      toast({
        title: 'Progres hasil berhasil disimpan',
        description: 'Data hasil pemeriksaan tersimpan dan dapat dilanjutkan kapan saja.',
      });
      await loadOrderDetail();
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menyimpan hasil',
        description: err.response?.data?.error || 'Terjadi kesalahan saat menyimpan hasil.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle: Selesaikan & Finalisasi hasil order
  const handleCompleteOrder = async () => {
    if (!order || !canManage) return;
    setCompleting(true);
    try {
      // First save drafts to ensure nothing is lost
      if (isLab) {
        const payload = (order.laboratory_order_items || []).map((item) => ({
          id: item.id,
          result_value: labDrafts[item.id]?.result_value ?? item.result_value ?? '',
          parameters: (item.parameter_results || []).map((p) => ({
            id: p.id,
            result_value: labDrafts[item.id]?.parameters?.[p.id] ?? p.result_value ?? '',
          })),
        }));
        await laboratoryApi.updateResults(order.id, { items: payload });
      } else {
        const payload = (order.radiology_order_items || []).map((item) => {
          const draft = radDrafts[item.id] || { findings: '', impression: '', recommendation: '', parameters: {} };
          let f = draft.findings ?? item.findings ?? '';
          let imp = draft.impression ?? item.impression ?? '';
          let rec = draft.recommendation ?? item.recommendation ?? '';

          (item.parameter_results || []).forEach((p) => {
            const code = (p.parameter_code_snapshot || p.medical_service_parameter?.code || '').toUpperCase().trim();
            const name = (p.parameter_name_snapshot || p.medical_service_parameter?.name || '').toLowerCase().trim();
            const val = draft.parameters?.[p.id] ?? p.result_value ?? '';
            if (code === 'FINDINGS' || name.includes('temuan')) {
              f = val;
            } else if (code === 'IMPRESSION' || name.includes('kesan')) {
              imp = val;
            } else if (code === 'RECOMMENDATION' || name.includes('rekomendasi') || name.includes('anjuran')) {
              rec = val;
            }
          });

          return {
            id: item.id,
            findings: f,
            impression: imp,
            recommendation: rec,
            parameters: (item.parameter_results || []).map((p) => ({
              id: p.id,
              result_value: draft.parameters?.[p.id] ?? p.result_value ?? '',
            })),
          };
        });
        await radiologyApi.updateResults(order.id, { items: payload });
      }

      await apiClient.completeOrder(order.id);
      toast({
        title: 'Hasil berhasil difinalisasi',
        description: `Order ${unitTitle} telah selesai dan hasil tersedia untuk dokter di EMR.`,
      });
      await loadOrderDetail();
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memfinalisasi hasil',
        description: err.response?.data?.error || 'Terjadi kesalahan saat memfinalisasi hasil.',
      });
    } finally {
      setCompleting(false);
    }
  };

  // Handle: Kembalikan ke antrean order awal
  const handleReturnOrder = async () => {
    if (!order || !canManage) return;
    setReturning(true);
    try {
      await apiClient.returnOrder(order.id);
      toast({
        title: 'Order dikembalikan',
        description: `Order ${unitTitle} dikembalikan ke antrean order awal.`,
      });
      setConfirmReturnOpen(false);
      await loadOrderDetail();
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengembalikan order',
        description: err.response?.data?.error || 'Order tidak dapat dikembalikan ke antrean.',
      });
    } finally {
      setReturning(false);
    }
  };

  // Handle: Tambah item tindakan penunjang baru
  const handleAddItem = async () => {
    if (!order || !selectedServiceId) {
      toast({
        variant: 'destructive',
        title: 'Pilih pemeriksaan',
        description: 'Tentukan layanan pemeriksaan penunjang terlebih dahulu.',
      });
      return;
    }

    setAddingItem(true);
    try {
      await apiClient.addItem(order.id, {
        medical_service_id: Number(selectedServiceId),
        instructions: itemInstructions,
      });
      toast({ title: 'Pemeriksaan berhasil ditambahkan' });
      setSelectedServiceId('');
      setItemInstructions('');
      await loadOrderDetail();
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menambahkan pemeriksaan',
        description: err.response?.data?.error || 'Terjadi kesalahan saat menambah pemeriksaan.',
      });
    } finally {
      setAddingItem(false);
    }
  };

  // Handle: Hapus item tindakan penunjang
  const handleDeleteItem = async (itemId: number) => {
    if (!order) return;
    setDeleteItemId(itemId);
    try {
      await apiClient.deleteItem(order.id, itemId);
      toast({ title: 'Pemeriksaan berhasil dihapus' });
      await loadOrderDetail();
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menghapus pemeriksaan',
        description: err.response?.data?.error || 'Terjadi kesalahan saat menghapus pemeriksaan.',
      });
    } finally {
      setDeleteItemId(null);
    }
  };

  // Handle: Unduh / Cetak Hasil PDF
  const handleDownloadResult = async () => {
    if (!order) return;
    setDownloading(true);
    try {
      const response = isLab
        ? await medicalRecordsApi.printLaboratoryOrderResult(order.id)
        : await medicalRecordsApi.printRadiologyOrderResult(order.id);
      downloadBlobResponse(response, `hasil-${unitTitle.toLowerCase()}-${order.id}.pdf`);
    } catch (error) {
      const err = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengunduh dokumen',
        description: err.response?.data?.error || 'Dokumen hasil belum siap untuk diunduh.',
      });
    } finally {
      setDownloading(false);
    }
  };

  const serviceOptions = useMemo(() => {
    return serviceMasters.map((s) => ({
      value: String(s.id),
      label: `${s.name} - ${formatSupportingCurrency(s.price || 0)}`,
    }));
  }, [serviceMasters]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Order {unitTitle.toLowerCase()} tidak ditemukan.</p>
        <Button variant="outline" className="mt-4 rounded-none" onClick={() => navigate(rootPath)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke {unitTitle}
        </Button>
      </div>
    );
  }

  const labItems: LaboratoryOrderItem[] = order.laboratory_order_items || [];
  const radItems: RadiologyOrderItem[] = order.radiology_order_items || [];
  const estimatedTotal = getSupportingEstimatedValue(order, unitType);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 p-4 md:p-6 pb-6">
        {/* Single Unified Card */}
        <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={() => navigate(rootPath)}
              title={`Kembali ke ${unitTitle}`}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20 shrink-0">
              {isLab ? <FlaskConical className="h-5 w-5 text-primary" /> : <ScanLine className="h-5 w-5 text-primary" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold text-foreground truncate">
                  {order.patient?.full_name || 'Pasien'}
                </h1>
                <Badge variant="outline" className="rounded-none font-mono text-xs shadow-none">
                  RM: {order.patient?.medical_record_number || '-'}
                </Badge>
                <Badge variant="outline" className="rounded-none text-xs shadow-none">
                  #{order.visit?.visit_number || '-'}
                </Badge>
                <Badge
                  variant="outline"
                  className={`rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${getSupportingOrderWorkflowBadgeClassName(status)}`}
                >
                  {getSupportingOrderWorkflowLabel(status)}
                </Badge>
                <Badge variant="outline" className="rounded-none font-mono text-xs shadow-none border-primary/30 text-primary">
                  {formatSupportingCurrency(estimatedTotal)}
                </Badge>
                <Badge variant="outline" className="rounded-none text-xs shadow-none hidden sm:inline-flex">
                  {isLab ? labItems.length : radItems.length} pemeriksaan
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{order.polyclinic?.name || '-'}</span>
                <span>•</span>
                <span>dr. {order.doctor?.full_name || '-'}</span>
                <span>•</span>
                <span>{formatDateTime(getSupportingOrderedAt(order, unitType))}</span>
                <span>•</span>
                <span className="uppercase">{order.visit?.payment_type || 'UMUM'}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Modal Detail Pasien & Kunjungan */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={() => setPatientModalOpen(true)}
              title="Informasi Pasien & Kunjungan"
            >
              <UserRound className="h-4 w-4 text-primary" />
            </Button>

            {/* Terima Order (if ordered) */}
            {isOrdered && canManage && (
              <Button
                type="button"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={() => void handleReceiveOrder()}
                disabled={receiving}
                title="Terima Order"
              >
                {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              </Button>
            )}

            {/* Simpan Progres Hasil (if preparing) */}
            {isPreparing && canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={() => void handleSaveDrafts()}
                disabled={saving || completing}
                title="Simpan Progres Hasil"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            )}

            {/* Selesaikan & Finalisasi Hasil (if preparing) */}
            {isPreparing && canManage && (
              <Button
                type="button"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => void handleCompleteOrder()}
                disabled={saving || completing}
                title="Finalisasi & Selesai"
              >
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              </Button>
            )}

            {/* Kembalikan ke Antrean (if preparing) */}
            {isPreparing && canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0 text-amber-700 hover:text-amber-800"
                onClick={() => setConfirmReturnOpen(true)}
                disabled={returning}
                title="Kembalikan ke Antrean"
              >
                {returning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Cetak PDF */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={() => void handleDownloadResult()}
              disabled={downloading}
              title="Cetak Hasil PDF"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Laboratory Items & Result Inputs directly inside this single card */}
        {isLab && (
          <div>
            {labItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Belum ada item pemeriksaan laboratorium dalam order ini.
              </div>
            ) : (
              labItems.map((item, idx) => {
                const draft = labDrafts[item.id] || { result_value: '', parameters: {} };
                const isDeleting = deleteItemId === item.id;
                const hasParams = (item.parameter_results || []).length > 0;

                return (
                  <div key={item.id} className={idx > 0 ? 'border-t border-border' : ''}>
                    <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FlaskConical className="h-3.5 w-3.5 text-primary" />
                        <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                          {item.test_name_snapshot || item.medical_service?.name || item.lab_test?.name || 'Pemeriksaan Lab'}
                        </h3>
                        {item.instructions && (
                          <span className="text-[11px] text-muted-foreground font-normal">
                            · Instruksi: {item.instructions}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isPreparing && canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-none shadow-none"
                            onClick={() => void handleDeleteItem(item.id)}
                            disabled={isDeleting}
                            title="Hapus pemeriksaan"
                          >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </div>

                    {hasParams ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="py-2.5 px-4 font-semibold">Parameter</th>
                              <th className="py-2.5 px-3 font-semibold">Nilai Rujukan</th>
                              <th className="py-2.5 px-3 font-semibold">Satuan</th>
                              <th className="py-2.5 px-3 font-semibold w-56">Hasil</th>
                              <th className="py-2.5 px-3 font-semibold text-center w-28">Status Flag</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(item.parameter_results || []).map((param) => {
                              const currentVal = draft.parameters[param.id] ?? param.result_value ?? '';
                              const autoFlag = getLaboratoryAutoFlag(currentVal, param.normal_value_snapshot);

                              return (
                                <tr key={param.id} className="hover:bg-muted/10 transition-colors">
                                  <td className="py-2.5 px-4 font-medium text-foreground">
                                    {param.parameter_name_snapshot || 'Parameter'}
                                  </td>
                                  <td className="py-2.5 px-3 text-muted-foreground">
                                    {param.normal_value_snapshot || '-'}
                                  </td>
                                  <td className="py-2.5 px-3 text-muted-foreground">
                                    {param.unit_snapshot || '-'}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {isCompleted ? (
                                      <span className="font-mono font-medium text-foreground">{currentVal || '-'}</span>
                                    ) : (
                                      <Input
                                        value={currentVal}
                                        onChange={(e) => {
                                          const nextVal = e.target.value;
                                          setLabDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: {
                                              ...prev[item.id],
                                              parameters: {
                                                ...(prev[item.id]?.parameters || {}),
                                                [param.id]: nextVal,
                                              },
                                            },
                                          }));
                                        }}
                                        placeholder="Masukkan hasil..."
                                        className="h-8 rounded-none text-xs focus:ring-inset font-mono"
                                        disabled={!canManage}
                                      />
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <Badge
                                      variant="outline"
                                      className={`rounded-none px-2 py-0.5 text-[10px] uppercase tracking-wider ${getLaboratoryFlagBadgeClassName(autoFlag)}`}
                                    >
                                      {autoFlag}
                                    </Badge>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-4">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Hasil Pemeriksaan
                        </label>
                        {isCompleted ? (
                          <p className="mt-1 font-mono text-sm text-foreground">{draft.result_value || '-'}</p>
                        ) : (
                          <Textarea
                            value={draft.result_value}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setLabDrafts((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  result_value: nextVal,
                                },
                              }));
                            }}
                            placeholder="Masukkan hasil pemeriksaan laboratorium..."
                            className="mt-1 rounded-none text-xs focus:ring-inset min-h-[70px]"
                            disabled={!canManage}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Radiology Items & Expertise Inputs directly inside this single card */}
        {!isLab && (
          <div>
            {radItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Belum ada item pemeriksaan radiologi dalam order ini.
              </div>
            ) : (
              radItems.map((item, idx) => {
                const draft = radDrafts[item.id] || { findings: '', impression: '', recommendation: '', parameters: {} };
                const isDeleting = deleteItemId === item.id;
                const params = item.parameter_results || [];
                const hasParams = params.length > 0;

                return (
                  <div key={item.id} className={idx > 0 ? 'border-t border-border' : ''}>
                    <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <ScanLine className="h-3.5 w-3.5 text-primary" />
                        <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                          {item.service_name_snapshot || item.medical_service?.name || 'Pemeriksaan Radiologi'}
                        </h3>
                        {item.instructions && (
                          <span className="text-[11px] text-muted-foreground font-normal">
                            · Instruksi: {item.instructions}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isPreparing && canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-none shadow-none"
                            onClick={() => void handleDeleteItem(item.id)}
                            disabled={isDeleting}
                            title="Hapus pemeriksaan"
                          >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Parameter table - all inputs derived from medical service parameters */}
                    {hasParams ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="py-2.5 px-4 font-semibold">Parameter</th>
                              <th className="py-2.5 px-3 font-semibold">Nilai Rujukan</th>
                              <th className="py-2.5 px-3 font-semibold">Satuan</th>
                              <th className="py-2.5 px-3 font-semibold">Hasil / Nilai</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {params.map((param) => {
                              const currentVal = draft.parameters[param.id] ?? param.result_value ?? '';
                              const isTextarea = (param.input_type_snapshot || '').toLowerCase() === 'textarea';

                              return (
                                <tr key={param.id} className="hover:bg-muted/10 transition-colors">
                                  <td className="py-2.5 px-4 font-medium text-foreground align-top">
                                    {param.parameter_name_snapshot || 'Parameter'}
                                    {param.is_required && <span className="text-destructive ml-1">*</span>}
                                  </td>
                                  <td className="py-2.5 px-3 text-muted-foreground align-top">
                                    {param.reference_value_snapshot || '-'}
                                  </td>
                                  <td className="py-2.5 px-3 text-muted-foreground align-top">
                                    {param.unit_snapshot || '-'}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {isCompleted ? (
                                      <div className="whitespace-pre-wrap font-mono font-medium text-foreground">
                                        {currentVal || '-'}
                                      </div>
                                    ) : isTextarea ? (
                                      <Textarea
                                        value={currentVal}
                                        onChange={(e) => {
                                          const nextVal = e.target.value;
                                          setRadDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: {
                                              ...prev[item.id],
                                              parameters: {
                                                ...(prev[item.id]?.parameters || {}),
                                                [param.id]: nextVal,
                                              },
                                            },
                                          }));
                                        }}
                                        placeholder={`Masukkan ${param.parameter_name_snapshot || 'hasil'}...`}
                                        className="rounded-none text-xs focus:ring-inset min-h-[60px]"
                                        disabled={!canManage}
                                      />
                                    ) : (
                                      <Input
                                        value={currentVal}
                                        onChange={(e) => {
                                          const nextVal = e.target.value;
                                          setRadDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: {
                                              ...prev[item.id],
                                              parameters: {
                                                ...(prev[item.id]?.parameters || {}),
                                                [param.id]: nextVal,
                                              },
                                            },
                                          }));
                                        }}
                                        placeholder="Masukkan hasil..."
                                        className="h-8 rounded-none text-xs focus:ring-inset font-mono"
                                        disabled={!canManage}
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
                      <div className="p-4 text-xs">
                        <label className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Hasil Pemeriksaan
                        </label>
                        {isCompleted ? (
                          <p className="mt-1 whitespace-pre-wrap text-foreground bg-muted/10 p-2.5 border border-border">
                            {draft.findings || draft.impression || '-'}
                          </p>
                        ) : (
                          <Textarea
                            value={draft.findings || draft.impression || ''}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setRadDrafts((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  findings: nextVal,
                                  impression: nextVal,
                                },
                              }));
                            }}
                            placeholder="Masukkan hasil pemeriksaan radiologi..."
                            className="mt-1 rounded-none text-xs focus:ring-inset min-h-[70px]"
                            disabled={!canManage}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Add Item Panel (only if preparing) directly inside this single card */}
        {isPreparing && canManage && (
          <div className="border-t border-border p-4 bg-muted/5 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Tambah Tindakan / Pemeriksaan Tambahan
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-medium text-foreground">Pilih Tindakan {unitTitle}</label>
                <SearchableSelect
                  options={serviceOptions}
                  value={selectedServiceId}
                  onValueChange={setSelectedServiceId}
                  placeholder={`Pilih pemeriksaan ${unitTitle.toLowerCase()}...`}
                  className="h-9 w-full rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
              <div>
                <label className="font-medium text-foreground">Instruksi Khusus (Opsional)</label>
                <Input
                  value={itemInstructions}
                  onChange={(e) => setItemInstructions(e.target.value)}
                  placeholder="Misal: Puasa 8 jam / Kontras..."
                  className="h-9 rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-none text-xs shadow-none"
                onClick={() => void handleAddItem()}
                disabled={addingItem || !selectedServiceId}
              >
                {addingItem ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                Tambahkan ke Order
              </Button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 z-30 mt-auto border-t border-border/70 bg-card/95 px-4 py-2.5 backdrop-blur sm:px-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>{isLab ? labItems.length : radItems.length} pemeriksaan</span>
            <span>•</span>
            <span className="font-mono font-medium text-foreground">{formatSupportingCurrency(estimatedTotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Terima Order */}
            {isOrdered && canManage && (
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-none text-xs shadow-none"
                onClick={() => void handleReceiveOrder()}
                disabled={receiving}
              >
                {receiving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Terima Order
              </Button>
            )}

            {/* Preparing actions */}
            {isPreparing && canManage && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none text-xs shadow-none text-amber-700 hover:text-amber-800"
                  onClick={() => setConfirmReturnOpen(true)}
                  disabled={returning}
                >
                  {returning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                  Kembalikan ke Antrean
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none text-xs shadow-none"
                  onClick={() => void handleSaveDrafts()}
                  disabled={saving || completing}
                >
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Simpan Progres
                </Button>

                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-none text-xs shadow-none bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => void handleCompleteOrder()}
                  disabled={saving || completing}
                >
                  {completing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  Finalisasi & Selesai
                </Button>
              </>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none text-xs shadow-none"
              onClick={() => void handleDownloadResult()}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              Cetak PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Patient & Visit Detail Dialog */}
      <Dialog open={patientModalOpen} onOpenChange={setPatientModalOpen}>
        <DialogContent className="max-w-xl rounded-none border-border/70 p-6">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center border border-border bg-muted/20 shrink-0">
                <UserRound className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Informasi Pasien & Kunjungan
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Ringkasan data identitas pasien dan konteks kunjungan order {unitTitle.toLowerCase()}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="border border-border bg-card p-3 space-y-2">
              <h4 className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground">
                Data Identitas Pasien
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Nama Pasien:</span>
                  <p className="font-medium text-foreground">{order.patient?.full_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">No. Rekam Medis:</span>
                  <p className="font-mono font-medium text-foreground">{order.patient?.medical_record_number || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Jenis Kelamin:</span>
                  <p className="text-foreground">{order.patient?.gender === 'L' ? 'Laki-laki' : order.patient?.gender === 'P' ? 'Perempuan' : '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">NIK / Identitas:</span>
                  <p className="font-mono text-foreground">{order.patient?.nik || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">No. Telepon:</span>
                  <p className="text-foreground">{order.patient?.phone || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Alamat:</span>
                  <p className="text-foreground truncate">{order.patient?.address || '-'}</p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-3 space-y-2">
              <h4 className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground">
                Konteks Kunjungan & Order
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">No. Kunjungan:</span>
                  <p className="font-mono font-medium text-foreground">{order.visit?.visit_number || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Poliklinik:</span>
                  <p className="font-medium text-foreground">{order.polyclinic?.name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Dokter Pengirim:</span>
                  <p className="font-medium text-foreground">{order.doctor?.full_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tanggal Order:</span>
                  <p className="text-foreground">{formatDateTime(getSupportingOrderedAt(order, unitType))}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Penjamin / Pembayaran:</span>
                  <p className="uppercase text-foreground">{order.visit?.payment_type || 'UMUM'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Estimasi Biaya:</span>
                  <p className="font-mono font-bold text-primary">{formatSupportingCurrency(estimatedTotal)}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none text-xs"
              onClick={() => setPatientModalOpen(false)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Return Order Dialog */}
      <ConfirmDialog
        open={confirmReturnOpen}
        onOpenChange={setConfirmReturnOpen}
        title={`Kembalikan Order ${unitTitle} ke Antrean?`}
        description="Order akan dikembalikan ke status antrean order awal dan dokter dapat mengubah jenis pemeriksaan bila diperlukan."
        onConfirm={() => void handleReturnOrder()}
        confirmText="Ya, Kembalikan"
        cancelText="Batal"
      />
    </div>
  );
}
