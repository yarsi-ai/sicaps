interface RevisionBannerProps {
  revision: number;
  onDismiss: () => void;
}

/**
 * Dismissible banner shown when a screening result is revised (score updated
 * during follow-up). Requirement 14.3: show "penilaian diperbarui" when
 * resultRevision increases.
 */
export default function RevisionBanner({ revision, onDismiss }: RevisionBannerProps) {
  return (
    <div
      className="relative z-10 mx-4 mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
      role="alert"
    >
      <span>Penilaian telah diperbarui (revisi {revision})</span>
      <button
        onClick={onDismiss}
        className="ml-2 cursor-pointer border-none bg-transparent text-amber-600 hover:text-amber-800"
        aria-label="Tutup notifikasi"
      >
        &times;
      </button>
    </div>
  );
}
