import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AxiosError } from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  PillBottle,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { downloadBlobResponse } from '../../lib/blob-download';
import { medicalRecordsApi, pharmacyApi, type MedicalRecord } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { getPrescriptionWorkflowLabel } from '@/pages/emr/constants';
import { cn, getLocalISODate } from '@/lib/utils';
import {
  buildOrderLines,
  filterPharmacyOrders,
  formatCurrency,
  formatDateTime,
  getPolyclinicOptions,
  getRecordStockSummary,
  getRecordTotalPrice,
  STATUS_FILTER_OPTIONS,
  WORKFLOW_BADGE_CLASSNAME,
} from './utils';

export default function PharmacyIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();

  const canManage =
    hasPermission('pharmacy.process') ||
    hasPermission('prescriptions.process') ||
    hasPermission('prescriptions.update');

  const [orders, setOrders] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [polyclinicFilter, setPolyclinicFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(getLocalISODate());
  const [preparingRecordId, setPreparingRecordId] = useState<number | null>(null);
  const [downloadingRecordId, setDownloadingRecordId] = useState<number | null>(null);

  const loadOrders = useCallback(async () => {
    const response = await pharmacyApi.getPrescriptionOrders('per_page=200');
    const nextOrders = response.data.data || [];
    setOrders(nextOrders);
    return nextOrders;
  }, []);

  useEffect(() => {
    setPageTitle('Farmasi');

    const run = async () => {
      setLoading(true);
      try {
        await loadOrders();
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: 'Gagal memuat resep farmasi',
          description:
            requestError.response?.data?.error ||
            'Terjadi kesalahan saat memuat daftar resep farmasi.',
        });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [loadOrders, toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadOrders();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memuat ulang data',
        description:
          requestError.response?.data?.error ||
          'Terjadi kesalahan saat memperbarui antrean resep.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handlePrepare = async (record: MedicalRecord) => {
    if (!canManage) return;

    setPreparingRecordId(record.id);
    try {
      await medicalRecordsApi.preparePrescriptionOrder(record.id);
      toast({
        title: 'Resep berhasil diterima',
        description: `Resep untuk pasien ${record.patient?.full_name || ''} telah dipindahkan ke tahap proses.`,
      });
      await loadOrders();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menerima resep',
        description:
          requestError.response?.data?.error ||
          'Terjadi kesalahan saat menerima order resep.',
      });
    } finally {
      setPreparingRecordId(null);
    }
  };

  const handleDownloadPrescription = async (record: MedicalRecord) => {
    setDownloadingRecordId(record.id);
    try {
      const response = await medicalRecordsApi.printPrescriptionOrder(record.id);
      downloadBlobResponse(
        response,
        `resep-${record.patient?.medical_record_number || record.id}.pdf`,
      );
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengunduh resep',
        description:
          requestError.response?.data?.error ||
          'Terjadi kesalahan saat mencetak dokumen resep.',
      });
    } finally {
      setDownloadingRecordId(null);
    }
  };

  const polyclinicOptions = useMemo(() => getPolyclinicOptions(orders), [orders]);

  const filteredOrders = useMemo(() => {
    let result = filterPharmacyOrders(orders, search, polyclinicFilter);
    if (dateFilter) {
      result = result.filter((record) => {
        const orderDate = (record.prescription_ordered_at || record.record_date || record.visit?.visit_date || '')?.slice(0, 10);
        return orderDate === dateFilter;
      });
    }
    if (statusFilter !== 'all') {
      result = result.filter(
        (record) => record.prescription_workflow_status === statusFilter,
      );
    }
    return result;
  }, [dateFilter, orders, polyclinicFilter, search, statusFilter]);

  const columns = useMemo<ColumnDef<MedicalRecord>[]>(() => {
    return [
      {
        id: 'ordered_at',
        header: 'Tanggal Order',
        cell: ({ row }) => (
          <div className="space-y-0.5 text-xs">
            <p className="font-medium text-foreground">
              {formatDateTime(row.original.prescription_ordered_at || row.original.record_date)}
            </p>
            <p className="text-muted-foreground">Order #{row.original.id}</p>
          </div>
        ),
      },
      {
        id: 'patient',
        header: 'Pasien',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground truncate">
              {row.original.patient?.full_name || '-'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              RM {row.original.patient?.medical_record_number || '-'} · Kunjungan {row.original.visit?.visit_number || '-'}
            </p>
          </div>
        ),
      },
      {
        id: 'summary',
        header: 'Ringkasan Resep',
        cell: ({ row }) => {
          const lines = buildOrderLines(row.original);
          const totalPrice = getRecordTotalPrice(row.original);
          const itemNames = lines.map((l) => l.name).filter(Boolean).join(', ');

          return (
            <div className="space-y-0.5 max-w-[280px]">
              <p className="text-xs font-medium text-foreground truncate">
                {lines.length} item obat · {formatCurrency(totalPrice)}
              </p>
              <p className="text-xs text-muted-foreground truncate" title={itemNames}>
                {itemNames || 'Belum ada item obat'}
              </p>
            </div>
          );
        },
      },
      {
        id: 'doctor',
        header: 'Dokter / Poli',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground truncate">
              {row.original.doctor?.full_name || '-'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {row.original.polyclinic?.name || '-'}
            </p>
          </div>
        ),
      },
      {
        id: 'stock',
        header: 'Ketersediaan Stok',
        cell: ({ row }) => {
          const stock = getRecordStockSummary(row.original);
          return (
            <Badge
              variant="outline"
              className={cn(
                'rounded-none px-2 py-0.5 text-[10px] tracking-wider uppercase',
                stock.badgeClassName,
              )}
            >
              {stock.label}
            </Badge>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.prescription_workflow_status || 'draft';
          return (
            <Badge
              variant="outline"
              className={cn(
                'rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]',
                WORKFLOW_BADGE_CLASSNAME[status] ||
                  'border-slate-300 bg-slate-50 text-slate-700',
              )}
            >
              {getPrescriptionWorkflowLabel(status)}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: 'Aksi',
        cell: ({ row }) => {
          const record = row.original;
          const status = record.prescription_workflow_status || 'draft';
          const isPreparing = preparingRecordId === record.id;
          const isDownloading = downloadingRecordId === record.id;

          return (
            <div className="flex items-center justify-end gap-1 whitespace-nowrap">
              {status === 'ordered' && canManage ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                  onClick={() => void handlePrepare(record)}
                  disabled={isPreparing}
                  title="Terima Resep"
                >
                  {isPreparing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </Button>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={() => navigate(`/pharmacy/${record.id}`)}
                title={status === 'dispensed' ? 'Lihat Resep' : 'Detail / Proses Resep'}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>

              {record.visit_id && (
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                  title="Buka EMR"
                >
                  <Link to={`/emr/${record.visit_id}`}>
                    <FileText className="h-4 w-4" />
                  </Link>
                </Button>
              )}

              {status === 'dispensed' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                  onClick={() => void handleDownloadPrescription(record)}
                  disabled={isDownloading}
                  title="Cetak Resep PDF"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ];
  }, [
    canManage,
    downloadingRecordId,
    navigate,
    preparingRecordId,
  ]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <PillBottle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Farmasi
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Cari pasien / RM / obat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />

            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-9 w-36 border border-border bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring shrink-0"
              title="Filter tanggal order resep"
            />

            <SearchableSelect
              options={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Semua Status"
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
            data={filteredOrders}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Tidak ada data order resep farmasi yang sesuai."
          />
        </div>
      </div>
    </div>
  );
}