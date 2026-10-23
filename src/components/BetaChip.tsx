// Marks a newer section whose data can lag (journey.ts `beta`; Chris,
// 23 Oct 2026: NFL and Tennis). Used by the top menu and the section hubs.
export default function BetaChip({ className = '' }: { className?: string }) {
  return (
    <span className={`ml-1 rounded px-1 py-px text-[9px] font-mono uppercase tracking-wider leading-none border border-current opacity-80 ${className}`}>
      Beta
    </span>
  );
}
