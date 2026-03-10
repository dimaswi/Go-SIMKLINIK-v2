import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { purchaseOrdersApi, suppliersApi, type PurchaseOrder, type Supplier } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { createColumns } from './columns';

export default function PurchasingIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (supplierFilter) params.set('supplier_id', supplierFilter);
      const res = await purchaseOrdersApi.getAll(params.toString());
      setData(res.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data.' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, supplierFilter, toast]);

  useEffect(() => {
    setPageTitle('Pembelian');
    suppliersApi.getAll().then(res => setSuppliers(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const confirmDelete = () => {
    if (!deleteId) return;
    purchaseOrdersApi.delete(deleteId)
      .then(() => { toast({ variant: 'success', title: 'Berhasil!', description: 'Purchase order dihapus.' }); loadData(); })
      .catch((e: any) => toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal menghapus.' }))
      .finally(() => { setDeleteDialogOpen(false); setDeleteId(null); });
  };

  const columns = createColumns((id) => { setDeleteId(id); setDeleteDialogOpen(true); });

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Cari nomor PO atau supplier..."
        pageSize={15}
        toolbarActions={
          <>
            <SearchableSelect
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'ordered', label: 'Dipesan' },
                { value: 'partial', label: 'Diterima Sebagian' },
                { value: 'received', label: 'Diterima' },
              ]}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Semua Status"
              searchPlaceholder="Cari status..."
              noneLabel="Semua Status"
              className="w-44"
            />
            <SearchableSelect
              options={suppliers.filter(s => s.is_active).map(s => ({ value: String(s.id), label: s.name }))}
              value={supplierFilter}
              onValueChange={setSupplierFilter}
              placeholder="Semua Supplier"
              searchPlaceholder="Cari supplier..."
              noneLabel="Semua Supplier"
              className="w-48"
            />
            <Button onClick={() => navigate('/purchasing/create')}>
              <Plus className="h-4 w-4" />Buat PO
            </Button>
          </>
        }
      />

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
