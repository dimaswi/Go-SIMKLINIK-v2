import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { purchaseOrdersApi, suppliersApi, type PurchaseOrder, type Supplier } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, RefreshCw, ShoppingCart } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { createColumns } from './columns';

export default function PurchasingIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (supplierFilter) params.set('supplier_id', supplierFilter);
      const res = await purchaseOrdersApi.getAll(params.toString());
      setData(res.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data.' });
    }
  }, [statusFilter, supplierFilter, toast]);

  useEffect(() => {
    setPageTitle('Pembelian');
    suppliersApi.getAll().then(res => setSuppliers(res.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    purchaseOrdersApi.delete(deleteId)
      .then(() => { toast({ variant: 'success', title: 'Berhasil!', description: 'Purchase order dihapus.' }); loadData(); })
      .catch((e: any) => toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal menghapus.' }))
      .finally(() => { setDeleteDialogOpen(false); setDeleteId(null); });
  };

  const columns = useMemo(() => createColumns((id) => { setDeleteId(id); setDeleteDialogOpen(true); }), []);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((po) =>
      po.po_number?.toLowerCase().includes(q) ||
      po.supplier?.name?.toLowerCase().includes(q)
    );
  }, [data, search]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Pembelian (PO)
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor PO..."
              className="h-9 w-44 rounded-none text-xs focus:ring-inset"
            />

            <SearchableSelect
              options={[
                { value: '', label: 'Semua Status' },
                { value: 'draft', label: 'Draft' },
                { value: 'ordered', label: 'Dipesan' },
                { value: 'partial', label: 'Diterima Sebagian' },
                { value: 'received', label: 'Diterima' },
              ]}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Semua Status"
              noneLabel="Semua Status"
              className="h-9 w-36 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />

            <SearchableSelect
              options={[
                { value: '', label: 'Semua Supplier' },
                ...suppliers.filter((s) => s.is_active).map((s) => ({ value: String(s.id), label: s.name })),
              ]}
              value={supplierFilter}
              onValueChange={setSupplierFilter}
              placeholder="Semua Supplier"
              noneLabel="Semua Supplier"
              className="h-9 w-40 rounded-none text-xs focus:ring-inset shrink-0"
              square
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

            <Button
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
              onClick={() => navigate('/purchasing/create')}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Buat PO
            </Button>
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
            emptyMessage="Belum ada purchase order yang sesuai dengan filter aktif."
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Hapus Purchase Order"
        description="Purchase order ini akan dihapus permanen. Lanjutkan?"
        onConfirm={confirmDelete}
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}
