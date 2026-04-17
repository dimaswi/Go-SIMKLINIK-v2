export const EMPLOYEE_PROFESSION_OPTIONS = [
  { value: 'doctor', label: 'Dokter' },
  { value: 'pharmacist', label: 'Apoteker' },
  { value: 'pharmacy', label: 'Farmasi' },
  { value: 'nurse', label: 'Perawat' },
  { value: 'midwife', label: 'Bidan' },
  { value: 'administration', label: 'Administrasi' },
  { value: 'cashier', label: 'Kasir' },
  { value: 'analyst', label: 'Analis' },
  { value: 'radiology', label: 'Radiologi' },
  { value: 'other', label: 'Lainnya' },
];

export function getEmployeeProfessionLabel(value?: string | null) {
  const match = EMPLOYEE_PROFESSION_OPTIONS.find((item) => item.value === (value || '').trim().toLowerCase());
  return match?.label || 'Lainnya';
}

export function shouldEmployeeProfessionRequireSatusehatByDefault(value?: string | null) {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'doctor' || normalized === 'nurse' || normalized === 'midwife';
}