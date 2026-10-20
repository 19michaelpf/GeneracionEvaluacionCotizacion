import Link from 'next/link';
import { requerirPerfil } from '@/lib/auth';
import { formatoFechaHora, formatoMoneda, formatoPct } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { Aprobacion } from '@/lib/types';

type Fila = Aprobacion & {
  cotizaciones: { id: string; numero: string; clientes: { razon_social: string } | null } | null;
  solicitante: { nombre: string } | null;
  resolutor: { nombre: string } | null;
};

const SELECT =
  '*, cotizaciones(id, numero, clientes(razon_social)), solicitante:profiles!aprobaciones_solicitado_por_fkey(nombre), resolutor:profiles!aprobaciones_resuelto_por_fkey(nombre)';

export default async function AprobacionesPage() {
  await requerirPerfil(['finanzas', 'admin']);

  const supabase = await createClient();
  const [{ data: pendientes, error }, { data: resueltas }] = await Promise.all([
    supabase.from('aprobaciones').select(SELECT).eq('estado', 'pendiente').order('solicitado_en')
      .overrideTypes<Fila[], { merge: false }>(),
    supabase.from('aprobaciones').select(SELECT).in('estado', ['aprobada', 'rechazada'])
      .order('resuelto_en', { ascending: false }).limit(20)
      .overrideTypes<Fila[], { merge: false }>(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Aprobaciones de descuento</h1>
      {error && <p className="text-sm text-rose-600">No se pudo cargar la bandeja.</p>}

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-semibold">Pendientes ({pendientes?.length ?? 0})</h2>
        <table className="tabla mt-2">
          <thead>
            <tr><th>Cotización</th><th>Cliente</th><th>Asesor</th><th>Solicitada</th><th className="text-right">Descuento</th><th className="text-right">Total</th><th /></tr>
          </thead>
          <tbody>
            {pendientes?.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{a.cotizaciones?.numero}</td>
                <td>{a.cotizaciones?.clientes?.razon_social}</td>
                <td>{a.solicitante?.nombre}</td>
                <td>
                  {formatoFechaHora(a.solicitado_en)}
                  {a.comentario && <div className="text-xs text-slate-500">“{a.comentario}”</div>}
                </td>
                <td className="text-right font-medium text-amber-700">{formatoPct(a.descuento_pct)}</td>
                <td className="text-right">{formatoMoneda(a.total)}</td>
                <td className="text-right">
                  <Link href={`/cotizaciones/${a.cotizacion_id}`} className="btn btn-primary">Revisar</Link>
                </td>
              </tr>
            ))}
            {pendientes?.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-500">No hay solicitudes pendientes</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-semibold">Resueltas recientemente</h2>
        <table className="tabla mt-2">
          <thead>
            <tr><th>Cotización</th><th>Cliente</th><th className="text-right">Descuento</th><th>Resultado</th><th>Resuelta</th></tr>
          </thead>
          <tbody>
            {resueltas?.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/cotizaciones/${a.cotizacion_id}`} className="text-blue-700 hover:underline">{a.cotizaciones?.numero}</Link></td>
                <td>{a.cotizaciones?.clientes?.razon_social}</td>
                <td className="text-right">{formatoPct(a.descuento_pct)}</td>
                <td className={a.estado === 'aprobada' ? 'text-emerald-700' : 'text-rose-700'}>
                  {a.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                  {a.comentario_resolucion && <div className="text-xs text-slate-500">“{a.comentario_resolucion}”</div>}
                </td>
                <td>{a.resuelto_en && formatoFechaHora(a.resuelto_en)} · {a.resolutor?.nombre}</td>
              </tr>
            ))}
            {resueltas?.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-500">Sin registros</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
