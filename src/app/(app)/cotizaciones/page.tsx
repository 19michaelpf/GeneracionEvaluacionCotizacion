import Link from 'next/link';
import { EstadoBadge } from '@/components/EstadoBadge';
import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { ETIQUETA_ESTADO, formatoFecha, formatoMoneda, formatoPct } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { Cotizacion, EstadoCotizacion } from '@/lib/types';
import { actualizarVencimientos } from '@/lib/vencimientos';

type Fila = Pick<Cotizacion, 'id' | 'numero' | 'fecha_emision' | 'total' | 'descuento_pct_max' | 'requiere_aprobacion' | 'estado'> & {
  clientes: { razon_social: string } | null;
  profiles: { nombre: string } | null;
};

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; error?: string }>;
}) {
  const perfil = await requerirPerfil();
  const { estado, error: errorParam } = await searchParams;
  const filtro = estado && estado in ETIQUETA_ESTADO ? (estado as EstadoCotizacion) : undefined;

  const supabase = await createClient();
  await actualizarVencimientos(supabase);
  let consulta = supabase
    .from('cotizaciones')
    .select('id, numero, fecha_emision, total, descuento_pct_max, requiere_aprobacion, estado, clientes(razon_social), profiles!cotizaciones_asesor_id_fkey(nombre)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filtro) consulta = consulta.eq('estado', filtro);
  const { data: cotizaciones, error } = await consulta.overrideTypes<Fila[], { merge: false }>();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Cotizaciones</h1>
        <form className="ml-auto flex gap-2">
          <select name="estado" className="input w-56" defaultValue={filtro ?? ''}>
            <option value="">Todos los estados</option>
            {Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>{etiqueta}</option>
            ))}
          </select>
          <button className="btn">Filtrar</button>
        </form>
        {ROLES_COTIZAN.includes(perfil.rol) && (
          <Link href="/cotizaciones/nueva" className="btn btn-primary">Nueva cotización</Link>
        )}
      </div>
      {errorParam === 'permiso' && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">No tiene permisos para acceder a esa sección.</p>}
      {error && <p className="text-sm text-rose-600">No se pudo cargar la lista de cotizaciones.</p>}
      <div className="card overflow-x-auto p-0">
        <table className="tabla">
          <thead>
            <tr>
              <th>Número</th><th>Fecha</th><th>Cliente</th>
              {perfil.rol !== 'asesor' && <th>Asesor</th>}
              <th className="text-right">Total</th><th className="text-right">Desc. máx.</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cotizaciones?.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td><Link href={`/cotizaciones/${c.id}`} className="font-medium text-blue-700 hover:underline">{c.numero}</Link></td>
                <td>{formatoFecha(c.fecha_emision)}</td>
                <td>{c.clientes?.razon_social}</td>
                {perfil.rol !== 'asesor' && <td>{c.profiles?.nombre}</td>}
                <td className="text-right">{formatoMoneda(c.total)}</td>
                <td className={`text-right ${c.requiere_aprobacion ? 'font-medium text-amber-700' : ''}`}>{formatoPct(c.descuento_pct_max)}</td>
                <td><EstadoBadge estado={c.estado} /></td>
              </tr>
            ))}
            {cotizaciones?.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-500">No hay cotizaciones</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
