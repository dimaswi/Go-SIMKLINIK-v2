import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';

export type MedicalServiceParameterDraft = {
  client_id: string;
  id?: number;
  code: string;
  name: string;
  input_type: string;
  unit: string;
  reference_value_male: string;
  reference_value_female: string;
  sort_order: number;
  is_required: boolean;
};

const PARAMETER_INPUT_TYPE_OPTIONS = [
  { value: 'text', label: 'Teks Pendek' },
  { value: 'number', label: 'Angka' },
  { value: 'textarea', label: 'Teks Panjang' },
];

function buildClientId() {
  return `parameter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMedicalServiceParameterDraft(overrides?: Partial<MedicalServiceParameterDraft>): MedicalServiceParameterDraft {
  return {
    client_id: buildClientId(),
    code: '',
    name: '',
    input_type: 'text',
    unit: '',
    reference_value_male: '',
    reference_value_female: '',
    sort_order: 0,
    is_required: true,
    ...overrides,
  };
}

export function MedicalServiceParametersEditor({
  categoryName,
  parameters,
  onChange,
}: {
  categoryName?: string;
  parameters: MedicalServiceParameterDraft[];
  onChange: (parameters: MedicalServiceParameterDraft[]) => void;
}) {
  const normalizedCategoryName = (categoryName || '').toLowerCase();
  const helper = ['laboratorium', 'laboratory'].includes(normalizedCategoryName)
    ? 'Untuk laboratorium, isi parameter seperti HB, Leukosit, Trombosit, atau nilai panel lain yang memang harus diinput petugas.'
    : ['radiologi', 'radiology'].includes(normalizedCategoryName)
      ? 'Untuk radiologi, isi blok template hasil seperti Temuan, Kesan, dan Rekomendasi agar petugas tinggal mengisi sesuai format layanan.'
      : 'Parameter ini akan disnapshot ke order saat layanan dipilih, sehingga order lama tidak berubah saat master diperbarui.';

  const updateParameter = (clientId: string, updates: Partial<MedicalServiceParameterDraft>) => {
    onChange(parameters.map((parameter, index) => parameter.client_id === clientId ? {
      ...parameter,
      ...updates,
      sort_order: updates.sort_order ?? index + 1,
    } : parameter));
  };

  const removeParameter = (clientId: string) => {
    onChange(parameters.filter((parameter) => parameter.client_id !== clientId).map((parameter, index) => ({
      ...parameter,
      sort_order: index + 1,
    })));
  };

  const addParameter = () => {
    onChange([
      ...parameters,
      createMedicalServiceParameterDraft({ sort_order: parameters.length + 1 }),
    ]);
  };

  return (
    <section className="space-y-4 rounded-lg border border-border/80 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">Template Parameter</h2>
          <p className="text-xs leading-5 text-muted-foreground">{helper}</p>
        </div>
        <Button type="button" variant="outline" onClick={addParameter} className="h-9 rounded-md">
          <Plus className="mr-1.5 h-4 w-4" /> Tambah Parameter
        </Button>
      </div>

      {parameters.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 px-4 py-6 text-sm text-muted-foreground">
          Belum ada parameter. Tambahkan parameter agar petugas unit nanti tinggal mengisi hasil sesuai template layanan ini.
        </div>
      ) : (
        <div className="space-y-3">
          {parameters.map((parameter, index) => (
            <div key={parameter.client_id} className="rounded-lg border border-border/80 bg-background p-4">
              <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Parameter {index + 1}</p>
                  <p className="text-xs text-muted-foreground">Urutan ini akan dipakai juga saat snapshot ke order.</p>
                </div>
                <div className="flex items-center gap-3 self-start md:self-auto">
                  <div className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2">
                    <div className="space-y-0.5">
                      <Label className="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Wajib Diisi</Label>
                      <p className="text-xs text-muted-foreground">Harus lengkap sebelum order selesai.</p>
                    </div>
                    <Switch checked={parameter.is_required} onCheckedChange={(checked) => updateParameter(parameter.client_id, { is_required: checked })} />
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="rounded-md text-destructive" onClick={() => removeParameter(parameter.client_id)}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> Hapus
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 pt-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Kode</Label>
                  <Input value={parameter.code} onChange={(event) => updateParameter(parameter.client_id, { code: event.target.value })} placeholder="HB" className="h-10 text-sm" />
                </div>
                <div className="space-y-2 xl:col-span-2">
                  <Label className="text-xs font-medium">Nama Parameter</Label>
                  <Input value={parameter.name} onChange={(event) => updateParameter(parameter.client_id, { name: event.target.value })} placeholder="Hemoglobin" className="h-10 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Tipe Input</Label>
                  <SearchableSelect
                    options={PARAMETER_INPUT_TYPE_OPTIONS}
                    value={parameter.input_type}
                    onValueChange={(value) => updateParameter(parameter.client_id, { input_type: value })}
                    placeholder="Pilih tipe input"
                    searchPlaceholder="Cari tipe input..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Satuan</Label>
                  <Input value={parameter.unit} onChange={(event) => updateParameter(parameter.client_id, { unit: event.target.value })} placeholder="g/dL" className="h-10 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Nilai Rujukan Laki-laki</Label>
                  <Input value={parameter.reference_value_male} onChange={(event) => updateParameter(parameter.client_id, { reference_value_male: event.target.value })} placeholder="13 - 17" className="h-10 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Nilai Rujukan Perempuan</Label>
                  <Input value={parameter.reference_value_female} onChange={(event) => updateParameter(parameter.client_id, { reference_value_female: event.target.value })} placeholder="12 - 15" className="h-10 text-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}