import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MedicalRecord } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getPrescriptionWorkflowLabel } from '@/pages/emr/constants';
import { buildOrderLines, formatCurrency, formatDateTime, getRecordStockSummary, WORKFLOW_BADGE_CLASSNAME } from '../utils';
import { Loader2, PillBottle } from 'lucide-react';

type CreateColumnsOptions = {
  canProcess: boolean;
  processingRecordId: number | null;
  onOpenDetail: (record: MedicalRecord) => void;
  onReceive: (record: MedicalRecord) => void;
};

export function createColumns({ canProcess, processingRecordId, onOpenDetail, onReceive }: CreateColumnsOptions): ColumnDef<MedicalRecord>[] {
  return [
    {
      id: 'ordered_at',
      header: 'Waktu Order',
      cell: ({ row }) => (
        <div className="space-y-1">
          <p className="font-medium text-foreground/95">{formatDateTime(row.original.prescription_ordered_at || row.original.record_date)}</p>
          <p className="text-xs text-muted-foreground">{row.original.visit?.visit_number || '-'}</p>
        </div>
      ),
    },
    {
      id: 'patient',
      header: 'Pasien',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.patient?.full_name || '-'}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.original.patient?.medical_record_number || '-'}</p>
        </div>
      ),
    },
    {
      id: 'doctor',
      header: 'Dokter / Poli',
      cell: ({ row }) => (
        <div>
          <p className="text-sm">{row.original.doctor?.full_name || '-'}</p>
          <p className="text-xs text-muted-foreground">{row.original.polyclinic?.name || '-'}</p>
        </div>
      ),
    },
    {
      id: 'summary',
      header: 'Ringkasan Resep',
      cell: ({ row }) => {
        const orderLines = buildOrderLines(row.original);
        return (
          <div>
            <p className="text-sm font-medium">{orderLines.length} item</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(orderLines.reduce((total, item) => total + item.price, 0))}</p>
          </div>
        );
      },
    },
    {
      id: 'stock',
      header: 'Cek Stok',
      cell: ({ row }) => {
        const stockSummary = getRecordStockSummary(row.original);
        return (
          <div className="space-y-1">
            <Badge variant="outline" className={stockSummary.badgeClassName}>{stockSummary.label}</Badge>
            <p className="text-xs text-muted-foreground">{stockSummary.helper}</p>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={cn('rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]', WORKFLOW_BADGE_CLASSNAME[row.original.prescription_workflow_status] || 'border-slate-300 bg-slate-50 text-slate-700')}>
          {getPrescriptionWorkflowLabel(row.original.prescription_workflow_status || 'draft')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Aksi',
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => onOpenDetail(row.original)}>
            Detail
          </Button>
          {canProcess && (
            <Button type="button" size="sm" className="rounded-none" onClick={() => onReceive(row.original)} disabled={processingRecordId === row.original.id}>
              {processingRecordId === row.original.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PillBottle className="mr-1 h-4 w-4" />}
              {processingRecordId === row.original.id ? 'Memproses...' : 'Terima Resep'}
            </Button>
          )}
        </div>
      ),
    },
  ];
}