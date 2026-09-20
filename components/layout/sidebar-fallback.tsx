export function SidebarFallback() {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex w-14 flex-col bg-forest text-white md:w-56"
      aria-hidden="true"
    >
      <div className="h-14 border-b border-white/10" />
      <div className="flex-1 space-y-1 px-2 py-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="h-9 rounded-md bg-white/10" />
        ))}
      </div>
    </aside>
  );
}
