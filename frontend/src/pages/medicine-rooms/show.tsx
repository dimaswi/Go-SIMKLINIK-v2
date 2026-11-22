import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { medicineRoomsApi, type MedicineRoom, type MedicineRoomStock } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';
import { Loader2, ArrowRightLeft } from 'lucide-react';

export default function MedicineRoomShow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();

  const [room, setRoom] = useState<MedicineRoom | null>(null);
  const [stocks, setStocks] = useState<MedicineRoomStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const loadRoomStock = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('per_page', '200');
      if (search.trim()) params.set('q', search.trim());
      if (onlyAvailable) params.set('only_available', 'true');

      const res = await medicineRoomsApi.getById(Number(id), params.toString());
      setRoom(res.data.data);
      setStocks(res.data.stocks || []);
    } catch {
      setRoom(null);
      setStocks([]);
    } finally {
      setLoading(false);
    }
  }, [id, search, onlyAvailable]);

  useEffect(() => {
    setPageTitle('Stok Ruangan Obat');
    void loadRoomStock();
  }, [loadRoomStock]);

  return (
    <MasterDataPageShell
      title={room ? `Stok: ${room.name}` : 'Stok Ruangan Obat'}
      subtitle={room ? `${room.code}${room.description ? ` · ${room.description}` : ''}` : 'Rincian stok obat per ruangan.'}
      onBack={() => navigate(`/polyclinics/${id}`)}
      actions={
        hasPermission('stock_requests.create') ? (
          <Button
            size="sm"
            onClick={() => navigate('/stock-requests/create')}
            className="h-8 px-3 text-xs rounded-none shadow-none"
          >
            <ArrowRightLeft className="mr-1.5 size-3.5" />
            Buat Permintaan Stok
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            placeholder="Cari nama, kode, atau generik obat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-sm text-xs rounded-none"
          />
          <div className="flex items-center gap-2">
            <Switch
              id="only-available"
              checked={onlyAvailable}
              onCheckedChange={setOnlyAvailable}
            />
            <Label htmlFor="only-available" className="text-xs cursor-pointer">
              Hanya tampilkan stok &gt; 0
            </Label>
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border border-border/70 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border/70">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium">Kode</th>
                  <th className="text-left px-3 py-2 text-xs font-medium">Nama Obat</th>
                  <th className="text-left px-3 py-2 text-xs font-medium">Kategori</th>
                  <th className="text-right px-3 py-2 text-xs font-medium">Stok Ruangan</th>
                  <th className="text-right px-3 py-2 text-xs font-medium">Stok Min.</th>
                  <th className="text-center px-3 py-2 text-xs font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stocks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Tidak ada data stok obat di ruangan ini.
                    </td>
                  </tr>
                ) : (
                  stocks.map((item) => {
                    const qty = item.quantity;
                    const min = item.min_stock || item.medicine?.min_stock || 0;
                    const isEmpty = qty <= 0;
                    const isLow = qty > 0 && qty <= min;
                    return (
                      <tr key={item.id} className="border-b border-border/50 last:border-b-0">
                        <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                          {item.medicine?.code || '-'}
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-xs font-medium">{item.medicine?.name || '-'}</p>
                          {item.medicine?.generic_name && (
                            <p className="text-[11px] text-muted-foreground">{item.medicine.generic_name}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {item.medicine?.category?.name || '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-semibold">
                          {qty.toLocaleString('id-ID')} {item.medicine?.unit?.name || ''}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                          {min}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isEmpty ? (
                            <Badge variant="destructive" className="rounded-none text-[10px]">Habis</Badge>
                          ) : isLow ? (
                            <Badge variant="outline" className="rounded-none text-[10px] border-amber-500 text-amber-600">Menipis</Badge>
                          ) : (
                            <Badge variant="default" className="rounded-none text-[10px] bg-emerald-600">Tersedia</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MasterDataPageShell>
  );
}
