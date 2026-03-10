import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Edit, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PurchaseOrder } from '@/lib/api';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  ordered: { label: 'Dipesan', variant: 'default' },
  partial: { label: 'Diterima Sebagian', variant: 'outline' },
  received: { label: 'Diterima', variant: 'default' },
};

export function createColumns(onDelete: (id: number) => void): ColumnDef<PurchaseOrder>[] {
  return [
    {
      accessorKey: 'po_number',
      header: 'No. PO',
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.po_number}</span>
      ),
    },
    {
      accessorKey: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.supplier?.name || '-'}</p>
          {row.original.supplier?.phone && (
            <p className="text-xs text-muted-foreground">{row.original.supplier.phone}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'order_date',
      header: 'Tgl. Pesan',
      cell: ({ row }) => (
        <span className="text-sm">
          {new Date(row.original.order_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = STATUS_MAP[row.original.status] || { label: row.original.status, variant: 'secondary' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => (
        <span className="text-sm font-medium">
          Rp {row.original.total_amount.toLocaleString('id-ID')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Aksi',
      cell: ({ row }) => {
        const po = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link to={`/purchasing/${po.id}`}><Eye className="h-4 w-4" /></Link>
            </Button>
            {po.status === 'draft' && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <Link to={`/purchasing/${po.id}/edit`}><Edit className="h-4 w-4" /></Link>
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(po.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];
}
