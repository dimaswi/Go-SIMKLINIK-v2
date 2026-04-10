import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setPageTitle } from "@/lib/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { permissionsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Key, FileText, Package, Tag } from "lucide-react";
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export default function PermissionCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
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
    setPageTitle("Create Permission");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = {
        ...formData,
        actions: JSON.stringify([formData.action]) // Convert single action to array for backend
      };
      delete (submitData as any).action; // Remove action field, use actions instead
      
      await permissionsApi.create(submitData);
      toast({
        variant: "success",
        title: "Success!",
        description: "Permission created successfully.",
      });
      setTimeout(() => navigate("/permissions"), 500);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description:
          error.response?.data?.error || "Failed to create permission.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="permission-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Create Permission"
        subtitle="Define a permission code, module, and action so it can be reused in role management."
        onBack={() => navigate('/permissions')}
        actions={<Button type="submit" form="permission-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Permission</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Permission Preview" helper="Nama permission akan mengikuti pola module.action saat modul dan action dipilih.">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{formData.name || 'Nama permission belum diisi'}</p>
                  <p className="text-muted-foreground">Module: {formData.module || '-'}</p>
                  <p className="text-muted-foreground">Category: {formData.category || '-'}</p>
                  <p className="text-muted-foreground">Action: {formData.action || '-'}</p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Deskripsi" helper="Gunakan deskripsi yang jelas agar role editor mudah memahami tujuan permission ini.">
                <p className="text-sm text-muted-foreground line-clamp-5">{formData.description || 'Deskripsi permission belum diisi.'}</p>
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
                  <Key className="h-4 w-4 text-muted-foreground" />
                  Nama Permission
                </Label>
                <Input id="name" required placeholder="e.g., users.create" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-10" />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="module" className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Module
                  </Label>
                  <Input id="module" required placeholder="e.g., users" value={formData.module} onChange={(e) => setFormData({ ...formData, module: e.target.value })} className="h-10" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category" className="text-sm font-medium flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    Category
                  </Label>
                  <Input id="category" required placeholder="e.g., management" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="h-10" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Action</Label>
                <Select value={formData.action} onValueChange={(value) => setFormData({ ...formData, action: value })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Pilih action" />
                  </SelectTrigger>
                  <SelectContent>
                    {actionOptions.map((action) => (
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
            </section>

            <section className="space-y-2 rounded-lg border border-border/80 p-5">
              <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Deskripsi
              </Label>
              <Textarea id="description" placeholder="Deskripsi permission..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="min-h-[110px]" />
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
