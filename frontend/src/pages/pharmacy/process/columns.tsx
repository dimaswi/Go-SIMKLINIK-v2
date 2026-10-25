import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MedicalRecord } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getPrescriptionWorkflowLabel } from '@/pages/emr/constants';
import { buildOrderLines, formatCurrency, getRecordStockSummary, getRecordTotalPrice, WORKFLOW_BADGE_CLASSNAME } from '../utils';
import { FlaskConical, Loader2, RotateCcw } from 'lucide-react';

type CreateColumnsOptions = {
  onOpenProcess: (record: MedicalRecord) => void;
  onRequestReturnToOrder: (record: MedicalRecord) => void;
  returningRecordId: number | null;
};

export function createColumns({ onOpenProcess, onRequestReturnToOrder, returningRecordId }: CreateColumnsOptions): ColumnDef<MedicalRecord>[] {
  return [
    {
      id: 'patient',
      header: 'Pasien',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.patient?.full_name || '-'}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.original.patient?.medical_record_number || '-'}</p>
          <p className="text-xs text-muted-foreground">{row.original.visit?.visit_number || '-'}</p>
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
      header: 'Isi Resep',
      cell: ({ row }) => {
        const orderLines = buildOrderLines(row.original);
        return (
          <div>
            <p className="text-sm font-medium">{orderLines.length} item obat</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(getRecordTotalPrice(row.original))}</p>
          </div>
        );
      },
    },
    {
      id: 'stock',
      header: 'Stok',
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
      header: () => <div className="text-right pr-2">Aksi</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
            onClick={() => onRequestReturnToOrder(row.original)}
            disabled={returningRecordId === row.original.id}
            title="Kembalikan ke antrian resep"
          >
            {returningRecordId === row.original.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
            onClick={() => onOpenProcess(row.original)}
            title="Proses Resep"
          >
            <FlaskConical className="h-4 w-4" />
          </Button>
        </div>
      ),
      meta: {
        headerClassName: 'text-right pr-4 whitespace-nowrap',
        cellClassName: 'text-right pr-4 whitespace-nowrap',
      },
    },
  ];
}