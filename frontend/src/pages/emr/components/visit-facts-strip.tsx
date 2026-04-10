type VisitFactsStripProps = {
  allergies: string;
  diagnoses: string[];
  prescriptionCount: number;
  actionCount: number;
};

export function VisitFactsStrip({
  allergies,
  diagnoses,
  prescriptionCount,
  actionCount,
}: VisitFactsStripProps) {
  const items = [
    {
      label: 'Alergi',
      value: allergies || 'Tidak tercatat',
    },
    {
      label: 'Diagnosis Aktif',
      value: diagnoses.length > 0 ? diagnoses.join(', ') : 'Belum ada assessment',
    },
    {
      label: 'Item Resep',
      value: `${prescriptionCount} item`,
    },
    {
      label: 'Tindakan',
      value: `${actionCount} tindakan`,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border/80 bg-background px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="mt-2 text-sm font-medium leading-6">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
