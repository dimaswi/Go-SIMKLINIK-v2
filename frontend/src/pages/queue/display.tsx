import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  queueApi,
  resolveAssetUrl,
  type DisplayBoardResponse,
  type DisplayQueueTicket,
  type DisplayUnitQueue,
  type QueueCall,
} from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import {
  playQueueAudioFeedback,
  speakQueueCall,
  subscribeQueueCallBroadcast,
  unlockQueueAudio,
} from '@/lib/queue-caller';
import {
  DisplayMediaPanel,
  DisplayRunningTextTicker,
} from '@/components/queue-display/display-media-panel';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  Check,
  Clock3,
  Expand,
  FlaskConical,
  Hospital,
  LayoutGrid,
  Loader2,
  Minimize,
  MonitorPlay,
  Pill,
  Receipt,
  RefreshCw,
  ScanLine,
  Settings2,
  Stethoscope,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';

type DisplayMode = 'pendaftaran' | 'kasir' | 'ruangan';
type GridColumnsSetting = 'auto' | '1' | '2' | '3' | '4';

const STORAGE_ROOMS_KEY = 'simklinik_display_rooms_v1';
const STORAGE_COLS_KEY = 'simklinik_display_cols_v1';
const STORAGE_MEDIA_KEY = 'simklinik_display_media_v1';

const PAYMENT_LABEL: Record<string, string> = {
  umum: 'Umum',
  bpjs: 'BPJS Kesehatan',
  asuransi: 'Asuransi',
};

function formatTicketNumber(num?: number | null) {
  if (!num || num <= 0) return '---';
  return String(num).padStart(3, '0');
}

function formatTimeShort(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function isDisplayMode(value: string | null): value is DisplayMode {
  return value === 'pendaftaran' || value === 'kasir' || value === 'ruangan';
}

function isGridCols(value: string | null): value is GridColumnsSetting {
  return value === 'auto' || value === '1' || value === '2' || value === '3' || value === '4';
}

function getRoomAccent(unitType: string) {
  switch (unitType) {
    case 'pendaftaran':
      return {
        headerBg: 'bg-emerald-700',
        border: 'border-emerald-300',
        softBg: 'bg-emerald-50/70',
        numberText: 'text-emerald-800',
        badgeClass: 'border-emerald-300 bg-emerald-50 text-emerald-800',
        tag: 'LOKET PENDAFTARAN',
        Icon: Users,
      };
    case 'kasir':
      return {
        headerBg: 'bg-sky-700',
        border: 'border-sky-300',
        softBg: 'bg-sky-50/70',
        numberText: 'text-sky-800',
        badgeClass: 'border-sky-300 bg-sky-50 text-sky-800',
        tag: 'LOKET KASIR',
        Icon: Receipt,
      };
    case 'farmasi':
      return {
        headerBg: 'bg-blue-700',
        border: 'border-blue-300',
        softBg: 'bg-blue-50/70',
        numberText: 'text-blue-800',
        badgeClass: 'border-blue-300 bg-blue-50 text-blue-800',
        tag: 'FARMASI / APOTEK',
        Icon: Pill,
      };
    case 'laboratorium':
      return {
        headerBg: 'bg-indigo-700',
        border: 'border-indigo-300',
        softBg: 'bg-indigo-50/70',
        numberText: 'text-indigo-800',
        badgeClass: 'border-indigo-300 bg-indigo-50 text-indigo-800',
        tag: 'LABORATORIUM',
        Icon: FlaskConical,
      };
    case 'radiologi':
      return {
        headerBg: 'bg-amber-700',
        border: 'border-amber-300',
        softBg: 'bg-amber-50/70',
        numberText: 'text-amber-800',
        badgeClass: 'border-amber-300 bg-amber-50 text-amber-800',
        tag: 'RADIOLOGI',
        Icon: ScanLine,
      };
    default:
      return {
        headerBg: 'bg-teal-700',
        border: 'border-teal-300',
        softBg: 'bg-teal-50/70',
        numberText: 'text-teal-800',
        badgeClass: 'border-teal-300 bg-teal-50 text-teal-800',
        tag: 'POLIKLINIK',
        Icon: Stethoscope,
      };
  }
}

function getDynamicGridClass(count: number, colsSetting: GridColumnsSetting) {
  if (colsSetting === '1') return 'grid-cols-1';
  if (colsSetting === '2') return 'grid-cols-1 md:grid-cols-2';
  if (colsSetting === '3') return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
  if (colsSetting === '4') return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';

  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-3';
  if (count === 4) return 'grid-cols-1 md:grid-cols-2';
  if (count <= 6) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
  return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';
}

function doesCallMatchRoom(call: QueueCall, room: DisplayUnitQueue): boolean {
  if (call.unit_type === 'poliklinik' && room.unit_type === 'poliklinik') {
    return call.destination_name.trim().toLowerCase() === room.name.trim().toLowerCase();
  }
  return call.unit_type === room.unit_type;
}

function CounterFocusView({
  unit,
  recentCalls,
  isFlashing,
}: {
  unit: DisplayUnitQueue;
  recentCalls: QueueCall[];
  isFlashing: boolean;
}) {
  const accent = getRoomAccent(unit.unit_type);
  const activeTicket: DisplayQueueTicket | null = unit.active;
  const displayQueueRows = [...unit.in_service, ...unit.waiting].filter(
    (t) => !activeTicket || t.queue_number !== activeTicket.queue_number || t.status !== activeTicket.status
  );
  const filteredRecentCalls = recentCalls.filter((c) => c.unit_type === unit.unit_type).slice(0, 6);
  const recentDone = unit.done.slice(0, 5);
  const isCashier = unit.unit_type === 'kasir';

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
      {/* Left 5 cols: Spotlight Nomor Antrian Aktif */}
      <section className="flex min-h-0 flex-col overflow-hidden border-2 border-slate-300 bg-white shadow-sm lg:col-span-5">
        <div className={cn('flex items-center justify-between px-5 py-3 text-white', accent.headerBg)}>
          <div className="flex items-center gap-2.5">
            <accent.Icon className="h-5 w-5" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
                Panggilan Utama
              </p>
              <h2 className="text-lg font-bold tracking-tight">{unit.name}</h2>
            </div>
          </div>
          <Badge className="rounded-none border border-white/30 bg-white/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-none">
            {isFlashing ? 'SEDANG MEMANGGIL' : activeTicket ? 'AKTIF DILAYANI' : 'MENUNGGU'}
          </Badge>
        </div>

        {/* Colossal Number Hero */}
        <div className={cn('flex flex-1 flex-col items-center justify-center px-6 py-4 text-center', accent.softBg)}>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
            NOMOR ANTRIAN
          </p>
          <div
            className={cn(
              'my-2 text-[clamp(5.5rem,11vw,9.5rem)] font-black leading-none tracking-tighter tabular-nums',
              activeTicket ? accent.numberText : 'text-slate-300',
              isFlashing && 'animate-pulse'
            )}
          >
            {formatTicketNumber(activeTicket?.queue_number)}
          </div>

          <div className="mt-2 inline-flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-slate-800 shadow-xs">
            <span>Silakan Menuju</span>
            <ArrowRight className="h-4 w-4 text-emerald-600" />
            <span className={accent.numberText}>{unit.name}</span>
          </div>

          {/* Patient Metadata Box */}
          <div className="mt-5 w-full border border-slate-300 bg-white p-4 text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Nama Pasien
                </p>
                <p className="mt-1 truncate text-2xl font-bold text-slate-900">
                  {activeTicket?.patient_name || 'Belum ada panggilan aktif'}
                </p>
              </div>
              {activeTicket?.payment_type ? (
                <Badge variant="outline" className="rounded-none border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700 shadow-none shrink-0">
                  {PAYMENT_LABEL[activeTicket.payment_type] || activeTicket.payment_type}
                </Badge>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-200 pt-3 text-sm text-slate-600">
              <p className="truncate">
                <span className="font-semibold text-slate-700">No. RM:</span>{' '}
                <span className="font-mono">{activeTicket?.medical_record_number || '-'}</span>
              </p>
              <p className="truncate">
                <span className="font-semibold text-slate-700">Tujuan:</span>{' '}
                {activeTicket?.polyclinic_name || (isCashier ? 'Kasir Utama' : 'Loket Pendaftaran')}
              </p>
              {activeTicket?.doctor_name ? (
                <p className="col-span-2 truncate">
                  <span className="font-semibold text-slate-700">Dokter:</span> {activeTicket.doctor_name}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* 4 Summary Tiles */}
        <div className="grid grid-cols-4 border-t border-slate-300 bg-slate-100 divide-x divide-slate-300">
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Menunggu</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-amber-700">{unit.counts.waiting}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dilayani</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-sky-700">{unit.counts.in_service}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Selesai</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-emerald-700">{unit.counts.done}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{unit.counts.total}</p>
          </div>
        </div>
      </section>

      {/* Right 7 cols: Next Queue Table + Recent Calls */}
      <section className="flex min-h-0 flex-col gap-3 overflow-hidden lg:col-span-7">
        {/* Waiting Table */}
        <div className="flex min-h-0 flex-[1.5] flex-col overflow-hidden border border-slate-300 bg-white">
          <div className="flex items-center justify-between border-b border-slate-300 bg-slate-800 px-4 py-2.5 text-white">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Daftar Antrian Menunggu Berikutnya
              </h3>
              <p className="text-xs text-slate-300">
                Mohon bersiap saat nomor antrian Anda mendekati panggilan loket.
              </p>
            </div>
            <Badge className="rounded-none bg-white/15 px-2.5 py-1 text-xs font-bold text-white shadow-none">
              {displayQueueRows.length} Antrian
            </Badge>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {displayQueueRows.length === 0 ? (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center p-6 text-center text-slate-500">
                <Users className="mb-2 h-8 w-8 text-slate-300" />
                <p className="text-base font-semibold text-slate-700">Tidak ada antrian menunggu saat ini</p>
                <p className="mt-1 text-xs text-slate-500">
                  {unit.unit_type === 'pendaftaran'
                    ? 'Pasien dapat mengambil tiket antrian di mesin anjungan / petugas pendaftaran.'
                    : isCashier
                      ? 'Daftar tagihan pasien selesai periksa akan tampil otomatis di sini.'
                      : 'Pasien yang terdaftar akan muncul otomatis di daftar tunggu ruangan ini.'}
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-300">
                  <tr>
                    <th className="px-4 py-2.5 w-28">No. Antrian</th>
                    <th className="px-4 py-2.5">Nama Pasien</th>
                    <th className="px-4 py-2.5">Tujuan / Keterangan</th>
                    <th className="px-4 py-2.5 text-right w-40">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {displayQueueRows.slice(0, 12).map((ticket, index) => (
                    <tr
                      key={`${ticket.queue_number}-${ticket.status}-${index}`}
                      className={cn(
                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70',
                        ticket.priority === 'urgent' && 'bg-orange-50/80'
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            'inline-block min-w-[64px] border px-2 py-1 text-center text-xl font-black tabular-nums',
                            ticket.priority === 'urgent'
                              ? 'border-orange-300 bg-orange-100 text-orange-700'
                              : 'border-slate-300 bg-slate-100 text-slate-900'
                          )}
                        >
                          {formatTicketNumber(ticket.queue_number)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-slate-900 text-base">{ticket.patient_name || '-'}</p>
                        {ticket.medical_record_number ? (
                          <p className="font-mono text-xs text-slate-500">RM: {ticket.medical_record_number}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        <p className="font-medium">{ticket.polyclinic_name || unit.name}</p>
                        {ticket.doctor_name ? (
                          <p className="text-xs text-slate-500">{ticket.doctor_name}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-none shadow-none text-xs font-semibold',
                            ticket.priority === 'urgent'
                              ? 'border-orange-300 bg-orange-100 text-orange-800'
                              : ticket.status === 'called' || ticket.status === 'processing' || ticket.status === 'calling' || ticket.status === 'in_consultation'
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                : 'border-slate-300 bg-white text-slate-700'
                          )}
                        >
                          {ticket.priority === 'urgent' ? 'PRIORITAS' : ticket.status_label || 'Menunggu'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Bottom split: Recent Audio Calls & Recent Done */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 overflow-hidden">
          <div className="flex min-h-0 flex-col overflow-hidden border border-slate-300 bg-white">
            <div className="border-b border-slate-200 bg-slate-100 px-4 py-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Riwayat Panggilan Terakhir
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
              {filteredRecentCalls.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">Belum ada panggilan terekam hari ini.</p>
              ) : (
                filteredRecentCalls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between gap-2 border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-base font-black tabular-nums text-emerald-800">
                        {formatTicketNumber(call.queue_number)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {call.patient_name || 'Pasien Antrian'}
                        </p>
                        <p className="truncate text-xs text-slate-500">{call.destination_name}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-slate-500 shrink-0">
                      {formatTimeShort(call.created_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden border border-slate-300 bg-white">
            <div className="border-b border-slate-200 bg-slate-100 px-4 py-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Selesai Dilayani Hari Ini ({unit.counts.done})
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
              {recentDone.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">Belum ada pasien selesai pada sesi ini.</p>
              ) : (
                recentDone.map((ticket, idx) => (
                  <div
                    key={`${ticket.queue_number}-done-${idx}`}
                    className="flex items-center justify-between gap-2 border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="border border-slate-300 bg-slate-100 px-2 py-0.5 text-sm font-bold tabular-nums text-slate-700">
                        {formatTicketNumber(ticket.queue_number)}
                      </span>
                      <p className="truncate text-sm font-medium text-slate-800">{ticket.patient_name}</p>
                    </div>
                    <Badge variant="outline" className="rounded-none border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700 shadow-none shrink-0">
                      {ticket.status_label}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RoomMonitorCard({
  room,
  compact,
  isFlashing,
}: {
  room: DisplayUnitQueue;
  compact: boolean;
  isFlashing: boolean;
}) {
  const accent = getRoomAccent(room.unit_type);
  const activeTicket = room.active;
  const waitingPreview = room.waiting.slice(0, compact ? 4 : 6);
  const remainingWaiting = Math.max(0, room.waiting.length - waitingPreview.length);

  return (
    <article className="flex min-h-0 flex-col overflow-hidden border-2 border-slate-300 bg-white shadow-xs transition-all">
      {/* Room Header */}
      <div className={cn('flex items-center justify-between gap-2 px-4 py-2.5 text-white', accent.headerBg)}>
        <div className="flex items-center gap-2 min-w-0">
          <accent.Icon className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-bold tracking-tight">{room.name}</h3>
              {room.code ? (
                <span className="border border-white/30 bg-white/15 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                  {room.code}
                </span>
              ) : null}
            </div>
            <p className="truncate text-[11px] text-white/85">{room.subtitle}</p>
          </div>
        </div>
        <Badge className="rounded-none border border-white/30 bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-none shrink-0">
          {isFlashing ? 'MEMANGGIL' : accent.tag}
        </Badge>
      </div>

      {/* Active Number Display */}
      <div className={cn('flex flex-1 flex-col justify-between p-4', accent.softBg)}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
            {activeTicket ? activeTicket.status_label || 'Sedang Dilayani' : 'Menunggu Panggilan'}
          </span>
          {activeTicket?.payment_type ? (
            <Badge variant="outline" className="rounded-none border-slate-300 bg-white text-[11px] font-semibold text-slate-700 shadow-none">
              {PAYMENT_LABEL[activeTicket.payment_type] || activeTicket.payment_type}
            </Badge>
          ) : null}
        </div>

        <div className="my-2 flex items-center justify-between gap-3 border border-slate-300/80 bg-white px-4 py-3">
          <div
            className={cn(
              'font-black leading-none tracking-tight tabular-nums',
              compact ? 'text-5xl xl:text-6xl' : 'text-6xl xl:text-7xl',
              activeTicket ? accent.numberText : 'text-slate-300',
              isFlashing && 'animate-pulse'
            )}
          >
            {formatTicketNumber(activeTicket?.queue_number)}
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-lg font-bold text-slate-900">
              {activeTicket?.patient_name || 'Belum ada pasien'}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
              {activeTicket?.medical_record_number ? `RM: ${activeTicket.medical_record_number}` : room.waiting.length > 0 ? 'Siap dipanggil berikutnya' : 'Ruangan kosong'}
            </p>
            {activeTicket?.doctor_name ? (
              <p className="mt-0.5 truncate text-xs text-slate-600">{activeTicket.doctor_name}</p>
            ) : null}
          </div>
        </div>

        {/* Waiting Queue Chips */}
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            <span>Antrian Berikutnya</span>
            <span>{room.waiting.length} Menunggu</span>
          </div>
          {waitingPreview.length === 0 ? (
            <div className="border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-center text-xs text-slate-400">
              Tidak ada antrian menunggu
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {waitingPreview.map((ticket, idx) => (
                <div
                  key={`${room.unit_key}-wait-${ticket.queue_number}-${idx}`}
                  className={cn(
                    'flex items-center gap-1.5 border px-2 py-1 text-xs',
                    ticket.priority === 'urgent'
                      ? 'border-orange-300 bg-orange-50 text-orange-800'
                      : 'border-slate-300 bg-white text-slate-800'
                  )}
                >
                  <span className="font-black tabular-nums">{formatTicketNumber(ticket.queue_number)}</span>
                  <span className="max-w-[110px] truncate text-[11px] text-slate-600">
                    {ticket.patient_name}
                  </span>
                </div>
              ))}
              {remainingWaiting > 0 ? (
                <span className="border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  +{remainingWaiting} lagi
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Room Footer Counters */}
      <div className="grid grid-cols-3 border-t border-slate-300 bg-slate-100 divide-x divide-slate-300 text-center text-xs">
        <div className="py-1.5">
          <span className="text-slate-500">Menunggu </span>
          <span className="font-bold tabular-nums text-amber-700">{room.counts.waiting}</span>
        </div>
        <div className="py-1.5">
          <span className="text-slate-500">Dilayani </span>
          <span className="font-bold tabular-nums text-sky-700">{room.counts.in_service}</span>
        </div>
        <div className="py-1.5">
          <span className="text-slate-500">Selesai </span>
          <span className="font-bold tabular-nums text-emerald-700">{room.counts.done}</span>
        </div>
      </div>
    </article>
  );
}

export default function QueueDisplay() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Resolve initial mode (support legacy ?poli=... param seamlessly)
  const initialMode: DisplayMode = useMemo(() => {
    const modeParam = searchParams.get('mode');
    if (isDisplayMode(modeParam)) return modeParam;
    if (searchParams.get('poli')) return 'ruangan';
    return 'pendaftaran';
  }, [searchParams]);

  const [mode, setMode] = useState<DisplayMode>(initialMode);
  const [selectedRoomKeys, setSelectedRoomKeys] = useState<string[]>(() => {
    const roomsParam = searchParams.get('rooms');
    if (roomsParam) {
      return roomsParam.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const legacyPoli = searchParams.get('poli');
    if (legacyPoli && legacyPoli !== 'all') {
      return [`poli:${legacyPoli}`];
    }
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_ROOMS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
        }
      } catch {
        // Ignore storage error
      }
    }
    return [];
  });

  const [gridCols, setGridCols] = useState<GridColumnsSetting>(() => {
    const colsParam = searchParams.get('cols');
    if (isGridCols(colsParam)) return colsParam;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_COLS_KEY);
      if (isGridCols(saved)) return saved;
    }
    return 'auto';
  });

  const [board, setBoard] = useState<DisplayBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [showMediaPanel, setShowMediaPanel] = useState(() => {
    const adsParam = searchParams.get('ads');
    if (adsParam === '0' || adsParam === 'false') return false;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_MEDIA_KEY);
      if (saved === '0') return false;
    }
    return true;
  });
  const [clockLabel, setClockLabel] = useState('');
  const [dateLabel, setDateLabel] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [draftRoomKeys, setDraftRoomKeys] = useState<string[]>([]);
  const [draftCols, setDraftCols] = useState<GridColumnsSetting>('auto');
  const [activeCallSpotlight, setActiveCallSpotlight] = useState<QueueCall | null>(null);
  const [flashingCallKey, setFlashingCallKey] = useState<string | null>(null);

  const lastAnnouncedCallKeyRef = useRef<string | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const initialPoliParamRef = useRef(searchParams.get('poli'));
  const isCallRelevantRef = useRef<(call: QueueCall) => boolean>(() => false);
  const triggerCallAttentionRef = useRef<(call: QueueCall, shouldSpeak: boolean) => void>(() => {});

  // Sync mode when query params change externally
  useEffect(() => {
    const modeParam = searchParams.get('mode');
    if (isDisplayMode(modeParam) && modeParam !== mode) {
      setMode(modeParam);
    }
  }, [mode, searchParams]);

  // Digital Clock WIB
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockLabel(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setDateLabel(
        now.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      );
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Page Title
  useEffect(() => {
    const modeTitle =
      mode === 'pendaftaran'
        ? 'Display Antrian Pendaftaran'
        : mode === 'kasir'
          ? 'Display Antrian Kasir'
          : 'Display Antrian Ruangan';
    setPageTitle(modeTitle);
  }, [mode]);

  const allRooms = useMemo(() => board?.rooms || [], [board]);

  const displayedRooms = useMemo(() => {
    if (allRooms.length === 0) return [];
    if (selectedRoomKeys.length === 0) {
      return allRooms;
    }
    const validSet = new Set(allRooms.map((r) => r.unit_key));
    const filtered = selectedRoomKeys
      .filter((key) => validSet.has(key))
      .map((key) => allRooms.find((r) => r.unit_key === key))
      .filter((r): r is DisplayUnitQueue => Boolean(r));
    return filtered.length > 0 ? filtered : allRooms;
  }, [allRooms, selectedRoomKeys]);

  const isCallRelevantToScreen = useCallback(
    (call: QueueCall) => {
      if (mode === 'pendaftaran') return call.unit_type === 'pendaftaran';
      if (mode === 'kasir') return call.unit_type === 'kasir';
      if (displayedRooms.length === 0) return call.unit_type !== 'pendaftaran' && call.unit_type !== 'kasir';
      return displayedRooms.some((room) => doesCallMatchRoom(call, room));
    },
    [displayedRooms, mode]
  );

  const triggerCallAttention = useCallback(
    (call: QueueCall, shouldSpeak: boolean) => {
      const callKey = `${call.id}-${call.created_at}`;
      if (lastAnnouncedCallKeyRef.current === callKey) return;
      lastAnnouncedCallKeyRef.current = callKey;

      if (!isCallRelevantToScreen(call)) {
        return;
      }

      setActiveCallSpotlight(call);
      setFlashingCallKey(callKey);
      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
      }
      flashTimeoutRef.current = window.setTimeout(() => {
        setFlashingCallKey(null);
      }, 8000);

      if (shouldSpeak && soundEnabled) {
        speakQueueCall(call);
      }
    },
    [isCallRelevantToScreen, soundEnabled]
  );

  isCallRelevantRef.current = isCallRelevantToScreen;
  triggerCallAttentionRef.current = triggerCallAttention;

  const fetchBoard = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (isInitial) setLoading(true);
    try {
      const response = await queueApi.getDisplayBoard();
      const data = response.data.data;
      setBoard(data);

      // Initialize default rooms once if none persisted and legacy ?poli=all
      if (isInitial && data.rooms.length > 0) {
        if (initialPoliParamRef.current === 'all') {
          setSelectedRoomKeys(data.rooms.filter((r) => r.unit_type === 'poliklinik').map((r) => r.unit_key));
        }
        if (data.latest_call) {
          lastAnnouncedCallKeyRef.current = `${data.latest_call.id}-${data.latest_call.created_at}`;
          if (isCallRelevantRef.current(data.latest_call)) {
            setActiveCallSpotlight(data.latest_call);
          }
        }
      } else if (data.latest_call) {
        triggerCallAttentionRef.current(data.latest_call, !isInitial);
      }
    } finally {
      isFetchingRef.current = false;
      if (isInitial) setLoading(false);
    }
  }, []);

  // Auto-unlock browser audio on first user interaction anywhere on the display
  useEffect(() => {
    if (audioReady) return;
    const handleFirstGesture = () => {
      void unlockQueueAudio().then((ok) => {
        if (ok) setAudioReady(true);
      });
    };
    window.addEventListener('pointerdown', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, [audioReady]);

  useEffect(() => {
    void fetchBoard(true);
    const pollTimer = window.setInterval(() => {
      void fetchBoard(false);
    }, 4000);

    const unsubscribe = subscribeQueueCallBroadcast((call) => {
      triggerCallAttentionRef.current(call, true);
      void fetchBoard(false);
    });

    return () => {
      window.clearInterval(pollTimer);
      unsubscribe();
      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
      }
    };
  }, [fetchBoard]);

  const updateUrlAndSwitchMode = (nextMode: DisplayMode) => {
    setMode(nextMode);
    setActiveCallSpotlight(null);
    setFlashingCallKey(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('mode', nextMode);
    nextParams.delete('poli');
    if (nextMode === 'ruangan') {
      if (selectedRoomKeys.length > 0) {
        nextParams.set('rooms', selectedRoomKeys.join(','));
      }
      nextParams.set('cols', gridCols);
    } else {
      nextParams.delete('rooms');
      nextParams.delete('cols');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const openConfigDialog = () => {
    setDraftRoomKeys(
      selectedRoomKeys.length > 0 ? selectedRoomKeys : allRooms.map((r) => r.unit_key)
    );
    setDraftCols(gridCols);
    setConfigOpen(true);
  };

  const saveRoomConfiguration = () => {
    const cleanedRooms = draftRoomKeys.length === allRooms.length ? [] : draftRoomKeys;
    setSelectedRoomKeys(draftRoomKeys);
    setGridCols(draftCols);
    try {
      localStorage.setItem(STORAGE_ROOMS_KEY, JSON.stringify(draftRoomKeys));
      localStorage.setItem(STORAGE_COLS_KEY, draftCols);
    } catch {
      // Ignore storage error
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('mode', 'ruangan');
    nextParams.delete('poli');
    if (cleanedRooms.length > 0) {
      nextParams.set('rooms', cleanedRooms.join(','));
    } else {
      nextParams.delete('rooms');
    }
    nextParams.set('cols', draftCols);
    setMode('ruangan');
    setSearchParams(nextParams, { replace: true });
    setConfigOpen(false);
  };

  const toggleDraftRoom = (unitKey: string) => {
    setDraftRoomKeys((prev) =>
      prev.includes(unitKey) ? prev.filter((k) => k !== unitKey) : [...prev, unitKey]
    );
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  };

  const latestRoomCall = useMemo(() => {
    if (activeCallSpotlight && mode === 'ruangan') return activeCallSpotlight;
    const roomCalls = (board?.recent_calls || []).filter((c) =>
      displayedRooms.some((room) => doesCallMatchRoom(c, room))
    );
    return roomCalls[0] || null;
  }, [activeCallSpotlight, board?.recent_calls, displayedRooms, mode]);

  const recentRoomCalls = useMemo(() => {
    return (board?.recent_calls || [])
      .filter((c) => displayedRooms.some((room) => doesCallMatchRoom(c, room)))
      .slice(0, 3);
  }, [board?.recent_calls, displayedRooms]);

  const clinicLogoUrl = resolveAssetUrl(board?.clinic_info?.logo);

  const headerModeLabel =
    mode === 'pendaftaran'
      ? 'DISPLAY ANTRIAN LOKET PENDAFTARAN'
      : mode === 'kasir'
        ? 'DISPLAY ANTRIAN LOKET KASIR & PEMBAYARAN'
        : `DISPLAY ANTRIAN RUANGAN (${displayedRooms.length} RUANG AKTIF)`;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-900 select-none">
      {/* Hospital TV Header */}
      <header className="border-b-4 border-emerald-500 bg-slate-950 px-4 py-2.5 text-white shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Hospital Branding */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-emerald-400/50 bg-emerald-600/20 p-1">
              {clinicLogoUrl ? (
                <img src={clinicLogoUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <Hospital className="h-7 w-7 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-extrabold uppercase tracking-wide text-white xl:text-xl">
                  {board?.clinic_info?.name || 'SIMKLINIK HOSPITAL QUEUE'}
                </h1>
                <Badge className="rounded-none border border-emerald-400/60 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300 shadow-none">
                  {headerModeLabel}
                </Badge>
              </div>
              <p className="truncate text-xs text-slate-300">
                {board?.clinic_info?.subtitle || 'Sistem Informasi Antrian Layanan Rumah Sakit & Klinik'}
              </p>
            </div>
          </div>

          {/* Right Switcher & TV Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 3 Display Modes Switcher */}
            <div className="flex items-center border border-slate-700 bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => updateUrlAndSwitchMode('pendaftaran')}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors',
                  mode === 'pendaftaran'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                Pendaftaran
              </button>
              <button
                type="button"
                onClick={() => updateUrlAndSwitchMode('kasir')}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors',
                  mode === 'kasir'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                Kasir
              </button>
              <button
                type="button"
                onClick={() => updateUrlAndSwitchMode('ruangan')}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors',
                  mode === 'ruangan'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                Ruangan ({displayedRooms.length})
              </button>
            </div>

            {/* Dynamic Room Picker Trigger */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 hover:text-white shadow-none"
              onClick={openConfigDialog}
              title="Atur ruangan & jumlah kolom display"
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
              Atur Ruangan ({displayedRooms.length})
            </Button>

            {/* Sound Controls */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'h-8 rounded-none px-2.5 text-xs font-semibold shadow-none',
                !audioReady
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 hover:text-white'
                  : soundEnabled
                    ? 'border-emerald-500/70 bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/30 hover:text-white'
                    : 'border-slate-700 bg-slate-900 text-rose-300 hover:bg-slate-800 hover:text-white'
              )}
              onClick={async () => {
                if (!audioReady) {
                  const ok = await unlockQueueAudio();
                  setAudioReady(ok || true);
                  setSoundEnabled(true);
                  void playQueueAudioFeedback('in').catch(() => {});
                  return;
                }
                setSoundEnabled((prev) => !prev);
              }}
            >
              {!audioReady || soundEnabled ? (
                <Volume2 className={cn('mr-1.5 h-3.5 w-3.5', !audioReady ? 'text-amber-300' : 'text-emerald-400')} />
              ) : (
                <VolumeX className="mr-1.5 h-3.5 w-3.5 text-rose-400" />
              )}
              {!audioReady ? 'Aktifkan Suara' : soundEnabled ? 'Suara Aktif' : 'Suara Mati'}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-slate-700 bg-slate-900 px-2.5 text-xs text-white hover:bg-slate-800 hover:text-white shadow-none"
              onClick={() => {
                setShowMediaPanel((prev) => {
                  const next = !prev;
                  try {
                    localStorage.setItem(STORAGE_MEDIA_KEY, next ? '1' : '0');
                  } catch {
                    // Ignore storage error
                  }
                  return next;
                });
              }}
              title="Tampilkan atau sembunyikan slot video & iklan"
            >
              <MonitorPlay className={cn('mr-1.5 h-3.5 w-3.5', showMediaPanel ? 'text-amber-400' : 'text-slate-400')} />
              {showMediaPanel ? 'Iklan On' : 'Iklan Off'}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-slate-700 bg-slate-900 px-2.5 text-xs text-white hover:bg-slate-800 hover:text-white shadow-none"
              onClick={() => void fetchBoard(false)}
              title="Muat ulang data antrian"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-8 rounded-none bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-none"
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
            </Button>

            {/* Digital Clock WIB */}
            <div className="border border-slate-700 bg-slate-900 px-3 py-1 text-right">
              <div className="flex items-center justify-end gap-1.5 font-mono text-base font-black leading-none tabular-nums text-emerald-400">
                <Clock3 className="h-3.5 w-3.5" />
                <span>{clockLabel || '--:--:--'}</span>
                <span className="text-[10px] font-bold text-slate-400">WIB</span>
              </div>
              <p className="mt-0.5 text-[10px] font-medium text-slate-300">{dateLabel || '-'}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-12">
        <div
          className={cn(
            'flex min-h-0 flex-col gap-3 overflow-hidden',
            showMediaPanel && board ? 'lg:col-span-9' : 'lg:col-span-12'
          )}
        >
          {loading && !board ? (
            <div className="flex min-h-0 flex-1 items-center justify-center border border-slate-300 bg-white">
              <div className="flex flex-col items-center gap-3 text-slate-600">
                <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                <p className="text-sm font-semibold">Memuat Papan Antrian Layanan...</p>
              </div>
            </div>
          ) : mode === 'pendaftaran' && board ? (
            <CounterFocusView
              unit={board.registration}
              recentCalls={board.recent_calls}
              isFlashing={Boolean(
                flashingCallKey && activeCallSpotlight?.unit_type === 'pendaftaran'
              )}
            />
          ) : mode === 'kasir' && board ? (
            <CounterFocusView
              unit={board.cashier}
              recentCalls={board.recent_calls}
              isFlashing={Boolean(
                flashingCallKey && activeCallSpotlight?.unit_type === 'kasir'
              )}
            />
          ) : board ? (
            displayedRooms.length === 1 ? (
              <CounterFocusView
                unit={displayedRooms[0]}
                recentCalls={board.recent_calls.filter((c) => doesCallMatchRoom(c, displayedRooms[0]))}
                isFlashing={Boolean(
                  flashingCallKey &&
                    activeCallSpotlight &&
                    doesCallMatchRoom(activeCallSpotlight, displayedRooms[0])
                )}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                {/* Top Spotlight Strip for Multi-Room Calls */}
                <div className="grid grid-cols-1 gap-3 border-2 border-slate-300 bg-white px-4 py-2.5 lg:grid-cols-12 shrink-0">
                  <div className="flex items-center justify-between gap-4 lg:col-span-6 lg:border-r lg:border-slate-200 lg:pr-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-emerald-300 bg-emerald-50 text-emerald-700">
                        <Volume2 className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                          Panggilan Ruangan Terakhir
                        </p>
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-3xl font-black tabular-nums text-slate-900">
                            {latestRoomCall ? formatTicketNumber(latestRoomCall.queue_number) : '---'}
                          </span>
                          <span className="truncate text-base font-bold text-slate-800">
                            {latestRoomCall?.patient_name || 'Menunggu panggilan ruangan'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {latestRoomCall ? (
                      <div className="flex items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-900 shrink-0">
                        <ArrowRight className="h-4 w-4 text-emerald-700" />
                        <span>{latestRoomCall.destination_name}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* 3 Recent Room Calls */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:col-span-6 items-center">
                    {recentRoomCalls.length === 0 ? (
                      <div className="col-span-3 text-center text-xs text-slate-400 py-2">
                        Riwayat panggilan ruangan akan muncul di sini saat petugas memanggil pasien.
                      </div>
                    ) : (
                      recentRoomCalls.map((call) => (
                        <div
                          key={call.id}
                          className="flex items-center justify-between gap-2 border border-slate-200 bg-slate-50 px-3 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900">
                              No. {formatTicketNumber(call.queue_number)} • {call.patient_name || 'Pasien'}
                            </p>
                            <p className="truncate text-[11px] font-semibold text-emerald-700">
                              {call.destination_name}
                            </p>
                          </div>
                          <span className="font-mono text-[10px] text-slate-500 shrink-0">
                            {formatTimeShort(call.created_at)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Dynamic Multi-Room Grid */}
                <div
                  className={cn(
                    'grid min-h-0 flex-1 gap-3 overflow-y-auto pr-0.5',
                    displayedRooms.length <= 6 ? 'auto-rows-fr' : 'auto-rows-[minmax(270px,1fr)]',
                    getDynamicGridClass(displayedRooms.length, gridCols)
                  )}
                >
                  {displayedRooms.map((room) => (
                    <RoomMonitorCard
                      key={room.unit_key}
                      room={room}
                      compact={displayedRooms.length > 4}
                      isFlashing={Boolean(
                        flashingCallKey &&
                          activeCallSpotlight &&
                          doesCallMatchRoom(activeCallSpotlight, room)
                      )}
                    />
                  ))}
                </div>
              </div>
            )
          ) : null}
        </div>

        {/* Slot Video & Iklan Promosi (Standar Go-SIMRS) */}
        {showMediaPanel && board ? (
          <DisplayMediaPanel
            videoUrl={board.clinic_info?.display_video_url}
            adsRaw={board.clinic_info?.display_ads}
            hospitalName={board.clinic_info?.name || 'SIMKLINIK'}
            hospitalSubtitle={board.clinic_info?.subtitle}
            appLogo={board.clinic_info?.logo}
            className="hidden lg:flex lg:col-span-3"
          />
        ) : null}
      </main>

      {/* Running Info Bar Footer */}
      <DisplayRunningTextTicker
        text={board?.clinic_info?.display_running_text}
        hospitalName={board?.clinic_info?.name || 'SIMKLINIK'}
      />

      {/* Dialog Konfigurasi Ruangan Dinamis */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-2xl rounded-none border-slate-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <LayoutGrid className="h-5 w-5 text-emerald-600" />
              Konfigurasi Display Ruangan Dinamis
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pilih berapa ruangan yang ingin ditampilkan di monitor TV ini (bisa 1 ruang fokus, 2-6 ruang panel, atau seluruh poliklinik & instalasi penunjang).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-none text-xs shadow-none"
                onClick={() => setDraftRoomKeys(allRooms.map((r) => r.unit_key))}
              >
                Semua Ruangan ({allRooms.length})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-none text-xs shadow-none"
                onClick={() =>
                  setDraftRoomKeys(
                    allRooms.filter((r) => r.unit_type === 'poliklinik').map((r) => r.unit_key)
                  )
                }
              >
                Semua Poliklinik
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-none text-xs shadow-none"
                onClick={() =>
                  setDraftRoomKeys(
                    allRooms.filter((r) => r.unit_type !== 'poliklinik').map((r) => r.unit_key)
                  )
                }
              >
                Farmasi, Lab & Radiologi
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-none text-xs text-slate-500"
                onClick={() => setDraftRoomKeys([])}
              >
                Kosongkan Pilihan
              </Button>
            </div>

            {/* Room Checklist Grid */}
            <div className="grid max-h-[300px] grid-cols-1 gap-2 overflow-y-auto border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              {allRooms.map((room) => {
                const selected = draftRoomKeys.includes(room.unit_key);
                const accent = getRoomAccent(room.unit_type);
                return (
                  <button
                    key={room.unit_key}
                    type="button"
                    onClick={() => toggleDraftRoom(room.unit_key)}
                    className={cn(
                      'flex items-center justify-between gap-2 border p-2.5 text-left transition-colors',
                      selected
                        ? 'border-emerald-600 bg-emerald-50/90'
                        : 'border-slate-300 bg-white hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center border',
                          selected
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 bg-white'
                        )}
                      >
                        {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900">{room.name}</p>
                        <p className="truncate text-[10px] text-slate-500">
                          {accent.tag} • Antrian: {room.counts.waiting + room.counts.in_service}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Grid Columns Option */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Jumlah Kolom Grid Layar TV
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {(['auto', '1', '2', '3', '4'] as GridColumnsSetting[]).map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setDraftCols(col)}
                    className={cn(
                      'border py-1.5 text-xs font-semibold transition-colors',
                      draftCols === col
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    {col === 'auto' ? 'Otomatis' : `${col} Kolom`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <p className="self-center text-xs text-slate-500">
              {draftRoomKeys.length === 0
                ? 'Kosong = Tampilkan semua ruangan secara otomatis'
                : `${draftRoomKeys.length} ruangan dipilih`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-none shadow-none"
                onClick={() => setConfigOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="rounded-none bg-emerald-600 hover:bg-emerald-700 shadow-none"
                onClick={saveRoomConfiguration}
              >
                Terapkan ke Display Ruangan
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
