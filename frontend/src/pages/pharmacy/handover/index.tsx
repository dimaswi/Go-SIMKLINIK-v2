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
import { createColumns } from './columns';
import { filterPharmacyOrders, getPolyclinicOptions, PHARMACY_ACTION_META } from '../utils';
import { Loader2, RefreshCw, ShoppingBag } from 'lucide-react';

type SatusehatResultState = {
  title: string;
  description?: string;
  errorMessage?: string;
  payload: unknown;
};

export default function PharmacyHandoverIndex() {
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [orders, setOrders] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [polyclinicFilter, setPolyclinicFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<MedicalRecord | null>(null);
  const [handoverRecordId, setHandoverRecordId] = useState<number | null>(null);
  const [previewingPrescriptionId, setPreviewingPrescriptionId] = useState<number | null>(null);
  const [syncingPrescriptionId, setSyncingPrescriptionId] = useState<number | null>(null);
  const [satusehatResult, setSatusehatResult] = useState<SatusehatResultState | null>(null);

  const canProcess = hasPermission('pharmacy.process') || hasPermission('prescriptions.process') || hasPermission('prescriptions.update');

  const loadOrders = useCallback(async () => {
    const response = await pharmacyApi.getPrescriptionOrders('prescription_workflow_status=ready&per_page=200');
    const nextOrders = response.data.data || [];
    setOrders(nextOrders);
    return nextOrders;
  }, []);

  useEffect(() => {
    setPageTitle('Farmasi - Serahkan Resep');

    const run = async () => {
      setLoading(true);
      try {
        await loadOrders();
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: 'Gagal memuat resep siap serah',
          description: requestError.response?.data?.error || 'Terjadi kesalahan saat memuat resep yang sudah siap diserahkan.',
        });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [loadOrders, toast]);

  const polyclinicOptions = useMemo(() => getPolyclinicOptions(orders), [orders]);
  const filteredOrders = useMemo(() => filterPharmacyOrders(orders, search, polyclinicFilter), [orders, polyclinicFilter, search]);


  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadOrders();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memuat ulang resep siap serah',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat memuat ulang resep yang siap diserahkan.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleHandover = useCallback(async (record: MedicalRecord) => {
    if (!canProcess) {
      return;
    }

    setHandoverRecordId(record.id);
    try {
      await medicalRecordsApi.dispensePrescriptionOrder(record.id);
      toast({ title: PHARMACY_ACTION_META.dispense.successTitle });
      const refreshedOrders = await loadOrders();
      setSelectedOrder((current) => current?.id === record.id ? refreshedOrders.find((item) => item.id === record.id) || null : current);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menyerahkan resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menyelesaikan penyerahan resep kepada pasien.',
      });
    } finally {
      setHandoverRecordId(null);
    }
  }, [canProcess, loadOrders, toast]);

  const handlePreviewPrescription = useCallback(async (prescriptionId: number) => {
    setPreviewingPrescriptionId(prescriptionId);
    try {
      const response = await satusehatApi.previewResource('prescription', prescriptionId);
      const previewData = response.data?.data ?? response.data;
      setSatusehatResult({
        title: 'Preview SATUSEHAT MedicationRequest',
        description: `Payload prescription ID #${prescriptionId} yang akan dikirim ke SATUSEHAT.`,
        payload: previewData,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string; data?: unknown }>;
      const errorMessage = requestError.response?.data?.error || requestError.message || 'Terjadi kesalahan saat membuat preview SATUSEHAT untuk prescription ini.';
      toast({
        variant: 'destructive',
        title: 'Gagal membuat preview SATUSEHAT resep',
        description: errorMessage,
      });
      setSatusehatResult({
        title: 'Preview SATUSEHAT - Data Belum Lengkap',
        description: 'Periksa kekurangan data master atau pasien di bawah ini.',
        errorMessage,
        payload: requestError.response?.data?.data || null,
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
        title: 'Hasil Sinkronisasi MedicationRequest',
        description: `Respons sinkronisasi untuk prescription ID #${prescriptionId}.`,
        payload: response.data?.data ?? response.data,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string; data?: unknown }>;
      const errorMessage = requestError.response?.data?.error || requestError.message || 'Terjadi kesalahan saat mengirim MedicationRequest ke SATUSEHAT.';
      toast({
        variant: 'destructive',
        title: 'Gagal sinkron SATUSEHAT resep',
        description: errorMessage,
      });
      setSatusehatResult({
        title: 'Gagal Sinkronisasi SATUSEHAT',
        description: 'Pengiriman data ke SATUSEHAT Kemenkes ditolak atau belum siap.',
        errorMessage,
        payload: requestError.response?.data?.data || null,
      });
    } finally {
      setSyncingPrescriptionId(null);
    }
  }, [loadOrders, toast]);

  const columns = useMemo(() => createColumns({
    canProcess,
    processingRecordId: handoverRecordId,
    onOpenDetail: setSelectedOrder,
    onHandover: (record) => {
      void handleHandover(record);
    },
  }), [canProcess, handleHandover, handoverRecordId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <DataTable
        columns={columns}
        data={filteredOrders}
        showSearch={false}
        showColumnVisibility={false}
        showSelectionSummary={false}
        pageSize={10}
        emptyMessage="Belum ada resep yang siap diserahkan."
        className="min-h-0 flex-1"
        toolbarActions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari pasien, no. RM, kunjungan, dokter, atau obat..."
              className="h-9 w-[260px] rounded-none"
            />
            <div className="w-[180px]">
              <SearchableSelect
                options={polyclinicOptions}
                value={polyclinicFilter}
                onValueChange={setPolyclinicFilter}
                placeholder="Semua poli"
                searchPlaceholder="Cari poli"
                noneLabel="Semua poli"
                square
              />
            </div>
            <Button type="button" variant="outline" className="h-9 rounded-none" onClick={() => void handleRefresh()} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Muat Ulang
            </Button>
          </div>
        }
      />

      <OrderDetailDialog
        order={selectedOrder}
        open={Boolean(selectedOrder)}
        title="Detail Resep Siap Serah"
        description="Lakukan verifikasi terakhir sebelum menyerahkan obat ke pasien. Aksi serahkan resep akan menyelesaikan dispensing dan mengurangi stok." 
        footerNote="Pastikan pasien, item resep, dan penyiapan obat sudah sesuai. Setelah diserahkan, order akan keluar dari antrean handover."
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null);
          }
        }}
        primaryAction={selectedOrder && canProcess ? {
          label: 'Serahkan Resep',
          processingLabel: 'Menyerahkan...',
          processing: handoverRecordId === selectedOrder.id,
          onClick: () => {
            void handleHandover(selectedOrder);
          },
          icon: <ShoppingBag className="mr-1.5 h-4 w-4" />,
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
        errorMessage={satusehatResult?.errorMessage}
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