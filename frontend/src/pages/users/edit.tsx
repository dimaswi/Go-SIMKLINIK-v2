import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usersApi, rolesApi } from '@/lib/api';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';

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

  return (
    <form id="user-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit User"
        subtitle="Perbarui role akses dan status akun pengguna."
        onBack={() => navigate('/users')}
        actions={
          <Button type="submit" form="user-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update User
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
                  placeholder="Masukkan nama lengkap"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="role_id" className="text-xs font-medium">Role Akses *</Label>
                <SearchableSelect
                  options={roles.map((role: any) => ({ value: String(role.id), label: role.name }))}
                  value={formData.role_id}
                  onValueChange={(value) => setFormData({ ...formData, role_id: value })}
                  placeholder="Pilih role..."
                  searchPlaceholder="Cari role..."
                  emptyText="Role tidak ditemukan."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
              <div>
                <Label htmlFor="is_active" className="cursor-pointer text-xs font-medium">Status Akun</Label>
                <p className="text-[11px] text-muted-foreground">{formData.is_active ? 'Akun aktif dan dapat login' : 'Akun dinonaktifkan'}</p>
              </div>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
