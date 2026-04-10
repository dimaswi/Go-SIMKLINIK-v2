import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { setPageTitle } from '@/lib/page-title';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { rolesApi } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { 
  Loader2, 
  Edit,
  Trash2,
} from 'lucide-react';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataDetailItem, MasterDataPageShell, MasterDataSection, formatMasterDataDateTime } from '@/pages/master-data/shared';

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
    ? 'h-5 rounded-none border-0 bg-violet-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none'
    : 'h-5 rounded-none border-0 bg-rose-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none';

  return (
    <>
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

      <MasterDataPageShell
        title={role.name}
        subtitle={role.description || 'Role access group'}
        onBack={() => navigate('/roles')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{role.id}</Badge>
            <Badge className={permissionCountBadgeClass}>{permissionCount} permission</Badge>
          </>
        }
        meta={<span>Role Management</span>}
        actions={
          <>
            {hasPermission('roles.update') && <Button className="rounded-none shadow-none" onClick={() => navigate(`/roles/${id}/edit`)}><Edit className="h-4 w-4" />Edit Role</Button>}
            {hasPermission('roles.delete') && <Button variant="destructive" className="rounded-none shadow-none" onClick={handleDelete} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus Role</Button>}
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Jumlah permission yang diwariskan ke user pengguna role ini.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Total permission: <span className="font-medium text-foreground">{permissionCount}</span></p>
                  <p>Kategori: <span className="font-medium text-foreground">Role Access Group</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Metadata" helper="Riwayat pencatatan role.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Dibuat: <span className="font-medium text-foreground">{formatMasterDataDateTime(role.created_at)}</span></p>
                  <p>Terakhir diubah: <span className="font-medium text-foreground">{formatMasterDataDateTime(role.updated_at)}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Informasi Role" helper="Data utama role yang dipakai untuk pengelolaan akses pengguna.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MasterDataDetailItem label="Nama Role" value={role.name} />
              <MasterDataDetailItem label="Deskripsi" value={role.description || '-'} />
              <MasterDataDetailItem label="Total Permission" value={permissionCount} />
            </div>
          </MasterDataSection>

          <MasterDataSection title="Daftar Permission Role" helper="Permission berikut akan diwariskan ke semua user yang menggunakan role ini.">
            {role.permissions && role.permissions.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {role.permissions.map((permission: any) => (
                  <div key={permission.id} className="border border-border/70 px-3 py-3">
                    <p className="text-sm font-medium">{permission.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{permission.description || 'Tanpa deskripsi'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-border/70 px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">Belum ada permission pada role ini.</p>
                {hasPermission('roles.update') && <Button onClick={() => navigate(`/roles/${id}/edit`)} variant="outline" size="sm" className="mt-3 rounded-none shadow-none"><Edit className="h-4 w-4" />Kelola Permission</Button>}
              </div>
            )}
          </MasterDataSection>
        </div>
      </MasterDataPageShell>
    </>
  );
}
