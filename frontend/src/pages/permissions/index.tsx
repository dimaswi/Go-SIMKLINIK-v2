import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { setPageTitle } from '@/lib/page-title';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createPermissionColumns } from './columns';
import { permissionsApi, type Permission } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { KeyRound, Loader2, Plus, RefreshCw } from 'lucide-react';

export default function PermissionsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionToDelete, setPermissionToDelete] = useState<number | null>(null);

  const loadPermissions = useCallback(async () => {
    try {
      const response = await permissionsApi.getAll();
      setPermissions(response.data.data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error.response?.data?.error || "Failed to load permissions.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Permissions');
    loadPermissions();
  }, [loadPermissions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPermissions();
    setRefreshing(false);
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

  const handleView = (id: number) => {
    navigate(`/permissions/${id}`);
  };

  const handleEdit = (id: number) => {
    navigate(`/permissions/${id}/edit`);
  };

  const columns = useMemo(() => createPermissionColumns({
    onView: handleView,
    onEdit: handleEdit,
    onDelete: handleDeleteClick,
    hasViewPermission: hasPermission('permissions.view'),
    hasEditPermission: hasPermission('permissions.update'),
    hasDeletePermission: hasPermission('permissions.delete'),
  }), [hasPermission]);

  const filteredPermissions = useMemo(() => {
    if (!search.trim()) return permissions;
    const q = search.toLowerCase();
    return permissions.filter((p) => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
  }, [permissions, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Hak Akses (Permissions)
              </h1>
              <p className="text-xs text-muted-foreground">
                Pantau granularitas hak akses modul sistem ({filteredPermissions.length} permission)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari permission..."
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
            >
              <RefreshCw className={refreshing ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
              Segarkan
            </Button>

            {hasPermission('permissions.create') ? (
              <Button
                className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
                onClick={() => navigate('/permissions/create')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Tambah Permission
              </Button>
            ) : null}
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={filteredPermissions}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Tidak ada permission yang sesuai."
          />
        </div>
      </div>

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
