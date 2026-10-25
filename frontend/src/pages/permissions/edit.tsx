import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { setPageTitle } from "@/lib/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { permissionsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { MasterDataPageShell } from '@/pages/master-data/shared';

export default function PermissionEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    module: "",
    category: "",
    description: "",
    action: "",
  });

  const actionOptions = [
    { id: 'view', label: 'View', description: 'Melihat/membaca data' },
    { id: 'create', label: 'Create', description: 'Membuat data baru' },
    { id: 'update', label: 'Update', description: 'Mengubah data yang ada' },
    { id: 'delete', label: 'Delete', description: 'Menghapus data' },
    { id: 'assign', label: 'Assign', description: 'Memberikan permission' },
  ];

  const generatePermissionName = (module: string, action: string) => {
    if (!module || !action) return "";
    
    const moduleMap: { [key: string]: string } = {
      "User Management": "users",
      "Role Management": "roles", 
      "Permission Management": "permissions",
      "Dashboard": "dashboard",
      "System Settings": "settings",
      "Profile Management": "profile"
    };
    
    const moduleKey = moduleMap[module] || module.toLowerCase().replace(/\s+/g, '_');
    return `${moduleKey}.${action}`;
  };

  useEffect(() => {
    if (formData.module && formData.action) {
      const generatedName = generatePermissionName(formData.module, formData.action);
      setFormData(prev => ({ ...prev, name: generatedName }));
    }
  }, [formData.module, formData.action]);

  useEffect(() => {
    setPageTitle("Edit Permission");
    loadPermission();
  }, [id]);

  const loadPermission = async () => {
    try {
      setFetching(true);
      const response = await permissionsApi.getById(Number(id));
      const permission = response.data.data;
      
      const actions = JSON.parse(permission.actions || '[]');
      const firstAction = actions.length > 0 ? actions[0] : '';
      
      setFormData({
        name: permission.name || "",
        module: permission.module || "",
        category: permission.category || "",
        description: permission.description || "",
        action: firstAction,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to load permission.",
      });
      navigate("/permissions");
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = {
        ...formData,
        actions: JSON.stringify([formData.action])
      };
      delete (submitData as any).action;
      
      await permissionsApi.update(Number(id), submitData);
      toast({
        variant: "success",
        title: "Success!",
        description: "Permission updated successfully.",
      });
      setTimeout(() => navigate("/permissions"), 400);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to update permission.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <form id="permission-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit Permission"
        subtitle="Perbarui modul, category, atau action permission."
        onBack={() => navigate('/permissions')}
        actions={
          <Button type="submit" form="permission-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update Permission
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Detail Permission</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label htmlFor="module" className="text-xs font-medium">Module *</Label>
                <Input
                  id="module"
                  required
                  placeholder="Contoh: users"
                  value={formData.module}
                  onChange={(e) => setFormData({ ...formData, module: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="category" className="text-xs font-medium">Category *</Label>
                <Input
                  id="category"
                  required
                  placeholder="Contoh: management"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Action *</Label>
                <Select value={formData.action} onValueChange={(value) => setFormData({ ...formData, action: value })}>
                  <SelectTrigger className="h-9 text-xs rounded-none">
                    <SelectValue placeholder="Pilih action" />
                  </SelectTrigger>
                  <SelectContent>
                    {actionOptions.map((action) => (
                      <SelectItem key={action.id} value={action.id}>
                        <div className="flex flex-col text-left">
                          <span className="font-medium text-xs">{action.label}</span>
                          <span className="text-[10px] text-muted-foreground">{action.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium">Nama Permission *</Label>
                <Input
                  id="name"
                  required
                  placeholder="Contoh: users.update"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs rounded-none font-mono"
                />
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
              <Textarea
                id="description"
                placeholder="Deskripsi fungsi permission ini..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="min-h-[70px] text-xs rounded-none"
              />
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
