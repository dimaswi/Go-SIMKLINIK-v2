import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { suppliersApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { Edit, Loader2, Trash2 } from 'lucide-react';
import {
  MasterDataAsideSection,
  MasterDataAsideStack,
  MasterDataDetailItem,
  MasterDataPageShell,
  MasterDataSection,
  formatMasterDataDateTime,
} from '@/pages/master-data/shared';

export default function SupplierShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('Detail Supplier');
    suppliersApi.getById(Number(id))
      .then((response) => setData(response.data.data))
      .catch(() => toast({ variant: 'destructive', title: 'Error!' }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await suppliersApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!' });
      setTimeout(() => navigate('/suppliers'), 500);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal.' });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Data tidak ditemukan</p><Button onClick={() => navigate('/suppliers')} className="mt-5">Kembali</Button></div></div>;
  }

  return (
    <>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Supplier" description="Yakin hapus supplier ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />

      <MasterDataPageShell
        title={data.name}
        subtitle={data.contact_person || 'Ringkasan data kontak dan alamat supplier.'}
        onBack={() => navigate('/suppliers')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{data.id}</Badge>
            <Badge className={data.is_active ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {data.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </>
        }
        meta={
          <>
            <span>Telepon {data.phone || '-'}</span>
            <span>Email {data.email || '-'}</span>
          </>
        }
        actions={
          <>
            {hasPermission('suppliers.update') && <Button className="rounded-none shadow-none" onClick={() => navigate(`/suppliers/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>}
            {hasPermission('suppliers.delete') && <Button variant="destructive" className="rounded-none shadow-none" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button>}
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Metadata" helper="Status dan jejak perubahan data supplier.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Status: <span className="font-medium text-foreground">{data.is_active ? 'Aktif' : 'Tidak aktif'}</span></p>
                  <p>Dibuat: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.created_at)}</span></p>
                  <p>Terakhir diubah: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.updated_at)}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Informasi Supplier" helper="Data kontak pemasok yang dipakai pada pembelian dan pengadaan.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MasterDataDetailItem label="Nama" value={data.name} />
              <MasterDataDetailItem label="Contact Person" value={data.contact_person || '-'} />
              <MasterDataDetailItem label="Telepon" value={data.phone || '-'} />
              <MasterDataDetailItem label="Email" value={data.email || '-'} />
              <MasterDataDetailItem label="Status" value={data.is_active ? 'Aktif' : 'Tidak aktif'} />
              <MasterDataDetailItem label="Alamat" value={data.address || '-'} />
            </div>
          </MasterDataSection>
        </div>
      </MasterDataPageShell>
    </>
  );
}