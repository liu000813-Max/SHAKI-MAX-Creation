import type { Metadata } from 'next';
import './globals.css';
import { ClientProvider } from '@/components/ClientProvider';
import Header from '@/components/Header';

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
      <body className="antialiased min-h-screen bg-[#FAFAF9]">
        <ClientProvider>
          <Header />
          <main className="min-h-[calc(100vh-64px)]">{children}</main>
        </ClientProvider>
      </body>
    </html>
  );
}
