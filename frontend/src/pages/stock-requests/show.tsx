import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { stockRequestsApi, type StockRequest } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';
import { CheckCircle2, Loader2, XCircle, Ban } from 'lucide-react';

interface RoomStockInfo {
  medicine_id: number;
  from_room_stock: number;
  to_room_stock: number;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  pending: { label: 'Menunggu Persetujuan', variant: 'outline', className: 'border-amber-500 text-amber-600' },
  approved: { label: 'Disetujui & Stok Terkirim', variant: 'default', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  rejected: { label: 'Ditolak', variant: 'destructive' },
  cancelled: { label: 'Dibatalkan', variant: 'secondary' },
};

export default function StockRequestShow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();

  const [request, setRequest] = useState<StockRequest | null>(null);
  const [roomStocks, setRoomStocks] = useState<RoomStockInfo[]>([]);
  const [approvedQtys, setApprovedQtys] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const canApprove = hasPermission('stock_requests.approve');
  const canDelete = hasPermission('stock_requests.delete');

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await stockRequestsApi.getById(Number(id));
      const reqData: StockRequest = res.data.data;
      setRequest(reqData);
      setRoomStocks(res.data.room_stocks || []);
      const initialQtys: Record<number, number> = {};
      (reqData.items || []).forEach((it) => {
        initialQtys[it.id] = reqData.status === 'approved' ? it.approved_quantity : it.requested_quantity;
      });
      setApprovedQtys(initialQtys);
    } catch {
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setPageTitle('Detail Permintaan Stok');
    void loadDetail();
  }, [loadDetail]);

  const handleApprove = async () => {
    if (!request) return;
    setProcessing(true);
    try {
      const items = (request.items || []).map((it) => ({
        item_id: it.id,
        approved_quantity: Number(approvedQtys[it.id] ?? it.requested_quantity),
      }));
      await stockRequestsApi.approve(request.id, { items });
      toast({ variant: 'success', title: 'Berhasil', description: 'Permintaan disetujui dan stok berhasil dipindahkan ke ruangan tujuan.' });
      void loadDetail();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.response?.data?.error || 'Gagal menyetujui permintaan.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!request) return;
    setProcessing(true);
    try {
      await stockRequestsApi.reject(request.id, { reason: rejectReason });
      toast({ variant: 'success', title: 'Berhasil', description: 'Permintaan stok ditolak.' });
      setRejectOpen(false);
      void loadDetail();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.response?.data?.error || 'Gagal menolak permintaan.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!request) return;
    setProcessing(true);
    try {
      await stockRequestsApi.cancel(request.id);
      toast({ variant: 'success', title: 'Berhasil', description: 'Permintaan stok dibatalkan.' });
      void loadDetail();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.response?.data?.error || 'Gagal membatalkan permintaan.' });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!request) {
    return (
      <MasterDataPageShell title="Detail Permintaan Stok" onBack={() => navigate('/stock-requests')}>
        <p className="text-sm text-muted-foreground">Data permintaan stok tidak ditemukan.</p>
      </MasterDataPageShell>
    );
  }

  const badge = STATUS_BADGE[request.status] || { label: request.status, variant: 'secondary' as const };
  const isPending = request.status === 'pending';

  return (
    <MasterDataPageShell
      title={`Permintaan ${request.request_number}`}
      subtitle={`Mutasi stok dari ${request.from_room?.name || '-'} ke ${request.to_room?.name || '-'}`}
      onBack={() => navigate('/stock-requests')}
      actions={
        isPending ? (
          <div className="flex flex-wrap items-center gap-2">
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                disabled={processing}
                onClick={handleCancel}
                className="h-8 px-3 text-xs rounded-none shadow-none"
              >
                <Ban className="mr-1.5 size-3.5" />
                Batalkan
              </Button>
            )}
            {canApprove && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={processing}
                  onClick={() => setRejectOpen(true)}
                  className="h-8 px-3 text-xs rounded-none shadow-none"
                >
                  <XCircle className="mr-1.5 size-3.5" />
                  Tolak
                </Button>
                <Button
                  size="sm"
                  disabled={processing}
                  onClick={handleApprove}
                  className="h-8 px-3 text-xs rounded-none shadow-none bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {processing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 size-3.5" />}
                  Setujui &amp; Kirim Stok
                </Button>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-2.5">
        <div className="grid gap-2.5 md:grid-cols-4 border border-border/70 p-3 bg-card text-xs">
          <div>
            <p className="text-muted-foreground">Status</p>
            <div className="mt-1">
              <Badge variant={badge.variant} className={`rounded-none text-[11px] ${badge.className || ''}`}>
                {badge.label}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground">Ruangan Asal (Sumber)</p>
            <p className="font-semibold text-sm mt-0.5">{request.from_room?.name || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Ruangan Tujuan (Peminta)</p>
            <p className="font-semibold text-sm mt-0.5">{request.to_room?.name || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Pemohon &amp; Tanggal</p>
            <p className="font-medium mt-0.5">{request.requester?.full_name || '-'}</p>
            <p className="text-muted-foreground">
              {request.request_date ? new Date(request.request_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
            </p>
          </div>
        </div>

        {request.notes && (
          <div className="border border-border/70 p-3 bg-muted/20 text-xs">
            <span className="font-semibold">Catatan: </span>
            {request.notes}
          </div>
        )}

        {request.rejection_reason && (
          <div className="border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <span className="font-semibold">Alasan Penolakan: </span>
            {request.rejection_reason}
          </div>
        )}

        <div className="border border-border/70 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border/70">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium">Obat</th>
                <th className="text-right px-3 py-2 text-xs font-medium">Stok {request.from_room?.name || 'Asal'}</th>
                <th className="text-right px-3 py-2 text-xs font-medium">Stok {request.to_room?.name || 'Tujuan'}</th>
                <th className="text-right px-3 py-2 text-xs font-medium">Diminta</th>
                <th className="text-right px-3 py-2 text-xs font-medium w-36">Disetujui / Dikirim</th>
                <th className="text-left px-3 py-2 text-xs font-medium">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {(request.items || []).map((item) => {
                const stockInfo = roomStocks.find((s) => s.medicine_id === item.medicine_id);
                return (
                  <tr key={item.id} className="border-b border-border/50 last:border-b-0">
                    <td className="px-3 py-2">
                      <p className="text-xs font-medium">{item.medicine?.name || '-'}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">{item.medicine?.code || ''}</p>
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-medium">
                      {stockInfo ? stockInfo.from_room_stock.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {stockInfo ? stockInfo.to_room_stock.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold">
                      {item.requested_quantity} {item.medicine?.unit?.name || ''}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isPending && canApprove ? (
                        <Input
                          type="number"
                          min={0}
                          max={item.requested_quantity}
                          value={approvedQtys[item.id] ?? item.requested_quantity}
                          onChange={(e) =>
                            setApprovedQtys((prev) => ({
                              ...prev,
                              [item.id]: Number(e.target.value),
                            }))
                          }
                          className="h-8 text-xs text-right rounded-none"
                        />
                      ) : (
                        <span className="text-xs font-semibold">
                          {item.approved_quantity} {item.medicine?.unit?.name || ''}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {item.notes || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak Permintaan Stok</DialogTitle>
            <DialogDescription>
              Berikan alasan penolakan permintaan stok {request.request_number}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Alasan Penolakan</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Misal: Stok di Depo sedang kosong..."
              className="h-9 text-xs rounded-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectOpen(false)} className="rounded-none">
              Batal
            </Button>
            <Button variant="destructive" size="sm" disabled={processing} onClick={handleReject} className="rounded-none">
              {processing && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Tolak Permintaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MasterDataPageShell>
  );
}
