import type { CSSProperties } from 'react';

interface SparkleDecorationProps {
  top?: number | string;
  bottom?: number | string;
  left?: number | string;
  right?: number | string;
  size?: number;
  color?: string;
  delay?: number;
}

/** A single animated ✦ sparkle, absolutely positioned relative to its parent. */
export default function SparkleDecoration({
  top,
  bottom,
  left,
  right,
  size = 14,
  color = 'var(--color-accent-amber)',
  delay = 0,
}: SparkleDecorationProps) {
  const style: CSSProperties = {
    top,
    bottom,
    left,
    right,
    fontSize: size,
    color,
    animationDelay: `${delay}s`,
  };
  return (
    <span aria-hidden="true" className="animate-sc-twinkle absolute leading-none" style={style}>
      ✦
    </span>
  );
}
