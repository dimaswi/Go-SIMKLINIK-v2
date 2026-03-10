import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setPageTitle } from '@/lib/page-title';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { createPermissionColumns } from './columns';
import { permissionsApi, type Permission } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Loader2, Plus } from 'lucide-react';

export default function PermissionsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionToDelete, setPermissionToDelete] = useState<number | null>(null);

  useEffect(() => {
    setPageTitle('Permissions');
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      const response = await permissionsApi.getAll();
      setPermissions(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to load permissions.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: number) => {
    setPermissionToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!permissionToDelete) return;
    
    try {
      await permissionsApi.delete(permissionToDelete);
      toast({
        variant: "success",
        title: "Success!",
        description: "Permission deleted successfully.",
      });
      loadPermissions();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to delete permission.",
      });
    } finally {
      setDeleteDialogOpen(false);
      setPermissionToDelete(null);
    }
  };

  // Handle actions
  const handleView = (id: number) => {
    navigate(`/permissions/${id}`);
  };

  const handleEdit = (id: number) => {
    navigate(`/permissions/${id}/edit`);
  };

  // Create columns
  const columns = createPermissionColumns({
    onView: handleView,
    onEdit: handleEdit,
    onDelete: handleDeleteClick,
    hasViewPermission: hasPermission('permissions.view'),
    hasEditPermission: hasPermission('permissions.update'),
    hasDeletePermission: hasPermission('permissions.delete'),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <DataTable
        columns={columns}
        data={permissions}
        searchPlaceholder="Search permissions by name or description..."
        pageSize={10}
        toolbarActions={
          hasPermission('permissions.create') ? (
            <Button onClick={() => navigate('/permissions/create')}>
              <Plus className="h-4 w-4" />
              Add Permission
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete Permission"
        description="Are you sure you want to delete this permission? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  );
}
