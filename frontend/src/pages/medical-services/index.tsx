import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { createMedicalServiceColumns } from './columns';
import { medicalServicesApi, type MedicalService } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus } from 'lucide-react';

export default function MedicalServicesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<MedicalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try { setData((await medicalServicesApi.getAll()).data.data); } catch { toast({ variant: "destructive", title: "Error!" }); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { setPageTitle('Layanan Medis'); loadData(); }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try { await medicalServicesApi.delete(itemToDelete); toast({ variant: "success", title: "Berhasil!" }); loadData(); }
    catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); }
    finally { setDeleteDialogOpen(false); setItemToDelete(null); }
  };

  const columns = createMedicalServiceColumns({
    onView: (id) => navigate(`/medical-services/${id}`), onEdit: (id) => navigate(`/medical-services/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('medical_services.view'), hasEditPermission: hasPermission('medical_services.update'), hasDeletePermission: hasPermission('medical_services.delete'),
  });

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <DataTable columns={columns} data={data} searchPlaceholder="Cari layanan medis..." pageSize={10}
        toolbarActions={hasPermission('medical_services.create') ? <Button onClick={() => navigate('/medical-services/create')}><Plus className="h-4 w-4" />Tambah Layanan</Button> : undefined} />
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Layanan" description="Yakin hapus layanan ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
