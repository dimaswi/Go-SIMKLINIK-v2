import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FlaskConical,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SatusehatResultDialog } from '@/components/satusehat-result-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { downloadBlobResponse } from '../../lib/blob-download';
import { laboratoryApi, medicalRecordsApi, medicalServicesApi, radiologyApi, satusehatApi, type MedicalRecord, type MedicalService, type SatusehatResourceKey } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { getSupportingOrderWorkflowBadgeClassName, getSupportingOrderWorkflowLabel } from '@/pages/emr/constants';
import { formatDateTime } from '@/pages/emr/utils';
import { SupportingOrderDetailDialog } from './components/order-detail-dialog';
import { SupportingProcessOrderDialog } from './components/process-order-dialog';
import { SupportingOrderStatCard } from './components/stat-card';
import {
  filterSupportingOrders,
  formatSupportingCurrency,
  getSupportingCompletedItemCount,
  getSupportingEstimatedValue,
  getSupportingItemCount,
  getSupportingOrderedAt,
  hasSupportingSavedResults,
  getSupportingPolyclinicOptions,
  getSupportingPrimaryLine,
  getSupportingWorkflowStatus,
  type SupportingUnitType,
} from './utils';

type SupportingPageMode = 'summary' | 'receive' | 'process' | 'completed';

type SatusehatResultState = {
  title: string;
  description?: string;
  payload: unknown;
};

const UNIT_CONFIG = {
  laboratory: {
    title: 'Laboratorium',
    label: 'laboratorium',
    rootPath: '/laboratory',
    summaryTitle: 'Ringkasan Laboratorium',
    detailTitle: 'Detail Order Laboratorium',
    processTitle: 'Input Hasil Laboratorium',
    viewPermission: 'laboratory.view',
    processPermission: 'laboratory.process',
    queryKey: 'laboratory_workflow_status',
    icon: FlaskConical,
    workflowCards: [
      {
        title: 'Terima Order',
        description: 'Ambil order laboratorium baru dari EMR, verifikasi konteks klinis, lalu pindahkan ke tahap proses unit.',
        href: '/laboratory/receive',
        status: 'ordered',
      },
      {
        title: 'Proses Hasil',
        description: 'Isi hasil pemeriksaan laboratorium, tambah tindakan bila diperlukan, lalu simpan progres pengerjaan.',
        href: '/laboratory/process',
        status: 'preparing',
      },
      {
        title: 'Hasil Selesai',
        description: 'Lihat order laboratorium yang sudah selesai diproses untuk monitoring dan audit cepat.',
        href: '/laboratory/completed',
        status: 'completed',
      },
    ],
  },
  radiology: {
    title: 'Radiologi',
    label: 'radiologi',
    rootPath: '/radiology',
    summaryTitle: 'Ringkasan Radiologi',
    detailTitle: 'Detail Order Radiologi',
    processTitle: 'Input Hasil Radiologi',
    viewPermission: 'radiology.view',
    processPermission: 'radiology.process',
    queryKey: 'radiology_workflow_status',
    icon: ScanLine,
    workflowCards: [
      {
        title: 'Terima Order',
        description: 'Ambil order radiologi baru dari EMR, cek kebutuhan klinis, lalu teruskan ke tahap proses unit.',
        href: '/radiology/receive',
        status: 'ordered',
      },
      {
        title: 'Proses Hasil',
        description: 'Lengkapi temuan, kesan, dan rekomendasi radiologi sebelum hasil dikembalikan ke EMR.',
        href: '/radiology/process',
        status: 'preparing',
      },
      {
        title: 'Hasil Selesai',
        description: 'Lihat seluruh order radiologi yang sudah selesai diproses untuk kebutuhan tindak lanjut dan audit.',
        href: '/radiology/completed',
        status: 'completed',
      },
    ],
  },
} as const;

function getPageMeta(unitType: SupportingUnitType, mode: SupportingPageMode) {
  const unit = UNIT_CONFIG[unitType];

  switch (mode) {
    case 'receive':
      return {
        title: `${unit.title} - Terima Order`,
        loadErrorTitle: `Gagal memuat antrean ${unit.label} masuk`,
        refreshErrorTitle: `Gagal memuat ulang antrean ${unit.label}`,
      };
    case 'process':
      return {
        title: `${unit.title} - Proses Hasil`,
        loadErrorTitle: `Gagal memuat order ${unit.label} yang sedang diproses`,
        refreshErrorTitle: `Gagal memuat ulang antrean proses ${unit.label}`,
      };
    case 'completed':
      return {
        title: `${unit.title} - Hasil Selesai`,
        loadErrorTitle: `Gagal memuat order ${unit.label} selesai`,
        refreshErrorTitle: `Gagal memuat ulang order ${unit.label} selesai`,
      };
    default:
      return {
        title: unit.summaryTitle,
        loadErrorTitle: `Gagal memuat ringkasan ${unit.label}`,
        refreshErrorTitle: `Gagal memuat ulang ringkasan ${unit.label}`,
      };
  }
}

export default function SupportingOrdersPage({
  unitType,
  mode,
}: {
  unitType: SupportingUnitType;
  mode: SupportingPageMode;
}) {
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const unit = UNIT_CONFIG[unitType];
  const pageMeta = getPageMeta(unitType, mode);
  const apiClient = unitType === 'laboratory' ? laboratoryApi : radiologyApi;
  const canManage = hasPermission(unit.processPermission);

  const [orders, setOrders] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [polyclinicFilter, setPolyclinicFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<MedicalRecord | null>(null);
  const [processOrder, setProcessOrder] = useState<MedicalRecord | null>(null);
  const [pendingReturnOrder, setPendingReturnOrder] = useState<MedicalRecord | null>(null);
  const [serviceMasters, setServiceMasters] = useState<MedicalService[]>([]);
  const [preparingRecordId, setPreparingRecordId] = useState<number | null>(null);
  const [savingResultRecordId, setSavingResultRecordId] = useState<number | null>(null);
  const [completingRecordId, setCompletingRecordId] = useState<number | null>(null);
  const [returningRecordId, setReturningRecordId] = useState<number | null>(null);
  const [loadingServiceMasters, setLoadingServiceMasters] = useState(false);
  const [addingItemRecordId, setAddingItemRecordId] = useState<number | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [downloadingResultRecordId, setDownloadingResultRecordId] = useState<number | null>(null);
  const [previewingSatusehatItemId, setPreviewingSatusehatItemId] = useState<number | null>(null);
  const [syncingSatusehatItemId, setSyncingSatusehatItemId] = useState<number | null>(null);
  const [satusehatResult, setSatusehatResult] = useState<SatusehatResultState | null>(null);

  const loadOrders = useCallback(async () => {
    const params = new URLSearchParams({ per_page: '200' });
    if (mode === 'receive') {
      params.set(unit.queryKey, 'ordered');
    }
    if (mode === 'process') {
      params.set(unit.queryKey, 'preparing');
    }
    if (mode === 'completed') {
      params.set(unit.queryKey, 'completed');
    }

    const response = await apiClient.getOrders(params.toString());
    const nextOrders = response.data.data || [];
    setOrders(nextOrders);
    return nextOrders;
  }, [apiClient, mode, unit.queryKey]);

  useEffect(() => {
    setPageTitle(pageMeta.title);

    const run = async () => {
      setLoading(true);
      try {
        await loadOrders();
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: pageMeta.loadErrorTitle,
          description: requestError.response?.data?.error || `Terjadi kesalahan saat memuat modul ${unit.label}.`,
        });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [loadOrders, pageMeta.loadErrorTitle, pageMeta.title, toast, unit.label]);

  useEffect(() => {
    if (mode !== 'process') return;

    const run = async () => {
      setLoadingServiceMasters(true);
      try {
        const response = await medicalServicesApi.getAll('is_active=true');
        setServiceMasters(response.data.data || []);
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: `Gagal memuat master ${unit.label}`,
          description: requestError.response?.data?.error || `Terjadi kesalahan saat memuat master tindakan untuk ${unit.label}.`,
        });
      } finally {
        setLoadingServiceMasters(false);
      }
    };

    void run();
  }, [mode, toast, unit.label]);

  const polyclinicOptions = useMemo(() => getSupportingPolyclinicOptions(orders), [orders]);
  const filteredOrders = useMemo(
    () => filterSupportingOrders(orders, search, polyclinicFilter, unitType),
    [orders, polyclinicFilter, search, unitType],
  );

  const stats = useMemo(() => {
    const ordered = orders.filter((record) => getSupportingWorkflowStatus(record, unitType) === 'ordered').length;
    const preparing = orders.filter((record) => getSupportingWorkflowStatus(record, unitType) === 'preparing').length;
    const completed = orders.filter((record) => getSupportingWorkflowStatus(record, unitType) === 'completed').length;
    const totalItems = orders.reduce((total, record) => total + getSupportingItemCount(record, unitType), 0);
    const filledItems = orders.reduce((total, record) => total + getSupportingCompletedItemCount(record, unitType), 0);
    const estimatedValue = orders.reduce((total, record) => total + getSupportingEstimatedValue(record, unitType), 0);

    return {
      ordered,
      preparing,
      completed,
      totalOrders: orders.length,
      totalItems,
      filledItems,
      estimatedValue,
    };
  }, [orders, unitType]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const nextOrders = await loadOrders();
      setSelectedOrder((current) => current ? nextOrders.find((item) => item.id === current.id) || null : current);
      setProcessOrder((current) => current ? nextOrders.find((item) => item.id === current.id) || null : current);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: pageMeta.refreshErrorTitle,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat memuat ulang modul ${unit.label}.`,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const refreshAfterMutation = async (recordId: number) => {
    const nextOrders = await loadOrders();
    const updatedOrder = nextOrders.find((item) => item.id === recordId) || null;
    setSelectedOrder((current) => current?.id === recordId ? updatedOrder : current);
    setProcessOrder((current) => current?.id === recordId ? updatedOrder : current);
    return updatedOrder;
  };

  const handlePrepare = async (record: MedicalRecord) => {
    if (!canManage) return;

    setPreparingRecordId(record.id);
    try {
      await apiClient.prepareOrder(record.id);
      toast({ title: `Order ${unit.label} masuk proses` });
      await refreshAfterMutation(record.id);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: `Gagal menerima order ${unit.label}`,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat memindahkan order ${unit.label} ke tahap proses.`,
      });
    } finally {
      setPreparingRecordId(null);
    }
  };

  const handleSaveLaboratoryResults = async (items: Array<{ id: number; result_value: string; parameters: Array<{ id: number; result_value: string }> }>) => {
    if (!processOrder) return;

    setSavingResultRecordId(processOrder.id);
    try {
      await apiClient.updateResults(processOrder.id, { items });
      toast({ title: 'Hasil laboratorium berhasil diperbarui' });
      await refreshAfterMutation(processOrder.id);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menyimpan hasil laboratorium',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menyimpan hasil laboratorium.',
      });
    } finally {
      setSavingResultRecordId(null);
    }
  };

  const handleSaveRadiologyResults = async (items: Array<{ id: number; findings: string; impression: string; recommendation: string; parameters: Array<{ id: number; result_value: string }> }>) => {
    if (!processOrder) return;

    setSavingResultRecordId(processOrder.id);
    try {
      await apiClient.updateResults(processOrder.id, { items });
      toast({ title: 'Hasil radiologi berhasil diperbarui' });
      await refreshAfterMutation(processOrder.id);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menyimpan hasil radiologi',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menyimpan hasil radiologi.',
      });
    } finally {
      setSavingResultRecordId(null);
    }
  };

  const handleComplete = async () => {
    if (!processOrder) return;

    setCompletingRecordId(processOrder.id);
    try {
      await apiClient.completeOrder(processOrder.id);
      toast({ title: `Order ${unit.label} selesai diproses` });
      const updatedOrder = await refreshAfterMutation(processOrder.id);
      if (!updatedOrder) {
        setProcessOrder(null);
      }
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: `Gagal menyelesaikan order ${unit.label}`,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat menandai order ${unit.label} selesai.`,
      });
    } finally {
      setCompletingRecordId(null);
    }
  };

  const handleReturnToOrder = async (targetRecord?: MedicalRecord | null) => {
    const record = targetRecord || processOrder;
    if (!record || !canManage) return;

    setReturningRecordId(record.id);
    try {
      await apiClient.returnOrder(record.id);
      toast({ title: `Order ${unit.label} dikembalikan ke antrean order` });
      await refreshAfterMutation(record.id);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: `Gagal mengembalikan order ${unit.label}`,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat mengembalikan order ${unit.label} ke antrean order.`,
      });
    } finally {
      setReturningRecordId(null);
    }
  };

  const handleAddItem = async (payload: { medical_service_id: number; specimen_template_id?: number; instructions: string }) => {
    if (!processOrder || !canManage) return;

    setAddingItemRecordId(processOrder.id);
    try {
      await apiClient.addItem(processOrder.id, payload);
      toast({ title: `Tindakan ${unit.label} berhasil ditambahkan` });
      await refreshAfterMutation(processOrder.id);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: `Gagal menambahkan tindakan ${unit.label}`,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat menambahkan tindakan ${unit.label} ke order ini.`,
      });
    } finally {
      setAddingItemRecordId(null);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!processOrder || !canManage) return;

    setDeletingItemId(itemId);
    try {
      await apiClient.deleteItem(processOrder.id, itemId);
      toast({ title: `Item ${unit.label} tambahan berhasil dihapus` });
      await refreshAfterMutation(processOrder.id);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: `Gagal menghapus item ${unit.label}`,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat menghapus item ${unit.label} tambahan.`,
      });
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleDownloadResultPdf = async (targetRecord?: MedicalRecord | null) => {
    const record = targetRecord || selectedOrder || processOrder;
    if (!record) {
      return;
    }

    setDownloadingResultRecordId(record.id);
    try {
      const response = unitType === 'laboratory'
        ? await medicalRecordsApi.printLaboratoryOrderResult(record.id)
        : await medicalRecordsApi.printRadiologyOrderResult(record.id);
      const fallbackFileName = `${unitType === 'laboratory' ? 'hasil-laboratorium' : 'hasil-radiologi'}-${record.visit?.visit_number || record.id}.pdf`;

      downloadBlobResponse(response, fallbackFileName);
      toast({ title: `PDF hasil ${unit.label} berhasil diunduh` });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: `Gagal mengunduh PDF hasil ${unit.label}`,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat mengunduh PDF hasil ${unit.label}.`,
      });
    } finally {
      setDownloadingResultRecordId(null);
    }
  };

  const handlePreviewSatusehatItem = async (itemId: number) => {
    const resource: SatusehatResourceKey = unitType === 'laboratory' ? 'laboratory-order-item' : 'radiology-order-item';
    const label = unitType === 'laboratory' ? 'laboratorium' : 'radiologi';

    setPreviewingSatusehatItemId(itemId);
    try {
      const response = await satusehatApi.previewResource(resource, itemId);
      setSatusehatResult({
        title: `Preview SATUSEHAT ${label}`,
        description: `Payload ${label} yang akan dikirim dari item order ID ${itemId}.`,
        payload: response.data?.data ?? response.data,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: `Gagal membuat preview SATUSEHAT ${label}`,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat menyiapkan preview SATUSEHAT untuk item ${label}.`,
      });
    } finally {
      setPreviewingSatusehatItemId(null);
    }
  };

  const handleSyncSatusehatItem = async (itemId: number) => {
    const resource: SatusehatResourceKey = unitType === 'laboratory' ? 'laboratory-order-item' : 'radiology-order-item';
    const label = unitType === 'laboratory' ? 'laboratorium' : 'radiologi';

    setSyncingSatusehatItemId(itemId);
    try {
      const response = await satusehatApi.syncResource(resource, itemId);
      if (selectedOrder?.id) {
        await refreshAfterMutation(selectedOrder.id);
      }
      toast({
        title: response.data?.message || `Item ${label} berhasil disinkronkan ke SATUSEHAT`,
      });
      setSatusehatResult({
        title: `Hasil sinkronisasi SATUSEHAT ${label}`,
        description: `Respons sinkronisasi untuk item order ID ${itemId}.`,
        payload: response.data?.data ?? response.data,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string; data?: unknown }>;
      toast({
        variant: 'destructive',
        title: `Gagal sinkron SATUSEHAT ${label}`,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat sinkronisasi item ${label} ke SATUSEHAT.`,
      });
      if (requestError.response?.data?.data) {
        setSatusehatResult({
          title: `Payload SATUSEHAT ${label} belum siap`,
          description: 'Backend mengembalikan payload yang perlu dilengkapi sebelum sinkronisasi dapat dilanjutkan.',
          payload: requestError.response.data.data,
        });
      }
    } finally {
      setSyncingSatusehatItemId(null);
    }
  };

  const columns = useMemo<ColumnDef<MedicalRecord>[]>(() => {
    return [
      {
        id: 'ordered_at',
        header: 'Tanggal Order',
        cell: ({ row }) => (
          <div className="space-y-0.5 text-xs">
            <p className="font-medium text-foreground/95">{formatDateTime(getSupportingOrderedAt(row.original, unitType))}</p>
            <p className="text-muted-foreground">{row.original.record_date ? `Draft ${formatDateTime(row.original.record_date)}` : '-'}</p>
          </div>
        ),
      },
      {
        id: 'patient',
        header: 'Pasien',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground/95">{row.original.patient?.full_name || '-'}</p>
            <p className="text-xs text-muted-foreground">{row.original.patient?.medical_record_number || '-'}</p>
          </div>
        ),
      },
      {
        id: 'summary',
        header: 'Ringkasan Order',
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground/95">{getSupportingPrimaryLine(row.original, unitType)}</p>
            <p className="text-xs text-muted-foreground">
              {getSupportingItemCount(row.original, unitType)} item · {getSupportingCompletedItemCount(row.original, unitType)} hasil terisi
            </p>
          </div>
        ),
      },
      {
        id: 'doctor',
        header: 'Dokter / Poli',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground/95">{row.original.doctor?.full_name || '-'}</p>
            <p className="text-xs text-muted-foreground">{row.original.polyclinic?.name || '-'}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = getSupportingWorkflowStatus(row.original, unitType);
          return (
            <Badge variant="outline" className={`rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSupportingOrderWorkflowBadgeClassName(status)}`}>
              {getSupportingOrderWorkflowLabel(status)}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: 'Aksi',
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => setSelectedOrder(row.original)}>
              Detail
            </Button>
            {mode === 'receive' ? (
              <Button
                type="button"
                size="sm"
                className="rounded-none"
                onClick={() => void handlePrepare(row.original)}
                disabled={!canManage || preparingRecordId === row.original.id}
              >
                {preparingRecordId === row.original.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
                Terima
              </Button>
            ) : null}
            {mode === 'process' ? (
              <>
                {!hasSupportingSavedResults(row.original, unitType) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => setPendingReturnOrder(row.original)}
                    disabled={!canManage || returningRecordId === row.original.id}
                  >
                    {returningRecordId === row.original.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                    Kembalikan
                  </Button>
                ) : null}
                <Button type="button" size="sm" className="rounded-none" onClick={() => setProcessOrder(row.original)}>
                  <Search className="mr-1.5 h-4 w-4" /> Input Hasil
                </Button>
              </>
            ) : null}
          </div>
        ),
      },
    ];
  }, [canManage, mode, preparingRecordId, unitType]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (mode === 'summary') {
    const Icon = unit.icon;

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SupportingOrderStatCard label="Menunggu Diterima" value={String(stats.ordered)} helper={`Order ${unit.label} baru dari EMR yang belum diambil unit.`} />
          <SupportingOrderStatCard label="Sedang Diproses" value={String(stats.preparing)} helper={`Order ${unit.label} yang sedang diisi hasil oleh unit.`} />
          <SupportingOrderStatCard label="Selesai" value={String(stats.completed)} helper={`Order ${unit.label} yang hasilnya sudah selesai dan kembali ke EMR.`} />
          <SupportingOrderStatCard label="Total Item" value={String(stats.totalItems)} helper="Jumlah seluruh item pemeriksaan pada antrean aktif dan selesai." />
          <SupportingOrderStatCard label="Estimasi Nilai" value={formatSupportingCurrency(stats.estimatedValue)} helper={`Akumulasi nilai order ${unit.label} pada antrean yang sedang dimuat.`} />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {unit.workflowCards.map((card) => {
            const queueCount = card.status === 'ordered' ? stats.ordered : card.status === 'preparing' ? stats.preparing : stats.completed;
            return (
              <div key={card.href} className="border border-border/70 bg-background p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center border border-border/70 bg-muted/20">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Antrean</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{queueCount}</p>
                  </div>
                </div>
                <div className="mt-5">
                  <h2 className="text-base font-semibold tracking-tight">{card.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
                </div>
                <div className="mt-5">
                  <Button asChild className="w-full rounded-none">
                    <Link to={card.href}>
                      Buka Halaman
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="border border-border/70 bg-background p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Alur Kerja</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>1. Dokter membuat order dari EMR pada lembar penunjang.</p>
              <p>2. Unit menerima order, memvalidasi konteks klinis, lalu memproses item pemeriksaan.</p>
              <p>3. Hasil diisi pada order yang sama dan ditandai selesai agar kembali terlihat di EMR.</p>
            </div>
          </div>

          <div className="border border-border/70 bg-background p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fokus Hari Ini</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="border border-border/70 bg-muted/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Prioritas</p>
                <p className="mt-2 text-base font-semibold tracking-tight">{stats.preparing} order sedang diproses</p>
                <p className="mt-1 text-sm text-muted-foreground">Pastikan hasil yang sedang berjalan tidak tertahan agar cepat kembali ke dokter.</p>
              </div>
              <div className="border border-border/70 bg-muted/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Output</p>
                <p className="mt-2 text-base font-semibold tracking-tight">{stats.completed} order selesai</p>
                <p className="mt-1 text-sm text-muted-foreground">Pantau ritme penyelesaian hasil untuk menjaga waktu tunggu klinis tetap singkat.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SupportingOrderStatCard
          label={mode === 'receive' ? 'Order Masuk' : mode === 'process' ? 'Sedang Diproses' : 'Order Selesai'}
          value={String(stats.totalOrders)}
          helper={`Jumlah order ${unit.label} pada tahap ${mode === 'receive' ? 'penerimaan' : mode === 'process' ? 'proses hasil' : 'selesai'}.`}
        />
        <SupportingOrderStatCard label="Total Item" value={String(stats.totalItems)} helper="Akumulasi item pemeriksaan pada daftar yang sedang ditampilkan." />
        <SupportingOrderStatCard label="Hasil Terisi" value={String(stats.filledItems)} helper="Item yang sudah memiliki hasil terisi pada order yang sedang dimuat." />
        <SupportingOrderStatCard label="Estimasi Nilai" value={formatSupportingCurrency(stats.estimatedValue)} helper={`Estimasi nilai order ${unit.label} pada daftar ini.`} />
      </section>

      <section className="border border-border/70 bg-background px-5 py-4">
        <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,360px)_220px_auto]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Cari pasien, no. RM, kunjungan, dokter, atau item ${unit.label}...`}
            className="w-full rounded-none"
          />
          <SearchableSelect
            options={polyclinicOptions}
            value={polyclinicFilter}
            onValueChange={setPolyclinicFilter}
            placeholder="Semua poli"
            searchPlaceholder="Cari poli"
            noneLabel="Semua poli"
            square
            className="w-full"
          />
          <div className="flex items-center gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
            <Button type="button" variant="outline" className="rounded-none" onClick={() => void handleRefresh()} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Muat Ulang
            </Button>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <DataTable
          columns={columns}
          data={filteredOrders}
          showSearch={false}
          showColumnVisibility={false}
          showSelectionSummary={false}
          pageSize={10}
          emptyMessage={`Belum ada order ${unit.label} yang sesuai filter.`}
          className="min-h-0 flex-1"
        />
      </section>

      <SupportingOrderDetailDialog
        unitType={unitType}
        order={selectedOrder}
        open={Boolean(selectedOrder)}
        title={unit.detailTitle}
        description={`Tinjau konteks klinis, item order, dan hasil ${unit.label} pada order ini.`}
        footerNote={mode === 'receive'
          ? `Menerima order akan memindahkan order ini ke halaman proses ${unit.label}.`
          : mode === 'process'
            ? `Gunakan tombol input hasil untuk mengisi hasil ${unit.label} sebelum order diselesaikan.`
            : `Dialog ini bersifat baca-saja untuk audit order ${unit.label} yang sudah selesai.`}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null);
          }
        }}
        downloadAction={selectedOrder && mode === 'completed' ? {
          label: 'Unduh PDF Hasil',
          processingLabel: 'Mengunduh...',
          processing: downloadingResultRecordId === selectedOrder.id,
          onClick: () => {
            void handleDownloadResultPdf(selectedOrder);
          },
        } : undefined}
        primaryAction={selectedOrder && mode === 'receive' && canManage ? {
          label: 'Terima Order',
          processingLabel: 'Memproses...',
          processing: preparingRecordId === selectedOrder.id,
          onClick: () => {
            void handlePrepare(selectedOrder);
          },
          icon: <ArrowRight className="mr-1.5 h-4 w-4" />,
        } : undefined}
        satusehatItemActions={selectedOrder ? {
          previewingItemId: previewingSatusehatItemId,
          syncingItemId: syncingSatusehatItemId,
          onPreviewItem: (itemId) => {
            void handlePreviewSatusehatItem(itemId);
          },
          onSyncItem: (itemId) => {
            void handleSyncSatusehatItem(itemId);
          },
        } : undefined}
      />

      <SupportingProcessOrderDialog
        unitType={unitType}
        order={processOrder}
        open={Boolean(processOrder)}
        canManage={canManage}
        serviceMasters={serviceMasters}
        loadingServiceMasters={loadingServiceMasters}
        addingItem={addingItemRecordId === processOrder?.id}
        saving={savingResultRecordId === processOrder?.id}
        completing={completingRecordId === processOrder?.id}
        returning={returningRecordId === processOrder?.id}
        deletingItemId={deletingItemId}
        onOpenChange={(open) => {
          if (!open) {
            setProcessOrder(null);
          }
        }}
        onAddItem={handleAddItem}
        onDeleteItem={handleDeleteItem}
        onSaveLaboratoryResults={handleSaveLaboratoryResults}
        onSaveRadiologyResults={handleSaveRadiologyResults}
        onReturnToOrder={() => handleReturnToOrder()}
        onComplete={handleComplete}
      />

      <ConfirmDialog
        open={Boolean(pendingReturnOrder)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingReturnOrder(null);
          }
        }}
        onConfirm={() => {
          const targetOrder = pendingReturnOrder;
          setPendingReturnOrder(null);
          void handleReturnToOrder(targetOrder);
        }}
        title={`Kembalikan Order ${unit.title}`}
        description={`Order ${unit.label} akan keluar dari daftar proses dan kembali ke antrean order. Aksi ini hanya tersedia bila belum ada hasil yang pernah disimpan.`}
        confirmText={pendingReturnOrder && returningRecordId === pendingReturnOrder.id ? 'Mengembalikan...' : 'Kembalikan'}
        cancelText="Batal"
      />

      <SatusehatResultDialog
        open={Boolean(satusehatResult)}
        title={satusehatResult?.title || 'Hasil SATUSEHAT'}
        description={satusehatResult?.description}
        payload={satusehatResult?.payload || {}}
        onOpenChange={(open) => {
          if (!open) {
            setSatusehatResult(null);
          }
        }}
      />
    </div>
  );
}