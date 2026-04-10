import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, Edit, Trash2, ArrowUpDown } from "lucide-react"
import { createSelectColumn } from "@/components/ui/data-table"
import type { Doctor } from "@/lib/api"

interface DoctorColumnsProps {
  onView: (id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  hasViewPermission: boolean
  hasEditPermission: boolean
  hasDeletePermission: boolean
}

export function createDoctorColumns({
  onView, onEdit, onDelete,
  hasViewPermission, hasEditPermission, hasDeletePermission,
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
        const practitionerId = row.original.satusehat_practitioner_id
        const syncedAt = row.original.satusehat_synced_at

        return (
          <div className="flex flex-col gap-1">
            <Badge variant={practitionerId ? "default" : "outline"} className="w-fit rounded-none">
              {practitionerId ? 'Practitioner Sync' : 'Belum Sync'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {practitionerId ? (syncedAt ? `Sync ${new Date(syncedAt).toLocaleDateString('id-ID')}` : 'ID SATUSEHAT tersedia') : 'Buka detail dokter untuk preview dan sync'}
            </span>
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
