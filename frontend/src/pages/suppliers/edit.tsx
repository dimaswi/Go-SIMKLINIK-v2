import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { suppliersApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';

export default function SupplierEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [formData, setFormData] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', is_active: true });

  useEffect(() => {
    setPageTitle('Edit Supplier');
    suppliersApi.getById(Number(id)).then(r => {
      const d = r.data.data;
      setFormData({ name: d.name, contact_person: d.contact_person, phone: d.phone, email: d.email, address: d.address, is_active: d.is_active });
    }).catch(() => toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data supplier." })).finally(() => setFetching(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await suppliersApi.update(Number(id), formData);
      toast({ variant: "success", title: "Berhasil!", description: "Supplier berhasil diperbarui." });
      setTimeout(() => navigate('/suppliers'), 400);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal memperbarui supplier." });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <form id="supplier-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit Supplier"
        subtitle="Perbarui data pemasok logistik farmasi / klinik."
        onBack={() => navigate('/suppliers')}
        actions={
          <Button type="submit" form="supplier-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update Supplier
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Pemasok / Vendor</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium">Nama Supplier *</Label>
                <Input
                  id="name"
                  required
                  placeholder="Nama supplier"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="contact_person" className="text-xs font-medium">Contact Person</Label>
                <Input
                  id="contact_person"
                  placeholder="Nama kontak PIC"
                  value={formData.contact_person}
                  onChange={e => setFormData({ ...formData, contact_person: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-medium">Telepon / WA</Label>
                <Input
                  id="phone"
                  placeholder="08xxxxxxxxxx"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="supplier@example.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1 lg:col-span-2">
                <Label htmlFor="address" className="text-xs font-medium">Alamat</Label>
                <Input
                  id="address"
                  placeholder="Alamat kantor / gudang supplier"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
              <div>
                <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label>
                <p className="text-[11px] text-muted-foreground">{formData.is_active ? 'Supplier aktif beroperasi' : 'Supplier nonaktif'}</p>
              </div>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
