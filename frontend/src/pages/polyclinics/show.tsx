import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { polyclinicsApi } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ArrowLeft, Loader2, Edit, Trash2, Building2, Hash, Calendar, CircleCheck, CircleX } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

function formatDateTime(dateValue?: string) {
  if (!dateValue) return '-';
  return new Date(dateValue).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PolyclinicShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('Detail Poliklinik');
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const res = await polyclinicsApi.getById(Number(id));
      setData(res.data.data);
    } catch {
      toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data." });
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await polyclinicsApi.delete(parseInt(id!));
      toast({ variant: "success", title: "Berhasil!", description: "Poliklinik berhasil dihapus." });
      setTimeout(() => navigate('/polyclinics'), 500);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal menghapus." });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memuat detail poliklinik...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <p className="text-lg font-semibold">Poliklinik tidak ditemukan</p>
          <p className="mt-1 text-sm text-muted-foreground">Data ini tidak tersedia atau sudah dihapus.</p>
          <Button onClick={() => navigate('/polyclinics')} className="mt-5">Kembali</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => navigate('/polyclinics')} className="h-9 w-9 shrink-0 rounded-md">
                  <ArrowLeft className="h-4 w-4" /><span className="sr-only">Kembali</span>
                </Button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="h-6 rounded-md border-0 bg-sky-500 px-2 text-[11px] font-semibold text-white">ID #{data.id}</Badge>
                    <Badge className={data.is_active ? 'h-6 rounded-md border-0 bg-emerald-500 px-2 text-[11px] font-semibold text-white' : 'h-6 rounded-md border-0 bg-rose-500 px-2 text-[11px] font-semibold text-white'}>
                      {data.is_active ? 'AKTIF' : 'NONAKTIF'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasPermission('polyclinics.update') && (
                <Button size="sm" onClick={() => navigate(`/polyclinics/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>
              )}
              {hasPermission('polyclinics.delete') && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Kode</p>
              <p className="text-sm font-medium">{data.code}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Warna</p>
              <div className="flex items-center gap-2"><div className="h-4 w-4 rounded" style={{ backgroundColor: data.color || '#6B7280' }} /><p className="text-sm font-medium">{data.color || '-'}</p></div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Urutan</p>
              <p className="text-sm font-medium">{data.sort_order}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Status</p>
              <p className="text-sm font-medium">{data.is_active ? 'Aktif' : 'Nonaktif'}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle className="text-base">Informasi Utama</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Identitas</p>
                  <div className="space-y-2 text-sm">
                    <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{data.name}</p>
                    <p className="flex items-center gap-2"><Hash className="h-4 w-4 text-muted-foreground" />{data.code}</p>
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Detail</p>
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">{data.description || 'Belum ada deskripsi'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="flex items-center gap-2 font-medium">
                  {data.is_active ? <CircleCheck className="h-4 w-4 text-muted-foreground" /> : <CircleX className="h-4 w-4 text-destructive" />}
                  {data.is_active ? 'Aktif' : 'Tidak Aktif'}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Dibuat</p>
                <p className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4 text-muted-foreground" />{formatDateTime(data.created_at)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Terakhir Diubah</p>
                <p className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4 text-muted-foreground" />{formatDateTime(data.updated_at)}</p>
              </div>
              <Button className="w-full" variant="outline" onClick={() => navigate('/polyclinics')}>Kembali ke Daftar</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Poliklinik" description="Apakah Anda yakin ingin menghapus poliklinik ini? Tindakan ini tidak dapat dibatalkan." confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
