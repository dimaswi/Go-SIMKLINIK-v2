import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { polyclinicsApi, queueApi, visitsApi, medicalRecordsApi, type Polyclinic, type Visit } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, ChevronRight, AlertTriangle, FileText } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

const PAYMENT_LABEL: Record<string, string> = { umum: 'Umum', bpjs: 'BPJS', asuransi: 'Asuransi' };

function QueueCard({ visit, onDone, onCancel, onStartEMR, showActions }: {
  visit: Visit;
  onDone?: () => void;
  onCancel?: () => void;
  onStartEMR?: () => void;
  showActions?: boolean;
}) {
  const patient = (visit as any).patient;
  return (
    <div className={`rounded-lg border p-4 space-y-2.5 ${visit.priority === 'urgent' ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20' : 'border-border/80 bg-card'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`text-3xl font-black leading-none ${visit.priority === 'urgent' ? 'text-orange-500' : 'text-primary'}`}>
            {String(visit.queue_number).padStart(3, '0')}
          </div>
          {visit.priority === 'urgent' && (
            <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
          )}
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {PAYMENT_LABEL[visit.payment_type] || visit.payment_type}
        </Badge>
      </div>
      <div>
        <p className="text-sm font-semibold truncate">{patient?.full_name || '-'}</p>
        <p className="text-xs text-muted-foreground font-mono">{patient?.medical_record_number || '-'}</p>
      </div>
      {visit.complaint && (
        <p className="text-xs text-muted-foreground line-clamp-2">{visit.complaint}</p>
      )}
      {showActions && (
        <div className="flex flex-col gap-2 pt-1">
          {onStartEMR && (
            <Button size="sm" variant="default" className="w-full h-7 text-xs gap-1" onClick={onStartEMR}>
              <FileText className="h-3 w-3" /> Isi Rekam Medis
            </Button>
          )}
          <div className="flex gap-2">
            {onDone && (
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={onDone}>Selesai</Button>
            )}
            {onCancel && (
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-destructive hover:text-destructive" onClick={onCancel}>Batal</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Column({ title, color, count, children }: { title: string; color: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-0">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-0 ${color}`}>
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        <span className="text-xs font-bold bg-white/30 dark:bg-black/20 rounded-full px-1.5 py-0.5 min-w-[1.5rem] text-center">{count}</span>
      </div>
      <div className="flex-1 rounded-b-lg border border-t-0 border-border/80 p-2 space-y-2 min-h-24 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

type QueueData = {
  waiting: Visit[];
  in_consultation: Visit[];
  done: Visit[];
  cancelled: Visit[];
};

export default function QueueDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [selectedPoli, setSelectedPoli] = useState('');
  const [queueData, setQueueData] = useState<QueueData>({ waiting: [], in_consultation: [], done: [], cancelled: [] });
  const [loading, setLoading] = useState(false);
  const [callingNext, setCallingNext] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPageTitle('Dashboard Antrian');
    polyclinicsApi.getAll().then(r => {
      const list: Polyclinic[] = r.data.data || [];
      setPolyclinics(list);
      if (list.length > 0) setSelectedPoli(String(list[0].id));
    });
  }, []);

  const fetchQueue = useCallback(async () => {
    if (!selectedPoli) return;
    setLoading(true);
    try {
      const r = await queueApi.getByPolyclinic(Number(selectedPoli));
      setQueueData(r.data.data || { waiting: [], in_consultation: [], done: [], cancelled: [] });
    } catch {
      // silently fail on auto-refresh
    } finally {
      setLoading(false);
    }
  }, [selectedPoli]);

  useEffect(() => {
    fetchQueue();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchQueue, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchQueue]);

  const callNext = async () => {
    if (!selectedPoli) return;
    setCallingNext(true);
    try {
      const r = await queueApi.callNext(Number(selectedPoli));
      const v: Visit = r.data.data;
      const patient = (v as any).patient;
      toast({
        title: `Memanggil No. ${String(v.queue_number).padStart(3, '0')}`,
        description: patient?.full_name || 'Pasien berikutnya dipanggil.',
      });
      fetchQueue();
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Tidak ada pasien yang menunggu.';
      toast({ variant: 'destructive', title: 'Gagal memanggil', description: msg });
    } finally {
      setCallingNext(false);
    }
  };

  const updateStatus = async (visitId: number, update: { queue_status?: string; status?: string }) => {
    try {
      await visitsApi.updateStatus(visitId, update);
      fetchQueue();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal!', description: e.response?.data?.error || 'Gagal update status.' });
    }
  };

  const startEMR = async (visitId: number) => {
    try {
      // Try to get existing medical record for this visit
      const res = await medicalRecordsApi.getByVisit(visitId);
      navigate(`/emr/${res.data.data.id}`);
    } catch {
      // No existing record — create one
      try {
        const res = await medicalRecordsApi.create({ visit_id: visitId });
        navigate(`/emr/${res.data.data.id}`);
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal membuat rekam medis', description: e.response?.data?.error });
      }
    }
  };

  const poliOptions = polyclinics.map(p => ({ value: String(p.id), label: p.name }));
  const currentPoli = polyclinics.find(p => String(p.id) === selectedPoli);

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-end flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-56">
            <SearchableSelect
              options={poliOptions}
              value={selectedPoli}
              onValueChange={setSelectedPoli}
              placeholder="Pilih poliklinik..."
              searchPlaceholder="Cari poli..."
            />
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={fetchQueue} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={callNext} disabled={callingNext || !selectedPoli} className="gap-1.5 shrink-0">
            {callingNext ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            Panggil Berikutnya
          </Button>
        </div>
      </div>

      {/* Current poli info */}
      {currentPoli && (
        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium">{currentPoli.name}</span>
          <div className="flex gap-4 text-muted-foreground">
            <span>Menunggu: <span className="font-bold text-amber-600">{queueData.waiting.length}</span></span>
            <span>Konsultasi: <span className="font-bold text-blue-600">{queueData.in_consultation.length}</span></span>
            <span>Selesai: <span className="font-bold text-green-600">{queueData.done.length}</span></span>
          </div>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3 min-h-0">
        <Column title="Menunggu" color="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700" count={queueData.waiting.length}>
          {queueData.waiting.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Tidak ada antrian</p>
          ) : queueData.waiting.map(v => (
            <QueueCard key={v.id} visit={v} showActions={false} />
          ))}
        </Column>

        <Column title="Konsultasi" color="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-700" count={queueData.in_consultation.length}>
          {queueData.in_consultation.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Tidak ada konsultasi</p>
          ) : queueData.in_consultation.map(v => (
            <QueueCard key={v.id} visit={v} showActions
              onStartEMR={() => startEMR(v.id)}
              onDone={() => updateStatus(v.id, { queue_status: 'done', status: 'completed' })}
              onCancel={() => updateStatus(v.id, { queue_status: 'cancelled', status: 'cancelled' })}
            />
          ))}
        </Column>

        <Column title="Selesai" color="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-700" count={queueData.done.length}>
          {queueData.done.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Belum ada</p>
          ) : queueData.done.map(v => (
            <QueueCard key={v.id} visit={v} />
          ))}
        </Column>

        <Column title="Dibatalkan" color="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-700" count={queueData.cancelled.length}>
          {queueData.cancelled.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Belum ada</p>
          ) : queueData.cancelled.map(v => (
            <QueueCard key={v.id} visit={v} />
          ))}
        </Column>
      </div>
    </div>
  );
}
