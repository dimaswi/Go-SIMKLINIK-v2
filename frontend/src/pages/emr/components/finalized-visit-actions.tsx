import { useState } from 'react';
import { Loader2, Printer, RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FinalizedVisitActionsProps = {
  onPrintMedicalResume: () => Promise<void>;
  printingMedicalResume: boolean;
  onCancelFinalization: () => Promise<void>;
  cancelingFinalization: boolean;
  buttonClassName?: string;
};

export function FinalizedVisitActions({
  onPrintMedicalResume,
  printingMedicalResume,
  onCancelFinalization,
  cancelingFinalization,
  buttonClassName,
}: FinalizedVisitActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          className={cn('gap-1.5', buttonClassName)}
          variant="outline"
          onClick={() => void onPrintMedicalResume()}
          disabled={printingMedicalResume || cancelingFinalization}
          title='Cetak Resume Medis'
        >
          {printingMedicalResume ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        </Button>
        <Button
          className={cn('gap-1.5', buttonClassName)}
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={cancelingFinalization || printingMedicalResume}
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
    </>
  );
}