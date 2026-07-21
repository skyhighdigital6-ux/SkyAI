import { Inter } from 'next/font/google';
import './globals.css';
import AuthShell from '../components/AuthShell';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = { title: 'SkyAI — WhatsApp CRM' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes into <body> before React hydrates */}
      <body className={inter.className} suppressHydrationWarning>
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  );
}
