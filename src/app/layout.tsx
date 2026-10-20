import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cotizaciones · Soluciones Industriales del Norte',
  description: 'Generación y evaluación de cotizaciones comerciales',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
