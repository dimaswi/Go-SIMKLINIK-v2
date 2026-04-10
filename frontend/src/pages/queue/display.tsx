import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { polyclinicsApi, queueApi, type Polyclinic, type Visit } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import {
  Clock3,
  Expand,
  Loader2,
  Minimize,
  RefreshCw,
} from 'lucide-react';

type QueueBuckets = {
  waiting: Visit[];
  in_consultation: Visit[];
  done: Visit[];
  cancelled: Visit[];
};

const EMPTY_QUEUE: QueueBuckets = {
  waiting: [],
  in_consultation: [],
  done: [],
  cancelled: [],
};

const PAYMENT_LABEL: Record<string, string> = {
  umum: 'Umum',
  bpjs: 'BPJS',
  asuransi: 'Asuransi',
};

function sortVisits(visits: Visit[]) {
  return [...visits].sort((left, right) => {
    const leftPoli = left.polyclinic?.name || '';
    const rightPoli = right.polyclinic?.name || '';

    if (leftPoli !== rightPoli) {
      return leftPoli.localeCompare(rightPoli, 'id-ID');
    }

    if (left.priority !== right.priority) {
      return left.priority === 'urgent' ? -1 : 1;
    }

    return left.queue_number - right.queue_number;
  });
}

function mergeQueueBuckets(buckets: QueueBuckets[]) {
  return {
    waiting: sortVisits(buckets.flatMap((bucket) => bucket.waiting)),
    in_consultation: sortVisits(buckets.flatMap((bucket) => bucket.in_consultation)),
    done: sortVisits(buckets.flatMap((bucket) => bucket.done)),
    cancelled: sortVisits(buckets.flatMap((bucket) => bucket.cancelled)),
  };
}

function withPolyclinic(visits: Visit[], polyclinic?: Polyclinic) {
  return visits.map((visit) => ({
    ...visit,
    polyclinic: visit.polyclinic || polyclinic,
  }));
}

function WaitingTicket({ visit, order }: { visit: Visit; order: number }) {
  return (
    <div className={`border px-4 py-4 ${visit.priority === 'urgent' ? 'border-orange-300 bg-orange-50/80' : 'border-slate-300/70 bg-white/70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Antrean Berikut #{order}</p>
          <p className={`mt-2 text-4xl font-black leading-none tracking-tight ${visit.priority === 'urgent' ? 'text-orange-600' : 'text-slate-900'}`}>
            {String(visit.queue_number).padStart(3, '0')}
          </p>
        </div>
        <Badge variant="outline" className="rounded-none border-slate-300 bg-white/70 text-slate-700 shadow-none">
          {PAYMENT_LABEL[visit.payment_type] || visit.payment_type}
        </Badge>
      </div>
      <div className="mt-4 space-y-1 text-sm text-slate-600">
        <p className="text-base font-semibold text-slate-900">{visit.patient?.full_name || '-'}</p>
        <p>{visit.polyclinic?.name || '-'}</p>
        <p>{visit.doctor?.full_name || 'Dokter belum dipilih'}</p>
      </div>
    </div>
  );
}

export default function QueueDisplay() {
  const [searchParams] = useSearchParams();
  const [clockLabel, setClockLabel] = useState('');
  const [dateLabel, setDateLabel] = useState('');
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [selectedPoli, setSelectedPoli] = useState(searchParams.get('poli') || '');
  const [queueData, setQueueData] = useState<QueueBuckets>(EMPTY_QUEUE);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAllPoli = selectedPoli === 'all';

  useEffect(() => {
    setPageTitle('Display Antrian');
    polyclinicsApi.getAll().then((response) => {
      const list: Polyclinic[] = response.data.data || [];
      setPolyclinics(list);
      if (!selectedPoli && list.length > 0) {
        const firstId = String(list[0].id);
        setSelectedPoli(firstId);
      }
    }).catch(() => {
      setLoading(false);
    });
  }, [selectedPoli]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockLabel(now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
      setDateLabel(now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }));
    };

    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const fetchQueue = useCallback(async () => {
    if (!selectedPoli) {
      return;
    }

    if (selectedPoli === 'all' && polyclinics.length === 0) {
      return;
    }

    setLoading(true);
    try {
      if (selectedPoli === 'all') {
        const responses = await Promise.all(
          polyclinics.map(async (polyclinic) => {
            const response = await queueApi.getByPolyclinic(polyclinic.id);
            const data = response.data.data || EMPTY_QUEUE;

            return {
              waiting: withPolyclinic(data.waiting || [], polyclinic),
              in_consultation: withPolyclinic(data.in_consultation || [], polyclinic),
              done: withPolyclinic(data.done || [], polyclinic),
              cancelled: withPolyclinic(data.cancelled || [], polyclinic),
            } satisfies QueueBuckets;
          })
        );

        setQueueData(mergeQueueBuckets(responses));
      } else {
        const response = await queueApi.getByPolyclinic(Number(selectedPoli));
        const data = response.data.data || EMPTY_QUEUE;
        const currentPoli = polyclinics.find((item) => String(item.id) === selectedPoli);

        setQueueData({
          waiting: withPolyclinic(data.waiting || [], currentPoli),
          in_consultation: withPolyclinic(data.in_consultation || [], currentPoli),
          done: withPolyclinic(data.done || [], currentPoli),
          cancelled: withPolyclinic(data.cancelled || [], currentPoli),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [polyclinics, selectedPoli]);

  useEffect(() => {
    void fetchQueue();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      void fetchQueue();
    }, 15000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchQueue]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  };

  const currentPolyclinic = useMemo(
    () => polyclinics.find((item) => String(item.id) === selectedPoli) || null,
    [polyclinics, selectedPoli]
  );
  const displayTitle = isAllPoli ? 'Semua Poliklinik' : currentPolyclinic?.name || 'Pilih Poliklinik';

  const currentCall = queueData.in_consultation[0] || queueData.waiting[0] || null;
  const hasCurrentCall = Boolean(currentCall);
  const currentLabel = queueData.in_consultation[0] ? 'Sedang Dilayani' : queueData.waiting[0] ? 'Siap Dipanggil' : 'Belum Ada Antrean';
  const waitingList = queueData.waiting.slice(queueData.in_consultation[0] ? 0 : 1, queueData.in_consultation[0] ? 6 : 7);
  const recentDone = queueData.done.slice(0, 4);

  return (
    <div
      className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(252,234,201,0.9),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(198,238,229,0.85),_transparent_30%),linear-gradient(180deg,_#fffdf8_0%,_#f3efe5_100%)] text-slate-900"
    >
      <div className="mx-auto flex h-full max-w-[1800px] flex-col gap-3 overflow-hidden px-5 py-3">
        <header className="border border-slate-300/70 bg-white/70 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Display Antrian</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{displayTitle}</h1>
              <p className="mt-1 text-base text-slate-600">{dateLabel || '-'}</p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 xl:max-w-[520px]">
              <div className="flex h-10 shrink-0 items-center gap-2 border border-slate-300/70 bg-white/70 px-3 text-sm text-slate-600">
                <Clock3 className="h-4 w-4" />
                {clockLabel || '--:--:--'}
              </div>
              <Button type="button" variant="outline" className="h-10 rounded-none border-slate-300 bg-white/70 px-4 shadow-none" onClick={() => void fetchQueue()}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Muat Ulang
              </Button>
              <Button type="button" className="h-10 rounded-none px-4 shadow-none" onClick={() => void toggleFullscreen()}>
                {fullscreen ? <Minimize className="mr-2 h-4 w-4" /> : <Expand className="mr-2 h-4 w-4" />}
                {fullscreen ? 'Keluar Fullscreen' : 'Masuk Fullscreen'}
              </Button>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center border border-slate-300/70 bg-white/70">
            <Loader2 className="h-10 w-10 animate-spin text-slate-700" />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)]">
            <section className="flex min-h-0 flex-col overflow-hidden border border-slate-300/70 bg-white/72 px-6 py-5 backdrop-blur">
              {hasCurrentCall ? (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{currentLabel}</p>
                    <h2 className="mt-2 text-[clamp(4.5rem,10vw,8rem)] font-black leading-none tracking-tight text-slate-900">
                      {String(currentCall.queue_number).padStart(3, '0')}
                    </h2>
                    {isAllPoli ? (
                      <p className="mt-2 text-sm font-medium text-slate-600">{currentCall.polyclinic?.name || 'Poliklinik tidak diketahui'}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isAllPoli && currentCall.polyclinic?.name ? (
                      <Badge variant="outline" className="rounded-none border-slate-300 bg-white/70 px-3 py-1 text-sm text-slate-700 shadow-none">
                        {currentCall.polyclinic.name}
                      </Badge>
                    ) : null}
                    {currentCall.priority === 'urgent' ? (
                      <Badge variant="outline" className="rounded-none border-orange-300 bg-orange-100 px-3 py-1 text-sm text-orange-700 shadow-none">
                        Prioritas Urgent
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 border border-dashed border-slate-300/80 bg-white/60 px-5 py-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{currentLabel}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Belum ada nomor aktif</p>
                    <p className="mt-1 text-sm text-slate-600">Antrean akan muncul otomatis setelah pasien terdaftar{isAllPoli ? ' di salah satu poliklinik.' : ' untuk poliklinik ini.'}</p>
                  </div>
                  <Badge variant="outline" className="rounded-none border-slate-300 bg-white/70 px-3 py-1 text-sm text-slate-700 shadow-none">
                    Menunggu pendaftaran
                  </Badge>
                </div>
              )}

              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="border border-slate-300/70 bg-white/75 px-5 py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pasien</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{currentCall?.patient?.full_name || 'Menunggu panggilan pertama'}</p>
                  <div className="mt-4 grid gap-3 text-base text-slate-600 md:grid-cols-2">
                    <p>No. RM: {currentCall?.patient?.medical_record_number || '-'}</p>
                    <p>Dokter: {currentCall?.doctor?.full_name || 'Belum ditentukan'}</p>
                    <p>Pembayaran: {currentCall ? (PAYMENT_LABEL[currentCall.payment_type] || currentCall.payment_type) : '-'}</p>
                    <p>Poli: {currentCall?.polyclinic?.name || currentPolyclinic?.name || '-'}</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="border border-slate-300/70 bg-white/75 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Menunggu</p>
                    <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{queueData.waiting.length}</p>
                  </div>
                  <div className="border border-slate-300/70 bg-white/75 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sedang Dilayani</p>
                    <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{queueData.in_consultation.length}</p>
                  </div>
                  <div className="border border-slate-300/70 bg-white/75 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selesai</p>
                    <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{queueData.done.length}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex min-h-0 flex-1 flex-col border border-slate-300/70 bg-white/75 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Antrian Berikutnya</p>
                    <p className="mt-1 text-sm text-slate-600">{isAllPoli ? 'Antrean berikut dari seluruh poliklinik yang aktif hari ini.' : 'Nomor yang akan tampil setelah panggilan aktif selesai.'}</p>
                  </div>
                  <Badge variant="outline" className="rounded-none border-slate-300 bg-white/70 text-slate-700 shadow-none">
                    Auto refresh 15 detik
                  </Badge>
                </div>
                <div className="mt-4 grid min-h-0 flex-1 auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {waitingList.length === 0 ? (
                    <div className="col-span-full flex min-h-[120px] items-center justify-center border border-dashed border-slate-300/80 bg-white/60 px-4 text-center text-sm text-slate-500">
                      Tidak ada antrean tambahan untuk poliklinik ini.
                    </div>
                  ) : waitingList.map((visit, index) => (
                    <WaitingTicket key={visit.id} visit={visit} order={index + 1} />
                  ))}
                </div>
              </div>
            </section>

            <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-300/70 bg-white/72 px-5 py-5 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ringkasan Lajur</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="border border-slate-300/70 bg-white/75 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">Menunggu</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{queueData.waiting.length > 0 ? `${queueData.waiting.length} pasien siap dipanggil.` : 'Belum ada pasien yang menunggu.'}</p>
                  </div>
                  <div className="border border-slate-300/70 bg-white/75 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">Sedang Dilayani</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{queueData.in_consultation.length > 0 ? `${queueData.in_consultation.length} pasien sedang diproses.` : 'Belum ada pasien di ruang konsultasi.'}</p>
                  </div>
                </div>

                <div className="mt-5 min-h-0 flex-1 border border-slate-300/70 bg-white/75 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Baru Selesai</p>
                  <div className="mt-4 space-y-3">
                    {recentDone.length === 0 ? (
                      <div className="flex h-full min-h-[120px] items-center justify-center border border-dashed border-slate-300/80 bg-white/60 px-4 text-center text-sm text-slate-500">
                        Belum ada pasien selesai pada sesi ini.
                      </div>
                    ) : recentDone.map((visit) => (
                      <div key={visit.id} className="flex items-center justify-between gap-3 border border-slate-300/70 bg-white/70 px-4 py-3">
                        <div>
                          <p className="text-lg font-semibold tracking-tight text-slate-900">{String(visit.queue_number).padStart(3, '0')}</p>
                          <p className="text-sm text-slate-600">{visit.patient?.full_name || '-'}</p>
                        </div>
                        <div className="text-right text-sm text-slate-500">
                          <p>{visit.polyclinic?.name || '-'}</p>
                          <p>{visit.doctor?.full_name || '-'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border border-slate-300/70 bg-white/72 px-5 py-4 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Informasi Display</p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <p>Display ini diperbarui otomatis setiap 15 detik dan tetap bisa dimuat ulang manual jika operator membutuhkan sinkronisasi cepat.</p>
                  <p>Gunakan tombol fullscreen agar tampilan memenuhi monitor ruang tunggu tanpa sidebar dan tanpa header aplikasi.</p>
                  <p>Untuk pengalaman panggilan paling jelas, tampilkan halaman ini pada TV atau monitor khusus loket dengan satu poliklinik per layar.</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}