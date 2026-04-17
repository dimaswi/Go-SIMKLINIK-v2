import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createUserColumns } from './columns';
import { employeesApi, type Employee, type UserListSummary, usersApi, type User } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus } from 'lucide-react';
import { MasterDataListShell } from '@/pages/master-data/shared';

export default function UsersPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [summary, setSummary] = useState<UserListSummary | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState<'all' | 'linked-required' | 'linked-not-required' | 'unlinked'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

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

      const [summaryRes, filteredUsersRes, employeesRes] = await Promise.all([
        usersApi.getSummary(),
        usersApi.getAll(params.toString()),
        employeesApi.getAll(),
      ]);

      setSummary(summaryRes.data.data);
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

  const linkedEmployeeCount = summary?.linked_employee_count ?? 0;
  const linkedSatusehatCount = summary?.linked_satusehat_count ?? 0;
  const unlinkedUserCount = summary?.unlinked_user_count ?? 0;
  const activeCount = summary?.active_count ?? 0;
  const inactiveCount = summary?.inactive_count ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <MasterDataListShell
        title="Daftar User"
        subtitle="Kelola akun pengguna, role, dan status aktif dari satu tabel kerja."
        totalCount={users.length}
        badges={
          <>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {linkedEmployeeCount} tertaut pegawai
            </Badge>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {linkedSatusehatCount} pegawai SATUSEHAT
            </Badge>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {unlinkedUserCount} belum tertaut
            </Badge>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {activeCount} aktif
            </Badge>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {inactiveCount} nonaktif
            </Badge>
          </>
        }
      >
        <DataTable
          className="h-full"
          columns={columns}
          data={users}
          searchPlaceholder="Search users by name, username, or email..."
          pageSize={10}
          toolbarActions={
            <>
              <Select value={employeeFilter} onValueChange={(value: 'all' | 'linked-required' | 'linked-not-required' | 'unlinked') => setEmployeeFilter(value)}>
                <SelectTrigger className="w-[240px] rounded-none">
                  <SelectValue placeholder="Filter tautan pegawai" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua user</SelectItem>
                  <SelectItem value="linked-required">Pegawai perlu SATUSEHAT</SelectItem>
                  <SelectItem value="linked-not-required">Pegawai tidak perlu SATUSEHAT</SelectItem>
                  <SelectItem value="unlinked">Belum tertaut pegawai</SelectItem>
                </SelectContent>
              </Select>
              <Select value={activeFilter} onValueChange={(value: 'all' | 'active' | 'inactive') => setActiveFilter(value)}>
                <SelectTrigger className="w-[180px] rounded-none">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
              {hasPermission('users.create') ? (
                <Button onClick={() => navigate('/users/create')} className="rounded-none shadow-none">
                  <Plus className="h-4 w-4" />
                  Add User
                </Button>
              ) : null}
            </>
          }
        />
      </MasterDataListShell>

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
