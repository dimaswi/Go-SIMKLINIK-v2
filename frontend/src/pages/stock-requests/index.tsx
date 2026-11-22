import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { stockRequestsApi, type StockRequest } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { setPageTitle } from '@/lib/page-title';
import { ArrowRightLeft, Eye, Loader2, Plus, RefreshCw } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'pending', label: 'Menunggu Persetujuan' },
  { value: 'approved', label: 'Disetujui & Dikirim' },
  { value: 'rejected', label: 'Ditolak' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  pending: { label: 'Pending', variant: 'outline', className: 'border-amber-500 text-amber-600' },
  approved: { label: 'Disetujui', variant: 'default', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  rejected: { label: 'Ditolak', variant: 'destructive' },
  cancelled: { label: 'Dibatalkan', variant: 'secondary' },
};

export default function StockRequestsIndex() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();

  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const canCreate = hasPermission('stock_requests.create');

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('per_page', '100');
      if (search.trim()) params.set('q', search.trim());
      if (status !== 'all') params.set('status', status);

      const res = await stockRequestsApi.getAll(params.toString());
      setRequests(res.data.data || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    setPageTitle('Permintaan Stok');
    void loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const columns = useMemo<ColumnDef<StockRequest>[]>(() => [
    {
      accessorKey: 'request_number',
      header: 'No. Permintaan',
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.request_number}</span>
      ),
    },
    {
      accessorKey: 'request_date',
      header: 'Tanggal',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.request_date
            ? new Date(row.original.request_date).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
            : '-'}
        </span>
      ),
    },
    {
      id: 'from_room',
      header: 'Dari Ruangan (Sumber)',
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.from_room?.name || '-'}</span>
      ),
    },
    {
      id: 'to_room',
      header: 'Ke Ruangan (Peminta)',
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.to_room?.name || '-'}</span>
      ),
    },
    {
      id: 'requester',
      header: 'Pemohon',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.requester?.full_name || '-'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const badge = STATUS_BADGE[row.original.status] || { label: row.original.status, variant: 'secondary' as const };
        return (
          <Badge variant={badge.variant} className={`rounded-none shadow-none ${badge.className || ''}`}>
            {badge.label}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Aksi</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={() => navigate(`/stock-requests/${row.original.id}`)}
            title="Detail Permintaan"
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-2 p-3 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Permintaan Stok Obat
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor permintaan atau catatan..."
              className="h-9 w-48 sm:w-60 rounded-none text-xs focus:ring-inset"
            />

            <div className="w-48">
              <SearchableSelect
                options={STATUS_OPTIONS}
                value={status}
                onValueChange={(v) => setStatus(v || 'all')}
                placeholder="Filter status..."
                square
                className="h-9 text-xs rounded-none"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
            >
              <RefreshCw className={refreshing ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
              Segarkan
            </Button>

            {canCreate && (
              <Button
                className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
                onClick={() => navigate('/stock-requests/create')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Buat Permintaan Stok
              </Button>
            )}
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={requests}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Belum ada permintaan stok."
          />
        </div>
      </div>
    </div>
  );
}
