import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { medicinesApi, type KFAProductDetail, type Medicine } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { Edit, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  MasterDataAsideSection,
  MasterDataAsideStack,
  MasterDataDetailItem,
  MasterDataPageShell,
  MasterDataSection,
  formatMasterDataDateTime,
} from '@/pages/master-data/shared';
import { MedicineKFAMappingCard } from './components/medicine-kfa-mapping-card';

function formatCurrency(value?: number) {
  if (typeof value !== 'number') return '-';
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export default function MedicineShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasAnyPermission, hasPermission } = usePermission();
  const [data, setData] = useState<Medicine | null>(null);
  const [kfaDetail, setKfaDetail] = useState<KFAProductDetail | null>(null);
  const [loadingKFADetail, setLoadingKFADetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncingMedication, setSyncingMedication] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const loadMedicine = useCallback(async () => {
    const medicineId = Number(id);
    if (!medicineId) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      const res = await medicinesApi.getById(medicineId);
      setData(res.data.data);
    } catch {
      toast({ variant: 'destructive', title: 'Error!' });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setPageTitle('Detail Obat');
    void loadMedicine();
  }, [loadMedicine]);

  useEffect(() => {
    const code = (data?.kfa_code || '').trim();
    if (!code) {
      setKfaDetail(null);
      setLoadingKFADetail(false);
      return;
    }

    let cancelled = false;
    setLoadingKFADetail(true);
    medicinesApi.getKFADetail(code)
      .then((response) => {
        if (cancelled) return;
        setKfaDetail(response.data.data || null);
      })
      .catch(() => {
        if (cancelled) return;
        setKfaDetail(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingKFADetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [data?.kfa_code]);

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await medicinesApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!', description: 'Obat berhasil dihapus.' });
      setTimeout(() => navigate('/medicines'), 500);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal menghapus.' });
      setDeleting(false);
    }
  };

  const handleSyncMedication = async () => {
    if (!data?.id) return;
    if (!data.kfa_code?.trim()) {
      toast({
        variant: 'destructive',
        title: 'Mapping KFA belum siap',
        description: 'Isi mapping KFA lebih dulu sebelum sync Medication SATUSEHAT.',
      });
      return;
    }

    setSyncingMedication(true);
    try {
      const response = await medicinesApi.syncSatusehatMedication(data.id);
      toast({
        variant: 'success',
        title: 'Sync berhasil',
        description: response.data?.message || 'Medication master berhasil dikirim ke SATUSEHAT.',
      });
      const refreshed = await medicinesApi.getById(data.id);
      setData(refreshed.data.data);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal sync medication',
        description: error.response?.data?.error || 'Sinkronisasi Medication SATUSEHAT gagal dijalankan.',
      });
    } finally {
      setSyncingMedication(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Data tidak ditemukan</p><Button onClick={() => navigate('/medicines')} className="mt-5">Kembali</Button></div></div>;
  }

  const stockLow = Number(data.current_stock) <= Number(data.min_stock);
  const canSyncMedication = hasAnyPermission(['settings.update', 'medicines.update']);

  return (
    <>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Obat" description="Apakah Anda yakin ingin menghapus obat ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />

      <MasterDataPageShell
        title={data.name}
        subtitle={data.generic_name || 'Data identitas, stok, dan harga obat.'}
        onBack={() => navigate('/medicines')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{data.id}</Badge>
            <Badge className={data.is_active ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {data.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </>
        }
        meta={
          <>
            <span>Kode {data.code || '-'}</span>
            <span>KFA {data.kfa_code || '-'}</span>
            <span>Kategori {data.category?.name || '-'}</span>
            <span>Tipe {data.type ? String(data.type).toUpperCase() : '-'}</span>
          </>
        }
        actions={
          <>
            {canSyncMedication && <Button variant="outline" className="rounded-none shadow-none" onClick={() => void handleSyncMedication()} disabled={syncingMedication || !data.kfa_code?.trim()}><RefreshCw className={`h-4 w-4 ${syncingMedication ? 'animate-spin' : ''}`} />{data.satusehat_medication_id ? 'Sync Ulang Medication' : 'Sync Medication'}</Button>}
            {hasPermission('medicines.update') && <Button className="rounded-none shadow-none" onClick={() => navigate(`/medicines/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>}
            {hasPermission('medicines.delete') && <Button variant="destructive" className="rounded-none shadow-none" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button>}
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Status Integrasi" helper="Ringkasan kesiapan obat lokal terhadap alur SATUSEHAT farmasi.">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={data.kfa_code ? 'default' : 'secondary'} className="rounded-none">{data.kfa_code ? 'Mapped ke KFA' : 'Belum mapped'}</Badge>
                    {data.satusehat_medication_id ? <Badge className="rounded-none border-0 bg-emerald-600 text-white">Medication tersinkron</Badge> : <Badge variant="outline" className="rounded-none">Belum sync Medication</Badge>}
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Kode KFA: <span className="font-medium text-foreground">{data.kfa_code || '-'}</span></p>
                    <p>Medication SATUSEHAT: <span className="font-medium text-foreground">{data.satusehat_medication_id || '-'}</span></p>
                    <p>Sync terakhir: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.satusehat_medication_synced_at)}</span></p>
                  </div>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Stok & Status" helper="Ringkasan cepat kondisi stok dan status aktif obat.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Status: <span className="font-medium text-foreground">{data.is_active ? 'Aktif' : 'Tidak aktif'}</span></p>
                  <p>Stok saat ini: <span className={stockLow ? 'font-medium text-destructive' : 'font-medium text-foreground'}>{data.current_stock ?? '-'} {data.unit?.name || ''}</span></p>
                  <p>Stok minimum: <span className="font-medium text-foreground">{data.min_stock ?? '-'}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Metadata" helper="Jejak pembuatan dan pembaruan data obat.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Dibuat: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.created_at)}</span></p>
                  <p>Terakhir diubah: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.updated_at)}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Mapping KFA & SATUSEHAT" helper="Panel ini menunjukkan identitas resmi KFA yang dipakai untuk membentuk Medication SATUSEHAT dari obat lokal ini.">
            <MedicineKFAMappingCard
              kfaCode={data.kfa_code}
              kfaName={data.kfa_name}
              detail={kfaDetail}
              loading={loadingKFADetail}
              medicationId={data.satusehat_medication_id}
              medicationSyncedAt={data.satusehat_medication_synced_at}
            />
          </MasterDataSection>

          <MasterDataSection title="Identitas Obat" helper="Informasi dasar obat yang dipakai pada farmasi, stok, dan resep.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MasterDataDetailItem label="Kode" value={data.code || '-'} />
              <MasterDataDetailItem label="Nama" value={data.name} />
              <MasterDataDetailItem label="Nama Generik" value={data.generic_name || '-'} />
              <MasterDataDetailItem label="Kategori" value={data.category?.name || '-'} />
              <MasterDataDetailItem label="Tipe" value={data.type ? String(data.type).toUpperCase() : '-'} />
              <MasterDataDetailItem label="Satuan" value={data.unit?.name || '-'} />
              <MasterDataDetailItem label="Bentuk" value={data.form || '-'} />
              <MasterDataDetailItem label="Kekuatan" value={data.strength || '-'} />
              <MasterDataDetailItem label="Produsen" value={data.manufacturer || '-'} />
            </div>
          </MasterDataSection>

          <MasterDataSection title="Stok dan Harga" helper="Nilai stok dan harga yang dipakai untuk pengelolaan inventori dan penjualan.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MasterDataDetailItem label="Stok Minimum" value={data.min_stock ?? '-'} />
              <MasterDataDetailItem label="Stok Saat Ini" value={<span className={stockLow ? 'text-destructive' : undefined}>{data.current_stock ?? '-'} {data.unit?.name || ''}</span>} />
              <MasterDataDetailItem label="Harga Beli" value={formatCurrency(data.purchase_price)} />
              <MasterDataDetailItem label="Harga Jual" value={formatCurrency(data.selling_price)} />
            </div>
          </MasterDataSection>
        </div>
      </MasterDataPageShell>
    </>
  );
}