import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { serviceCategoriesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

export default function ServiceCategoryCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { setPageTitle('Tambah Kategori Layanan'); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await serviceCategoriesApi.create({ name }); toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate('/service-categories'), 400); }
    catch (error: any) { toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal membuat." }); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6"><section className="space-y-4 rounded-lg border border-border/80 p-5"><div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Kategori</Label><Input id="name" required placeholder="Contoh: Tindakan Medis" value={name} onChange={e => setName(e.target.value)} className="h-10 text-sm" /></div></section></div>
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan</p><p className="truncate font-medium">{name || 'Nama belum diisi'}</p></div>
          <div className="rounded-lg border border-border/80 p-3"><div className="flex flex-col gap-2"><Button type="submit" disabled={loading} className="h-10">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button><Button type="button" variant="outline" onClick={() => navigate('/service-categories')} className="h-10">Batal</Button></div></div>
        </aside>
      </form>
    </div>
  );
}
