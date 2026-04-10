import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, Ban, UserPlus, Users } from 'lucide-react';
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
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Panggil di halaman antrian</span>
        <Button type="button" variant="outline" size="sm" className="rounded-none text-destructive shadow-none hover:text-destructive" onClick={() => onCancel(item)}>
          <Ban className="mr-1.5 h-3.5 w-3.5" />
          Batal
        </Button>
      </div>
    );
  }

  if (item.status === 'called' || item.status === 'processing') {
    return (
      <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
        <Button type="button" variant="outline" size="sm" className="h-8 rounded-none px-3 shadow-none" onClick={() => onProcess(item, 'existing')}>
          <Users className="mr-1.5 h-3.5 w-3.5" />
          Pasien Lama
        </Button>
        <Button type="button" size="sm" className="h-8 rounded-none px-3 shadow-none" onClick={() => onProcess(item, 'new')}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Pasien Baru
        </Button>
      </div>
    );
  }

  if (item.status === 'completed' && item.visit_id) {
    return (
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="rounded-none shadow-none" onClick={() => navigate(`/emr/${item.visit_id}`)}>
          <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
          Buka EMR
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
      cell: ({ row }) => (
        <div className="min-w-[92px] space-y-1">
          <p className="text-2xl font-black leading-none text-foreground">
            {String(row.original.ticket_number).padStart(3, '0')}
          </p>
          <p className="text-xs text-muted-foreground">Diambil {formatTime(row.original.created_at)}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      id: 'status',
      cell: ({ row }) => {
        const status = STATUS_MAP[row.original.status];
        return (
          <div className="min-w-[120px] space-y-2">
            <Badge variant="outline" className={`rounded-none text-xs shadow-none ${status?.className || ''}`}>
              {status?.label || row.original.status}
            </Badge>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Dipanggil: {formatTime(row.original.called_at)}</p>
              <p>Diproses: {formatTime(row.original.processing_started_at)}</p>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Hasil Pendaftaran',
      id: 'registration_result',
      cell: ({ row }) => {
        const visit = row.original.visit;
        return (
          <div className="min-w-[160px] space-y-1">
            <p className="truncate text-sm font-medium text-foreground" title={visit?.patient?.full_name || 'Belum diproses'}>{visit?.patient?.full_name || 'Belum diproses'}</p>
            <p className="font-mono text-xs text-muted-foreground">{visit?.patient?.medical_record_number || '-'}</p>
            <p className="truncate text-xs text-muted-foreground" title={visit?.visit_number || 'Belum ada nomor kunjungan'}>{visit?.visit_number || 'Belum ada nomor kunjungan'}</p>
          </div>
        );
      },
    },
    {
      header: 'Tujuan Kunjungan',
      id: 'destination',
      cell: ({ row }) => {
        const visit = row.original.visit;
        return (
          <div className="min-w-[160px] space-y-1">
            <p className="truncate text-sm font-medium text-foreground" title={visit?.polyclinic?.name || '-'}>{visit?.polyclinic?.name || '-'}</p>
            <p className="truncate text-xs text-muted-foreground" title={visit?.doctor?.full_name || 'Dokter belum dipilih'}>{visit?.doctor?.full_name || 'Dokter belum dipilih'}</p>
          </div>
        );
      },
    },
    {
      header: '',
      id: 'actions',
      cell: ({ row }) => <ActionsCell item={row.original} onProcess={onProcess} onCancel={onCancel} />,
    },
  ];
}