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
import { Loader2, Key, FileText, Package, Tag } from "lucide-react";

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
    action: "", // Single action instead of array
  });

  const actionOptions = [
    { id: 'view', label: 'View', description: 'Melihat/membaca data' },
    { id: 'create', label: 'Create', description: 'Membuat data baru' },
    { id: 'update', label: 'Update', description: 'Mengubah data yang ada' },
    { id: 'delete', label: 'Delete', description: 'Menghapus data' },
    { id: 'assign', label: 'Assign', description: 'Memberikan permission' },
  ];

  // Generate permission name automatically based on module and action
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

  // Auto-generate permission name when module or action change
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
      
      // Parse actions array and get first action
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
        actions: JSON.stringify([formData.action]) // Convert single action to array for backend
      };
      delete (submitData as any).action; // Remove action field, use actions instead
      
      await permissionsApi.update(Number(id), submitData);
      toast({
        variant: "success",
        title: "Success!",
        description: "Permission updated successfully.",
      });
      setTimeout(() => navigate("/permissions"), 500);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description:
          error.response?.data?.error || "Failed to update permission.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <section className="space-y-5 rounded-lg border border-border/80 p-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                Nama Permission
              </Label>
              <Input
                id="name"
                required
                placeholder="e.g., users.update"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="h-10"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="module" className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Module
                </Label>
                <Input
                  id="module"
                  required
                  placeholder="e.g., users"
                  value={formData.module}
                  onChange={e => setFormData({ ...formData, module: e.target.value })}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-sm font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  Category
                </Label>
                <Input
                  id="category"
                  required
                  placeholder="e.g., management"
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Action</Label>
              <Select
                value={formData.action}
                onValueChange={value => setFormData({ ...formData, action: value })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Pilih action" />
                </SelectTrigger>
                <SelectContent>
                  {actionOptions.map(action => (
                    <SelectItem key={action.id} value={action.id}>
                      <div className="flex flex-col text-left">
                        <span className="font-medium">{action.label}</span>
                        <span className="text-xs text-muted-foreground">{action.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Deskripsi
              </Label>
              <Textarea
                id="description"
                placeholder="Deskripsi permission..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="min-h-[110px]"
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/80 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permission Preview</p>
            <p className="font-medium">{formData.name || 'Nama permission belum diisi'}</p>
            <p className="mt-2 text-muted-foreground">Module: {formData.module || '-'}</p>
            <p className="text-muted-foreground">Category: {formData.category || '-'}</p>
            <p className="text-muted-foreground">Action: {formData.action || '-'}</p>
            <p className="mt-2 text-muted-foreground line-clamp-4">{formData.description || 'Deskripsi permission belum diisi.'}</p>
          </div>

          <div className="rounded-lg border border-border/80 p-3">
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={loading} className="h-10">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Permission
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/permissions')} className="h-10">
                Batal
              </Button>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
