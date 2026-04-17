import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { patientsApi, type Patient } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { formatDate } from '@/pages/emr/utils';
import { getPatientAddressLabel, getPatientAgeLabel, getPatientGenderLabel } from '@/pages/patients/shared';
import { isAxiosError } from 'axios';
import { FilterX, Loader2, Search, UserRoundSearch } from 'lucide-react';

type SearchFilterState = {
  q: string;
  parent_name: string;
  birth_date: string;
  address: string;
  rt: string;
  rw: string;
  kelurahan: string;
  kecamatan: string;
  city: string;
  province: string;
};

const FILTER_KEYS: Array<keyof SearchFilterState> = [
  'q',
  'parent_name',
  'birth_date',
  'address',
  'rt',
  'rw',
  'kelurahan',
  'kecamatan',
  'city',
  'province',
];

const EMPTY_FILTERS: SearchFilterState = {
  q: '',
  parent_name: '',
  birth_date: '',
  address: '',
  rt: '',
  rw: '',
  kelurahan: '',
  kecamatan: '',
  city: '',
  province: '',
};

function buildParamsFromFilters(filters: SearchFilterState) {
  const params = new URLSearchParams();

  FILTER_KEYS.forEach((key) => {
    const value = filters[key].trim();
    if (!value) {
      return;
    }
    params.set(key, value);
  });
  return params;
}

function buildFiltersFromParams(searchParams: URLSearchParams): SearchFilterState {
  return {
    q: searchParams.get('q') || '',
    parent_name: searchParams.get('parent_name') || '',
    birth_date: searchParams.get('birth_date') || '',
    address: searchParams.get('address') || '',
    rt: searchParams.get('rt') || '',
    rw: searchParams.get('rw') || '',
    kelurahan: searchParams.get('kelurahan') || '',
    kecamatan: searchParams.get('kecamatan') || '',
    city: searchParams.get('city') || '',
    province: searchParams.get('province') || '',
  };
}

function hasAnyCriteria(filters: SearchFilterState) {
  return FILTER_KEYS.some((key) => filters[key].trim() !== '');
}

export default function PatientSearchIndex() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const listQueryString = useMemo(() => {
    const value = searchParams.toString();
    return value ? `?${value}` : '';
  }, [searchParams]);

  const runSearch = useCallback(async (nextFilters: SearchFilterState) => {
    if (!hasAnyCriteria(nextFilters)) {
      setPatients([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = buildParamsFromFilters(nextFilters);
      const requestParams = new URLSearchParams(params);
      requestParams.set('page', '1');
      requestParams.set('per_page', '200');

      const response = await patientsApi.getAll(requestParams.toString());
      const list = response.data.data || [];
      setPatients(list);
      setTotal(Number(response.data.total || list.length));
    } catch (error: unknown) {
      setPatients([]);
      setTotal(0);
      toast({
        variant: 'destructive',
        title: 'Pencarian gagal',
        description: isAxiosError<{ error?: string }>(error)
          ? (error.response?.data?.error || 'Tidak dapat memuat data pasien.')
          : 'Tidak dapat memuat data pasien.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Pencarian Pasien Cepat');
  }, []);

  useEffect(() => {
    const nextFilters = buildFiltersFromParams(searchParams);
    setFilters(nextFilters);
    void runSearch(nextFilters);
  }, [runSearch, searchParams]);

  const updateFilter = (key: keyof SearchFilterState, value: string) => {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = buildParamsFromFilters(filters);
    setSearchParams(params);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchParams(new URLSearchParams());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 lg:p-5">
      <div className="space-y-4 border border-border/70 bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight">Pencarian Pasien Cepat</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Cari nama pasien atau No. Rekam Medis dari header, lalu persempit hasil dengan filter administratif.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <UserRoundSearch className="h-4 w-4" />
            <span>{total} data cocok</span>
          </div>
        </div>

        <form className="space-y-3" onSubmit={applyFilters}>
          <div className="grid gap-3 lg:grid-cols-4">
            <Input
              value={filters.q}
              onChange={(event) => updateFilter('q', event.target.value)}
              placeholder="Nama pasien / No. RM"
              className="rounded-none"
            />
            <Input
              value={filters.parent_name}
              onChange={(event) => updateFilter('parent_name', event.target.value)}
              placeholder="Nama orang tua / wali"
              className="rounded-none"
            />
            <Input
              value={filters.birth_date}
              onChange={(event) => updateFilter('birth_date', event.target.value)}
              type="date"
              className="rounded-none"
            />
            <Input
              value={filters.address}
              onChange={(event) => updateFilter('address', event.target.value)}
              placeholder="Alamat"
              className="rounded-none"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-6">
            <Input
              value={filters.rt}
              onChange={(event) => updateFilter('rt', event.target.value)}
              placeholder="RT"
              className="rounded-none"
            />
            <Input
              value={filters.rw}
              onChange={(event) => updateFilter('rw', event.target.value)}
              placeholder="RW"
              className="rounded-none"
            />
            <Input
              value={filters.kelurahan}
              onChange={(event) => updateFilter('kelurahan', event.target.value)}
              placeholder="Kelurahan"
              className="rounded-none"
            />
            <Input
              value={filters.kecamatan}
              onChange={(event) => updateFilter('kecamatan', event.target.value)}
              placeholder="Kecamatan"
              className="rounded-none"
            />
            <Input
              value={filters.city}
              onChange={(event) => updateFilter('city', event.target.value)}
              placeholder="Kabupaten / Kota"
              className="rounded-none"
            />
            <Input
              value={filters.province}
              onChange={(event) => updateFilter('province', event.target.value)}
              placeholder="Provinsi"
              className="rounded-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="rounded-none">
              <Search className="h-4 w-4" />
              Terapkan Filter
            </Button>
            <Button type="button" variant="outline" className="rounded-none" onClick={resetFilters}>
              <FilterX className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </form>
      </div>

      <div className="mt-4 overflow-hidden border border-border/70 bg-background">
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Memuat hasil pencarian...</span>
          </div>
        ) : !hasAnyCriteria(filters) ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Isi minimal 1 kriteria untuk mulai pencarian pasien.
          </div>
        ) : patients.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Tidak ada pasien yang cocok dengan filter saat ini.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. RM</TableHead>
                <TableHead>Nama Pasien</TableHead>
                <TableHead>Lahir / Usia</TableHead>
                <TableHead>JK</TableHead>
                <TableHead>Orang Tua / Wali</TableHead>
                <TableHead>Alamat Ringkas</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell className="font-mono text-xs">{patient.medical_record_number || '-'}</TableCell>
                  <TableCell className="font-medium">{patient.full_name || '-'}</TableCell>
                  <TableCell>
                    {patient.birth_date ? `${formatDate(patient.birth_date)} (${getPatientAgeLabel(patient.birth_date)})` : '-'}
                  </TableCell>
                  <TableCell>{getPatientGenderLabel(patient.gender)}</TableCell>
                  <TableCell>{patient.emergency_contact_name || '-'}</TableCell>
                  <TableCell className="max-w-[320px] truncate">{getPatientAddressLabel(patient)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-none"
                      onClick={() => navigate(`/patient-search/${patient.id}${listQueryString}`)}
                    >
                      Lihat Detail
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
