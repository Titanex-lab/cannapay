'use client';

export function DrawerIndicator() {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600
                 text-sm text-slate-300"
      title="Cash drawer status"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      <span>Drawer Open</span>
    </div>
  );
}
