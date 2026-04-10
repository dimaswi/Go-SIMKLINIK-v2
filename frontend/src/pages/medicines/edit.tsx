import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { medicinesApi, medicineCategoriesApi, unitsApi, type KFAProductDetail, type MedicineCategory, type Unit } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Pill, DollarSign } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';
import { KFAProductPickerDialog } from './components/kfa-product-picker-dialog';
import { MedicineKFAMappingCard } from './components/medicine-kfa-mapping-card';

export default function MedicineEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [kfaDialogOpen, setKfaDialogOpen] = useState(false);
  const [loadingKFADetail, setLoadingKFADetail] = useState(false);
  const [kfaDetail, setKfaDetail] = useState<KFAProductDetail | null>(null);
  const [categories, setCategories] = useState<MedicineCategory[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [formData, setFormData] = useState({
    code: '', kfa_code: '', kfa_name: '', satusehat_medication_id: '', satusehat_medication_synced_at: '', name: '', generic_name: '', category_id: 0, unit_id: 0,
    type: 'generic', form: '', strength: '', manufacturer: '',
    min_stock: 10, current_stock: 0, purchase_price: 0, selling_price: 0, is_active: true,
  });

  useEffect(() => {
    setPageTitle('Edit Obat');
    Promise.all([medicinesApi.getById(Number(id)), medicineCategoriesApi.getAll(), unitsApi.getAll()]).then(([medRes, catRes, unitRes]) => {
      const d = medRes.data.data;
      setFormData({ code: d.code, kfa_code: d.kfa_code || '', kfa_name: d.kfa_name || '', satusehat_medication_id: d.satusehat_medication_id || '', satusehat_medication_synced_at: d.satusehat_medication_synced_at || '', name: d.name, generic_name: d.generic_name, category_id: d.category_id, unit_id: d.unit_id, type: d.type, form: d.form, strength: d.strength, manufacturer: d.manufacturer, min_stock: d.min_stock, current_stock: d.current_stock, purchase_price: d.purchase_price, selling_price: d.selling_price, is_active: d.is_active });
      setCategories(catRes.data.data);
      setUnits(unitRes.data.data);
    }).catch(() => toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data." })).finally(() => setFetching(false));
  }, [id]);

  useEffect(() => {
    const code = formData.kfa_code?.trim();
    if (!code) {
      setKfaDetail(null);
      setLoadingKFADetail(false);
      return;
    }

    let cancelled = false;
    setLoadingKFADetail(true);

    medicinesApi.getKFADetail(code)
      .then((response) => {
        if (cancelled) return;
        setKfaDetail(response.data.data || null);
      })
      .catch(() => {
        if (cancelled) return;
        setKfaDetail(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingKFADetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [formData.kfa_code]);

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

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <>
      <KFAProductPickerDialog open={kfaDialogOpen} onOpenChange={setKfaDialogOpen} onSelect={handleSelectKFA} />
      <form id="medicine-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Edit Obat"
        subtitle="Perbarui item obat yang sudah terdaftar tanpa kehilangan referensi kode dan kategori stoknya."
        onBack={() => navigate('/medicines')}
        actions={<Button type="submit" form="medicine-edit-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Obat</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview obat yang akan diperbarui.">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="truncate font-medium">{formData.name || '-'}</p>
                    <p className="truncate text-muted-foreground">Kode lokal: {formData.code || '-'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-none">{formData.type || 'generic'}</Badge>
                    <Badge variant={formData.kfa_code ? 'default' : 'secondary'} className="rounded-none">{formData.kfa_code ? 'KFA siap' : 'Belum mapped'}</Badge>
                  </div>
                  <div className="space-y-1 text-muted-foreground">
                    <p>Harga jual: <span className="font-medium text-foreground">Rp {formData.selling_price.toLocaleString('id-ID')}</span></p>
                    <p>Stok saat ini: <span className="font-medium text-foreground">{formData.current_stock}</span></p>
                    <p>Status: <span className="font-medium text-foreground">{formData.is_active ? 'Aktif' : 'Nonaktif'}</span></p>
                  </div>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="KFA Mapping" helper="Pemetaan ini yang dipakai saat Medication SATUSEHAT dibentuk dari obat lokal.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Kode KFA: <span className="font-medium text-foreground">{formData.kfa_code || '-'}</span></p>
                  <p>Nama KFA: <span className="font-medium text-foreground">{formData.kfa_name || '-'}</span></p>
                  <p>Medication SATUSEHAT: <span className="font-medium text-foreground">{formData.satusehat_medication_id || '-'}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <MedicineKFAMappingCard
              kfaCode={formData.kfa_code}
              kfaName={formData.kfa_name}
              detail={kfaDetail}
              loading={loadingKFADetail}
              medicationId={formData.satusehat_medication_id}
              medicationSyncedAt={formData.satusehat_medication_synced_at}
              onPick={() => setKfaDialogOpen(true)}
              onClear={handleClearMapping}
            />
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
        </MasterDataLegacySections>
      </MasterDataPageShell>
      </form>
    </>
  );
}
