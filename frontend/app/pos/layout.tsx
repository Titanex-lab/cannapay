export default function POSLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-900 text-white">
      {children}
    </div>
  );
}
