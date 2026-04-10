import type { Metadata } from 'next';
import Sidebar from '@/components/layout/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'TaxiRide — Invoice System',
  description: 'Charge Call & Invoice System for 17116039 Canada Inc',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Sidebar />
        <div className="pl-60 min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
