import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { paymentMethodsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

export default function PaymentMethodCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', is_active: true });

  useEffect(() => { setPageTitle('Tambah Metode Pembayaran'); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await paymentMethodsApi.create(formData); toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate('/payment-methods'), 400); }
    catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); } finally { setLoading(false); }
  };

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6"><section className="space-y-4 rounded-lg border border-border/80 p-5">
          <div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Metode</Label><Input id="name" required placeholder="Tunai" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" /></div>
          <div className="flex items-center justify-between rounded-md border p-4"><div className="space-y-0.5"><Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label><p className="text-xs text-muted-foreground">{formData.is_active ? 'Metode aktif' : 'Metode tidak aktif'}</p></div><Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} /></div>
        </section></div>
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan</p><p className="truncate font-medium">{formData.name || 'Nama belum diisi'}</p></div>
          <div className="rounded-lg border border-border/80 p-3"><div className="flex flex-col gap-2"><Button type="submit" disabled={loading} className="h-10">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button><Button type="button" variant="outline" onClick={() => navigate('/payment-methods')} className="h-10">Batal</Button></div></div>
        </aside>
      </form>
    </div>
  );
}
