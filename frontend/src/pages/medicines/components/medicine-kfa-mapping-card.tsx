import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { KFAProductDetail } from '@/lib/api';
import { formatMasterDataDateTime } from '@/pages/master-data/shared';
import { Link2, Loader2, Pill, ShieldCheck, Syringe, Unlink2 } from 'lucide-react';

type MedicineKFAMappingCardProps = {
  kfaCode?: string;
  kfaName?: string;
  detail?: KFAProductDetail | null;
  loading?: boolean;
  medicationId?: string;
  medicationSyncedAt?: string;
  onPick?: () => void;
  onClear?: () => void;
  pickLabel?: string;
};

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return '-';
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-none border border-border/70 bg-background/90 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-foreground/95">{value || '-'}</p>
    </div>
  );
}

export function MedicineKFAMappingCard({
  kfaCode,
  kfaName,
  detail,
  loading = false,
  medicationId,
  medicationSyncedAt,
  onPick,
  onClear,
  pickLabel = 'Cari Produk KFA',
}: MedicineKFAMappingCardProps) {
  const hasMapping = Boolean((kfaCode || '').trim());
  const displayName = detail?.name || kfaName || '-';
  const ingredientItems = detail?.active_ingredients || [];

  return (
    <div className="rounded-none border border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(2,132,199,0.03),rgba(255,255,255,1))] p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={hasMapping ? 'default' : 'secondary'} className="rounded-none">
              {hasMapping ? 'Mapped ke KFA' : 'Belum ada mapping'}
            </Badge>
            {detail?.active ? <Badge variant="outline" className="rounded-none">Produk aktif</Badge> : null}
            {detail?.state ? <Badge variant="outline" className="rounded-none uppercase">{detail.state}</Badge> : null}
            {medicationId ? <Badge className="rounded-none border-0 bg-emerald-600 text-white">Medication SATUSEHAT siap</Badge> : null}
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground">{displayName}</h3>
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {hasMapping
                ? 'Produk KFA ini akan menjadi sumber identitas Medication SATUSEHAT, sementara master obat lokal tetap dipakai untuk stok dan harga.'
                : 'Pilih produk KFA resmi SATUSEHAT agar payload Medication, MedicationRequest, dan MedicationDispense tidak lagi bergantung pada kode obat lokal.'}
            </p>
          </div>
        </div>

        {(onPick || onClear) ? (
          <div className="flex flex-wrap items-center gap-2">
            {onPick ? (
              <Button type="button" onClick={onPick} className="rounded-none shadow-none">
                <ShieldCheck className="mr-2 h-4 w-4" />
                {hasMapping ? 'Ganti Mapping' : pickLabel}
              </Button>
            ) : null}
            {onClear && hasMapping ? (
              <Button type="button" variant="outline" onClick={onClear} className="rounded-none shadow-none">
                <Unlink2 className="mr-2 h-4 w-4" />
                Lepas Mapping
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!hasMapping ? (
        <div className="mt-4 rounded-none border border-dashed border-border/80 bg-background/80 px-4 py-5 text-sm text-muted-foreground">
          Belum ada produk KFA yang dipilih. Setelah mapping tersimpan, Anda bisa melihat bentuk sediaan, rute, bahan aktif, dan status Medication SATUSEHAT dari panel ini.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <div className="rounded-none border border-border/70 bg-background/90 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{displayName}</p>
                    <Badge variant="outline" className="rounded-none">KFA {kfaCode || '-'}</Badge>
                    {detail?.farmalkes_type?.name ? <Badge variant="outline" className="rounded-none">{detail.farmalkes_type.name}</Badge> : null}
                    {detail?.generik ? <Badge variant="outline" className="rounded-none">Generik</Badge> : null}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {detail?.product_template?.name || 'Template belum tersedia'}
                    {detail?.manufacturer ? ` · ${detail.manufacturer}` : ''}
                  </p>
                </div>

                <div className="text-right text-xs text-muted-foreground">
                  <p>Medication SATUSEHAT</p>
                  <p className="font-medium text-foreground">{medicationId || 'Belum tersinkron'}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <InfoTile label="Kode KFA" value={kfaCode || '-'} />
              <InfoTile label="Bentuk Sediaan" value={detail?.dosage_form?.name || '-'} />
              <InfoTile label="Rute Pemberian" value={detail?.rute_pemberian?.name || '-'} />
              <InfoTile label="Satuan KFA" value={detail?.uom?.name || '-'} />
              <InfoTile label="Harga HET" value={formatCurrency(detail?.het_price)} />
              <InfoTile label="Harga Fix" value={formatCurrency(detail?.fix_price)} />
            </div>

            <div className="rounded-none border border-border/70 bg-background/90 px-4 py-4">
              <div className="flex items-center gap-2">
                <Pill className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold tracking-tight">Bahan Aktif</p>
              </div>

              {ingredientItems.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Detail bahan aktif tidak tersedia dari lookup KFA ini.</p>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {ingredientItems.map((ingredient, index) => (
                    <div key={`${ingredient.kfa_code || ingredient.zat_aktif || 'ingredient'}-${index}`} className="rounded-none border border-border/70 bg-muted/10 px-3 py-3">
                      <p className="text-sm font-medium text-foreground">{ingredient.zat_aktif || '-'}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{ingredient.kekuatan_zat_aktif || 'Kekuatan belum tersedia'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-none border border-border/70 bg-background/90 px-4 py-4">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold tracking-tight">Status Integrasi</p>
              </div>
              <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Medication SATUSEHAT</p>
                  <p className="mt-1 font-medium text-foreground">{medicationId || 'Belum tersinkron'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sinkronisasi terakhir</p>
                  <p className="mt-1 font-medium text-foreground">{formatMasterDataDateTime(medicationSyncedAt)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pabrikan</p>
                  <p className="mt-1 font-medium text-foreground">{detail?.manufacturer || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Registrar</p>
                  <p className="mt-1 font-medium text-foreground">{detail?.registrar || '-'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-none border border-border/70 bg-background/90 px-4 py-4">
              <div className="flex items-center gap-2">
                <Syringe className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold tracking-tight">Template KFA</p>
              </div>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>
                  Nama template: <span className="font-medium text-foreground">{detail?.product_template?.name || '-'}</span>
                </p>
                <p>
                  Kode template: <span className="font-medium text-foreground">{detail?.product_template?.kfa_code || '-'}</span>
                </p>
                <p>
                  Update data: <span className="font-medium text-foreground">{formatMasterDataDateTime(detail?.updated_at)}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}