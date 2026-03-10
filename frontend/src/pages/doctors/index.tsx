import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { createDoctorColumns } from './columns';
import { doctorsApi, type Doctor } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus } from 'lucide-react';

export default function DoctorsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await doctorsApi.getAll();
      setData(res.data.data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal memuat data." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Dokter');
    loadData();
  }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await doctorsApi.delete(itemToDelete);
      toast({ variant: "success", title: "Berhasil!", description: "Dokter berhasil dihapus." });
      loadData();
    } catch (error) {
      toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal menghapus." });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = createDoctorColumns({
    onView: (id) => navigate(`/doctors/${id}`),
    onEdit: (id) => navigate(`/doctors/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('doctors.view'),
    hasEditPermission: hasPermission('doctors.update'),
    hasDeletePermission: hasPermission('doctors.delete'),
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Cari dokter berdasarkan nama, spesialisasi, atau SIP..."
        pageSize={10}
        toolbarActions={
          hasPermission('doctors.create') ? (
            <Button onClick={() => navigate('/doctors/create')}><Plus className="h-4 w-4" />Tambah Dokter</Button>
          ) : undefined
        }
      />
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Dokter" description="Apakah Anda yakin ingin menghapus dokter ini? Tindakan ini tidak dapat dibatalkan." confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
