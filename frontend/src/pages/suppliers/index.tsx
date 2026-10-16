import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createSupplierColumns } from './columns';
import { suppliersApi, type Supplier } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus, RefreshCw, Truck } from 'lucide-react';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await suppliersApi.getAll();
      setData(res.data.data || []);
    } catch {
      toast({ variant: "destructive", title: "Error!", description: "Gagal memuat supplier." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Supplier');
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
      await suppliersApi.delete(itemToDelete);
      toast({ variant: "success", title: "Berhasil!", description: "Supplier berhasil dihapus." });
      loadData();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal menghapus." });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = useMemo(() => createSupplierColumns({
    onView: (id) => navigate(`/suppliers/${id}`),
    onEdit: (id) => navigate(`/suppliers/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('suppliers.view'),
    hasEditPermission: hasPermission('suppliers.update'),
    hasDeletePermission: hasPermission('suppliers.delete'),
  }), [hasPermission, navigate]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((s) => s.name?.toLowerCase().includes(q) || s.phone?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
  }, [data, search]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Supplier
              </h1>
              <p className="text-xs text-muted-foreground">
                Kelola data mitra distributor dan supplier farmasi ({filteredData.length} supplier)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari supplier / telepon / email..."
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

            {hasPermission('suppliers.create') ? (
              <Button
                className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
                onClick={() => navigate('/suppliers/create')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Tambah Supplier
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
            emptyMessage="Tidak ada data supplier yang sesuai."
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus Supplier"
        description="Yakin hapus supplier ini?"
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}
