import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { doctorsApi, polyclinicsApi, type Polyclinic } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Phone, Stethoscope, FileText } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

export default function DoctorEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [selectedPolyclinics, setSelectedPolyclinics] = useState<number[]>([]);
  const [formData, setFormData] = useState({
    full_name: '', sip_number: '', specialization: '', phone: '', is_active: true,
  });

  useEffect(() => {
    setPageTitle('Edit Dokter');
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [docRes, polyRes] = await Promise.all([
        doctorsApi.getById(Number(id)),
        polyclinicsApi.getAll(),
      ]);
      const d = docRes.data.data;
      setFormData({ full_name: d.full_name, sip_number: d.sip_number, specialization: d.specialization, phone: d.phone, is_active: d.is_active });
      setSelectedPolyclinics(d.polyclinics?.map((p: any) => p.id) || []);
      setPolyclinics(polyRes.data.data);
    } catch {
      toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data." });
    } finally {
      setFetching(false);
    }
  };

  const togglePolyclinic = (id: number) => {
    setSelectedPolyclinics(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await doctorsApi.update(Number(id), { ...formData, polyclinic_ids: selectedPolyclinics });
      toast({ variant: "success", title: "Berhasil!", description: "Dokter berhasil diperbarui." });
      setTimeout(() => navigate('/doctors'), 500);
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
                <Label htmlFor="full_name" className="text-xs font-medium flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />Nama Lengkap</Label>
                <Input id="full_name" required value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sip_number" className="text-xs font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />Nomor SIP</Label>
                <Input id="sip_number" value={formData.sip_number} onChange={e => setFormData({ ...formData, sip_number: e.target.value })} className="h-10 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="specialization" className="text-xs font-medium flex items-center gap-2"><Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />Spesialisasi</Label>
                <Input id="specialization" value={formData.specialization} onChange={e => setFormData({ ...formData, specialization: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-medium flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />Telepon</Label>
                <Input id="phone" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="h-10 text-sm" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label>
                <p className="text-xs text-muted-foreground">{formData.is_active ? 'Dokter aktif' : 'Dokter tidak aktif'}</p>
              </div>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <p className="text-sm font-semibold">Poliklinik</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {polyclinics.filter(p => p.is_active).map(p => (
                <label key={p.id} className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={selectedPolyclinics.includes(p.id)} onCheckedChange={() => togglePolyclinic(p.id)} />
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded" style={{ backgroundColor: p.color || '#6B7280' }} />
                    <span className="text-sm">{p.name}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan</p>
            <div className="space-y-1">
              <p className="truncate font-medium">{formData.full_name || '-'}</p>
              <p className="truncate text-muted-foreground">{formData.specialization || '-'}</p>
              <p className="text-muted-foreground">Poli: {selectedPolyclinics.length} dipilih</p>
              <p className="text-muted-foreground">Status: {formData.is_active ? 'Aktif' : 'Nonaktif'}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border/80 p-3">
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={loading} className="h-10">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Dokter
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/doctors')} className="h-10">Batal</Button>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
