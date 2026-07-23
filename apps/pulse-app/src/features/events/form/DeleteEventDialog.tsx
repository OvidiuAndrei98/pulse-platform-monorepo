import { AlertTriangle } from "lucide-react";

export function DeleteEventDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
        <div className="flex items-center gap-3 text-red-400"><div className="rounded-full bg-red-500/10 p-2.5"><AlertTriangle className="h-6 w-6" /></div><h3 className="text-lg font-semibold text-white">Stergi evenimentul?</h3></div>
        <p className="text-xs leading-relaxed text-muted-foreground">Aceasta actiune este ireversibila si va elimina toate datele si biletele asociate.</p>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-full border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10">Anuleaza</button>
          <button type="button" onClick={onConfirm} className="flex-1 rounded-full bg-red-600 py-2.5 text-xs font-semibold text-white transition hover:bg-red-700">Da, sterge</button>
        </div>
      </div>
    </div>
  );
}
