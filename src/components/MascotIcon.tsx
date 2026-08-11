/**
 * Theme-aware mascot icon.
 * Renders the correct mascot SVG based on NEXT_PUBLIC_THEME.
 * To add a new mascot: add a case to the switch and create the SVG component below.
 */

const THEME = process.env.NEXT_PUBLIC_THEME ?? 'earthy';

export interface MascotIconProps {
  /** Width/height in pixels (square) */
  size?: number;
  className?: string;
}

export function MascotIcon({ size = 48, className }: MascotIconProps): React.ReactElement {
  switch (THEME) {
    case 'purple':
      return <PurpleCapi size={size} className={className} />;
    case 'earthy':
    default:
      return <EarthyCapi size={size} className={className} />;
  }
}

/** Earthy theme mascot — owl/frog Capi with moss green body */
function EarthyCapi({ size, className }: MascotIconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Capi mascot"
      role="img"
    >
      {/* Body */}
      <ellipse cx="60" cy="68" rx="36" ry="38" fill="#7A9455" />
      {/* Eyes */}
      <circle cx="45" cy="58" r="12" fill="#FFFBF0" />
      <circle cx="75" cy="58" r="12" fill="#FFFBF0" />
      <circle cx="47" cy="60" r="5" fill="#3A2D1F" />
      <circle cx="77" cy="60" r="5" fill="#3A2D1F" />
      {/* Cheeks */}
      <ellipse cx="38" cy="72" rx="7" ry="5" fill="#E58A73" opacity="0.6" />
      <ellipse cx="82" cy="72" rx="7" ry="5" fill="#E58A73" opacity="0.6" />
      {/* Antennae */}
      <line
        x1="50"
        y1="32"
        x2="45"
        y2="18"
        stroke="#3A2D1F"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="70"
        y1="32"
        x2="75"
        y2="18"
        stroke="#3A2D1F"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="45" cy="16" r="5" fill="#E0A94F" />
      <circle cx="75" cy="16" r="5" fill="#E0A94F" />
    </svg>
  );
}

/** Purple theme mascot — rounded face Capi with lavender palette */
function PurpleCapi({ size, className }: MascotIconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Capi mascot"
      role="img"
    >
      {/* Body */}
      <circle cx="60" cy="64" r="38" fill="#8A6DFF" />
      {/* Eyes */}
      <circle cx="45" cy="58" r="12" fill="#FFFFFF" />
      <circle cx="75" cy="58" r="12" fill="#FFFFFF" />
      <circle cx="47" cy="60" r="5" fill="#211A3B" />
      <circle cx="77" cy="60" r="5" fill="#211A3B" />
      {/* Cheeks */}
      <ellipse cx="38" cy="72" rx="7" ry="5" fill="#FF6BAE" opacity="0.5" />
      <ellipse cx="82" cy="72" rx="7" ry="5" fill="#FF6BAE" opacity="0.5" />
      {/* Smile */}
      <path
        d="M50 78 Q60 86 70 78"
        stroke="#211A3B"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
