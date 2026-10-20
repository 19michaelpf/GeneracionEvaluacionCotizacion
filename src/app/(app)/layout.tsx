import Link from 'next/link';
import { requerirPerfil } from '@/lib/auth';
import { cerrarSesion } from '@/app/login/actions';

const ETIQUETA_ROL = { asesor: 'Asesor', finanzas: 'Finanzas', admin: 'Administrador' } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/cotizaciones" className="font-semibold text-blue-800">
            SIN · Cotizaciones
          </Link>
          <nav className="flex gap-4 text-sm text-slate-600">
            <Link href="/tablero" className="hover:text-slate-900">Tablero</Link>
            <Link href="/cotizaciones" className="hover:text-slate-900">Cotizaciones</Link>
            <Link href="/clientes" className="hover:text-slate-900">Clientes</Link>
            <Link href="/productos" className="hover:text-slate-900">Productos</Link>
            {(perfil.rol === 'finanzas' || perfil.rol === 'admin') && (
              <Link href="/aprobaciones" className="hover:text-slate-900">Aprobaciones</Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {perfil.nombre} · <span className="font-medium">{ETIQUETA_ROL[perfil.rol]}</span>
            </span>
            <form action={cerrarSesion}>
              <button className="btn">Salir</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
