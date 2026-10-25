import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { resolveAssetUrl, type PhysicalExamImageMaster } from '@/lib/api';

type Props = {
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  hasEditPermission: boolean;
  hasDeletePermission: boolean;
};

export function createPhysicalExamImageColumns({
  onEdit,
  onDelete,
  hasEditPermission,
  hasDeletePermission,
}: Props): ColumnDef<PhysicalExamImageMaster>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 p-0 hover:bg-transparent"
        >
          Template
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-md border bg-muted/20">
            <img
              src={resolveAssetUrl(row.original.image_url)}
              alt={row.original.name}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.name}</span>
            <span className="truncate text-sm text-muted-foreground">{row.original.description || row.original.location || '-'}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Kategori',
      cell: ({ row }) => <span>{row.original.category || '-'}</span>,
    },
    {
      accessorKey: 'location',
      header: 'Lokasi',
      cell: ({ row }) => <span>{row.original.location || '-'}</span>,
    },
    {
      accessorKey: 'sort_order',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 p-0 hover:bg-transparent"
        >
          Urutan
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span>{row.original.sort_order}</span>,
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
          {row.original.is_active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          {hasEditPermission && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row.original.id)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {hasDeletePermission && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(row.original.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];
}