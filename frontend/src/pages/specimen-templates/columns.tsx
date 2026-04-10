import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Eye, Edit, Trash2, ArrowUpDown } from "lucide-react"
import { createSelectColumn } from "@/components/ui/data-table"
import type { SpecimenTemplate } from "@/lib/api"

interface Props {
  onView: (id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  hasViewPermission: boolean
  hasEditPermission: boolean
  hasDeletePermission: boolean
}

export function createSpecimenTemplateColumns({ onView, onEdit, onDelete, hasViewPermission, hasEditPermission, hasDeletePermission }: Props): ColumnDef<SpecimenTemplate>[] {
  return [
    createSelectColumn<SpecimenTemplate>(),
    {
      accessorKey: "code",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          Kode<ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-mono text-xs">{row.getValue("code")}</span>,
    },
    {
      accessorKey: "name",
      header: "Nama Template",
      cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "type_display",
      header: "SNOMED Type",
    },
    {
      accessorKey: "collection_method_display",
      header: "Method",
      cell: ({ row }) => row.getValue("collection_method_display") || '-',
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => row.getValue("is_active") ? 'Aktif' : 'Tidak aktif',
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex items-center justify-end gap-2">
            {hasViewPermission && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(item.id)}><Eye className="h-4 w-4" /></Button>}
            {hasEditPermission && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(item.id)}><Edit className="h-4 w-4" /></Button>}
            {hasDeletePermission && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        )
      },
    },
  ]
}