interface SkipLinkProps {
  label: string;
  targetId?: string;
}

export default function SkipLink({ label, targetId = 'main-content' }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:rounded-input focus:border-2 focus:border-border-strong focus:bg-surface-card focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-text-strong"
    >
      {label}
    </a>
  );
}
