import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { serviceCategoriesApi } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ArrowLeft, Loader2, Edit, Trash2, Calendar } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

function formatDateTime(d?: string) { if (!d) return '-'; return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export default function ServiceCategoryShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => { setPageTitle('Detail Kategori Layanan'); serviceCategoriesApi.getById(Number(id)).then(r => setData(r.data.data)).catch(() => toast({ variant: "destructive", title: "Error!" })).finally(() => setLoading(false)); }, [id]);

  const confirmDelete = async () => { setDeleting(true); setDeleteDialogOpen(false); try { await serviceCategoriesApi.delete(parseInt(id!)); toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate('/service-categories'), 500); } catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); setDeleting(false); } };

  if (loading) return <div className="flex h-[70vh] items-center justify-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /></div>;
  if (!data) return <div className="flex h-[70vh] items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Data tidak ditemukan</p><Button onClick={() => navigate('/service-categories')} className="mt-5">Kembali</Button></div></div>;

  return (
    <div className="p-4"><div className="space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => navigate('/service-categories')} className="h-9 w-9 shrink-0 rounded-md"><ArrowLeft className="h-4 w-4" /></Button>
            <div className="flex flex-wrap items-center gap-2"><Badge className="h-6 rounded-md border-0 bg-sky-500 px-2 text-[11px] font-semibold text-white">ID #{data.id}</Badge></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPermission('service_categories.update') && <Button size="sm" onClick={() => navigate(`/service-categories/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>}
            {hasPermission('service_categories.delete') && <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button>}
          </div>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Informasi</CardTitle></CardHeader><CardContent><div className="rounded-lg border p-4 text-sm"><p><span className="text-muted-foreground">Nama: </span><span className="font-medium">{data.name}</span></p></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Dibuat</p><p className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4 text-muted-foreground" />{formatDateTime(data.created_at)}</p></div>
          <div className="rounded-lg border p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Terakhir Diubah</p><p className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4 text-muted-foreground" />{formatDateTime(data.updated_at)}</p></div>
          <Button className="w-full" variant="outline" onClick={() => navigate('/service-categories')}>Kembali</Button>
        </CardContent></Card>
      </div>
    </div>
    <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Kategori" description="Yakin hapus kategori ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
