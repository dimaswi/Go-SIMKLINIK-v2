import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { usersApi } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { 
  ArrowLeft, 
  Loader2, 
  Edit,
  Shield,
  Mail,
  User,
  Calendar,
  CircleCheck,
  CircleX,
  Trash2,
} from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

function formatDateTime(dateValue?: string) {
  if (!dateValue) return '-';
  return new Date(dateValue).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UserShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('User Details');
    loadUser();
  }, [id]);

  const loadUser = async () => {
    try {
      const response = await usersApi.getById(Number(id));
      setUser(response.data.data);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Failed to load user data.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await usersApi.delete(parseInt(id!));
      toast({
        variant: "success",
        title: "Success!",
        description: "User deleted successfully.",
      });
      setTimeout(() => navigate('/users'), 500);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to delete user.",
      });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memuat detail user...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <p className="text-lg font-semibold">User tidak ditemukan</p>
          <p className="mt-1 text-sm text-muted-foreground">Data user ini tidak tersedia atau sudah dihapus.</p>
          <Button onClick={() => navigate('/users')} className="mt-5">
            Back to Users
          </Button>
        </div>
      </div>
    );
  }

  const roleBadgeClass = user.role?.name
    ? 'h-6 rounded-md border-0 bg-amber-500 px-2 text-[11px] font-semibold text-white'
    : 'h-6 rounded-md border-0 bg-slate-500 px-2 text-[11px] font-semibold text-white';

  return (
    <div className="p-4">
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => navigate('/users')} className="h-9 w-9 shrink-0 rounded-md">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Kembali ke Users</span>
                </Button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="h-6 rounded-md border-0 bg-sky-500 px-2 text-[11px] font-semibold text-white">ID #{user.id}</Badge>
                    <Badge className={user.is_active ? 'h-6 rounded-md border-0 bg-emerald-500 px-2 text-[11px] font-semibold text-white' : 'h-6 rounded-md border-0 bg-rose-500 px-2 text-[11px] font-semibold text-white'}>
                      {user.is_active ? 'AKTIF' : 'NONAKTIF'}
                    </Badge>
                    <Badge className={roleBadgeClass}>{user.role?.name || 'Tanpa Role'}</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {hasPermission('users.update') && (
                <Button size="sm" onClick={() => navigate(`/users/${id}/edit`)}>
                  <Edit className="h-4 w-4" />
                  Edit User
                </Button>
              )}
              {hasPermission('users.delete') && (
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Hapus User
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Username</p>
              <p className="text-sm font-medium">{user.username}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Email</p>
              <p className="truncate text-sm font-medium">{user.email || '-'}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Permission</p>
              <p className="text-sm font-medium">{user.role?.permissions?.length || 0} izin</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Status</p>
              <p className="text-sm font-medium">{user.is_active ? 'Aktif' : 'Nonaktif'}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Informasi Utama</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Identitas</p>
                  <div className="space-y-2 text-sm">
                    <p className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{user.full_name}</p>
                    <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{user.email || '-'}</p>
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Akses Role</p>
                  <div className="space-y-2 text-sm">
                    <p className="flex items-center gap-2"><Shield className="h-4 w-4 text-muted-foreground" />{user.role?.name || '-'}</p>
                    <p className="text-muted-foreground">{user.role?.description || 'Role belum memiliki deskripsi'}</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Permission dari Role</p>
                {user.role?.permissions && user.role.permissions.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {user.role.permissions.map((perm: any) => (
                      <div key={perm.id} className="rounded-md border bg-muted/30 px-3 py-2">
                        <p className="text-sm font-medium">{perm.name}</p>
                        <p className="text-xs text-muted-foreground">{perm.description || 'Tanpa deskripsi'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Role ini belum memiliki permission.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="flex items-center gap-2 font-medium">
                  {user.is_active ? (
                    <CircleCheck className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <CircleX className="h-4 w-4 text-destructive" />
                  )}
                  {user.is_active ? 'Akun Aktif' : 'Akun Tidak Aktif'}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Dibuat</p>
                <p className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {formatDateTime(user.created_at)}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Terakhir Diubah</p>
                <p className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {formatDateTime(user.updated_at)}
                </p>
              </div>

              <Button className="w-full" variant="outline" onClick={() => navigate('/users')}>
                Kembali ke Daftar User
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus User"
        description="Apakah Anda yakin ingin menghapus user ini? Tindakan ini tidak dapat dibatalkan."
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}
