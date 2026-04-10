import { cn } from '@/lib/utils';
import { PAIN_SCALE_TYPE_OPTIONS, getPainScaleValueOptions } from '../constants';

type PainScalePickerProps = {
  scaleType: string;
  value: number;
  onScaleTypeChange: (scaleType: string) => void;
  onValueChange: (value: number) => void;
  disabled: boolean;
};

const WONG_BAKER_FACES = ['😀', '🙂', '😐', '🙁', '😣', '😭'];

function getPainToneClass(currentValue: number, maxValue: number) {
  const ratio = maxValue <= 0 ? 0 : currentValue / maxValue;
  if (ratio <= 0.15) return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (ratio <= 0.35) return 'border-lime-300 bg-lime-50 text-lime-700';
  if (ratio <= 0.55) return 'border-amber-300 bg-amber-50 text-amber-700';
  if (ratio <= 0.75) return 'border-orange-300 bg-orange-50 text-orange-700';
  return 'border-rose-300 bg-rose-50 text-rose-700';
}

export function PainScalePicker({
  scaleType,
  value,
  onScaleTypeChange,
  onValueChange,
  disabled,
}: PainScalePickerProps) {
  const options = getPainScaleValueOptions(scaleType);
  const numericValues = options.map((option) => Number(option.value) || 0);
  const maxValue = Math.max(...numericValues, 10);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-5">
        {PAIN_SCALE_TYPE_OPTIONS.map((option) => {
          const isActive = option.value === scaleType;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onScaleTypeChange(option.value)}
              className={cn(
                'border border-border/70 px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                isActive ? 'border-foreground/30 bg-muted/30' : 'hover:bg-muted/20'
              )}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/80">{option.label.split(' ')[0]}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className={cn('grid gap-1.5', scaleType === 'wong-baker' ? 'grid-cols-3 lg:grid-cols-6' : 'grid-cols-3 lg:grid-cols-6 xl:grid-cols-11')}>
        {options.map((option, index) => {
          const optionValue = Number(option.value) || 0;
          const isActive = optionValue === value;

          return (
            <button
              key={`${scaleType}-${option.value}`}
              type="button"
              disabled={disabled}
              onClick={() => onValueChange(optionValue)}
              className={cn(
                'min-h-[68px] border px-2 py-2 text-center transition disabled:cursor-not-allowed disabled:opacity-60',
                getPainToneClass(optionValue, maxValue),
                isActive && 'ring-1 ring-foreground/50 ring-offset-0'
              )}
            >
              {scaleType === 'wong-baker' ? (
                <span className="block text-xl leading-none">{WONG_BAKER_FACES[index] || '😐'}</span>
              ) : (
                <span className="block text-sm font-semibold leading-none">{option.value}</span>
              )}
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.14em]">{option.value}</span>
              <span className="mt-1 line-clamp-2 block text-[10px] leading-3">{option.label.split(' - ')[1] || option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}