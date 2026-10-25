import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

export default function EmployeeEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [formData, setFormData] = useState({
    user_id: '',
    employee_code: '',
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
    setPageTitle('Edit Pegawai');
    if (id) {
      void Promise.all([usersApi.getAll(), employeesApi.getAll(), employeesApi.getById(Number(id))])
        .then(([usersRes, employeesRes, employeeRes]) => {
          setUsers(usersRes.data.data);
          setEmployees(employeesRes.data.data);
          const data: Employee = employeeRes.data.data;
          setFormData({
            user_id: data.user_id ? String(data.user_id) : '',
            employee_code: data.employee_code || '',
            full_name: data.full_name || '',
            nik_number: data.nik_number || '',
            nip_number: data.nip_number || '',
            profession: data.profession || '',
            license_number: data.license_number || '',
            phone: data.phone || '',
            requires_satusehat: data.requires_satusehat ?? false,
            satusehat_practitioner_id: data.satusehat_practitioner_id || '',
            is_active: data.is_active ?? true,
          });
        })
        .catch((error: any) => {
          toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal memuat data pegawai.' });
        })
        .finally(() => setFetching(false));
    }
  }, [id, toast]);

  const availableUsers = useMemo(
    () =>
      users.filter((user) => {
        const isCurrentEmployeeUser = formData.user_id && String(user.id) === formData.user_id;
        const isUsedByAnotherEmployee = employees.some((employee) => String(employee.id) !== id && employee.user_id === user.id);
        return isCurrentEmployeeUser || !isUsedByAnotherEmployee;
      }),
    [employees, formData.user_id, id, users]
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
      await employeesApi.update(Number(id), {
        ...formData,
        user_id: formData.user_id ? Number(formData.user_id) : null,
      });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Pegawai berhasil diperbarui.' });
      setTimeout(() => navigate('/employees'), 400);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal memperbarui pegawai.' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <form id="employee-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit Pegawai"
        subtitle="Perbarui identitas pegawai, profesi, dan akun operasional yang ditautkan."
        onBack={() => navigate('/employees')}
        actions={
          <Button type="submit" form="employee-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Update Pegawai
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
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nik_number" className="text-xs font-medium">NIK (16 Digit)</Label>
                <Input
                  id="nik_number"
                  value={formData.nik_number}
                  onChange={(e) => setFormData({ ...formData, nik_number: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
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
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-medium">Nomor Telepon / WA</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
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
                  value={formData.employee_code || '-'}
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
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="satusehat_practitioner_id" className="text-xs font-medium">Practitioner ID SATUSEHAT</Label>
                <Input
                  id="satusehat_practitioner_id"
                  value={formData.satusehat_practitioner_id}
                  onChange={(e) => setFormData({ ...formData, satusehat_practitioner_id: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
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