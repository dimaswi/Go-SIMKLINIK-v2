import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { employeesApi, type Employee, usersApi } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { 
  Loader2, 
  Edit,
  Trash2,
} from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { HeaderActionButton, MasterDataDetailItem, MasterDataPageShell, MasterDataSection, formatMasterDataDateTime } from '@/pages/master-data/shared';

export default function UserShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [user, setUser] = useState<any>(null);
  const [linkedEmployee, setLinkedEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('User Details');
    loadUser();
  }, [id]);

  const loadUser = async () => {
    try {
      const [userResponse, employeesResponse] = await Promise.all([usersApi.getById(Number(id)), employeesApi.getAll()]);
      const userData = userResponse.data.data;
      setUser(userData);
      setLinkedEmployee(employeesResponse.data.data.find((employee) => employee.user_id === userData.id) || null);
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
    ? 'h-5 rounded-none border-0 bg-amber-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none'
    : 'h-5 rounded-none border-0 bg-slate-500 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow-none';
  const permissionCount = user.role?.permissions?.length || 0;

  return (
    <>
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

      <MasterDataPageShell
        title={user.full_name}
        subtitle={user.email || user.username}
        onBack={() => navigate('/users')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{user.id}</Badge>
            <Badge className={user.is_active ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {user.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
            <Badge className={roleBadgeClass}>{user.role?.name || 'Tanpa Role'}</Badge>
          </>
        }
        meta={
          <>
            <span>Username {user.username}</span>
            <span>Pegawai {linkedEmployee?.employee_code || linkedEmployee?.full_name || '-'}</span>
            <span>{permissionCount} permission dari role</span>
          </>
        }
        actions={
          <>
            {hasPermission('users.update') && (
              <HeaderActionButton
                label="Edit User"
                icon={<Edit className="h-4 w-4" />}
                onClick={() => navigate(`/users/${id}/edit`)}
              />
            )}
            {hasPermission('users.delete') && (
              <HeaderActionButton
                label="Hapus User"
                icon={deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              />
            )}
          </>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Identitas Akun" helper="Data utama user yang dipakai untuk login dan identifikasi akun.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MasterDataDetailItem label="Nama Lengkap" value={user.full_name} />
              <MasterDataDetailItem label="Username" value={user.username} />
              <MasterDataDetailItem label="Email" value={user.email || '-'} />
              <MasterDataDetailItem label="Role" value={user.role?.name || '-'} />
              <MasterDataDetailItem label="Deskripsi Role" value={user.role?.description || 'Role belum memiliki deskripsi'} />
              <MasterDataDetailItem label="Status" value={user.is_active ? 'Aktif' : 'Nonaktif'} />
              <MasterDataDetailItem label="Waktu Dibuat" value={formatMasterDataDateTime(user.created_at)} />
              <MasterDataDetailItem label="Terakhir Diubah" value={formatMasterDataDateTime(user.updated_at)} />
            </div>
          </MasterDataSection>

          <MasterDataSection title="Keterkaitan Pegawai" helper="Hubungkan akun ke master pegawai agar identitas staf, profesi, dan akun tetap konsisten.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MasterDataDetailItem label="Status Tautan" value={linkedEmployee ? 'Sudah tertaut' : 'Belum tertaut'} />
              <MasterDataDetailItem label="Nama Pegawai" value={linkedEmployee?.full_name || '-'} />
              <MasterDataDetailItem label="Kode Pegawai" value={linkedEmployee?.employee_code || '-'} />
              <MasterDataDetailItem label="Profesi" value={linkedEmployee?.profession || '-'} />
              <MasterDataDetailItem label="NIP" value={linkedEmployee?.nip_number || '-'} />
              <MasterDataDetailItem label="Telepon" value={linkedEmployee?.phone || '-'} />
            </div>
          </MasterDataSection>

          <MasterDataSection title="Permission dari Role" helper="Permission berikut diwariskan dari role yang sedang terpasang pada user ini.">
            {user.role?.permissions && user.role.permissions.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {user.role.permissions.map((permission: any) => (
                  <div key={permission.id} className="border border-border/70 px-3 py-3">
                    <p className="text-sm font-medium">{permission.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{permission.description || 'Tanpa deskripsi'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Role ini belum memiliki permission.</p>
            )}
          </MasterDataSection>
        </div>
      </MasterDataPageShell>
    </>
  );
}
