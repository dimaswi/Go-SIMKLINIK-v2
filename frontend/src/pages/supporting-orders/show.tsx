import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  Hospital,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Stethoscope,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
        const payload = (order.radiology_order_items || []).map((item) => ({
          id: item.id,
          findings: radDrafts[item.id]?.findings ?? item.findings ?? '',
          impression: radDrafts[item.id]?.impression ?? item.impression ?? '',
          recommendation: radDrafts[item.id]?.recommendation ?? item.recommendation ?? '',
          parameters: (item.parameter_results || []).map((p) => ({
            id: p.id,
            result_value: radDrafts[item.id]?.parameters?.[p.id] ?? p.result_value ?? '',
          })),
        }));
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
        const payload = (order.radiology_order_items || []).map((item) => ({
          id: item.id,
          findings: radDrafts[item.id]?.findings ?? item.findings ?? '',
          impression: radDrafts[item.id]?.impression ?? item.impression ?? '',
          recommendation: radDrafts[item.id]?.recommendation ?? item.recommendation ?? '',
          parameters: (item.parameter_results || []).map((p) => ({
            id: p.id,
            result_value: radDrafts[item.id]?.parameters?.[p.id] ?? p.result_value ?? '',
          })),
        }));
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
    <div className="flex flex-col gap-6 p-6">
      {/* Top Header Card */}
      <div className="border border-border bg-card p-4 shadow-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-none shadow-none"
              onClick={() => navigate(rootPath)}
              title={`Kembali ke ${unitTitle}`}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-foreground">
                  Order {unitTitle}: {order.patient?.full_name || 'Pasien'}
                </h1>
                <Badge
                  variant="outline"
                  className={`rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${getSupportingOrderWorkflowBadgeClassName(status)}`}
                >
                  {getSupportingOrderWorkflowLabel(status)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                No. RM: {order.patient?.medical_record_number || '-'} · Kunjungan: {order.visit?.visit_number || '-'} · Tanggal:{' '}
                {formatDateTime(getSupportingOrderedAt(order, unitType))}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Terima Order (if ordered) */}
            {isOrdered && canManage && (
              <Button
                type="button"
                className="h-9 rounded-none text-xs shadow-none"
                onClick={() => void handleReceiveOrder()}
                disabled={receiving}
              >
                {receiving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Terima Order
              </Button>
            )}

            {/* Simpan Progres Hasil (if preparing) */}
            {isPreparing && canManage && (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-none text-xs shadow-none"
                onClick={() => void handleSaveDrafts()}
                disabled={saving || completing}
              >
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Simpan Progres
              </Button>
            )}

            {/* Selesaikan & Finalisasi Hasil (if preparing) */}
            {isPreparing && canManage && (
              <Button
                type="button"
                className="h-9 rounded-none text-xs shadow-none bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => void handleCompleteOrder()}
                disabled={saving || completing}
              >
                {completing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Finalisasi & Selesai
              </Button>
            )}

            {/* Kembalikan ke Antrean (if preparing) */}
            {isPreparing && canManage && (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-none text-xs shadow-none text-amber-700 hover:text-amber-800"
                onClick={() => setConfirmReturnOpen(true)}
                disabled={returning}
              >
                {returning ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Kembalikan ke Antrean
              </Button>
            )}

            {/* Cetak PDF (always available if completed or ordered) */}
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-none text-xs shadow-none"
              onClick={() => void handleDownloadResult()}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              Cetak Hasil PDF
            </Button>

            {/* Link to EMR */}
            {order.visit_id && (
              <Button asChild variant="ghost" className="h-9 rounded-none text-xs">
                <Link to={`/emr/${order.visit_id}`}>Buka EMR</Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols wide) - Patient Info & Result Input Items */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Patient and Visit Details */}
          <div className="border border-border bg-card p-4 shadow-none">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Informasi Pasien & Kunjungan
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <UserRound className="h-3.5 w-3.5" /> Nama Pasien
                </p>
                <p className="mt-0.5 font-medium text-foreground">{order.patient?.full_name || '-'}</p>
                <p className="text-[11px] text-muted-foreground">{order.patient?.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
              </div>
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Hospital className="h-3.5 w-3.5" /> Poliklinik
                </p>
                <p className="mt-0.5 font-medium text-foreground">{order.polyclinic?.name || '-'}</p>
                <p className="text-[11px] text-muted-foreground">Antrean: {order.visit?.visit_number || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Stethoscope className="h-3.5 w-3.5" /> Dokter Pengirim
                </p>
                <p className="mt-0.5 font-medium text-foreground">{order.doctor?.full_name || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Tanggal Order
                </p>
                <p className="mt-0.5 font-medium text-foreground">
                  {formatDateTime(getSupportingOrderedAt(order, unitType))}
                </p>
              </div>
            </div>
          </div>

          {/* Laboratory Items & Result Inputs */}
          {isLab && (
            <div className="flex flex-col gap-4">
              {labItems.length === 0 ? (
                <div className="border border-border bg-card p-8 text-center text-xs text-muted-foreground shadow-none">
                  Belum ada item pemeriksaan laboratorium dalam order ini.
                </div>
              ) : (
                labItems.map((item) => {
                  const draft = labDrafts[item.id] || { result_value: '', parameters: {} };
                  const isDeleting = deleteItemId === item.id;
                  const hasParams = (item.parameter_results || []).length > 0;

                  return (
                    <div key={item.id} className="border border-border bg-card shadow-none">
                      <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
                        <div>
                          <h3 className="font-semibold text-sm text-foreground">
                            {item.test_name_snapshot || item.medical_service?.name || item.lab_test?.name || 'Pemeriksaan Lab'}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.normal_value_snapshot ? `Nilai Rujukan: ${item.normal_value_snapshot}` : 'Standar Laboratorium'}
                            {item.instructions ? ` · Instruksi: ${item.instructions}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {isPreparing && canManage && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 rounded-none"
                              onClick={() => void handleDeleteItem(item.id)}
                              disabled={isDeleting}
                              title="Hapus pemeriksaan"
                            >
                              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="p-4 space-y-4">
                        {hasParams ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                                <tr>
                                  <th className="py-2 px-3 font-semibold">Parameter</th>
                                  <th className="py-2 px-3 font-semibold">Nilai Rujukan</th>
                                  <th className="py-2 px-3 font-semibold">Satuan</th>
                                  <th className="py-2 px-3 font-semibold w-48">Hasil</th>
                                  <th className="py-2 px-3 font-semibold text-center">Status Flag</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {(item.parameter_results || []).map((param) => {
                                  const currentVal = draft.parameters[param.id] ?? param.result_value ?? '';
                                  const autoFlag = getLaboratoryAutoFlag(currentVal, param.normal_value_snapshot);

                                  return (
                                    <tr key={param.id}>
                                      <td className="py-2.5 px-3 font-medium text-foreground">
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
                          <div>
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
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Radiology Items & Expertise Inputs */}
          {!isLab && (
            <div className="flex flex-col gap-4">
              {radItems.length === 0 ? (
                <div className="border border-border bg-card p-8 text-center text-xs text-muted-foreground shadow-none">
                  Belum ada item pemeriksaan radiologi dalam order ini.
                </div>
              ) : (
                radItems.map((item) => {
                  const draft = radDrafts[item.id] || { findings: '', impression: '', recommendation: '', parameters: {} };
                  const isDeleting = deleteItemId === item.id;

                  return (
                    <div key={item.id} className="border border-border bg-card shadow-none">
                      <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
                        <div>
                          <h3 className="font-semibold text-sm text-foreground">
                            {item.service_name_snapshot || item.medical_service?.name || 'Pemeriksaan Radiologi'}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.template_snapshot || 'Standar Foto Radiologi'}
                            {item.instructions ? ` · Instruksi: ${item.instructions}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {isPreparing && canManage && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 rounded-none"
                              onClick={() => void handleDeleteItem(item.id)}
                              disabled={isDeleting}
                              title="Hapus pemeriksaan"
                            >
                              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="p-4 space-y-4 text-xs">
                        {/* Temuan (Findings) */}
                        <div>
                          <label className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Temuan (Findings)
                          </label>
                          {isCompleted ? (
                            <p className="mt-1 whitespace-pre-wrap text-foreground bg-muted/10 p-2.5 border border-border">
                              {draft.findings || '-'}
                            </p>
                          ) : (
                            <Textarea
                              value={draft.findings}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setRadDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    findings: nextVal,
                                  },
                                }));
                              }}
                              placeholder="Deskripsi temuan radiologis..."
                              className="mt-1 rounded-none text-xs focus:ring-inset min-h-[80px]"
                              disabled={!canManage}
                            />
                          )}
                        </div>

                        {/* Kesan (Impression) */}
                        <div>
                          <label className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Kesan (Impression)
                          </label>
                          {isCompleted ? (
                            <p className="mt-1 whitespace-pre-wrap text-foreground bg-muted/10 p-2.5 border border-border">
                              {draft.impression || '-'}
                            </p>
                          ) : (
                            <Textarea
                              value={draft.impression}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setRadDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    impression: nextVal,
                                  },
                                }));
                              }}
                              placeholder="Kesimpulan radiologis..."
                              className="mt-1 rounded-none text-xs focus:ring-inset min-h-[60px]"
                              disabled={!canManage}
                            />
                          )}
                        </div>

                        {/* Rekomendasi (Recommendation) */}
                        <div>
                          <label className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Anjuran / Saran (Recommendation)
                          </label>
                          {isCompleted ? (
                            <p className="mt-1 whitespace-pre-wrap text-foreground bg-muted/10 p-2.5 border border-border">
                              {draft.recommendation || '-'}
                            </p>
                          ) : (
                            <Textarea
                              value={draft.recommendation}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setRadDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    recommendation: nextVal,
                                  },
                                }));
                              }}
                              placeholder="Anjuran pemeriksaan lanjutan atau tindakan klinis..."
                              className="mt-1 rounded-none text-xs focus:ring-inset min-h-[50px]"
                              disabled={!canManage}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Add Item Panel (only if preparing) */}
          {isPreparing && canManage && (
            <div className="border border-border bg-card p-4 shadow-none space-y-3">
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

        {/* Right Column (1 Col wide: Status & Summary) */}
        <div className="flex flex-col gap-6">
          {/* Card: Status & Total Biaya */}
          <div className="border border-border bg-card p-4 shadow-none">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ringkasan Order {unitTitle}
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Status Pemeriksaan:</span>
                <Badge
                  variant="outline"
                  className={`rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${getSupportingOrderWorkflowBadgeClassName(status)}`}
                >
                  {getSupportingOrderWorkflowLabel(status)}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Jumlah Pemeriksaan:</span>
                <span className="font-semibold text-foreground">
                  {isLab ? labItems.length : radItems.length} item
                </span>
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Estimasi Biaya:</span>
                  <span className="font-mono text-base font-bold text-primary">
                    {formatSupportingCurrency(estimatedTotal)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Biaya tindakan penunjang akan otomatis terakumulasi ke tagihan kasir kunjungan.
                </p>
              </div>
            </div>
          </div>

          {/* Workflow Guide */}
          <div className="border border-border bg-card p-4 shadow-none text-xs text-muted-foreground space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Alur Kerja {unitTitle}
            </h2>
            <p>1. <strong>Menunggu Terima:</strong> Dokter telah membuat order dari EMR. Petugas {unitTitle.toLowerCase()} menekan &ldquo;Terima Order&rdquo;.</p>
            <p>2. <strong>Sedang Diproses:</strong> Lakukan tindakan/pengambilan sampel, input nilai parameter hasil atau ekspertise, dan klik &ldquo;Simpan Progres&rdquo; bila bertahap.</p>
            <p>3. <strong>Finalisasi & Selesai:</strong> Setelah seluruh hasil lengkap dan diverifikasi, klik &ldquo;Finalisasi & Selesai&rdquo;. Hasil langsung sinkron ke EMR dokter.</p>
          </div>
        </div>
      </div>

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
