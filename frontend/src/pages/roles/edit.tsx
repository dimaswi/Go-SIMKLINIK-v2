import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { setPageTitle } from '@/lib/page-title';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { PermissionDetailModal } from '@/components/permission-detail-modal';
import { rolesApi, permissionsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Info, Package } from 'lucide-react';
import { MasterDataPageShell } from '@/pages/master-data/shared';

export default function RoleEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, any[]>>({});
  const [selectedPermission, setSelectedPermission] = useState<any>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permission_ids: [] as number[],
  });

  useEffect(() => {
    setPageTitle('Edit Role');
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [roleRes, permRes] = await Promise.all([rolesApi.getById(Number(id)), permissionsApi.getAll()]);
      const role = roleRes.data.data;
      setFormData({ name: role.name, description: role.description, permission_ids: role.permissions?.map((p: any) => p.id) || [] });
      const grouped = permRes.data.data.reduce((acc: Record<string, any[]>, permission: any) => {
        const module = permission.module || 'Other';
        if (!acc[module]) acc[module] = [];
        acc[module].push(permission);
        return acc;
      }, {});
      setGroupedPermissions(grouped);
    } catch { toast({ variant: "destructive", title: "Error!" }); }
    finally { setFetching(false); }
  };

  const handlePermissionToggle = (permId: number) => {
    setFormData(prev => ({ ...prev, permission_ids: prev.permission_ids.includes(permId) ? prev.permission_ids.filter(id => id !== permId) : [...prev.permission_ids, permId] }));
  };

  const handleShowPermissionInfo = (permission: any) => { setSelectedPermission(permission); setShowPermissionModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await rolesApi.update(Number(id), formData); toast({ variant: "success", title: "Berhasil!" }); setTimeout(() => navigate(`/roles/${id}`), 500); }
    catch (e: any) { toast({ variant: "destructive", title: "Error!", description: e.response?.data?.error || "Gagal." }); }
    finally { setLoading(false); }
  };

  if (fetching) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <>
      <PermissionDetailModal permission={selectedPermission} isOpen={showPermissionModal} onClose={() => setShowPermissionModal(false)} />

      <form id="role-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <MasterDataPageShell
          title="Edit Role"
          subtitle="Perbarui nama role dan matriks hak akses permission."
          onBack={() => navigate(`/roles/${id}`)}
          actions={
            <Button type="submit" form="role-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Update Role
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2.5">
              <div className="border-b border-border/60 pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Role</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs font-medium">Nama Role *</Label>
                  <Input
                    id="name"
                    required
                    placeholder="Contoh: Admin, Dokter, Kasir"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
                  <Input
                    id="description"
                    placeholder="Keterangan singkat wewenang role"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="h-9 text-xs rounded-none"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-border/60 pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Permission Matrix</span>
                <Badge variant="secondary" className="text-xs rounded-none">{formData.permission_ids.length} dipilih</Badge>
              </div>

              <div className="max-h-[500px] overflow-y-auto border border-border/70">
                {Object.entries(groupedPermissions).map(([module, modulePermissions]) => (
                  <div key={module} className="border-b border-border/70 last:border-b-0">
                    <div className="border-b border-border/60 bg-muted/20 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          <h4 className="font-semibold text-xs text-foreground uppercase">{module}</h4>
                          <Badge variant="outline" className="text-[10px] rounded-none py-0 px-1.5">
                            {modulePermissions.filter((permission) => formData.permission_ids.includes(permission.id)).length}/{modulePermissions.length}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const modulePermIds = modulePermissions.map((permission) => permission.id);
                            const allSelected = modulePermIds.every((permissionId) => formData.permission_ids.includes(permissionId));
                            if (allSelected) {
                              setFormData((prev) => ({ ...prev, permission_ids: prev.permission_ids.filter((permissionId) => !modulePermIds.includes(permissionId)) }));
                            } else {
                              setFormData((prev) => ({ ...prev, permission_ids: [...new Set([...prev.permission_ids, ...modulePermIds])] }));
                            }
                          }}
                          className="h-6 px-2 text-[11px] rounded-none"
                        >
                          {modulePermissions.every((permission) => formData.permission_ids.includes(permission.id)) ? 'Hapus Semua' : 'Pilih Semua'}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2.5">
                      {modulePermissions.map((permission) => (
                        <div key={permission.id} className="flex items-start space-x-2 border border-border/60 p-2 transition-colors hover:bg-muted/30">
                          <Checkbox id={`perm-${permission.id}`} checked={formData.permission_ids.includes(permission.id)} onCheckedChange={() => handlePermissionToggle(permission.id)} className="mt-0.5" />
                          <div className="flex flex-1 items-start justify-between gap-1.5 min-w-0">
                            <div className="min-w-0">
                              <label htmlFor={`perm-${permission.id}`} className="cursor-pointer text-xs font-medium leading-tight block truncate">
                                {permission.name}
                              </label>
                              {permission.description ? <p className="text-[11px] text-muted-foreground line-clamp-1">{permission.description}</p> : null}
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleShowPermissionInfo(permission)} className="h-5 w-5 p-0 shrink-0">
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {Object.keys(groupedPermissions).length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground">
                    <p className="text-xs">Tidak ada permission tersedia.</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </MasterDataPageShell>
      </form>
    </>
  );
}