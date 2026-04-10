import { useEffect, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { regionsApi, type Patient, type RegionDistrict, type RegionProvince, type RegionRegency, type RegionVillage } from '@/lib/api';
import { compactAddress, getPatientAge } from '@/pages/emr/utils';

type SelectOption = { value: string; label: string };

export const GENDER_OPTIONS = [
  { value: 'L', label: 'Laki-laki' },
  { value: 'P', label: 'Perempuan' },
];

export const BLOOD_TYPES = ['A', 'B', 'AB', 'O', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((value) => ({
  value,
  label: value,
}));

export const MARITAL_OPTIONS = [
  { value: 'belum_menikah', label: 'Belum Menikah' },
  { value: 'menikah', label: 'Menikah' },
  { value: 'cerai_hidup', label: 'Cerai Hidup' },
  { value: 'cerai_mati', label: 'Cerai Mati' },
];

export const RELIGION_OPTIONS = [
  { value: 'islam', label: 'Islam' },
  { value: 'kristen', label: 'Kristen' },
  { value: 'katolik', label: 'Katolik' },
  { value: 'hindu', label: 'Hindu' },
  { value: 'buddha', label: 'Buddha' },
  { value: 'konghucu', label: 'Konghucu' },
];

export const INSURANCE_OPTIONS = [
  { value: 'umum', label: 'Umum (Mandiri)' },
  { value: 'bpjs', label: 'BPJS Kesehatan' },
  { value: 'asuransi', label: 'Asuransi Swasta' },
];

export const EDUCATION_OPTIONS: SelectOption[] = [
  { value: 'Tidak Sekolah', label: 'Tidak Sekolah' },
  { value: 'SD', label: 'SD' },
  { value: 'SMP', label: 'SMP' },
  { value: 'SMA', label: 'SMA' },
  { value: 'SMK', label: 'SMK' },
  { value: 'D1', label: 'D1' },
  { value: 'D2', label: 'D2' },
  { value: 'D3', label: 'D3' },
  { value: 'D4', label: 'D4' },
  { value: 'S1', label: 'S1' },
  { value: 'S2', label: 'S2' },
  { value: 'S3', label: 'S3' },
];

export const OCCUPATION_OPTIONS: SelectOption[] = [
  { value: 'Pelajar / Mahasiswa', label: 'Pelajar / Mahasiswa' },
  { value: 'Ibu Rumah Tangga', label: 'Ibu Rumah Tangga' },
  { value: 'PNS', label: 'PNS' },
  { value: 'TNI / Polri', label: 'TNI / Polri' },
  { value: 'Pegawai Swasta', label: 'Pegawai Swasta' },
  { value: 'Wiraswasta', label: 'Wiraswasta' },
  { value: 'Petani', label: 'Petani' },
  { value: 'Nelayan', label: 'Nelayan' },
  { value: 'Buruh', label: 'Buruh' },
  { value: 'Tenaga Kesehatan', label: 'Tenaga Kesehatan' },
  { value: 'Guru / Dosen', label: 'Guru / Dosen' },
  { value: 'Pensiunan', label: 'Pensiunan' },
  { value: 'Belum Bekerja', label: 'Belum Bekerja' },
  { value: 'Lainnya', label: 'Lainnya' },
];

const INSURANCE_LABELS: Record<string, string> = {
  umum: 'Umum (Mandiri)',
  bpjs: 'BPJS Kesehatan',
  asuransi: 'Asuransi Swasta',
};

export type PatientFormData = {
  nik: string;
  full_name: string;
  birth_date: string;
  birth_place: string;
  gender: string;
  blood_type: string;
  marital_status: string;
  religion: string;
  education: string;
  occupation: string;
  address: string;
  rt: string;
  rw: string;
  kelurahan: string;
  kecamatan: string;
  city: string;
  province: string;
  postal_code: string;
  phone: string;
  email: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  insurance_type: string;
  insurance_number: string;
  allergies: string;
  notes: string;
};

export const EMPTY_PATIENT_FORM_DATA: PatientFormData = {
  nik: '',
  full_name: '',
  birth_date: '',
  birth_place: '',
  gender: '',
  blood_type: '',
  marital_status: '',
  religion: '',
  education: '',
  occupation: '',
  address: '',
  rt: '',
  rw: '',
  kelurahan: '',
  kecamatan: '',
  city: '',
  province: '',
  postal_code: '',
  phone: '',
  email: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relation: '',
  insurance_type: 'umum',
  insurance_number: '',
  allergies: '',
  notes: '',
};

export function mapPatientToFormData(patient: Patient): PatientFormData {
  return {
    nik: patient.nik || '',
    full_name: patient.full_name || '',
    birth_date: patient.birth_date ? patient.birth_date.split('T')[0] : '',
    birth_place: patient.birth_place || '',
    gender: patient.gender || '',
    blood_type: patient.blood_type || '',
    marital_status: patient.marital_status || '',
    religion: patient.religion || '',
    education: patient.education || '',
    occupation: patient.occupation || '',
    address: patient.address || '',
    rt: patient.rt || '',
    rw: patient.rw || '',
    kelurahan: patient.kelurahan || '',
    kecamatan: patient.kecamatan || '',
    city: patient.city || '',
    province: patient.province || '',
    postal_code: patient.postal_code || '',
    phone: patient.phone || '',
    email: patient.email || '',
    emergency_contact_name: patient.emergency_contact_name || '',
    emergency_contact_phone: patient.emergency_contact_phone || '',
    emergency_contact_relation: patient.emergency_contact_relation || '',
    insurance_type: patient.insurance_type || 'umum',
    insurance_number: patient.insurance_number || '',
    allergies: patient.allergies || '',
    notes: patient.notes || '',
  };
}

export function getPatientGenderLabel(gender?: string) {
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label || '-';
}

export function getPatientInsuranceLabel(insuranceType?: string) {
  return INSURANCE_LABELS[insuranceType || 'umum'] || insuranceType || '-';
}

export function getPatientAgeLabel(birthDate?: string) {
  const age = getPatientAge(birthDate);
  return age !== null ? `${age} tahun` : '-';
}

export function getPatientAddressLabel(patient: Partial<PatientFormData> | Partial<Patient>) {
  return compactAddress([
    patient.address,
    patient.kelurahan,
    patient.kecamatan,
    patient.city,
    patient.province,
  ]) || '-';
}

export function getPatientEmergencyLabel(patient: Partial<PatientFormData> | Partial<Patient>) {
  const parts = [patient.emergency_contact_name, patient.emergency_contact_relation].map((value) => (value || '').trim()).filter(Boolean);
  const phone = (patient.emergency_contact_phone || '').trim();
  const label = parts.join(' · ');

  if (label && phone) {
    return `${label} (${phone})`;
  }
  return label || phone || '-';
}

type PatientSatusehatChecklistItem = {
  label: string;
  ready: boolean;
  hint: string;
};

type PatientLike = Partial<PatientFormData> | Partial<Patient>;

export function getPatientSatusehatChecklist(patient: PatientLike): PatientSatusehatChecklistItem[] {
  const nik = (patient.nik || '').trim();
  const birthDate = extractBirthDateValue(patient.birth_date);
  const addressFields = [patient.address, patient.province, patient.city, patient.kecamatan, patient.kelurahan]
    .map((value) => (value || '').trim());

  return [
    {
      label: 'Identitas nasional',
      ready: nik.length === 16,
      hint: nik ? `NIK ${nik}` : 'Isi NIK 16 digit untuk pemetaan MPI.',
    },
    {
      label: 'Nama pasien',
      ready: Boolean((patient.full_name || '').trim()),
      hint: (patient.full_name || '').trim() || 'Nama lengkap belum diisi.',
    },
    {
      label: 'Tanggal lahir',
      ready: Boolean(birthDate),
      hint: birthDate || 'Tanggal lahir belum tersedia.',
    },
    {
      label: 'Tempat lahir',
      ready: Boolean((patient.birth_place || '').trim()),
      hint: (patient.birth_place || '').trim() || 'Tempat lahir dibutuhkan untuk extension birthPlace.',
    },
    {
      label: 'Alamat administratif',
      ready: addressFields.every(Boolean),
      hint: addressFields.every(Boolean) ? getPatientAddressLabel(patient) : 'Lengkapi alamat, provinsi, kota, kecamatan, dan kelurahan.',
    },
  ];
}

export function getPatientSatusehatReadyCount(patient: PatientLike) {
  return getPatientSatusehatChecklist(patient).filter((item) => item.ready).length;
}

export function isPatientSatusehatReady(patient: PatientLike) {
  return getPatientSatusehatChecklist(patient).every((item) => item.ready);
}

function extractBirthDateValue(value?: string | null) {
  return (value || '').split('T')[0];
}

export function PatientPageShell({
  title,
  subtitle,
  badges,
  meta,
  actions,
  aside,
  children,
  onBack,
}: {
  title: string;
  subtitle: string;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="px-4 py-3 lg:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-[15px] font-semibold tracking-tight lg:text-base">{title}</h1>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
              {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{meta}</div> : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="outline" type='button' className="rounded-none shadow-none" onClick={onBack}>Kembali</Button>
              {actions}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 overflow-auto px-4 py-4 lg:px-5">
        <div className={aside ? 'grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]' : ''}>
          <div className="overflow-hidden border border-border/70 bg-background">
            <div className="min-w-0 bg-background">{children}</div>
          </div>

          {aside ? (
            <aside className="overflow-hidden border border-border/70 bg-background xl:sticky xl:top-0 xl:self-start">
              {aside}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PatientPanelSection({ title, helper, children }: { title: string; helper?: string; children: ReactNode }) {
  return (
    <section className="px-4 py-4">
      <div className="flex items-start gap-3 border-b border-border/60 pb-3">
        <div className="mt-0.5 h-9 w-1 shrink-0 bg-primary/70" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {helper ? <p className="text-[11px] leading-5 text-muted-foreground">{helper}</p> : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function PatientSection({ title, helper, children }: { title: string; helper?: string; children: ReactNode }) {
  return (
    <section className="px-4 py-4 lg:px-5 lg:py-5">
      <div className="flex items-start gap-3 border-b border-border/60 pb-4">
        <div className="mt-0.5 h-10 w-1.5 shrink-0 bg-primary/80" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {helper ? <p className="text-[11px] leading-5 text-muted-foreground">{helper}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function PatientFormField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
}: {
  label: string;
  name: keyof PatientFormData;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={String(name)} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <Input
        id={String(name)}
        name={String(name)}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="rounded-none"
      />
    </div>
  );
}

export function PatientSelectField({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  noneLabel,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  noneLabel?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <SearchableSelect
        options={options}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        noneLabel={noneLabel}
        disabled={disabled}
        square
      />
    </div>
  );
}

export function PatientTextareaField({
  label,
  name,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  name: keyof PatientFormData;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={String(name)} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </Label>
      <Textarea
        id={String(name)}
        name={String(name)}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="rounded-none"
      />
    </div>
  );
}

function buildUniqueOptions(values: Array<string | undefined>, fallbackValue?: string): SelectOption[] {
  const seen = new Map<string, string>();

  values.forEach((value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      return;
    }

    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, trimmed);
    }
  });

  const fallbackTrimmed = (fallbackValue || '').trim();
  if (fallbackTrimmed) {
    const fallbackKey = fallbackTrimmed.toLowerCase();
    if (!seen.has(fallbackKey)) {
      seen.set(fallbackKey, fallbackTrimmed);
    }
  }

  return Array.from(seen.values())
    .sort((left, right) => left.localeCompare(right, 'id'))
    .map((value) => ({ value, label: value }));
}

function normalizeRegionText(value?: string) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/^(kabupaten|kab\.|kota)\s+/i, '')
    .replace(/[.'"]/g, '')
    .replace(/\s+/g, ' ');
}

function buildRegionSelectOptions(items: Array<{ id: number; name: string }>): SelectOption[] {
  return items.map((item) => ({
    value: String(item.id),
    label: item.name,
  }));
}

function findRegionByName<T extends { id: number; name: string }>(items: T[], name: string) {
  const normalizedTarget = normalizeRegionText(name);
  if (!normalizedTarget) {
    return null;
  }

  return items.find((item) => normalizeRegionText(item.name) === normalizedTarget) || null;
}

export function PatientFormSections({
  formData,
  setField,
  onInputChange,
  onTextareaChange,
}: {
  formData: PatientFormData;
  setField: (field: keyof PatientFormData, value: string) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTextareaChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  const [provinces, setProvinces] = useState<RegionProvince[]>([]);
  const [birthRegencies, setBirthRegencies] = useState<RegionRegency[]>([]);
  const [regencies, setRegencies] = useState<RegionRegency[]>([]);
  const [districts, setDistricts] = useState<RegionDistrict[]>([]);
  const [villages, setVillages] = useState<RegionVillage[]>([]);
  const [selectedBirthRegencyId, setSelectedBirthRegencyId] = useState('');
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [selectedRegencyId, setSelectedRegencyId] = useState('');
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedVillageId, setSelectedVillageId] = useState('');

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      regionsApi.getProvinces(),
      regionsApi.getRegencies(),
    ])
      .then(([provinceResponse, regencyResponse]) => {
        if (!cancelled) {
          setProvinces(provinceResponse.data.data || []);
          setBirthRegencies(regencyResponse.data.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProvinces([]);
          setBirthRegencies([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProvinceId) {
      setRegencies([]);
      setSelectedRegencyId('');
      setDistricts([]);
      setSelectedDistrictId('');
      setVillages([]);
      setSelectedVillageId('');
      return;
    }

    let cancelled = false;
    regionsApi.getRegencies(selectedProvinceId)
      .then((response) => {
        if (!cancelled) {
          setRegencies(response.data.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRegencies([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProvinceId]);

  useEffect(() => {
    if (!selectedRegencyId) {
      setDistricts([]);
      setSelectedDistrictId('');
      setVillages([]);
      setSelectedVillageId('');
      return;
    }

    let cancelled = false;
    regionsApi.getDistricts(selectedRegencyId)
      .then((response) => {
        if (!cancelled) {
          setDistricts(response.data.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDistricts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRegencyId]);

  useEffect(() => {
    if (!selectedDistrictId) {
      setVillages([]);
      setSelectedVillageId('');
      return;
    }

    let cancelled = false;
    regionsApi.getVillages(selectedDistrictId)
      .then((response) => {
        if (!cancelled) {
          setVillages(response.data.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVillages([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDistrictId]);

  useEffect(() => {
    if (!formData.birth_place || !birthRegencies.length) {
      if (!formData.birth_place && selectedBirthRegencyId) {
        setSelectedBirthRegencyId('');
      }
      return;
    }

    const matchedBirthRegency = findRegionByName(birthRegencies, formData.birth_place);
    if (!matchedBirthRegency) {
      return;
    }

    const birthRegencyID = String(matchedBirthRegency.id);
    if (selectedBirthRegencyId !== birthRegencyID) {
      setSelectedBirthRegencyId(birthRegencyID);
    }
    if (formData.birth_place !== matchedBirthRegency.name) {
      setField('birth_place', matchedBirthRegency.name);
    }
  }, [birthRegencies, formData.birth_place, selectedBirthRegencyId, setField]);

  useEffect(() => {
    if (!formData.province || !provinces.length) {
      if (!formData.province && selectedProvinceId) {
        setSelectedProvinceId('');
      }
      return;
    }

    const matchedProvince = findRegionByName(provinces, formData.province);
    if (!matchedProvince) {
      return;
    }

    const provinceId = String(matchedProvince.id);
    if (selectedProvinceId !== provinceId) {
      setSelectedProvinceId(provinceId);
    }
    if (formData.province !== matchedProvince.name) {
      setField('province', matchedProvince.name);
    }
  }, [formData.province, provinces, selectedProvinceId, setField]);

  useEffect(() => {
    if (!formData.city || !regencies.length) {
      if (!formData.city && selectedRegencyId) {
        setSelectedRegencyId('');
      }
      return;
    }

    const matchedRegency = findRegionByName(regencies, formData.city);
    if (!matchedRegency) {
      return;
    }

    const regencyId = String(matchedRegency.id);
    if (selectedRegencyId !== regencyId) {
      setSelectedRegencyId(regencyId);
    }
    if (formData.city !== matchedRegency.name) {
      setField('city', matchedRegency.name);
    }
  }, [formData.city, regencies, selectedRegencyId, setField]);

  useEffect(() => {
    if (!formData.kecamatan || !districts.length) {
      if (!formData.kecamatan && selectedDistrictId) {
        setSelectedDistrictId('');
      }
      return;
    }

    const matchedDistrict = findRegionByName(districts, formData.kecamatan);
    if (!matchedDistrict) {
      return;
    }

    const districtId = String(matchedDistrict.id);
    if (selectedDistrictId !== districtId) {
      setSelectedDistrictId(districtId);
    }
    if (formData.kecamatan !== matchedDistrict.name) {
      setField('kecamatan', matchedDistrict.name);
    }
  }, [districts, formData.kecamatan, selectedDistrictId, setField]);

  useEffect(() => {
    if (!formData.kelurahan || !villages.length) {
      if (!formData.kelurahan && selectedVillageId) {
        setSelectedVillageId('');
      }
      return;
    }

    const matchedVillage = findRegionByName(villages, formData.kelurahan);
    if (!matchedVillage) {
      return;
    }

    const villageId = String(matchedVillage.id);
    if (selectedVillageId !== villageId) {
      setSelectedVillageId(villageId);
    }
    if (formData.kelurahan !== matchedVillage.name) {
      setField('kelurahan', matchedVillage.name);
    }
  }, [formData.kelurahan, selectedVillageId, setField, villages]);

  const birthRegencyOptions = buildRegionSelectOptions(birthRegencies);
  const provinceOptions = buildRegionSelectOptions(provinces);
  const cityOptions = buildRegionSelectOptions(regencies);
  const kecamatanOptions = buildRegionSelectOptions(districts);
  const kelurahanOptions = buildRegionSelectOptions(villages);

  const handleBirthPlaceChange = (value: string) => {
    const regency = birthRegencies.find((item) => String(item.id) === value);
    setSelectedBirthRegencyId(value);
    setField('birth_place', regency?.name || '');
  };

  const handleProvinceChange = (value: string) => {
    const province = provinces.find((item) => String(item.id) === value);
    setSelectedProvinceId(value);
    setField('province', province?.name || '');
    setField('city', '');
    setField('kecamatan', '');
    setField('kelurahan', '');
    setSelectedRegencyId('');
    setSelectedDistrictId('');
    setSelectedVillageId('');
  };

  const handleCityChange = (value: string) => {
    const regency = regencies.find((item) => String(item.id) === value);
    setSelectedRegencyId(value);
    setField('city', regency?.name || '');
    setField('kecamatan', '');
    setField('kelurahan', '');
    setSelectedDistrictId('');
    setSelectedVillageId('');
  };

  const handleKecamatanChange = (value: string) => {
    const district = districts.find((item) => String(item.id) === value);
    setSelectedDistrictId(value);
    setField('kecamatan', district?.name || '');
    setField('kelurahan', '');
    setSelectedVillageId('');
  };

  const handleVillageChange = (value: string) => {
    const village = villages.find((item) => String(item.id) === value);
    setSelectedVillageId(value);
    setField('kelurahan', village?.name || '');
  };

  return (
    <>
      <PatientSection title="Identitas Pasien" helper="Isi identitas inti pasien sebagai dasar registrasi, pencarian, dan keterkaitan dengan kunjungan berikutnya.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <PatientFormField label="Nama Lengkap" name="full_name" value={formData.full_name} onChange={onInputChange} placeholder="Masukkan nama lengkap" required />
          <PatientFormField label="NIK" name="nik" value={formData.nik} onChange={onInputChange} placeholder="16 digit NIK" />
          <PatientSelectField label="Kota / Kabupaten Lahir" value={selectedBirthRegencyId} onValueChange={handleBirthPlaceChange} options={birthRegencyOptions} placeholder="Pilih kota / kabupaten lahir" noneLabel="Belum dipilih" />
          <PatientFormField label="Tanggal Lahir" name="birth_date" type="date" value={formData.birth_date} onChange={onInputChange} />
          <PatientSelectField label="Jenis Kelamin" value={formData.gender} onValueChange={(value) => setField('gender', value)} options={GENDER_OPTIONS} placeholder="Pilih jenis kelamin" required />
          <PatientSelectField label="Golongan Darah" value={formData.blood_type} onValueChange={(value) => setField('blood_type', value)} options={BLOOD_TYPES} placeholder="Pilih golongan darah" noneLabel="Tidak diketahui" />
          <PatientSelectField label="Status Pernikahan" value={formData.marital_status} onValueChange={(value) => setField('marital_status', value)} options={MARITAL_OPTIONS} placeholder="Pilih status pernikahan" noneLabel="Belum dipilih" />
          <PatientSelectField label="Agama" value={formData.religion} onValueChange={(value) => setField('religion', value)} options={RELIGION_OPTIONS} placeholder="Pilih agama" noneLabel="Belum dipilih" />
          <PatientSelectField label="Pendidikan" value={formData.education} onValueChange={(value) => setField('education', value)} options={buildUniqueOptions(EDUCATION_OPTIONS.map((option) => option.value), formData.education)} placeholder="Pilih pendidikan" noneLabel="Belum dipilih" />
          <PatientSelectField label="Pekerjaan" value={formData.occupation} onValueChange={(value) => setField('occupation', value)} options={buildUniqueOptions(OCCUPATION_OPTIONS.map((option) => option.value), formData.occupation)} placeholder="Pilih pekerjaan" noneLabel="Belum dipilih" />
        </div>
      </PatientSection>

      <PatientSection title="Alamat Domisili" helper="Gunakan alamat yang paling mudah dipakai untuk kontak pasien dan kebutuhan administrasi penjamin.">
        <div className="space-y-3">
          <PatientFormField label="Alamat Lengkap" name="address" value={formData.address} onChange={onInputChange} placeholder="Jl. Contoh No. 1" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PatientFormField label="RT" name="rt" value={formData.rt} onChange={onInputChange} placeholder="001" />
            <PatientFormField label="RW" name="rw" value={formData.rw} onChange={onInputChange} placeholder="001" />
            <PatientSelectField label="Provinsi" value={selectedProvinceId} onValueChange={handleProvinceChange} options={provinceOptions} placeholder="Pilih provinsi" noneLabel="Belum dipilih" />
            <PatientSelectField label="Kabupaten / Kota" value={selectedRegencyId} onValueChange={handleCityChange} options={cityOptions} placeholder="Pilih kabupaten / kota" noneLabel="Belum dipilih" disabled={!selectedProvinceId} />
            <PatientSelectField label="Kecamatan" value={selectedDistrictId} onValueChange={handleKecamatanChange} options={kecamatanOptions} placeholder="Pilih kecamatan" noneLabel="Belum dipilih" disabled={!selectedRegencyId} />
            <PatientSelectField label="Desa / Kelurahan" value={selectedVillageId} onValueChange={handleVillageChange} options={kelurahanOptions} placeholder="Pilih desa / kelurahan" noneLabel="Belum dipilih" disabled={!selectedDistrictId} />
            <PatientFormField label="Kode Pos" name="postal_code" value={formData.postal_code} onChange={onInputChange} placeholder="12345" />
          </div>
        </div>
      </PatientSection>

      <PatientSection title="Kontak Pasien" helper="Sediakan kontak utama dan kontak darurat agar proses registrasi dan tindak lanjut klinis tetap cepat.">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <PatientFormField label="No. Telepon / HP" name="phone" value={formData.phone} onChange={onInputChange} placeholder="08xxxxxxxxxx" />
            <PatientFormField label="Email" name="email" type="email" value={formData.email} onChange={onInputChange} placeholder="email@contoh.com" />
          </div>

          <div className="border-t border-border/70 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Kontak Darurat</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <PatientFormField label="Nama" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={onInputChange} placeholder="Nama kontak darurat" />
              <PatientFormField label="No. Telepon" name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={onInputChange} placeholder="08xxxxxxxxxx" />
              <PatientFormField label="Hubungan" name="emergency_contact_relation" value={formData.emergency_contact_relation} onChange={onInputChange} placeholder="Suami / Istri / Orang tua / ..." />
            </div>
          </div>
        </div>
      </PatientSection>

      <PatientSection title="Penjamin Dan Catatan Medis" helper="Kelompokkan penjamin, alergi, dan catatan administratif agar mudah dicek saat pasien datang kembali.">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <PatientSelectField label="Tipe Asuransi" value={formData.insurance_type} onValueChange={(value) => setField('insurance_type', value)} options={INSURANCE_OPTIONS} placeholder="Pilih tipe asuransi" />
            {formData.insurance_type !== 'umum' ? (
              <PatientFormField label="No. Asuransi / BPJS" name="insurance_number" value={formData.insurance_number} onChange={onInputChange} placeholder="Nomor kartu asuransi" />
            ) : null}
            <PatientFormField label="Alergi" name="allergies" value={formData.allergies} onChange={onInputChange} placeholder="Alergi obat, makanan, atau bahan tertentu" />
          </div>
          <PatientTextareaField label="Catatan Tambahan" name="notes" value={formData.notes} onChange={onTextareaChange} placeholder="Catatan medis atau informasi penting lainnya" rows={4} />
        </div>
      </PatientSection>
    </>
  );
}

export function PatientFormSummaryPanel({
  formData,
  medicalRecordNumber,
  footerNote,
}: {
  formData: PatientFormData;
  medicalRecordNumber?: string;
  footerNote: string;
}) {
  const satusehatChecklist = getPatientSatusehatChecklist(formData);
  const satusehatReadyCount = satusehatChecklist.filter((item) => item.ready).length;
  const missingLabels = satusehatChecklist.filter((item) => !item.ready).map((item) => item.label);

  return (
    <div className="divide-y divide-border/70">
      <PatientPanelSection title="Ringkasan Pasien" helper="Preview singkat sebelum data disimpan atau diperbarui.">
        <div className="space-y-3 text-sm">
          <div className="border border-border/70 bg-muted/[0.04] px-3 py-3">
            <p className="font-medium text-foreground/95">{formData.full_name || 'Nama belum diisi'}</p>
            <div className="mt-2 grid gap-2 text-muted-foreground">
              <p>No. RM: {medicalRecordNumber || 'Akan dibuat otomatis'}</p>
              <p>Jenis kelamin: {getPatientGenderLabel(formData.gender)}</p>
              <p>Usia: {getPatientAgeLabel(formData.birth_date)}</p>
              <p>Asuransi: {getPatientInsuranceLabel(formData.insurance_type)}</p>
              <p>Telepon: {formData.phone || '-'}</p>
            </div>
          </div>
        </div>
      </PatientPanelSection>

      <PatientPanelSection title="Status SATUSEHAT" helper="Sidebar hanya menampilkan progres inti; detail field dicek di area form utama.">
        <div className="flex items-start justify-between gap-3 border border-border/70 bg-muted/[0.04] px-3 py-3 text-sm">
          <div className="space-y-1">
            <p className="font-medium text-foreground/95">{satusehatReadyCount}/{satusehatChecklist.length} komponen siap</p>
            <p className="text-[11px] leading-5 text-muted-foreground">
              {missingLabels.length > 0 ? `Perlu dilengkapi: ${missingLabels.join(', ')}.` : 'Field inti untuk sync Patient sudah lengkap.'}
            </p>
          </div>
          <Badge variant={satusehatReadyCount === satusehatChecklist.length ? 'default' : 'secondary'} className="rounded-none">
            {satusehatReadyCount === satusehatChecklist.length ? 'Siap' : 'Review'}
          </Badge>
        </div>
      </PatientPanelSection>

      <PatientPanelSection title="Catatan Sistem">
        <p className="text-[11px] leading-5 text-muted-foreground">{footerNote}</p>
      </PatientPanelSection>
    </div>
  );
}

export function PatientDetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="text-sm leading-6 text-foreground/95">{value}</div>
    </div>
  );
}