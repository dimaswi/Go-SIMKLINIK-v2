import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { rolesApi, usersApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Lock, Mail, Shield, User } from 'lucide-react';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function UserCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([]);
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    full_name: '',
    role_id: '',
  });

  useEffect(() => {
    setPageTitle('Create User');
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      const response = await rolesApi.getAll();
      setRoles(response.data.data);
    } catch (error) {
      console.error('Failed to load roles:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await usersApi.create({
        ...formData,
        role_id: parseInt(formData.role_id, 10),
      });
      toast({
        variant: "success",
        title: "Success!",
        description: "User created successfully.",
      });
      setTimeout(() => navigate("/users"), 400);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description:
          error instanceof Error ? error.message : 'Failed to create user.',
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = roles.find((role) => String(role.id) === formData.role_id);

  return (
    <form id="user-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Create User"
        subtitle="Create a new account and assign a role before the user starts using the application."
        onBack={() => navigate('/users')}
        actions={<Button type="submit" form="user-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan User</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview identitas akun yang akan dibuat.">
                <div className="space-y-1 text-sm">
                  <p className="truncate font-medium">{formData.full_name || 'Nama belum diisi'}</p>
                  <p className="truncate text-muted-foreground">{formData.email || 'Email belum diisi'}</p>
                  <p className="text-muted-foreground">Username: {formData.username || '-'}</p>
                  <p className="text-muted-foreground">Role: {selectedRole?.name || '-'}</p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Catatan" helper="Password awal akan disimpan sesuai input dan bisa diubah kemudian oleh admin.">
                <p className="text-sm text-muted-foreground">Pastikan role sudah sesuai agar hak akses user tidak terlalu luas.</p>
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
                  <Label htmlFor="full_name" className="text-xs font-medium flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    Nama Lengkap
                  </Label>
                  <Input id="full_name" required placeholder="Masukkan nama lengkap" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="h-10 text-sm" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username" className="text-xs font-medium flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    Username
                  </Label>
                  <Input id="username" required placeholder="Masukkan username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className="h-10 text-sm" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-medium flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Email
                  </Label>
                  <Input id="email" type="email" required placeholder="email@example.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="h-10 text-sm" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-medium flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    Password
                  </Label>
                  <Input id="password" type="password" required placeholder="Masukkan password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="h-10 text-sm" />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-2">
                <Label htmlFor="role_id" className="text-xs font-medium flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  Role
                </Label>
                <SearchableSelect
                  options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
                  value={formData.role_id}
                  onValueChange={(value) => setFormData({ ...formData, role_id: value })}
                  placeholder="Pilih role..."
                  searchPlaceholder="Cari role..."
                  emptyText="Role tidak ditemukan."
                  noneLabel="Pilih role"
                />
              </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
