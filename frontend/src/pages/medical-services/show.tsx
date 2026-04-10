import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { medicalServicesApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { Edit, Loader2, Trash2 } from 'lucide-react';
import {
  MasterDataAsideSection,
  MasterDataAsideStack,
  MasterDataDetailItem,
  MasterDataPageShell,
  MasterDataSection,
  formatMasterDataDateTime,
} from '@/pages/master-data/shared';

function formatCurrency(value?: number) {
  if (typeof value !== 'number') return '-';
  return `Rp ${value.toLocaleString('id-ID')}`;
}

const SERVICE_DOMAIN_LABELS: Record<string, string> = {
  general: 'Umum',
  dental: 'Dental',
  laboratory: 'Laboratorium',
  radiology: 'Radiologi',
};

const TARGET_SCOPE_LABELS: Record<string, string> = {
  none: 'Tanpa target',
  full_mouth: 'Seluruh mulut',
  arch: 'Rahang',
  quadrant: 'Kuadran',
  tooth: 'Gigi',
  surface: 'Permukaan',
};

type ParameterSummary = {
  key: number;
  title: string;
  code: string;
  inputType: string;
  unit: string;
  referenceValue: string;
  isRequired: boolean;
};

type SpecimenSummary = {
  key: number;
  title: string;
  templateId?: number;
  templateName: string;
  typeDisplay: string;
  collectionMethod: string;
  notes: string;
  isDefault: boolean;
};

export default function MedicalServiceShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setPageTitle('Detail Layanan Medis');
    medicalServicesApi.getById(Number(id))
      .then((response) => setData(response.data.data))
      .catch(() => toast({ variant: 'destructive', title: 'Error!' }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await medicalServicesApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!' });
      setTimeout(() => navigate('/medical-services'), 500);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal.' });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Data tidak ditemukan</p><Button onClick={() => navigate('/medical-services')} className="mt-5">Kembali</Button></div></div>;
  }

  const parameterSummaries: ParameterSummary[] = (data.parameters || []).map((parameter: any, index: number) => ({
    key: parameter.id || index,
    title: parameter.name || `Parameter ${index + 1}`,
    code: parameter.code || '-',
    inputType: parameter.input_type || '-',
    unit: parameter.unit || '-',
    referenceValue: [parameter.reference_value_male, parameter.reference_value_female].filter(Boolean).join(' / ') || '-',
    isRequired: parameter.is_required === true,
  }));

  const specimenSummaries: SpecimenSummary[] = (data.specimen_options || []).map((option: any, index: number) => ({
    key: option.id || index,
    title: option.is_default ? `Specimen ${index + 1} · Default` : `Specimen ${index + 1}`,
    templateId: option.specimen_template?.id || option.specimen_template_id || undefined,
    templateName: option.specimen_template?.name || '-',
    typeDisplay: option.specimen_template?.type_display || option.specimen_template?.type_code || '-',
    collectionMethod: option.specimen_template?.collection_method_display || option.specimen_template?.collection_method_code || '-',
    notes: option.notes || '',
    isDefault: option.is_default === true,
  }));

  return (
    <>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Layanan" description="Yakin hapus layanan ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />

      <MasterDataPageShell
        title={data.name}
        subtitle={data.description || 'Ringkasan layanan medis dan template parameternya.'}
        onBack={() => navigate('/medical-services')}
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
            <span>Kategori {data.category?.name || '-'}</span>
            <span>Poliklinik {data.polyclinic?.name || 'Semua'}</span>
          </>
        }
        actions={
          <>
            {hasPermission('medical_services.update') && <Button className="rounded-none shadow-none" onClick={() => navigate(`/medical-services/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>}
            {hasPermission('medical_services.delete') && <Button variant="destructive" className="rounded-none shadow-none" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button>}
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan Tarif" helper="Tarif dan status aktif layanan medis.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Status: <span className="font-medium text-foreground">{data.is_active ? 'Aktif' : 'Tidak aktif'}</span></p>
                  <p>Tarif: <span className="font-medium text-foreground">{formatCurrency(data.price)}</span></p>
                  <p>Domain: <span className="font-medium text-foreground">{SERVICE_DOMAIN_LABELS[data.service_domain || 'general'] || data.service_domain || '-'}</span></p>
                  <p>Target: <span className="font-medium text-foreground">{TARGET_SCOPE_LABELS[data.target_scope || 'none'] || data.target_scope || '-'}</span></p>
                  {data.service_domain === 'laboratory' ? <p>Specimen: <span className="font-medium text-foreground">{(data.specimen_options || []).length} opsi</span></p> : null}
                </div>
              </MasterDataAsideSection>
            </div>
            {data.service_domain === 'laboratory' ? (
              <div>
                <MasterDataAsideSection title="Mapping Specimen" helper="Ringkasan template specimen yang aktif untuk layanan laboratorium ini.">
                  {specimenSummaries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Belum ada specimen option.</p>
                  ) : (
                    <div className="space-y-4">
                      {specimenSummaries.map((item) => (
                        <div key={item.key} className="space-y-1.5 border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.title}</p>
                          <p className="text-sm font-medium">{item.templateName}</p>
                          <p className="text-xs text-muted-foreground">SNOMED Type: {item.typeDisplay}</p>
                          <p className="text-xs text-muted-foreground">Collection Method: {item.collectionMethod}</p>
                          {item.notes ? <p className="text-xs text-muted-foreground">Catatan: {item.notes}</p> : null}
                          {item.templateId ? <Link to={`/specimen-templates/${item.templateId}`} className="inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline">Lihat detail template</Link> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </MasterDataAsideSection>
              </div>
            ) : null}
            <div>
              <MasterDataAsideSection title="Metadata" helper="Riwayat pencatatan layanan medis.">
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
          <MasterDataSection title="Informasi Layanan" helper="Identitas dasar layanan medis yang dipakai dalam transaksi dan pemeriksaan.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MasterDataDetailItem label="Kode" value={data.code || '-'} />
              <MasterDataDetailItem label="Nama" value={data.name} />
              <MasterDataDetailItem label="Kategori" value={data.category?.name || '-'} />
              <MasterDataDetailItem label="Poliklinik" value={data.polyclinic?.name || 'Semua'} />
              <MasterDataDetailItem label="Domain Layanan" value={SERVICE_DOMAIN_LABELS[data.service_domain || 'general'] || data.service_domain || '-'} />
              <MasterDataDetailItem label="Target Anatomi" value={TARGET_SCOPE_LABELS[data.target_scope || 'none'] || data.target_scope || '-'} />
              <MasterDataDetailItem label="Tarif" value={formatCurrency(data.price)} />
              <MasterDataDetailItem label="Butuh Consent" value={data.requires_consent ? 'Ya' : 'Tidak'} />
              <MasterDataDetailItem label="Sinkron Odontogram" value={data.supports_odontogram_sync ? 'Ya' : 'Tidak'} />
              <MasterDataDetailItem label="Status" value={data.is_active ? 'Aktif' : 'Tidak aktif'} />
              <MasterDataDetailItem label="Deskripsi" value={data.description || '-'} />
            </div>
          </MasterDataSection>

          <MasterDataSection title="Template Parameter" helper="Parameter hasil atau komponen input yang terkait dengan layanan ini.">
            {parameterSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada parameter template pada layanan ini.</p>
            ) : (
              <div className="space-y-3">
                {parameterSummaries.map((parameter, index) => (
                  <div key={parameter.key} className="rounded-lg border border-border/80 bg-background p-4">
                    <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Parameter {index + 1}</p>
                        <p className="text-xs text-muted-foreground">{parameter.title}</p>
                      </div>
                      <span className="inline-flex items-center self-start rounded-sm border border-border/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:self-auto">
                        {parameter.isRequired ? 'Wajib' : 'Opsional'}
                      </span>
                    </div>
                    <div className="grid gap-4 pt-4 md:grid-cols-2 xl:grid-cols-4">
                      <MasterDataDetailItem label="Kode" value={parameter.code} />
                      <MasterDataDetailItem label="Tipe Input" value={parameter.inputType} />
                      <MasterDataDetailItem label="Satuan" value={parameter.unit} />
                      <MasterDataDetailItem label="Nilai Rujukan" value={parameter.referenceValue} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </MasterDataSection>

          {data.service_domain === 'laboratory' ? (
            <MasterDataSection title="Template Specimen" helper="Specimen default atau pilihan specimen yang akan diturunkan otomatis ke order laboratorium.">
              {specimenSummaries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada specimen option pada layanan ini.</p>
              ) : (
                <div className="space-y-3">
                  {specimenSummaries.map((option, index) => (
                    <div key={option.key} className="rounded-lg border border-border/80 bg-background p-4">
                      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Specimen {index + 1}</p>
                          <p className="text-xs text-muted-foreground">{option.templateName}</p>
                        </div>
                        <div className="flex items-center gap-3 self-start md:self-auto">
                          {option.templateId ? <Link to={`/specimen-templates/${option.templateId}`} className="inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline">Buka template</Link> : null}
                          <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${option.isDefault ? 'border border-transparent bg-secondary text-secondary-foreground' : 'border border-border/70 text-muted-foreground'}`}>
                            {option.isDefault ? 'Default' : 'Opsional'}
                          </span>
                        </div>
                      </div>
                      <div className="grid gap-4 pt-4 md:grid-cols-2 xl:grid-cols-3">
                        <MasterDataDetailItem label="SNOMED Type" value={option.typeDisplay} />
                        <MasterDataDetailItem label="Collection Method" value={option.collectionMethod} />
                        <MasterDataDetailItem label="Catatan" value={option.notes || '-'} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </MasterDataSection>
          ) : null}
        </div>
      </MasterDataPageShell>
    </>
  );
}