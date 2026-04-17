import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Edit, Eye, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createSelectColumn } from '@/components/ui/data-table';
import type { Employee } from '@/lib/api';
import { getEmployeeProfessionLabel } from './options';

interface EmployeeColumnsProps {
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onPreviewSatusehat: (employee: Employee) => void;
  onSyncSatusehat: (employee: Employee) => void;
  hasViewPermission: boolean;
  hasEditPermission: boolean;
  hasDeletePermission: boolean;
  hasPreviewSatusehatPermission: boolean;
  hasSyncSatusehatPermission: boolean;
  previewingEmployeeId: number | null;
  syncingEmployeeId: number | null;
}

function normalizeNIK(value?: string) {
  return (value || '').replace(/\D/g, '');
}

function getPractitionerReadiness(employee: Employee) {
  if (!employee.requires_satusehat) {
    return {
      label: 'Opsional',
      detail: 'Pegawai ini tidak diwajibkan masuk alur SATUSEHAT.',
      readyCount: 0,
      totalCount: 0,
      variant: 'secondary' as const,
    };
  }

  const checks = [
    Boolean(employee.full_name?.trim()),
    normalizeNIK(employee.nik_number).length === 16,
    Boolean(employee.profession?.trim()),
  ];
  const readyCount = checks.filter(Boolean).length;

  if (employee.satusehat_practitioner_id?.trim()) {
    return {
      label: 'Tersinkron',
      detail: employee.satusehat_practitioner_id,
      readyCount,
      totalCount: checks.length,
      variant: 'default' as const,
    };
  }

  if (readyCount === checks.length) {
    return {
      label: 'Siap lookup',
      detail: 'Data inti lengkap untuk pencarian Practitioner.',
      readyCount,
      totalCount: checks.length,
      variant: 'outline' as const,
    };
  }

  return {
    label: 'Data kurang',
    detail: 'Lengkapi nama, NIK 16 digit, dan profesi.',
    readyCount,
    totalCount: checks.length,
    variant: 'secondary' as const,
  };
}

export function createEmployeeColumns({
  onView,
  onEdit,
  onDelete,
  onPreviewSatusehat,
  onSyncSatusehat,
  hasViewPermission,
  hasEditPermission,
  hasDeletePermission,
  hasPreviewSatusehatPermission,
  hasSyncSatusehatPermission,
  previewingEmployeeId,
  syncingEmployeeId,
}: EmployeeColumnsProps): ColumnDef<Employee>[] {
  return [
    createSelectColumn<Employee>(),
    {
      accessorKey: 'full_name',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="h-8 p-0 hover:bg-transparent">
          Nama Pegawai
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.full_name}</span>
          <span className="text-sm text-muted-foreground">{row.original.employee_code || '-'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'profession',
      header: 'Profesi',
      cell: ({ row }) => <Badge variant="outline" className="rounded-none">{getEmployeeProfessionLabel(row.original.profession)}</Badge>,
    },
    {
      accessorKey: 'nip_number',
      header: 'NIP',
      cell: ({ row }) => <span>{row.original.nip_number || '-'}</span>,
    },
    {
      accessorKey: 'requires_satusehat',
      header: 'SATUSEHAT',
      cell: ({ row }) => {
        const employee = row.original;
        const readiness = getPractitionerReadiness(employee);

        return (
          <div className="flex min-w-[220px] flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={readiness.variant} className="rounded-none">
                {readiness.label}
              </Badge>
              {employee.requires_satusehat ? (
                <Badge variant="outline" className="rounded-none">
                  {readiness.readyCount}/{readiness.totalCount} siap
                </Badge>
              ) : null}
            </div>

            <span className="text-xs leading-5 text-muted-foreground">
              {readiness.detail}
            </span>
          </div>
        );
      },
    },
    {
      id: 'account',
      header: 'Akun',
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <Badge variant={row.original.user ? 'default' : 'secondary'} className="w-fit rounded-none">
            {row.original.user ? 'Tertaut' : 'Belum tertaut'}
          </Badge>
          <span className="text-xs text-muted-foreground">{row.original.user?.email || 'Belum ada akun'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => <Badge variant={row.original.is_active ? 'default' : 'secondary'}>{row.original.is_active ? 'Aktif' : 'Nonaktif'}</Badge>,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const employee = row.original;
        const isPreviewing = previewingEmployeeId === employee.id;
        const isSyncing = syncingEmployeeId === employee.id;

        return (
        <div className="flex items-center justify-end gap-2">
          {employee.requires_satusehat && hasPreviewSatusehatPermission ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPreviewSatusehat(employee)}
              disabled={isPreviewing || isSyncing}
              title="Preview SATUSEHAT"
            >
              {isPreviewing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="sr-only">Preview SATUSEHAT</span>
            </Button>
          ) : null}
          {employee.requires_satusehat && hasSyncSatusehatPermission ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onSyncSatusehat(employee)}
              disabled={isSyncing || isPreviewing}
              title={employee.satusehat_practitioner_id ? 'Sync ulang SATUSEHAT' : 'Sync ke SATUSEHAT'}
            >
              <RefreshCw className={isSyncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              <span className="sr-only">{employee.satusehat_practitioner_id ? 'Sync ulang SATUSEHAT' : 'Sync ke SATUSEHAT'}</span>
            </Button>
          ) : null}
          {hasViewPermission ? <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(employee.id)}><Eye className="h-4 w-4" /><span className="sr-only">View</span></Button> : null}
          {hasEditPermission ? <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(employee.id)}><Edit className="h-4 w-4" /><span className="sr-only">Edit</span></Button> : null}
          {hasDeletePermission ? <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(employee.id)}><Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span></Button> : null}
        </div>
        );
      },
    },
  ];
}