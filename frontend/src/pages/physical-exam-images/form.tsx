import { useEffect, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { resolveAssetUrl } from '@/lib/api';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

export type PhysicalExamImageFormData = {
  name: string;
  category: string;
  location: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
  file: File | null;
  imageUrl: string;
};

export const EMPTY_PHYSICAL_EXAM_IMAGE_FORM: PhysicalExamImageFormData = {
  name: '',
  category: '',
  location: '',
  description: '',
  sortOrder: '0',
  isActive: true,
  file: null,
  imageUrl: '',
};

export function buildPhysicalExamImageFormData(formData: PhysicalExamImageFormData) {
  const data = new FormData();
  data.append('name', formData.name);
  data.append('category', formData.category);
  data.append('location', formData.location);
  data.append('description', formData.description);
  data.append('sort_order', formData.sortOrder || '0');
  data.append('is_active', formData.isActive ? 'true' : 'false');

  if (formData.file) {
    data.append('file', formData.file);
  }

  return data;
}

type PhysicalExamImageFormProps = {
  title: string;
  description: string;
  submitLabel: string;
  loading: boolean;
  mode: 'create' | 'edit';
  formData: PhysicalExamImageFormData;
  setFormData: Dispatch<SetStateAction<PhysicalExamImageFormData>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};

export function PhysicalExamImageForm({
  title,
  description,
  submitLabel,
  loading,
  mode,
  formData,
  setFormData,
  onSubmit,
  onCancel,
}: PhysicalExamImageFormProps) {
  const formId = `physical-exam-image-${mode}-form`;
  const previewUrl = useMemo(() => {
    if (formData.file) {
      return URL.createObjectURL(formData.file);
    }

    return resolveAssetUrl(formData.imageUrl);
  }, [formData.file, formData.imageUrl]);

  useEffect(() => {
    if (!previewUrl.startsWith('blob:')) {
      return undefined;
    }

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <form id={formId} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title={title}
        subtitle={description}
        onBack={onCancel}
        actions={<Button type="submit" form={formId} disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitLabel}</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Preview" helper="Gambar referensi yang akan dipakai pada pemeriksaan fisik.">
                {previewUrl ? (
                  <div className="overflow-hidden rounded-lg border bg-muted/20">
                    <div className="aspect-[4/3]">
                      <img src={previewUrl} alt={formData.name || 'Preview template'} className="h-full w-full object-contain" />
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/10 text-center text-sm text-muted-foreground">
                    <ImagePlus className="mb-2 h-5 w-5" />
                    Belum ada gambar dipilih.
                  </div>
                )}

                <div className="space-y-1">
                  <p className="truncate font-medium">{formData.name || 'Nama template belum diisi'}</p>
                  <p className="text-muted-foreground">{formData.location || 'Lokasi belum diisi'}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {formData.category ? <Badge variant="outline">{formData.category}</Badge> : null}
                  <Badge variant={formData.isActive ? 'default' : 'secondary'}>{formData.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium">Nama Template</Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Contoh: Pemeriksaan Mulut"
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category" className="text-xs font-medium">Kategori</Label>
                <Input
                  id="category"
                  required
                  value={formData.category}
                  onChange={(event) => setFormData((current) => ({ ...current, category: event.target.value }))}
                  placeholder="Contoh: Kepala Leher"
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location" className="text-xs font-medium">Lokasi / Area</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(event) => setFormData((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Contoh: Mulut"
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sortOrder" className="text-xs font-medium">Urutan</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  min="0"
                  value={formData.sortOrder}
                  onChange={(event) => setFormData((current) => ({ ...current, sortOrder: event.target.value }))}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
              <Textarea
                id="description"
                rows={5}
                value={formData.description}
                onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
                placeholder="Deskripsikan area atau tujuan template, misalnya dipakai untuk menandai lesi, nyeri tekan, atau area pemeriksaan tertentu."
                className="text-sm"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_active" className="cursor-pointer text-xs font-medium">Status Aktif</Label>
                <p className="text-xs text-muted-foreground">
                  {formData.isActive ? 'Template aktif dan bisa dipilih di EMR' : 'Template disembunyikan dari pilihan EMR baru'}
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData((current) => ({ ...current, isActive: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file" className="text-xs font-medium">File Gambar</Label>
              <Input
                id="file"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                required={mode === 'create' && !formData.file && !formData.imageUrl}
                onChange={(event) => setFormData((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                className="h-10 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {mode === 'edit'
                  ? 'Biarkan kosong jika tidak ingin mengganti gambar saat ini.'
                  : 'Upload gambar anatomi, skema, atau area pemeriksaan yang akan dipakai sebagai template.'}
              </p>
            </div>
          </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}