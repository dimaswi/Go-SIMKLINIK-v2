import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
export const API_ORIGIN = API_URL.replace(/\/api$/, '');

export function resolveAssetUrl(path?: string | null) {
  if (!path) {
    return '';
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface Permission {
  id: number;
  name: string;
  module: string;
  category: string;
  description: string;
  actions: string; // JSON string containing array of actions
}

export interface Role {
  id: number;
  name: string;
  description: string;
  permissions?: Permission[];
}

export interface User {
  id: number;
  email: string;
  username: string;
  full_name: string;
  is_active: boolean;
  role_id?: number;
  role?: Role;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export const authApi = {
  login: (data: LoginRequest) => 
    api.post<LoginResponse>('/auth/login', data),
  
  getProfile: () => 
    api.get<User>('/auth/profile'),
};

export const usersApi = {
  getAll: () => 
    api.get<{ data: User[] }>('/users'),
  
  getById: (id: number) => 
    api.get<{ data: User }>(`/users/${id}`),
  
  create: (data: any) => 
    api.post<{ data: User }>('/users', data),
  
  update: (id: number, data: any) => 
    api.put<{ data: User }>(`/users/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/users/${id}`),
};

export const rolesApi = {
  getAll: () => 
    api.get('/roles'),
  
  getById: (id: number) => 
    api.get(`/roles/${id}`),
  
  create: (data: any) => 
    api.post('/roles', data),
  
  update: (id: number, data: any) => 
    api.put(`/roles/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/roles/${id}`),
};

export const permissionsApi = {
  getAll: () => 
    api.get('/permissions'),
  
  getById: (id: number) => 
    api.get(`/permissions/${id}`),
  
  create: (data: any) => 
    api.post('/permissions', data),
  
  update: (id: number, data: any) => 
    api.put(`/permissions/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/permissions/${id}`),
};

export const settingsApi = {
  getAll: () => 
    api.get('/settings'),
  
  update: (data: Record<string, string>) => 
    api.put('/settings', data),

  previewPrintHeader: (data: Record<string, string>) =>
    api.post('/settings/print-header-preview', data, {
      responseType: 'blob',
    }),

  uploadLogo: (file: File, type: 'logo' | 'favicon' | 'print_logo') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    return api.post('/settings/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export type SatusehatResourceKey =
  | 'organization'
  | 'location'
  | 'patient'
  | 'practitioner'
  | 'encounter'
  | 'vital-signs'
  | 'clinical-impression'
  | 'procedure'
  | 'care-plan'
  | 'goal'
  | 'allergy-intolerance'
  | 'composition'
  | 'family-member-history'
  | 'diagnosis'
  | 'laboratory-order-item'
  | 'radiology-order-item'
  | 'prescription'
  | 'dispensing';

type SatusehatStatusResponse = {
  active_mode: 'sandbox' | 'production' | string;
  auth_url: string;
  fhir_url: string;
  organization_id: string;
  client_id_configured: boolean;
  client_secret_configured: boolean;
  missing_fields: string[];
  ready: boolean;
};

export interface SatusehatLog {
  id: number;
  created_at: string;
  updated_at: string;
  operation: string;
  resource_type: string;
  mode: string;
  method: string;
  endpoint: string;
  status_code: number;
  success: boolean;
  error_message: string;
  request_payload: string;
  response_body: string;
  resource_id: string;
  location: string;
}

export interface SatusehatPrerequisite {
  key: string;
  label: string;
  required: boolean;
  ready: boolean;
  current_value?: string;
  detail?: string;
  next_step?: string;
}

const satusehatResourcePaths: Record<
  SatusehatResourceKey,
  { preview: (id: number | string) => string; sync: (id: number | string) => string }
> = {
  organization: {
    preview: (id) => `/satusehat/organizations/${id}/preview`,
    sync: (id) => `/satusehat/organizations/${id}/sync`,
  },
  location: {
    preview: (id) => `/satusehat/locations/${id}/preview`,
    sync: (id) => `/satusehat/locations/${id}/sync`,
  },
  patient: {
    preview: (id) => `/satusehat/patients/${id}/preview`,
    sync: (id) => `/satusehat/patients/${id}/sync`,
  },
  practitioner: {
    preview: (id) => `/satusehat/practitioners/${id}/preview`,
    sync: (id) => `/satusehat/practitioners/${id}/sync`,
  },
  encounter: {
    preview: (id) => `/satusehat/encounters/${id}/preview`,
    sync: (id) => `/satusehat/encounters/${id}/sync`,
  },
  'vital-signs': {
    preview: (id) => `/satusehat/medical-records/${id}/vital-signs/preview`,
    sync: (id) => `/satusehat/medical-records/${id}/vital-signs/sync`,
  },
  'clinical-impression': {
    preview: (id) => `/satusehat/medical-records/${id}/clinical-impression/preview`,
    sync: (id) => `/satusehat/medical-records/${id}/clinical-impression/sync`,
  },
  procedure: {
    preview: (id) => `/satusehat/medical-actions/${id}/procedure/preview`,
    sync: (id) => `/satusehat/medical-actions/${id}/procedure/sync`,
  },
  'care-plan': {
    preview: (id) => `/satusehat/medical-records/${id}/care-plan/preview`,
    sync: (id) => `/satusehat/medical-records/${id}/care-plan/sync`,
  },
  goal: {
    preview: (id) => `/satusehat/medical-records/${id}/goal/preview`,
    sync: (id) => `/satusehat/medical-records/${id}/goal/sync`,
  },
  'allergy-intolerance': {
    preview: (id) => `/satusehat/medical-records/${id}/allergy-intolerance/preview`,
    sync: (id) => `/satusehat/medical-records/${id}/allergy-intolerance/sync`,
  },
  composition: {
    preview: (id) => `/satusehat/medical-records/${id}/composition/preview`,
    sync: (id) => `/satusehat/medical-records/${id}/composition/sync`,
  },
  'family-member-history': {
    preview: (id) => `/satusehat/medical-records/${id}/family-member-history/preview`,
    sync: (id) => `/satusehat/medical-records/${id}/family-member-history/sync`,
  },
  diagnosis: {
    preview: (id) => `/satusehat/diagnoses/${id}/preview`,
    sync: (id) => `/satusehat/diagnoses/${id}/sync`,
  },
  'laboratory-order-item': {
    preview: (id) => `/satusehat/laboratory-order-items/${id}/preview`,
    sync: (id) => `/satusehat/laboratory-order-items/${id}/sync`,
  },
  'radiology-order-item': {
    preview: (id) => `/satusehat/radiology-order-items/${id}/preview`,
    sync: (id) => `/satusehat/radiology-order-items/${id}/sync`,
  },
  prescription: {
    preview: (id) => `/satusehat/prescriptions/${id}/preview`,
    sync: (id) => `/satusehat/prescriptions/${id}/sync`,
  },
  dispensing: {
    preview: (id) => `/satusehat/dispensings/${id}/preview`,
    sync: (id) => `/satusehat/dispensings/${id}/sync`,
  },
};

export const satusehatApi = {
  getStatus: () => api.get<{ data: SatusehatStatusResponse }>('/satusehat/status'),

  getLogs: (limit = 50, resourceType?: string, operation?: string, success?: boolean) =>
    api.get<{ data: SatusehatLog[] }>(
      `/satusehat/logs?limit=${limit}`
      + `${resourceType ? `&resource_type=${encodeURIComponent(resourceType)}` : ''}`
      + `${operation ? `&operation=${encodeURIComponent(operation)}` : ''}`
      + `${typeof success === 'boolean' ? `&success=${success}` : ''}`
    ),

  retryLog: (id: number) => api.post(`/satusehat/logs/${id}/retry`),

  testConnection: () => api.post('/satusehat/test-connection'),

  previewResource: (resource: SatusehatResourceKey, id: number | string) =>
    api.get(satusehatResourcePaths[resource].preview(id)),

  syncResource: (resource: SatusehatResourceKey, id: number | string) =>
    api.post(satusehatResourcePaths[resource].sync(id)),

  getAutoSyncVisit: (visitId: number | string) =>
    api.get<SatusehatAutoSyncVisitResponse>(`/satusehat/visits/${visitId}/auto-sync`),

  autoSyncVisit: (visitId: number | string, async = false) =>
    api.post<SatusehatAutoSyncVisitResponse>(`/satusehat/visits/${visitId}/auto-sync${async ? '?async=true' : ''}`),
};

// ========================
// Phase 1: Master Data APIs
// ========================

export interface Polyclinic {
  id: number;
  name: string;
  code: string;
  description: string;
  admin_fee: number;
  is_active: boolean;
  color: string;
  icon: string;
  sort_order: number;
  satusehat_organization_id?: string;
  satusehat_location_id?: string;
  satusehat_organization_synced_at?: string;
  satusehat_location_synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Doctor {
  id: number;
  user_id?: number;
  full_name: string;
  nik_number?: string;
  nip_number: string;
  sip_number: string;
  specialization: string;
  phone: string;
  photo: string;
  is_active: boolean;
  satusehat_practitioner_id?: string;
  satusehat_synced_at?: string;
  user?: User;
  polyclinics?: Polyclinic[];
  schedules?: DoctorSchedule[];
  created_at?: string;
  updated_at?: string;
}

export interface DoctorSchedule {
  id: number;
  doctor_id: number;
  polyclinic_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  max_patients: number;
  is_active: boolean;
  doctor?: Doctor;
  polyclinic?: Polyclinic;
  created_at?: string;
  updated_at?: string;
}

export interface MedicineCategory {
  id: number;
  name: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export interface Unit {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface Medicine {
  id: number;
  code: string;
  kfa_code: string;
  kfa_name: string;
  name: string;
  generic_name: string;
  category_id: number;
  unit_id: number;
  type: string;
  form: string;
  strength: string;
  manufacturer: string;
  min_stock: number;
  current_stock: number;
  purchase_price: number;
  selling_price: number;
  is_active: boolean;
  satusehat_medication_id?: string;
  satusehat_medication_synced_at?: string;
  category?: MedicineCategory;
  unit?: Unit;
  created_at?: string;
  updated_at?: string;
}

export interface KFAProductSearchItem {
  name: string;
  kfa_code: string;
  active: boolean;
  state: string;
  manufacturer: string;
  updated_at?: string;
  farmalkes_type?: {
    code?: string;
    name?: string;
    group?: string;
  };
  uom?: {
    name?: string;
    cs_code?: string;
  };
  dosage_form?: {
    code?: string;
    name?: string;
  };
  product_template?: {
    kfa_code?: string;
    name?: string;
    state?: string;
    active?: boolean;
  };
}

export interface KFAProductSearchResponse {
  total: number;
  page: number;
  size: number;
  data: KFAProductSearchItem[];
}

export interface KFAProductDetail {
  name: string;
  kfa_code: string;
  active: boolean;
  state: string;
  manufacturer: string;
  registrar?: string;
  generik?: boolean;
  updated_at?: string;
  dose_per_unit?: number;
  fix_price?: number;
  het_price?: number;
  farmalkes_type?: {
    code?: string;
    name?: string;
    group?: string;
  };
  dosage_form?: {
    code?: string;
    name?: string;
  };
  rute_pemberian?: {
    code?: string;
    name?: string;
  };
  uom?: {
    name?: string;
    cs_code?: string;
  };
  product_template?: {
    kfa_code?: string;
    name?: string;
  };
  active_ingredients?: Array<{
    kfa_code?: string;
    zat_aktif?: string;
    kekuatan_zat_aktif?: string;
  }>;
}

export interface ServiceCategory {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface MedicalServiceParameter {
  id: number;
  medical_service_id: number;
  code: string;
  name: string;
  input_type: 'text' | 'number' | 'textarea' | string;
  unit: string;
  reference_value_male: string;
  reference_value_female: string;
  sort_order: number;
  is_required: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SpecimenTemplate {
  id: number;
  code: string;
  name: string;
  description: string;
  type_system: string;
  type_code: string;
  type_display: string;
  collection_method_system: string;
  collection_method_code: string;
  collection_method_display: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MedicalServiceSpecimen {
  id: number;
  medical_service_id: number;
  specimen_template_id: number;
  sort_order: number;
  is_default: boolean;
  notes: string;
  specimen_template?: SpecimenTemplate;
  created_at?: string;
  updated_at?: string;
}

export type MedicalServiceDomain = 'general' | 'laboratory' | 'radiology' | 'dental';
export type MedicalServiceTargetScope = 'none' | 'full_mouth' | 'arch' | 'quadrant' | 'tooth' | 'surface';

export interface MedicalService {
  id: number;
  code: string;
  name: string;
  category_id: number;
  polyclinic_id?: number;
  service_domain: MedicalServiceDomain | string;
  target_scope: MedicalServiceTargetScope | string;
  requires_consent: boolean;
  supports_odontogram_sync: boolean;
  price: number;
  is_active: boolean;
  description: string;
  category?: ServiceCategory;
  polyclinic?: Polyclinic;
  parameters?: MedicalServiceParameter[];
  specimen_options?: MedicalServiceSpecimen[];
  created_at?: string;
  updated_at?: string;
}

export interface LaboratoryOrderSpecimen {
  id: number;
  laboratory_order_item_id: number;
  specimen_template_id?: number;
  template_code_snapshot: string;
  template_name_snapshot: string;
  type_system: string;
  type_code: string;
  type_display: string;
  collection_method_system: string;
  collection_method_code: string;
  collection_method_display: string;
  collected_at?: string;
  received_at?: string;
  collector_organization_id: string;
  notes: string;
  satusehat_specimen_id?: string;
  satusehat_synced_at?: string;
  specimen_template?: SpecimenTemplate;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentMethod {
  id: number;
  name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PhysicalExamImageMaster {
  id: number;
  name: string;
  category: string;
  location: string;
  description: string;
  image_url: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ICD10 {
  id: number;
  code: string;
  name: string;
  name_id: string;
  category: string;
  chapter: string;
}

export interface LabTestCategory {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface LabTestParameter {
  id: number;
  lab_test_id: number;
  code: string;
  name: string;
  unit: string;
  normal_value_male: string;
  normal_value_female: string;
  sort_order: number;
  is_required: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LabTest {
  id: number;
  code: string;
  name: string;
  category_id: number;
  unit: string;
  normal_value_male: string;
  normal_value_female: string;
  price: number;
  is_active: boolean;
  sort_order: number;
  category?: LabTestCategory;
  parameters?: LabTestParameter[];
  created_at?: string;
  updated_at?: string;
}

export const polyclinicsApi = {
  getAll: (params?: string) => api.get(`/polyclinics${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/polyclinics/${id}`),
  create: (data: any) => api.post('/polyclinics', data),
  update: (id: number, data: any) => api.put(`/polyclinics/${id}`, data),
  delete: (id: number) => api.delete(`/polyclinics/${id}`),
};

export const doctorsApi = {
  getAll: (params?: string) => api.get(`/doctors${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/doctors/${id}`),
  create: (data: any) => api.post('/doctors', data),
  update: (id: number, data: any) => api.put(`/doctors/${id}`, data),
  delete: (id: number) => api.delete(`/doctors/${id}`),
};

export const doctorSchedulesApi = {
  getAll: (params?: string) => api.get(`/doctor-schedules${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/doctor-schedules/${id}`),
  create: (data: any) => api.post('/doctor-schedules', data),
  update: (id: number, data: any) => api.put(`/doctor-schedules/${id}`, data),
  delete: (id: number) => api.delete(`/doctor-schedules/${id}`),
};

export const icd10Api = {
  search: (params?: string) => api.get(`/icd10${params ? `?${params}` : ''}`),
};

export const medicinesApi = {
  getAll: (params?: string) => api.get(`/medicines${params ? `?${params}` : ''}`),
  searchKFA: (keyword: string, page = 1, size = 10) => api.get<{ data: KFAProductSearchResponse }>(`/medicines/kfa/search?keyword=${encodeURIComponent(keyword)}&page=${page}&size=${size}`),
  getKFADetail: (code: string) => api.get<{ data: KFAProductDetail }>(`/medicines/kfa/${encodeURIComponent(code)}`),
  getById: (id: number) => api.get(`/medicines/${id}`),
  syncSatusehatMedication: (id: number) => api.post<{ data: { medicine: Medicine }; message: string }>(`/satusehat/medicines/${id}/sync`),
  create: (data: any) => api.post('/medicines', data),
  update: (id: number, data: any) => api.put(`/medicines/${id}`, data),
  delete: (id: number) => api.delete(`/medicines/${id}`),
};

export const medicineCategoriesApi = {
  getAll: () => api.get('/medicine-categories'),
  getById: (id: number) => api.get(`/medicine-categories/${id}`),
  create: (data: any) => api.post('/medicine-categories', data),
  update: (id: number, data: any) => api.put(`/medicine-categories/${id}`, data),
  delete: (id: number) => api.delete(`/medicine-categories/${id}`),
};

export const unitsApi = {
  getAll: () => api.get('/units'),
  getById: (id: number) => api.get(`/units/${id}`),
  create: (data: any) => api.post('/units', data),
  update: (id: number, data: any) => api.put(`/units/${id}`, data),
  delete: (id: number) => api.delete(`/units/${id}`),
};

export const medicalServicesApi = {
  getAll: (params?: string) => api.get(`/medical-services${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/medical-services/${id}`),
  create: (data: any) => api.post('/medical-services', data),
  update: (id: number, data: any) => api.put(`/medical-services/${id}`, data),
  delete: (id: number) => api.delete(`/medical-services/${id}`),
};

export const specimenTemplatesApi = {
  getAll: (params?: string) => api.get(`/specimen-templates${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/specimen-templates/${id}`),
  create: (data: any) => api.post('/specimen-templates', data),
  update: (id: number, data: any) => api.put(`/specimen-templates/${id}`, data),
  delete: (id: number) => api.delete(`/specimen-templates/${id}`),
};

export const labTestsApi = {
  getAll: (params?: string) => api.get(`/lab-tests${params ? `?${params}` : ''}`),
};

export const serviceCategoriesApi = {
  getAll: () => api.get('/service-categories'),
  getById: (id: number) => api.get(`/service-categories/${id}`),
  create: (data: any) => api.post('/service-categories', data),
  update: (id: number, data: any) => api.put(`/service-categories/${id}`, data),
  delete: (id: number) => api.delete(`/service-categories/${id}`),
};

export const paymentMethodsApi = {
  getAll: (params?: string) => api.get(`/payment-methods${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/payment-methods/${id}`),
  create: (data: any) => api.post('/payment-methods', data),
  update: (id: number, data: any) => api.put(`/payment-methods/${id}`, data),
  delete: (id: number) => api.delete(`/payment-methods/${id}`),
};

export const suppliersApi = {
  getAll: (params?: string) => api.get(`/suppliers${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/suppliers/${id}`),
  create: (data: any) => api.post('/suppliers', data),
  update: (id: number, data: any) => api.put(`/suppliers/${id}`, data),
  delete: (id: number) => api.delete(`/suppliers/${id}`),
};

export const physicalExamImagesApi = {
  getAll: (params?: string) => api.get<{ data: PhysicalExamImageMaster[] }>(`/physical-exam-images${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get<{ data: PhysicalExamImageMaster }>(`/physical-exam-images/${id}`),
  create: (data: FormData) => api.post<{ data: PhysicalExamImageMaster }>('/physical-exam-images', data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  update: (id: number, data: FormData) => api.put<{ data: PhysicalExamImageMaster }>(`/physical-exam-images/${id}`, data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  delete: (id: number) => api.delete(`/physical-exam-images/${id}`),
};

// ========================
// Purchasing & Stock
// ========================

export interface PurchaseOrderItem {
  id: number;
  purchase_order_id: number;
  medicine_id: number;
  quantity: number;
  received_quantity: number;
  unit_price: number;
  total_price: number;
  batch_number: string;
  expiry_date?: string;
  medicine?: Medicine;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id: number;
  order_date: string;
  received_date?: string;
  status: 'draft' | 'ordered' | 'partial' | 'received';
  total_amount: number;
  notes: string;
  created_by: number;
  supplier?: Supplier;
  creator?: User;
  items?: PurchaseOrderItem[];
  created_at?: string;
  updated_at?: string;
}

export interface StockMovement {
  id: number;
  medicine_id: number;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reference_type: string;
  reference_id: number;
  batch_number: string;
  expiry_date?: string;
  notes: string;
  created_by: number;
  medicine?: Medicine;
  creator?: User;
  created_at?: string;
}

export const purchaseOrdersApi = {
  getAll: (params?: string) => api.get(`/purchase-orders${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/purchase-orders/${id}`),
  create: (data: any) => api.post('/purchase-orders', data),
  update: (id: number, data: any) => api.put(`/purchase-orders/${id}`, data),
  delete: (id: number) => api.delete(`/purchase-orders/${id}`),
  receive: (id: number, data: any) => api.post(`/purchase-orders/${id}/receive`, data),
};

export const stockMovementsApi = {
  getAll: (params?: string) => api.get(`/stock-movements${params ? `?${params}` : ''}`),
};

// ========================
// Phase 2: Front Office
// ========================

export interface Patient {
  id: number;
  medical_record_number: string;
  satusehat_patient_id?: string;
  satusehat_synced_at?: string;
  nik: string;
  full_name: string;
  birth_date?: string;
  birth_place: string;
  gender: 'L' | 'P';
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
  photo: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RegionProvince {
  id: number;
  name: string;
}

export interface RegionRegency {
  id: number;
  province_id: number;
  name: string;
}

export interface RegionDistrict {
  id: number;
  regency_id: number;
  name: string;
}

export interface RegionVillage {
  id: number;
  district_id: number;
  name: string;
}

export interface Visit {
  id: number;
  visit_number: string;
  patient_id: number;
  visit_date: string;
  polyclinic_id: number;
  doctor_id: number;
  queue_number: number;
  queue_status: 'waiting' | 'in_consultation' | 'done' | 'cancelled';
  payment_type: 'umum' | 'bpjs' | 'asuransi';
  insurance_number: string;
  complaint: string;
  visit_type: 'baru' | 'lama';
  priority: 'normal' | 'urgent';
  status: 'registered' | 'in_progress' | 'completed' | 'cancelled';
  satusehat_encounter_id?: string;
  satusehat_synced_at?: string;
  registered_by: number;
  patient?: Patient;
  polyclinic?: Polyclinic;
  doctor?: Doctor;
  registered_by_user?: User;
  created_at?: string;
  updated_at?: string;
}

export interface RegistrationQueueItem {
  id: number;
  queue_date: string;
  ticket_number: number;
  status: 'waiting' | 'called' | 'processing' | 'completed' | 'cancelled';
  called_at?: string;
  processing_started_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  visit_id?: number;
  visit?: Visit;
  created_at?: string;
  updated_at?: string;
}

export const patientsApi = {
  getAll: (params?: string) => api.get(`/patients${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/patients/${id}`),
  getHistory: (id: number) => api.get(`/patients/${id}/history`),
  syncSatusehat: (id: number) => api.post<{ data: { patient: Patient }; message: string }>(`/satusehat/patients/${id}/sync`),
  create: (data: any) => api.post('/patients', data),
  update: (id: number, data: any) => api.put(`/patients/${id}`, data),
  delete: (id: number) => api.delete(`/patients/${id}`),
};

export const regionsApi = {
  getProvinces: (params?: string) => api.get<{ data: RegionProvince[] }>(`/regions/provinces${params ? `?${params}` : ''}`),
  getRegencies: (provinceId?: number | string, params?: string) => {
    const queryParts: string[] = [];
    if (provinceId !== undefined && provinceId !== null && provinceId !== '') {
      queryParts.push(`province_id=${provinceId}`);
    }
    if (params) {
      queryParts.push(params);
    }
    return api.get<{ data: RegionRegency[] }>(`/regions/regencies${queryParts.length > 0 ? `?${queryParts.join('&')}` : ''}`);
  },
  getDistricts: (regencyId: number | string, params?: string) => api.get<{ data: RegionDistrict[] }>(`/regions/districts?regency_id=${regencyId}${params ? `&${params}` : ''}`),
  getVillages: (districtId: number | string, params?: string) => api.get<{ data: RegionVillage[] }>(`/regions/villages?district_id=${districtId}${params ? `&${params}` : ''}`),
};

export const visitsApi = {
  getAll: (params?: string) => api.get(`/visits${params ? `?${params}` : ''}`),
  getToday: (params?: string) => api.get(`/visits/today${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/visits/${id}`),
  syncSatusehatEncounter: (id: number) => api.post<{ data: { visit: Visit }; message: string }>(`/satusehat/encounters/${id}/sync`),
  create: (data: any) => api.post('/visits', data),
  update: (id: number, data: any) => api.put(`/visits/${id}`, data),
  delete: (id: number) => api.delete(`/visits/${id}`),
  cancelWorkspace: (id: number) => api.post(`/visits/${id}/cancel-workspace`),
  updateStatus: (id: number, data: { queue_status?: string; status?: string }) => api.patch(`/visits/${id}/status`, data),
};

export const queueApi = {
  getByPolyclinic: (polyclinicId: number) => api.get(`/queue/${polyclinicId}`),
  callNext: (polyclinicId: number) => api.post(`/queue/${polyclinicId}/call-next`),
};

export const registrationQueueApi = {
  getAll: (params?: string) => api.get<{ data: RegistrationQueueItem[] }>(`/registration-queue${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get<{ data: RegistrationQueueItem }>(`/registration-queue/${id}`),
  print: (id: number) => api.get(`/registration-queue/${id}/print`, { responseType: 'blob' }),
  create: () => api.post<{ data: RegistrationQueueItem }>('/registration-queue'),
  callNext: () => api.post<{ data: RegistrationQueueItem }>('/registration-queue/call-next'),
  updateStatus: (id: number, data: { status: RegistrationQueueItem['status']; visit_id?: number }) =>
    api.patch<{ data: RegistrationQueueItem }>(`/registration-queue/${id}/status`, data),
  delete: (id: number) => api.delete(`/registration-queue/${id}`),
};

// ========================
// Phase 3: EMR (Electronic Medical Record)
// ========================

export type MedicalRecordSectionType = 'anamnesis' | 'physical_exam' | 'assessment' | 'plan' | 'prescription' | 'laboratory' | 'radiology' | 'procedure' | 'outcome';
export type MedicalRecordSheetKey = 'pengkajian-awal-medis' | 'pengkajian-awal-gigi';
export type OdontogramChartType = 'permanent' | 'primary';
export type OdontogramEntryStatus = 'draft' | 'cancelled' | 'final';
export type OdontogramToothCondition = 'sound' | 'missing' | 'extracted' | 'retained_root' | 'impacted' | 'implant' | 'crown' | 'mobility';
export type OdontogramSurfaceCondition = 'sound' | 'caries' | 'restoration' | 'sealant' | 'fracture' | 'wear' | 'calculus';

export interface MedicalRecordDiagnosis {
  id: number;
  medical_record_id: number;
  icd10_id: number;
  diagnosis_type: 'primer' | 'sekunder';
  working_diagnosis: string;
  differential_diagnosis: string;
  assessment_narrative: string;
  notes: string;
  icd10?: ICD10;
}

export interface Prescription {
  id: number;
  medical_record_id: number;
  medicine_id: number;
  quantity: number;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  notes: string;
  status: 'prescribed' | 'dispensed' | 'cancelled';
  satusehat_medication_request_id?: string;
  satusehat_synced_at?: string;
  medicine?: Medicine;
  created_at?: string;
  updated_at?: string;
}

export interface PrescriptionCompoundItem {
  id: number;
  prescription_compound_id: number;
  medicine_id: number;
  quantity: number;
  notes: string;
  medicine?: Medicine;
}

export interface PrescriptionCompound {
  id: number;
  medical_record_id: number;
  name: string;
  preparation_type: string;
  output_quantity: number;
  output_unit: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  notes: string;
  status: 'prescribed' | 'dispensed' | 'cancelled';
  items?: PrescriptionCompoundItem[];
  created_at?: string;
  updated_at?: string;
}

export interface Dispensing {
  id: number;
  visit_id: number;
  medical_record_id: number;
  prescription_id?: number;
  prescription_compound_id?: number;
  medicine_id?: number;
  quantity: number;
  batch_number: string;
  dispensed_by: number;
  dispensed_at?: string;
  status: 'pending' | 'dispensed' | 'cancelled';
  notes: string;
}

export interface MedicalActionTarget {
  id?: number;
  medical_action_id?: number;
  target_type: MedicalServiceTargetScope | string;
  arch: string;
  quadrant: string;
  tooth_number: string;
  surface_codes?: string[];
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface MedicalActionOdontogramSync {
  entry_id: number;
  tooth_condition?: OdontogramToothCondition | string;
  surface_condition?: OdontogramSurfaceCondition | string;
}

export interface MedicalActionParameterValuePayload {
  medical_service_parameter_id?: number;
  result_value: string;
  result_notes: string;
}

export interface MedicalActionParameterValue {
  id: number;
  medical_action_id: number;
  medical_service_parameter_id?: number;
  parameter_code_snapshot: string;
  parameter_name_snapshot: string;
  input_type_snapshot: string;
  unit_snapshot: string;
  sort_order: number;
  is_required: boolean;
  result_value: string;
  result_notes: string;
  medical_service_parameter?: MedicalServiceParameter;
  created_at?: string;
  updated_at?: string;
}

export interface MedicalActionMutationPayload {
  medical_service_id: number;
  quantity: number;
  notes: string;
  parameter_values?: MedicalActionParameterValuePayload[];
  targets?: MedicalActionTarget[];
  odontogram_sync?: MedicalActionOdontogramSync | null;
}

export interface MedicalActionItem {
  id: number;
  medical_record_id: number;
  medical_service_id: number;
  doctor_id: number;
  service_code_snapshot: string;
  service_name_snapshot: string;
  service_domain_snapshot: MedicalServiceDomain | string;
  target_scope_snapshot: MedicalServiceTargetScope | string;
  requires_consent_snapshot: boolean;
  supports_odontogram_sync_snapshot: boolean;
  notes: string;
  quantity: number;
  price: number;
  parameter_values?: MedicalActionParameterValue[];
  targets?: MedicalActionTarget[];
  medical_service?: MedicalService;
  doctor?: Doctor;
}

export interface LaboratoryOrderItem {
  id: number;
  medical_record_id: number;
  medical_service_id: number;
  lab_test_id?: number;
  test_code_snapshot: string;
  test_name_snapshot: string;
  instructions: string;
  unit_snapshot: string;
  normal_value_snapshot: string;
  result_value: string;
  result_notes: string;
  flag: string;
  satusehat_service_request_id?: string;
  satusehat_observation_id?: string;
  satusehat_diagnostic_report_id?: string;
  satusehat_synced_at?: string;
  result_date?: string;
  result_by?: number;
  medical_service?: MedicalService;
  lab_test?: LabTest;
  specimen?: LaboratoryOrderSpecimen;
  parameter_results?: LaboratoryOrderParameterResult[];
  result_by_user?: User;
  created_at?: string;
  updated_at?: string;
}

export interface LaboratoryOrderParameterResult {
  id: number;
  laboratory_order_item_id: number;
  medical_service_parameter_id?: number;
  parameter_code_snapshot: string;
  parameter_name_snapshot: string;
  input_type_snapshot: string;
  unit_snapshot: string;
  normal_value_snapshot: string;
  sort_order: number;
  is_required: boolean;
  result_value: string;
  result_notes: string;
  flag: string;
  satusehat_observation_id?: string;
  satusehat_synced_at?: string;
  result_date?: string;
  result_by?: number;
  medical_service_parameter?: MedicalServiceParameter;
  result_by_user?: User;
  created_at?: string;
  updated_at?: string;
}

export interface RadiologyOrderParameterResult {
  id: number;
  radiology_order_item_id: number;
  medical_service_parameter_id?: number;
  parameter_code_snapshot: string;
  parameter_name_snapshot: string;
  input_type_snapshot: string;
  unit_snapshot: string;
  reference_value_snapshot: string;
  sort_order: number;
  is_required: boolean;
  result_value: string;
  result_notes: string;
  flag: string;
  satusehat_observation_id?: string;
  satusehat_synced_at?: string;
  result_date?: string;
  result_by?: number;
  medical_service_parameter?: MedicalServiceParameter;
  result_by_user?: User;
  created_at?: string;
  updated_at?: string;
}

export interface RadiologyOrderItem {
  id: number;
  medical_record_id: number;
  medical_service_id: number;
  service_code_snapshot: string;
  service_name_snapshot: string;
  template_snapshot: string;
  instructions: string;
  findings: string;
  impression: string;
  recommendation: string;
  result_notes: string;
  satusehat_service_request_id?: string;
  satusehat_observation_id?: string;
  satusehat_diagnostic_report_id?: string;
  satusehat_synced_at?: string;
  result_date?: string;
  result_by?: number;
  medical_service?: MedicalService;
  parameter_results?: RadiologyOrderParameterResult[];
  result_by_user?: User;
  created_at?: string;
  updated_at?: string;
}

export interface InformedConsent {
  id: number;
  medical_record_id: number;
  medical_action_id?: number;
  patient_id: number;
  doctor_id: number;
  action_name: string;
  action_description: string;
  risks: string;
  benefits: string;
  patient_decision: string;
  consent_date: string;
  consent_giver_name: string;
  consent_giver_relation: string;
  consent_giver_id_number: string;
  witness_name: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateInformedConsentPayload {
  action_description: string;
  risks: string;
  benefits: string;
  patient_decision: string;
  consent_date: string;
  consent_giver_name: string;
  consent_giver_relation: string;
  consent_giver_id_number: string;
  witness_name: string;
  notes: string;
}

export interface MedicalActionMutationResponse {
  data: MedicalActionItem;
  odontogram_entry?: OdontogramEntry;
  informed_consent?: InformedConsent;
  removed_informed_consent_id?: number;
}

export interface MedicalActionDeleteResponse {
  message: string;
  removed_informed_consent_id?: number;
}

export interface MedicalRecordPhysicalExamImageMarker {
  id?: number;
  medical_record_image_pick_id?: number;
  marker_label: string;
  pos_x: number;
  pos_y: number;
}

export interface MedicalRecordPhysicalExamImage {
  id?: number;
  medical_record_id?: number;
  physical_exam_image_master_id: number;
  notes: string;
  sort_order: number;
  master?: PhysicalExamImageMaster;
  markers: MedicalRecordPhysicalExamImageMarker[];
}

export interface MedicalRecord {
  id: number;
  visit_id: number;
  patient_id: number;
  doctor_id: number;
  polyclinic_id: number;
  section_type: MedicalRecordSectionType | string;
  entry_group_key: string;
  sheet_key?: MedicalRecordSheetKey | string;
  record_date: string;
  chief_complaint: string;
  history_of_present_illness: string;
  past_medical_history: string;
  past_surgical_history: string;
  family_history: string;
  medication_history: string;
  social_history: string;
  review_of_systems: string;
  clinical_alert: string;
  allergy_notes: string;
  subjective: string;
  bp_systolic: number;
  bp_diastolic: number;
  heart_rate: number;
  temperature: number;
  respiratory_rate: number;
  spo2: number;
  pain_scale_type: string;
  pain_scale: number;
  consciousness: string;
  height: number;
  weight: number;
  bmi: number;
  physical_examination: string;
  supporting_examination: string;
  working_diagnosis: string;
  differential_diagnosis: string;
  assessment: string;
  plan: string;
  follow_up_instruction: string;
  follow_up_at?: string;
  prescription_fulfillment_mode: '' | 'internal' | 'print';
  prescription_workflow_status: '' | 'draft' | 'ordered' | 'preparing' | 'ready' | 'dispensed' | 'printed';
  prescription_ordered_at?: string;
  prescription_processed_at?: string;
  prescription_processed_by?: number;
  laboratory_workflow_status: '' | 'draft' | 'ordered' | 'preparing' | 'completed';
  laboratory_ordered_at?: string;
  laboratory_processed_at?: string;
  laboratory_processed_by?: number;
  radiology_workflow_status: '' | 'draft' | 'ordered' | 'preparing' | 'completed';
  radiology_ordered_at?: string;
  radiology_processed_at?: string;
  radiology_processed_by?: number;
  disposition: string;
  discharge_condition: string;
  referral_destination: string;
  referral_reason: string;
  notes: string;
  status: 'draft' | 'cancelled' | 'final';
  visit?: Visit;
  patient?: Patient;
  doctor?: Doctor;
  polyclinic?: Polyclinic;
  diagnoses?: MedicalRecordDiagnosis[];
  prescriptions?: Prescription[];
  prescription_compounds?: PrescriptionCompound[];
  laboratory_order_items?: LaboratoryOrderItem[];
  radiology_order_items?: RadiologyOrderItem[];
  actions?: MedicalActionItem[];
  physical_exam_images?: MedicalRecordPhysicalExamImage[];
  informed_consents?: InformedConsent[];
  prescription_processor?: User;
  laboratory_processor?: User;
  radiology_processor?: User;
  created_at?: string;
  updated_at?: string;
}

export interface FinalizeVisitPayload {
  follow_up_instruction: string;
  follow_up_at: string;
  disposition: string;
  discharge_condition: string;
  referral_destination: string;
  referral_reason: string;
  notes: string;
}

export interface SatusehatAutoSyncResourceResult {
  resource_type: string;
  medical_record_id?: number;
  status: string;
  message: string;
  resource_id?: string;
  existing_resource_id?: string;
  warnings?: string[];
}

export interface SatusehatVisitAutoSyncResult {
  visit_id: number;
  trigger: string;
  mode?: string;
  executed_at: string;
  job_status?: string;
  error?: string;
  sent_count: number;
  unsent_count: number;
  sent_resources: SatusehatAutoSyncResourceResult[];
  unsent_resources: SatusehatAutoSyncResourceResult[];
  resources: SatusehatAutoSyncResourceResult[];
}

export interface SatusehatAutoSyncVisitResponse {
  message: string;
  data: SatusehatVisitAutoSyncResult;
}

export interface FinalizeVisitResponse {
  message: string;
  satusehat_auto_sync?: SatusehatVisitAutoSyncResult;
}

export interface OdontogramSurfaceFinding {
  id?: number;
  odontogram_tooth_id?: number;
  surface_code: string;
  condition_code: OdontogramSurfaceCondition | string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface OdontogramTooth {
  id?: number;
  odontogram_entry_id?: number;
  tooth_number: string;
  tooth_condition: OdontogramToothCondition | string;
  notes: string;
  sort_order?: number;
  surface_findings?: OdontogramSurfaceFinding[];
  created_at?: string;
  updated_at?: string;
}

export interface OdontogramEntry {
  id: number;
  visit_id: number;
  patient_id: number;
  doctor_id: number;
  polyclinic_id: number;
  sheet_key: 'odontogram' | string;
  chart_type: OdontogramChartType | string;
  notes: string;
  status: OdontogramEntryStatus;
  visit?: Visit;
  patient?: Patient;
  doctor?: Doctor;
  polyclinic?: Polyclinic;
  teeth?: OdontogramTooth[];
  created_at?: string;
  updated_at?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export const medicalRecordsApi = {
  getAll: (params?: string) => api.get(`/medical-records${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/medical-records/${id}`),
  getByVisit: (visitId: number) => api.get(`/medical-records/visit/${visitId}`),
  printInitialAssessmentEntry: (visitId: number, options: { entryGroupKey?: string; recordIds?: number[]; sheetKey?: MedicalRecordSheetKey; autoPrint?: boolean }) => api.get(`/medical-records/visit/${visitId}/print/initial-assessment`, {
    params: {
      ...(options.entryGroupKey ? { entry_group_key: options.entryGroupKey } : {}),
      ...(options.recordIds?.length ? { record_ids: options.recordIds.join(',') } : {}),
      ...(options.sheetKey ? { sheet_key: options.sheetKey } : {}),
      autoprint: options.autoPrint === false ? '0' : '1',
    },
    responseType: 'blob',
  }),
  printMedicalResume: (visitId: number) => api.get(`/medical-records/visit/${visitId}/print/resume-medis`, {
    responseType: 'blob',
  }),
  create: (data: { visit_id: number; section_type: MedicalRecordSectionType; entry_group_key?: string; sheet_key?: MedicalRecordSheetKey }) => api.post('/medical-records', data),
  createInitialAssessmentEntry: (visitId: number, options?: { entryGroupPrefix?: string; sheetKey?: MedicalRecordSheetKey }) => api.post('/medical-records/initial-assessment', {
    visit_id: visitId,
    ...(options?.entryGroupPrefix ? { entry_group_prefix: options.entryGroupPrefix } : {}),
    ...(options?.sheetKey ? { sheet_key: options.sheetKey } : {}),
  }),
  update: (id: number, data: any) => api.put(`/medical-records/${id}`, data),
  cancel: (id: number) => api.post(`/medical-records/${id}/cancel`),
  delete: (id: number) => api.delete(`/medical-records/${id}`),
  finalize: (id: number) => api.post(`/medical-records/${id}/finalize`),
  finalizeVisit: (visitId: number, data: FinalizeVisitPayload) => api.post<FinalizeVisitResponse>(`/medical-records/visit/${visitId}/finalize`, data),
  cancelFinalization: (visitId: number) => api.post(`/medical-records/visit/${visitId}/unfinalize`),
  // Diagnoses
  addDiagnosis: (id: number, data: any) => api.post(`/medical-records/${id}/diagnoses`, data),
  deleteDiagnosis: (id: number, diagnosisId: number) => api.delete(`/medical-records/${id}/diagnoses/${diagnosisId}`),
  // Prescriptions
  addPrescription: (id: number, data: any) => api.post(`/medical-records/${id}/prescriptions`, data),
  deletePrescription: (id: number, prescriptionId: number) => api.delete(`/medical-records/${id}/prescriptions/${prescriptionId}`),
  addPrescriptionCompound: (id: number, data: any) => api.post(`/medical-records/${id}/prescription-compounds`, data),
  deletePrescriptionCompound: (id: number, compoundId: number) => api.delete(`/medical-records/${id}/prescription-compounds/${compoundId}`),
  submitPrescriptionOrder: (id: number) => api.post(`/medical-records/${id}/prescriptions/submit`),
  cancelPrescriptionOrder: (id: number) => api.post(`/medical-records/${id}/prescriptions/cancel`),
  preparePrescriptionOrder: (id: number) => api.post(`/medical-records/${id}/prescriptions/prepare`),
  readyPrescriptionOrder: (id: number) => api.post(`/medical-records/${id}/prescriptions/ready`),
  dispensePrescriptionOrder: (id: number) => api.post(`/medical-records/${id}/prescriptions/dispense`),
  printPharmacyTicket: (id: number) => api.get(`/medical-records/${id}/print/pharmacy-ticket`, {
    responseType: 'blob',
  }),
  printPrescriptionOrder: (id: number) => api.get(`/medical-records/${id}/print/prescription`, {
    responseType: 'blob',
  }),
  // Laboratory Orders
  addLaboratoryOrderItem: (id: number, data: any) => api.post(`/medical-records/${id}/laboratory/items`, data),
  deleteLaboratoryOrderItem: (id: number, itemId: number) => api.delete(`/medical-records/${id}/laboratory/items/${itemId}`),
  submitLaboratoryOrder: (id: number) => api.post(`/medical-records/${id}/laboratory/submit`),
  cancelLaboratoryOrder: (id: number) => api.post(`/medical-records/${id}/laboratory/cancel`),
  printLaboratoryOrderTicket: (id: number) => api.get(`/medical-records/${id}/print/laboratory-ticket`, {
    responseType: 'blob',
  }),
  printLaboratoryOrderResult: (id: number) => api.get(`/medical-records/${id}/print/laboratory-result`, {
    responseType: 'blob',
  }),
  // Radiology Orders
  addRadiologyOrderItem: (id: number, data: any) => api.post(`/medical-records/${id}/radiology/items`, data),
  deleteRadiologyOrderItem: (id: number, itemId: number) => api.delete(`/medical-records/${id}/radiology/items/${itemId}`),
  submitRadiologyOrder: (id: number) => api.post(`/medical-records/${id}/radiology/submit`),
  cancelRadiologyOrder: (id: number) => api.post(`/medical-records/${id}/radiology/cancel`),
  printRadiologyOrderTicket: (id: number) => api.get(`/medical-records/${id}/print/radiology-ticket`, {
    responseType: 'blob',
  }),
  printRadiologyOrderResult: (id: number) => api.get(`/medical-records/${id}/print/radiology-result`, {
    responseType: 'blob',
  }),
  // Actions
  addAction: (id: number, data: MedicalActionMutationPayload) => api.post<MedicalActionMutationResponse>(`/medical-records/${id}/actions`, data),
  updateAction: (id: number, actionId: number, data: MedicalActionMutationPayload) => api.put<MedicalActionMutationResponse>(`/medical-records/${id}/actions/${actionId}`, data),
  deleteAction: (id: number, actionId: number) => api.delete<MedicalActionDeleteResponse>(`/medical-records/${id}/actions/${actionId}`),
  printProcedureRecord: (id: number) => api.get(`/medical-records/${id}/print/procedure`, {
    responseType: 'blob',
  }),
  // Patient history
  getByPatient: (patientId: number) => api.get(`/patients/${patientId}/medical-records`),
};

export const informedConsentsApi = {
  print: (id: number) => api.get(`/informed-consents/${id}/print`, { responseType: 'blob' }),
  update: (id: number, data: UpdateInformedConsentPayload) => api.put<{ data: InformedConsent }>(`/informed-consents/${id}`, data),
};

export const odontogramApi = {
  getByVisit: (visitId: number) => api.get<{ data: OdontogramEntry[] }>(`/odontogram-entries/visit/${visitId}`),
  create: (data: { visit_id: number; chart_type?: OdontogramChartType; notes?: string }) => api.post<{ data: OdontogramEntry }>(`/odontogram-entries`, data),
  update: (id: number, data: { chart_type?: OdontogramChartType; notes?: string; teeth: Array<{ tooth_number: string; tooth_condition: OdontogramToothCondition | string; notes: string; surface_findings: Array<{ surface_code: string; condition_code: OdontogramSurfaceCondition | string; notes: string }> }> }) => api.put<{ data: OdontogramEntry }>(`/odontogram-entries/${id}`, data),
  cancel: (id: number) => api.post<{ data: OdontogramEntry }>(`/odontogram-entries/${id}/cancel`),
  delete: (id: number) => api.delete(`/odontogram-entries/${id}`),
  print: (id: number) => api.get(`/odontogram-entries/${id}/print`, { responseType: 'blob' }),
};

export const pharmacyApi = {
  getPrescriptionOrders: (params?: string) => api.get<PaginatedResponse<MedicalRecord>>(`/pharmacy/prescription-orders${params ? `?${params}` : ''}`),
  addPrescription: (id: number, data: any) => api.post(`/medical-records/${id}/pharmacy/prescriptions`, data),
  deletePrescription: (id: number, prescriptionId: number) => api.delete(`/medical-records/${id}/pharmacy/prescriptions/${prescriptionId}`),
  returnOrder: (id: number) => api.post(`/medical-records/${id}/prescriptions/return`),
};

export const laboratoryApi = {
  getOrders: (params?: string) => api.get<PaginatedResponse<MedicalRecord>>(`/laboratory/orders${params ? `?${params}` : ''}`),
  addItem: (id: number, data: any) => api.post(`/medical-records/${id}/laboratory/items`, data),
  deleteItem: (id: number, itemId: number) => api.delete(`/medical-records/${id}/laboratory/items/${itemId}`),
  prepareOrder: (id: number) => api.post(`/medical-records/${id}/laboratory/prepare`),
  returnOrder: (id: number) => api.post(`/medical-records/${id}/laboratory/return`),
  updateResults: (id: number, data: any) => api.put(`/medical-records/${id}/laboratory/results`, data),
  completeOrder: (id: number) => api.post(`/medical-records/${id}/laboratory/complete`),
};

export const radiologyApi = {
  getOrders: (params?: string) => api.get<PaginatedResponse<MedicalRecord>>(`/radiology/orders${params ? `?${params}` : ''}`),
  addItem: (id: number, data: any) => api.post(`/medical-records/${id}/radiology/items`, data),
  deleteItem: (id: number, itemId: number) => api.delete(`/medical-records/${id}/radiology/items/${itemId}`),
  prepareOrder: (id: number) => api.post(`/medical-records/${id}/radiology/prepare`),
  returnOrder: (id: number) => api.post(`/medical-records/${id}/radiology/return`),
  updateResults: (id: number, data: any) => api.put(`/medical-records/${id}/radiology/results`, data),
  completeOrder: (id: number) => api.post(`/medical-records/${id}/radiology/complete`),
};

// ========================
// Billing / Kasir
// ========================

export interface InvoiceItem {
  id: number;
  item_type: string;
  reference_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total_price: number;
}

export interface Payment {
  id: number;
  invoice_id: number;
  payment_method_id: number;
  amount: number;
  payment_date: string;
  reference_number: string;
  received_by: number;
  notes: string;
  payment_method?: PaymentMethod;
  receiver?: User;
  created_at?: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  visit_id: number;
  patient_id: number;
  invoice_date: string;
  sub_total: number;
  discount: number;
  discount_type: string;
  tax: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  notes: string;
  created_at: string;
  visit?: Visit;
  patient?: Patient;
  items?: InvoiceItem[];
  payments?: Payment[];
}

export interface CashierQueueItem {
  visit: Visit;
  has_invoice: boolean;
  invoice_id: number;
  invoice_status: string;
  total_amount: number;
  paid_amount: number;
}

export interface BillingStats {
  date: string;
  total_invoices: number;
  unpaid: number;
  partial: number;
  paid: number;
  total_revenue: number;
  pending_amount: number;
}

export const billingApi = {
  getAll: (params?: string) => api.get<{ data: Invoice[]; total: number; page: number; per_page: number }>(`/invoices${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get<{ data: Invoice }>(`/invoices/${id}`),
  getByVisit: (visitId: number) => api.get<{ data: Invoice }>(`/invoices/visit/${visitId}`),
  syncVisit: (visitId: number) => api.post<{ data: Invoice; message: string }>(`/invoices/visit/${visitId}/sync`),
  update: (id: number, data: { discount: number; discount_type: string; tax: number; notes: string }) => api.put(`/invoices/${id}`, data),
  pay: (id: number, data: { payment_method_id: number; amount: number; reference_number?: string; notes?: string }) => api.post<{ data: Payment; status: string; message: string }>(`/invoices/${id}/pay`, data),
  print: (id: number) => api.get(`/invoices/${id}/print`, { responseType: 'blob' }),
  getQueue: (date?: string, search?: string) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (search) params.append('search', search);
    return api.get<{ data: CashierQueueItem[] }>(`/invoices/queue?${params.toString()}`);
  },
  getStats: (date?: string) => {
    const params = date ? `?date=${date}` : '';
    return api.get<BillingStats>(`/invoices/stats${params}`);
  },
};
