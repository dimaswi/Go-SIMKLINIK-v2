import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import type { SpecimenTemplate } from '@/lib/api';

export type MedicalServiceSpecimenDraft = {
  client_id: string;
  id?: number;
  specimen_template_id: number;
  sort_order: number;
  is_default: boolean;
  notes: string;
};

function buildClientId() {
  return `specimen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMedicalServiceSpecimenDraft(overrides?: Partial<MedicalServiceSpecimenDraft>): MedicalServiceSpecimenDraft {
  return {
    client_id: buildClientId(),
    specimen_template_id: 0,
    sort_order: 0,
    is_default: false,
    notes: '',
    ...overrides,
  };
}

export function MedicalServiceSpecimenEditor({
  visible,
  templates,
  specimenOptions,
  onChange,
}: {
  visible: boolean;
  templates: SpecimenTemplate[];
  specimenOptions: MedicalServiceSpecimenDraft[];
  onChange: (specimenOptions: MedicalServiceSpecimenDraft[]) => void;
}) {
  const templateOptions = templates
    .filter((template) => template.is_active)
    .map((template) => ({
      value: String(template.id),
      label: `${template.name}${template.type_display ? ` · ${template.type_display}` : ''}`,
    }));

  const updateOption = (clientId: string, updates: Partial<MedicalServiceSpecimenDraft>) => {
    const nextOptions = specimenOptions.map((option, index) => option.client_id === clientId ? {
      ...option,
      ...updates,
      sort_order: updates.sort_order ?? index + 1,
    } : option);

    if (updates.is_default) {
      onChange(nextOptions.map((option) => ({
        ...option,
        is_default: option.client_id === clientId,
      })));
      return;
    }

    onChange(nextOptions);
  };

  const removeOption = (clientId: string) => {
    const nextOptions = specimenOptions
      .filter((option) => option.client_id !== clientId)
      .map((option, index) => ({
        ...option,
        sort_order: index + 1,
      }));

    if (nextOptions.length === 1 && !nextOptions[0].is_default) {
      nextOptions[0].is_default = true;
    }

    onChange(nextOptions);
  };

  const addOption = () => {
    onChange([
      ...specimenOptions,
      createMedicalServiceSpecimenDraft({ sort_order: specimenOptions.length + 1, is_default: specimenOptions.length === 0 }),
    ]);
  };

  if (!visible) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-lg border border-border/80 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">Template Specimen</h2>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">Pilih template specimen yang valid untuk layanan laboratorium. Mapping SNOMED tetap dikelola di master template, sementara layanan ini hanya memilih opsi yang boleh dipakai.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild className="h-9 rounded-md">
            <Link to="/specimen-templates">Kelola Mapping SNOMED</Link>
          </Button>
          <Button type="button" onClick={addOption} className="h-9 rounded-md">
            <Plus className="mr-1.5 h-4 w-4" /> Tambah Specimen
          </Button>
        </div>
      </div>

      {specimenOptions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 px-4 py-6 text-sm text-muted-foreground">
          Belum ada specimen option. Tambahkan satu specimen default agar order laboratorium bisa langsung membentuk specimen transaksi.
        </div>
      ) : (
        <div className="space-y-3">
          {specimenOptions.map((option, index) => {
            const selectedTemplate = templates.find((template) => template.id === option.specimen_template_id);

            return (
              <div key={option.client_id} className="rounded-lg border border-border/80 bg-background p-4">
                <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">Specimen {index + 1}</p>
                      {option.is_default ? <span className="inline-flex items-center rounded-sm border border-transparent bg-secondary px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">Default</span> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">Template ini akan diturunkan menjadi specimen transaksi saat order laboratorium dibuat.</p>
                  </div>
                  <div className="flex items-center gap-3 self-start md:self-auto">
                    <div className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2">
                      <div className="space-y-0.5">
                        <Label className="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Default</Label>
                        <p className="text-xs text-muted-foreground">Dipakai otomatis saat order.</p>
                      </div>
                      <Switch checked={option.is_default} onCheckedChange={(checked) => updateOption(option.client_id, { is_default: checked })} />
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="rounded-md text-destructive" onClick={() => removeOption(option.client_id)}>
                      <Trash2 className="mr-1.5 h-4 w-4" /> Hapus
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 pt-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Template Specimen</Label>
                    <SearchableSelect
                      options={templateOptions}
                      value={option.specimen_template_id ? String(option.specimen_template_id) : ''}
                      onValueChange={(value) => updateOption(option.client_id, { specimen_template_id: Number(value) })}
                      placeholder="Pilih template specimen"
                      searchPlaceholder="Cari template specimen..."
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      {selectedTemplate
                        ? `${selectedTemplate.type_display || selectedTemplate.type_code || 'SNOMED type belum diisi'}${selectedTemplate.collection_method_display ? ` · ${selectedTemplate.collection_method_display}` : ''}`
                        : 'Pilih template untuk memetakan specimen transaksi layanan ini.'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Catatan Opsi</Label>
                    <Input value={option.notes} onChange={(event) => updateOption(option.client_id, { notes: event.target.value })} className="h-10 text-sm" placeholder="Contoh: default untuk CBC standar" />
                    <p className="text-xs leading-5 text-muted-foreground">Catatan ini membantu petugas memahami kapan specimen ini dipakai, tetapi tidak mengubah mapping SNOMED.</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}