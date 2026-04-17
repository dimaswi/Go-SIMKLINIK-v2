import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { createSpecimenTemplateColumns } from './columns';
import { specimenTemplatesApi, type SpecimenTemplate } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { FlaskConical, Loader2, Plus } from 'lucide-react';
import { MasterDataListShell } from '@/pages/master-data/shared';

export default function SpecimenTemplatesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<SpecimenTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await specimenTemplatesApi.getAll();
      setData(res.data.data);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error!', description: error instanceof Error ? error.message : 'Gagal memuat template specimen.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { setPageTitle('Template Specimen'); loadData(); }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await specimenTemplatesApi.delete(itemToDelete);
      toast({ variant: 'success', title: 'Berhasil!', description: 'Template specimen berhasil dihapus.' });
      loadData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal menghapus template specimen.' });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = createSpecimenTemplateColumns({
    onView: (id) => navigate(`/specimen-templates/${id}`),
    onEdit: (id) => navigate(`/specimen-templates/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('medical_services.view'),
    hasEditPermission: hasPermission('medical_services.update'),
    hasDeletePermission: hasPermission('medical_services.delete'),
  });

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <MasterDataListShell
        title="Daftar Template Specimen"
        subtitle="Kelola template specimen laboratorium dan kode SNOMED sebagai referensi order pemeriksaan."
        totalCount={data.length}
      >
        <DataTable
          className="h-full"
          columns={columns}
          data={data}
          searchPlaceholder="Cari template specimen atau kode SNOMED..."
          pageSize={10}
          toolbarActions={hasPermission('medical_services.create') ? <Button onClick={() => navigate('/specimen-templates/create')} className="rounded-none shadow-none"><Plus className="h-4 w-4" />Tambah Template</Button> : undefined}
          emptyMessage={<div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground"><FlaskConical className="h-8 w-8" /><p>Belum ada template specimen.</p></div>}
        />
      </MasterDataListShell>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Template Specimen" description="Apakah Anda yakin ingin menghapus template specimen ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}