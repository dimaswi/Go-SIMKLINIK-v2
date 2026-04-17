import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import {
  doctorsApi,
  patientsApi,
  polyclinicsApi,
  registrationQueueApi,
  visitsApi,
  type Doctor,
  type Patient,
  type Polyclinic,
  type RegistrationQueueItem,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { CalendarDays, Loader2, UserPlus } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { getLocalISODate } from '@/lib/utils';
import {
  EMPTY_PATIENT_FORM_DATA,
  PatientFormSections,
  type PatientFormData,
  getPatientAgeLabel,
  getPatientGenderLabel,
  getPatientInsuranceLabel,
} from '@/pages/patients/shared';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataPageShell, formatMasterDataDateTime } from '@/pages/master-data/shared';

const PAYMENT_OPTIONS = [
  { value: 'umum', label: 'Umum (Mandiri)' },
  { value: 'bpjs', label: 'BPJS Kesehatan' },
  { value: 'asuransi', label: 'Asuransi Swasta' },
];

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent (Prioritas)' },
];

type EntryMode = 'existing' | 'new';

export default function RegistrationCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const initialMode = searchParams.get('mode') === 'new' ? 'new' : 'existing';
  const ticketId = searchParams.get('ticket_id');
  const initialPatientId = searchParams.get('patient_id');
  const initialPolyclinicId = searchParams.get('polyclinic_id');
  const initialDoctorId = searchParams.get('doctor_id');
  const initialPaymentType = searchParams.get('payment_type');
  const initialInsuranceNumber = searchParams.get('insurance_number');
  const initialComplaint = searchParams.get('complaint');
  const initialVisitDate = searchParams.get('visit_date');
  const initialPriority = searchParams.get('priority');
  const registrationSource = searchParams.get('source');
  const controlVisitNumber = searchParams.get('control_visit_number');
  const controlFollowUpAt = searchParams.get('control_follow_up_at');
  const controlInstruction = searchParams.get('control_instruction');
  const [entryMode, setEntryMode] = useState<EntryMode>(initialMode);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newPatientForm, setNewPatientForm] = useState<PatientFormData>(EMPTY_PATIENT_FORM_DATA);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registrationTicket, setRegistrationTicket] = useState<RegistrationQueueItem | null>(null);
  const [markingTicketProcessing, setMarkingTicketProcessing] = useState(false);
  const processingSyncTicketIdRef = useRef<number | null>(null);

  const [visitForm, setVisitForm] = useState({
    patient_id: initialPatientId || '',
    polyclinic_id: initialPolyclinicId || '',
    doctor_id: initialDoctorId || '',
    visit_date: initialVisitDate || getLocalISODate(),
    payment_type: initialPaymentType === 'bpjs' || initialPaymentType === 'asuransi' || initialPaymentType === 'umum' ? initialPaymentType : 'umum',
    insurance_number: initialInsuranceNumber || '',
    visit_type: initialPatientId ? 'lama' : 'baru',
    priority: initialPriority === 'urgent' ? 'urgent' : 'normal',
    complaint: initialComplaint || '',
  });

  useEffect(() => {
    setPageTitle('Front Office · Workspace Pendaftaran');
    setLoading(true);
    Promise.all([
      patientsApi.getAll('per_page=500&is_active=true'),
      polyclinicsApi.getAll(),
      doctorsApi.getAll(),
      ticketId ? registrationQueueApi.getById(Number(ticketId)) : Promise.resolve(null),
    ]).then(([patientResponse, polyclinicResponse, doctorResponse, ticketResponse]) => {
      const patientList = patientResponse.data.data || [];
      const doctorList = doctorResponse.data.data || [];

      setPatients(patientList);
      setPolyclinics(polyclinicResponse.data.data || []);
      setAllDoctors(doctorList);
      setDoctors(doctorList);
      setRegistrationTicket(ticketResponse?.data.data || null);
      processingSyncTicketIdRef.current = null;

      if (initialPatientId) {
        const patient = patientList.find((item: Patient) => String(item.id) === initialPatientId) || null;
        setSelectedPatient(patient);
        setEntryMode('existing');
        if (patient) {
          setVisitForm((previous) => ({
            ...previous,
            patient_id: initialPatientId,
            visit_type: 'lama',
            payment_type: (initialPaymentType === 'bpjs' || initialPaymentType === 'asuransi' || initialPaymentType === 'umum')
              ? initialPaymentType
              : patient.insurance_type || 'umum',
            insurance_number: initialInsuranceNumber || patient.insurance_number || '',
          }));
        }
      }
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data pendaftaran.' });
    }).finally(() => {
      setLoading(false);
    });
  }, [initialInsuranceNumber, initialPatientId, initialPaymentType, ticketId, toast]);

  useEffect(() => {
    if (entryMode !== 'existing') {
      setSelectedPatient(null);
      setVisitForm((previous) => ({
        ...previous,
        patient_id: '',
        visit_type: 'baru',
        payment_type: newPatientForm.insurance_type || 'umum',
        insurance_number: newPatientForm.insurance_number || '',
      }));
      return;
    }

    if (!visitForm.patient_id) {
      setSelectedPatient(null);
      return;
    }

    const patient = patients.find((item) => String(item.id) === visitForm.patient_id) || null;
    setSelectedPatient(patient);
    if (patient) {
      setVisitForm((previous) => ({
        ...previous,
        visit_type: 'lama',
        payment_type: previous.payment_type || patient.insurance_type || 'umum',
        insurance_number: previous.insurance_number || patient.insurance_number || '',
      }));
    }
  }, [entryMode, newPatientForm.insurance_number, newPatientForm.insurance_type, patients, visitForm.patient_id]);

  useEffect(() => {
    if (entryMode !== 'new') {
      return;
    }

    setVisitForm((previous) => ({
      ...previous,
      payment_type: newPatientForm.insurance_type || 'umum',
      insurance_number: newPatientForm.insurance_number || '',
      visit_type: 'baru',
    }));
  }, [entryMode, newPatientForm.insurance_number, newPatientForm.insurance_type]);

  useEffect(() => {
    if (!ticketId || !registrationTicket || registrationTicket.status !== 'called' || markingTicketProcessing) {
      return;
    }

    if (processingSyncTicketIdRef.current === registrationTicket.id) {
      return;
    }

    processingSyncTicketIdRef.current = registrationTicket.id;

    setMarkingTicketProcessing(true);
    registrationQueueApi.updateStatus(Number(ticketId), { status: 'processing' })
      .then((response) => {
        setRegistrationTicket(response.data.data || registrationTicket);
      })
      .catch(() => {
        // Hindari loop request. Pengguna tetap bisa melanjutkan form walau sinkronisasi gagal.
      })
      .finally(() => {
        setMarkingTicketProcessing(false);
      });
  }, [markingTicketProcessing, registrationTicket, ticketId]);

  useEffect(() => {
    if (visitForm.polyclinic_id) {
      const filteredDoctors = allDoctors.filter((doctor) => (
        !doctor.polyclinics ||
        doctor.polyclinics.length === 0 ||
        doctor.polyclinics.some((polyclinic: Polyclinic) => String(polyclinic.id) === visitForm.polyclinic_id)
      ));
      setDoctors(filteredDoctors.length > 0 ? filteredDoctors : allDoctors);
    } else {
      setDoctors(allDoctors);
    }

    setVisitForm((previous) => {
      if (!previous.doctor_id) {
        return previous;
      }

      const doctorStillAvailable = (allDoctors.length > 0 ? allDoctors : doctors).some((doctor) => String(doctor.id) === previous.doctor_id && (
        !doctor.polyclinics ||
        doctor.polyclinics.length === 0 ||
        doctor.polyclinics.some((polyclinic: Polyclinic) => String(polyclinic.id) === previous.polyclinic_id)
      ));

      return doctorStillAvailable ? previous : { ...previous, doctor_id: '' };
    });
  }, [allDoctors, doctors, visitForm.polyclinic_id]);

  const setVisitField = (field: keyof typeof visitForm, value: string) => {
    setVisitForm((previous) => ({ ...previous, [field]: value }));
  };

  const setPatientField = (field: keyof PatientFormData, value: string) => {
    setNewPatientForm((previous) => ({ ...previous, [field]: value }));
  };

  const handlePatientInput = (event: ChangeEvent<HTMLInputElement>) => {
    setPatientField(event.target.name as keyof PatientFormData, event.target.value);
  };

  const handlePatientTextarea = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setPatientField(event.target.name as keyof PatientFormData, event.target.value);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!visitForm.polyclinic_id || !visitForm.doctor_id || !visitForm.visit_date) {
      toast({ variant: 'destructive', title: 'Periksa data!', description: 'Poliklinik, dokter, dan tanggal kunjungan wajib diisi.' });
      return;
    }

    if (entryMode === 'existing' && !visitForm.patient_id) {
      toast({ variant: 'destructive', title: 'Periksa data!', description: 'Pilih pasien lama terlebih dahulu.' });
      return;
    }

    if (entryMode === 'new' && (!newPatientForm.full_name || !newPatientForm.gender)) {
      toast({ variant: 'destructive', title: 'Periksa data!', description: 'Nama dan jenis kelamin pasien baru wajib diisi.' });
      return;
    }

    setSubmitting(true);
    try {
      let patientId = Number(visitForm.patient_id);

      if (entryMode === 'new') {
        const patientPayload = {
          ...newPatientForm,
          birth_date: newPatientForm.birth_date || null,
        };
        const patientResponse = await patientsApi.create(patientPayload);
        patientId = Number(patientResponse.data.data.id);
      }

      const visitPayload = {
        patient_id: patientId,
        polyclinic_id: Number(visitForm.polyclinic_id),
        doctor_id: Number(visitForm.doctor_id),
        visit_date: visitForm.visit_date,
        payment_type: visitForm.payment_type,
        insurance_number: visitForm.payment_type === 'umum' ? '' : visitForm.insurance_number,
        visit_type: entryMode === 'new' ? 'baru' : 'lama',
        priority: visitForm.priority,
        complaint: visitForm.complaint,
      };

      const visitResponse = await visitsApi.create(visitPayload);
      const queueNumber = String(visitResponse.data.data.queue_number || 0).padStart(3, '0');
      let ticketSyncFailed = false;

      if (ticketId) {
        try {
          await registrationQueueApi.updateStatus(Number(ticketId), {
            status: 'completed',
            visit_id: Number(visitResponse.data.data.id),
          });
        } catch {
          ticketSyncFailed = true;
        }
      }

      toast({
        variant: ticketSyncFailed ? 'default' : 'success',
        title: ticketSyncFailed ? 'Pendaftaran Tersimpan' : 'Berhasil!',
        description: ticketSyncFailed
          ? `Kunjungan berhasil dibuat dengan nomor antrian ${queueNumber}, tetapi sinkronisasi status tiket belum selesai.`
          : `Pendaftaran berhasil disimpan. Nomor antrian pasien adalah ${queueNumber}.`,
      });
      navigate('/registration');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal!', description: error.response?.data?.error || 'Pendaftaran gagal.' });
    } finally {
      setSubmitting(false);
    }
  };

  const patientOptions = useMemo(() => patients.map((patient) => ({
    value: String(patient.id),
    label: `${patient.medical_record_number} - ${patient.full_name}`,
  })), [patients]);

  const polyclinicOptions = useMemo(() => polyclinics.map((polyclinic) => ({
    value: String(polyclinic.id),
    label: polyclinic.name,
  })), [polyclinics]);

  const doctorOptions = useMemo(() => doctors.map((doctor) => ({
    value: String(doctor.id),
    label: `${doctor.full_name}${doctor.specialization ? ` — ${doctor.specialization}` : ''}`,
  })), [doctors]);

  const selectedPolyclinic = polyclinics.find((item) => String(item.id) === visitForm.polyclinic_id) || null;
  const selectedDoctor = doctors.find((item) => String(item.id) === visitForm.doctor_id) || null;
  const isControlRegistration = registrationSource === 'control-schedule';
  const controlScheduleLabel = controlFollowUpAt ? formatMasterDataDateTime(controlFollowUpAt) : '-';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <form id="registration-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Workspace Pendaftaran"
        subtitle={isControlRegistration
          ? 'Registrasi kontrol dari monitoring jadwal. Data kunjungan utama sudah diprefill dan tinggal diverifikasi petugas.'
          : 'Fokus ke form pendaftaran. Pilih mode pasien di kontrol ringkas, lalu langsung isi data kunjungan.'}
        onBack={() => navigate('/registration')}
        badges={
          <>
            {registrationTicket ? (
              <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-[0.18em] shadow-none">
                Tiket {String(registrationTicket.ticket_number).padStart(3, '0')}
              </Badge>
            ) : null}
            {isControlRegistration ? (
              <Badge className="h-5 rounded-none border-0 bg-amber-500 px-2 text-[10px] uppercase tracking-[0.18em] text-white shadow-none">
                Pasien Kontrol
              </Badge>
            ) : null}
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-[0.18em] shadow-none">
              {entryMode === 'new' ? 'Pasien Baru' : 'Pasien Lama'}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-[0.18em] shadow-none">
              {getPatientInsuranceLabel(visitForm.payment_type)}
            </Badge>
          </>
        }
        meta={
          <>
            {isControlRegistration ? <span>Kontrol dari {controlVisitNumber || '-'}</span> : null}
            <span>Poli {selectedPolyclinic?.name || '-'}</span>
            <span>Dokter {selectedDoctor?.full_name || '-'}</span>
            <span>Tanggal {visitForm.visit_date || '-'}</span>
          </>
        }
        actions={
          <Button type="submit" form="registration-create-form" disabled={submitting} className="rounded-none shadow-none">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Pendaftaran
          </Button>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan Kunjungan">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Tiket: <span className="font-medium text-foreground">{registrationTicket ? String(registrationTicket.ticket_number).padStart(3, '0') : '-'}</span></p>
                  <p>Pasien: <span className="font-medium text-foreground">{entryMode === 'existing' ? (selectedPatient?.full_name || 'Belum dipilih') : (newPatientForm.full_name || 'Belum diisi')}</span></p>
                  <p>Jenis kelamin: {entryMode === 'existing' ? getPatientGenderLabel(selectedPatient?.gender) : getPatientGenderLabel(newPatientForm.gender)}</p>
                  <p>Usia: {entryMode === 'existing' ? getPatientAgeLabel(selectedPatient?.birth_date) : getPatientAgeLabel(newPatientForm.birth_date)}</p>
                  <p>Pembayaran: {getPatientInsuranceLabel(visitForm.payment_type)}</p>
                  <p>Prioritas: {visitForm.priority === 'urgent' ? 'Urgent' : 'Normal'}</p>
                  <p>Poli: {selectedPolyclinic?.name || '-'}</p>
                  <p>Dokter: {selectedDoctor?.full_name || '-'}</p>
                </div>
              </MasterDataAsideSection>
            </div>
            {isControlRegistration ? (
              <div>
                <MasterDataAsideSection title="Konteks Kontrol" helper="Pastikan poli, dokter, dan instruksi kontrol sudah sesuai sebelum pendaftaran disimpan.">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Kunjungan asal: <span className="font-medium text-foreground">{controlVisitNumber || '-'}</span></p>
                    <p>Jadwal kontrol: <span className="font-medium text-foreground">{controlScheduleLabel}</span></p>
                    <p>Instruksi: <span className="font-medium text-foreground">{controlInstruction || 'Tidak ada instruksi tambahan.'}</span></p>
                  </div>
                </MasterDataAsideSection>
              </div>
            ) : null}
          </MasterDataAsideStack>
        }
      >
        <div className="divide-y divide-border/70">

          {isControlRegistration ? (
            <section className="px-4 py-4 lg:px-5 lg:py-5">
              <div className="border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Registrasi Kontrol</p>
                    <h2 className="text-sm font-semibold tracking-tight text-amber-950">Pasien datang sesuai jadwal kontrol yang sudah dibuat dari kunjungan sebelumnya.</h2>
                    <p className="text-xs leading-5 text-amber-800">Form sudah menyiapkan pasien lama, poli, dokter, penjamin, prioritas, dan keluhan awal. Petugas cukup cek ulang lalu simpan pendaftaran.</p>
                  </div>
                  <div className="grid gap-2 text-xs text-amber-900 sm:grid-cols-2 xl:min-w-[360px]">
                    <div className="border border-amber-200/80 bg-white/55 px-3 py-2">
                      <p className="font-semibold uppercase tracking-[0.14em] text-amber-700">Kunjungan Asal</p>
                      <p className="mt-1 text-sm font-medium text-amber-950">{controlVisitNumber || '-'}</p>
                    </div>
                    <div className="border border-amber-200/80 bg-white/55 px-3 py-2">
                      <p className="font-semibold uppercase tracking-[0.14em] text-amber-700">Jadwal Kontrol</p>
                      <p className="mt-1 text-sm font-medium text-amber-950">{controlScheduleLabel}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {entryMode === 'existing' ? (
            <section className="px-4 py-4 lg:px-5 lg:py-5">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight">Pilih Pasien Lama</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Cari pasien berdasarkan nama atau nomor rekam medis. Jika pasien belum ada, pindahkan ke mode pasien baru.</p>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-end">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cari Pasien</Label>
                  <SearchableSelect
                    options={patientOptions}
                    value={visitForm.patient_id}
                    onValueChange={(value) => setVisitField('patient_id', value)}
                    placeholder="Cari pasien berdasarkan No. RM atau nama..."
                    searchPlaceholder="Cari pasien..."
                    emptyText="Pasien tidak ditemukan."
                    square
                  />
                </div>
                {isControlRegistration ? (
                  <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    Pendaftaran ini ditandai sebagai pasien kontrol, jadi form tetap diarahkan ke pasien lama yang sudah terdaftar.
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => setEntryMode('new')}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Pindah Ke Pasien Baru
                  </Button>
                )}
              </div>

              {selectedPatient ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="border border-border/70 bg-muted/20 px-4 py-4 text-sm">
                    <p className="font-semibold text-foreground">{selectedPatient.full_name}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{selectedPatient.medical_record_number}</p>
                    <p className="mt-2 text-muted-foreground">{getPatientGenderLabel(selectedPatient.gender)} · {getPatientAgeLabel(selectedPatient.birth_date)}</p>
                  </div>
                  <div className="border border-border/70 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                    <p>Telepon: {selectedPatient.phone || '-'}</p>
                    <p className="mt-1">Alamat: {selectedPatient.address || '-'}</p>
                    <p className="mt-1">Penjamin: {getPatientInsuranceLabel(selectedPatient.insurance_type)}</p>
                    <p className="mt-1">No. Penjamin: {selectedPatient.insurance_number || '-'}</p>
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <div>
              <PatientFormSections
                formData={newPatientForm}
                setField={setPatientField}
                onInputChange={handlePatientInput}
                onTextareaChange={handlePatientTextarea}
              />
            </div>
          )}

          <section className="px-4 py-4 lg:px-5 lg:py-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-tight">Tujuan Kunjungan Hari Ini</h2>
              <p className="text-[11px] leading-5 text-muted-foreground">Lengkapi poliklinik, dokter, penjamin, tanggal, dan prioritas. Dokter wajib dipilih agar kunjungan dapat dibuat.</p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Poliklinik</Label>
                <SearchableSelect
                  options={polyclinicOptions}
                  value={visitForm.polyclinic_id}
                  onValueChange={(value) => setVisitField('polyclinic_id', value)}
                  placeholder="Pilih poliklinik..."
                  searchPlaceholder="Cari poli..."
                  square
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Dokter</Label>
                <SearchableSelect
                  options={doctorOptions}
                  value={visitForm.doctor_id}
                  onValueChange={(value) => setVisitField('doctor_id', value)}
                  placeholder="Pilih dokter..."
                  searchPlaceholder="Cari dokter..."
                  square
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visit_date" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tanggal Kunjungan</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="visit_date"
                    type="date"
                    value={visitForm.visit_date}
                    onChange={(event) => setVisitField('visit_date', event.target.value)}
                    className="rounded-none pl-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pembayaran</Label>
                <SearchableSelect
                  options={PAYMENT_OPTIONS}
                  value={visitForm.payment_type}
                  onValueChange={(value) => setVisitField('payment_type', value)}
                  placeholder="Pilih pembayaran..."
                  square
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Prioritas</Label>
                <SearchableSelect
                  options={PRIORITY_OPTIONS}
                  value={visitForm.priority}
                  onValueChange={(value) => setVisitField('priority', value)}
                  placeholder="Pilih prioritas..."
                  square
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tipe Kunjungan</Label>
                <div className="flex h-10 items-center border border-border/70 bg-muted/10 px-3 text-sm text-muted-foreground">
                  {entryMode === 'new' ? 'Pasien Baru' : 'Pasien Lama'}
                </div>
              </div>
              {visitForm.payment_type !== 'umum' ? (
                <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                  <Label htmlFor="insurance_number" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Nomor Penjamin</Label>
                  <Input
                    id="insurance_number"
                    value={visitForm.insurance_number}
                    onChange={(event) => setVisitField('insurance_number', event.target.value)}
                    placeholder="Masukkan nomor BPJS atau asuransi"
                    className="rounded-none"
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className="px-4 py-4 lg:px-5 lg:py-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-tight">Keluhan Dan Catatan Awal</h2>
              <p className="text-[11px] leading-5 text-muted-foreground">Tuliskan ringkasan keluhan pasien untuk membantu triase awal dan memudahkan petugas poli saat memanggil antrian.</p>
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-1.5">
                <Label htmlFor="complaint" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Keluhan Utama</Label>
                <Textarea
                  id="complaint"
                  value={visitForm.complaint}
                  onChange={(event) => setVisitField('complaint', event.target.value)}
                  placeholder="Keluhan yang disampaikan pasien..."
                  rows={6}
                  className="rounded-none"
                />
              </div>
            </div>
          </section>
        </div>
      </MasterDataPageShell>
    </form>
  );
}