import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BpjsReferencePicker } from '@/components/bpjs-reference-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { doctorsApi, employeesApi, polyclinicsApi, type Employee, type Polyclinic } from '@/lib/api';
import { useBpjsAntreanEnabled } from '@/hooks/use-bpjs-antrean-enabled';
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
  const { bpjsAntreanEnabled } = useBpjsAntreanEnabled();
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedPolyclinics, setSelectedPolyclinics] = useState<number[]>([]);
  const [formData, setFormData] = useState({
    employee_id: '', full_name: '', nik_number: '', nip_number: '', sip_number: '', specialization: '', phone: '', is_active: true, bpjs_doctor_code: '',
  });

  useEffect(() => {
    setPageTitle('Edit Dokter');
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [docRes, polyRes, employeeRes] = await Promise.all([
        doctorsApi.getById(Number(id)),
        polyclinicsApi.getAll(),
        employeesApi.getAll('profession=doctor'),
      ]);
      const d = docRes.data.data;
      setFormData({ employee_id: d.employee_id ? String(d.employee_id) : '', full_name: d.full_name, nik_number: d.nik_number || '', nip_number: d.nip_number || '', sip_number: d.sip_number, specialization: d.specialization, phone: d.phone, is_active: d.is_active, bpjs_doctor_code: d.bpjs_doctor_code || '' });
      setSelectedPolyclinics(d.polyclinics?.map((p: any) => p.id) || []);
      setPolyclinics(polyRes.data.data);
      setEmployees(employeeRes.data.data);
    } catch {
      toast({ variant: "destructive", title: "Error!", description: "Gagal memuat data." });
    } finally {
      setFetching(false);
    }
  };

  const selectedEmployee = employees.find((employee) => String(employee.id) === formData.employee_id);

  const handleEmployeeChange = (value: string) => {
    const employee = employees.find((item) => String(item.id) === value);
    setFormData((current) => ({
      ...current,
      employee_id: value,
      full_name: employee?.full_name || current.full_name,
      nik_number: employee?.nik_number || current.nik_number,
      nip_number: employee?.nip_number || current.nip_number,
      phone: employee?.phone || current.phone,
    }));
  };

  const togglePolyclinic = (id: number) => {
    setSelectedPolyclinics(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await doctorsApi.update(Number(id), { ...formData, employee_id: formData.employee_id ? Number(formData.employee_id) : null, polyclinic_ids: selectedPolyclinics });
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
            <div>
              <MasterDataAsideSection title="Tautan Pegawai" helper="Jika pegawai dokter dipilih, identitas dasar mengikuti master pegawai.">
                <p className="text-sm text-muted-foreground">{selectedEmployee ? `Tertaut ke ${selectedEmployee.full_name}.` : 'Belum ditautkan ke master pegawai.'}</p>
                <p className="mt-2 text-sm text-muted-foreground">{selectedEmployee ? (selectedEmployee.requires_satusehat ? 'Master pegawai dokter ini menandai kebutuhan SATUSEHAT aktif.' : 'Master pegawai dokter ini menandai SATUSEHAT tidak diperlukan.') : 'Jika pegawai dokter dipilih, kebutuhan SATUSEHAT akan mengikuti master pegawai tersebut.'}</p>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="space-y-2">
              <Label htmlFor="employee_id" className="text-xs font-medium flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />Master Pegawai Dokter</Label>
              <SearchableSelect
                options={employees.map((employee) => ({ value: String(employee.id), label: `${employee.full_name} (${employee.employee_code || employee.nip_number || employee.profession})` }))}
                value={formData.employee_id}
                onValueChange={handleEmployeeChange}
                placeholder="Pilih pegawai dokter..."
                searchPlaceholder="Cari pegawai dokter..."
                noneLabel="Tanpa tautan pegawai"
              />
              {selectedEmployee ? (
                <p className="text-xs text-muted-foreground">
                  SATUSEHAT pegawai: {selectedEmployee.requires_satusehat ? 'Perlu integrasi' : 'Tidak perlu integrasi'}.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name" className="text-xs font-medium flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />Nama Lengkap</Label>
                <Input id="full_name" required value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="h-10 text-sm" readOnly={Boolean(selectedEmployee)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nik_number" className="text-xs font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />NIK</Label>
                <Input id="nik_number" value={formData.nik_number} onChange={e => setFormData({ ...formData, nik_number: e.target.value })} className="h-10 text-sm" readOnly={Boolean(selectedEmployee)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nip_number" className="text-xs font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />NIP</Label>
                <Input id="nip_number" value={formData.nip_number} onChange={e => setFormData({ ...formData, nip_number: e.target.value })} className="h-10 text-sm" readOnly={Boolean(selectedEmployee)} />
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
                <Input id="phone" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="h-10 text-sm" readOnly={Boolean(selectedEmployee)} />
              </div>
              {bpjsAntreanEnabled ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bpjs_doctor_code" className="text-xs font-medium">Kode Dokter BPJS</Label>
                  <Input id="bpjs_doctor_code" value={formData.bpjs_doctor_code} onChange={e => setFormData({ ...formData, bpjs_doctor_code: e.target.value })} className="h-10 text-sm" />
                  <BpjsReferencePicker type="dokter" value={formData.bpjs_doctor_code} onValueChange={(value) => setFormData({ ...formData, bpjs_doctor_code: value })} disabled={loading} />
                </div>
              ) : null}
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
