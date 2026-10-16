"use client"

import * as React from "react"
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchPlaceholder?: string
  showColumnVisibility?: boolean
  showPagination?: boolean
  showSearch?: boolean
  pageSize?: number
  toolbarActions?: React.ReactNode
  className?: string
  fixedLayout?: boolean
  emptyMessage?: React.ReactNode
  showSelectionSummary?: boolean
  borderless?: boolean
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search...",
  showColumnVisibility = true,
  showPagination = true,
  showSearch = true,
  pageSize = 10,
  toolbarActions,
  className,
  fixedLayout = false,
  emptyMessage = "No results.",
  showSelectionSummary = true,
  borderless = true,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const [globalFilter, setGlobalFilter] = React.useState("")

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: Math.min(pageSize, 10),
      },
    },
  })

  const hasToolbar = showSearch || showColumnVisibility || Boolean(toolbarActions)

  return (
    <div className={cn("flex h-auto min-h-0 w-full flex-col overflow-visible sm:h-full sm:overflow-hidden", className)}>
      {hasToolbar && (
        <div className="flex flex-col gap-3 pt-1 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {showSearch && (
              <Input
                placeholder={searchPlaceholder}
                value={globalFilter ?? ""}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="w-full max-w-sm"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {/* {showColumnVisibility && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Columns <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column: any) => column.getCanHide())
                    .map((column: any) => {
                      return (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize"
                          checked={column.getIsVisible()}
                          onCheckedChange={(value) =>
                            column.toggleVisibility(!!value)
                          }
                        >
                          {column.id}
                        </DropdownMenuCheckboxItem>
                      )
                    })}
                </DropdownMenuContent>
              </DropdownMenu>
            )} */}
            {toolbarActions}
          </div>
        </div>
      )}

      <div className={cn("flex min-h-0 flex-col overflow-visible sm:flex-1 sm:overflow-hidden", borderless ? "border-0 rounded-none" : "rounded-md border")}>
        {/* Table */}
        <div className="overflow-x-auto overflow-y-visible overscroll-contain sm:min-h-0 sm:flex-1 sm:overflow-auto">
          <Table className={cn(fixedLayout ? "table-fixed" : undefined)}>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup: any) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header: any) => {
                    const headerMeta = header.column.columnDef.meta as { headerClassName?: string } | undefined
                    const headerSize = header.getSize?.()
                    return (
                      <TableHead
                        key={header.id}
                        className={headerMeta?.headerClassName}
                        style={fixedLayout && Number.isFinite(headerSize) ? { width: `${headerSize}px`, minWidth: `${headerSize}px` } : undefined}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row: any) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell: any) => {
                      const cellMeta = cell.column.columnDef.meta as { cellClassName?: string } | undefined
                      const cellSize = cell.column.getSize?.()
                      return (
                      <TableCell
                        key={cell.id}
                        className={cellMeta?.cellClassName}
                        style={fixedLayout && Number.isFinite(cellSize) ? { width: `${cellSize}px`, minWidth: `${cellSize}px` } : undefined}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    )})}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {showPagination && (
          <div className="shrink-0 border-t bg-muted/10 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:space-x-2">
            <div className="flex-1 text-xs text-muted-foreground sm:text-sm">
              {showSelectionSummary
                ? <>{table.getFilteredSelectedRowModel().rows.length} of{" "}{table.getFilteredRowModel().rows.length} row(s) selected.</>
                : <>{table.getFilteredRowModel().rows.length} row(s)</>}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 lg:justify-end lg:space-x-6">
              <div className="flex items-center justify-between gap-2 sm:justify-start sm:space-x-2">
                <p className="text-xs font-medium sm:text-sm">Rows per page</p>
                <Select
                  value={`${Math.min(table.getState().pagination.pageSize, 10)}`}
                  onValueChange={(value) => {
                    table.setPageSize(Math.min(Number(value), 10))
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={table.getState().pagination.pageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[10].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-center text-xs font-medium sm:min-w-[100px] sm:text-sm">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  className="hidden h-8 w-8 p-0 lg:flex"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                >
                  <span className="sr-only">Go to first page</span>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <span className="sr-only">Go to previous page</span>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <span className="sr-only">Go to next page</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="hidden h-8 w-8 p-0 lg:flex"
                  onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                  disabled={!table.getCanNextPage()}
                >
                  <span className="sr-only">Go to last page</span>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper function to create a select column
export function createSelectColumn<T>(): ColumnDef<T> {
  return {
    id: "select",
    header: ({ table }: any) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }: any) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  }
}