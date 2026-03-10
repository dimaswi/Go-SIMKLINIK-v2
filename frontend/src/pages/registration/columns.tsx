import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Visit } from '@/lib/api';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  registered:   { label: 'Terdaftar',    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  in_progress:  { label: 'Konsultasi',   className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  completed:    { label: 'Selesai',      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  cancelled:    { label: 'Dibatalkan',   className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

const QUEUE_MAP: Record<string, { label: string; className: string }> = {
  waiting:        { label: 'Menunggu',   className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  in_consultation:{ label: 'Konsultasi', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  done:           { label: 'Selesai',    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  cancelled:      { label: 'Batal',      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

const PAYMENT_MAP: Record<string, string> = { umum: 'Umum', bpjs: 'BPJS', asuransi: 'Asuransi' };

function ActionsCell({ visit, onDelete }: { visit: Visit; onDelete: (id: number) => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/patients/${visit.patient_id}`)}>
        <Eye className="h-4 w-4" />
      </Button>
      {(visit.status === 'registered' || visit.status === 'cancelled') && (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(visit.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function createColumns(onDelete: (id: number) => void): ColumnDef<Visit>[] {
  return [
    {
      header: 'No. Kunjungan',
      accessorKey: 'visit_number',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.visit_number}</span>
      ),
    },
    {
      header: 'Antrian',
      accessorKey: 'queue_number',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className={`text-lg font-black ${row.original.priority === 'urgent' ? 'text-orange-500' : 'text-primary'}`}>
            {String(row.original.queue_number).padStart(3, '0')}
          </span>
          {row.original.priority === 'urgent' && (
            <Badge className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Urgent</Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Pasien',
      id: 'patient',
      cell: ({ row }) => {
        const p = (row.original as any).patient;
        return (
          <div>
            <p className="text-sm font-medium">{p?.full_name || '-'}</p>
            <p className="text-xs text-muted-foreground font-mono">{p?.medical_record_number || '-'}</p>
          </div>
        );
      },
    },
    {
      header: 'Poliklinik / Dokter',
      id: 'polyclinic',
      cell: ({ row }) => {
        const poli = (row.original as any).polyclinic;
        const doc = (row.original as any).doctor;
        return (
          <div>
            <p className="text-sm font-medium">{poli?.name || '-'}</p>
            <p className="text-xs text-muted-foreground">{doc?.full_name || 'Belum ditentukan'}</p>
          </div>
        );
      },
    },
    {
      header: 'Pembayaran',
      accessorKey: 'payment_type',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">{PAYMENT_MAP[row.original.payment_type] || row.original.payment_type}</Badge>
      ),
    },
    {
      header: 'Status Antrian',
      accessorKey: 'queue_status',
      cell: ({ row }) => {
        const s = QUEUE_MAP[row.original.queue_status];
        return s ? <Badge className={`text-xs ${s.className}`}>{s.label}</Badge> : <Badge variant="outline">{row.original.queue_status}</Badge>;
      },
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: ({ row }) => {
        const s = STATUS_MAP[row.original.status];
        return s ? <Badge className={`text-xs ${s.className}`}>{s.label}</Badge> : <Badge variant="outline">{row.original.status}</Badge>;
      },
    },
    {
      header: '',
      id: 'actions',
      cell: ({ row }) => <ActionsCell visit={row.original} onDelete={onDelete} />,
    },
  ];
}
