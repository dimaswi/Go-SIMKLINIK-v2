import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

function getEmployeeHint(employee: Employee) {
  return employee.nip_number || employee.nik_number || employee.profession || '-';
}

export default function DoctorCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { bpjsAntreanEnabled } = useBpjsAntreanEnabled();
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedPolyclinics, setSelectedPolyclinics] = useState<number[]>([]);
  const [formData, setFormData] = useState({
    employee_id: '', full_name: '', nik_number: '', nip_number: '', sip_number: '', specialization: '', phone: '', is_active: true, bpjs_doctor_code: '',
  });

  useEffect(() => {
    setPageTitle('Tambah Dokter');
    polyclinicsApi.getAll().then(res => setPolyclinics(res.data.data)).catch(() => {});
    employeesApi.getAll('profession=doctor').then(res => setEmployees(res.data.data)).catch(() => {});
  }, []);

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
      await doctorsApi.create({ ...formData, employee_id: formData.employee_id ? Number(formData.employee_id) : null, polyclinic_ids: selectedPolyclinics });
      toast({ variant: "success", title: "Berhasil!", description: "Dokter berhasil dibuat." });
      setTimeout(() => navigate('/doctors'), 400);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error!", description: error.response?.data?.error || "Gagal membuat dokter." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="doctor-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Tambah Dokter"
        subtitle="Identitas dokter dan poliklinik yang dilayani."
        onBack={() => navigate('/doctors')}
        actions={
          <Button type="submit" form="doctor-create-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Simpan Dokter
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
                <Label htmlFor="employee_id" className="text-xs font-medium">Tautan Master Pegawai (Opsional)</Label>
                <SearchableSelect
                  options={employees.map((employee) => ({ value: String(employee.id), label: `${employee.full_name} (${employee.employee_code || getEmployeeHint(employee)})` }))}
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
                  placeholder="dr. Ahmad"
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
                  placeholder="16 digit NIK"
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
                  placeholder="1987xxxxxxxxxxxx"
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
                  placeholder="SIP-xxx"
                  value={formData.sip_number}
                  onChange={e => setFormData({ ...formData, sip_number: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="specialization" className="text-xs font-medium">Spesialisasi</Label>
                <Input
                  id="specialization"
                  placeholder="Umum / Spesialis Anak"
                  value={formData.specialization}
                  onChange={e => setFormData({ ...formData, specialization: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-medium">Nomor Telepon / WA</Label>
                <Input
                  id="phone"
                  placeholder="08xxxxxxxxxx"
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
                    placeholder="Kode dokter BPJS HFIS"
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
