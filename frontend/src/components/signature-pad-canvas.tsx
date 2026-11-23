import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Eraser, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SignaturePadCanvasProps = {
  initialSignature?: string;
  disabled?: boolean;
  height?: number;
  fillHeight?: boolean;
  placeholder?: string;
  onSave?: (dataUrl: string) => void;
  onChange?: (dataUrl: string) => void;
  saveLabel?: string;
  saving?: boolean;
  className?: string;
};

export function SignaturePadCanvas({
  initialSignature,
  disabled = false,
  height = 240,
  fillHeight = false,
  placeholder = 'Goreskan tanda tangan di sini...',
  onSave,
  onChange,
  saveLabel = 'Simpan Tanda Tangan',
  saving = false,
  className,
}: SignaturePadCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const sizeRef = useRef<{ width: number; height: number; dpr: number }>({
    width: 0,
    height: 0,
    dpr: 1,
  });
  const historyRef = useRef<string[]>([]);
  const [hasStrokes, setHasStrokes] = useState(Boolean(initialSignature));
  const [historyLen, setHistoryLen] = useState(initialSignature ? 1 : 0);

  const drawDataUrlToCanvas = useCallback((ctx: CanvasRenderingContext2D, dataUrl: string, w: number, h: number) => {
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, w, h);
      const ratio = Math.min(w / img.width, h / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const offsetX = (w - drawW) / 2;
      const offsetY = (h - drawH) / 2;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    };
    img.src = dataUrl;
  }, []);

  const syncCanvasDimensions = useCallback(
    (restoreDataUrl?: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.round(rect.width);
      const cssHeight = Math.round(rect.height || height);
      if (cssWidth <= 0 || cssHeight <= 0) return;

      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      const current = sizeRef.current;

      const snapshotToRestore =
        restoreDataUrl !== undefined
          ? restoreDataUrl
          : historyRef.current[historyRef.current.length - 1] || initialSignature || '';

      if (current.width !== cssWidth || current.height !== cssHeight || current.dpr !== dpr) {
        sizeRef.current = { width: cssWidth, height: cssHeight, dpr };
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.6;
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      if (snapshotToRestore) {
        drawDataUrlToCanvas(ctx, snapshotToRestore, cssWidth, cssHeight);
      }
    },
    [drawDataUrlToCanvas, height, initialSignature]
  );

  useEffect(() => {
    historyRef.current = initialSignature ? [initialSignature] : [];
    setHasStrokes(Boolean(initialSignature));
    setHistoryLen(historyRef.current.length);
    syncCanvasDimensions(initialSignature || '');
  }, [initialSignature, syncCanvasDimensions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    syncCanvasDimensions();

    const observer = new ResizeObserver(() => {
      if (!isDrawingRef.current) {
        syncCanvasDimensions();
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [syncCanvasDimensions]);

  const getPointerPos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { width, height: logicalH } = sizeRef.current;
    const scaleX = rect.width > 0 && width > 0 ? width / rect.width : 1;
    const scaleY = rect.height > 0 && logicalH > 0 ? logicalH / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const exportDataUrl = (): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    return canvas.toDataURL('image/png');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.round(rect.width);
    const cssHeight = Math.round(rect.height);
    if (
      cssWidth > 0 &&
      cssHeight > 0 &&
      (sizeRef.current.width !== cssWidth || sizeRef.current.height !== cssHeight)
    ) {
      syncCanvasDimensions();
    }

    canvas.setPointerCapture(event.pointerId);

    const pos = getPointerPos(event);
    isDrawingRef.current = true;
    lastPointRef.current = pos;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const dpr = sizeRef.current.dpr || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();
    }
    setHasStrokes(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !isDrawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = sizeRef.current.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const currentPos = getPointerPos(event);
    const lastPos = lastPointRef.current || currentPos;
    const midX = (lastPos.x + currentPos.x) / 2;
    const midY = (lastPos.y + currentPos.y) / 2;

    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.quadraticCurveTo(lastPos.x, lastPos.y, midX, midY);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastPointRef.current = currentPos;
  };

  const finishStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    const dataUrl = exportDataUrl();
    if (dataUrl) {
      historyRef.current = [...historyRef.current.slice(-14), dataUrl];
      setHistoryLen(historyRef.current.length);
      onChange?.(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height: logicalH, dpr } = sizeRef.current;
    ctx.setTransform(dpr || 1, 0, 0, dpr || 1, 0, 0);
    ctx.clearRect(0, 0, width || canvas.width, logicalH || canvas.height);
    historyRef.current = [];
    setHistoryLen(0);
    setHasStrokes(false);
    onChange?.('');
  };

  const handleUndo = () => {
    if (historyRef.current.length <= 1) {
      handleClear();
      return;
    }
    const nextHistory = historyRef.current.slice(0, -1);
    const previousDataUrl = nextHistory[nextHistory.length - 1];
    historyRef.current = nextHistory;
    setHistoryLen(nextHistory.length);
    syncCanvasDimensions(previousDataUrl);
    onChange?.(previousDataUrl);
  };

  const handleSaveClick = () => {
    if (!hasStrokes) return;
    const dataUrl = exportDataUrl();
    if (dataUrl) {
      onSave?.(dataUrl);
    }
  };

  return (
    <div className={cn('flex flex-col gap-2.5', fillHeight && 'min-h-0 flex-1', className)}>
      <div
        className={cn(
          'relative overflow-hidden border-2 border-slate-400 bg-white',
          fillHeight && 'min-h-[240px] flex-1'
        )}
      >
        <canvas
          ref={canvasRef}
          style={fillHeight ? undefined : { height: `${height}px` }}
          className={cn(
            'block w-full touch-none select-none bg-white',
            fillHeight && 'h-full min-h-[240px]',
            disabled ? 'cursor-not-allowed opacity-70' : 'cursor-crosshair'
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
        {!hasStrokes && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-medium text-slate-400">
            {placeholder}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-slate-300" />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-none"
            onClick={handleUndo}
            disabled={disabled || !hasStrokes || historyLen === 0 || saving}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-none"
            onClick={handleClear}
            disabled={disabled || !hasStrokes || saving}
          >
            <Eraser className="h-3.5 w-3.5" />
            Ulangi / Bersihkan
          </Button>
        </div>

        {onSave && (
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5 rounded-none px-4"
            onClick={handleSaveClick}
            disabled={disabled || !hasStrokes || saving}
          >
            <Check className="h-4 w-4" />
            {saving ? 'Menyimpan...' : saveLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
