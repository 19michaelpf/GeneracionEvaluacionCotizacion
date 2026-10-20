import Link from 'next/link';
import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Cliente } from '@/lib/types';

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const perfil = await requerirPerfil();
  const { q = '' } = await searchParams;
  const puedeEditar = ROLES_COTIZAN.includes(perfil.rol);

  const supabase = await createClient();
  let consulta = supabase.from('clientes').select('*').order('razon_social').limit(100);
  const termino = q.trim().replace(/[%,()]/g, '');
  if (termino) consulta = consulta.or(`razon_social.ilike.%${termino}%,ruc.ilike.%${termino}%`);
  const { data: clientes, error } = await consulta.overrideTypes<Cliente[], { merge: false }>();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <form className="ml-auto flex gap-2">
          <input className="input w-64" name="q" defaultValue={q} placeholder="Buscar por RUC o razón social" />
          <button className="btn">Buscar</button>
        </form>
        {puedeEditar && <Link href="/clientes/nuevo" className="btn btn-primary">Nuevo cliente</Link>}
      </div>
      {error && <p className="text-sm text-rose-600">No se pudo cargar la lista de clientes.</p>}
      <div className="card overflow-x-auto p-0">
        <table className="tabla">
          <thead>
            <tr><th>RUC</th><th>Razón social</th><th>Contacto</th><th>Correo</th><th>Teléfono</th><th /></tr>
          </thead>
          <tbody>
            {clientes?.map((c) => (
              <tr key={c.id}>
                <td className="font-mono">{c.ruc}</td>
                <td>{c.razon_social}</td>
                <td>{c.contacto}</td>
                <td>{c.email}</td>
                <td>{c.telefono}</td>
                <td className="text-right">
                  {puedeEditar && <Link href={`/clientes/${c.id}`} className="text-blue-700 hover:underline">Editar</Link>}
                </td>
              </tr>
            ))}
            {clientes?.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-500">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
