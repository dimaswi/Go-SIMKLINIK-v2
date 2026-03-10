import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { setPageTitle } from '@/lib/page-title';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { rolesApi } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { 
  ArrowLeft, 
  Loader2, 
  Edit,
  Shield,
  Calendar,
  Lock,
  Layers2,
  Trash2,
} from 'lucide-react';

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

export default function RoleShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [role, setRole] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('Role Details');
    loadRole();
  }, [id]);

  const loadRole = async () => {
    try {
      const response = await rolesApi.getById(Number(id));
      setRole(response.data.data);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Failed to load role data.",
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
      await rolesApi.delete(parseInt(id!));
      toast({
        variant: "success",
        title: "Success!",
        description: "Role deleted successfully.",
      });
      setTimeout(() => navigate('/roles'), 500);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to delete role.",
      });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memuat detail role...</p>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <p className="text-lg font-semibold">Role tidak ditemukan</p>
          <p className="mt-1 text-sm text-muted-foreground">Data role ini tidak tersedia atau sudah dihapus.</p>
          <Button onClick={() => navigate('/roles')} className="mt-5">
            Back to Roles
          </Button>
        </div>
      </div>
    );
  }

  const permissionCount = role.permissions?.length || 0;
  const permissionCountBadgeClass = permissionCount > 0
    ? 'h-6 rounded-md border-0 bg-violet-500 px-2 text-[11px] font-semibold text-white'
    : 'h-6 rounded-md border-0 bg-rose-500 px-2 text-[11px] font-semibold text-white';

  return (
    <div className="p-4">
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => navigate('/roles')} className="h-9 w-9 shrink-0 rounded-md">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Kembali ke Roles</span>
                </Button>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="h-6 rounded-md border-0 bg-sky-500 px-2 text-[11px] font-semibold text-white">ID #{role.id}</Badge>
                    <Badge className={permissionCountBadgeClass}>{permissionCount} Permission</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {hasPermission('roles.update') && (
                <Button size="sm" onClick={() => navigate(`/roles/${id}/edit`)}>
                  <Edit className="h-4 w-4" />
                  Edit Role
                </Button>
              )}
              {hasPermission('roles.delete') && (
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Hapus Role
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Nama Role</p>
              <p className="text-sm font-medium">{role.name}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Deskripsi</p>
              <p className="truncate text-sm font-medium">{role.description || '-'}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Permission</p>
              <p className="text-sm font-medium">{role.permissions?.length || 0} izin</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Kelompok</p>
              <p className="text-sm font-medium">Role Management</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Daftar Permission Role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  Semua permission di bawah ini akan diwariskan ke user yang menggunakan role ini.
                </p>
              </div>

              <Separator />

              {role.permissions && role.permissions.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {role.permissions.map((perm: any) => (
                    <div key={perm.id} className="rounded-md border bg-muted/30 px-3 py-3">
                      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        {perm.name}
                      </div>
                      <p className="text-xs text-muted-foreground">{perm.description || 'Tanpa deskripsi'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">Belum ada permission pada role ini.</p>
                  {hasPermission('roles.update') && (
                    <Button onClick={() => navigate(`/roles/${id}/edit`)} variant="outline" size="sm" className="mt-3">
                      <Edit className="h-4 w-4" />
                      Kelola Permission
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadata Role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Kategori</p>
                <p className="flex items-center gap-2 font-medium">
                  <Layers2 className="h-4 w-4 text-muted-foreground" />
                  Role Access Group
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Dibuat</p>
                <p className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {formatDateTime(role.created_at)}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Terakhir Diubah</p>
                <p className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {formatDateTime(role.updated_at)}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Tag</p>
                <p className="flex items-center gap-2 font-medium">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  ID #{role.id}
                </p>
              </div>

              <Button className="w-full" variant="outline" onClick={() => navigate('/roles')}>
                Kembali ke Daftar Role
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus Role"
        description="Apakah Anda yakin ingin menghapus role ini? Tindakan ini tidak dapat dibatalkan."
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}
