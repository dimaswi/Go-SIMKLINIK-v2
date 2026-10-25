import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { medicalServicesApi, serviceCategoriesApi, polyclinicsApi, specimenTemplatesApi, type ServiceCategory, type Polyclinic, type SpecimenTemplate } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MedicalServiceParametersEditor, createMedicalServiceParameterDraft, type MedicalServiceParameterDraft } from './components/service-parameters-editor';
import { MedicalServiceSpecimenEditor, createMedicalServiceSpecimenDraft, type MedicalServiceSpecimenDraft } from './components/service-specimen-editor';
import { MasterDataPageShell } from '@/pages/master-data/shared';

const SERVICE_DOMAIN_OPTIONS = [
  { value: 'general', label: 'Umum' },
  { value: 'dental', label: 'Dental' },
  { value: 'laboratory', label: 'Laboratorium' },
  { value: 'radiology', label: 'Radiologi' },
];

const TARGET_SCOPE_OPTIONS = [
  { value: 'none', label: 'Tanpa target anatomi' },
  { value: 'full_mouth', label: 'Seluruh mulut' },
  { value: 'arch', label: 'Rahang' },
  { value: 'quadrant', label: 'Kuadran' },
  { value: 'tooth', label: 'Gigi' },
  { value: 'surface', label: 'Permukaan gigi' },
];

export default function MedicalServiceEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [specimenTemplates, setSpecimenTemplates] = useState<SpecimenTemplate[]>([]);
  const [formData, setFormData] = useState<{
    code: string;
    name: string;
    category_id: number;
    polyclinic_id: string;
    service_domain: string;
    target_scope: string;
    requires_consent: boolean;
    supports_odontogram_sync: boolean;
    price: number;
    description: string;
    is_active: boolean;
    parameters: MedicalServiceParameterDraft[];
    specimen_options: MedicalServiceSpecimenDraft[];
  }>({
    code: '',
    name: '',
    category_id: 0,
    polyclinic_id: '',
    service_domain: 'general',
    target_scope: 'none',
    requires_consent: false,
    supports_odontogram_sync: false,
    price: 0,
    description: '',
    is_active: true,
    parameters: [],
    specimen_options: [],
  });

  useEffect(() => {
    setPageTitle('Edit Layanan Medis');
    Promise.all([
      medicalServicesApi.getById(Number(id)),
      serviceCategoriesApi.getAll(),
      polyclinicsApi.getAll(),
      specimenTemplatesApi.getAll('is_active=true'),
    ])
      .then(([sRes, cRes, pRes, tRes]) => {
        const d = sRes.data.data;
        setFormData({
          code: d.code,
          name: d.name,
          category_id: d.category_id,
          polyclinic_id: d.polyclinic_id ? String(d.polyclinic_id) : '',
          service_domain: d.service_domain || 'general',
          target_scope: d.target_scope || 'none',
          requires_consent: Boolean(d.requires_consent),
          supports_odontogram_sync: Boolean(d.supports_odontogram_sync),
          price: d.price,
          description: d.description,
          is_active: d.is_active,
          parameters: (d.parameters || []).map((parameter: any, index: number) =>
            createMedicalServiceParameterDraft({
              id: parameter.id,
              code: parameter.code || '',
              name: parameter.name || '',
              input_type: parameter.input_type || 'text',
              unit: parameter.unit || '',
              reference_value_male: parameter.reference_value_male || '',
              reference_value_female: parameter.reference_value_female || '',
              sort_order: parameter.sort_order || index + 1,
              is_required: parameter.is_required !== false,
            })
          ),
          specimen_options: (d.specimen_options || []).map((option: any, index: number) =>
            createMedicalServiceSpecimenDraft({
              id: option.id,
              specimen_template_id: option.specimen_template_id,
              sort_order: option.sort_order || index + 1,
              is_default: option.is_default === true,
              notes: option.notes || '',
            })
          ),
        });
        setCategories(cRes.data.data);
        setPolyclinics(pRes.data.data);
        setSpecimenTemplates(tRes.data.data);
      })
      .catch(() => toast({ variant: 'destructive', title: 'Error!' }))
      .finally(() => setFetching(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await medicalServicesApi.update(Number(id), {
        ...formData,
        category_id: Number(formData.category_id),
        polyclinic_id: formData.polyclinic_id ? Number(formData.polyclinic_id) : null,
        price: Number(formData.price),
        parameters: formData.parameters.map(({ client_id, ...parameter }, index) => ({
          ...parameter,
          sort_order: index + 1,
        })),
        specimen_options: formData.specimen_options.map(({ client_id, ...option }, index) => ({
          ...option,
          sort_order: index + 1,
        })),
      });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Layanan medis berhasil diperbarui.' });
      setTimeout(() => navigate('/medical-services'), 400);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal.' });
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find((category) => category.id === formData.category_id);
  const isDentalService = formData.service_domain === 'dental';
  const isLaboratoryService = formData.service_domain === 'laboratory';
  const canSyncOdontogram = isDentalService && ['tooth', 'surface'].includes(formData.target_scope);

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <form id="medical-service-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit Layanan Medis"
        subtitle="Perbarui layanan medis dan parameter pemeriksaan."
        onBack={() => navigate('/medical-services')}
        actions={
          <Button type="submit" form="medical-service-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update Layanan
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Layanan Medis</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Kode Layanan</Label>
                <Input
                  value={formData.code || '-'}
                  readOnly
                  className="h-9 text-xs bg-muted/40 text-muted-foreground font-mono rounded-none"
                />
              </div>

              <div className="space-y-1 md:col-span-1 lg:col-span-2">
                <Label htmlFor="name" className="text-xs font-medium">Nama Layanan *</Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="price" className="text-xs font-medium">Tarif (Rp) *</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                  className="h-9 text-xs font-mono rounded-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Kategori *</Label>
                <SearchableSelect
                  options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                  value={formData.category_id ? String(formData.category_id) : ''}
                  onValueChange={(v) => setFormData({ ...formData, category_id: Number(v) })}
                  placeholder="Pilih kategori..."
                  searchPlaceholder="Cari kategori..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Poliklinik</Label>
                <SearchableSelect
                  options={polyclinics.filter((p) => p.is_active).map((p) => ({ value: String(p.id), label: p.name }))}
                  value={formData.polyclinic_id}
                  onValueChange={(v) => setFormData({ ...formData, polyclinic_id: v })}
                  placeholder="Semua poliklinik"
                  searchPlaceholder="Cari poliklinik..."
                  noneLabel="Semua Poliklinik"
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Domain Layanan *</Label>
                <SearchableSelect
                  options={SERVICE_DOMAIN_OPTIONS}
                  value={formData.service_domain}
                  onValueChange={(value) =>
                    setFormData((current) => ({
                      ...current,
                      service_domain: value,
                      target_scope: value === 'dental' ? current.target_scope : 'none',
                      supports_odontogram_sync: value === 'dental' ? current.supports_odontogram_sync : false,
                      specimen_options: value === 'laboratory' ? current.specimen_options : [],
                    }))
                  }
                  placeholder="Pilih domain..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Target Anatomi</Label>
                <SearchableSelect
                  options={TARGET_SCOPE_OPTIONS}
                  value={formData.target_scope}
                  onValueChange={(value) =>
                    setFormData((current) => ({
                      ...current,
                      target_scope: value,
                      supports_odontogram_sync: ['tooth', 'surface'].includes(value) ? current.supports_odontogram_sync : false,
                    }))
                  }
                  placeholder="Pilih target..."
                  disabled={!isDentalService}
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
              <Input
                id="description"
                placeholder="Deskripsi ringkas layanan"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="h-9 text-xs rounded-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
                <div>
                  <Label htmlFor="requires_consent" className="cursor-pointer text-xs font-medium">Informed Consent</Label>
                  <p className="text-[11px] text-muted-foreground">Perlu persetujuan medis</p>
                </div>
                <Switch
                  id="requires_consent"
                  checked={formData.requires_consent}
                  onCheckedChange={(checked) => setFormData({ ...formData, requires_consent: checked })}
                />
              </div>

              <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
                <div>
                  <Label htmlFor="supports_odontogram_sync" className="cursor-pointer text-xs font-medium">Sinkron Odontogram</Label>
                  <p className="text-[11px] text-muted-foreground">Hanya dental gigi/permukaan</p>
                </div>
                <Switch
                  id="supports_odontogram_sync"
                  checked={canSyncOdontogram ? formData.supports_odontogram_sync : false}
                  disabled={!canSyncOdontogram}
                  onCheckedChange={(checked) => setFormData({ ...formData, supports_odontogram_sync: checked })}
                />
              </div>

              <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
                <div>
                  <Label htmlFor="is_active" className="cursor-pointer text-xs font-medium">Status Aktif</Label>
                  <p className="text-[11px] text-muted-foreground">{formData.is_active ? 'Layanan aktif' : 'Layanan tidak aktif'}</p>
                </div>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>
          </div>

          <MedicalServiceParametersEditor
            categoryName={selectedCategory?.name}
            parameters={formData.parameters}
            onChange={(parameters) => setFormData({ ...formData, parameters })}
          />

          <MedicalServiceSpecimenEditor
            visible={isLaboratoryService}
            templates={specimenTemplates}
            specimenOptions={formData.specimen_options}
            onChange={(specimen_options) => setFormData({ ...formData, specimen_options })}
          />
        </div>
      </MasterDataPageShell>
    </form>
  );
}
