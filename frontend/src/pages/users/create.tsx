import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { rolesApi, usersApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { Loader2 } from 'lucide-react';
import { MasterDataPageShell } from '@/pages/master-data/shared';

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
    setPageTitle('Tambah User');
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
        title: "Berhasil!",
        description: "User berhasil dibuat.",
      });
      setTimeout(() => navigate("/users"), 400);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description: error.response?.data?.error || (error instanceof Error ? error.message : 'Gagal membuat user.'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="user-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Tambah User"
        subtitle="Akun baru dan penugasan role pengguna."
        onBack={() => navigate('/users')}
        actions={
          <Button type="submit" form="user-create-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Simpan User
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Akun & Hak Akses</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="full_name" className="text-xs font-medium">Nama Lengkap *</Label>
                <Input
                  id="full_name"
                  required
                  placeholder="Nama lengkap user"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="username" className="text-xs font-medium">Username *</Label>
                <Input
                  id="username"
                  required
                  placeholder="Username login"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-medium">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs font-medium">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  placeholder="Minimal 6 karakter"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="role_id" className="text-xs font-medium">Role Akses *</Label>
                <SearchableSelect
                  options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
                  value={formData.role_id}
                  onValueChange={(value) => setFormData({ ...formData, role_id: value })}
                  placeholder="Pilih role..."
                  searchPlaceholder="Cari role..."
                  emptyText="Role tidak ditemukan."
                  noneLabel="Pilih role"
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
