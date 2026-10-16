import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { downloadBlobResponse } from '@/lib/blob-download';
import {
  reportsApi,
  type ReportCenterColumn,
  type ReportCenterDataset,
  type ReportCenterType,
} from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { cn } from '@/lib/utils';

type ReportTabMeta = {
  value: ReportCenterType;
  label: string;
  shortLabel: string;
  description: string;
};

type ReportColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
};

const reportTabs: ReportTabMeta[] = [
  { value: 'kunjungan', label: 'Kunjungan', shortLabel: 'Kunjungan', description: 'Arus kunjungan rawat jalan, status visit, dan antrian pasien.' },
  { value: 'keuangan', label: 'Keuangan', shortLabel: 'Keuangan', description: 'Invoice, pembayaran, piutang, dan nilai tagihan pasien.' },
  { value: 'pasien', label: 'Demografi Pasien', shortLabel: 'Pasien', description: 'Komposisi pasien berdasarkan gender, umur, penjamin, dan wilayah.' },
  { value: 'diagnosa', label: 'Diagnosa', shortLabel: 'Diagnosa', description: 'Pola penyakit dan morbiditas ICD-10 pada periode aktif.' },
  { value: 'farmasi', label: 'Farmasi', shortLabel: 'Farmasi', description: 'Obat diresepkan, dispensing, dan posisi stok farmasi.' },
  { value: 'penunjang', label: 'Lab & Radiologi', shortLabel: 'Penunjang', description: 'Order penunjang, hasil, abnormal flag, dan turnaround time.' },
  { value: 'kinerja', label: 'Kinerja Dokter/Poli', shortLabel: 'Kinerja', description: 'Perbandingan kinerja dokter dan poliklinik dari volume dan revenue.' },
  { value: 'rl-rawat-jalan', label: 'RL Rawat Jalan', shortLabel: 'RL', description: 'Pendekatan RL rawat jalan berbasis diagnosis, gender, dan kelompok umur.' },
];

function currentMonthRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const toInput = (value: Date) => value.toISOString().slice(0, 10);
  return {
    start: toInput(start),
    end: toInput(today),
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value || 0);
}

function toTitleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCategoricalLabel(value: unknown) {
  const rawValue = String(value || '').trim();
  const normalized = rawValue.toLowerCase();

  const labelMap: Record<string, string> = {
    registered: 'Terdaftar',
    in_progress: 'Berlangsung',
    completed: 'Selesai',
    cancelled: 'Batal',
    waiting: 'Menunggu',
    called: 'Dipanggil',
    processing: 'Diproses',
    in_consultation: 'Dalam Konsultasi',
    done: 'Selesai',
    ordered: 'Dipesan',
    preparing: 'Disiapkan',
    ready: 'Siap',
    dispensed: 'Diserahkan',
    paid: 'Lunas',
    unpaid: 'Belum Bayar',
    belum_bayar: 'Belum Bayar',
    umum: 'Umum',
    bpjs: 'BPJS',
    asuransi: 'Asuransi',
    tunai: 'Tunai',
    transfer: 'Transfer',
    debit: 'Debit',
    kredit: 'Kredit',
    male: 'Laki-laki',
    female: 'Perempuan',
    l: 'Laki-laki',
    p: 'Perempuan',
  };

  if (labelMap[normalized]) {
    return labelMap[normalized];
  }

  return toTitleCase(rawValue.replace(/[_-]+/g, ' '));
}

function isCategoricalBadgeColumn(column: ReportCenterColumn) {
  return column.kind === 'badge' || /(status|payment|pembayaran|gender|jenis_kelamin)/i.test(column.key);
}

function badgeClassName(value: unknown) {
  const normalized = String(value || '').toLowerCase();
  if (['selesai', 'completed', 'done', 'lunas'].includes(normalized)) return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (['berlangsung', 'in_progress', 'processing', 'diproses'].includes(normalized)) return 'border-blue-300 bg-blue-50 text-blue-700';
  if (['menunggu', 'waiting', 'ordered'].includes(normalized)) return 'border-amber-300 bg-amber-50 text-amber-700';
  if (['batal', 'cancelled', 'belum bayar', 'belum_bayar'].includes(normalized)) return 'border-rose-300 bg-rose-50 text-rose-700';
  if (['sebagian', 'radiologi', 'dokter'].includes(normalized)) return 'border-violet-300 bg-violet-50 text-violet-700';
  if (['umum', 'bpjs', 'asuransi', 'tunai', 'transfer', 'debit', 'kredit'].includes(normalized)) return 'border-sky-300 bg-sky-50 text-sky-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function formatCellValue(value: unknown, column: ReportCenterColumn) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  if (column.kind === 'currency') {
    return formatCurrency(Number(value));
  }
  if (column.kind === 'number') {
    return formatNumber(Number(value));
  }

  if (isCategoricalBadgeColumn(column)) {
    return formatCategoricalLabel(value);
  }

  return String(value);
}

function getColumnSize(column: ReportCenterColumn) {
  if (column.key.includes('name')) return 240;
  if (column.key.includes('number') || column.key.includes('date')) return 150;
  if (column.key.includes('status') || column.kind === 'badge') return 140;
  if (column.kind === 'currency') return 150;
  if (column.kind === 'number') return 120;
  if (column.key.includes('code')) return 120;
  if (column.key.includes('type') || column.key.includes('group') || column.key.includes('category')) return 150;
  return 170;
}

function getColumnMeta(column: ReportCenterColumn): ReportColumnMeta {
  if (column.kind === 'currency' || column.kind === 'number') {
    return {
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
    };
  }

  if (column.kind === 'badge' || column.kind === 'date') {
    return {
      headerClassName: 'text-center',
      cellClassName: 'text-center',
    };
  }

  return {
    headerClassName: 'text-left',
    cellClassName: 'truncate',
  };
}

function createColumns(columns: ReportCenterColumn[]): ColumnDef<Record<string, unknown>>[] {
  return columns.map((column) => {
    const columnMeta = getColumnMeta(column);
    const alignClassName = column.kind === 'currency' || column.kind === 'number'
      ? 'justify-end text-right'
      : column.kind === 'badge' || column.kind === 'date'
        ? 'justify-center text-center'
        : 'justify-start text-left';

    return ({
    accessorKey: column.key,
    size: getColumnSize(column),
    minSize: Math.min(getColumnSize(column), 110),
    meta: columnMeta,
    header: ({ column: tableColumn }) => (
      <Button
        variant="ghost"
        className={cn('flex h-8 w-full px-0 hover:bg-transparent', alignClassName)}
        onClick={() => tableColumn.toggleSorting(tableColumn.getIsSorted() === 'asc')}
      >
        {column.label}
        <ArrowUpDown className="ml-2 h-4 w-4 shrink-0" />
      </Button>
    ),
    cell: ({ row }) => {
      const value = row.original[column.key];
      if (isCategoricalBadgeColumn(column)) {
        return <Badge variant="outline" className={cn('max-w-full rounded-none shadow-none', badgeClassName(value))}>{formatCellValue(value, column)}</Badge>;
      }

      return (
        <div className={cn(
          'w-full',
          column.kind === 'currency' || column.kind === 'number'
            ? 'text-right font-medium tabular-nums'
            : column.kind === 'date'
              ? 'text-center'
              : 'truncate text-left',
        )}
        >
          {formatCellValue(value, column)}
        </div>
      );
    },
    });
  });
}

export default function ReportsIndex() {
  const initialRange = useMemo(() => currentMonthRange(), []);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ReportCenterType>('kunjungan');
  const [reportStartDate, setReportStartDate] = useState(initialRange.start);
  const [reportEndDate, setReportEndDate] = useState(initialRange.end);
  const [appliedRange, setAppliedRange] = useState(initialRange);
  const [dataset, setDataset] = useState<ReportCenterDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'excel' | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const activeMeta = useMemo(() => reportTabs.find((tab) => tab.value === activeTab) || reportTabs[0], [activeTab]);

  useEffect(() => {
    setPageTitle('Laporan');
  }, []);

  useEffect(() => {
    if (!reportStartDate || !reportEndDate) {
      return;
    }

    if (reportStartDate > reportEndDate) {
      setRangeError('Tanggal mulai tidak boleh lebih besar dari tanggal selesai.');
      return;
    }

    setRangeError(null);
    const timeoutId = window.setTimeout(() => {
      setAppliedRange((currentRange) => {
        if (currentRange.start === reportStartDate && currentRange.end === reportEndDate) {
          return currentRange;
        }
        return { start: reportStartDate, end: reportEndDate };
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [reportEndDate, reportStartDate]);

  useEffect(() => {
    let isMounted = true;

    const loadPreview = async () => {
      setLoading(true);
      try {
        const response = await reportsApi.getPreview({
          type: activeTab,
          start_date: appliedRange.start,
          end_date: appliedRange.end,
        });

        if (isMounted) {
          setDataset(response.data.data);
        }
      } catch (error) {
        if (isMounted) {
          toast({
            variant: 'destructive',
            title: 'Gagal memuat laporan',
            description: error instanceof Error ? error.message : 'Data laporan tidak berhasil diambil.',
          });
          setDataset(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadPreview();
    return () => {
      isMounted = false;
    };
  }, [activeTab, appliedRange.end, appliedRange.start, toast]);

  const handleDownload = async (format: 'pdf' | 'excel') => {
    if (exportingFormat) return;

    setExportingFormat(format);
    try {
      const params = { type: activeTab, start_date: appliedRange.start, end_date: appliedRange.end };
      const response = format === 'pdf'
        ? await reportsApi.downloadPdf(params)
        : await reportsApi.downloadExcel(params);
      const fallbackFileName = `${activeTab}-${appliedRange.start}-sd-${appliedRange.end}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      downloadBlobResponse(response, fallbackFileName);
      toast({ title: 'Export berjalan', description: `${activeMeta.label} ${format.toUpperCase()} sedang diunduh.` });
    } catch {
      toast({ variant: 'destructive', title: 'Export gagal', description: 'Laporan tidak berhasil diunduh. Coba lagi beberapa saat.' });
    } finally {
      setExportingFormat(null);
    }
  };

  const activeDataset = dataset?.report_type === activeTab ? dataset : null;
  const columns = useMemo(() => createColumns(activeDataset?.columns || []), [activeDataset?.columns]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportCenterType)} className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {/* Unified Header: Tabs on Left, Date Period on Right */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-2">
          <div className="shrink-0 overflow-x-auto">
            <TabsList className="flex h-auto min-w-max gap-0 bg-transparent p-0 text-muted-foreground md:min-w-full">
              {reportTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="-mb-px rounded-none border-b-2 border-transparent px-4 pb-2 pt-1 text-sm font-medium data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {tab.shortLabel}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Periode:</span>
              <Input type="date" value={reportStartDate} onChange={(event) => setReportStartDate(event.target.value)} className="h-8 w-[135px] rounded-none text-xs" />
              <span className="text-xs text-muted-foreground">-</span>
              <Input type="date" value={reportEndDate} onChange={(event) => setReportEndDate(event.target.value)} className="h-8 w-[135px] rounded-none text-xs" />
            </div>
            {rangeError ? <span className="text-xs text-rose-700">{rangeError}</span> : null}
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none">
          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <div className="flex h-full min-h-[320px] items-center justify-center border border-dashed border-border/70">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <DataTable
                className="h-full"
                columns={columns}
                data={activeDataset?.rows || []}
                fixedLayout
                searchPlaceholder={`Cari data ${activeMeta.shortLabel.toLowerCase()}...`}
                pageSize={10}
                showColumnVisibility={false}
                showSelectionSummary={false}
                emptyMessage="Tidak ada data pada periode ini."
                toolbarActions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" className="h-9 rounded-none" onClick={() => void handleDownload('pdf')} disabled={loading || exportingFormat !== null}>
                      {exportingFormat === 'pdf' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
                      Export PDF
                    </Button>
                    <Button type="button" className="h-9 rounded-none" onClick={() => void handleDownload('excel')} disabled={loading || exportingFormat !== null}>
                      {exportingFormat === 'excel' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4" />}
                      Export Excel
                    </Button>
                    <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                      {formatNumber((activeDataset?.rows || []).length)} baris
                    </Badge>
                    <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                      {activeMeta.label}
                    </Badge>
                  </div>
                }
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}