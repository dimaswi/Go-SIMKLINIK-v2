import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Edit, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PurchaseOrder } from '@/lib/api';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  ordered: { label: 'Dipesan', variant: 'default' },
  partial: { label: 'Diterima Sebagian', variant: 'outline' },
  received: { label: 'Diterima', variant: 'default', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
};

function formatOrderDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface CreatePurchaseOrderColumnsOptions {
  onDelete: (id: number) => void;
  hasViewPermission: boolean;
  hasEditPermission: boolean;
  hasDeletePermission: boolean;
}

export function createColumns({
  onDelete,
  hasViewPermission,
  hasEditPermission,
  hasDeletePermission,
}: CreatePurchaseOrderColumnsOptions): ColumnDef<PurchaseOrder>[] {
  return [
    {
      accessorKey: 'po_number',
      header: 'No. PO',
      size: 170,
      minSize: 150,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.po_number}</span>
      ),
    },
    {
      accessorKey: 'supplier',
      header: 'Supplier',
      size: 250,
      minSize: 210,
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.supplier?.name || '-'}</p>
          <p className="text-xs text-muted-foreground">
            Tujuan: {row.original.destination_room?.name || 'Depo Farmasi'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'order_date',
      header: 'Tgl. Pesan',
      size: 140,
      minSize: 120,
      cell: ({ row }) => (
        <span className="text-sm">{formatOrderDate(row.original.order_date)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 160,
      minSize: 130,
      cell: ({ row }) => {
        const s = STATUS_MAP[row.original.status] || { label: row.original.status, variant: 'secondary' as const };
        return <Badge variant={s.variant} className={s.className ? `rounded-none shadow-none ${s.className}` : 'rounded-none shadow-none'}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: 'payment_status',
      header: 'Pembayaran',
      size: 140,
      minSize: 120,
      cell: ({ row }) => {
        const ps = row.original.payment_status || 'unpaid';
        if (ps === 'paid') {
          return <Badge className="rounded-none shadow-none bg-emerald-600 text-white hover:bg-emerald-600">Lunas</Badge>;
        }
        if (ps === 'partial') {
          return <Badge variant="outline" className="rounded-none shadow-none border-amber-500 text-amber-600">Sebagian</Badge>;
        }
        return <Badge variant="secondary" className="rounded-none shadow-none">Belum Lunas</Badge>;
      },
    },
    {
      accessorKey: 'total_amount',
      header: () => <div className="text-right">Total</div>,
      size: 150,
      minSize: 130,
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right',
      },
      cell: ({ row }) => (
        <span className="text-sm font-medium">
          Rp {row.original.total_amount.toLocaleString('id-ID')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Aksi</div>,
      size: 120,
      minSize: 110,
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right',
      },
      cell: ({ row }) => {
        const po = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {hasViewPermission && (
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" asChild>
                <Link to={`/purchasing/${po.id}`}><Eye className="h-4 w-4" /></Link>
              </Button>
            )}
            {po.status === 'draft' && (
              <>
                {hasEditPermission && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" asChild>
                    <Link to={`/purchasing/${po.id}/edit`}><Edit className="h-4 w-4" /></Link>
                  </Button>
                )}
                {hasDeletePermission && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-destructive hover:text-destructive" onClick={() => onDelete(po.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        );
      },
    },
  ];
}
