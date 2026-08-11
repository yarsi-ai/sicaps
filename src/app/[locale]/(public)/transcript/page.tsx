import { Suspense } from 'react';
import TranscriptScreen from './_components/TranscriptScreen';

export default function TranskripPage() {
  return (
    <Suspense fallback={null}>
      <TranscriptScreen />
    </Suspense>
  );
}
