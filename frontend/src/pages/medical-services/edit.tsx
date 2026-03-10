import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { medicalServicesApi, serviceCategoriesApi, polyclinicsApi, type ServiceCategory, type Polyclinic } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

export default function MedicalServiceEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [formData, setFormData] = useState({ code: '', name: '', category_id: 0, polyclinic_id: '', price: 0, description: '', is_active: true }); // code is display-only

  useEffect(() => {
    setPageTitle('Edit Layanan Medis');
    Promise.all([medicalServicesApi.getById(Number(id)), serviceCategoriesApi.getAll(), polyclinicsApi.getAll()]).then(([sRes, cRes, pRes]) => {
      const d = sRes.data.data;
      setFormData({ code: d.code, name: d.name, category_id: d.category_id, polyclinic_id: d.polyclinic_id ? String(d.polyclinic_id) : '', price: d.price, description: d.description, is_active: d.is_active });
      setCategories(cRes.data.data); setPolyclinics(pRes.data.data);
    }).catch(() => toast({ variant: "destructive", title: "Error!" })).finally(() => setFetching(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await medicalServicesApi.update(Number(id), { ...formData, category_id: Number(formData.category_id), polyclinic_id: formData.polyclinic_id ? Number(formData.polyclinic_id) : null, price: Number(formData.price) });
      toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate('/medical-services'), 500);
    } catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); } finally { setLoading(false); }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label className="text-xs font-medium">Kode</Label><div className="h-10 px-3 flex items-center rounded-md border bg-muted text-sm font-mono text-muted-foreground">{formData.code || '-'}</div></div>
              <div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Layanan</Label><Input id="name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" /></div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className="space-y-2"><Label className="text-xs font-medium">Kategori</Label>
                <SearchableSelect
                  options={categories.map(c => ({ value: String(c.id), label: c.name }))}
                  value={formData.category_id ? String(formData.category_id) : ''}
                  onValueChange={v => setFormData({ ...formData, category_id: Number(v) })}
                  placeholder="Pilih kategori"
                  searchPlaceholder="Cari kategori..."
                />
              </div>
              <div className="space-y-2"><Label className="text-xs font-medium">Poliklinik</Label>
                <SearchableSelect
                  options={polyclinics.filter(p => p.is_active).map(p => ({ value: String(p.id), label: p.name }))}
                  value={formData.polyclinic_id}
                  onValueChange={v => setFormData({ ...formData, polyclinic_id: v })}
                  placeholder="Semua"
                  searchPlaceholder="Cari poliklinik..."
                  noneLabel="Semua Poliklinik"
                />
              </div>
              <div className="space-y-2"><Label htmlFor="price" className="text-xs font-medium">Tarif (Rp)</Label><Input id="price" type="number" min="0" value={formData.price} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} className="h-10 text-sm" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label><Input id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="h-10 text-sm" /></div>
            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="space-y-0.5"><Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label><p className="text-xs text-muted-foreground">{formData.is_active ? 'Aktif' : 'Tidak aktif'}</p></div>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
            </div>
          </section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan</p><div className="space-y-1"><p className="truncate font-medium">{formData.name || '-'}</p><p className="text-muted-foreground">Tarif: Rp {formData.price.toLocaleString('id-ID')}</p></div></div>
          <div className="rounded-lg border border-border/80 p-3"><div className="flex flex-col gap-2"><Button type="submit" disabled={loading} className="h-10">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update</Button><Button type="button" variant="outline" onClick={() => navigate('/medical-services')} className="h-10">Batal</Button></div></div>
        </aside>
      </form>
    </div>
  );
}
