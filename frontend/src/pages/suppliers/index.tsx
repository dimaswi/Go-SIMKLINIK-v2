import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { createSupplierColumns } from './columns';
import { suppliersApi, type Supplier } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus } from 'lucide-react';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try { setData((await suppliersApi.getAll()).data.data); } catch { toast({ variant: "destructive", title: "Error!" }); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { setPageTitle('Supplier'); loadData(); }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try { await suppliersApi.delete(itemToDelete); toast({ variant: "success", title: "Berhasil!" }); loadData(); }
    catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); }
    finally { setDeleteDialogOpen(false); setItemToDelete(null); }
  };

  const columns = createSupplierColumns({
    onView: (id) => navigate(`/suppliers/${id}`), onEdit: (id) => navigate(`/suppliers/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('suppliers.view'), hasEditPermission: hasPermission('suppliers.update'), hasDeletePermission: hasPermission('suppliers.delete'),
  });

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <DataTable columns={columns} data={data} searchPlaceholder="Cari supplier..." pageSize={10}
        toolbarActions={hasPermission('suppliers.create') ? <Button onClick={() => navigate('/suppliers/create')}><Plus className="h-4 w-4" />Tambah Supplier</Button> : undefined} />
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Supplier" description="Yakin hapus supplier ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
