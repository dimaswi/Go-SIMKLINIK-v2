import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AxiosError } from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  Loader2,
  RefreshCw,
  ScanLine,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TableDateFilter } from '@/components/ui/table-date-filter';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { cn, getLocalISODate } from '@/lib/utils';
import { downloadBlobResponse } from '../../lib/blob-download';
import {
  laboratoryApi,
  medicalRecordsApi,
  radiologyApi,
  type MedicalRecord,
} from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import {
  getSupportingOrderWorkflowBadgeClassName,
  getSupportingOrderWorkflowLabel,
} from '@/pages/emr/constants';
import { formatDateTime } from '@/pages/emr/utils';
import {
  filterSupportingOrders,
  getSupportingCompletedItemCount,
  getSupportingItemCount,
  getSupportingOrderedAt,
  getSupportingPolyclinicOptions,
  getSupportingPrimaryLine,
  getSupportingWorkflowStatus,
  type SupportingUnitType,
} from './utils';

const UNIT_CONFIG = {
  laboratory: {
    title: 'Laboratorium',
    label: 'laboratorium',
    rootPath: '/laboratory',
    viewPermission: 'laboratory.view',
    processPermission: 'laboratory.process',
    icon: FlaskConical,
  },
  radiology: {
    title: 'Radiologi',
    label: 'radiologi',
    rootPath: '/radiology',
    viewPermission: 'radiology.view',
    processPermission: 'radiology.process',
    icon: ScanLine,
  },
} as const;

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'ordered', label: 'Menunggu Terima' },
  { value: 'preparing', label: 'Sedang Diproses' },
  { value: 'completed', label: 'Hasil Selesai' },
];

export default function SupportingOrdersPage({
  unitType,
  mode: _mode,
}: {
  unitType: SupportingUnitType;
  mode?: string;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const unit = UNIT_CONFIG[unitType];
  const apiClient = unitType === 'laboratory' ? laboratoryApi : radiologyApi;
  const canManage = hasPermission(unit.processPermission);

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
    const params = new URLSearchParams({ per_page: '200' });
    const response = await apiClient.getOrders(params.toString());
    const nextOrders = response.data.data || [];
    setOrders(nextOrders);
    return nextOrders;
  }, [apiClient]);

  useEffect(() => {
    setPageTitle(unit.title);

    const run = async () => {
      setLoading(true);
      try {
        await loadOrders();
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: `Gagal memuat antrean ${unit.label}`,
          description: requestError.response?.data?.error || `Terjadi kesalahan saat memuat order ${unit.label}.`,
        });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [loadOrders, toast, unit.label, unit.title]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadOrders();
      toast({
        variant: 'success',
        title: 'Data diperbarui',
        description: `Daftar order ${unit.label} terbaru berhasil dimuat.`,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: `Gagal memuat ulang ${unit.label}`,
        description: requestError.response?.data?.error || `Terjadi kesalahan saat memuat ulang antrean ${unit.label}.`,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handlePrepare = async (record: MedicalRecord) => {
    if (!canManage) return;

    setPreparingRecordId(record.id);
    try {
      await apiClient.prepareOrder(record.id);
      toast({
        variant: 'success',
        title: 'Order berhasil diterima',
        description: `Order ${unit.label} #${record.id} siap diproses hasil di halaman detail.`,
      });
      await loadOrders();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menerima order',
        description: requestError.response?.data?.error || `Terjadi kesalahan saat memproses order ${unit.label}.`,
      });
    } finally {
      setPreparingRecordId(null);
    }
  };

  const handleDownloadResult = async (record: MedicalRecord) => {
    setDownloadingRecordId(record.id);
    try {
      const response = unitType === 'laboratory'
        ? await medicalRecordsApi.printLaboratoryOrderResult(record.id)
        : await medicalRecordsApi.printRadiologyOrderResult(record.id);
      downloadBlobResponse(response, `hasil-${unit.label}-${record.id}.pdf`);
      toast({
        variant: 'success',
        title: 'PDF berhasil diunduh',
        description: `Dokumen hasil ${unit.label} siap dicetak.`,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengunduh dokumen',
        description: requestError.response?.data?.error || 'Dokumen belum tersedia untuk dicetak.',
      });
    } finally {
      setDownloadingRecordId(null);
    }
  };

  const polyclinicOptions = useMemo(() => getSupportingPolyclinicOptions(orders), [orders]);

  const filteredOrders = useMemo(() => {
    let result = filterSupportingOrders(orders, search, polyclinicFilter, unitType);
    if (dateFilter) {
      result = result.filter((record) => {
        const orderDate = (getSupportingOrderedAt(record, unitType) || record.record_date || record.visit?.visit_date || '')?.slice(0, 10);
        return orderDate === dateFilter;
      });
    }
    if (statusFilter !== 'all') {
      result = result.filter((record) => getSupportingWorkflowStatus(record, unitType) === statusFilter);
    }
    return result;
  }, [dateFilter, orders, polyclinicFilter, search, statusFilter, unitType]);

  const columns = useMemo<ColumnDef<MedicalRecord>[]>(() => {
    return [
      {
        id: 'ordered_at',
        header: 'Tanggal Order',
        cell: ({ row }) => (
          <div className="space-y-0.5 text-xs">
            <p className="font-medium text-foreground">{formatDateTime(getSupportingOrderedAt(row.original, unitType))}</p>
            <p className="text-muted-foreground">{row.original.record_date ? `Draft ${formatDateTime(row.original.record_date)}` : '-'}</p>
          </div>
        ),
      },
      {
        id: 'patient',
        header: 'Pasien',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground truncate">{row.original.patient?.full_name || '-'}</p>
            <p className="text-xs text-muted-foreground truncate">RM {row.original.patient?.medical_record_number || '-'}</p>
          </div>
        ),
      },
      {
        id: 'summary',
        header: 'Pemeriksaan',
        cell: ({ row }) => (
          <div className="space-y-0.5 max-w-[280px]">
            <p className="text-xs font-medium text-foreground truncate">{getSupportingPrimaryLine(row.original, unitType)}</p>
            <p className="text-xs text-muted-foreground truncate">
              {getSupportingItemCount(row.original, unitType)} item · {getSupportingCompletedItemCount(row.original, unitType)} hasil terisi
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
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = getSupportingWorkflowStatus(row.original, unitType);
          return (
            <Badge variant="outline" className={`rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${getSupportingOrderWorkflowBadgeClassName(status)}`}>
              {getSupportingOrderWorkflowLabel(status)}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: () => <div className="text-right pr-2">Aksi</div>,
        cell: ({ row }) => {
          const record = row.original;
          const status = getSupportingWorkflowStatus(record, unitType);
          const isPreparing = preparingRecordId === record.id;
          const isDownloading = downloadingRecordId === record.id;

          return (
            <div className="flex items-center justify-end gap-1 whitespace-nowrap">
              {status === 'ordered' && canManage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                  onClick={() => void handlePrepare(record)}
                  disabled={isPreparing}
                  title="Terima Order"
                >
                  {isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                </Button>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={() => navigate(`${unit.rootPath}/${record.id}`)}
                title={status === 'completed' ? 'Lihat Hasil' : 'Detail / Proses Order'}
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

              {status === 'completed' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                  onClick={() => void handleDownloadResult(record)}
                  disabled={isDownloading}
                  title="Cetak Hasil PDF"
                >
                  {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
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
  }, [canManage, downloadingRecordId, navigate, preparingRecordId, unit.label, unit.rootPath, unitType]);

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
              <unit.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                {unit.title}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Cari pasien / RM / ${unit.label}...`}
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />

            <TableDateFilter
              value={dateFilter}
              onChange={setDateFilter}
              title={`Filter tanggal order ${unit.label} (Kosongkan untuk menampilkan semua tanggal)`}
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
            emptyMessage={`Belum ada antrean order ${unit.label}.`}
          />
        </div>
      </div>
    </div>
  );
}