import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, Ban, FileText, UserPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { RegistrationQueueItem } from '@/lib/api';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  waiting: { label: 'Menunggu', className: 'border-amber-300 bg-amber-50 text-amber-700' },
  called: { label: 'Dipanggil', className: 'border-blue-300 bg-blue-50 text-blue-700' },
  processing: { label: 'Diproses', className: 'border-violet-300 bg-violet-50 text-violet-700' },
  completed: { label: 'Selesai', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Dibatalkan', className: 'border-red-300 bg-red-50 text-red-700' },
};

function formatTime(value?: string) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ActionsCell({
  item,
  onProcess,
  onCancel,
}: {
  item: RegistrationQueueItem;
  onProcess: (item: RegistrationQueueItem, mode: 'existing' | 'new') => void;
  onCancel: (item: RegistrationQueueItem) => void;
}) {
  const navigate = useNavigate();

  if (item.status === 'waiting') {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-[11px] text-muted-foreground">Panggil di antrian</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 rounded-none text-destructive shadow-none hover:text-destructive shrink-0"
          onClick={() => onCancel(item)}
          title="Batalkan Tiket Antrian"
        >
          <Ban className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (item.status === 'called' || item.status === 'processing') {
    return (
      <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 rounded-none shadow-none shrink-0"
          onClick={() => onProcess(item, 'existing')}
          title="Daftarkan Pasien Lama"
        >
          <Users className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 w-7 p-0 rounded-none shadow-none shrink-0"
          onClick={() => onProcess(item, 'new')}
          title="Daftarkan Pasien Baru"
        >
          <UserPlus className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (item.status === 'completed' && item.visit_id) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 rounded-none shadow-none shrink-0"
          onClick={() => navigate(`/registration/${item.visit_id}`)}
          title="Buka Detail Pendaftaran"
        >
          <FileText className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 rounded-none shadow-none shrink-0"
          onClick={() => navigate(`/emr/${item.visit_id}`)}
          title="Buka EMR Kunjungan"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return null;
}

export function createColumns({
  onProcess,
  onCancel,
}: {
  onProcess: (item: RegistrationQueueItem, mode: 'existing' | 'new') => void;
  onCancel: (item: RegistrationQueueItem) => void;
}): ColumnDef<RegistrationQueueItem>[] {
  return [
    {
      header: 'Tiket',
      id: 'ticket_number',
      meta: {
        headerClassName: 'py-2 px-3 text-xs font-semibold',
        cellClassName: 'py-2 px-3 align-middle',
      },
      cell: ({ row }) => (
        <div className="min-w-[80px] flex items-baseline gap-1.5">
          <span className="font-mono text-base font-black text-foreground leading-none">
            {String(row.original.ticket_number).padStart(3, '0')}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono leading-none">
            {formatTime(row.original.created_at)}
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      id: 'status',
      meta: {
        headerClassName: 'py-2 px-3 text-xs font-semibold',
        cellClassName: 'py-2 px-3 align-middle',
      },
      cell: ({ row }) => {
        const status = STATUS_MAP[row.original.status];
        const times: string[] = [];
        if (row.original.called_at) times.push(`Panggil ${formatTime(row.original.called_at)}`);
        if (row.original.processing_started_at) times.push(`Proses ${formatTime(row.original.processing_started_at)}`);

        return (
          <div className="min-w-[120px] flex flex-col gap-0.5">
            <div>
              <Badge variant="outline" className={`rounded-none text-[10px] px-1.5 py-0 font-medium shadow-none ${status?.className || ''}`}>
                {status?.label || row.original.status}
              </Badge>
            </div>
            {times.length > 0 ? (
              <p className="text-[10px] text-muted-foreground font-mono leading-tight">
                {times.join(' · ')}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      header: 'Hasil Pendaftaran',
      id: 'registration_result',
      meta: {
        headerClassName: 'py-2 px-3 text-xs font-semibold',
        cellClassName: 'py-2 px-3 align-middle',
      },
      cell: ({ row }) => {
        const visit = row.original.visit;
        return (
          <div className="min-w-[170px] space-y-0.5">
            <div className="flex items-center gap-1.5 truncate">
              <span className="truncate text-xs font-semibold text-foreground" title={visit?.patient?.full_name || 'Belum diproses'}>
                {visit?.patient?.full_name || 'Belum diproses'}
              </span>
              {visit?.patient?.medical_record_number ? (
                <span className="font-mono text-[10px] text-muted-foreground shrink-0 bg-muted/60 px-1 py-0 border border-border/50">
                  RM: {visit.patient.medical_record_number}
                </span>
              ) : null}
            </div>
            {visit?.visit_number ? (
              <p className="font-mono text-[10px] text-muted-foreground truncate leading-tight" title={visit.visit_number}>
                {visit.visit_number}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      header: 'Tujuan Kunjungan',
      id: 'destination',
      meta: {
        headerClassName: 'py-2 px-3 text-xs font-semibold',
        cellClassName: 'py-2 px-3 align-middle',
      },
      cell: ({ row }) => {
        const visit = row.original.visit;
        return (
          <div className="min-w-[160px] space-y-0.5">
            <p className="truncate text-xs font-semibold text-foreground leading-tight" title={visit?.polyclinic?.name || '-'}>
              {visit?.polyclinic?.name || '-'}
            </p>
            <p className="truncate text-[10px] text-muted-foreground leading-tight" title={visit?.doctor?.full_name || 'Dokter belum dipilih'}>
              {visit?.doctor?.full_name || 'Dokter belum dipilih'}
            </p>
          </div>
        );
      },
    },
    {
      header: '',
      id: 'actions',
      meta: {
        headerClassName: 'py-2 px-3 text-xs font-semibold text-right',
        cellClassName: 'py-2 px-3 align-middle text-right',
      },
      cell: ({ row }) => <ActionsCell item={row.original} onProcess={onProcess} onCancel={onCancel} />,
    },
  ];
}