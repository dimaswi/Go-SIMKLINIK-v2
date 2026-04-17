import { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SatusehatResultDialog } from '@/components/satusehat-result-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { medicalRecordsApi, pharmacyApi, satusehatApi, type MedicalRecord } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { OrderDetailDialog } from '../components/order-detail-dialog';
import { PharmacyStatCard } from '../components/stat-card';
import { createColumns } from './columns';
import { filterPharmacyOrders, getPolyclinicOptions, getRecordStockIssueCount, getRecordTotalPrice, PHARMACY_ACTION_META } from '../utils';
import { Loader2, PillBottle, RefreshCw } from 'lucide-react';

type SatusehatResultState = {
  title: string;
  description?: string;
  payload: unknown;
};

export default function PharmacyReceiveIndex() {
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [orders, setOrders] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [polyclinicFilter, setPolyclinicFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<MedicalRecord | null>(null);
  const [receivingRecordId, setReceivingRecordId] = useState<number | null>(null);
  const [previewingPrescriptionId, setPreviewingPrescriptionId] = useState<number | null>(null);
  const [syncingPrescriptionId, setSyncingPrescriptionId] = useState<number | null>(null);
  const [satusehatResult, setSatusehatResult] = useState<SatusehatResultState | null>(null);

  const canProcess = hasPermission('pharmacy.process') || hasPermission('prescriptions.process') || hasPermission('prescriptions.update');

  const loadOrders = useCallback(async () => {
    const response = await pharmacyApi.getPrescriptionOrders('prescription_workflow_status=ordered&per_page=200');
    const nextOrders = response.data.data || [];
    setOrders(nextOrders);
    return nextOrders;
  }, []);

  useEffect(() => {
    setPageTitle('Farmasi - Terima Resep');

    const run = async () => {
      setLoading(true);
      try {
        await loadOrders();
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: 'Gagal memuat resep masuk',
          description: requestError.response?.data?.error || 'Terjadi kesalahan saat mengambil antrean resep yang baru dikirim dari EMR.',
        });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [loadOrders, toast]);

  const polyclinicOptions = useMemo(() => getPolyclinicOptions(orders), [orders]);
  const filteredOrders = useMemo(() => filterPharmacyOrders(orders, search, polyclinicFilter), [orders, polyclinicFilter, search]);

  const stats = useMemo(() => {
    const totalItems = orders.reduce(
      (total, record) => total + (record.prescriptions?.length || 0) + (record.prescription_compounds?.length || 0),
      0,
    );

    return {
      totalOrders: orders.length,
      totalItems,
      stockIssues: orders.filter((record) => getRecordStockIssueCount(record) > 0).length,
      totalValue: orders.reduce((total, record) => total + getRecordTotalPrice(record), 0),
    };
  }, [orders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadOrders();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memuat ulang resep masuk',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat memuat ulang antrean resep masuk.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleReceive = useCallback(async (record: MedicalRecord) => {
    if (!canProcess) {
      return;
    }

    setReceivingRecordId(record.id);
    try {
      await medicalRecordsApi.preparePrescriptionOrder(record.id);
      toast({ title: PHARMACY_ACTION_META.prepare.successTitle });
      const refreshedOrders = await loadOrders();
      setSelectedOrder((current) => current?.id === record.id ? refreshedOrders.find((item) => item.id === record.id) || null : current);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menerima resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat memindahkan resep ke proses farmasi.',
      });
    } finally {
      setReceivingRecordId(null);
    }
  }, [canProcess, loadOrders, toast]);

  const handlePreviewPrescription = useCallback(async (prescriptionId: number) => {
    setPreviewingPrescriptionId(prescriptionId);
    try {
      const response = await satusehatApi.previewResource('prescription', prescriptionId);
      setSatusehatResult({
        title: 'Preview SATUSEHAT MedicationRequest',
        description: `Payload prescription ID ${prescriptionId} yang akan dikirim ke SATUSEHAT.`,
        payload: response.data?.data ?? response.data,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal membuat preview SATUSEHAT resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat membuat preview SATUSEHAT untuk prescription ini.',
      });
    } finally {
      setPreviewingPrescriptionId(null);
    }
  }, [toast]);

  const handleSyncPrescription = useCallback(async (prescriptionId: number) => {
    setSyncingPrescriptionId(prescriptionId);
    try {
      const response = await satusehatApi.syncResource('prescription', prescriptionId);
      const refreshedOrders = await loadOrders();
      setSelectedOrder((current) => current ? refreshedOrders.find((item) => item.id === current.id) || null : current);
      toast({ title: response.data?.message || 'MedicationRequest berhasil disinkronkan ke SATUSEHAT' });
      setSatusehatResult({
        title: 'Hasil sinkronisasi MedicationRequest',
        description: `Respons sinkronisasi untuk prescription ID ${prescriptionId}.`,
        payload: response.data?.data ?? response.data,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string; data?: unknown }>;
      toast({
        variant: 'destructive',
        title: 'Gagal sinkron SATUSEHAT resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat mengirim MedicationRequest ke SATUSEHAT.',
      });
      if (requestError.response?.data?.data) {
        setSatusehatResult({
          title: 'Payload MedicationRequest belum siap',
          description: 'Backend mengembalikan payload yang masih perlu dilengkapi sebelum sinkronisasi bisa dilakukan.',
          payload: requestError.response.data.data,
        });
      }
    } finally {
      setSyncingPrescriptionId(null);
    }
  }, [loadOrders, toast]);

  const columns = useMemo(() => createColumns({
    canProcess,
    processingRecordId: receivingRecordId,
    onOpenDetail: setSelectedOrder,
    onReceive: (record) => {
      void handleReceive(record);
    },
  }), [canProcess, handleReceive, receivingRecordId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PharmacyStatCard label="Resep Masuk" value={String(stats.totalOrders)} helper="Resep internal yang baru dikirim dari EMR dan belum diambil alih farmasi." />
        <PharmacyStatCard label="Total Item" value={String(stats.totalItems)} helper="Jumlah total item obat dan racikan yang perlu diverifikasi saat penerimaan." />
        <PharmacyStatCard label="Perlu Cek Stok" value={String(stats.stockIssues)} helper="Order yang sudah terdeteksi punya item dengan stok kurang sejak awal penerimaan." />
        <PharmacyStatCard label="Nilai Antrean" value={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(stats.totalValue)} helper="Estimasi nilai seluruh resep yang menunggu diterima farmasi." />
      </section>

      <section className="border border-border/70 bg-background px-5 py-4">
        <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,360px)_220px_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari pasien, no. RM, kunjungan, dokter, atau nama obat..."
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
          emptyMessage="Belum ada resep masuk yang sesuai filter."
          className="min-h-0 flex-1"
        />
      </section>

      <OrderDetailDialog
        order={selectedOrder}
        open={Boolean(selectedOrder)}
        title="Detail Resep Masuk"
        description="Pastikan data pasien, dokter, item resep, dan stok awal sudah sesuai sebelum resep diambil ke tahap proses farmasi."
        footerNote="Menerima resep akan memindahkan order ini ke halaman proses resep agar farmasi dapat menambah item, cek stok rinci, dan menandai siap serah."
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null);
          }
        }}
        primaryAction={selectedOrder && canProcess ? {
          label: 'Terima Resep',
          processingLabel: 'Memproses...',
          processing: receivingRecordId === selectedOrder.id,
          onClick: () => {
            void handleReceive(selectedOrder);
          },
          icon: <PillBottle className="mr-1.5 h-4 w-4" />,
        } : undefined}
        satusehatPrescriptionActions={selectedOrder ? {
          previewingPrescriptionId,
          syncingPrescriptionId,
          onPreviewPrescription: (prescriptionId) => {
            void handlePreviewPrescription(prescriptionId);
          },
          onSyncPrescription: (prescriptionId) => {
            void handleSyncPrescription(prescriptionId);
          },
        } : undefined}
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