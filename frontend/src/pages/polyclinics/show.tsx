import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SatusehatResultDialog } from '@/components/satusehat-result-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { polyclinicsApi, satusehatApi, type Polyclinic } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { Building2, Edit, Loader2, MapPin, RefreshCw, Trash2 } from 'lucide-react';
import {
  HeaderActionButton,
  MasterDataDetailItem,
  MasterDataPageShell,
  MasterDataSection,
  formatMasterDataDateTime,
} from '@/pages/master-data/shared';

function formatCurrency(value?: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
}

export default function PolyclinicShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<Polyclinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [resultTitle, setResultTitle] = useState('');
  const [resultDescription, setResultDescription] = useState('');
  const [resultPayload, setResultPayload] = useState<unknown>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await polyclinicsApi.getById(Number(id));
      setData(res.data.data);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data.' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setPageTitle('Detail Poliklinik');
    void loadData();
  }, [loadData]);

  const openResultDialog = (title: string, description: string, payload: unknown) => {
    setResultTitle(title);
    setResultDescription(description);
    setResultPayload(payload);
    setResultDialogOpen(true);
  };

  const handlePreview = async (resource: 'organization' | 'location') => {
    if (!id || !data) return;

    const resourceLabel = resource === 'organization' ? 'Organization Poli' : 'Location Poli';
    const actionKey = `${resource}-preview`;
    setActionLoading(actionKey);

    try {
      const response = await satusehatApi.previewResource(resource, Number(id));
      openResultDialog(
        `Preview SATUSEHAT ${resourceLabel}`,
        `Payload ${resourceLabel} untuk poli ${data.name}.`,
        response.data,
      );
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `Gagal membuat preview ${resourceLabel}`,
        description: error.response?.data?.error || `Terjadi kesalahan saat menyiapkan ${resourceLabel.toLowerCase()}.`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSync = async (resource: 'organization' | 'location') => {
    if (!id || !data) return;

    const resourceLabel = resource === 'organization' ? 'Organization Poli' : 'Location Poli';
    const actionKey = `${resource}-sync`;
    setActionLoading(actionKey);

    try {
      const response = await satusehatApi.syncResource(resource, Number(id));
      toast({
        variant: 'success',
        title: `${resourceLabel} berhasil disinkronkan`,
        description: `Data SATUSEHAT untuk poli ${data.name} sudah diperbarui.`,
      });
      openResultDialog(
        `Hasil Sync SATUSEHAT ${resourceLabel}`,
        `Respons sinkronisasi ${resourceLabel} untuk poli ${data.name}.`,
        response.data,
      );
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `Gagal sinkron ${resourceLabel}`,
        description: error.response?.data?.error || `Terjadi kesalahan saat mengirim ${resourceLabel.toLowerCase()} ke SATUSEHAT.`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await polyclinicsApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!', description: 'Poliklinik berhasil dihapus.' });
      setTimeout(() => navigate('/polyclinics'), 500);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal menghapus.' });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Poliklinik tidak ditemukan</p><Button onClick={() => navigate('/polyclinics')} className="mt-5">Kembali</Button></div></div>;
  }

  return (
    <>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Poliklinik" description="Apakah Anda yakin ingin menghapus poliklinik ini? Tindakan ini tidak dapat dibatalkan." confirmText="Hapus" cancelText="Batal" variant="destructive" />
      <SatusehatResultDialog open={resultDialogOpen} onOpenChange={setResultDialogOpen} title={resultTitle} description={resultDescription} payload={resultPayload} />

      <MasterDataPageShell
        title={data.name}
        subtitle={data.description || 'Ringkasan pengaturan identitas dan tampilan poliklinik.'}
        onBack={() => navigate('/polyclinics')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{data.id}</Badge>
            <Badge className={data.is_active ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {data.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
            {data.satusehat_organization_id ? <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">Org SATUSEHAT</Badge> : null}
            {data.satusehat_location_id ? <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">Location SATUSEHAT</Badge> : null}
          </>
        }
        meta={
          <>
            <span>Kode {data.code || '-'}</span>
            <span>Admin {formatCurrency(data.admin_fee)}</span>
            <span>Urutan {data.sort_order ?? '-'}</span>
          </>
        }
        actions={
          <>
            {hasPermission('polyclinics.update') && (
              <HeaderActionButton
                label="Edit Poliklinik"
                icon={<Edit className="h-4 w-4" />}
                onClick={() => navigate(`/polyclinics/${id}/edit`)}
              />
            )}
            {hasPermission('polyclinics.delete') && (
              <HeaderActionButton
                label="Hapus Poliklinik"
                icon={deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={deleting}
              />
            )}
          </>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Identitas Poliklinik" helper="Informasi utama yang dipakai untuk penamaan dan pengelompokan layanan.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MasterDataDetailItem label="Nama" value={data.name} />
              <MasterDataDetailItem label="Kode" value={data.code || '-'} />
              <MasterDataDetailItem label="Biaya Administrasi" value={formatCurrency(data.admin_fee)} />
              <MasterDataDetailItem label="Status" value={data.is_active ? 'Aktif' : 'Tidak aktif'} />
              <MasterDataDetailItem label="Waktu Dibuat" value={formatMasterDataDateTime(data.created_at)} />
              <MasterDataDetailItem label="Terakhir Diubah" value={formatMasterDataDateTime(data.updated_at)} />
              <div className="md:col-span-2 xl:col-span-3">
                <MasterDataDetailItem label="Deskripsi" value={data.description || '-'} />
              </div>
            </div>
          </MasterDataSection>

          <MasterDataSection title="Pengaturan Tampilan" helper="Atribut visual yang dipakai di antarmuka dan urutan tampilan.">
            <div className="grid gap-4 md:grid-cols-3">
              <MasterDataDetailItem label="Warna" value={<span className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 border border-border/70" style={{ backgroundColor: data.color || '#6B7280' }} /><span>{data.color || '-'}</span></span>} />
              <MasterDataDetailItem label="Icon" value={data.icon || '-'} />
              <MasterDataDetailItem label="Urutan" value={data.sort_order ?? '-'} />
            </div>
          </MasterDataSection>

          <MasterDataSection title="Integrasi SATUSEHAT" helper="Resource facility turunan dari poli ini untuk Organization dan Location.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 border border-border/70 bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-foreground"><Building2 className="h-4 w-4" />Organization</p>
                    <p className="break-all text-xs leading-5 text-muted-foreground">{data.satusehat_organization_id || 'Belum tersinkron'}</p>
                  </div>
                  <Badge variant={data.satusehat_organization_id ? 'secondary' : 'outline'} className="rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">
                    {data.satusehat_organization_id ? 'Tersinkron' : 'Draft'}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" className="rounded-none shadow-none text-xs" onClick={() => void handlePreview('organization')} disabled={actionLoading !== null || !(hasPermission('polyclinics.view') || hasPermission('settings.view'))}>
                    {actionLoading === 'organization-preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Preview
                  </Button>
                  <Button type="button" size="sm" className="rounded-none shadow-none text-xs" onClick={() => void handleSync('organization')} disabled={actionLoading !== null || !(hasPermission('polyclinics.update') || hasPermission('settings.update'))}>
                    {actionLoading === 'organization-sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border border-border/70 bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-foreground"><MapPin className="h-4 w-4" />Location</p>
                    <p className="break-all text-xs leading-5 text-muted-foreground">{data.satusehat_location_id || 'Belum tersinkron'}</p>
                  </div>
                  <Badge variant={data.satusehat_location_id ? 'secondary' : 'outline'} className="rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">
                    {data.satusehat_location_id ? 'Tersinkron' : 'Draft'}
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">Location memakai Organization poli sebagai managingOrganization.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" className="rounded-none shadow-none text-xs" onClick={() => void handlePreview('location')} disabled={actionLoading !== null || !(hasPermission('polyclinics.view') || hasPermission('settings.view'))}>
                    {actionLoading === 'location-preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Preview
                  </Button>
                  <Button type="button" size="sm" className="rounded-none shadow-none text-xs" onClick={() => void handleSync('location')} disabled={actionLoading !== null || !(hasPermission('polyclinics.update') || hasPermission('settings.update')) || !data.satusehat_organization_id}>
                    {actionLoading === 'location-sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync
                  </Button>
                </div>
                {!data.satusehat_organization_id ? <p className="text-xs leading-5 text-amber-700">Sync Location akan aktif setelah Organization poli berhasil tersinkron.</p> : null}
              </div>
            </div>
          </MasterDataSection>
        </div>
      </MasterDataPageShell>
    </>
  );
}