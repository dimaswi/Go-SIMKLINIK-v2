import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usersApi, rolesApi } from '@/lib/api';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Shield } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function UserEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [roles, setRoles] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    full_name: '',
    role_id: '',
    is_active: true,
  });

  useEffect(() => {
    setPageTitle('Edit User');
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [userRes, rolesRes] = await Promise.all([
        usersApi.getById(Number(id)),
        rolesApi.getAll(),
      ]);
      const user = userRes.data.data;
      setFormData({
        full_name: user.full_name,
        role_id: String(user.role_id),
        is_active: user.is_active,
      });
      setRoles(rolesRes.data.data);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Failed to load user data.",
      });
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await usersApi.update(Number(id), {
        ...formData,
        role_id: parseInt(formData.role_id),
      });
      toast({
        variant: "success",
        title: "Success!",
        description: "User updated successfully.",
      });
      setTimeout(() => navigate('/users'), 500);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to update user.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const selectedRole = roles.find((role: any) => String(role.id) === formData.role_id);

  return (
    <form id="user-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Edit User"
        subtitle="Adjust role assignment and account status for this user."
        onBack={() => navigate('/users')}
        actions={<Button type="submit" form="user-edit-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update User</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Preview perubahan utama pada akun user.">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{formData.full_name || '-'}</p>
                  <p className="text-muted-foreground">Role: {selectedRole?.name || '-'}</p>
                  <p className="text-muted-foreground">Status: {formData.is_active ? 'Aktif' : 'Nonaktif'}</p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-5 rounded-lg border border-border/80 p-5">
              <div className="space-y-2">
                <Label htmlFor="full_name" className="text-xs font-medium flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Nama Lengkap
                </Label>
                <Input id="full_name" required placeholder="Masukkan nama lengkap" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="h-10 text-sm" />
              </div>
            </section>

            <section className="space-y-5 rounded-lg border border-border/80 p-5">
              <div className="space-y-2">
                <Label htmlFor="role_id" className="text-xs font-medium flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  Role
                </Label>
                <SearchableSelect
                  options={roles.map((role: any) => ({ value: String(role.id), label: role.name }))}
                  value={formData.role_id}
                  onValueChange={(value) => setFormData({ ...formData, role_id: value })}
                  placeholder="Pilih role..."
                  searchPlaceholder="Cari role..."
                  emptyText="Role tidak ditemukan."
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="is_active" className="cursor-pointer text-xs font-medium">Status Akun</Label>
                  <p className="text-xs text-muted-foreground">{formData.is_active ? 'Akun aktif' : 'Akun tidak aktif'}</p>
                </div>
                <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
              </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
