import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Generación de PDF en el servidor: se carga desde node_modules en vez de empaquetarse
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default nextConfig;
