import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { createMedicineColumns } from './columns';
import { medicinesApi, type Medicine } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus } from 'lucide-react';

export default function MedicinesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try { const res = await medicinesApi.getAll(); setData(res.data.data); }
    catch (error) { toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal memuat data." }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { setPageTitle('Obat'); loadData(); }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try { await medicinesApi.delete(itemToDelete); toast({ variant: "success", title: "Berhasil!", description: "Obat berhasil dihapus." }); loadData(); }
    catch (error: any) { toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal menghapus." }); }
    finally { setDeleteDialogOpen(false); setItemToDelete(null); }
  };

  const columns = createMedicineColumns({
    onView: (id) => navigate(`/medicines/${id}`),
    onEdit: (id) => navigate(`/medicines/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('medicines.view'),
    hasEditPermission: hasPermission('medicines.update'),
    hasDeletePermission: hasPermission('medicines.delete'),
  });

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <DataTable columns={columns} data={data} searchPlaceholder="Cari obat berdasarkan nama, kode, atau nama generik..." pageSize={10}
        toolbarActions={hasPermission('medicines.create') ? <Button onClick={() => navigate('/medicines/create')}><Plus className="h-4 w-4" />Tambah Obat</Button> : undefined}
      />
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Obat" description="Apakah Anda yakin ingin menghapus obat ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
