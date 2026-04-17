import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { createPolyclinicColumns } from './columns';
import { polyclinicsApi, type Polyclinic } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus } from 'lucide-react';
import { MasterDataListShell } from '@/pages/master-data/shared';

export default function PolyclinicsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<Polyclinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await polyclinicsApi.getAll();
      setData(res.data.data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal memuat data." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Poliklinik');
    loadData();
  }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await polyclinicsApi.delete(itemToDelete);
      toast({ variant: "success", title: "Berhasil!", description: "Poliklinik berhasil dihapus." });
      loadData();
    } catch (error) {
      toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal menghapus." });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = createPolyclinicColumns({
    onView: (id) => navigate(`/polyclinics/${id}`),
    onEdit: (id) => navigate(`/polyclinics/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('polyclinics.view'),
    hasEditPermission: hasPermission('polyclinics.update'),
    hasDeletePermission: hasPermission('polyclinics.delete'),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <MasterDataListShell
        title="Daftar Poliklinik"
        subtitle="Kelola kode dan nama poliklinik sebagai referensi utama layanan rawat jalan."
        totalCount={data.length}
      >
        <DataTable
          className="h-full"
          columns={columns}
          data={data}
          searchPlaceholder="Cari poliklinik berdasarkan nama atau kode..."
          pageSize={10}
          toolbarActions={
            hasPermission('polyclinics.create') ? (
              <Button onClick={() => navigate('/polyclinics/create')} className="rounded-none shadow-none">
                <Plus className="h-4 w-4" />
                Tambah Poliklinik
              </Button>
            ) : undefined
          }
        />
      </MasterDataListShell>
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus Poliklinik"
        description="Apakah Anda yakin ingin menghapus poliklinik ini? Tindakan ini tidak dapat dibatalkan."
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}
