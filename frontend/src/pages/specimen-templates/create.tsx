import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { specimenTemplatesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function SpecimenTemplateCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    type_system: 'http://snomed.info/sct',
    type_code: '',
    type_display: '',
    collection_method_system: 'http://snomed.info/sct',
    collection_method_code: '',
    collection_method_display: '',
    is_active: true,
  });

  useEffect(() => { setPageTitle('Tambah Template Specimen'); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await specimenTemplatesApi.create(formData);
      toast({ variant: 'success', title: 'Berhasil!', description: 'Template specimen berhasil dibuat.' });
      setTimeout(() => navigate('/specimen-templates'), 400);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal membuat template specimen.' });
    } finally { setLoading(false); }
  };

  return (
    <form id="specimen-template-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Tambah Template Specimen"
        subtitle="Kelola mapping SNOMED untuk type dan collection method specimen laboratorium."
        onBack={() => navigate('/specimen-templates')}
        actions={<Button type="submit" form="specimen-template-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button>}
        aside={<MasterDataAsideStack><div><MasterDataAsideSection title="Ringkasan" helper="Preview mapping specimen yang akan disimpan."><div className="space-y-1"><p className="truncate font-medium">{formData.name || 'Nama belum diisi'}</p><p className="text-muted-foreground">Kode: {formData.code || '-'}</p><p className="text-muted-foreground">SNOMED Type: {formData.type_code || '-'} {formData.type_display ? `· ${formData.type_display}` : ''}</p></div></MasterDataAsideSection></div></MasterDataAsideStack>}
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="code" className="text-xs font-medium">Kode Template</Label><Input id="code" required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="SPEC-BLOOD-VENOUS" className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Template</Label><Input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Darah Vena" className="h-10 text-sm" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label><Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Deskripsi penggunaan specimen" className="h-10 text-sm" /></div>
            </section>
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-1"><h2 className="text-sm font-semibold tracking-tight">Mapping SNOMED Type</h2><p className="text-xs leading-5 text-muted-foreground">Isi kode dan display SNOMED untuk jenis specimen yang akan dipakai pada resource Specimen.</p></div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="type_system" className="text-xs font-medium">System</Label><Input id="type_system" value={formData.type_system} onChange={(e) => setFormData({ ...formData, type_system: e.target.value })} className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="type_code" className="text-xs font-medium">Code</Label><Input id="type_code" required value={formData.type_code} onChange={(e) => setFormData({ ...formData, type_code: e.target.value })} placeholder="122575003" className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="type_display" className="text-xs font-medium">Display</Label><Input id="type_display" required value={formData.type_display} onChange={(e) => setFormData({ ...formData, type_display: e.target.value })} placeholder="Urine specimen" className="h-10 text-sm" /></div>
              </div>
            </section>
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-1"><h2 className="text-sm font-semibold tracking-tight">Mapping Collection Method</h2><p className="text-xs leading-5 text-muted-foreground">Opsional, tetapi disarankan bila metode pengambilan specimen juga ingin dikirim konsisten ke SATUSEHAT.</p></div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="collection_method_system" className="text-xs font-medium">System</Label><Input id="collection_method_system" value={formData.collection_method_system} onChange={(e) => setFormData({ ...formData, collection_method_system: e.target.value })} className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="collection_method_code" className="text-xs font-medium">Code</Label><Input id="collection_method_code" value={formData.collection_method_code} onChange={(e) => setFormData({ ...formData, collection_method_code: e.target.value })} placeholder="386089008" className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="collection_method_display" className="text-xs font-medium">Display</Label><Input id="collection_method_display" value={formData.collection_method_display} onChange={(e) => setFormData({ ...formData, collection_method_display: e.target.value })} placeholder="Collection of urine specimen" className="h-10 text-sm" /></div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-4"><div className="space-y-0.5"><Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label><p className="text-xs text-muted-foreground">Template aktif bisa dipakai pada layanan medis.</p></div><Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} /></div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}