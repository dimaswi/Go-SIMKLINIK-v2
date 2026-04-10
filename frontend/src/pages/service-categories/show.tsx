import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { serviceCategoriesApi } from '@/lib/api';
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

export default function ServiceCategoryShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('Detail Kategori Layanan');
    serviceCategoriesApi.getById(Number(id))
      .then((response) => setData(response.data.data))
      .catch(() => toast({ variant: 'destructive', title: 'Error!' }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await serviceCategoriesApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!' });
      setTimeout(() => navigate('/service-categories'), 500);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal.' });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Data tidak ditemukan</p><Button onClick={() => navigate('/service-categories')} className="mt-5">Kembali</Button></div></div>;
  }

  return (
    <>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Kategori" description="Yakin hapus kategori ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />

      <MasterDataPageShell
        title={data.name}
        subtitle="Ringkasan kategori referensi untuk pengelompokan layanan medis dan tindakan klinik."
        onBack={() => navigate('/service-categories')}
        badges={<Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{data.id}</Badge>}
        actions={
          <>
            {hasPermission('service_categories.update') && <Button className="rounded-none shadow-none" onClick={() => navigate(`/service-categories/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>}
            {hasPermission('service_categories.delete') && <Button variant="destructive" className="rounded-none shadow-none" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button>}
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Metadata" helper="Riwayat pencatatan kategori layanan.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Dibuat: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.created_at)}</span></p>
                  <p>Terakhir diubah: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.updated_at)}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Informasi Kategori" helper="Nama kategori yang dipakai untuk mengelompokkan layanan medis.">
            <div className="grid gap-4 md:grid-cols-2">
              <MasterDataDetailItem label="Nama" value={data.name} />
            </div>
          </MasterDataSection>
        </div>
      </MasterDataPageShell>
    </>
  );
}