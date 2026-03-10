import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { suppliersApi } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ArrowLeft, Loader2, Edit, Trash2, Calendar, CircleCheck, CircleX, Phone, Mail, MapPin, User } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

function formatDateTime(d?: string) { if (!d) return '-'; return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export default function SupplierShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => { setPageTitle('Detail Supplier'); suppliersApi.getById(Number(id)).then(r => setData(r.data.data)).catch(() => toast({ variant: "destructive", title: "Error!" })).finally(() => setLoading(false)); }, [id]);

  const confirmDelete = async () => { setDeleting(true); setDeleteDialogOpen(false); try { await suppliersApi.delete(parseInt(id!)); toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate('/suppliers'), 500); } catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); setDeleting(false); } };

  if (loading) return <div className="flex h-[70vh] items-center justify-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /></div>;
  if (!data) return <div className="flex h-[70vh] items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Data tidak ditemukan</p><Button onClick={() => navigate('/suppliers')} className="mt-5">Kembali</Button></div></div>;

  return (
    <div className="p-4"><div className="space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0"><div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => navigate('/suppliers')} className="h-9 w-9 shrink-0 rounded-md"><ArrowLeft className="h-4 w-4" /></Button>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge className="h-6 rounded-md border-0 bg-sky-500 px-2 text-[11px] font-semibold text-white">ID #{data.id}</Badge><Badge className={data.is_active ? 'h-6 rounded-md border-0 bg-emerald-500 px-2 text-[11px] font-semibold text-white' : 'h-6 rounded-md border-0 bg-rose-500 px-2 text-[11px] font-semibold text-white'}>{data.is_active ? 'AKTIF' : 'NONAKTIF'}</Badge></div><p className="mt-1.5 text-sm text-muted-foreground">{data.contact_person || '-'}</p></div>
          </div></div>
          <div className="flex flex-wrap gap-2">
            {hasPermission('suppliers.update') && <Button size="sm" onClick={() => navigate(`/suppliers/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>}
            {hasPermission('suppliers.delete') && <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button>}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">Contact Person</p><p className="text-sm font-medium flex items-center gap-1"><User className="h-3.5 w-3.5" />{data.contact_person || '-'}</p></div>
          <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">Telepon</p><p className="text-sm font-medium flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{data.phone || '-'}</p></div>
          <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">Email</p><p className="text-sm font-medium flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{data.email || '-'}</p></div>
          <div className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">Status</p><p className="text-sm font-medium">{data.is_active ? 'Aktif' : 'Nonaktif'}</p></div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Informasi Supplier</CardTitle></CardHeader><CardContent>
          <div className="rounded-lg border p-4 text-sm space-y-2">
            <p><span className="text-muted-foreground">Nama: </span><span className="font-medium">{data.name}</span></p>
            <p><span className="text-muted-foreground">Contact Person: </span>{data.contact_person || '-'}</p>
            <p><span className="text-muted-foreground">Telepon: </span>{data.phone || '-'}</p>
            <p><span className="text-muted-foreground">Email: </span>{data.email || '-'}</p>
            <p className="flex items-start gap-1"><span className="text-muted-foreground"><MapPin className="inline h-3.5 w-3.5" /> Alamat: </span>{data.address || '-'}</p>
          </div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Status</p><p className="flex items-center gap-2 font-medium">{data.is_active ? <CircleCheck className="h-4 w-4 text-muted-foreground" /> : <CircleX className="h-4 w-4 text-destructive" />}{data.is_active ? 'Aktif' : 'Tidak Aktif'}</p></div>
          <div className="rounded-lg border p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Dibuat</p><p className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4 text-muted-foreground" />{formatDateTime(data.created_at)}</p></div>
          <div className="rounded-lg border p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Terakhir Diubah</p><p className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4 text-muted-foreground" />{formatDateTime(data.updated_at)}</p></div>
          <Button className="w-full" variant="outline" onClick={() => navigate('/suppliers')}>Kembali</Button>
        </CardContent></Card>
      </div>
    </div>
    <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Supplier" description="Yakin hapus supplier ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />
    </div>
  );
}
