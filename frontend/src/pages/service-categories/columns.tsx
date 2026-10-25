import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Eye, Edit, Trash2, ArrowUpDown } from "lucide-react"
import type { ServiceCategory } from "@/lib/api"

interface Props { onView: (id: number) => void; onEdit: (id: number) => void; onDelete: (id: number) => void; hasViewPermission: boolean; hasEditPermission: boolean; hasDeletePermission: boolean }

export function createServiceCategoryColumns({ onView, onEdit, onDelete, hasViewPermission, hasEditPermission, hasDeletePermission }: Props): ColumnDef<ServiceCategory>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">Nama Kategori<ArrowUpDown className="ml-2 h-4 w-4" /></Button>,
      cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
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
