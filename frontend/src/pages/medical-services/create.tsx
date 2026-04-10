import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { medicalServicesApi, serviceCategoriesApi, polyclinicsApi, specimenTemplatesApi, type ServiceCategory, type Polyclinic, type SpecimenTemplate } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MedicalServiceParametersEditor, type MedicalServiceParameterDraft } from './components/service-parameters-editor';
import { MedicalServiceSpecimenEditor, type MedicalServiceSpecimenDraft } from './components/service-specimen-editor';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

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

export default function MedicalServiceCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [specimenTemplates, setSpecimenTemplates] = useState<SpecimenTemplate[]>([]);
  const [formData, setFormData] = useState<{ name: string; category_id: number; polyclinic_id: string; service_domain: string; target_scope: string; requires_consent: boolean; supports_odontogram_sync: boolean; price: number; description: string; is_active: boolean; parameters: MedicalServiceParameterDraft[]; specimen_options: MedicalServiceSpecimenDraft[] }>({
    name: '', category_id: 0, polyclinic_id: '', service_domain: 'general', target_scope: 'none', requires_consent: false, supports_odontogram_sync: false, price: 0, description: '', is_active: true, parameters: [], specimen_options: [],
  });

  useEffect(() => {
    setPageTitle('Tambah Layanan Medis');
    Promise.all([serviceCategoriesApi.getAll(), polyclinicsApi.getAll(), specimenTemplatesApi.getAll('is_active=true')]).then(([cRes, pRes, sRes]) => { setCategories(cRes.data.data); setPolyclinics(pRes.data.data); setSpecimenTemplates(sRes.data.data); }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await medicalServicesApi.create({
        ...formData,
        category_id: Number(formData.category_id),
        polyclinic_id: formData.polyclinic_id ? Number(formData.polyclinic_id) : null,
        price: Number(formData.price),
        parameters: formData.parameters.map(({ client_id, ...parameter }, index) => ({ ...parameter, sort_order: index + 1 })),
        specimen_options: formData.specimen_options.map(({ client_id, ...option }, index) => ({ ...option, sort_order: index + 1 })),
      });
      toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate('/medical-services'), 400);
    } catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); } finally { setLoading(false); }
  };

  const selectedCategory = categories.find((category) => category.id === formData.category_id);
  const isDentalService = formData.service_domain === 'dental';
  const isLaboratoryService = formData.service_domain === 'laboratory';
  const canSyncOdontogram = isDentalService && ['tooth', 'surface'].includes(formData.target_scope);
  const specimenSummaries = formData.specimen_options.map((option, index) => {
    const template = specimenTemplates.find((item) => item.id === option.specimen_template_id);
    return {
      key: option.client_id,
      title: option.is_default ? `Specimen ${index + 1} · Default` : `Specimen ${index + 1}`,
      templateName: template?.name || 'Template belum dipilih',
      typeDisplay: template?.type_display || template?.type_code || '-',
      collectionMethod: template?.collection_method_display || template?.collection_method_code || '-',
      notes: option.notes || '',
    };
  });

  return (
    <form id="medical-service-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Tambah Layanan Medis"
        subtitle="Kelola layanan klinik beserta tarif, kategori, dan parameter template yang dipakai pada pemeriksaan."
        onBack={() => navigate('/medical-services')}
        actions={<Button type="submit" form="medical-service-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview layanan medis yang akan ditambahkan.">
                <div className="space-y-1"><p className="truncate font-medium">{formData.name || 'Nama belum diisi'}</p><p className="text-muted-foreground">Tarif: Rp {formData.price.toLocaleString('id-ID')}</p><p className="text-muted-foreground">Domain: {SERVICE_DOMAIN_OPTIONS.find((option) => option.value === formData.service_domain)?.label || '-'}</p><p className="text-muted-foreground">Target: {TARGET_SCOPE_OPTIONS.find((option) => option.value === formData.target_scope)?.label || '-'}</p><p className="text-muted-foreground">{formData.parameters.length} parameter template</p>{isLaboratoryService ? <p className="text-muted-foreground">{formData.specimen_options.length} specimen option</p> : null}</div>
              </MasterDataAsideSection>
            </div>
            {isLaboratoryService ? (
              <div>
                <MasterDataAsideSection title="Mapping Specimen" helper="Ringkasan mapping template yang sedang dipilih untuk layanan ini.">
                  {specimenSummaries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Belum ada specimen option.</p>
                  ) : (
                    <div className="space-y-4">
                      {specimenSummaries.map((item) => (
                        <div key={item.key} className="space-y-1.5 border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.title}</p>
                          <p className="text-sm font-medium">{item.templateName}</p>
                          <p className="text-xs text-muted-foreground">SNOMED Type: {item.typeDisplay}</p>
                          <p className="text-xs text-muted-foreground">Collection Method: {item.collectionMethod}</p>
                          {item.notes ? <p className="text-xs text-muted-foreground">Catatan: {item.notes}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </MasterDataAsideSection>
              </div>
            ) : null}
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Layanan</Label><Input id="name" required placeholder="Konsultasi Dokter" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" /></div>
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
                  placeholder="Semua poliklinik"
                  searchPlaceholder="Cari poliklinik..."
                  noneLabel="Semua Poliklinik"
                />
              </div>
              <div className="space-y-2"><Label htmlFor="price" className="text-xs font-medium">Tarif (Rp)</Label><Input id="price" type="number" min="0" value={formData.price} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} className="h-10 text-sm" /></div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label className="text-xs font-medium">Domain Layanan</Label>
                <SearchableSelect
                  options={SERVICE_DOMAIN_OPTIONS}
                  value={formData.service_domain}
                  onValueChange={value => setFormData((current) => ({
                    ...current,
                    service_domain: value,
                    target_scope: value === 'dental' ? current.target_scope : 'none',
                    supports_odontogram_sync: value === 'dental' ? current.supports_odontogram_sync : false,
                    specimen_options: value === 'laboratory' ? current.specimen_options : [],
                  }))}
                  placeholder="Pilih domain"
                  searchPlaceholder="Cari domain..."
                />
              </div>
              <div className="space-y-2"><Label className="text-xs font-medium">Target Anatomi</Label>
                <SearchableSelect
                  options={TARGET_SCOPE_OPTIONS}
                  value={formData.target_scope}
                  onValueChange={value => setFormData((current) => ({
                    ...current,
                    target_scope: value,
                    supports_odontogram_sync: ['tooth', 'surface'].includes(value) ? current.supports_odontogram_sync : false,
                  }))}
                  placeholder="Pilih target"
                  searchPlaceholder="Cari target..."
                  disabled={!isDentalService}
                />
                {!isDentalService && <p className="text-xs text-muted-foreground">Target anatomi hanya aktif untuk layanan dental.</p>}
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label><Input id="description" placeholder="Deskripsi layanan" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="h-10 text-sm" /></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border p-4">
                <div className="space-y-0.5"><Label htmlFor="requires_consent" className="text-xs font-medium cursor-pointer">Butuh Informed Consent</Label><p className="text-xs text-muted-foreground">Aktifkan bila tindakan memerlukan persetujuan tindakan medis.</p></div>
                <Switch id="requires_consent" checked={formData.requires_consent} onCheckedChange={checked => setFormData({ ...formData, requires_consent: checked })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-4">
                <div className="space-y-0.5"><Label htmlFor="supports_odontogram_sync" className="text-xs font-medium cursor-pointer">Sinkron Odontogram</Label><p className="text-xs text-muted-foreground">Hanya aktif untuk layanan dental dengan target gigi atau permukaan.</p></div>
                <Switch id="supports_odontogram_sync" checked={canSyncOdontogram ? formData.supports_odontogram_sync : false} disabled={!canSyncOdontogram} onCheckedChange={checked => setFormData({ ...formData, supports_odontogram_sync: checked })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="space-y-0.5"><Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label><p className="text-xs text-muted-foreground">{formData.is_active ? 'Layanan aktif' : 'Layanan tidak aktif'}</p></div>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
            </div>
          </section>

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
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
