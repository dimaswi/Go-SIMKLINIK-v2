import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, Edit, Trash2, ArrowUpDown } from "lucide-react"
import { createSelectColumn } from "@/components/ui/data-table"
import type { MedicalService } from "@/lib/api"

interface Props { onView: (id: number) => void; onEdit: (id: number) => void; onDelete: (id: number) => void; hasViewPermission: boolean; hasEditPermission: boolean; hasDeletePermission: boolean }

const SERVICE_DOMAIN_LABELS: Record<string, string> = {
  general: 'Umum',
  dental: 'Dental',
  laboratory: 'Laboratorium',
  radiology: 'Radiologi',
}

const TARGET_SCOPE_LABELS: Record<string, string> = {
  none: 'Tanpa target',
  full_mouth: 'Full mouth',
  arch: 'Rahang',
  quadrant: 'Kuadran',
  tooth: 'Gigi',
  surface: 'Permukaan',
}

export function createMedicalServiceColumns({ onView, onEdit, onDelete, hasViewPermission, hasEditPermission, hasDeletePermission }: Props): ColumnDef<MedicalService>[] {
  return [
    createSelectColumn<MedicalService>(),
    {
      accessorKey: "name",
      header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">Nama Layanan<ArrowUpDown className="ml-2 h-4 w-4" /></Button>,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-sm text-muted-foreground">{row.original.code || '-'}</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="rounded-none px-1.5 py-0 text-[10px] uppercase tracking-wide">{SERVICE_DOMAIN_LABELS[row.original.service_domain || 'general'] || row.original.service_domain || 'Umum'}</Badge>
            <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[10px] uppercase tracking-wide">{TARGET_SCOPE_LABELS[row.original.target_scope || 'none'] || row.original.target_scope || 'Tanpa target'}</Badge>
            {row.original.requires_consent && <Badge className="rounded-none border-0 bg-amber-600 px-1.5 py-0 text-[10px] uppercase tracking-wide text-white">Consent</Badge>}
          </div>
        </div>
      ),
    },
    { id: "category", header: "Kategori", cell: ({ row }) => <span>{row.original.category?.name || '-'}</span> },
    { id: "polyclinic", header: "Poliklinik", cell: ({ row }) => <span>{row.original.polyclinic?.name || 'Semua'}</span> },
    {
      accessorKey: "price",
      header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">Tarif<ArrowUpDown className="ml-2 h-4 w-4" /></Button>,
      cell: ({ row }) => <span>Rp {(row.getValue("price") as number).toLocaleString('id-ID')}</span>,
    },
    {
      accessorKey: "is_active", header: "Status",
      cell: ({ row }) => <Badge variant={row.getValue("is_active") ? "default" : "secondary"}>{row.getValue("is_active") ? 'Aktif' : 'Nonaktif'}</Badge>,
    },
    {
      id: "actions", header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          {hasViewPermission && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(row.original.id)}><Eye className="h-4 w-4" /></Button>}
          {hasEditPermission && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row.original.id)}><Edit className="h-4 w-4" /></Button>}
          {hasDeletePermission && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(row.original.id)}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ]
}
