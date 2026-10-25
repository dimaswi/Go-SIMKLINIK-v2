import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { paymentMethodsApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { Edit, Loader2, Trash2 } from 'lucide-react';
import {
  MasterDataDetailItem,
  MasterDataPageShell,
  MasterDataSection,
  formatMasterDataDateTime,
} from '@/pages/master-data/shared';

export default function PaymentMethodShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('Detail Metode Pembayaran');
    paymentMethodsApi.getById(Number(id))
      .then((response) => setData(response.data.data))
      .catch(() => toast({ variant: 'destructive', title: 'Error!' }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await paymentMethodsApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!' });
      setTimeout(() => navigate('/payment-methods'), 500);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal.' });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Data tidak ditemukan</p><Button onClick={() => navigate('/payment-methods')} className="mt-5">Kembali</Button></div></div>;
  }

  return (
    <>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Metode" description="Yakin hapus metode pembayaran ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />

      <MasterDataPageShell
        title={data.name}
        subtitle="Ringkasan metode pembayaran yang dipakai pada registrasi, kasir, dan transaksi klinik."
        onBack={() => navigate('/payment-methods')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{data.id}</Badge>
            <Badge className={data.is_active ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {data.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </>
        }
        actions={
          <>
            {hasPermission('payment_methods.update') && <Button className="rounded-none shadow-none" onClick={() => navigate(`/payment-methods/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>}
            {hasPermission('payment_methods.delete') && <Button variant="destructive" className="rounded-none shadow-none" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button>}
          </>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Informasi Metode Pembayaran" helper="Data referensi yang dipakai saat memilih cara pembayaran pasien.">
            <div className="grid gap-4 md:grid-cols-2">
              <MasterDataDetailItem label="Nama" value={data.name} />
              <MasterDataDetailItem label="Waktu Dibuat" value={formatMasterDataDateTime(data.created_at)} />
              <MasterDataDetailItem label="Terakhir Diubah" value={formatMasterDataDateTime(data.updated_at)} />
            </div>
          </MasterDataSection>
        </div>
      </MasterDataPageShell>
    </>
  );
}