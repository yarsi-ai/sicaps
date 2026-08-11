import { Suspense } from 'react';
import { PinEntryForm } from './_components/PinEntryForm';

/**
 * PIN Entry Page for Console Access
 *
 * `useSearchParams()` inside PinEntryForm requires a Suspense boundary for
 * static prerendering (Next.js opts the subtree into client-side rendering
 * until the boundary resolves).
 *
 * **Validates: Requirements 1.1, 3.2, 4.2, 6.1, 6.3, 6.4**
 */
export default function ConsolePinEntryPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <PinEntryForm />
    </Suspense>
  );
}
