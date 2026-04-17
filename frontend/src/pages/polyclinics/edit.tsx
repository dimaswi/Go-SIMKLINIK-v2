import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BpjsReferencePicker } from '@/components/bpjs-reference-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useBpjsAntreanEnabled } from '@/hooks/use-bpjs-antrean-enabled';
import { polyclinicsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, Palette } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
}

export default function PolyclinicEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const { bpjsAntreanEnabled } = useBpjsAntreanEnabled();
  const [formData, setFormData] = useState({
    name: '', code: '', description: '', admin_fee: 0, is_active: true, color: '#3B82F6', icon: '', sort_order: 0, bpjs_poli_code: '',
  });
  // code is read-only on edit

  useEffect(() => {
    setPageTitle('Edit Poliklinik');
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const res = await polyclinicsApi.getById(Number(id));
      const d = res.data.data;
      setFormData({ name: d.name, code: d.code, description: d.description, admin_fee: d.admin_fee || 0, is_active: d.is_active, color: d.color || '#3B82F6', icon: d.icon || '', sort_order: d.sort_order || 0, bpjs_poli_code: d.bpjs_poli_code || '' });
    } catch {
      toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data poliklinik." });
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await polyclinicsApi.update(Number(id), { ...formData, admin_fee: Number(formData.admin_fee), sort_order: Number(formData.sort_order) });
      toast({ variant: "success", title: "Berhasil!", description: "Poliklinik berhasil diperbarui." });
      setTimeout(() => navigate('/polyclinics'), 500);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal memperbarui." });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <form id="polyclinic-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Edit Poliklinik"
        subtitle="Perbarui detail poliklinik tanpa mengubah keterkaitannya dengan jadwal dokter dan kunjungan."
        onBack={() => navigate('/polyclinics')}
        actions={<Button type="submit" form="polyclinic-edit-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Poliklinik</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview data poliklinik yang akan diperbarui.">
                <div className="space-y-1">
                  <div className="flex items-center gap-2"><div className="h-4 w-4 rounded" style={{ backgroundColor: formData.color || '#6B7280' }} /><p className="truncate font-medium">{formData.name || '-'}</p></div>
                  <p className="truncate text-muted-foreground">Kode: {formData.code || '-'}</p>
                  <p className="text-muted-foreground">Status: {formData.is_active ? 'Aktif' : 'Nonaktif'}</p>
                  <p className="text-muted-foreground">Admin: {formatCurrency(Number(formData.admin_fee) || 0)}</p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />Nama Poliklinik</Label>
                <Input id="name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Kode</Label>
                <div className="h-10 px-3 flex items-center rounded-md border bg-muted text-sm font-mono text-muted-foreground">{formData.code}</div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
              <Input id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="h-10 text-sm" />
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="admin_fee" className="text-xs font-medium">Biaya Administrasi</Label>
                <Input id="admin_fee" type="number" min="0" step="1000" value={formData.admin_fee} onChange={e => setFormData({ ...formData, admin_fee: Number(e.target.value) })} className="h-10 text-sm" />
                <p className="text-xs text-muted-foreground">Tagihan admin otomatis dibuat saat pasien didaftarkan ke poli ini.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="color" className="text-xs font-medium flex items-center gap-2"><Palette className="h-3.5 w-3.5 text-muted-foreground" />Warna</Label>
                <div className="flex gap-2">
                  <input type="color" id="color" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} className="h-10 w-12 rounded border cursor-pointer" />
                  <Input value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} className="h-10 text-sm flex-1" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="icon" className="text-xs font-medium">Icon</Label>
                <Input id="icon" value={formData.icon} onChange={e => setFormData({ ...formData, icon: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sort_order" className="text-xs font-medium">Urutan</Label>
                <Input id="sort_order" type="number" min="0" value={formData.sort_order} onChange={e => setFormData({ ...formData, sort_order: Number(e.target.value) })} className="h-10 text-sm" />
              </div>
              {bpjsAntreanEnabled ? (
                <div className="space-y-2 md:col-span-2 xl:col-span-2">
                  <Label htmlFor="bpjs_poli_code" className="text-xs font-medium">Kode Poli BPJS</Label>
                  <Input id="bpjs_poli_code" value={formData.bpjs_poli_code} onChange={e => setFormData({ ...formData, bpjs_poli_code: e.target.value })} className="h-10 text-sm" />
                  <BpjsReferencePicker type="poli" value={formData.bpjs_poli_code} onValueChange={(value) => setFormData({ ...formData, bpjs_poli_code: value })} disabled={loading} />
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label>
                <p className="text-xs text-muted-foreground">{formData.is_active ? 'Poliklinik aktif' : 'Poliklinik tidak aktif'}</p>
              </div>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
            </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
