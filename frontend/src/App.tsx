import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './lib/store';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute as PermissionGuard } from './components/protected-route';
import { Toaster } from '@/components/ui/toaster';
import { Loader2 } from 'lucide-react';
import PharmacyIndex from './pages/pharmacy/index';
import PharmacyReceiveIndex from './pages/pharmacy/receive/index';
import PharmacyProcessIndex from './pages/pharmacy/process/index';
import PharmacyHandoverIndex from './pages/pharmacy/handover/index';
import PharmacyCompletedIndex from './pages/pharmacy/completed/index';
import LaboratoryIndex from './pages/laboratory/index';
import LaboratoryReceiveIndex from './pages/laboratory/receive/index';
import LaboratoryProcessIndex from './pages/laboratory/process/index';
import LaboratoryCompletedIndex from './pages/laboratory/completed/index';
import RadiologyIndex from './pages/radiology/index';
import RadiologyReceiveIndex from './pages/radiology/receive/index';
import RadiologyProcessIndex from './pages/radiology/process/index';
import RadiologyCompletedIndex from './pages/radiology/completed/index';
import KasirIndex from './pages/kasir/index';
import KasirDetail from './pages/kasir/detail';

// Lazy load pages
const LoginPage = lazy(() => import('./pages/auth/login'));
const PublicTteVerifyPage = lazy(() => import('./pages/public/tte-verify'));
const DashboardPage = lazy(() => import('./pages/dashboard/index'));
const ReportsPage = lazy(() => import('./pages/reports/index'));
const AccountPage = lazy(() => import('./pages/account/index'));
const SettingsPage = lazy(() => import('./pages/settings/index'));
const IntegrationSettingsPage = lazy(() => import('./pages/settings/integrations'));
const OperationsGuidePage = lazy(() => import('./pages/settings/operations'));
const TermsAndConditionsPage = lazy(() => import('./pages/settings/terms-and-conditions'));
const VersioningPage = lazy(() => import('./pages/settings/versioning'));
const TTERequestsPage = lazy(() => import('./pages/tte-requests/index'));

// Users
const UsersIndex = lazy(() => import('./pages/users/index'));
const UsersCreate = lazy(() => import('./pages/users/create'));
const UsersEdit = lazy(() => import('./pages/users/edit'));
const UsersShow = lazy(() => import('./pages/users/show'));

// Roles
const RolesIndex = lazy(() => import('./pages/roles/index'));
const RolesCreate = lazy(() => import('./pages/roles/create'));
const RolesEdit = lazy(() => import('./pages/roles/edit'));
const RolesShow = lazy(() => import('./pages/roles/show'));

// Permissions
const PermissionsIndex = lazy(() => import('./pages/permissions/index'));
const PermissionsCreate = lazy(() => import('./pages/permissions/create'));
const PermissionsEdit = lazy(() => import('./pages/permissions/edit'));
const PermissionsShow = lazy(() => import('./pages/permissions/show'));

// Polyclinics
const PolyclinicsIndex = lazy(() => import('./pages/polyclinics/index'));
const PolyclinicsCreate = lazy(() => import('./pages/polyclinics/create'));
const PolyclinicsEdit = lazy(() => import('./pages/polyclinics/edit'));
const PolyclinicsShow = lazy(() => import('./pages/polyclinics/show'));

// Doctors
const EmployeesIndex = lazy(() => import('./pages/employees/index'));
const EmployeesCreate = lazy(() => import('./pages/employees/create'));
const EmployeesEdit = lazy(() => import('./pages/employees/edit'));
const EmployeesShow = lazy(() => import('./pages/employees/show'));
const DoctorsIndex = lazy(() => import('./pages/doctors/index'));
const DoctorsCreate = lazy(() => import('./pages/doctors/create'));
const DoctorsEdit = lazy(() => import('./pages/doctors/edit'));
const DoctorsShow = lazy(() => import('./pages/doctors/show'));

// Medicine Categories
const MedicineCategoriesIndex = lazy(() => import('./pages/medicine-categories/index'));
const MedicineCategoriesCreate = lazy(() => import('./pages/medicine-categories/create'));
const MedicineCategoriesEdit = lazy(() => import('./pages/medicine-categories/edit'));
const MedicineCategoriesShow = lazy(() => import('./pages/medicine-categories/show'));

// Units
const UnitsIndex = lazy(() => import('./pages/units/index'));
const UnitsCreate = lazy(() => import('./pages/units/create'));
const UnitsEdit = lazy(() => import('./pages/units/edit'));
const UnitsShow = lazy(() => import('./pages/units/show'));

// Medicines
const MedicinesIndex = lazy(() => import('./pages/medicines/index'));
const MedicinesCreate = lazy(() => import('./pages/medicines/create'));
const MedicinesEdit = lazy(() => import('./pages/medicines/edit'));
const MedicinesShow = lazy(() => import('./pages/medicines/show'));

// Service Categories
const ServiceCategoriesIndex = lazy(() => import('./pages/service-categories/index'));
const ServiceCategoriesCreate = lazy(() => import('./pages/service-categories/create'));
const ServiceCategoriesEdit = lazy(() => import('./pages/service-categories/edit'));
const ServiceCategoriesShow = lazy(() => import('./pages/service-categories/show'));

// Medical Services
const MedicalServicesIndex = lazy(() => import('./pages/medical-services/index'));
const MedicalServicesCreate = lazy(() => import('./pages/medical-services/create'));
const MedicalServicesEdit = lazy(() => import('./pages/medical-services/edit'));
const MedicalServicesShow = lazy(() => import('./pages/medical-services/show'));
const SpecimenTemplatesIndex = lazy(() => import('./pages/specimen-templates/index'));
const SpecimenTemplatesCreate = lazy(() => import('./pages/specimen-templates/create'));
const SpecimenTemplatesEdit = lazy(() => import('./pages/specimen-templates/edit'));
const SpecimenTemplatesShow = lazy(() => import('./pages/specimen-templates/show'));

// Payment Methods
const PaymentMethodsIndex = lazy(() => import('./pages/payment-methods/index'));
const PaymentMethodsCreate = lazy(() => import('./pages/payment-methods/create'));
const PaymentMethodsEdit = lazy(() => import('./pages/payment-methods/edit'));
const PaymentMethodsShow = lazy(() => import('./pages/payment-methods/show'));

// Suppliers
const SuppliersIndex = lazy(() => import('./pages/suppliers/index'));
const SuppliersCreate = lazy(() => import('./pages/suppliers/create'));
const SuppliersEdit = lazy(() => import('./pages/suppliers/edit'));
const SuppliersShow = lazy(() => import('./pages/suppliers/show'));

// Physical Exam Images
const PhysicalExamImagesIndex = lazy(() => import('./pages/physical-exam-images/index'));
const PhysicalExamImagesCreate = lazy(() => import('./pages/physical-exam-images/create'));
const PhysicalExamImagesEdit = lazy(() => import('./pages/physical-exam-images/edit'));

// Purchasing
const PurchasingIndex = lazy(() => import('./pages/purchasing/index'));
const PurchasingCreate = lazy(() => import('./pages/purchasing/create'));
const PurchasingEdit = lazy(() => import('./pages/purchasing/edit'));
const PurchasingShow = lazy(() => import('./pages/purchasing/show'));

// Patients
const PatientsIndex = lazy(() => import('./pages/patients/index'));
const PatientsCreate = lazy(() => import('./pages/patients/create'));
const PatientsEdit = lazy(() => import('./pages/patients/edit'));
const PatientsShow = lazy(() => import('./pages/patients/show'));
const PatientSearchIndex = lazy(() => import('./pages/patient-search/index'));
const PatientSearchDetail = lazy(() => import('./pages/patient-search/detail'));

// Registration & Queue
const RegistrationIndex = lazy(() => import('./pages/registration/index'));
const RegistrationCreate = lazy(() => import('./pages/registration/create'));
const ControlSchedulesPage = lazy(() => import('./pages/control-schedules/index'));
const QueueDashboard = lazy(() => import('./pages/queue/index'));
const QueueDisplay = lazy(() => import('./pages/queue/display'));

// EMR (Electronic Medical Records)
const EMRIndex = lazy(() => import('./pages/emr/index'));
const EMRForm = lazy(() => import('./pages/emr/form'));
const EMRSheet = lazy(() => import('./pages/emr/sheet'));
const EMRWorkspace = lazy(() => import('./pages/emr/workspace'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <AppLayout>{children}</AppLayout>;
}

function FullscreenProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <div className="min-h-screen bg-background">{children}</div>;
}

function App() {
  // Load theme on app start
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tte/verify" element={<PublicTteVerifyPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><PermissionGuard permission="reports.view"><ReportsPage /></PermissionGuard></ProtectedRoute>} />
          <Route path="/tte-requests" element={<ProtectedRoute><PermissionGuard permission="document_signatures.approve"><TTERequestsPage /></PermissionGuard></ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><PermissionGuard permission="settings.view"><SettingsPage /></PermissionGuard></ProtectedRoute>} />
          <Route path="/settings/integrations" element={<ProtectedRoute><PermissionGuard permission="settings.update"><IntegrationSettingsPage /></PermissionGuard></ProtectedRoute>} />
          <Route path="/settings/operations" element={<ProtectedRoute><PermissionGuard permission="settings.view"><OperationsGuidePage /></PermissionGuard></ProtectedRoute>} />
          <Route path="/settings/terms-and-conditions" element={<ProtectedRoute><PermissionGuard permission="settings.view"><TermsAndConditionsPage /></PermissionGuard></ProtectedRoute>} />
          <Route path="/settings/versioning" element={<ProtectedRoute><PermissionGuard permission="settings.view"><VersioningPage /></PermissionGuard></ProtectedRoute>} />
          
          {/* Users */}
          <Route path="/users" element={<ProtectedRoute><UsersIndex /></ProtectedRoute>} />
          <Route path="/users/create" element={
            <ProtectedRoute>
              <PermissionGuard permission="users.create">
                <UsersCreate />
              </PermissionGuard>
            </ProtectedRoute>
          } />
          <Route path="/users/:id" element={<ProtectedRoute><UsersShow /></ProtectedRoute>} />
          <Route path="/users/:id/edit" element={
            <ProtectedRoute>
              <PermissionGuard permission="users.update">
                <UsersEdit />
              </PermissionGuard>
            </ProtectedRoute>
          } />
          
          {/* Roles */}
          <Route path="/roles" element={<ProtectedRoute><RolesIndex /></ProtectedRoute>} />
          <Route path="/roles/create" element={
            <ProtectedRoute>
              <PermissionGuard permission="roles.create">
                <RolesCreate />
              </PermissionGuard>
            </ProtectedRoute>
          } />
          <Route path="/roles/:id" element={<ProtectedRoute><RolesShow /></ProtectedRoute>} />
          <Route path="/roles/:id/edit" element={
            <ProtectedRoute>
              <PermissionGuard permission="roles.update">
                <RolesEdit />
              </PermissionGuard>
            </ProtectedRoute>
          } />
          
          {/* Permissions */}
          <Route path="/permissions" element={<ProtectedRoute><PermissionsIndex /></ProtectedRoute>} />
          <Route path="/permissions/create" element={
            <ProtectedRoute>
              <PermissionGuard permission="permissions.create">
                <PermissionsCreate />
              </PermissionGuard>
            </ProtectedRoute>
          } />
          <Route path="/permissions/:id" element={<ProtectedRoute><PermissionsShow /></ProtectedRoute>} />
          <Route path="/permissions/:id/edit" element={
            <ProtectedRoute>
              <PermissionGuard permission="permissions.update">
                <PermissionsEdit />
              </PermissionGuard>
            </ProtectedRoute>
          } />

          {/* Polyclinics */}
          <Route path="/polyclinics" element={<ProtectedRoute><PolyclinicsIndex /></ProtectedRoute>} />
          <Route path="/polyclinics/create" element={<ProtectedRoute><PermissionGuard permission="polyclinics.create"><PolyclinicsCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/polyclinics/:id" element={<ProtectedRoute><PolyclinicsShow /></ProtectedRoute>} />
          <Route path="/polyclinics/:id/edit" element={<ProtectedRoute><PermissionGuard permission="polyclinics.update"><PolyclinicsEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Employees */}
          <Route path="/employees" element={<ProtectedRoute><PermissionGuard permission="employees.view"><EmployeesIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/employees/create" element={<ProtectedRoute><PermissionGuard permission="employees.create"><EmployeesCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/employees/:id" element={<ProtectedRoute><PermissionGuard permission="employees.view"><EmployeesShow /></PermissionGuard></ProtectedRoute>} />
          <Route path="/employees/:id/edit" element={<ProtectedRoute><PermissionGuard permission="employees.update"><EmployeesEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Doctors */}
          <Route path="/doctors" element={<ProtectedRoute><DoctorsIndex /></ProtectedRoute>} />
          <Route path="/doctors/create" element={<ProtectedRoute><PermissionGuard permission="doctors.create"><DoctorsCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/doctors/:id" element={<ProtectedRoute><DoctorsShow /></ProtectedRoute>} />
          <Route path="/doctors/:id/edit" element={<ProtectedRoute><PermissionGuard permission="doctors.update"><DoctorsEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Medicine Categories */}
          <Route path="/medicine-categories" element={<ProtectedRoute><MedicineCategoriesIndex /></ProtectedRoute>} />
          <Route path="/medicine-categories/create" element={<ProtectedRoute><PermissionGuard permission="medicine_categories.create"><MedicineCategoriesCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/medicine-categories/:id" element={<ProtectedRoute><MedicineCategoriesShow /></ProtectedRoute>} />
          <Route path="/medicine-categories/:id/edit" element={<ProtectedRoute><PermissionGuard permission="medicine_categories.update"><MedicineCategoriesEdit /></PermissionGuard></ProtectedRoute>} />
          {/* Units */}
          <Route path="/units" element={<ProtectedRoute><UnitsIndex /></ProtectedRoute>} />
          <Route path="/units/create" element={<ProtectedRoute><PermissionGuard permission="units.create"><UnitsCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/units/:id" element={<ProtectedRoute><UnitsShow /></ProtectedRoute>} />
          <Route path="/units/:id/edit" element={<ProtectedRoute><PermissionGuard permission="units.update"><UnitsEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Medicines */}
          <Route path="/medicines" element={<ProtectedRoute><MedicinesIndex /></ProtectedRoute>} />
          <Route path="/medicines/create" element={<ProtectedRoute><PermissionGuard permission="medicines.create"><MedicinesCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/medicines/:id" element={<ProtectedRoute><MedicinesShow /></ProtectedRoute>} />
          <Route path="/medicines/:id/edit" element={<ProtectedRoute><PermissionGuard permission="medicines.update"><MedicinesEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Service Categories */}
          <Route path="/service-categories" element={<ProtectedRoute><ServiceCategoriesIndex /></ProtectedRoute>} />
          <Route path="/service-categories/create" element={<ProtectedRoute><PermissionGuard permission="service_categories.create"><ServiceCategoriesCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/service-categories/:id" element={<ProtectedRoute><ServiceCategoriesShow /></ProtectedRoute>} />
          <Route path="/service-categories/:id/edit" element={<ProtectedRoute><PermissionGuard permission="service_categories.update"><ServiceCategoriesEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Medical Services */}
          <Route path="/medical-services" element={<ProtectedRoute><MedicalServicesIndex /></ProtectedRoute>} />
          <Route path="/medical-services/create" element={<ProtectedRoute><PermissionGuard permission="medical_services.create"><MedicalServicesCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/medical-services/:id" element={<ProtectedRoute><MedicalServicesShow /></ProtectedRoute>} />
          <Route path="/medical-services/:id/edit" element={<ProtectedRoute><PermissionGuard permission="medical_services.update"><MedicalServicesEdit /></PermissionGuard></ProtectedRoute>} />
          <Route path="/specimen-templates" element={<ProtectedRoute><SpecimenTemplatesIndex /></ProtectedRoute>} />
          <Route path="/specimen-templates/create" element={<ProtectedRoute><PermissionGuard permission="medical_services.create"><SpecimenTemplatesCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/specimen-templates/:id" element={<ProtectedRoute><SpecimenTemplatesShow /></ProtectedRoute>} />
          <Route path="/specimen-templates/:id/edit" element={<ProtectedRoute><PermissionGuard permission="medical_services.update"><SpecimenTemplatesEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Payment Methods */}
          <Route path="/payment-methods" element={<ProtectedRoute><PaymentMethodsIndex /></ProtectedRoute>} />
          <Route path="/payment-methods/create" element={<ProtectedRoute><PermissionGuard permission="payment_methods.create"><PaymentMethodsCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/payment-methods/:id" element={<ProtectedRoute><PaymentMethodsShow /></ProtectedRoute>} />
          <Route path="/payment-methods/:id/edit" element={<ProtectedRoute><PermissionGuard permission="payment_methods.update"><PaymentMethodsEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Suppliers */}
          <Route path="/suppliers" element={<ProtectedRoute><SuppliersIndex /></ProtectedRoute>} />
          <Route path="/suppliers/create" element={<ProtectedRoute><PermissionGuard permission="suppliers.create"><SuppliersCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/suppliers/:id" element={<ProtectedRoute><SuppliersShow /></ProtectedRoute>} />
          <Route path="/suppliers/:id/edit" element={<ProtectedRoute><PermissionGuard permission="suppliers.update"><SuppliersEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Physical Exam Images */}
          <Route path="/physical-exam-images" element={<ProtectedRoute><PermissionGuard permission="physical_exam_images.view"><PhysicalExamImagesIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/physical-exam-images/create" element={<ProtectedRoute><PermissionGuard permission="physical_exam_images.create"><PhysicalExamImagesCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/physical-exam-images/:id/edit" element={<ProtectedRoute><PermissionGuard permission="physical_exam_images.update"><PhysicalExamImagesEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Purchasing */}
          <Route path="/purchasing" element={<ProtectedRoute><PurchasingIndex /></ProtectedRoute>} />
          <Route path="/purchasing/create" element={<ProtectedRoute><PermissionGuard permission="purchase_orders.create"><PurchasingCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/purchasing/:id" element={<ProtectedRoute><PurchasingShow /></ProtectedRoute>} />
          <Route path="/purchasing/:id/edit" element={<ProtectedRoute><PermissionGuard permission="purchase_orders.update"><PurchasingEdit /></PermissionGuard></ProtectedRoute>} />

          {/* Patients */}
          <Route path="/patients" element={<ProtectedRoute><PatientsIndex /></ProtectedRoute>} />
          <Route path="/patients/create" element={<ProtectedRoute><PermissionGuard permission="patients.create"><PatientsCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/patients/:id" element={<ProtectedRoute><PatientsShow /></ProtectedRoute>} />
          <Route path="/patients/:id/edit" element={<ProtectedRoute><PermissionGuard permission="patients.update"><PatientsEdit /></PermissionGuard></ProtectedRoute>} />
          <Route path="/patient-search" element={<ProtectedRoute><PermissionGuard permission="patients.view"><PatientSearchIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/patient-search/:id" element={<ProtectedRoute><PermissionGuard permission="patients.view"><PatientSearchDetail /></PermissionGuard></ProtectedRoute>} />

          {/* Registration */}
          <Route path="/registration" element={<ProtectedRoute><RegistrationIndex /></ProtectedRoute>} />
          <Route path="/registration/create" element={<ProtectedRoute><PermissionGuard permission="visits.create"><RegistrationCreate /></PermissionGuard></ProtectedRoute>} />
          <Route path="/control-schedules" element={<ProtectedRoute><PermissionGuard permission="visits.view"><ControlSchedulesPage /></PermissionGuard></ProtectedRoute>} />

          {/* Queue Dashboard */}
          <Route path="/queue" element={<ProtectedRoute><PermissionGuard permission="queue.view"><QueueDashboard /></PermissionGuard></ProtectedRoute>} />
          <Route path="/queue/display" element={<FullscreenProtectedRoute><PermissionGuard permission="queue.view"><QueueDisplay /></PermissionGuard></FullscreenProtectedRoute>} />

          {/* EMR */}
          <Route path="/emr" element={<ProtectedRoute><EMRIndex /></ProtectedRoute>} />
          <Route path="/emr/:id" element={<ProtectedRoute><PermissionGuard permission="medical_records.view"><EMRWorkspace /></PermissionGuard></ProtectedRoute>} />
          <Route path="/emr/:id/sheets/:sheet" element={<ProtectedRoute><PermissionGuard permission="medical_records.view"><EMRSheet /></PermissionGuard></ProtectedRoute>} />
          <Route path="/emr/:id/form/:section" element={<ProtectedRoute><PermissionGuard permission="medical_records.view"><EMRForm /></PermissionGuard></ProtectedRoute>} />

          {/* Pharmacy */}
          <Route path="/pharmacy" element={<ProtectedRoute><PermissionGuard permission={["pharmacy.view", "pharmacy.process", "prescriptions.view", "prescriptions.process"]}><PharmacyIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/pharmacy/receive" element={<ProtectedRoute><PermissionGuard permission={["pharmacy.view", "pharmacy.process", "prescriptions.view", "prescriptions.process"]}><PharmacyReceiveIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/pharmacy/process" element={<ProtectedRoute><PermissionGuard permission={["pharmacy.view", "pharmacy.process", "prescriptions.view", "prescriptions.process"]}><PharmacyProcessIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/pharmacy/handover" element={<ProtectedRoute><PermissionGuard permission={["pharmacy.view", "pharmacy.process", "prescriptions.view", "prescriptions.process"]}><PharmacyHandoverIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/pharmacy/completed" element={<ProtectedRoute><PermissionGuard permission={["pharmacy.view", "pharmacy.process", "prescriptions.view", "prescriptions.process"]}><PharmacyCompletedIndex /></PermissionGuard></ProtectedRoute>} />

          {/* Laboratory */}
          <Route path="/laboratory" element={<ProtectedRoute><PermissionGuard permission={["laboratory.view", "laboratory.process"]}><LaboratoryIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/laboratory/receive" element={<ProtectedRoute><PermissionGuard permission={["laboratory.view", "laboratory.process"]}><LaboratoryReceiveIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/laboratory/process" element={<ProtectedRoute><PermissionGuard permission={["laboratory.view", "laboratory.process"]}><LaboratoryProcessIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/laboratory/completed" element={<ProtectedRoute><PermissionGuard permission={["laboratory.view", "laboratory.process"]}><LaboratoryCompletedIndex /></PermissionGuard></ProtectedRoute>} />

          {/* Radiology */}
          <Route path="/radiology" element={<ProtectedRoute><PermissionGuard permission={["radiology.view", "radiology.process"]}><RadiologyIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/radiology/receive" element={<ProtectedRoute><PermissionGuard permission={["radiology.view", "radiology.process"]}><RadiologyReceiveIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/radiology/process" element={<ProtectedRoute><PermissionGuard permission={["radiology.view", "radiology.process"]}><RadiologyProcessIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/radiology/completed" element={<ProtectedRoute><PermissionGuard permission={["radiology.view", "radiology.process"]}><RadiologyCompletedIndex /></PermissionGuard></ProtectedRoute>} />

          {/* Kasir */}
          <Route path="/kasir" element={<ProtectedRoute><PermissionGuard permission={["invoices.view", "invoices.pay"]}><KasirIndex /></PermissionGuard></ProtectedRoute>} />
          <Route path="/kasir/:id" element={<ProtectedRoute><PermissionGuard permission={["invoices.view", "invoices.pay"]}><KasirDetail /></PermissionGuard></ProtectedRoute>} />
          
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
