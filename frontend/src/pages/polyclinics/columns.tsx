import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, Edit, Trash2, ArrowUpDown } from "lucide-react"
import { createSelectColumn } from "@/components/ui/data-table"
import type { Polyclinic } from "@/lib/api"

const currencyFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 })

interface PolyclinicColumnsProps {
  onView: (id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  hasViewPermission: boolean
  hasEditPermission: boolean
  hasDeletePermission: boolean
}

export function createPolyclinicColumns({
  onView,
  onEdit,
  onDelete,
  hasViewPermission,
  hasEditPermission,
  hasDeletePermission,
}: PolyclinicColumnsProps): ColumnDef<Polyclinic>[] {
  return [
    createSelectColumn<Polyclinic>(),
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          Nama Poliklinik
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const poly = row.original
        return (
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: poly.color || '#6B7280' }}>
              {poly.code?.substring(0, 2) || 'P'}
            </div>
            <div className="flex flex-col">
              <span className="font-medium">{poly.name}</span>
              <span className="text-sm text-muted-foreground">{poly.code}</span>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          Deskripsi
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-muted-foreground">{row.getValue("description") || '-'}</div>,
    },
    {
      accessorKey: "admin_fee",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          Admin
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-sm font-medium">{currencyFormatter.format(Number(row.getValue("admin_fee") || 0))}</div>,
    },
    {
      accessorKey: "sort_order",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          Urutan
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-center">{row.getValue("sort_order")}</div>,
    },
    {
      accessorKey: "is_active",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="h-8 p-0 hover:bg-transparent">
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const isActive = row.getValue("is_active") as boolean
        return <Badge variant={isActive ? "default" : "secondary"}>{isActive ? 'Aktif' : 'Nonaktif'}</Badge>
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const poly = row.original
        return (
          <div className="flex items-center justify-end gap-2">
            {hasViewPermission && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(poly.id)}>
                <Eye className="h-4 w-4" /><span className="sr-only">View</span>
              </Button>
            )}
            {hasEditPermission && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(poly.id)}>
                <Edit className="h-4 w-4" /><span className="sr-only">Edit</span>
              </Button>
            )}
            {hasDeletePermission && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(poly.id)}>
                <Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span>
              </Button>
            )}
          </div>
        )
      },
    },
  ]
}
