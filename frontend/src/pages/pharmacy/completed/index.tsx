import { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SatusehatResultDialog } from '@/components/satusehat-result-dialog';
import { downloadBlobResponse } from '../../../lib/blob-download';
import { useToast } from '@/hooks/use-toast';
import { medicalRecordsApi, pharmacyApi, satusehatApi, type MedicalRecord } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { OrderDetailDialog } from '../components/order-detail-dialog';
import { PharmacyStatCard } from '../components/stat-card';
import { createColumns } from './columns';
import { filterPharmacyOrders, getPolyclinicOptions, getRecordTotalPrice } from '../utils';
import { Loader2, RefreshCw } from 'lucide-react';

type SatusehatResultState = {
  title: string;
  description?: string;
  payload: unknown;
};

export default function PharmacyCompletedIndex() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [polyclinicFilter, setPolyclinicFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<MedicalRecord | null>(null);
  const [downloadingRecordId, setDownloadingRecordId] = useState<number | null>(null);
  const [previewingPrescriptionId, setPreviewingPrescriptionId] = useState<number | null>(null);
  const [syncingPrescriptionId, setSyncingPrescriptionId] = useState<number | null>(null);
  const [satusehatResult, setSatusehatResult] = useState<SatusehatResultState | null>(null);

  const loadOrders = useCallback(async () => {
    const response = await pharmacyApi.getPrescriptionOrders('prescription_workflow_status=dispensed&per_page=200');
    const nextOrders = response.data.data || [];
    setOrders(nextOrders);
    return nextOrders;
  }, []);

  useEffect(() => {
    setPageTitle('Farmasi - Resep Selesai');

    const run = async () => {
      setLoading(true);
      try {
        await loadOrders();
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: 'Gagal memuat resep selesai',
          description: requestError.response?.data?.error || 'Terjadi kesalahan saat memuat resep yang sudah selesai diserahkan.',
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
        title: 'Gagal memuat ulang resep selesai',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat memuat ulang riwayat resep yang sudah diserahkan.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleDownloadPrescriptionPdf = useCallback(async () => {
    const order = selectedOrder;
    if (!order) {
      return;
    }

    setDownloadingRecordId(order.id);
    try {
      const response = await medicalRecordsApi.printPrescriptionOrder(order.id);
      downloadBlobResponse(response, `resep-farmasi-${order.visit?.visit_number || order.id}.pdf`);
      toast({ title: 'PDF resep berhasil diunduh' });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengunduh PDF resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat mengunduh PDF resep farmasi.',
      });
    } finally {
      setDownloadingRecordId(null);
    }
  }, [selectedOrder, toast]);

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

  const columns = useMemo(() => createColumns({ onOpenDetail: setSelectedOrder }), []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-3">
        <PharmacyStatCard label="Resep Selesai" value={String(stats.totalOrders)} helper="Resep yang sudah selesai dispensing dan telah diserahkan ke pasien." />
        <PharmacyStatCard label="Total Item" value={String(stats.totalItems)} helper="Jumlah seluruh item obat dari resep yang sudah selesai diproses." />
        <PharmacyStatCard label="Nilai Resep" value={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(stats.totalValue)} helper="Akumulasi nilai resep yang sudah selesai diserahkan." />
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
          emptyMessage="Belum ada resep yang sudah diserahkan."
          className="min-h-0 flex-1"
        />
      </section>

      <OrderDetailDialog
        order={selectedOrder}
        open={Boolean(selectedOrder)}
        title="Detail Resep Selesai"
        description="Riwayat resep yang sudah diserahkan kepada pasien. Gunakan detail ini untuk verifikasi item, nilai, dan data kunjungan."
        footerNote="Order ini sudah selesai dispensing dan tersimpan sebagai riwayat penyerahan resep."
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null);
          }
        }}
        downloadAction={selectedOrder ? {
          label: 'Unduh PDF Resep',
          processingLabel: 'Mengunduh...',
          processing: downloadingRecordId === selectedOrder.id,
          onClick: () => {
            void handleDownloadPrescriptionPdf();
          },
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