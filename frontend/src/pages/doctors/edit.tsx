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
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function DoctorEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [selectedPolyclinics, setSelectedPolyclinics] = useState<number[]>([]);
  const [formData, setFormData] = useState({
    full_name: '', nik_number: '', nip_number: '', sip_number: '', specialization: '', phone: '', is_active: true,
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
      setFormData({ full_name: d.full_name, nik_number: d.nik_number || '', nip_number: d.nip_number || '', sip_number: d.sip_number, specialization: d.specialization, phone: d.phone, is_active: d.is_active });
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
    <form id="doctor-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Edit Dokter"
        subtitle="Perbarui profil dokter dan keterkaitannya dengan poliklinik yang dilayani."
        onBack={() => navigate('/doctors')}
        actions={<Button type="submit" form="doctor-edit-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Dokter</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview data dokter yang akan disimpan.">
                <div className="space-y-1"><p className="truncate font-medium">{formData.full_name || '-'}</p><p className="truncate text-muted-foreground">NIK: {formData.nik_number || '-'}</p><p className="truncate text-muted-foreground">NIP: {formData.nip_number || '-'}</p><p className="truncate text-muted-foreground">{formData.specialization || '-'}</p><p className="text-muted-foreground">Poli: {selectedPolyclinics.length} dipilih</p><p className="text-muted-foreground">Status: {formData.is_active ? 'Aktif' : 'Nonaktif'}</p></div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name" className="text-xs font-medium flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />Nama Lengkap</Label>
                <Input id="full_name" required value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nik_number" className="text-xs font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />NIK</Label>
                <Input id="nik_number" value={formData.nik_number} onChange={e => setFormData({ ...formData, nik_number: e.target.value })} className="h-10 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nip_number" className="text-xs font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />NIP</Label>
                <Input id="nip_number" value={formData.nip_number} onChange={e => setFormData({ ...formData, nip_number: e.target.value })} className="h-10 text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sip_number" className="text-xs font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />Nomor SIP</Label>
                <Input id="sip_number" value={formData.sip_number} onChange={e => setFormData({ ...formData, sip_number: e.target.value })} className="h-10 text-sm" />
              </div>
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
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
