'use client';

import { useRouter } from '@/i18n/navigation';
import IconButton from './IconButton';

interface BackButtonProps {
  label?: string;
  onClick?: () => void;
}

/**
 * Consistent back button — 38×38 fixed size, no extra padding.
 * Uses router.back() by default, or custom onClick if provided.
 */
export default function BackButton({ label = 'Kembali', onClick }: BackButtonProps) {
  const router = useRouter();

  return (
    <IconButton onClick={onClick ?? (() => router.back())} aria-label={label}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </IconButton>
  );
}
