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
    <div className="p-6">
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <section className="space-y-5 rounded-lg border border-border/80 p-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Nama Role
              </Label>
              <Input
                id="name"
                required
                placeholder="e.g., Admin"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Deskripsi
              </Label>
              <Textarea
                id="description"
                placeholder="Deskripsi role..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="min-h-[96px]"
              />
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="flex items-center justify-between">
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <h4 className="font-medium text-sm">{module}</h4>
                        <Badge variant="outline" className="text-xs">
                          {modulePermissions.filter(p => formData.permission_ids.includes(p.id)).length}/{modulePermissions.length}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const modulePermIds = modulePermissions.map(p => p.id);
                          const allSelected = modulePermIds.every(id => formData.permission_ids.includes(id));
                          if (allSelected) {
                            setFormData(prev => ({
                              ...prev,
                              permission_ids: prev.permission_ids.filter(id => !modulePermIds.includes(id)),
                            }));
                          } else {
                            setFormData(prev => ({
                              ...prev,
                              permission_ids: [...new Set([...prev.permission_ids, ...modulePermIds])],
                            }));
                          }
                        }}
                        className="text-xs"
                      >
                        {modulePermissions.every(p => formData.permission_ids.includes(p.id)) ? 'Clear' : 'Select'}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 p-3">
                    {modulePermissions.map(perm => (
                      <div key={perm.id} className="flex items-center space-x-3 rounded-md border p-2.5 transition-colors hover:bg-muted/30">
                        <Checkbox
                          id={`perm-${perm.id}`}
                          checked={formData.permission_ids.includes(perm.id)}
                          onCheckedChange={() => handlePermissionToggle(perm.id)}
                        />
                        <div className="flex-1 flex items-center justify-between">
                          <div className="space-y-1">
                            <label htmlFor={`perm-${perm.id}`} className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2">
                              {perm.name}
                              <Badge variant="secondary" className="text-xs">{perm.category}</Badge>
                            </label>
                            {perm.description && <p className="text-xs text-muted-foreground">{perm.description}</p>}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShowPermissionInfo(perm)}
                            className="h-7 w-7 p-0"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {Object.keys(groupedPermissions).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Tidak ada permission tersedia.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role Preview</p>
            <p className="font-medium">{formData.name || 'Nama role belum diisi'}</p>
            <p className="mt-1 text-muted-foreground line-clamp-3">{formData.description || 'Deskripsi role belum diisi.'}</p>
            <p className="mt-3 text-muted-foreground">Total permission: {formData.permission_ids.length}</p>
          </div>

          <div className="rounded-lg border border-border/80 p-3">
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={loading} className="h-10">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan Role
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/roles')} className="h-10">
                Batal
              </Button>
            </div>
          </div>
        </aside>
      </form>

      <PermissionDetailModal
        permission={selectedPermission}
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
      />
    </div>
  );
}