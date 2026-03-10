import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

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

  uploadLogo: (file: File, type: 'logo' | 'favicon') => {
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

// ========================
// Phase 1: Master Data APIs
// ========================

export interface Polyclinic {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  color: string;
  icon: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface Doctor {
  id: number;
  user_id?: number;
  full_name: string;
  sip_number: string;
  specialization: string;
  phone: string;
  photo: string;
  is_active: boolean;
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
  category?: MedicineCategory;
  unit?: Unit;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceCategory {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface MedicalService {
  id: number;
  code: string;
  name: string;
  category_id: number;
  polyclinic_id?: number;
  price: number;
  is_active: boolean;
  description: string;
  category?: ServiceCategory;
  polyclinic?: Polyclinic;
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

export interface ICD10 {
  id: number;
  code: string;
  name: string;
  name_id: string;
  category: string;
  chapter: string;
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
  getById: (id: number) => api.get(`/medicines/${id}`),
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

export const serviceCategoriesApi = {
  getAll: () => api.get('/service-categories'),
  getById: (id: number) => api.get(`/service-categories/${id}`),
  create: (data: any) => api.post('/service-categories', data),
  update: (id: number, data: any) => api.put(`/service-categories/${id}`, data),
  delete: (id: number) => api.delete(`/service-categories/${id}`),
};

export const paymentMethodsApi = {
  getAll: () => api.get('/payment-methods'),
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
  registered_by: number;
  patient?: Patient;
  polyclinic?: Polyclinic;
  doctor?: Doctor;
  registered_by_user?: User;
  created_at?: string;
  updated_at?: string;
}

export const patientsApi = {
  getAll: (params?: string) => api.get(`/patients${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/patients/${id}`),
  getHistory: (id: number) => api.get(`/patients/${id}/history`),
  create: (data: any) => api.post('/patients', data),
  update: (id: number, data: any) => api.put(`/patients/${id}`, data),
  delete: (id: number) => api.delete(`/patients/${id}`),
};

export const visitsApi = {
  getAll: (params?: string) => api.get(`/visits${params ? `?${params}` : ''}`),
  getToday: (params?: string) => api.get(`/visits/today${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/visits/${id}`),
  create: (data: any) => api.post('/visits', data),
  update: (id: number, data: any) => api.put(`/visits/${id}`, data),
  delete: (id: number) => api.delete(`/visits/${id}`),
  updateStatus: (id: number, data: { queue_status?: string; status?: string }) => api.patch(`/visits/${id}/status`, data),
};

export const queueApi = {
  getByPolyclinic: (polyclinicId: number) => api.get(`/queue/${polyclinicId}`),
  callNext: (polyclinicId: number) => api.post(`/queue/${polyclinicId}/call-next`),
};

// ========================
// Phase 3: EMR (Electronic Medical Record)
// ========================

export interface MedicalRecordDiagnosis {
  id: number;
  medical_record_id: number;
  icd10_id: number;
  diagnosis_type: 'primer' | 'sekunder';
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
  medicine?: Medicine;
}

export interface MedicalActionItem {
  id: number;
  medical_record_id: number;
  medical_service_id: number;
  doctor_id: number;
  notes: string;
  quantity: number;
  price: number;
  medical_service?: MedicalService;
  doctor?: Doctor;
}

export interface InformedConsent {
  id: number;
  medical_record_id: number;
  patient_id: number;
  doctor_id: number;
  action_name: string;
  action_description: string;
  risks: string;
  benefits: string;
  patient_decision: string;
  consent_date: string;
  witness_name: string;
  notes: string;
}

export interface MedicalRecord {
  id: number;
  visit_id: number;
  patient_id: number;
  doctor_id: number;
  polyclinic_id: number;
  record_date: string;
  chief_complaint: string;
  history_of_present_illness: string;
  clinical_alert: string;
  allergy_notes: string;
  subjective: string;
  bp_systolic: number;
  bp_diastolic: number;
  heart_rate: number;
  temperature: number;
  respiratory_rate: number;
  spo2: number;
  pain_scale: number;
  consciousness: string;
  height: number;
  weight: number;
  bmi: number;
  physical_examination: string;
  assessment: string;
  plan: string;
  follow_up_instruction: string;
  follow_up_at?: string;
  notes: string;
  status: 'draft' | 'final';
  visit?: Visit;
  patient?: Patient;
  doctor?: Doctor;
  polyclinic?: Polyclinic;
  diagnoses?: MedicalRecordDiagnosis[];
  prescriptions?: Prescription[];
  actions?: MedicalActionItem[];
  informed_consents?: InformedConsent[];
  created_at?: string;
  updated_at?: string;
}

export const medicalRecordsApi = {
  getAll: (params?: string) => api.get(`/medical-records${params ? `?${params}` : ''}`),
  getById: (id: number) => api.get(`/medical-records/${id}`),
  getByVisit: (visitId: number) => api.get(`/medical-records/visit/${visitId}`),
  create: (data: { visit_id: number }) => api.post('/medical-records', data),
  update: (id: number, data: any) => api.put(`/medical-records/${id}`, data),
  finalize: (id: number) => api.post(`/medical-records/${id}/finalize`),
  // Diagnoses
  addDiagnosis: (id: number, data: any) => api.post(`/medical-records/${id}/diagnoses`, data),
  deleteDiagnosis: (id: number, diagnosisId: number) => api.delete(`/medical-records/${id}/diagnoses/${diagnosisId}`),
  // Prescriptions
  addPrescription: (id: number, data: any) => api.post(`/medical-records/${id}/prescriptions`, data),
  deletePrescription: (id: number, prescriptionId: number) => api.delete(`/medical-records/${id}/prescriptions/${prescriptionId}`),
  // Actions
  addAction: (id: number, data: any) => api.post(`/medical-records/${id}/actions`, data),
  deleteAction: (id: number, actionId: number) => api.delete(`/medical-records/${id}/actions/${actionId}`),
  // Patient history
  getByPatient: (patientId: number) => api.get(`/patients/${patientId}/medical-records`),
};
