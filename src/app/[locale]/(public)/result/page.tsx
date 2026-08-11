import { Suspense } from 'react';
import ResultScreen from './_components/ResultScreen';

export default function HasilPage() {
  return (
    <Suspense fallback={null}>
      <ResultScreen />
    </Suspense>
  );
}
