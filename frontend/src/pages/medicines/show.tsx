import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { medicinesApi } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ArrowLeft, Loader2, Edit, Trash2, Calendar, Pill, Hash, CircleCheck, CircleX } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

function formatDateTime(dateValue?: string) {
  if (!dateValue) return '-';
  return new Date(dateValue).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MedicineShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('Detail Obat');
    medicinesApi.getById(Number(id)).then(res => setData(res.data.data)).catch(() => toast({ variant: "destructive", title: "Error!" })).finally(() => setLoading(false));
  }, [id]);

  const confirmDelete = async () => {
    setDeleting(true); setDeleteDialogOpen(false);
    try { await medicinesApi.delete(parseInt(id!)); toast({ variant: "success", title: "Berhasil!", description: "Obat berhasil dihapus." }); setTimeout(() => navigate('/medicines'), 500); }
    catch (error: any) { toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal menghapus." }); setDeleting(false); }
  };

  if (loading) return <div className="flex h-[70vh] items-center justify-center"><div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm"><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Memuat data...</p></div></div>;
  if (!data) return <div className="flex h-[70vh] items-center justify-center"><div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm"><p className="text-lg font-semibold">Data tidak ditemukan</p><Button onClick={() => navigate('/medicines')} className="mt-5">Kembali</Button></div></div>;

  return (
    <div className="p-4">
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => navigate('/medicines')} className="h-9 w-9 shrink-0 rounded-md"><ArrowLeft className="h-4 w-4" /></Button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="h-6 rounded-md border-0 bg-sky-500 px-2 text-[11px] font-semibold text-white">ID #{data.id}</Badge>
                    <Badge className={data.is_active ? 'h-6 rounded-md border-0 bg-emerald-500 px-2 text-[11px] font-semibold text-white' : 'h-6 rounded-md border-0 bg-rose-500 px-2 text-[11px] font-semibold text-white'}>{data.is_active ? 'AKTIF' : 'NONAKTIF'}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{data.code} · {data.generic_name || '-'}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasPermission('medicines.update') && <Button size="sm" onClick={() => navigate(`/medicines/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>}
              {hasPermission('medicines.delete') && <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button>}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">Kategori</p><p className="text-sm font-medium">{data.category?.name || '-'}</p></div>
            <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">Tipe</p><p className="text-sm font-medium">{data.type?.toUpperCase() || '-'}</p></div>
            <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">Stok</p><p className={`text-sm font-medium ${data.current_stock <= data.min_stock ? 'text-destructive' : ''}`}>{data.current_stock} {data.unit?.name || ''}</p></div>
            <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">Harga Jual</p><p className="text-sm font-medium">Rp {data.selling_price?.toLocaleString('id-ID')}</p></div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle className="text-base">Informasi Obat</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Identitas</p>
                  <div className="space-y-2 text-sm">
                    <p className="flex items-center gap-2"><Hash className="h-4 w-4 text-muted-foreground" />{data.code}</p>
                    <p className="flex items-center gap-2"><Pill className="h-4 w-4 text-muted-foreground" />{data.name}</p>
                    <p className="text-muted-foreground">Generik: {data.generic_name || '-'}</p>
                    <p className="text-muted-foreground">Bentuk: {data.form || '-'}</p>
                    <p className="text-muted-foreground">Kekuatan: {data.strength || '-'}</p>
                    <p className="text-muted-foreground">Produsen: {data.manufacturer || '-'}</p>
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Stok & Harga</p>
                  <div className="space-y-2 text-sm">
                    <p>Stok Minimum: <span className="font-medium">{data.min_stock}</span></p>
                    <p>Stok Saat Ini: <span className={`font-medium ${data.current_stock <= data.min_stock ? 'text-destructive' : ''}`}>{data.current_stock}</span></p>
                    <p>Harga Beli: <span className="font-medium">Rp {data.purchase_price?.toLocaleString('id-ID')}</span></p>
                    <p>Harga Jual: <span className="font-medium">Rp {data.selling_price?.toLocaleString('id-ID')}</span></p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Status</p><p className="flex items-center gap-2 font-medium">{data.is_active ? <CircleCheck className="h-4 w-4 text-muted-foreground" /> : <CircleX className="h-4 w-4 text-destructive" />}{data.is_active ? 'Aktif' : 'Tidak Aktif'}</p></div>
              <div className="rounded-lg border p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Dibuat</p><p className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4 text-muted-foreground" />{formatDateTime(data.created_at)}</p></div>
              <div className="rounded-lg border p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Terakhir Diubah</p><p className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4 text-muted-foreground" />{formatDateTime(data.updated_at)}</p></div>
              <Button className="w-full" variant="outline" onClick={() => navigate('/medicines')}>Kembali ke Daftar</Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Obat" description="Apakah Anda yakin ingin menghapus obat ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
