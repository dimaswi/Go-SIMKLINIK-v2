import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { setPageTitle } from '@/lib/page-title';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { permissionsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  ArrowLeft,
  Loader2,
  Edit,
  Trash2,
  KeyRound,
  Calendar,
  Blocks,
  ListChecks,
  ShieldCheck,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';

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

export default function PermissionShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { canPerform } = usePermission();
  const [permission, setPermission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('Permission Details');
    loadPermission();
  }, [id]);

  const loadPermission = async () => {
    try {
      const response = await permissionsApi.getById(Number(id));
      setPermission(response.data.data);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Failed to load permission data.",
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
      await permissionsApi.delete(parseInt(id!));
      toast({
        variant: "success",
        title: "Success!",
        description: "Permission deleted successfully.",
      });
      setTimeout(() => navigate('/permissions'), 500);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to delete permission.",
      });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memuat detail permission...</p>
        </div>
      </div>
    );
  }

  if (!permission) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="rounded-xl border bg-card px-8 py-10 text-center shadow-sm">
          <p className="text-lg font-semibold">Permission tidak ditemukan</p>
          <p className="mt-1 text-sm text-muted-foreground">Kemungkinan data sudah dihapus atau ID tidak valid.</p>
          <Button onClick={() => navigate('/permissions')} className="mt-5">
            Back to Permissions
          </Button>
        </div>
      </div>
    );
  }

  const permissionModule = permission.name?.split('.')[0] || 'general';
  const permissionAction = permission.name?.split('.')[1] || 'action';

  const moduleBadgeClass = permissionModule === 'users'
    ? 'h-6 rounded-md border-0 bg-sky-500 px-2 text-[11px] font-semibold text-white'
    : permissionModule === 'roles'
      ? 'h-6 rounded-md border-0 bg-violet-500 px-2 text-[11px] font-semibold text-white'
      : permissionModule === 'permissions'
        ? 'h-6 rounded-md border-0 bg-emerald-500 px-2 text-[11px] font-semibold text-white'
        : 'h-6 rounded-md border-0 bg-slate-500 px-2 text-[11px] font-semibold text-white';

  const normalizedAction = permissionAction.toLowerCase();
  const actionBadgeClass = normalizedAction === 'delete' || normalizedAction === 'remove'
    ? 'h-6 rounded-md border-0 bg-rose-500 px-2 text-[11px] font-semibold text-white'
    : normalizedAction === 'create' || normalizedAction === 'update' || normalizedAction === 'edit' || normalizedAction === 'assign'
      ? 'h-6 rounded-md border-0 bg-amber-500 px-2 text-[11px] font-semibold text-white'
      : 'h-6 rounded-md border-0 bg-emerald-500 px-2 text-[11px] font-semibold text-white';

  return (
    <div className="p-4">
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => navigate('/permissions')} className="h-9 w-9 shrink-0 rounded-md">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Kembali ke Permissions</span>
                </Button>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="h-6 rounded-md border-0 bg-sky-500 px-2 text-[11px] font-semibold text-white">ID #{permission.id}</Badge>
                    <Badge className={moduleBadgeClass}>{permissionModule}</Badge>
                    <Badge className={actionBadgeClass}>{permissionAction}</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {canPerform('role_management', 'update') && (
                <Button size="sm" onClick={() => navigate(`/permissions/${id}/edit`)}>
                  <Edit className="h-4 w-4" />
                  Edit Permission
                </Button>
              )}
              {canPerform('role_management', 'delete') && (
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Hapus Permission
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Nama Permission</p>
              <p className="truncate text-sm font-medium">{permission.name}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Kategori</p>
              <p className="text-sm font-medium">{permission.name?.split('.')[0] || '-'}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Aksi</p>
              <p className="text-sm font-medium">{permission.name?.split('.')[1] || '-'}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Scope</p>
              <p className="text-sm font-medium">Role & Access Control</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Detail Permission</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Identifier</p>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    {permission.name}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Description</p>
                  <p className="text-sm text-muted-foreground">
                    {permission.description || 'Permission ini belum memiliki deskripsi teknis.'}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Interpretasi Struktur</p>
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-2">
                    <Blocks className="h-4 w-4 text-muted-foreground" />
                    Modul: <span className="font-medium">{permission.name?.split('.')[0] || '-'}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-muted-foreground" />
                    Operasi: <span className="font-medium">{permission.name?.split('.')[1] || '-'}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Tipe</p>
                <p className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  System Permission
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Dibuat</p>
                <p className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {formatDateTime(permission.created_at)}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Terakhir Diubah</p>
                <p className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {formatDateTime(permission.updated_at)}
                </p>
              </div>

              <Button className="w-full" variant="outline" onClick={() => navigate('/permissions')}>
                Kembali ke Daftar Permission
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus Permission"
        description="Apakah Anda yakin ingin menghapus permission ini? Tindakan ini tidak dapat dibatalkan."
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}
