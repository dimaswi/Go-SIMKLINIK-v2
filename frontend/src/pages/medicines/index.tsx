import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createMedicineColumns } from './columns';
import { medicinesApi, type Medicine } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Pill, Plus, RefreshCw } from 'lucide-react';

export default function MedicinesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await medicinesApi.getAll();
      setData(res.data.data || []);
    } catch (error) {
      toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal memuat data." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Obat');
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await medicinesApi.delete(itemToDelete);
      toast({ variant: "success", title: "Berhasil!", description: "Obat berhasil dihapus." });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal menghapus." });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = useMemo(() => createMedicineColumns({
    onView: (id) => navigate(`/medicines/${id}`),
    onEdit: (id) => navigate(`/medicines/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('medicines.view'),
    hasEditPermission: hasPermission('medicines.update'),
    hasDeletePermission: hasPermission('medicines.delete'),
  }), [hasPermission, navigate]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((m) =>
      m.name?.toLowerCase().includes(q) ||
      m.code?.toLowerCase().includes(q) ||
      m.generic_name?.toLowerCase().includes(q)
    );
  }, [data, search]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <Pill className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Data Obat
              </h1>
              <p className="text-xs text-muted-foreground">
                Kelola master data obat, sediaan, dan stok inventaris farmasi ({filteredData.length} obat)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari obat / kode / generik..."
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
            >
              <RefreshCw className={refreshing ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
              Segarkan
            </Button>

            {hasPermission('medicines.create') ? (
              <Button
                className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
                onClick={() => navigate('/medicines/create')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Tambah Obat
              </Button>
            ) : null}
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={filteredData}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Tidak ada data obat yang sesuai."
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus Obat"
        description="Apakah Anda yakin ingin menghapus obat ini?"
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}
