import { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { medicinesApi, medicalRecordsApi, pharmacyApi, type MedicalRecord, type Medicine } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { ProcessOrderDialog } from '../components/process-order-dialog';
import { PharmacyStatCard } from '../components/stat-card';
import { createColumns } from './columns';
import { filterPharmacyOrders, getPolyclinicOptions, getRecordStockIssueCount, getRecordTotalPrice } from '../utils';
import { Loader2, RefreshCw } from 'lucide-react';

type AddPrescriptionPayload = {
  medicine_id: number;
  quantity: number;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  notes: string;
};

export default function PharmacyProcessIndex() {
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [orders, setOrders] = useState<MedicalRecord[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMedicines, setLoadingMedicines] = useState(true);
  const [search, setSearch] = useState('');
  const [polyclinicFilter, setPolyclinicFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<MedicalRecord | null>(null);
  const [pendingReturnOrder, setPendingReturnOrder] = useState<MedicalRecord | null>(null);
  const [addingMedicine, setAddingMedicine] = useState(false);
  const [deletingPrescriptionId, setDeletingPrescriptionId] = useState<number | null>(null);
  const [returningOrderRecordId, setReturningOrderRecordId] = useState<number | null>(null);
  const [markingReadyRecordId, setMarkingReadyRecordId] = useState<number | null>(null);

  const canManage = hasPermission('pharmacy.process') || hasPermission('prescriptions.process') || hasPermission('prescriptions.update');

  const loadOrders = useCallback(async () => {
    const response = await pharmacyApi.getPrescriptionOrders('prescription_workflow_status=preparing&per_page=200');
    const nextOrders = response.data.data || [];
    setOrders(nextOrders);
    return nextOrders;
  }, []);

  const loadMedicines = useCallback(async () => {
    const response = await medicinesApi.getAll('per_page=500');
    const nextMedicines = response.data.data || [];
    setMedicines(nextMedicines);
    return nextMedicines;
  }, []);

  useEffect(() => {
    setPageTitle('Farmasi - Proses Resep');

    const run = async () => {
      setLoading(true);
      setLoadingMedicines(true);
      try {
        await Promise.all([loadOrders(), loadMedicines()]);
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: 'Gagal memuat resep proses',
          description: requestError.response?.data?.error || 'Terjadi kesalahan saat memuat resep yang sedang diproses oleh farmasi.',
        });
      } finally {
        setLoading(false);
        setLoadingMedicines(false);
      }
    };

    void run();
  }, [loadMedicines, loadOrders, toast]);

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
      await Promise.all([loadOrders(), loadMedicines()]);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memuat ulang resep proses',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat memuat ulang data proses resep.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const syncSelectedOrder = useCallback((recordId: number, refreshedOrders: MedicalRecord[]) => {
    setSelectedOrder((current) => current?.id === recordId ? refreshedOrders.find((item) => item.id === recordId) || null : current);
  }, []);

  const handleAddPrescription = useCallback(async (payload: AddPrescriptionPayload) => {
    if (!selectedOrder) {
      return;
    }

    setAddingMedicine(true);
    try {
      await pharmacyApi.addPrescription(selectedOrder.id, payload);
      toast({ title: 'Obat berhasil ditambahkan ke resep' });
      const refreshedOrders = await loadOrders();
      syncSelectedOrder(selectedOrder.id, refreshedOrders);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menambahkan obat',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menambahkan obat ke resep farmasi.',
      });
    } finally {
      setAddingMedicine(false);
    }
  }, [loadOrders, selectedOrder, syncSelectedOrder, toast]);

  const handleDeletePrescription = useCallback(async (prescriptionId: number) => {
    if (!selectedOrder) {
      return;
    }

    setDeletingPrescriptionId(prescriptionId);
    try {
      await pharmacyApi.deletePrescription(selectedOrder.id, prescriptionId);
      toast({ title: 'Item obat dihapus dari resep' });
      const refreshedOrders = await loadOrders();
      syncSelectedOrder(selectedOrder.id, refreshedOrders);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menghapus item obat',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menghapus item resep pada proses farmasi.',
      });
    } finally {
      setDeletingPrescriptionId(null);
    }
  }, [loadOrders, selectedOrder, syncSelectedOrder, toast]);

  const handleMarkReady = useCallback(async () => {
    if (!selectedOrder) {
      return;
    }

    setMarkingReadyRecordId(selectedOrder.id);
    try {
      await medicalRecordsApi.readyPrescriptionOrder(selectedOrder.id);
      toast({ title: 'Resep siap diserahkan ke pasien' });
      const refreshedOrders = await loadOrders();
      syncSelectedOrder(selectedOrder.id, refreshedOrders);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menyelesaikan proses resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menandai resep siap diserahkan.',
      });
    } finally {
      setMarkingReadyRecordId(null);
    }
  }, [loadOrders, selectedOrder, syncSelectedOrder, toast]);

  const handleReturnToOrder = useCallback(async (targetOrder?: MedicalRecord | null) => {
    const order = targetOrder || selectedOrder;
    if (!order) {
      return;
    }

    setReturningOrderRecordId(order.id);
    try {
      await pharmacyApi.returnOrder(order.id);
      toast({ title: 'Resep dikembalikan ke antrean order farmasi' });
      const refreshedOrders = await loadOrders();
      syncSelectedOrder(order.id, refreshedOrders);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengembalikan resep ke antrean order',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat mengembalikan resep ke antrean order farmasi.',
      });
    } finally {
      setReturningOrderRecordId(null);
    }
  }, [loadOrders, selectedOrder, syncSelectedOrder, toast]);

  const columns = useMemo(() => createColumns({
    onOpenProcess: setSelectedOrder,
    onRequestReturnToOrder: setPendingReturnOrder,
    returningRecordId: returningOrderRecordId,
  }), [returningOrderRecordId]);

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
        <PharmacyStatCard label="Sedang Diproses" value={String(stats.totalOrders)} helper="Resep yang sudah diterima farmasi dan sedang dicek stok, item, atau peracikannya." />
        <PharmacyStatCard label="Item Aktif" value={String(stats.totalItems)} helper="Jumlah item obat yang sedang dikerjakan oleh farmasi pada tahap proses." />
        <PharmacyStatCard label="Perlu Tindakan" value={String(stats.stockIssues)} helper="Resep yang masih punya masalah stok dan belum bisa ditandai siap diserahkan." />
        <PharmacyStatCard label="Nilai Proses" value={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(stats.totalValue)} helper="Nilai total resep yang sedang diproses di unit farmasi." />
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
          emptyMessage="Belum ada resep yang sedang diproses."
          className="min-h-0 flex-1"
        />
      </section>

      <ProcessOrderDialog
        order={selectedOrder}
        medicines={medicines}
        loadingMedicines={loadingMedicines}
        open={Boolean(selectedOrder)}
        canManage={canManage}
        addingMedicine={addingMedicine}
        deletingPrescriptionId={deletingPrescriptionId}
        returningOrder={Boolean(selectedOrder && returningOrderRecordId === selectedOrder.id)}
        markingReady={Boolean(selectedOrder && markingReadyRecordId === selectedOrder.id)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null);
          }
        }}
        onAddPrescription={handleAddPrescription}
        onDeletePrescription={handleDeletePrescription}
        onReturnToOrder={() => handleReturnToOrder()}
        onMarkReady={handleMarkReady}
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
        title="Kembalikan Resep ke Antrean Order"
        description="Resep akan keluar dari daftar proses farmasi dan kembali ke antrean order. Item tambahan farmasi tetap tersimpan."
        confirmText={pendingReturnOrder && returningOrderRecordId === pendingReturnOrder.id ? 'Mengembalikan...' : 'Kembalikan'}
        cancelText="Batal"
      />
    </div>
  );
}