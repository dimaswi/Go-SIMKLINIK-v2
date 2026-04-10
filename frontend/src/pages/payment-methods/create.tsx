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
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

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
    <form id="payment-method-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Tambah Metode Pembayaran"
        subtitle="Siapkan metode pembayaran yang dapat dipilih saat pendaftaran, kasir, dan proses transaksi klinik."
        onBack={() => navigate('/payment-methods')}
        actions={<Button type="submit" form="payment-method-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview metode pembayaran yang akan ditambahkan.">
                <p className="truncate font-medium">{formData.name || 'Nama belum diisi'}</p>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6"><section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Metode</Label><Input id="name" required placeholder="Tunai" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" /></div>
            <div className="flex items-center justify-between rounded-md border p-4"><div className="space-y-0.5"><Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label><p className="text-xs text-muted-foreground">{formData.is_active ? 'Metode aktif' : 'Metode tidak aktif'}</p></div><Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} /></div>
          </section></div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
