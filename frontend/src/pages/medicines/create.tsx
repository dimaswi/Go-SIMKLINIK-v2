import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { medicinesApi, medicineCategoriesApi, unitsApi, type KFAProductDetail, type MedicineCategory, type Unit } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';
import { KFAProductPickerDialog } from './components/kfa-product-picker-dialog';
import { MedicineKFAMappingCard } from './components/medicine-kfa-mapping-card';

export default function MedicineCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [kfaDialogOpen, setKfaDialogOpen] = useState(false);
  const [kfaDetail, setKfaDetail] = useState<KFAProductDetail | null>(null);
  const [categories, setCategories] = useState<MedicineCategory[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [formData, setFormData] = useState({
    kfa_code: '', kfa_name: '',
    name: '', generic_name: '', category_id: 0, unit_id: 0,
    type: 'generic', form: '', strength: '', manufacturer: '',
    min_stock: 10, current_stock: 0, purchase_price: 0, selling_price: 0, is_active: true,
  });

  useEffect(() => {
    setPageTitle('Tambah Obat');
    Promise.all([medicineCategoriesApi.getAll(), unitsApi.getAll()]).then(([catRes, unitRes]) => {
      setCategories(catRes.data.data);
      setUnits(unitRes.data.data);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await medicinesApi.create({
        ...formData,
        category_id: Number(formData.category_id), unit_id: Number(formData.unit_id),
        min_stock: Number(formData.min_stock), current_stock: Number(formData.current_stock),
        purchase_price: Number(formData.purchase_price), selling_price: Number(formData.selling_price),
      });
      toast({ variant: "success", title: "Berhasil!", description: "Obat berhasil dibuat." });
      setTimeout(() => navigate('/medicines'), 400);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal membuat obat." });
    } finally { setLoading(false); }
  };

  const handleSelectKFA = (detail: KFAProductDetail) => {
    setKfaDetail(detail);
    const firstIngredientStrength = detail.active_ingredients?.[0]?.kekuatan_zat_aktif || '';
    setFormData((current) => ({
      ...current,
      kfa_code: detail.kfa_code || current.kfa_code,
      kfa_name: detail.name || current.kfa_name,
      name: current.name || detail.name || current.name,
      generic_name: current.generic_name || detail.product_template?.name || current.generic_name,
      form: detail.dosage_form?.name || current.form,
      strength: current.strength || firstIngredientStrength || current.strength,
      manufacturer: detail.manufacturer || current.manufacturer,
    }));
  };

  const handleClearMapping = () => {
    setKfaDetail(null);
    setFormData((current) => ({
      ...current,
      kfa_code: '',
      kfa_name: '',
    }));
  };

  return (
    <>
      <KFAProductPickerDialog open={kfaDialogOpen} onOpenChange={setKfaDialogOpen} onSelect={handleSelectKFA} />
      <form id="medicine-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <MasterDataPageShell
          title="Tambah Obat"
          subtitle="Master obat, stok farmasi, dan harga."
          onBack={() => navigate('/medicines')}
          actions={
            <Button type="submit" form="medicine-create-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Simpan Obat
            </Button>
          }
        >
          <div className="space-y-4">
            <MedicineKFAMappingCard
              kfaCode={formData.kfa_code}
              kfaName={formData.kfa_name}
              detail={kfaDetail}
              onPick={() => setKfaDialogOpen(true)}
              onClear={handleClearMapping}
            />

            <div className="space-y-2.5">
              <div className="border-b border-border/60 pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Identitas Obat</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs font-medium">Nama Obat *</Label>
                  <Input
                    id="name"
                    required
                    placeholder="Amoxicillin 500mg"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="generic_name" className="text-xs font-medium">Nama Generik</Label>
                  <Input
                    id="generic_name"
                    placeholder="Amoxicillin"
                    value={formData.generic_name}
                    onChange={e => setFormData({ ...formData, generic_name: e.target.value })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Kategori</Label>
                  <SearchableSelect
                    options={categories.map(c => ({ value: String(c.id), label: c.name }))}
                    value={formData.category_id ? String(formData.category_id) : ''}
                    onValueChange={v => setFormData({ ...formData, category_id: Number(v) })}
                    placeholder="Pilih kategori"
                    searchPlaceholder="Cari kategori..."
                    square
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Satuan</Label>
                  <SearchableSelect
                    options={units.map(u => ({ value: String(u.id), label: u.name }))}
                    value={formData.unit_id ? String(formData.unit_id) : ''}
                    onValueChange={v => setFormData({ ...formData, unit_id: Number(v) })}
                    placeholder="Pilih satuan"
                    searchPlaceholder="Cari satuan..."
                    square
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
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
                    square
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="form" className="text-xs font-medium">Bentuk Sediaan</Label>
                  <Input
                    id="form"
                    placeholder="Tablet / Sirup / Kapsul"
                    value={formData.form}
                    onChange={e => setFormData({ ...formData, form: e.target.value })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="strength" className="text-xs font-medium">Kekuatan</Label>
                  <Input
                    id="strength"
                    placeholder="500mg"
                    value={formData.strength}
                    onChange={e => setFormData({ ...formData, strength: e.target.value })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="border-b border-border/60 pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Stok & Harga</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="min_stock" className="text-xs font-medium">Stok Min.</Label>
                  <Input
                    id="min_stock"
                    type="number"
                    min="0"
                    value={formData.min_stock}
                    onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="current_stock" className="text-xs font-medium">Stok Saat Ini</Label>
                  <Input
                    id="current_stock"
                    type="number"
                    min="0"
                    value={formData.current_stock}
                    onChange={e => setFormData({ ...formData, current_stock: Number(e.target.value) })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="purchase_price" className="text-xs font-medium">Harga Beli</Label>
                  <Input
                    id="purchase_price"
                    type="number"
                    min="0"
                    value={formData.purchase_price}
                    onChange={e => setFormData({ ...formData, purchase_price: Number(e.target.value) })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="selling_price" className="text-xs font-medium">Harga Jual</Label>
                  <Input
                    id="selling_price"
                    type="number"
                    min="0"
                    value={formData.selling_price}
                    onChange={e => setFormData({ ...formData, selling_price: Number(e.target.value) })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
                <div>
                  <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label>
                  <p className="text-[11px] text-muted-foreground">{formData.is_active ? 'Obat aktif dan dapat diresepkan' : 'Obat nonaktif'}</p>
                </div>
                <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
              </div>
            </div>
          </div>
        </MasterDataPageShell>
      </form>
    </>
  );
}
