import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { specimenTemplatesApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function SpecimenTemplateEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
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

  useEffect(() => {
    setPageTitle('Edit Template Specimen');
    specimenTemplatesApi.getById(Number(id)).then((res) => {
      const data = res.data.data;
      setFormData({
        code: data.code || '',
        name: data.name || '',
        description: data.description || '',
        type_system: data.type_system || 'http://snomed.info/sct',
        type_code: data.type_code || '',
        type_display: data.type_display || '',
        collection_method_system: data.collection_method_system || 'http://snomed.info/sct',
        collection_method_code: data.collection_method_code || '',
        collection_method_display: data.collection_method_display || '',
        is_active: data.is_active !== false,
      });
    }).catch(() => toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat template specimen.' })).finally(() => setFetching(false));
  }, [id, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await specimenTemplatesApi.update(Number(id), formData);
      toast({ variant: 'success', title: 'Berhasil!', description: 'Template specimen berhasil diperbarui.' });
      setTimeout(() => navigate('/specimen-templates'), 500);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal memperbarui template specimen.' });
    } finally { setLoading(false); }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <form id="specimen-template-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Edit Template Specimen"
        subtitle="Perbarui mapping SNOMED specimen tanpa mengubah relasi layanan yang sudah ada."
        onBack={() => navigate('/specimen-templates')}
        actions={<Button type="submit" form="specimen-template-edit-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update</Button>}
        aside={<MasterDataAsideStack><div><MasterDataAsideSection title="Ringkasan" helper="Preview mapping specimen terbaru."><div className="space-y-1"><p className="truncate font-medium">{formData.name || '-'}</p><p className="text-muted-foreground">Kode: {formData.code || '-'}</p><p className="text-muted-foreground">SNOMED Type: {formData.type_code || '-'} {formData.type_display ? `· ${formData.type_display}` : ''}</p></div></MasterDataAsideSection></div></MasterDataAsideStack>}
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="code" className="text-xs font-medium">Kode Template</Label><Input id="code" required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="name" className="text-xs font-medium">Nama Template</Label><Input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-10 text-sm" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label><Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="h-10 text-sm" /></div>
            </section>
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-1"><h2 className="text-sm font-semibold tracking-tight">Mapping SNOMED Type</h2><p className="text-xs leading-5 text-muted-foreground">Field ini yang menentukan coding type pada resource `Specimen` SATUSEHAT.</p></div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="type_system" className="text-xs font-medium">System</Label><Input id="type_system" value={formData.type_system} onChange={(e) => setFormData({ ...formData, type_system: e.target.value })} className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="type_code" className="text-xs font-medium">Code</Label><Input id="type_code" required value={formData.type_code} onChange={(e) => setFormData({ ...formData, type_code: e.target.value })} className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="type_display" className="text-xs font-medium">Display</Label><Input id="type_display" required value={formData.type_display} onChange={(e) => setFormData({ ...formData, type_display: e.target.value })} className="h-10 text-sm" /></div>
              </div>
            </section>
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-1"><h2 className="text-sm font-semibold tracking-tight">Mapping Collection Method</h2><p className="text-xs leading-5 text-muted-foreground">Opsional bila metode pengambilan specimen ingin ikut dipetakan.</p></div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="collection_method_system" className="text-xs font-medium">System</Label><Input id="collection_method_system" value={formData.collection_method_system} onChange={(e) => setFormData({ ...formData, collection_method_system: e.target.value })} className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="collection_method_code" className="text-xs font-medium">Code</Label><Input id="collection_method_code" value={formData.collection_method_code} onChange={(e) => setFormData({ ...formData, collection_method_code: e.target.value })} className="h-10 text-sm" /></div>
                <div className="space-y-2"><Label htmlFor="collection_method_display" className="text-xs font-medium">Display</Label><Input id="collection_method_display" value={formData.collection_method_display} onChange={(e) => setFormData({ ...formData, collection_method_display: e.target.value })} className="h-10 text-sm" /></div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-4"><div className="space-y-0.5"><Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label><p className="text-xs text-muted-foreground">Template aktif bisa dipakai di master layanan medis.</p></div><Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} /></div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}