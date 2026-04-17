import type { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Eye, Edit, Trash2, ArrowUpDown } from "lucide-react"
import { createSelectColumn } from "@/components/ui/data-table"
import type { Employee, User } from "@/lib/api"

interface UserColumnsProps {
  onView: (id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  hasViewPermission: boolean
  hasEditPermission: boolean
  hasDeletePermission: boolean
  getLinkedEmployee?: (userId: number) => Employee | undefined
}

export function createUserColumns({
  onView,
  onEdit,
  onDelete,
  hasViewPermission,
  hasEditPermission,
  hasDeletePermission,
  getLinkedEmployee,
}: UserColumnsProps): ColumnDef<User>[] {
  return [
    createSelectColumn<User>(),
    {
      accessorKey: "full_name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 p-0 hover:bg-transparent"
          >
            User
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {user.full_name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium">{user.full_name}</span>
              <span className="text-sm text-muted-foreground">@{user.username}</span>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "email",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 p-0 hover:bg-transparent"
          >
            Email
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        return <div className="text-muted-foreground">{row.getValue("email")}</div>
      },
    },
    {
      accessorKey: "role.name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 p-0 hover:bg-transparent"
          >
            Role
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const user = row.original
        return (
          <Badge variant="outline" className="font-normal">
            {user.role?.name || 'N/A'}
          </Badge>
        )
      },
    },
    {
      id: "employee",
      header: "Pegawai",
      cell: ({ row }) => {
        const user = row.original
        const employee = getLinkedEmployee?.(user.id)

        return employee ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{employee.employee_code || employee.full_name}</span>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted-foreground">{employee.profession || 'pegawai'}</span>
              <Badge variant={employee.requires_satusehat ? "default" : "secondary"} className="rounded-none text-[10px]">
                {employee.requires_satusehat ? 'SATUSEHAT' : 'Internal'}
              </Badge>
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Belum ditautkan</span>
        )
      },
    },
    {
      accessorKey: "is_active",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 p-0 hover:bg-transparent"
          >
            Status
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const isActive = row.getValue("is_active") as boolean
        return (
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? 'Active' : 'Inactive'}
          </Badge>
        )
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const user = row.original
        
        return (
          <div className="flex items-center justify-end gap-2">
            {hasViewPermission && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onView(user.id)}
              >
                <Eye className="h-4 w-4" />
                <span className="sr-only">View user</span>
              </Button>
            )}
            {hasEditPermission && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(user.id)}
              >
                <Edit className="h-4 w-4" />
                <span className="sr-only">Edit user</span>
              </Button>
            )}
            {hasDeletePermission && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onDelete(user.id)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete user</span>
              </Button>
            )}
          </div>
        )
      },
    },
  ]
}