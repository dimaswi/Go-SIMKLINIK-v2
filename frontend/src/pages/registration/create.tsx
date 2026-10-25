import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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
  type Visit,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, ArrowLeft, CalendarDays, ClipboardEdit, ExternalLink, Loader2, UserPlus, Users } from 'lucide-react';
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
import { formatMasterDataDateTime } from '@/pages/master-data/shared';

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
  const [searchParams, setSearchParams] = useSearchParams();
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

  useEffect(() => {
    const modeParam = searchParams.get('mode');
    if ((modeParam === 'new' || modeParam === 'existing') && modeParam !== entryMode) {
      setEntryMode(modeParam);
    }
  }, [entryMode, searchParams]);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newPatientForm, setNewPatientForm] = useState<PatientFormData>(EMPTY_PATIENT_FORM_DATA);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeVisitAlert, setActiveVisitAlert] = useState<Visit | null>(null);
  const [checkingActiveVisit, setCheckingActiveVisit] = useState(false);
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
      const ticket = ticketResponse?.data.data || null;
      setRegistrationTicket(ticket);
      processingSyncTicketIdRef.current = null;

      const targetPolyclinicId = initialPolyclinicId || (ticket?.polyclinic_id ? String(ticket.polyclinic_id) : '');
      const targetDoctorId = initialDoctorId || (ticket?.doctor_id ? String(ticket.doctor_id) : '');

      if (targetPolyclinicId || targetDoctorId) {
        setVisitForm((previous) => ({
          ...previous,
          ...(targetPolyclinicId ? { polyclinic_id: targetPolyclinicId } : {}),
          ...(targetDoctorId ? { doctor_id: targetDoctorId } : {}),
        }));
      }

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
            ...(targetPolyclinicId ? { polyclinic_id: targetPolyclinicId } : {}),
            ...(targetDoctorId ? { doctor_id: targetDoctorId } : {}),
          }));
        }
      }
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data pendaftaran.' });
    }).finally(() => {
      setLoading(false);
    });
  }, [initialDoctorId, initialInsuranceNumber, initialPatientId, initialPaymentType, initialPolyclinicId, ticketId, toast]);

  useEffect(() => {
    if (entryMode !== 'existing') {
      setSelectedPatient(null);
      setVisitForm((previous) => {
        const nextPayment = newPatientForm.insurance_type || 'umum';
        const nextInsurance = newPatientForm.insurance_number || '';
        if (
          previous.patient_id === '' &&
          previous.visit_type === 'baru' &&
          previous.payment_type === nextPayment &&
          previous.insurance_number === nextInsurance
        ) {
          return previous;
        }
        return {
          ...previous,
          patient_id: '',
          visit_type: 'baru',
          payment_type: nextPayment,
          insurance_number: nextInsurance,
        };
      });
      return;
    }

    if (!visitForm.patient_id) {
      setSelectedPatient(null);
      return;
    }

    const patient = patients.find((item) => String(item.id) === visitForm.patient_id) || null;
    setSelectedPatient(patient);
    if (patient) {
      setVisitForm((previous) => {
        const nextPayment = previous.payment_type || patient.insurance_type || 'umum';
        const nextInsurance = previous.insurance_number || patient.insurance_number || '';
        if (
          previous.visit_type === 'lama' &&
          previous.payment_type === nextPayment &&
          previous.insurance_number === nextInsurance
        ) {
          return previous;
        }
        return {
          ...previous,
          visit_type: 'lama',
          payment_type: nextPayment,
          insurance_number: nextInsurance,
        };
      });
    }
  }, [entryMode, newPatientForm.insurance_number, newPatientForm.insurance_type, patients, visitForm.patient_id]);

  useEffect(() => {
    if (entryMode !== 'existing' || !visitForm.patient_id) {
      setActiveVisitAlert(null);
      return;
    }

    let isMounted = true;
    setCheckingActiveVisit(true);
    visitsApi.getActiveByPatient(visitForm.patient_id)
      .then((res) => {
        if (isMounted) {
          setActiveVisitAlert(res.data.data || null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setActiveVisitAlert(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setCheckingActiveVisit(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [entryMode, visitForm.patient_id]);

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

  const availableDoctors = useMemo(() => {
    if (!visitForm.polyclinic_id) {
      return allDoctors;
    }
    const filtered = allDoctors.filter((doctor) => (
      !doctor.polyclinics ||
      doctor.polyclinics.length === 0 ||
      doctor.polyclinics.some((polyclinic: Polyclinic) => String(polyclinic.id) === visitForm.polyclinic_id)
    ));
    return filtered.length > 0 ? filtered : allDoctors;
  }, [allDoctors, visitForm.polyclinic_id]);

  useEffect(() => {
    if (!visitForm.doctor_id) return;
    const isStillAvailable = availableDoctors.some((doc) => String(doc.id) === visitForm.doctor_id);
    if (!isStillAvailable) {
      setVisitForm((prev) => ({ ...prev, doctor_id: '' }));
    }
  }, [availableDoctors, visitForm.doctor_id]);

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

    if (entryMode === 'existing' && activeVisitAlert) {
      toast({
        variant: 'destructive',
        title: 'Pendaftaran Ditolak!',
        description: `Pasien masih memiliki kunjungan aktif (${activeVisitAlert.visit_number}) di ${activeVisitAlert.polyclinic?.name || 'Poliklinik'} yang belum selesai sampai billing.`,
      });
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
      navigate(`/registration/${visitResponse.data.data.id}`);
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

  const doctorOptions = useMemo(() => availableDoctors.map((doctor) => ({
    value: String(doctor.id),
    label: `${doctor.full_name}${doctor.specialization ? ` — ${doctor.specialization}` : ''}`,
  })), [availableDoctors]);

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
    <form id="registration-create-form" onSubmit={handleSubmit} className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="border border-border/70 bg-card shadow-none">
          {/* Card Header Bar */}
          <div className="flex flex-col gap-3 p-4 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                    onClick={() => navigate('/queue')}
                    aria-label="Kembali ke Antrian"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Kembali ke Antrian</p>
                </TooltipContent>
              </Tooltip>

              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-border/70 bg-muted/20">
                <ClipboardEdit className="h-4 w-4 text-primary" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground truncate">
                    Form Pendaftaran Pasien
                  </h1>
                  {registrationTicket ? (
                    <Badge variant="outline" className="rounded-none font-mono text-xs shadow-none">
                      Tiket #{String(registrationTicket.ticket_number).padStart(3, '0')}
                    </Badge>
                  ) : null}
                  {isControlRegistration ? (
                    <Badge className="rounded-none border-0 bg-amber-500 text-white text-[10px] uppercase shadow-none">
                      Pasien Kontrol
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {entryMode === 'existing'
                    ? 'Pendaftaran kunjungan poli untuk pasien yang sudah terdaftar.'
                    : 'Pendaftaran pasien baru dan langsung masukkan antrian kunjungan.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!isControlRegistration && (
                <div className="flex items-center gap-1 border border-border/70 bg-muted/40 p-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={entryMode === 'existing' ? 'default' : 'ghost'}
                    className="h-7 rounded-none px-3 text-xs shadow-none"
                    onClick={() => {
                      setEntryMode('existing');
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('mode', 'existing');
                        return next;
                      });
                    }}
                  >
                    <Users className="mr-1.5 h-3.5 w-3.5" />
                    Pasien Lama
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={entryMode === 'new' ? 'default' : 'ghost'}
                    className="h-7 rounded-none px-3 text-xs shadow-none"
                    onClick={() => {
                      setEntryMode('new');
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('mode', 'new');
                        return next;
                      });
                    }}
                  >
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    Pasien Baru
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Banner Registrasi Kontrol */}
          {isControlRegistration ? (
            <div className="border-b border-amber-300 bg-amber-50/70 p-3 sm:px-5 text-xs text-amber-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Registrasi Kontrol</p>
                  <p className="font-semibold text-amber-950">Pasien datang sesuai jadwal kontrol.</p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span>Kunjungan Asal: <strong>{controlVisitNumber || '-'}</strong></span>
                  <span>Jadwal: <strong>{controlScheduleLabel}</strong></span>
                  {controlInstruction ? <span>Instruksi: <strong>{controlInstruction}</strong></span> : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Card Section 1: Data Pasien */}
          <div className="border-b border-border/70 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-1 shrink-0 bg-primary/70" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {entryMode === 'existing' ? '1. Identitas Pasien Terdaftar' : '1. Formulir Pasien Baru'}
                </span>
              </div>
              {entryMode === 'existing' && selectedPatient ? (
                <Badge variant="outline" className="rounded-none text-[11px] font-mono">
                  RM: {selectedPatient.medical_record_number}
                </Badge>
              ) : null}
            </div>

            {entryMode === 'existing' ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Pilih / Cari Pasien (No. RM atau Nama) *</Label>
                  <SearchableSelect
                    options={patientOptions}
                    value={visitForm.patient_id}
                    onValueChange={(value) => setVisitField('patient_id', value)}
                    placeholder="Ketik No. RM atau nama pasien..."
                    searchPlaceholder="Cari pasien..."
                    emptyText="Pasien tidak ditemukan."
                    square
                    className="h-9 text-xs rounded-none"
                  />
                </div>

                {selectedPatient ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-border/70 bg-muted/15 p-3 text-xs">
                      <div>
                        <p className="font-bold text-foreground text-sm">{selectedPatient.full_name}</p>
                        <p className="font-mono text-muted-foreground">{selectedPatient.medical_record_number}</p>
                        <p className="text-muted-foreground mt-0.5">
                          {getPatientGenderLabel(selectedPatient.gender)} · {getPatientAgeLabel(selectedPatient.birth_date)}
                        </p>
                      </div>
                      <div className="space-y-0.5 text-muted-foreground">
                        <p>NIK: <span className="font-mono text-foreground">{selectedPatient.nik || '-'}</span></p>
                        <p>Telepon: <span className="text-foreground">{selectedPatient.phone || '-'}</span></p>
                        <p>
                          Penjamin:{' '}
                          <span className="text-foreground">
                            {getPatientInsuranceLabel(selectedPatient.insurance_type)}{' '}
                            {selectedPatient.insurance_number ? `(${selectedPatient.insurance_number})` : ''}
                          </span>
                        </p>
                      </div>
                      <div className="text-muted-foreground">
                        <p>Alamat:</p>
                        <p className="text-foreground mt-0.5">{selectedPatient.address || '-'}</p>
                      </div>
                    </div>

                    {activeVisitAlert ? (
                      <div className="border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive space-y-1.5">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Pasien Masih Memiliki Kunjungan / Pendaftaran Aktif!</span>
                        </div>
                        <p className="leading-relaxed">
                          Pasien ini masih terdaftar pada kunjungan <span className="font-mono font-bold">{activeVisitAlert.visit_number}</span> di <span className="font-semibold">{activeVisitAlert.polyclinic?.name || 'Poliklinik'}</span> ({activeVisitAlert.doctor?.full_name || 'Dokter'}) yang belum selesai sampai transaksi billing. Pasien tidak dapat didaftarkan kembali sebelum pelayanan dan pembayaran billing diselesaikan.
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          <Link
                            to={`/registration/${activeVisitAlert.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold underline hover:opacity-80"
                          >
                            Lihat Detail Pendaftaran <ExternalLink className="h-3 w-3" />
                          </Link>
                          <span>·</span>
                          <Link
                            to={`/emr/${activeVisitAlert.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold underline hover:opacity-80"
                          >
                            Buka EMR <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <PatientFormSections
                  formData={newPatientForm}
                  setField={setPatientField}
                  onInputChange={handlePatientInput}
                  onTextareaChange={handlePatientTextarea}
                />
              </div>
            )}
          </div>

          {/* Card Section 2: Tujuan Kunjungan Hari Ini */}
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
              <div className="h-3.5 w-1 shrink-0 bg-primary/70" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Tujuan Kunjungan Hari Ini
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Poliklinik *</Label>
                <SearchableSelect
                  options={polyclinicOptions}
                  value={visitForm.polyclinic_id}
                  onValueChange={(value) => setVisitField('polyclinic_id', value)}
                  placeholder="Pilih poliklinik..."
                  searchPlaceholder="Cari poli..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Dokter *</Label>
                <SearchableSelect
                  options={doctorOptions}
                  value={visitForm.doctor_id}
                  onValueChange={(value) => setVisitField('doctor_id', value)}
                  placeholder="Pilih dokter..."
                  searchPlaceholder="Cari dokter..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="visit_date" className="text-xs font-medium">Tanggal Kunjungan *</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="visit_date"
                    type="date"
                    value={visitForm.visit_date}
                    onChange={(event) => setVisitField('visit_date', event.target.value)}
                    className="h-9 text-xs rounded-none pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Pembayaran *</Label>
                <SearchableSelect
                  options={PAYMENT_OPTIONS}
                  value={visitForm.payment_type}
                  onValueChange={(value) => setVisitField('payment_type', value)}
                  placeholder="Pilih pembayaran..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Prioritas *</Label>
                <SearchableSelect
                  options={PRIORITY_OPTIONS}
                  value={visitForm.priority}
                  onValueChange={(value) => setVisitField('priority', value)}
                  placeholder="Pilih prioritas..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              {visitForm.payment_type !== 'umum' ? (
                <div className="space-y-1">
                  <Label htmlFor="insurance_number" className="text-xs font-medium">Nomor Kartu Penjamin *</Label>
                  <Input
                    id="insurance_number"
                    value={visitForm.insurance_number}
                    onChange={(event) => setVisitField('insurance_number', event.target.value)}
                    placeholder="Masukkan nomor kartu"
                    className="h-9 text-xs rounded-none font-mono"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-1 pt-1">
              <Label htmlFor="complaint" className="text-xs font-medium">Keluhan Utama</Label>
              <Textarea
                id="complaint"
                value={visitForm.complaint}
                onChange={(event) => setVisitField('complaint', event.target.value)}
                placeholder="Keluhan utama yang disampaikan pasien..."
                rows={2}
                className="text-xs rounded-none min-h-[50px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Actions */}
      <div className="shrink-0 border-t border-border/70 bg-card/95 px-4 py-3 sm:px-6 backdrop-blur z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none px-3 text-xs shadow-none shrink-0"
            onClick={() => navigate('/queue')}
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Kembali ke Antrian
          </Button>

          <Button
            type="submit"
            disabled={submitting || checkingActiveVisit || Boolean(activeVisitAlert)}
            size="sm"
            className="h-8 rounded-none px-4 text-xs shadow-none"
            title={activeVisitAlert ? 'Pasien masih memiliki kunjungan aktif yang belum selesai sampai billing' : undefined}
          >
            {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Simpan Pendaftaran
          </Button>
        </div>
      </div>
    </form>
  );
}