import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MedicalRecord } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getPrescriptionWorkflowLabel } from '@/pages/emr/constants';
import {
  buildOrderLines,
  formatCurrency,
  formatDateTime,
  getNextPharmacyAction,
  PHARMACY_ACTION_META,
  type PharmacyWorkflowAction,
  WORKFLOW_BADGE_CLASSNAME,
} from './utils';
import { ExternalLink, Eye, Loader2, PackageCheck, PillBottle, ShoppingBag } from 'lucide-react';

type CreateColumnsOptions = {
  canOpenEMR: boolean;
  canProcessPharmacyWorkflow: boolean;
  processingRecordId: number | null;
  processingAction: PharmacyWorkflowAction | null;
  onOpenDetail: (record: MedicalRecord) => void;
  onRunAction: (record: MedicalRecord, action: PharmacyWorkflowAction) => void;
};

function WorkflowActionIcon({ action, className }: { action: PharmacyWorkflowAction; className?: string }) {
  switch (action) {
    case 'prepare':
      return <PillBottle className={className} />;
    case 'ready':
      return <PackageCheck className={className} />;
    case 'dispense':
      return <ShoppingBag className={className} />;
    default:
      return null;
  }
}

export function createColumns({
  canOpenEMR,
  canProcessPharmacyWorkflow,
  processingRecordId,
  processingAction,
  onOpenDetail,
  onRunAction,
}: CreateColumnsOptions): ColumnDef<MedicalRecord>[] {
  return [
    {
      id: 'ordered_at',
      header: 'Waktu Order',
      cell: ({ row }) => (
        <div className="space-y-1">
          <p className="font-medium text-foreground/95">{formatDateTime(row.original.prescription_ordered_at || row.original.record_date)}</p>
          <p className="text-xs text-muted-foreground">Entry #{row.original.id}</p>
        </div>
      ),
    },
    {
      id: 'patient',
      header: 'Pasien',
      cell: ({ row }) => (
        <div className="space-y-1">
          <p className="font-medium text-foreground/95">{row.original.patient?.full_name || '-'}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.original.patient?.medical_record_number || '-'}</p>
          <p className="text-xs text-muted-foreground">Kunjungan {row.original.visit?.visit_number || '-'}</p>
        </div>
      ),
    },
    {
      id: 'doctor',
      header: 'Dokter / Poli',
      cell: ({ row }) => (
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground/95">{row.original.doctor?.full_name || '-'}</p>
          <p className="text-xs text-muted-foreground">{row.original.polyclinic?.name || '-'}</p>
        </div>
      ),
    },
    {
      id: 'summary',
      header: 'Ringkasan Resep',
      cell: ({ row }) => {
        const orderLines = buildOrderLines(row.original);
        const totalPrice = orderLines.reduce((total, item) => total + item.price, 0);

        return (
          <div className="space-y-1">
            <p className="font-medium text-foreground/95">{orderLines.length} item obat</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(totalPrice)}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {orderLines.slice(0, 2).map((item) => item.name).join(', ') || 'Belum ada item'}
            </p>
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
      cell: ({ row }) => {
        const record = row.original;
        const nextAction = canProcessPharmacyWorkflow ? getNextPharmacyAction(record.prescription_workflow_status) : null;
        const isProcessing = processingRecordId === record.id && Boolean(nextAction) && processingAction === nextAction;

        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={() => onOpenDetail(record)}
              title="Detail Resep"
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canOpenEMR && (
              <Button asChild type="button" variant="outline" size="sm" className="h-8 w-8 p-0 rounded-none shadow-none shrink-0" title="Buka EMR">
                <Link to={`/emr/${record.visit_id}`}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {nextAction && (
              <Button
                type="button"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={() => onRunAction(record, nextAction)}
                disabled={isProcessing}
                title={isProcessing ? PHARMACY_ACTION_META[nextAction].processingLabel : PHARMACY_ACTION_META[nextAction].label}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <WorkflowActionIcon action={nextAction} className="h-4 w-4" />}
              </Button>
            )}
          </div>
        );
      },
      meta: {
        headerClassName: 'text-right pr-4 whitespace-nowrap',
        cellClassName: 'text-right pr-4 whitespace-nowrap',
      },
    },
  ];
}