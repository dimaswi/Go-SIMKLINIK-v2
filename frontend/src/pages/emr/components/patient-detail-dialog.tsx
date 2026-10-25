import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, CalendarDays, User } from 'lucide-react';
import type { Visit } from '@/lib/api';
import { compactAddress, formatDate, formatDateTime, getPatientAge } from '../utils';

type EncounterRequirement = {
  label: string;
  ready: boolean;
  value: string;
};

type PatientDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: Visit;
  allergyInfo?: string;
  encounterRequirements: EncounterRequirement[];
};

export function PatientDetailDialog({
  open,
  onOpenChange,
  visit,
  allergyInfo,
  encounterRequirements,
}: PatientDetailDialogProps) {
  const patient = visit.patient;
  const age = getPatientAge(patient?.birth_date);
  const genderLabel = patient?.gender === 'L' ? 'Laki-laki' : patient?.gender === 'P' ? 'Perempuan' : '-';
  const addressLabel = compactAddress([
    patient?.address,
    patient?.kelurahan,
    patient?.kecamatan,
    patient?.city,
  ]) || '-';
  const insuranceLabel = [patient?.insurance_type, patient?.insurance_number].filter(Boolean).join(' / ') || visit.payment_type || '-';
  const emergencyLabel = [patient?.emergency_contact_name, patient?.emergency_contact_relation].filter(Boolean).join(' · ');
  const allergyLabel = (allergyInfo || patient?.allergies || '').trim();

  const encounterReadyCount = encounterRequirements.filter((item) => item.ready).length;
  const encounterReady = encounterReadyCount === 4;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-none border-border/70 p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center border border-border bg-muted/20 shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Data Pasien & Kunjungan</DialogTitle>
              <DialogDescription className="text-xs">
                Informasi identitas demografi, riwayat kunjungan, penjamin, dan status SATUSEHAT.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          {/* Identitas Pasien */}
          <div className="border border-border/70 bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                Identitas Demografi
              </h3>
              <Badge variant="outline" className="rounded-none font-mono text-[10px]">
                RM: {patient?.medical_record_number || '-'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Nama Lengkap</span>
                <span className="font-semibold text-foreground">{patient?.full_name || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">NIK</span>
                <span className="font-mono text-foreground">{patient?.nik || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Jenis Kelamin / Usia</span>
                <span className="font-medium text-foreground">{genderLabel}{age !== null ? `, ${age} th` : ''}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Tempat, Tgl Lahir</span>
                <span className="font-medium text-foreground">{patient?.birth_place || '-'}{patient?.birth_date ? `, ${formatDate(patient.birth_date)}` : ''}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Telepon / HP</span>
                <span className="font-mono text-foreground">{patient?.phone || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Golongan Darah</span>
                <span className="font-medium text-foreground">{patient?.blood_type || '-'}</span>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <span className="text-muted-foreground block text-[11px]">Alamat Lengkap</span>
                <span className="font-medium text-foreground">{addressLabel}</span>
              </div>
            </div>
          </div>

          {/* Informasi Kunjungan & Penjamin */}
          <div className="border border-border/70 bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                Detail Kunjungan & Penjamin
              </h3>
              <Badge variant="outline" className="rounded-none font-mono text-[10px]">
                {visit.visit_number}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Poli Layanan</span>
                <span className="font-semibold text-foreground">{visit.polyclinic?.name || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Dokter Pemeriksa</span>
                <span className="font-medium text-foreground">dr. {visit.doctor?.full_name || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Nomor Antrian</span>
                <span className="font-mono font-bold text-foreground">#{String(visit.queue_number).padStart(3, '0')}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Tanggal Kunjungan</span>
                <span className="font-medium text-foreground">{formatDateTime(visit.visit_date)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Tipe Pembayaran</span>
                <span className="font-medium text-foreground uppercase">{insuranceLabel}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Kontak Darurat</span>
                <span className="font-medium text-foreground">{emergencyLabel || '-'}{patient?.emergency_contact_phone ? ` (${patient.emergency_contact_phone})` : ''}</span>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <span className="text-muted-foreground block text-[11px]">Catatan Alergi Pasien</span>
                <span className={allergyLabel ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
                  {allergyLabel || 'Tidak ada catatan alergi'}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <span className="text-muted-foreground block text-[11px]">Keluhan Awal Pendaftaran</span>
                <span className="text-foreground">{visit.complaint || 'Belum ada keluhan tercatat.'}</span>
              </div>
            </div>
          </div>

          {/* Status SATUSEHAT */}
          <div className="border border-border/70 bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-primary" />
                Status Encounter SATUSEHAT
              </h3>
              <Badge className={visit.satusehat_encounter_id ? 'rounded-none border-0 bg-emerald-600 text-white text-[10px]' : encounterReady ? 'rounded-none border-0 bg-amber-500 text-white text-[10px]' : 'rounded-none border-0 bg-slate-500 text-white text-[10px]'}>
                {visit.satusehat_encounter_id ? 'Tersinkron' : encounterReady ? 'Siap Sync' : 'Belum Siap'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {encounterRequirements.map((item) => (
                <div key={item.label} className="border border-border/70 bg-muted/20 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">{item.label}</span>
                    <Badge variant={item.ready ? 'default' : 'outline'} className="rounded-none text-[10px] px-1.5 py-0 h-4">
                      {item.ready ? 'Ready' : 'Missing'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs break-words text-foreground font-mono">{item.value}</p>
                </div>
              ))}
            </div>

            {visit.satusehat_synced_at ? (
              <p className="text-[11px] text-muted-foreground pt-1">
                Sync terakhir: <span className="font-medium text-foreground">{formatDateTime(visit.satusehat_synced_at)}</span>
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-none shadow-none text-xs"
            onClick={() => onOpenChange(false)}
          >
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
