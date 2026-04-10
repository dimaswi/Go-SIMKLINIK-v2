import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { physicalExamImagesApi, type PhysicalExamImageMaster } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { createPhysicalExamImageColumns } from './columns';

export default function PhysicalExamImagesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<PhysicalExamImageMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  useEffect(() => {
    setPageTitle('Template Gambar Pemeriksaan Fisik');
  }, []);

  const loadData = useCallback(async () => {
    try {
      setData((await physicalExamImagesApi.getAll()).data.data || []);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description: error.response?.data?.error || 'Gagal memuat template gambar.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) {
      return;
    }

    try {
      await physicalExamImagesApi.delete(itemToDelete);
      toast({ variant: 'success', title: 'Berhasil!' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description: error.response?.data?.error || 'Gagal menghapus template gambar.',
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = createPhysicalExamImageColumns({
    onEdit: (id) => navigate(`/physical-exam-images/${id}/edit`),
    onDelete: (id) => {
      setItemToDelete(id);
      setDeleteDialogOpen(true);
    },
    hasEditPermission: hasPermission('physical_exam_images.update'),
    hasDeletePermission: hasPermission('physical_exam_images.delete'),
  });

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
        data={data}
        searchPlaceholder="Cari template gambar..."
        pageSize={10}
        toolbarActions={hasPermission('physical_exam_images.create') ? (
          <Button onClick={() => navigate('/physical-exam-images/create')}>
            <Plus className="h-4 w-4" />
            Tambah Template
          </Button>
        ) : undefined}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus Template Gambar"
        description="Yakin hapus template gambar ini? Template yang sudah dipakai pada rekam medis tidak bisa dihapus."
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}