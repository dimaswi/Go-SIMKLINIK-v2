import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

type SatusehatResultDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  payload: unknown;
  onOpenChange: (open: boolean) => void;
};

export function SatusehatResultDialog({
  open,
  title,
  description,
  payload,
  onOpenChange,
}: SatusehatResultDialogProps) {
  const formattedPayload = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload, null, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[860px] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-none border border-border/70 p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-4">
          <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
          {description ? <DialogDescription className="text-xs leading-5">{description}</DialogDescription> : null}
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 bg-muted/10">
          <pre className="min-h-full whitespace-pre-wrap break-words px-6 py-5 font-mono text-xs leading-6 text-foreground/95">
            {formattedPayload}
          </pre>
        </ScrollArea>

        <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
          <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}