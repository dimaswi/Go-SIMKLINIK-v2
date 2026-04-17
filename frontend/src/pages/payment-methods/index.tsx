import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { createPaymentMethodColumns } from './columns';
import { paymentMethodsApi, type PaymentMethod } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus } from 'lucide-react';
import { MasterDataListShell } from '@/pages/master-data/shared';

export default function PaymentMethodsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try { setData((await paymentMethodsApi.getAll()).data.data); } catch { toast({ variant: "destructive", title: "Error!" }); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { setPageTitle('Metode Pembayaran'); loadData(); }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try { await paymentMethodsApi.delete(itemToDelete); toast({ variant: "success", title: "Berhasil!" }); loadData(); }
    catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); }
    finally { setDeleteDialogOpen(false); setItemToDelete(null); }
  };

  const columns = createPaymentMethodColumns({
    onView: (id) => navigate(`/payment-methods/${id}`), onEdit: (id) => navigate(`/payment-methods/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('payment_methods.view'), hasEditPermission: hasPermission('payment_methods.update'), hasDeletePermission: hasPermission('payment_methods.delete'),
  });

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <MasterDataListShell
        title="Daftar Metode Pembayaran"
        subtitle="Kelola opsi pembayaran untuk proses registrasi, farmasi, dan transaksi klinik lainnya."
        totalCount={data.length}
      >
        <DataTable columns={columns} data={data} searchPlaceholder="Cari metode pembayaran..." pageSize={10} className="h-full"
          toolbarActions={hasPermission('payment_methods.create') ? <Button onClick={() => navigate('/payment-methods/create')} className="rounded-none shadow-none"><Plus className="h-4 w-4" />Tambah Metode</Button> : undefined} />
      </MasterDataListShell>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Metode Pembayaran" description="Yakin hapus metode pembayaran ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
