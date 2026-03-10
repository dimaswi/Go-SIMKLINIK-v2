import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { medicinesApi, medicineCategoriesApi, unitsApi, type MedicineCategory, type Unit } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Pill, DollarSign } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

export default function MedicineEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [categories, setCategories] = useState<MedicineCategory[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [formData, setFormData] = useState({
    code: '', name: '', generic_name: '', category_id: 0, unit_id: 0,
    type: 'generic', form: '', strength: '', manufacturer: '',
    min_stock: 10, current_stock: 0, purchase_price: 0, selling_price: 0, is_active: true,
  });

  useEffect(() => {
    setPageTitle('Edit Obat');
    Promise.all([medicinesApi.getById(Number(id)), medicineCategoriesApi.getAll(), unitsApi.getAll()]).then(([medRes, catRes, unitRes]) => {
      const d = medRes.data.data;
      setFormData({ code: d.code, name: d.name, generic_name: d.generic_name, category_id: d.category_id, unit_id: d.unit_id, type: d.type, form: d.form, strength: d.strength, manufacturer: d.manufacturer, min_stock: d.min_stock, current_stock: d.current_stock, purchase_price: d.purchase_price, selling_price: d.selling_price, is_active: d.is_active });
      setCategories(catRes.data.data);
      setUnits(unitRes.data.data);
    }).catch(() => toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data." })).finally(() => setFetching(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await medicinesApi.update(Number(id), {
        ...formData, category_id: Number(formData.category_id), unit_id: Number(formData.unit_id),
        min_stock: Number(formData.min_stock), current_stock: Number(formData.current_stock),
        purchase_price: Number(formData.purchase_price), selling_price: Number(formData.selling_price),
      });
      toast({ variant: "success", title: "Berhasil!", description: "Obat berhasil diperbarui." });
      setTimeout(() => navigate('/medicines'), 500);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal memperbarui." });
    } finally { setLoading(false); }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Kode Obat</Label>
                <div className="h-10 px-3 flex items-center rounded-md border bg-muted text-sm font-mono text-muted-foreground">{formData.code}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium flex items-center gap-2"><Pill className="h-3.5 w-3.5 text-muted-foreground" />Nama Obat</Label>
                <Input id="name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="generic_name" className="text-xs font-medium">Nama Generik</Label>
              <Input id="generic_name" value={formData.generic_name} onChange={e => setFormData({ ...formData, generic_name: e.target.value })} className="h-10 text-sm" />
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Kategori</Label>
                <SearchableSelect
                  options={categories.map(c => ({ value: String(c.id), label: c.name }))}
                  value={formData.category_id ? String(formData.category_id) : ''}
                  onValueChange={v => setFormData({ ...formData, category_id: Number(v) })}
                  placeholder="Pilih kategori"
                  searchPlaceholder="Cari kategori..."
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Satuan</Label>
                <SearchableSelect
                  options={units.map(u => ({ value: String(u.id), label: u.name }))}
                  value={formData.unit_id ? String(formData.unit_id) : ''}
                  onValueChange={v => setFormData({ ...formData, unit_id: Number(v) })}
                  placeholder="Pilih satuan"
                  searchPlaceholder="Cari satuan..."
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Tipe</Label>
                <SearchableSelect
                  options={[
                    { value: 'generic', label: 'Generic' },
                    { value: 'patent', label: 'Patent' },
                    { value: 'herbal', label: 'Herbal' },
                    { value: 'otc', label: 'OTC' },
                  ]}
                  value={formData.type}
                  onValueChange={v => setFormData({ ...formData, type: v })}
                  searchPlaceholder="Cari tipe..."
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="form" className="text-xs font-medium">Bentuk Sediaan</Label>
                <Input id="form" value={formData.form} onChange={e => setFormData({ ...formData, form: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="strength" className="text-xs font-medium">Kekuatan</Label>
                <Input id="strength" value={formData.strength} onChange={e => setFormData({ ...formData, strength: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manufacturer" className="text-xs font-medium">Produsen</Label>
                <Input id="manufacturer" value={formData.manufacturer} onChange={e => setFormData({ ...formData, manufacturer: e.target.value })} className="h-10 text-sm" />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <p className="text-sm font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" />Stok & Harga</p>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2"><Label htmlFor="min_stock" className="text-xs font-medium">Stok Minimum</Label><Input id="min_stock" type="number" min="0" value={formData.min_stock} onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })} className="h-10 text-sm" /></div>
              <div className="space-y-2"><Label htmlFor="current_stock" className="text-xs font-medium">Stok Saat Ini</Label><Input id="current_stock" type="number" min="0" value={formData.current_stock} onChange={e => setFormData({ ...formData, current_stock: Number(e.target.value) })} className="h-10 text-sm" /></div>
              <div className="space-y-2"><Label htmlFor="purchase_price" className="text-xs font-medium">Harga Beli</Label><Input id="purchase_price" type="number" min="0" value={formData.purchase_price} onChange={e => setFormData({ ...formData, purchase_price: Number(e.target.value) })} className="h-10 text-sm" /></div>
              <div className="space-y-2"><Label htmlFor="selling_price" className="text-xs font-medium">Harga Jual</Label><Input id="selling_price" type="number" min="0" value={formData.selling_price} onChange={e => setFormData({ ...formData, selling_price: Number(e.target.value) })} className="h-10 text-sm" /></div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="space-y-0.5"><Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label><p className="text-xs text-muted-foreground">{formData.is_active ? 'Obat aktif' : 'Obat tidak aktif'}</p></div>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan</p>
            <div className="space-y-1">
              <p className="truncate font-medium">{formData.name || '-'}</p>
              <p className="truncate text-muted-foreground">Kode: {formData.code || '-'}</p>
              <p className="text-muted-foreground">Tipe: {formData.type}</p>
              <p className="text-muted-foreground">Harga: Rp {formData.selling_price.toLocaleString('id-ID')}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border/80 p-3">
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={loading} className="h-10">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Obat</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/medicines')} className="h-10">Batal</Button>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
