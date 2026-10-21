import type { NextConfig } from 'next';

// pdfkit (usado por @react-pdf) carga las métricas de las fuentes estándar con
// require('#standard-fonts/…'); el trazador de archivos no sigue esos imports,
// así que en Vercel faltaban y la generación del PDF fallaba.
const ARCHIVOS_PDFKIT = ['./node_modules/pdfkit/js/standard-fonts/**/*', './node_modules/pdfkit/js/data/**/*'];

const nextConfig: NextConfig = {
  // Generación de PDF en el servidor: se carga desde node_modules en vez de empaquetarse
  serverExternalPackages: ['@react-pdf/renderer'],
  outputFileTracingIncludes: {
    '/cotizaciones/**': ARCHIVOS_PDFKIT,
  },
};

export default nextConfig;
