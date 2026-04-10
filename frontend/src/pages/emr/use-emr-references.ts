import { useEffect, useState } from 'react';
import {
  icd10Api,
  medicalServicesApi,
  medicinesApi,
  physicalExamImagesApi,
  type ICD10,
  type MedicalService,
  type Medicine,
  type PhysicalExamImageMaster,
} from '@/lib/api';

export function useEmrReferences() {
  const [icd10List, setIcd10List] = useState<ICD10[]>([]);
  const [medicineList, setMedicineList] = useState<Medicine[]>([]);
  const [serviceList, setServiceList] = useState<MedicalService[]>([]);
  const [physicalExamImageList, setPhysicalExamImageList] = useState<PhysicalExamImageMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [icdResponse, medicineResponse, serviceResponse, physicalExamImageResponse] = await Promise.all([
          icd10Api.search('per_page=5000'),
          medicinesApi.getAll('per_page=500&is_active=true'),
          medicalServicesApi.getAll('per_page=500&is_active=true'),
          physicalExamImagesApi.getAll('is_active=true'),
        ]);

        setIcd10List(icdResponse.data.data || []);
        setMedicineList(medicineResponse.data.data || []);
        setServiceList(serviceResponse.data.data || []);
        setPhysicalExamImageList(physicalExamImageResponse.data.data || []);
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Gagal memuat referensi EMR');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return {
    icd10List,
    medicineList,
    serviceList,
    physicalExamImageList,
    loading,
    error,
  };
}
