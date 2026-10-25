import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  FileSpreadsheet,
  FileText,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  if (['selesai', 'completed', 'done', 'lunas'].includes(normalized)) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400';
  }
  if (['berlangsung', 'in_progress', 'processing', 'diproses', 'dalam konsultasi'].includes(normalized)) {
    return 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400';
  }
  if (['menunggu', 'waiting', 'ordered', 'dipanggil'].includes(normalized)) {
    return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400';
  }
  if (['batal', 'cancelled', 'belum bayar', 'belum_bayar'].includes(normalized)) {
    return 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400';
  }
  if (['sebagian', 'radiologi', 'dokter'].includes(normalized)) {
    return 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-400';
  }
  if (['umum', 'bpjs', 'asuransi', 'tunai', 'transfer', 'debit', 'kredit'].includes(normalized)) {
    return 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-400';
  }
  return 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
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

function getColumnMeta(column: ReportCenterColumn): ReportColumnMeta {
  const isNumberOrCurrency = column.kind === 'currency' || column.kind === 'number';
  const isBadge = isCategoricalBadgeColumn(column);
  const isDate = column.kind === 'date';
  const isCode = /(code|kode|icd|id|visit|invoice|rm|number)/i.test(column.key);
  const isMainText = /(name|nama|diagnosis|diagnosa|service|pemeriksaan|descriptor|keterangan)/i.test(column.key);

  if (isNumberOrCurrency) {
    const widthClass = column.kind === 'currency' ? 'w-[140px] min-w-[120px]' : 'w-[110px] min-w-[95px]';
    return {
      headerClassName: cn('py-3 px-3.5 text-xs font-semibold text-right whitespace-nowrap', widthClass),
      cellClassName: cn('py-3 px-3.5 text-xs align-middle text-right tabular-nums font-mono whitespace-nowrap', widthClass),
    };
  }

  if (isBadge) {
    return {
      headerClassName: 'py-3 px-3.5 text-xs font-semibold text-left w-[125px] min-w-[105px] whitespace-nowrap',
      cellClassName: 'py-3 px-3.5 text-xs align-middle text-left w-[125px] min-w-[105px] whitespace-nowrap',
    };
  }

  if (isDate) {
    return {
      headerClassName: 'py-3 px-3.5 text-xs font-semibold text-left w-[120px] min-w-[110px] whitespace-nowrap',
      cellClassName: 'py-3 px-3.5 text-xs align-middle text-left font-mono text-muted-foreground w-[120px] min-w-[110px] whitespace-nowrap',
    };
  }

  if (isCode) {
    return {
      headerClassName: 'py-3 px-3.5 text-xs font-semibold text-left w-[130px] min-w-[105px] whitespace-nowrap',
      cellClassName: 'py-3 px-3.5 text-xs align-middle text-left font-mono font-medium text-foreground w-[130px] min-w-[105px] whitespace-nowrap',
    };
  }

  if (isMainText) {
    return {
      headerClassName: 'py-3 px-3.5 text-xs font-semibold text-left min-w-[180px]',
      cellClassName: 'py-3 px-3.5 text-xs align-middle text-left min-w-[180px]',
    };
  }

  return {
    headerClassName: 'py-3 px-3.5 text-xs font-semibold text-left w-[140px] min-w-[120px]',
    cellClassName: 'py-3 px-3.5 text-xs align-middle text-left w-[140px] min-w-[120px]',
  };
}

function createColumns(columns: ReportCenterColumn[]): ColumnDef<Record<string, unknown>>[] {
  return columns.map((column) => {
    const columnMeta = getColumnMeta(column);
    const isNumberOrCurrency = column.kind === 'currency' || column.kind === 'number';

    return {
      accessorKey: column.key,
      meta: columnMeta,
      header: ({ column: tableColumn }) => {
        const isSorted = tableColumn.getIsSorted();
        return (
          <div
            className={cn(
              'group inline-flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold text-foreground hover:text-primary transition-colors',
              isNumberOrCurrency ? 'justify-end' : 'justify-start'
            )}
            onClick={() => tableColumn.toggleSorting(isSorted === 'asc')}
          >
            {isNumberOrCurrency && (
              isSorted === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : isSorted === 'desc' ? (
                <ArrowDown className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )
            )}
            <span>{column.label}</span>
            {!isNumberOrCurrency && (
              isSorted === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : isSorted === 'desc' ? (
                <ArrowDown className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )
            )}
          </div>
        );
      },
      cell: ({ row }) => {
        const value = row.original[column.key];
        if (isCategoricalBadgeColumn(column)) {
          return (
            <div className="flex justify-start">
              <Badge
                variant="outline"
                className={cn('rounded-none shadow-none text-[10px] uppercase tracking-wider font-semibold py-0.5 px-2', badgeClassName(value))}
              >
                {formatCellValue(value, column)}
              </Badge>
            </div>
          );
        }

        const isCodeOrNum = /(number|kode|no|id|visit|invoice|rm|code)/i.test(column.key);

        return (
          <div
            className={cn(
              'text-xs',
              isNumberOrCurrency
                ? 'text-right font-medium font-mono tabular-nums text-foreground'
                : column.kind === 'date'
                ? 'text-left font-mono text-muted-foreground'
                : isCodeOrNum
                ? 'font-mono text-foreground font-medium text-left'
                : 'truncate text-left text-foreground'
            )}
            title={typeof value === 'string' ? value : undefined}
          >
            {formatCellValue(value, column)}
          </div>
        );
      },
    };
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
    setPageTitle('Laporan & Rekapitulasi Klinik');
  }, []);

  const applyPreset = (preset: 'today' | 'this_month' | 'last_month' | 'this_year') => {
    const now = new Date();
    const toInput = (d: Date) => d.toISOString().slice(0, 10);
    if (preset === 'today') {
      const todayStr = toInput(now);
      setReportStartDate(todayStr);
      setReportEndDate(todayStr);
    } else if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setReportStartDate(toInput(start));
      setReportEndDate(toInput(now));
    } else if (preset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setReportStartDate(toInput(start));
      setReportEndDate(toInput(end));
    } else if (preset === 'this_year') {
      const start = new Date(now.getFullYear(), 0, 1);
      setReportStartDate(toInput(start));
      setReportEndDate(toInput(now));
    }
  };

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
      toast({ title: 'Export berhasil', description: `${activeMeta.label} (${format.toUpperCase()}) telah berhasil diunduh.` });
    } catch {
      toast({ variant: 'destructive', title: 'Export gagal', description: 'Laporan tidak berhasil diunduh. Coba lagi beberapa saat.' });
    } finally {
      setExportingFormat(null);
    }
  };

  const activeDataset = dataset?.report_type === activeTab ? dataset : null;
  const columns = useMemo(() => createColumns(activeDataset?.columns || []), [activeDataset?.columns]);

  return (
    <div className="p-4 lg:p-6 bg-muted/20 min-h-full flex flex-col flex-1">
      {/* Satu Card Terpadu Sesuai Standar SIMKLINIK */}
      <div className="border border-border/80 bg-card shadow-none flex-1 flex flex-col">
        {/* Card Header Bar */}
        <div className="flex flex-col gap-3 p-4 border-b border-border/70 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border/70 bg-muted/20">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-foreground">
                  Laporan & Rekapitulasi Klinik
                </h1>
                <Badge variant="outline" className="rounded-none text-[10px] uppercase font-semibold text-primary border-primary/30 bg-primary/5 shadow-none">
                  {activeMeta.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeMeta.description}
              </p>
            </div>
          </div>

          {/* Right Header Controls: Period Date Inputs + Presets + Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Range Picker */}
            <div className="flex items-center border border-border/80 bg-background shadow-none divide-x divide-border/60">
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-muted/20">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Periode</span>
              </div>
              <div className="flex items-center px-2 py-0.5 gap-1.5">
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(event) => setReportStartDate(event.target.value)}
                  className="h-7 w-[125px] border-0 bg-transparent text-xs font-mono outline-none focus:ring-0 p-0 text-foreground cursor-pointer"
                />
                <span className="text-muted-foreground text-xs font-mono">s/d</span>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(event) => setReportEndDate(event.target.value)}
                  className="h-7 w-[125px] border-0 bg-transparent text-xs font-mono outline-none focus:ring-0 p-0 text-foreground cursor-pointer"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="hidden sm:flex items-center border border-border/80 bg-background shadow-none divide-x divide-border/60">
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className="px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                title="Filter hari ini"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => applyPreset('this_month')}
                className="px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                title="Filter bulan ini"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => applyPreset('this_year')}
                className="px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                title="Filter tahun ini"
              >
                Tahun Ini
              </button>
            </div>

            {rangeError ? <span className="text-xs text-destructive">{rangeError}</span> : null}

            {/* Export Buttons */}
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none px-3 text-xs shadow-none border-border/80 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition-colors"
                onClick={() => void handleDownload('pdf')}
                disabled={loading || exportingFormat !== null}
                title="Unduh laporan dalam format PDF"
              >
                {exportingFormat === 'pdf' ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
                )}
                Export PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none px-3 text-xs shadow-none border-border/80 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-colors"
                onClick={() => void handleDownload('excel')}
                disabled={loading || exportingFormat !== null}
                title="Unduh laporan dalam format Excel (.xlsx)"
              >
                {exportingFormat === 'excel' ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                )}
                Export Excel
              </Button>
            </div>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="border-b border-border/70 bg-muted/10 px-4 pt-1 overflow-x-auto">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportCenterType)}>
            <TabsList className="flex h-9 w-full justify-start gap-1 bg-transparent p-0 text-muted-foreground">
              {reportTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-none transition-all whitespace-nowrap"
                >
                  {tab.shortLabel}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Table Content Area */}
        <div className="p-4 flex-1">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={activeDataset?.rows || []}
              searchPlaceholder={`Cari data ${activeMeta.shortLabel.toLowerCase()}...`}
              pageSize={10}
              showColumnVisibility={false}
              showSelectionSummary={false}
              borderless={false}
              emptyMessage="Tidak ada data pada periode ini."
              toolbarActions={
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-none border-border/80 bg-muted/30 px-2.5 py-1 text-[11px] font-mono shadow-none text-muted-foreground">
                    <span className="font-semibold text-foreground mr-1">
                      {formatNumber((activeDataset?.rows || []).length)}
                    </span>
                    baris data
                  </Badge>
                </div>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}