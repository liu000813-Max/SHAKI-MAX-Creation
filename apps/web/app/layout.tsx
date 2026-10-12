import type { Metadata } from 'next';
import './globals.css';
import { ClientProvider } from '@/components/ClientProvider';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'SHAKI AI Product Match',
  description: 'AI Client Intelligence & Product Matching Platform for SHAKI International Sales Team',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-surface text-ink">
        <AuthProvider>
          <ClientProvider>{children}</ClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
