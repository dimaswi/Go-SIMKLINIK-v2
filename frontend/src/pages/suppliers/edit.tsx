import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { suppliersApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Phone, Mail, MapPin } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function SupplierEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [formData, setFormData] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', is_active: true });

  useEffect(() => {
    setPageTitle('Edit Supplier');
    suppliersApi.getById(Number(id)).then(r => { const d = r.data.data; setFormData({ name: d.name, contact_person: d.contact_person, phone: d.phone, email: d.email, address: d.address, is_active: d.is_active }); }).catch(() => toast({ variant: "destructive", title: "Error!" })).finally(() => setFetching(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await suppliersApi.update(Number(id), formData); toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate('/suppliers'), 500); }
    catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); } finally { setLoading(false); }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <form id="supplier-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Edit Supplier"
        subtitle="Perbarui data pemasok yang dipakai modul pembelian dan stok tanpa mengubah struktur referensinya."
        onBack={() => navigate('/suppliers')}
        actions={<Button type="submit" form="supplier-edit-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview data supplier yang akan disimpan.">
                <div className="space-y-1"><p className="truncate font-medium">{formData.name || '-'}</p><p className="text-muted-foreground">{formData.contact_person || '-'}</p></div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6"><section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Supplier</Label><Input id="name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" /></div>
              <div className="space-y-2"><Label htmlFor="contact_person" className="text-xs font-medium flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />Contact Person</Label><Input id="contact_person" value={formData.contact_person} onChange={e => setFormData({ ...formData, contact_person: e.target.value })} className="h-10 text-sm" /></div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="phone" className="text-xs font-medium flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />Telepon</Label><Input id="phone" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="h-10 text-sm" /></div>
              <div className="space-y-2"><Label htmlFor="email" className="text-xs font-medium flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />Email</Label><Input id="email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="h-10 text-sm" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="address" className="text-xs font-medium flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />Alamat</Label><Input id="address" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="h-10 text-sm" /></div>
            <div className="flex items-center justify-between rounded-md border p-4"><div className="space-y-0.5"><Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label><p className="text-xs text-muted-foreground">{formData.is_active ? 'Aktif' : 'Tidak aktif'}</p></div><Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} /></div>
          </section></div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
