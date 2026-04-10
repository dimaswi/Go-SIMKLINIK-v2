import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setPageTitle } from '@/lib/page-title';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { PermissionDetailModal } from '@/components/permission-detail-modal';
import { rolesApi, permissionsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, FileText, CheckSquare, Info, Package } from 'lucide-react';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function RoleCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, any[]>>({});
  const [selectedPermission, setSelectedPermission] = useState<any>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permission_ids: [] as number[],
  });

  useEffect(() => {
    setPageTitle('Create Role');
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      const response = await permissionsApi.getAll();
      const allPermissions = response.data.data;
      
      // Group permissions by module
      const grouped = allPermissions.reduce((acc: Record<string, any[]>, permission: any) => {
        const module = permission.module || 'Other';
        if (!acc[module]) {
          acc[module] = [];
        }
        acc[module].push(permission);
        return acc;
      }, {});
      
      setGroupedPermissions(grouped);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Failed to load permissions.",
      });
    }
  };

  const handlePermissionToggle = (permId: number) => {
    setFormData(prev => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permId)
        ? prev.permission_ids.filter(id => id !== permId)
        : [...prev.permission_ids, permId]
    }));
  };

  const handleShowPermissionInfo = (permission: any) => {
    setSelectedPermission(permission);
    setShowPermissionModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await rolesApi.create(formData);
      toast({
        variant: "success",
        title: "Success!",
        description: "Role created successfully.",
      });
      setTimeout(() => navigate('/roles'), 500);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to create role.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PermissionDetailModal permission={selectedPermission} isOpen={showPermissionModal} onClose={() => setShowPermissionModal(false)} />

      <form id="role-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MasterDataPageShell
          title="Create Role"
          subtitle="Create a role and assemble its permission matrix before assigning it to users."
          onBack={() => navigate('/roles')}
          actions={<Button type="submit" form="role-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Role</Button>}
          aside={
            <MasterDataAsideStack>
              <div>
                <MasterDataAsideSection title="Role Preview" helper="Ringkasan cepat nama role dan total permission terpilih.">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{formData.name || 'Nama role belum diisi'}</p>
                    <p className="text-muted-foreground line-clamp-3">{formData.description || 'Deskripsi role belum diisi.'}</p>
                    <p className="text-muted-foreground">Total permission: {formData.permission_ids.length}</p>
                  </div>
                </MasterDataAsideSection>
              </div>
              <div>
                <MasterDataAsideSection title="Pemilihan Cepat" helper="Gunakan tombol Select atau Clear per modul untuk mempercepat penyusunan hak akses.">
                  <p className="text-sm text-muted-foreground">Periksa kembali permission yang sensitif sebelum role dipakai di produksi.</p>
                </MasterDataAsideSection>
              </div>
            </MasterDataAsideStack>
          }
        >
          <MasterDataLegacySections>
            <div className="space-y-6">
              <section className="space-y-5 rounded-lg border border-border/80 p-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Nama Role
                  </Label>
                  <Input id="name" required placeholder="e.g., Admin" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-10" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Deskripsi
                  </Label>
                  <Textarea id="description" placeholder="Deskripsi role..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="min-h-[96px]" />
                </div>
              </section>

              <section className="space-y-4 rounded-lg border border-border/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    Permission Matrix
                  </Label>
                  <Badge variant="secondary" className="text-sm">{formData.permission_ids.length} dipilih</Badge>
                </div>

                <div className="max-h-[560px] overflow-y-auto rounded-md border">
                  {Object.entries(groupedPermissions).map(([module, modulePermissions]) => (
                    <div key={module} className="border-b last:border-b-0">
                      <div className="border-b bg-muted/20 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <h4 className="font-medium text-sm">{module}</h4>
                            <Badge variant="outline" className="text-xs">
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
                            className="text-xs"
                          >
                            {modulePermissions.every((permission) => formData.permission_ids.includes(permission.id)) ? 'Clear' : 'Select'}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2 p-3">
                        {modulePermissions.map((permission) => (
                          <div key={permission.id} className="flex items-center space-x-3 rounded-md border p-2.5 transition-colors hover:bg-muted/30">
                            <Checkbox id={`perm-${permission.id}`} checked={formData.permission_ids.includes(permission.id)} onCheckedChange={() => handlePermissionToggle(permission.id)} />
                            <div className="flex flex-1 items-center justify-between gap-3">
                              <div className="space-y-1">
                                <label htmlFor={`perm-${permission.id}`} className="cursor-pointer text-sm font-medium leading-none flex items-center gap-2">
                                  {permission.name}
                                  <Badge variant="secondary" className="text-xs">{permission.category}</Badge>
                                </label>
                                {permission.description ? <p className="text-xs text-muted-foreground">{permission.description}</p> : null}
                              </div>
                              <Button type="button" variant="ghost" size="sm" onClick={() => handleShowPermissionInfo(permission)} className="h-7 w-7 p-0">
                                <Info className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {Object.keys(groupedPermissions).length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      <p className="text-sm">Tidak ada permission tersedia.</p>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          </MasterDataLegacySections>
        </MasterDataPageShell>
      </form>
    </>
  );
}