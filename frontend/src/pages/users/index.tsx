import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { createUserColumns } from './columns';
import { employeesApi, type Employee, usersApi, type User } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus, RefreshCw, UserCog } from 'lucide-react';

export default function UsersPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState<'all' | 'linked-required' | 'linked-not-required' | 'unlinked'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (employeeFilter !== 'all') {
        params.set('employee_filter', employeeFilter);
      }
      if (activeFilter === 'active') {
        params.set('is_active', 'true');
      }
      if (activeFilter === 'inactive') {
        params.set('is_active', 'false');
      }

      const [filteredUsersRes, employeesRes] = await Promise.all([
        usersApi.getAll(params.toString()),
        employeesApi.getAll(),
      ]);

      setUsers(filteredUsersRes.data.data);
      setEmployees(employeesRes.data.data);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error instanceof Error ? error.message : "Failed to load data.",
      });
    } finally {
      setLoading(false);
    }
  }, [activeFilter, employeeFilter, toast]);

  useEffect(() => {
    setPageTitle('Users');
    loadData();
  }, [loadData]);

  const confirmDelete = async () => {
    if (!userToDelete) return;
    
    try {
      await usersApi.delete(userToDelete);
      toast({
        variant: "success",
        title: "Success!",
        description: "User deleted successfully.",
      });
      loadData();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: error instanceof Error ? error.message : "Failed to delete user.",
      });
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };


  const handleView = (id: number) => {
    navigate(`/users/${id}`);
  };

  const handleEdit = (id: number) => {
    navigate(`/users/${id}/edit`);
  };

  const handleDeleteUser = (id: number) => {
    setUserToDelete(id);
    setDeleteDialogOpen(true);
  };

  // Create columns
  const columns = createUserColumns({
    onView: handleView,
    onEdit: handleEdit,
    onDelete: handleDeleteUser,
    hasViewPermission: hasPermission('users.view'),
    hasEditPermission: hasPermission('users.update'),
    hasDeletePermission: hasPermission('users.delete'),
    getLinkedEmployee: (userId) => employees.find((employee) => employee.user_id === userId),
  });

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const linkedEmp = employees.find((emp) => emp.user_id === u.id);
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      linkedEmp?.full_name?.toLowerCase().includes(q)
    );
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

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
              <UserCog className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Pengguna Sistem
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari user / email / pegawai..."
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />

            <SearchableSelect
              options={[
                { value: 'all', label: 'Semua User' },
                { value: 'linked-required', label: 'Perlu SATUSEHAT' },
                { value: 'linked-not-required', label: 'Tidak Perlu SATUSEHAT' },
                { value: 'unlinked', label: 'Belum Tertaut' },
              ]}
              value={employeeFilter}
              onValueChange={(val) => setEmployeeFilter(val as any)}
              placeholder="Tautan Pegawai"
              className="h-9 w-44 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />

            <SearchableSelect
              options={[
                { value: 'all', label: 'Semua Status' },
                { value: 'active', label: 'Aktif' },
                { value: 'inactive', label: 'Nonaktif' },
              ]}
              value={activeFilter}
              onValueChange={(val) => setActiveFilter(val as any)}
              placeholder="Status"
              className="h-9 w-32 rounded-none text-xs focus:ring-inset shrink-0"
              square
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

            {hasPermission('users.create') ? (
              <Button
                className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
                onClick={() => navigate('/users/create')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Tambah Pengguna
              </Button>
            ) : null}
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={filteredUsers}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Tidak ada pengguna yang sesuai."
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete User"
        description="Are you sure you want to delete this user? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  );
}
