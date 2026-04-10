import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, Edit, Trash2, ArrowUpDown } from "lucide-react"
import { createSelectColumn } from "@/components/ui/data-table"
import type { Medicine } from "@/lib/api"

interface Props {
  onView: (id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  hasViewPermission: boolean
  hasEditPermission: boolean
  hasDeletePermission: boolean
}

export function createMedicineColumns({ onView, onEdit, onDelete, hasViewPermission, hasEditPermission, hasDeletePermission }: Props): ColumnDef<Medicine>[] {
  return [
    createSelectColumn<Medicine>(),
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          Nama Obat<ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const med = row.original
        return (
          <div className="flex flex-col">
            <span className="font-medium">{med.name}</span>
            <span className="text-sm text-muted-foreground">{med.code} {med.generic_name ? `· ${med.generic_name}` : ''}</span>
            <span className="text-xs text-muted-foreground">KFA: {med.kfa_code || '-'}</span>
          </div>
        )
      },
    },
    {
      id: "category",
      header: "Kategori",
      cell: ({ row }) => <span>{row.original.category?.name || '-'}</span>,
    },
    {
      accessorKey: "type",
      header: "Tipe",
      cell: ({ row }) => {
        const type = row.getValue("type") as string
        if (!type) return '-'
        const colors: Record<string, string> = { generic: 'bg-blue-500', patent: 'bg-purple-500', herbal: 'bg-green-500', otc: 'bg-orange-500' }
        return <Badge className={`h-6 rounded-md border-0 px-2 text-[11px] font-semibold text-white ${colors[type] || 'bg-gray-500'}`}>{type.toUpperCase()}</Badge>
      },
    },
    {
      accessorKey: "current_stock",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          Stok<ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const stock = row.original.current_stock
        const min = row.original.min_stock
        return <span className={stock <= min ? 'text-destructive font-medium' : ''}>{stock} {row.original.unit?.name || ''}</span>
      },
    },
    {
      accessorKey: "selling_price",
      header: "Harga Jual",
      cell: ({ row }) => <span>Rp {(row.getValue("selling_price") as number).toLocaleString('id-ID')}</span>,
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => <Badge variant={row.getValue("is_active") ? "default" : "secondary"}>{row.getValue("is_active") ? 'Aktif' : 'Nonaktif'}</Badge>,
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
