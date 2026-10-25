import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  registrationQueueApi,
  resolveAssetUrl,
  settingsApi,
  type Polyclinic,
  type Doctor,
  type RegistrationQueueItem,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Ticket,
  CheckCircle2,
  Building2,
  Printer,
  RotateCcw,
} from 'lucide-react';
import { openPdfDocumentInNewWindow } from '../emr/print-document';

export default function PublicQueuePage() {
  const { toast } = useToast();
  const [nik, setNik] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([]);
  const [selectedPolyclinicId, setSelectedPolyclinicId] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [clinicName, setClinicName] = useState('SIMKLINIK');
  const [clinicSubtitle, setClinicSubtitle] = useState('Anjungan Antrian Mandiri Pasien');
  const [clinicLogo, setClinicLogo] = useState<string>('');
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [printingTicket, setPrintingTicket] = useState(false);
  const [ticketResult, setTicketResult] = useState<RegistrationQueueItem | null>(null);

  useEffect(() => {
    settingsApi.getAll().then((res) => {
      const s = res.data?.data;
      if (s) {
        if (s.hospital_name || s.app_name) {
          setClinicName(s.hospital_name || s.app_name);
        }
        if (s.app_subtitle) {
          setClinicSubtitle(s.app_subtitle);
        }
        const logo = s.app_logo || s.app_print_logo;
        if (logo) {
          setClinicLogo(logo);
        }
      }
    }).catch(() => { });

    Promise.all([
      registrationQueueApi.getPolyclinicsPublic().catch(() => ({ data: { data: [] } })),
      registrationQueueApi.getDoctorsPublic().catch(() => ({ data: { data: [] } })),
    ]).then(([poliRes, docRes]) => {
      const activePolis = (poliRes.data?.data || []).filter((p: Polyclinic) => p.is_active !== false);
      const activeDocs = docRes.data?.data || [];
      setPolyclinics(activePolis);
      setAllDoctors(activeDocs);
      setFilteredDoctors(activeDocs);
    }).finally(() => {
      setLoadingOptions(false);
    });
  }, []);

  const handlePoliChange = (poliId: string) => {
    setSelectedPolyclinicId(poliId);
    setSelectedDoctorId('');

    if (!poliId) {
      setFilteredDoctors(allDoctors);
      return;
    }

    const available = allDoctors.filter((doc) =>
      doc.polyclinics?.some((p) => String(p.id) === poliId)
    );
    setFilteredDoctors(available.length > 0 ? available : allDoctors);
  };

  const polyclinicOptions = useMemo(() => {
    return polyclinics.map((p) => ({
      value: String(p.id),
      label: p.name,
    }));
  }, [polyclinics]);

  const doctorOptions = useMemo(() => {
    return filteredDoctors.map((doc) => ({
      value: String(doc.id),
      label: `${doc.full_name}${doc.specialization ? ` (${doc.specialization})` : ''}`,
    }));
  }, [filteredDoctors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNik = nik.trim().replace(/\D/g, '');
    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();

    if (!cleanNik || cleanNik.length !== 16) {
      toast({
        variant: 'destructive',
        title: 'NIK Tidak Valid',
        description: 'NIK harus terdiri dari tepat 16 digit angka sesuai KTP.',
      });
      return;
    }

    if (!cleanName) {
      toast({
        variant: 'destructive',
        title: 'Nama Wajib Diisi',
        description: 'Silakan masukkan nama lengkap pasien.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await registrationQueueApi.createPublic({
        nik: cleanNik,
        patient_name: cleanName,
        phone: cleanPhone,
        polyclinic_id: selectedPolyclinicId ? Number(selectedPolyclinicId) : undefined,
        doctor_id: selectedDoctorId ? Number(selectedDoctorId) : undefined,
      });

      const item = response.data.data;
      setTicketResult(item);
      toast({
        variant: 'success',
        title: 'Nomor Antrian Berhasil Diterbitkan',
        description: `Nomor antrian Anda: ${String(item.ticket_number).padStart(3, '0')}`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Mengambil Antrian',
        description: error.response?.data?.error || 'Terjadi kesalahan saat memproses antrian.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async () => {
    if (!ticketResult || printingTicket) return;
    setPrintingTicket(true);
    try {
      await openPdfDocumentInNewWindow({
        toast,
        loadingLabel: 'tiket antrian pendaftaran',
        preparingMessage: `Menyiapkan cetak tiket nomor ${String(ticketResult.ticket_number).padStart(3, '0')}...`,
        blockedDescription: 'Izinkan popup peramban untuk mencetak tiket antrian.',
        errorTitle: 'Gagal mencetak tiket',
        errorFallback: 'PDF tiket antrian tidak dapat dibuat.',
        request: () => registrationQueueApi.print(ticketResult.id),
      });
    } finally {
      setPrintingTicket(false);
    }
  };

  const handleReset = () => {
    setNik('');
    setFullName('');
    setPhone('');
    setSelectedPolyclinicId('');
    setSelectedDoctorId('');
    setTicketResult(null);
  };

  const logoUrl = resolveAssetUrl(clinicLogo);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20 text-foreground selection:bg-primary/20">
      {/* Responsive Header with Clinic Logo */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur px-3 py-2.5 sm:px-6 sm:py-3 shadow-xs">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border/70 bg-muted/30 p-1">
              {logoUrl ? (
                <img src={logoUrl} alt={clinicName} className="h-full w-full object-contain" />
              ) : (
                <Building2 className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-foreground sm:text-base truncate leading-tight">
                {clinicName}
              </h1>
              <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                {clinicSubtitle}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container - Fully Mobile-Friendly */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center p-3 sm:p-6 md:p-8">
        {ticketResult ? (
          /* Ticket Result Card */
          <div className="w-full max-w-md animate-in fade-in-50 zoom-in-95 duration-200 border border-border/70 bg-background p-4 sm:p-7 shadow-xs">
            <div className="text-center">
              {/* Header inside ticket */}
              <div className="flex flex-col items-center justify-center gap-1.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-none border border-border/60 bg-muted/20 p-1">
                  {logoUrl ? (
                    <img src={logoUrl} alt={clinicName} className="h-full w-full object-contain" />
                  ) : (
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  )}
                </div>
                <h2 className="text-sm font-bold tracking-tight text-foreground sm:text-base">
                  {clinicName}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Nomor Antrian Pendaftaran Pasien
                </p>
              </div>

              {/* Big Ticket Display */}
              <div className="my-5 border-2 border-dashed border-primary/50 bg-primary/5 p-5 sm:p-6">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  NOMOR TIKET
                </span>
                <p className="mt-1 font-mono text-5xl sm:text-7xl font-black tracking-tight text-foreground">
                  {String(ticketResult.ticket_number).padStart(3, '0')}
                </p>
                <div className="mt-3 flex justify-center">
                  <Badge
                    variant={ticketResult.is_new_patient ? 'default' : 'secondary'}
                    className={`rounded-none px-2.5 py-0.5 text-xs font-semibold ${ticketResult.is_new_patient
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'border-blue-400 bg-blue-50 text-blue-700'
                      }`}
                  >
                    {ticketResult.is_new_patient ? 'Pasien Baru' : 'Pasien Lama'}
                  </Badge>
                </div>
              </div>

              {/* Patient Details Summary */}
              <div className="space-y-2 border border-border/70 bg-muted/20 p-3 sm:p-4 text-left text-xs">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-muted-foreground shrink-0">Nama Pasien:</span>
                  <span className="font-semibold text-foreground text-right truncate">
                    {ticketResult.patient_name || ticketResult.patient?.full_name || fullName}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground shrink-0">NIK:</span>
                  <span className="font-mono text-foreground font-medium">
                    {ticketResult.nik || ticketResult.patient?.nik || nik}
                  </span>
                </div>
                {ticketResult.phone || phone ? (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground shrink-0">Nomor HP/WA:</span>
                    <span className="font-mono text-foreground">
                      {ticketResult.phone || phone}
                    </span>
                  </div>
                ) : null}
                {ticketResult.patient?.medical_record_number ? (
                  <div className="flex justify-between items-center gap-2 border-t border-border/70 pt-2 font-medium">
                    <span className="text-muted-foreground shrink-0">No. Rekam Medis:</span>
                    <span className="font-mono text-primary font-bold">
                      {ticketResult.patient.medical_record_number}
                    </span>
                  </div>
                ) : null}
                {ticketResult.polyclinic?.name ? (
                  <div className="flex justify-between items-center gap-2 border-t border-border/70 pt-2 font-medium">
                    <span className="text-muted-foreground shrink-0">Poli Tujuan:</span>
                    <span className="font-semibold text-foreground text-right truncate">
                      {ticketResult.polyclinic.name}
                    </span>
                  </div>
                ) : null}
                {ticketResult.doctor?.full_name ? (
                  <div className="flex justify-between items-center gap-2 font-medium">
                    <span className="text-muted-foreground shrink-0">Dokter:</span>
                    <span className="text-foreground text-right truncate">
                      {ticketResult.doctor.full_name}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex flex-col gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrint}
                  disabled={printingTicket}
                  className="h-10 sm:h-11 w-full rounded-none text-xs sm:text-sm font-semibold shadow-none border-primary/40 hover:bg-primary/5"
                >
                  {printingTicket ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Printer className="mr-2 h-4 w-4 text-primary" />
                  )}
                  Cetak / Download Tiket PDF
                </Button>
                <Button
                  type="button"
                  onClick={handleReset}
                  className="h-10 sm:h-11 w-full rounded-none text-xs sm:text-sm font-semibold shadow-none"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Ambil Antrian Baru
                </Button>
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                Silakan simpan nomor tiket Anda dan tunggu pemanggilan di loket pendaftaran.
              </p>
            </div>
          </div>
        ) : (
          /* Intake Form Card */
          <div className="w-full max-w-lg border border-border/70 bg-background p-4 sm:p-7 shadow-xs">
            {/* Form Banner */}
            <div className="mb-5 sm:mb-6">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-none bg-primary/10 text-primary">
                  <Ticket className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Pendaftaran Mandiri
                </span>
              </div>
              <h2 className="mt-1 text-base sm:text-lg font-bold tracking-tight text-foreground">
                Formulir Ambil Nomor Antrian
              </h2>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Masukkan NIK, identitas, serta poliklinik tujuan untuk mendapatkan nomor antrian hari ini.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* NIK Input */}
              <div className="space-y-1">
                <Label htmlFor="nik" className="text-xs font-medium text-foreground">
                  NIK (Nomor Induk Kependudukan) *
                </Label>
                <Input
                  id="nik"
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={nik}
                  onChange={(e) => setNik(e.target.value.replace(/\D/g, ''))}
                  placeholder="16 digit NIK sesuai KTP..."
                  className="h-9 rounded-none font-mono text-xs tracking-wider"
                  required
                />
              </div>

              {/* Nama Lengkap */}
              <div className="space-y-1">
                <Label htmlFor="fullName" className="text-xs font-medium text-foreground">
                  Nama Lengkap Pasien *
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama lengkap sesuai KTP..."
                  className="h-9 rounded-none text-xs"
                  required
                />
              </div>

              {/* Nomor HP/WA */}
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-medium text-foreground">
                  Nomor HP / WhatsApp
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="h-9 rounded-none font-mono text-xs"
                />
              </div>

              {/* Poli Tujuan with SearchableSelect */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground">
                    Poliklinik Tujuan (Opsional)
                  </Label>
                  {selectedPolyclinicId ? (
                    <button
                      type="button"
                      onClick={() => handlePoliChange('')}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
                <SearchableSelect
                  options={polyclinicOptions}
                  value={selectedPolyclinicId}
                  onValueChange={handlePoliChange}
                  placeholder="-- Pilih Poliklinik Tujuan --"
                  searchPlaceholder="Ketik untuk mencari nama poli..."
                  emptyText="Poliklinik tidak ditemukan."
                  noneLabel="-- Tidak Memilih / Umum --"
                  disabled={loadingOptions}
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              {/* Dokter Tujuan with SearchableSelect */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground">
                    Dokter Tujuan (Opsional)
                  </Label>
                  {selectedDoctorId ? (
                    <button
                      type="button"
                      onClick={() => setSelectedDoctorId('')}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
                <SearchableSelect
                  options={doctorOptions}
                  value={selectedDoctorId}
                  onValueChange={setSelectedDoctorId}
                  placeholder={
                    selectedPolyclinicId
                      ? '-- Pilih Dokter di Poli Ini --'
                      : '-- Pilih Dokter Tujuan --'
                  }
                  searchPlaceholder="Ketik nama dokter atau spesialis..."
                  emptyText="Dokter tidak ditemukan."
                  noneLabel="-- Dokter Yang Bertugas --"
                  disabled={loadingOptions}
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="h-11 sm:h-12 w-full rounded-none text-xs sm:text-sm font-semibold tracking-wide shadow-none"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Memproses Antrian Pasien...
                    </>
                  ) : (
                    <>
                      <Ticket className="mr-2 h-4 w-4" />
                      Ambil Nomor Antrian
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Responsive Footer with Clinic Branding */}
      <footer className="border-t border-border/70 bg-background/95 py-3 px-4 text-center text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-4xl flex-col sm:flex-row items-center justify-between gap-1">
          <span>{clinicName}</span>
          <span className="text-[11px]">Sistem Informasi Manajemen Klinik Modern</span>
        </div>
      </footer>
    </div>
  );
}
