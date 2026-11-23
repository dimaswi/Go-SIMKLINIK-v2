import { useEffect, useState } from 'react';
import {
  medicalRecordsApi,
  type ICD10,
  type MedicalService,
  type Medicine,
  type PhysicalExamImageMaster,
  type Polyclinic,
} from '@/lib/api';

export function useEmrReferences(visitId: number) {
  const [icd10List, setIcd10List] = useState<ICD10[]>([]);
  const [medicineList, setMedicineList] = useState<Medicine[]>([]);
  const [serviceList, setServiceList] = useState<MedicalService[]>([]);
  const [physicalExamImageList, setPhysicalExamImageList] = useState<PhysicalExamImageMaster[]>([]);
  const [apotekRoomList, setApotekRoomList] = useState<Polyclinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!visitId || Number.isNaN(visitId)) {
        setIcd10List([]);
        setMedicineList([]);
        setServiceList([]);
        setPhysicalExamImageList([]);
        setApotekRoomList([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await medicalRecordsApi.getReferences(visitId);
        const references = response.data.data;

        setIcd10List([]);
        setMedicineList(references.medicines || []);
        setServiceList(references.medical_services || []);
        setPhysicalExamImageList(references.physical_exam_images || []);
        setApotekRoomList((references.apotek_rooms || []).filter((room) => room.room_type === 'apotek'));
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Gagal memuat referensi EMR');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [visitId]);

  return {
    icd10List,
    medicineList,
    serviceList,
    physicalExamImageList,
    apotekRoomList,
    loading,
    error,
  };
}
