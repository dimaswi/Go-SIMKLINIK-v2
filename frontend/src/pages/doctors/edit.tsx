import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BpjsReferencePicker } from '@/components/bpjs-reference-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { doctorsApi, employeesApi, polyclinicsApi, type Employee, type Polyclinic } from '@/lib/api';
import { useBpjsAntreanEnabled } from '@/hooks/use-bpjs-antrean-enabled';
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';

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
    <form id="doctor-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit Dokter"
        subtitle="Perbarui profil dokter dan poliklinik yang dilayani."
        onBack={() => navigate('/doctors')}
        actions={
          <Button type="submit" form="doctor-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update Dokter
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Identitas & Legalitas Dokter</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1 lg:col-span-3">
                <Label htmlFor="employee_id" className="text-xs font-medium">Tautan Master Pegawai</Label>
                <SearchableSelect
                  options={employees.map((employee) => ({ value: String(employee.id), label: `${employee.full_name} (${employee.employee_code || employee.nip_number || employee.profession})` }))}
                  value={formData.employee_id}
                  onValueChange={handleEmployeeChange}
                  placeholder="Pilih pegawai dokter..."
                  searchPlaceholder="Cari pegawai dokter..."
                  noneLabel="Tanpa tautan pegawai"
                  square
                  className="h-9 text-xs rounded-none"
                />
                {selectedEmployee ? (
                  <p className="text-[11px] text-muted-foreground">
                    Data otomatis sinkron dari pegawai {selectedEmployee.full_name} · SATUSEHAT: {selectedEmployee.requires_satusehat ? 'Perlu integrasi' : 'Tidak perlu integrasi'}.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label htmlFor="full_name" className="text-xs font-medium">Nama Lengkap *</Label>
                <Input
                  id="full_name"
                  required
                  value={formData.full_name}
                  onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  className="h-9 text-xs rounded-none"
                  readOnly={Boolean(selectedEmployee)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="nik_number" className="text-xs font-medium">NIK (16 Digit)</Label>
                <Input
                  id="nik_number"
                  value={formData.nik_number}
                  onChange={e => setFormData({ ...formData, nik_number: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
                  maxLength={16}
                  readOnly={Boolean(selectedEmployee)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="nip_number" className="text-xs font-medium">NIP</Label>
                <Input
                  id="nip_number"
                  value={formData.nip_number}
                  onChange={e => setFormData({ ...formData, nip_number: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
                  readOnly={Boolean(selectedEmployee)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="sip_number" className="text-xs font-medium">Nomor SIP</Label>
                <Input
                  id="sip_number"
                  value={formData.sip_number}
                  onChange={e => setFormData({ ...formData, sip_number: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="specialization" className="text-xs font-medium">Spesialisasi</Label>
                <Input
                  id="specialization"
                  value={formData.specialization}
                  onChange={e => setFormData({ ...formData, specialization: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-medium">Nomor Telepon / WA</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
                  readOnly={Boolean(selectedEmployee)}
                />
              </div>

              {bpjsAntreanEnabled ? (
                <div className="space-y-1 lg:col-span-3">
                  <Label htmlFor="bpjs_doctor_code" className="text-xs font-medium">Kode Dokter BPJS</Label>
                  <Input
                    id="bpjs_doctor_code"
                    value={formData.bpjs_doctor_code}
                    onChange={e => setFormData({ ...formData, bpjs_doctor_code: e.target.value })}
                    className="h-9 text-xs rounded-none font-mono"
                  />
                  <div className="pt-1">
                    <BpjsReferencePicker type="dokter" value={formData.bpjs_doctor_code} onValueChange={(value) => setFormData({ ...formData, bpjs_doctor_code: value })} disabled={loading} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
              <div>
                <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">Status Aktif</Label>
                <p className="text-[11px] text-muted-foreground">{formData.is_active ? 'Dokter aktif berpraktek' : 'Dokter tidak aktif'}</p>
              </div>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Poliklinik Yang Dilayani ({selectedPolyclinics.length} dipilih)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {polyclinics.filter(p => p.is_active).map(p => {
                const checked = selectedPolyclinics.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => togglePolyclinic(p.id)}
                    className={`flex items-center gap-2 border p-2 text-left cursor-pointer select-none transition-colors text-xs ${
                      checked ? 'border-primary bg-primary/5 text-foreground font-medium' : 'border-border/70 hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <div className={`grid h-4 w-4 shrink-0 place-content-center rounded-sm border transition-colors ${
                      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border/80 bg-background'
                    }`}>
                      {checked && <Check className="h-3 w-3 stroke-[2.5]" />}
                    </div>
                    <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color || '#6B7280' }} />
                    <span className="truncate flex-1">{p.name}</span>
                  </button>
                );
              })}
              {polyclinics.length === 0 && <p className="text-xs text-muted-foreground">Belum ada poliklinik.</p>}
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
