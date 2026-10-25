import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TableDateFilter } from '@/components/ui/table-date-filter';
import { useToast } from '@/hooks/use-toast';
import { setPageTitle } from '@/lib/page-title';
import { visitsApi, type Visit } from '@/lib/api';
import { cn, getLocalISODate } from '@/lib/utils';
import { Eye, FilePenLine, Loader2, RefreshCw, Stethoscope, XCircle } from 'lucide-react';

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

function createColumns(
  onCancelVisit: (visit: Visit) => void,
  cancelingVisitId: number | null,
): ColumnDef<Visit>[] {
  return [
    {
      id: 'visit_date',
      header: 'Tanggal Kunjungan',
      cell: ({ row }) => (
        <div className="space-y-0.5 text-xs">
          <p className="font-medium text-foreground">
            {new Date(row.original.visit_date).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </p>
          <p className="text-muted-foreground">Kunjungan #{row.original.visit_number}</p>
        </div>
      ),
    },
    {
      id: 'patient',
      header: 'Pasien',
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="font-medium text-foreground truncate">{row.original.patient?.full_name || '-'}</p>
          <p className="font-mono text-xs text-muted-foreground truncate">
            RM {row.original.patient?.medical_record_number || '-'} · Antrean #{String(row.original.queue_number).padStart(3, '0')}
          </p>
        </div>
      ),
    },
    {
      id: 'doctor',
      header: 'Dokter / Poli',
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="font-medium text-foreground truncate">{row.original.doctor?.full_name || '-'}</p>
          <p className="text-xs text-muted-foreground truncate">{row.original.polyclinic?.name || '-'}</p>
        </div>
      ),
    },
    {
      id: 'complaint',
      header: 'Keluhan Awal',
      cell: ({ row }) => (
        <p className="max-w-[280px] line-clamp-2 text-xs text-muted-foreground" title={row.original.complaint || '-'}>
          {row.original.complaint || '-'}
        </p>
      ),
    },
    {
      id: 'status',
      header: 'Status Workspace',
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={cn(
            'rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]',
            VISIT_STATUS_CLASS[row.original.status] || 'border-slate-300 bg-slate-50 text-slate-700',
          )}
        >
          {VISIT_STATUS_LABEL[row.original.status] || row.original.status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right pr-2">Aksi</div>,
      cell: ({ row }) => {
        const visit = row.original;
        const isCanceling = cancelingVisitId === visit.id;

        return (
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            <Button
              asChild
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs rounded-none shadow-none"
            >
              <Link to={`/emr/${visit.id}`}>
                {visit.status === 'completed' ? (
                  <Eye className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <FilePenLine className="mr-1 h-3.5 w-3.5" />
                )}
                {visit.status === 'completed' ? 'Lihat EMR' : 'Buka EMR'}
              </Link>
            </Button>

            {visit.status === 'registered' || visit.status === 'in_progress' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs rounded-none shadow-none text-destructive hover:bg-destructive/10"
                disabled={isCanceling}
                onClick={() => onCancelVisit(visit)}
                title="Batalkan kunjungan"
              >
                {isCanceling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
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

export default function MedicalRecordsIndex() {
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [polyclinicFilter, setPolyclinicFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(getLocalISODate());
  const [cancelTarget, setCancelTarget] = useState<Visit | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelingVisitId, setCancelingVisitId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const response = await visitsApi.getAll('per_page=200');
      setVisits((response.data.data || []).filter((visit: Visit) => visit.status !== 'cancelled'));
    } catch {
      toast({ variant: 'destructive', title: 'Gagal memuat workspace rekam medis' });
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Rekam Medis');
    const run = async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    };
    void run();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const polyclinicOptions = useMemo(() => {
    const seen = new Map<string, string>();
    visits.forEach((v) => {
      if (v.polyclinic?.id && v.polyclinic.name) {
        seen.set(String(v.polyclinic.id), v.polyclinic.name);
      }
    });
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'id-ID'));
  }, [visits]);

  const filteredVisits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visits.filter((visit) => {
      // Date filter
      if (dateFilter) {
        const vDate = visit.visit_date?.slice(0, 10);
        if (vDate !== dateFilter) return false;
      }

      // Status filter
      if (statusFilter === 'active') {
        if (visit.status !== 'registered' && visit.status !== 'in_progress') return false;
      } else if (statusFilter !== 'all' && statusFilter !== '') {
        if (visit.status !== statusFilter) return false;
      }

      // Polyclinic filter
      if (polyclinicFilter && String(visit.polyclinic_id) !== polyclinicFilter) {
        return false;
      }

      // Search query
      if (!query) return true;
      const haystack = [
        visit.patient?.full_name,
        visit.patient?.medical_record_number,
        visit.visit_number,
        visit.doctor?.full_name,
        visit.polyclinic?.name,
        visit.complaint,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [dateFilter, polyclinicFilter, search, statusFilter, visits]);

  const columns = useMemo(
    () =>
      createColumns((visit) => {
        setCancelTarget(visit);
        setCancelDialogOpen(true);
      }, cancelingVisitId),
    [cancelingVisitId],
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
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Rekam Medis (EMR)
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Cari pasien / RM / kunjungan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />

            <TableDateFilter
              value={dateFilter}
              onChange={setDateFilter}
              title="Filter tanggal kunjungan (Kosongkan untuk menampilkan semua tanggal)"
            />

            <SearchableSelect
              options={[
                { value: 'active', label: 'Workspace Aktif' },
                { value: 'all', label: 'Semua Status' },
                { value: 'registered', label: 'Terdaftar' },
                { value: 'in_progress', label: 'Aktif' },
                { value: 'completed', label: 'Final' },
              ]}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Status Workspace"
              className="h-9 w-40 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />

            {polyclinicOptions.length > 0 && (
              <SearchableSelect
                options={[{ value: '', label: 'Semua Poli' }, ...polyclinicOptions]}
                value={polyclinicFilter}
                onValueChange={setPolyclinicFilter}
                placeholder="Semua Poli"
                className="h-9 w-36 rounded-none text-xs focus:ring-inset shrink-0"
                square
              />
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
            >
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Segarkan
            </Button>
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={filteredVisits}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Tidak ada data kunjungan rekam medis yang sesuai."
          />
        </div>
      </div>

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Batalkan Workspace Rekam Medis"
        description={`Kunjungan ${cancelTarget?.visit_number || ''} untuk ${cancelTarget?.patient?.full_name || 'pasien ini'} akan dibatalkan dari daftar rekam medis. Jika belum ada entri, data kunjungan akan dihapus; jika sudah ada draft, workspace akan ditandai batal dan dilepas dari pendaftaran yang terhubung.`}
        onConfirm={confirmCancelVisit}
        confirmText="Ya, Batalkan"
        cancelText="Tutup"
        variant="destructive"
      />
    </div>
  );
}
