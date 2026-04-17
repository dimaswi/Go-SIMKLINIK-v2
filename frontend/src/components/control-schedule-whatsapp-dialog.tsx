import { useEffect, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  buildControlScheduleWhatsAppMessage,
  type ControlScheduleWhatsAppPayload,
  normalizeWhatsAppNumber,
  openWhatsAppUrl,
} from '@/lib/control-schedule-whatsapp';

type ControlScheduleWhatsAppDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: ControlScheduleWhatsAppPayload | null;
};

export function ControlScheduleWhatsAppDialog({ open, onOpenChange, payload }: ControlScheduleWhatsAppDialogProps) {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || !payload) {
      return;
    }

    setPhoneNumber(payload.patientPhone || '');
    setMessage(buildControlScheduleWhatsAppMessage(payload));
  }, [open, payload]);

  const handleOpenWhatsApp = () => {
    const normalizedPhone = normalizeWhatsAppNumber(phoneNumber);
    if (!normalizedPhone) {
      toast({
        variant: 'destructive',
        title: 'Nomor WhatsApp belum valid',
        description: 'Isi atau perbaiki nomor WhatsApp pasien terlebih dahulu.',
      });
      return;
    }

    if (!message.trim()) {
      toast({
        variant: 'destructive',
        title: 'Pesan WhatsApp masih kosong',
        description: 'Isi pesan pengingat kontrol sebelum membuka WhatsApp.',
      });
      return;
    }

    const opened = openWhatsAppUrl(normalizedPhone, message.trim());
    if (!opened) {
      toast({
        variant: 'destructive',
        title: 'WhatsApp tidak dapat dibuka',
        description: 'Periksa kembali nomor tujuan WhatsApp.',
      });
      return;
    }

    toast({
      variant: 'success',
      title: 'WhatsApp dibuka',
      description: 'Pesan kontrol siap dikirim manual oleh user.',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-none border border-border/70 p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <MessageCircle className="h-4 w-4" />
            Kirim WhatsApp Kontrol
          </DialogTitle>
          <DialogDescription>
            Nomor pasien dan kalimat kontrol diisi otomatis dari data kunjungan, tetapi tetap bisa diedit sebelum diarahkan ke WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="control-whatsapp-phone">Nomor WhatsApp</Label>
            <Input
              id="control-whatsapp-phone"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="08xxxxxxxxxx"
              className="rounded-none"
            />
            <p className="text-xs text-muted-foreground">Nomor akan dinormalisasi otomatis ke format WhatsApp saat tombol kirim ditekan.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="control-whatsapp-message">Kalimat Kontrol</Label>
            <Textarea
              id="control-whatsapp-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tulis pesan pengingat kontrol..."
              className="min-h-[220px] rounded-none"
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" className="gap-1.5 rounded-none" onClick={handleOpenWhatsApp}>
            <Send className="h-4 w-4" />
            Buka WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}