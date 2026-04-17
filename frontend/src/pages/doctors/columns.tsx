import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, Edit, Trash2, ArrowUpDown, RefreshCw, Search } from "lucide-react"
import { createSelectColumn } from "@/components/ui/data-table"
import type { Doctor } from "@/lib/api"

interface DoctorColumnsProps {
  onView: (id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  onPreviewSatusehat: (doctor: Doctor) => void
  onSyncSatusehat: (doctor: Doctor) => void
  hasViewPermission: boolean
  hasEditPermission: boolean
  hasDeletePermission: boolean
  hasPreviewSatusehatPermission: boolean
  hasSyncSatusehatPermission: boolean
  previewingDoctorId: number | null
  syncingDoctorId: number | null
}

function normalizeNIK(value?: string) {
  return (value || '').replace(/\D/g, '')
}

function getPractitionerReadiness(doctor: Doctor) {
  const requiresSatusehat = doctor.employee ? doctor.employee.requires_satusehat : true
  if (!requiresSatusehat) {
    return {
      label: 'Opsional',
      detail: 'Mengikuti flag SATUSEHAT dari master pegawai.',
      readyCount: 0,
      totalCount: 0,
      variant: 'secondary' as const,
    }
  }

  const checks = [
    Boolean(doctor.full_name?.trim()),
    normalizeNIK(doctor.nik_number).length === 16,
    Boolean(doctor.specialization?.trim()),
  ]
  const readyCount = checks.filter(Boolean).length

  if (doctor.satusehat_practitioner_id?.trim()) {
    return {
      label: 'Tersinkron',
      detail: doctor.satusehat_practitioner_id,
      readyCount,
      totalCount: checks.length,
      variant: 'default' as const,
    }
  }

  if (readyCount === checks.length) {
    return {
      label: 'Siap lookup',
      detail: 'Data inti dokter siap untuk pencarian Practitioner.',
      readyCount,
      totalCount: checks.length,
      variant: 'outline' as const,
    }
  }

  return {
    label: 'Data kurang',
    detail: 'Lengkapi nama, NIK 16 digit, dan spesialisasi.',
    readyCount,
    totalCount: checks.length,
    variant: 'secondary' as const,
  }
}

export function createDoctorColumns({
  onView, onEdit, onDelete, onPreviewSatusehat, onSyncSatusehat,
  hasViewPermission, hasEditPermission, hasDeletePermission,
  hasPreviewSatusehatPermission, hasSyncSatusehatPermission,
  previewingDoctorId, syncingDoctorId,
}: DoctorColumnsProps): ColumnDef<Doctor>[] {
  return [
    createSelectColumn<Doctor>(),
    {
      accessorKey: "full_name",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          Nama Dokter
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const doc = row.original
        return (
          <div className="flex flex-col">
            <span className="font-medium">{doc.full_name}</span>
            <span className="text-sm text-muted-foreground">{doc.specialization || '-'}</span>
          </div>
        )
      },
    },
    {
      accessorKey: "nip_number",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          NIP
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span>{row.getValue("nip_number") || '-'}</span>,
    },
    {
      accessorKey: "sip_number",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          No. SIP
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: "phone",
      header: "Telepon",
      cell: ({ row }) => <span>{row.getValue("phone") || '-'}</span>,
    },
    {
      id: 'employee',
      header: 'Pegawai/Akun',
      cell: ({ row }) => {
        const employee = row.original.employee
        return (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{employee?.employee_code || employee?.full_name || '-'}</span>
            <span className="text-xs text-muted-foreground">{employee?.user?.email || row.original.user?.email || 'Belum tertaut akun'}</span>
          </div>
        )
      },
    },
    {
      id: "polyclinics",
      header: "Poliklinik",
      cell: ({ row }) => {
        const polyclinics = row.original.polyclinics
        if (!polyclinics || polyclinics.length === 0) return <span className="text-muted-foreground">-</span>
        return (
          <div className="flex flex-wrap gap-1">
            {polyclinics.map(p => (
              <Badge key={p.id} variant="outline" className="text-[11px]">{p.name}</Badge>
            ))}
          </div>
        )
      },
    },
    {
      id: "satusehat",
      header: "SATUSEHAT",
      cell: ({ row }) => {
        const doctor = row.original
        const requiresSatusehat = doctor.employee ? doctor.employee.requires_satusehat : true
        const readiness = getPractitionerReadiness(doctor)
        const isPreviewing = previewingDoctorId === doctor.id
        const isSyncing = syncingDoctorId === doctor.id

        return (
          <div className="flex min-w-[240px] flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={readiness.variant} className="w-fit rounded-none">
                {readiness.label}
              </Badge>
              {requiresSatusehat ? (
                <Badge variant="outline" className="rounded-none">
                  {readiness.readyCount}/{readiness.totalCount} siap
                </Badge>
              ) : null}
            </div>
            <span className="text-xs leading-5 text-muted-foreground">
              {readiness.detail}
            </span>
            {requiresSatusehat ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {hasPreviewSatusehatPermission ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-none px-2 text-[11px] shadow-none"
                    onClick={() => onPreviewSatusehat(doctor)}
                    disabled={isPreviewing || isSyncing}
                  >
                    {isPreviewing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Preview
                  </Button>
                ) : null}
                {hasSyncSatusehatPermission ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-none px-2 text-[11px] shadow-none"
                    onClick={() => onSyncSatusehat(doctor)}
                    disabled={isSyncing || isPreviewing}
                  >
                    <RefreshCw className={isSyncing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                    {doctor.satusehat_practitioner_id ? 'Sync ulang' : 'Sync'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => {
        const isActive = row.getValue("is_active") as boolean
        return <Badge variant={isActive ? "default" : "secondary"}>{isActive ? 'Aktif' : 'Nonaktif'}</Badge>
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const doc = row.original
        return (
          <div className="flex items-center justify-end gap-2">
            {hasViewPermission && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(doc.id)}><Eye className="h-4 w-4" /><span className="sr-only">View</span></Button>
            )}
            {hasEditPermission && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(doc.id)}><Edit className="h-4 w-4" /><span className="sr-only">Edit</span></Button>
            )}
            {hasDeletePermission && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(doc.id)}><Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span></Button>
            )}
          </div>
        )
      },
    },
  ]
}
