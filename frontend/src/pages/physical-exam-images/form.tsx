import { useEffect, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { resolveAssetUrl } from '@/lib/api';
import { MasterDataPageShell } from '@/pages/master-data/shared';

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
    <form id={formId} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title={title}
        subtitle={description}
        onBack={onCancel}
        actions={
          <Button type="submit" form={formId} disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {submitLabel}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Detail Template Gambar</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium">Nama Template *</Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Contoh: Pemeriksaan Mulut"
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="category" className="text-xs font-medium">Kategori *</Label>
                <Input
                  id="category"
                  required
                  value={formData.category}
                  onChange={(event) => setFormData((current) => ({ ...current, category: event.target.value }))}
                  placeholder="Contoh: Kepala Leher"
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="location" className="text-xs font-medium">Lokasi / Area</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(event) => setFormData((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Contoh: Mulut"
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="sortOrder" className="text-xs font-medium">Urutan</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  min="0"
                  value={formData.sortOrder}
                  onChange={(event) => setFormData((current) => ({ ...current, sortOrder: event.target.value }))}
                  className="h-9 text-xs font-mono rounded-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 pt-1">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="description" className="text-xs font-medium">Deskripsi</Label>
                  <Textarea
                    id="description"
                    rows={3}
                    value={formData.description}
                    onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Deskripsi tujuan template..."
                    className="text-xs rounded-none"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="file" className="text-xs font-medium">File Gambar</Label>
                  <Input
                    id="file"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                    required={mode === 'create' && !formData.file && !formData.imageUrl}
                    onChange={(event) => setFormData((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                    className="h-9 text-xs rounded-none cursor-pointer file:text-xs file:font-medium"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {mode === 'edit'
                      ? 'Kosongkan jika tidak mengganti gambar saat ini.'
                      : 'Upload gambar anatomi atau bagan pemeriksaan.'}
                  </p>
                </div>

                <div className="flex items-center justify-between border border-border/70 p-2.5 bg-muted/10">
                  <div>
                    <Label htmlFor="is_active" className="cursor-pointer text-xs font-medium">Status Aktif</Label>
                    <p className="text-[11px] text-muted-foreground">
                      {formData.isActive ? 'Template aktif di EMR' : 'Template disembunyikan dari pilihan baru'}
                    </p>
                  </div>
                  <Switch
                    id="is_active"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData((current) => ({ ...current, isActive: checked }))}
                  />
                </div>
              </div>

              <div className="border border-border/70 p-2 bg-muted/10 flex flex-col items-center justify-center min-h-[140px]">
                {previewUrl ? (
                  <div className="w-full h-full max-h-[160px] flex items-center justify-center overflow-hidden">
                    <img src={previewUrl} alt={formData.name || 'Preview template'} className="max-h-[150px] w-full object-contain" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-3 text-muted-foreground">
                    <ImagePlus className="h-6 w-6 mb-1 text-muted-foreground/60" />
                    <span className="text-[11px]">Belum ada gambar</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}