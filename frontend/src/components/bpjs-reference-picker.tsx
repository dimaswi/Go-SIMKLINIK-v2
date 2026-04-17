import { useEffect, useMemo, useState } from 'react';

import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  bpjsBridgeApi,
  type BpjsReferenceDoctor,
  type BpjsReferencePoli,
} from '@/lib/api';
import { getLocalISODate } from '@/lib/utils';

interface BpjsReferencePickerProps {
  type: 'poli' | 'dokter';
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function BpjsReferencePicker({ type, value, onValueChange, disabled = false }: BpjsReferencePickerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [poliReferences, setPoliReferences] = useState<BpjsReferencePoli[]>([]);
  const [doctorReferences, setDoctorReferences] = useState<BpjsReferenceDoctor[]>([]);

  const loadReferences = async () => {
    setLoading(true);
    setError('');
    try {
      if (type === 'poli') {
        const response = await bpjsBridgeApi.getPoliReferences({ date: getLocalISODate() });
        setPoliReferences(response.data.data || []);
        return;
      }

      const response = await bpjsBridgeApi.getDoctorReferences({ date: getLocalISODate() });
      setDoctorReferences(response.data.data || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Gagal memuat referensi BPJS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReferences();
  }, [type]);

  const options = useMemo(() => {
    if (type === 'poli') {
      return poliReferences.map((item) => ({
        value: item.kodepoli,
        label: [item.kodepoli, item.namapoli, item.nmsubspesialis].filter(Boolean).join(' - '),
      }));
    }

    return doctorReferences.map((item) => ({
      value: String(item.kodedokter),
      label: [item.kodedokter, item.namadokter, item.jampraktek].filter(Boolean).join(' - '),
    }));
  }, [doctorReferences, poliReferences, type]);

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-xs font-medium">
            {type === 'poli' ? 'Cari Referensi Poli BPJS' : 'Cari Referensi Dokter BPJS'}
          </Label>
          <p className="text-xs text-muted-foreground">
            {type === 'poli'
              ? 'Daftar diambil dari WS BPJS Antrean FKTP berdasarkan tanggal hari ini.'
              : 'Daftar dokter diambil dari WS BPJS Antrean FKTP berdasarkan tanggal hari ini.'}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="rounded-none shadow-none" onClick={() => void loadReferences()} disabled={disabled || loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Muat Ulang
        </Button>
      </div>

      <SearchableSelect
        options={options}
        value={value}
        onValueChange={onValueChange}
        placeholder={type === 'poli' ? 'Pilih referensi poli BPJS...' : 'Pilih referensi dokter BPJS...'}
        searchPlaceholder={type === 'poli' ? 'Cari kode atau nama poli BPJS...' : 'Cari kode atau nama dokter BPJS...'}
        emptyText={loading ? 'Sedang memuat referensi...' : 'Referensi BPJS tidak ditemukan.'}
        disabled={disabled || loading}
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}