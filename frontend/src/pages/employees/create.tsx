import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Briefcase, Loader2, Mail, Phone, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { employeesApi, type Employee, type User as AppUser, usersApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';
import { EMPLOYEE_PROFESSION_OPTIONS, getEmployeeProfessionLabel, shouldEmployeeProfessionRequireSatusehatByDefault } from './options';

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

  const selectedUser = users.find((user) => String(user.id) === formData.user_id);

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
    <form id="employee-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Tambah Pegawai"
        subtitle="Bangun master pegawai lintas profesi sebagai sumber utama identitas dan akun operasional klinik."
        onBack={() => navigate('/employees')}
        actions={<Button type="submit" form="employee-create-form" disabled={loading} className="rounded-none shadow-none">{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Simpan Pegawai</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview master pegawai yang akan disimpan.">
                <div className="space-y-1 text-sm">
                  <p className="truncate font-medium">{formData.full_name || 'Nama belum diisi'}</p>
                  <p className="text-muted-foreground">Profesi: {getEmployeeProfessionLabel(formData.profession)}</p>
                  <p className="text-muted-foreground">Kode: Otomatis saat simpan</p>
                  <p className="text-muted-foreground">Akun: {selectedUser?.email || 'Belum tertaut'}</p>
                  <p className="text-muted-foreground">SATUSEHAT: {formData.requires_satusehat ? 'Perlu integrasi' : 'Tidak perlu'}</p>
                  <p className="text-muted-foreground">Practitioner ID: {formData.satusehat_practitioner_id || '-'}</p>
                  <p className="text-muted-foreground">Status: {formData.is_active ? 'Aktif' : 'Nonaktif'}</p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Catatan" helper="Satu akun user hanya boleh tertaut ke satu pegawai.">
                <p className="text-sm text-muted-foreground">Gunakan profesi dokter bila data ini akan ditautkan ke profil dokter dan dipakai pada TTE atau jadwal.</p>
                <p className="mt-2 text-sm text-muted-foreground">Akun yang sudah dipakai pegawai lain tidak ditampilkan lagi di pilihan akun.</p>
                <p className="mt-2 text-sm text-muted-foreground">Default SATUSEHAT akan aktif otomatis untuk profesi klinis seperti dokter, perawat, dan bidan, tetapi tetap bisa diubah manual.</p>
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
                  <Label htmlFor="full_name" className="flex items-center gap-2 text-xs font-medium"><User className="h-3.5 w-3.5 text-muted-foreground" />Nama Pegawai</Label>
                  <Input id="full_name" required value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="h-10 text-sm" placeholder="Nama lengkap pegawai" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee_code" className="flex items-center gap-2 text-xs font-medium"><BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" />Kode Pegawai</Label>
                  <Input id="employee_code" value="Akan dibuat otomatis saat disimpan" readOnly className="h-10 text-sm bg-muted/40" />
                  <p className="text-xs text-muted-foreground">Format kode mengikuti pola harian sistem, misalnya `EMP-20260412-0001`.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nik_number" className="text-xs font-medium">NIK</Label>
                  <Input id="nik_number" value={formData.nik_number} onChange={(e) => setFormData({ ...formData, nik_number: e.target.value })} className="h-10 text-sm" placeholder="16 digit NIK" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nip_number" className="text-xs font-medium">NIP</Label>
                  <Input id="nip_number" value={formData.nip_number} onChange={(e) => setFormData({ ...formData, nip_number: e.target.value })} className="h-10 text-sm" placeholder="NIP pegawai" />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profession" className="flex items-center gap-2 text-xs font-medium"><Briefcase className="h-3.5 w-3.5 text-muted-foreground" />Profesi</Label>
                  <SearchableSelect
                    options={EMPLOYEE_PROFESSION_OPTIONS}
                    value={formData.profession}
                    onValueChange={handleProfessionChange}
                    placeholder="Pilih profesi..."
                    searchPlaceholder="Cari profesi..."
                    noneLabel="Pilih profesi"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_number" className="text-xs font-medium">Nomor Izin/STR/SIP</Label>
                  <Input id="license_number" value={formData.license_number} onChange={(e) => setFormData({ ...formData, license_number: e.target.value })} className="h-10 text-sm" placeholder="Opsional sesuai profesi" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2 text-xs font-medium"><Phone className="h-3.5 w-3.5 text-muted-foreground" />Telepon</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="h-10 text-sm" placeholder="08xxxxxxxxxx" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="satusehat_practitioner_id" className="text-xs font-medium">Practitioner ID SATUSEHAT</Label>
                  <Input id="satusehat_practitioner_id" value={formData.satusehat_practitioner_id} onChange={(e) => setFormData({ ...formData, satusehat_practitioner_id: e.target.value })} className="h-10 text-sm" placeholder="IHS number pegawai bila sudah tersedia" />
                  <p className="text-xs text-muted-foreground">Dipakai sebagai performer/requester SATUSEHAT untuk modul farmasi, laboratorium, radiologi, atau tindakan sesuai konteks pegawai.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_id" className="flex items-center gap-2 text-xs font-medium"><Mail className="h-3.5 w-3.5 text-muted-foreground" />Akun User</Label>
                  <SearchableSelect
                    options={userOptions}
                    value={formData.user_id}
                    onValueChange={(value) => setFormData({ ...formData, user_id: value })}
                    placeholder="Pilih akun user..."
                    searchPlaceholder="Cari user..."
                    noneLabel="Tanpa akun"
                  />
                  {availableUsers.length === 0 ? <p className="text-xs text-muted-foreground">Semua akun sudah tertaut ke master pegawai lain.</p> : null}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="requires_satusehat" className="cursor-pointer text-xs font-medium">Perlu SATUSEHAT</Label>
                  <p className="text-xs text-muted-foreground">Aktifkan bila pegawai ini perlu disiapkan untuk integrasi SATUSEHAT.</p>
                </div>
                <Switch id="requires_satusehat" checked={formData.requires_satusehat} onCheckedChange={(checked) => setFormData({ ...formData, requires_satusehat: checked })} />
              </div>

              <div className="flex items-center justify-between rounded-md border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="is_active" className="cursor-pointer text-xs font-medium">Status Aktif</Label>
                  <p className="text-xs text-muted-foreground">{formData.is_active ? 'Pegawai aktif' : 'Pegawai tidak aktif'}</p>
                </div>
                <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
              </div>

              {selectedUser ? (
                <div className="rounded-md border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                  Akun tertaut: <span className="font-medium text-foreground">{selectedUser.full_name || selectedUser.username}</span> · Role <span className="font-medium text-foreground">{selectedUser.role?.name || '-'}</span>
                </div>
              ) : null}
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}