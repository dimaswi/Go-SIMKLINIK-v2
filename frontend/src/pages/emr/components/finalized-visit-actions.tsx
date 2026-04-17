import { useState } from 'react';
import { Loader2, MessageCircle, Printer, RotateCcw } from 'lucide-react';
import { ControlScheduleWhatsAppDialog } from '@/components/control-schedule-whatsapp-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { TTERequestSheet } from '@/components/tte-request-sheet';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import type { ControlScheduleWhatsAppPayload } from '@/lib/control-schedule-whatsapp';
import { cn } from '@/lib/utils';

type FinalizedVisitActionsProps = {
  visitId?: number;
  showControlLetter?: boolean;
  controlWhatsAppPayload?: ControlScheduleWhatsAppPayload | null;
  onPrintControlLetter?: () => Promise<void>;
  printingControlLetter?: boolean;
  onPrintMedicalResume: () => Promise<void>;
  printingMedicalResume: boolean;
  onCancelFinalization: () => Promise<void>;
  cancelingFinalization: boolean;
  buttonClassName?: string;
};

export function FinalizedVisitActions({
  visitId,
  showControlLetter,
  controlWhatsAppPayload,
  onPrintControlLetter,
  printingControlLetter = false,
  onPrintMedicalResume,
  printingMedicalResume,
  onCancelFinalization,
  cancelingFinalization,
  buttonClassName,
}: FinalizedVisitActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const { hasPermission } = usePermission();
  const canRequestTTE = hasPermission('document_signatures.request');

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {visitId ? <TTERequestSheet visitId={visitId} buttonClassName={buttonClassName} /> : null}
        {showControlLetter && controlWhatsAppPayload ? (
          <Button
            className={cn('gap-1.5', buttonClassName)}
            variant="outline"
            onClick={() => setWhatsAppOpen(true)}
            disabled={printingControlLetter || printingMedicalResume || cancelingFinalization}
            title='Kirim WhatsApp Kontrol'
          >
            <MessageCircle className="h-4 w-4" />
          </Button>
        ) : null}
        {!canRequestTTE && visitId && showControlLetter && onPrintControlLetter ? (
          <Button
            className={cn('gap-1.5', buttonClassName)}
            variant="outline"
            onClick={() => void onPrintControlLetter()}
            disabled={printingControlLetter || printingMedicalResume || cancelingFinalization}
            title='Cetak Surat Kontrol'
          >
            {printingControlLetter ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          </Button>
        ) : null}
        <Button
          className={cn('gap-1.5', buttonClassName)}
          variant="outline"
          onClick={() => void onPrintMedicalResume()}
          disabled={printingMedicalResume || printingControlLetter || cancelingFinalization}
          title='Cetak Resume Medis'
        >
          {printingMedicalResume ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        </Button>
        <Button
          className={cn('gap-1.5', buttonClassName)}
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={cancelingFinalization || printingMedicalResume || printingControlLetter}
          title='Batalkan finalisasi kunjungan'
        >
          {cancelingFinalization ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          setConfirmOpen(false);
          void onCancelFinalization();
        }}
        title="Batalkan finalisasi kunjungan?"
        description="Kunjungan akan dibuka kembali untuk diedit. Sistem juga akan menyimpan log petugas yang membatalkan finalisasi ini."
        confirmText="Ya, batal final"
        cancelText="Tidak"
        variant="destructive"
      />

      <ControlScheduleWhatsAppDialog
        open={whatsAppOpen}
        onOpenChange={setWhatsAppOpen}
        payload={controlWhatsAppPayload || null}
      />
    </>
  );
}