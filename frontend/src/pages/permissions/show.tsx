import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { setPageTitle } from '@/lib/page-title';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { permissionsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  Loader2,
  Edit,
  Trash2,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataDetailItem, MasterDataPageShell, MasterDataSection, formatMasterDataDateTime } from '@/pages/master-data/shared';

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

  const parsedActions = (() => {
    try {
      const actions = typeof permission.actions === 'string' ? JSON.parse(permission.actions || '[]') : permission.actions;
      return Array.isArray(actions) ? actions : [];
    } catch {
      return [];
    }
  })();
  const permissionModule = permission.module || permission.name?.split('.')[0] || 'general';
  const permissionAction = parsedActions[0] || permission.name?.split('.')[1] || 'action';
  const permissionCategory = permission.category || '-';

  const moduleBadgeClass = permissionModule === 'users'
    ? 'h-5 rounded-none border-0 bg-sky-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none'
    : permissionModule === 'roles'
      ? 'h-5 rounded-none border-0 bg-violet-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none'
      : permissionModule === 'permissions'
        ? 'h-5 rounded-none border-0 bg-emerald-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none'
        : 'h-5 rounded-none border-0 bg-slate-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none';

  const normalizedAction = permissionAction.toLowerCase();
  const actionBadgeClass = normalizedAction === 'delete' || normalizedAction === 'remove'
    ? 'h-5 rounded-none border-0 bg-rose-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none'
    : normalizedAction === 'create' || normalizedAction === 'update' || normalizedAction === 'edit' || normalizedAction === 'assign'
      ? 'h-5 rounded-none border-0 bg-amber-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none'
      : 'h-5 rounded-none border-0 bg-emerald-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none';

  return (
    <>
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

      <MasterDataPageShell
        title={permission.name}
        subtitle={permission.description || 'System permission'}
        onBack={() => navigate('/permissions')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{permission.id}</Badge>
            <Badge className={moduleBadgeClass}>{permissionModule}</Badge>
            <Badge className={actionBadgeClass}>{permissionAction}</Badge>
          </>
        }
        meta={
          <>
            <span>Category {permissionCategory}</span>
            <span>Role & Access Control</span>
          </>
        }
        actions={
          <>
            {canPerform('role_management', 'update') && <Button className="rounded-none shadow-none" onClick={() => navigate(`/permissions/${id}/edit`)}><Edit className="h-4 w-4" />Edit Permission</Button>}
            {canPerform('role_management', 'delete') && <Button variant="destructive" className="rounded-none shadow-none" onClick={handleDelete} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus Permission</Button>}
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Interpretasi cepat struktur permission yang sedang dilihat.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Module: <span className="font-medium text-foreground">{permissionModule}</span></p>
                  <p>Category: <span className="font-medium text-foreground">{permissionCategory}</span></p>
                  <p>Action: <span className="font-medium text-foreground">{permissionAction}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Metadata" helper="Riwayat pencatatan permission.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Tipe: <span className="font-medium text-foreground">System Permission</span></p>
                  <p>Dibuat: <span className="font-medium text-foreground">{formatMasterDataDateTime(permission.created_at)}</span></p>
                  <p>Terakhir diubah: <span className="font-medium text-foreground">{formatMasterDataDateTime(permission.updated_at)}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Detail Permission" helper="Identifier dan atribut utama permission untuk role management.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MasterDataDetailItem label="Identifier" value={permission.name} />
              <MasterDataDetailItem label="Module" value={permissionModule} />
              <MasterDataDetailItem label="Category" value={permissionCategory} />
              <MasterDataDetailItem label="Action" value={permissionAction} />
              <MasterDataDetailItem label="Semua Actions" value={parsedActions.length > 0 ? parsedActions.join(', ') : permissionAction} />
              <MasterDataDetailItem label="Description" value={permission.description || 'Permission ini belum memiliki deskripsi teknis.'} />
            </div>
          </MasterDataSection>
        </div>
      </MasterDataPageShell>
    </>
  );
}
