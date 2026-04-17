import type { ControlScheduleItem, MedicalRecord, Visit } from '@/lib/api';

export type ControlScheduleWhatsAppPayload = {
  patientName: string;
  patientPhone?: string | null;
  visitNumber?: string | null;
  doctorName?: string | null;
  polyclinicName?: string | null;
  followUpAt?: string | null;
  followUpInstruction?: string | null;
};

function formatFollowUpLabel(value?: string | null) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function normalizeWhatsAppNumber(value?: string | null) {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  if (digits.startsWith('62')) {
    return digits;
  }

  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }

  if (digits.startsWith('8')) {
    return `62${digits}`;
  }

  return digits;
}

export function buildControlScheduleWhatsAppMessage(payload: ControlScheduleWhatsAppPayload) {
  const patientName = payload.patientName?.trim() || 'Bapak/Ibu Pasien';
  const followUpLabel = formatFollowUpLabel(payload.followUpAt);
  const instruction = (payload.followUpInstruction || '').trim();
  const scheduleLine = [
    'Kami mengingatkan jadwal kontrol Anda',
    payload.polyclinicName?.trim() ? `di ${payload.polyclinicName.trim()}` : '',
    payload.doctorName?.trim() ? `bersama ${payload.doctorName.trim()}` : '',
    followUpLabel ? `pada ${followUpLabel}` : '',
  ].filter(Boolean).join(' ');

  return [
    `Yth. ${patientName},`,
    `${scheduleLine}.`,
    instruction ? `Instruksi kontrol: ${instruction}.` : '',
    payload.visitNumber?.trim() ? `Nomor kunjungan: ${payload.visitNumber.trim()}.` : '',
    'Mohon hadir 15 menit lebih awal dan membawa identitas serta dokumen pendukung bila diperlukan.',
    'Terima kasih.',
  ].filter(Boolean).join('\n\n');
}

export function buildWhatsAppUrl(phoneNumber: string, message: string) {
  const normalizedPhone = normalizeWhatsAppNumber(phoneNumber);
  if (!normalizedPhone) {
    return '';
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export function openWhatsAppUrl(phoneNumber: string, message: string) {
  const whatsappUrl = buildWhatsAppUrl(phoneNumber, message);
  if (!whatsappUrl) {
    return false;
  }

  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  return true;
}

export function createControlScheduleWhatsAppPayloadFromVisit(visit?: Visit | null, outcomeRecord?: MedicalRecord | null): ControlScheduleWhatsAppPayload | null {
  if (!visit || !outcomeRecord || outcomeRecord.disposition?.trim().toLowerCase() !== 'kontrol') {
    return null;
  }

  return {
    patientName: visit.patient?.full_name || '',
    patientPhone: visit.patient?.phone || '',
    visitNumber: visit.visit_number || '',
    doctorName: visit.doctor?.full_name || '',
    polyclinicName: visit.polyclinic?.name || '',
    followUpAt: outcomeRecord.follow_up_at || '',
    followUpInstruction: outcomeRecord.follow_up_instruction || '',
  };
}

export function createControlScheduleWhatsAppPayloadFromScheduleItem(item: ControlScheduleItem): ControlScheduleWhatsAppPayload {
  return {
    patientName: item.patient_name || '',
    patientPhone: item.patient_phone || '',
    visitNumber: item.visit_number || '',
    doctorName: item.doctor_name || '',
    polyclinicName: item.polyclinic_name || '',
    followUpAt: item.follow_up_at || '',
    followUpInstruction: item.follow_up_instruction || '',
  };
}