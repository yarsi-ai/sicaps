import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-console',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SICAPS Console',
  description: 'Internal developer console',
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${mono.variable} flex h-screen flex-col overflow-hidden bg-[#e9e6df] font-[family-name:var(--font-console)]`}
    >
      {children}
    </div>
  );
}
