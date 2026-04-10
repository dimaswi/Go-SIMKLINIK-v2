export function PharmacyStatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper: React.ReactNode;
}) {
  return (
    <div className="border border-border/70 bg-background px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-2 text-lg font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</div>
    </div>
  );
}