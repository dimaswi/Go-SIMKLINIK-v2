import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { polyclinicsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, Palette } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

export default function PolyclinicEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [formData, setFormData] = useState({
    name: '', code: '', description: '', is_active: true, color: '#3B82F6', icon: '', sort_order: 0,
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
      setFormData({ name: d.name, code: d.code, description: d.description, is_active: d.is_active, color: d.color || '#3B82F6', icon: d.icon || '', sort_order: d.sort_order || 0 });
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
      await polyclinicsApi.update(Number(id), { ...formData, sort_order: Number(formData.sort_order) });
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
    <div className="p-6">
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
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
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
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

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded" style={{ backgroundColor: formData.color || '#6B7280' }} />
                <p className="truncate font-medium">{formData.name || '-'}</p>
              </div>
              <p className="truncate text-muted-foreground">Kode: {formData.code || '-'}</p>
              <p className="text-muted-foreground">Status: {formData.is_active ? 'Aktif' : 'Nonaktif'}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border/80 p-3">
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={loading} className="h-10">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Poliklinik
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/polyclinics')} className="h-10">Batal</Button>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
