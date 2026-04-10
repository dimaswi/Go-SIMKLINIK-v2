import type { ReactNode } from 'react';

type ResumeSheetViewProps = {
  editor: ReactNode;
};

export function ResumeSheetView({ editor }: ResumeSheetViewProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="px-0.5">
          <h3 className="text-[13px] font-semibold tracking-tight">Outcome dan Finalisasi Resume</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Isi kondisi pulang, disposisi, dan rujukan pada bagian ini. Ringkasan klinis tetap diambil dari pengkajian awal, assessment, resep, dan tindakan yang sudah tercatat.</p>
        </div>
        {editor}
      </div>
    </div>
  );
}