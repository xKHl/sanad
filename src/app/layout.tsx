import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/600.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import './globals.css';

export const metadata: Metadata = {
  authors: [{ name: 'Khalid Alotaibi', url: 'https://alotaibi.dev' }],
  creator: 'Khalid Alotaibi',
  title: 'Sanad: clinical decision support',
  description:
    'Decision-support prototype for a fictional outpatient clinic: case summary, missing information, next-step checklist and red-flag warnings, with every suggestion traced back to the case.',
};

export const viewport: Viewport = {
  themeColor: '#f4f2ec',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
