import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { employeesApi, type Employee, type User as AppUser, usersApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';
import { EMPLOYEE_PROFESSION_OPTIONS, shouldEmployeeProfessionRequireSatusehatByDefault } from './options';

export default function EmployeeCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [formData, setFormData] = useState({
    user_id: '',
    full_name: '',
    nik_number: '',
    nip_number: '',
    profession: '',
    license_number: '',
    phone: '',
    requires_satusehat: false,
    satusehat_practitioner_id: '',
    is_active: true,
  });

  useEffect(() => {
    setPageTitle('Tambah Pegawai');
    void Promise.all([usersApi.getAll(), employeesApi.getAll()])
      .then(([usersRes, employeesRes]) => {
        setUsers(usersRes.data.data);
        setEmployees(employeesRes.data.data);
      })
      .catch(() => {});
  }, []);

  const usedUserIds = useMemo(
    () => new Set(employees.map((employee) => employee.user_id).filter((value): value is number => Boolean(value))),
    [employees]
  );

  const availableUsers = useMemo(
    () => users.filter((user) => !usedUserIds.has(user.id)),
    [users, usedUserIds]
  );

  const userOptions = useMemo(
    () => availableUsers.map((user) => ({ value: String(user.id), label: `${user.full_name || user.username} (${user.email})` })),
    [availableUsers]
  );

  const handleProfessionChange = (value: string) => {
    setFormData((current) => {
      const previousDefault = shouldEmployeeProfessionRequireSatusehatByDefault(current.profession);
      const nextDefault = shouldEmployeeProfessionRequireSatusehatByDefault(value);
      const shouldSyncSatusehatWithProfession = current.profession === '' || current.requires_satusehat === previousDefault;

      return {
        ...current,
        profession: value,
        requires_satusehat: shouldSyncSatusehatWithProfession ? nextDefault : current.requires_satusehat,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await employeesApi.create({
        ...formData,
        user_id: formData.user_id ? Number(formData.user_id) : null,
      });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Pegawai berhasil dibuat.' });
      setTimeout(() => navigate('/employees'), 400);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal membuat pegawai.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="employee-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Tambah Pegawai"
        subtitle="Identitas dan akun operasional klinik."
        onBack={() => navigate('/employees')}
        actions={
          <Button type="submit" form="employee-create-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Simpan Pegawai
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Identitas Pegawai</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="full_name" className="text-xs font-medium">Nama Pegawai *</Label>
                <Input
                  id="full_name"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="h-9 text-xs rounded-none"
                  placeholder="Nama lengkap pegawai"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nik_number" className="text-xs font-medium">NIK (16 Digit)</Label>
                <Input
                  id="nik_number"
                  value={formData.nik_number}
                  onChange={(e) => setFormData({ ...formData, nik_number: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
                  placeholder="16 digit NIK"
                  maxLength={16}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nip_number" className="text-xs font-medium">NIP</Label>
                <Input
                  id="nip_number"
                  value={formData.nip_number}
                  onChange={(e) => setFormData({ ...formData, nip_number: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
                  placeholder="NIP pegawai"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-medium">Nomor Telepon / WA</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
                  placeholder="08xxxxxxxxxx"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="user_id" className="text-xs font-medium">Tautan Akun User</Label>
                <SearchableSelect
                  options={userOptions}
                  value={formData.user_id}
                  onValueChange={(value) => setFormData({ ...formData, user_id: value })}
                  placeholder="Pilih akun user..."
                  searchPlaceholder="Cari user..."
                  noneLabel="Tanpa akun"
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="employee_code" className="text-xs font-medium">Kode Pegawai</Label>
                <Input
                  id="employee_code"
                  value="Otomatis saat disimpan"
                  readOnly
                  className="h-9 text-xs bg-muted/40 text-muted-foreground font-mono rounded-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Profesi & Integrasi</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="profession" className="text-xs font-medium">Profesi *</Label>
                <SearchableSelect
                  options={EMPLOYEE_PROFESSION_OPTIONS}
                  value={formData.profession}
                  onValueChange={handleProfessionChange}
                  placeholder="Pilih profesi..."
                  searchPlaceholder="Cari profesi..."
                  noneLabel="Pilih profesi"
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="license_number" className="text-xs font-medium">Nomor Izin / STR / SIP</Label>
                <Input
                  id="license_number"
                  value={formData.license_number}
                  onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                  className="h-9 text-xs rounded-none"
                  placeholder="Nomor STR / SIP"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="satusehat_practitioner_id" className="text-xs font-medium">Practitioner ID SATUSEHAT</Label>
                <Input
                  id="satusehat_practitioner_id"
                  value={formData.satusehat_practitioner_id}
                  onChange={(e) => setFormData({ ...formData, satusehat_practitioner_id: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
                  placeholder="IHS number pegawai"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
                <div>
                  <Label htmlFor="requires_satusehat" className="cursor-pointer text-xs font-medium">Perlu SATUSEHAT</Label>
                  <p className="text-[11px] text-muted-foreground">Aktifkan untuk sinkronisasi antrean & rekam medis SATUSEHAT</p>
                </div>
                <Switch id="requires_satusehat" checked={formData.requires_satusehat} onCheckedChange={(checked) => setFormData({ ...formData, requires_satusehat: checked })} />
              </div>

              <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
                <div>
                  <Label htmlFor="is_active" className="cursor-pointer text-xs font-medium">Status Aktif</Label>
                  <p className="text-[11px] text-muted-foreground">{formData.is_active ? 'Pegawai aktif operasional' : 'Pegawai nonaktif'}</p>
                </div>
                <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
              </div>
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}