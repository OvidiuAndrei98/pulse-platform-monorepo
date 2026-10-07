/** Keep the original expanding ping and its solid center in a bounded box. */
export function LiveIndicator({ className = "h-2 w-2", colorClassName = "bg-red-500" }: { className?: string; colorClassName?: string }) {
  return (
    <span aria-hidden="true" className={`spottr-live-dot relative inline-flex shrink-0 ${className}`}>
      <span className={`absolute inset-0 animate-ping rounded-full opacity-75 motion-reduce:animate-none motion-reduce:hidden ${colorClassName}`} />
      <span className={`relative h-full w-full rounded-full ${colorClassName}`} />
    </span>
  );
}
