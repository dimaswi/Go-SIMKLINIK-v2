import { useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { setPageTitle } from '@/lib/page-title';
import { visitsApi, type Visit } from '@/lib/api';
import { Eye, FilePenLine, FileText, Loader2, XCircle } from 'lucide-react';

const VISIT_STATUS_LABEL: Record<Visit['status'], string> = {
  registered: 'Terdaftar',
  in_progress: 'Aktif',
  completed: 'Final',
  cancelled: 'Batal',
};

const VISIT_STATUS_CLASS: Record<Visit['status'], string> = {
  registered: 'border-amber-300 bg-amber-50 text-amber-700',
  in_progress: 'border-sky-300 bg-sky-50 text-sky-700',
  completed: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  cancelled: 'border-rose-300 bg-rose-50 text-rose-700',
};

function createColumns(onCancelVisit: (visit: Visit) => void, cancelingVisitId: number | null): ColumnDef<Visit>[] {
  return [
  {
    accessorKey: 'visit_date',
    header: 'Tanggal',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {new Date(row.original.visit_date).toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </span>
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
    id: 'visit',
    header: 'Kunjungan',
    cell: ({ row }) => (
      <div>
        <p className="font-mono text-xs text-muted-foreground">{row.original.visit_number}</p>
        <p className="text-xs text-muted-foreground">Antrian {String(row.original.queue_number).padStart(3, '0')}</p>
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
    accessorKey: 'complaint',
    header: 'Keluhan Awal',
    cell: ({ row }) => (
      <p className="max-w-md line-clamp-2 text-sm text-muted-foreground">{row.original.complaint || '-'}</p>
    ),
  },
  {
    id: 'status',
    header: 'Status Workspace',
    cell: ({ row }) => (
      <Badge variant="outline" className={VISIT_STATUS_CLASS[row.original.status]}>
        {VISIT_STATUS_LABEL[row.original.status]}
      </Badge>
    ),
  },
  {
    id: 'actions',
    header: 'Aksi',
    cell: ({ row }) => {
      const visit = row.original;

      return (
        <div className="flex items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm" className="h-8 px-2">
            <Link to={`/emr/${visit.id}`}>
              {visit.status === 'completed' ? <Eye className="mr-1 h-4 w-4" /> : <FilePenLine className="mr-1 h-4 w-4" />}
              {visit.status === 'completed' ? 'Lihat' : 'Buka'}
            </Link>
          </Button>

          {visit.status === 'registered' || visit.status === 'in_progress' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-destructive/30 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={cancelingVisitId === visit.id}
              onClick={() => onCancelVisit(visit)}
            >
              {cancelingVisitId === visit.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
              Batal
            </Button>
          ) : null}
        </div>
      )
    },
  },
]
}

export default function MedicalRecordsIndex() {
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Visit | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelingVisitId, setCancelingVisitId] = useState<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const response = await visitsApi.getAll('per_page=100');
        setVisits((response.data.data || []).filter((visit: Visit) => visit.status !== 'cancelled'));
      } catch {
        toast({ variant: 'destructive', title: 'Gagal memuat workspace rekam medis' });
      } finally {
        setLoading(false);
      }
    };

    setPageTitle('Rekam Medis');
    void loadData();
  }, [toast]);

  const filteredVisits = visits.filter((visit) => {
    if (statusFilter && visit.status !== statusFilter) return false;
    return true;
  });

  const columns = createColumns(
    (visit) => {
      setCancelTarget(visit);
      setCancelDialogOpen(true);
    },
    cancelingVisitId,
  );

  const confirmCancelVisit = async () => {
    if (!cancelTarget) return;

    setCancelingVisitId(cancelTarget.id);
    try {
      await visitsApi.cancelWorkspace(cancelTarget.id);
      setVisits((currentVisits) => currentVisits.filter((visit) => visit.id !== cancelTarget.id));
      toast({
        variant: 'success',
        title: 'Kunjungan dibatalkan',
        description: 'Workspace rekam medis dari pendaftaran berhasil dibatalkan.',
      });
    } catch (requestError: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal membatalkan kunjungan',
        description: requestError.response?.data?.error || 'Workspace rekam medis tidak dapat dibatalkan.',
      });
    } finally {
      setCancelingVisitId(null);
      setCancelDialogOpen(false);
      setCancelTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <DataTable
        columns={columns}
        data={filteredVisits}
        searchPlaceholder="Cari pasien, no. RM, no. kunjungan, atau dokter..."
        pageSize={20}
        toolbarActions={(
          <div className="w-44">
            <SearchableSelect
              options={[
                { value: 'registered', label: 'Terdaftar' },
                { value: 'in_progress', label: 'Aktif' },
                { value: 'completed', label: 'Final' },
              ]}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Status Workspace"
              noneLabel="Semua Status"
            />
          </div>
        )}
      />
      <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" />
        <span>Total {filteredVisits.length} kunjungan EMR</span>
      </div>

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Batalkan Workspace Rekam Medis"
        description={`Kunjungan ${cancelTarget?.visit_number || ''} untuk ${cancelTarget?.patient?.full_name || 'pasien ini'} akan dibatalkan dari daftar rekam medis. Jika belum ada entri, data kunjungan akan dihapus; jika sudah ada draft, workspace akan ditandai batal dan dilepas dari pendaftaran yang terhubung.`}
        onConfirm={confirmCancelVisit}
        confirmText="Ya, batalkan"
        cancelText="Tutup"
        variant="destructive"
      />
    </div>
  );
}
