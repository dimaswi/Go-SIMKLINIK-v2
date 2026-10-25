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
import { MasterDataPageShell } from '@/pages/master-data/shared';

export default function PaymentMethodCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', is_active: true });

  useEffect(() => { setPageTitle('Tambah Metode Pembayaran'); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await paymentMethodsApi.create(formData);
      toast({ variant: "success", title: "Berhasil!", description: "Metode pembayaran berhasil dibuat." });
      setTimeout(() => navigate('/payment-methods'), 400);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal membuat metode pembayaran." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="payment-method-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Tambah Metode Pembayaran"
        subtitle="Metode pembayaran pendaftaran dan kasir."
        onBack={() => navigate('/payment-methods')}
        actions={
          <Button type="submit" form="payment-method-create-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Simpan Metode
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Metode Pembayaran</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium">Nama Metode *</Label>
                <Input
                  id="name"
                  required
                  placeholder="Contoh: Tunai, Transfer BCA, QRIS"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
              <div>
                <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label>
                <p className="text-[11px] text-muted-foreground">{formData.is_active ? 'Metode pembayaran aktif digunakan' : 'Metode nonaktif'}</p>
              </div>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
