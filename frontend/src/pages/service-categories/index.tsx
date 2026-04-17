import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { createServiceCategoryColumns } from './columns';
import { serviceCategoriesApi, type ServiceCategory } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus } from 'lucide-react';
import { MasterDataListShell } from '@/pages/master-data/shared';

export default function ServiceCategoriesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try { setData((await serviceCategoriesApi.getAll()).data.data); } catch (error) { toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data." }); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { setPageTitle('Kategori Layanan'); loadData(); }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try { await serviceCategoriesApi.delete(itemToDelete); toast({ variant: "success", title: "Berhasil!" }); loadData(); } catch (error: any) { toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal menghapus." }); } finally { setDeleteDialogOpen(false); setItemToDelete(null); }
  };

  const columns = createServiceCategoryColumns({
    onView: (id) => navigate(`/service-categories/${id}`), onEdit: (id) => navigate(`/service-categories/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('service_categories.view'), hasEditPermission: hasPermission('service_categories.update'), hasDeletePermission: hasPermission('service_categories.delete'),
  });

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <MasterDataListShell
        title="Daftar Kategori Layanan"
        subtitle="Kelola kategori layanan medis sebagai fondasi struktur tarif dan katalog tindakan."
        totalCount={data.length}
      >
        <DataTable columns={columns} data={data} searchPlaceholder="Cari kategori layanan..." pageSize={10} className="h-full"
          toolbarActions={hasPermission('service_categories.create') ? <Button onClick={() => navigate('/service-categories/create')} className="rounded-none shadow-none"><Plus className="h-4 w-4" />Tambah Kategori</Button> : undefined} />
      </MasterDataListShell>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Kategori Layanan" description="Apakah Anda yakin ingin menghapus kategori ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
