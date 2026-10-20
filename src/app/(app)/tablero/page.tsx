import Link from 'next/link';
import { EstadoBadge } from '@/components/EstadoBadge';
import { requerirPerfil } from '@/lib/auth';
import { formatoFecha, formatoMoneda } from '@/lib/format';
import { hoyLima } from '@/lib/pdf/datos';
import { createClient } from '@/lib/supabase/server';
import { ESTADOS_ORDEN, resumenTablero, type FilaTablero } from '@/lib/tablero';
import { sumarDias } from '@/lib/pdf/textos';
import { actualizarVencimientos } from '@/lib/vencimientos';

type Fila = Omit<FilaTablero, 'cliente'> & { clientes: { razon_social: string } | null };

export default async function TableroPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  await actualizarVencimientos(supabase);

  // La RLS limita los datos: el asesor ve solo sus cotizaciones; finanzas y admin, todas
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id, numero, estado, total, fecha_emision, validez_dias, enviada_en, clientes(razon_social)')
    .order('created_at', { ascending: false })
    .limit(2000)
    .overrideTypes<Fila[], { merge: false }>();

  const filas: FilaTablero[] = (data ?? []).map((f) => ({ ...f, cliente: f.clientes?.razon_social ?? '' }));
  const r = resumenTablero(filas, hoyLima());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tablero de seguimiento</h1>
        <p className="text-sm text-slate-500">
          {perfil.rol === 'asesor' ? 'Sus cotizaciones' : 'Todas las cotizaciones'} · {r.total} en total
        </p>
      </div>
      {error && <p className="text-sm text-rose-600">No se pudieron cargar los datos.</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador etiqueta="En negociación (enviadas)" valor={formatoMoneda(r.montoEnNegociacion)} detalle={`${r.porEstado.enviada.cantidad} cotizaciones`} />
        <Indicador etiqueta="Aceptado" valor={formatoMoneda(r.montoAceptado)} detalle={`${r.porEstado.aceptada.cantidad} cotizaciones`} />
        <Indicador
          etiqueta="Tasa de cierre"
          valor={r.tasaCierrePct === null ? '—' : `${r.tasaCierrePct} %`}
          detalle="aceptadas / (aceptadas + rechazadas + vencidas)"
        />
      </div>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-semibold">Por estado</h2>
        <table className="tabla mt-2">
          <thead>
            <tr><th>Estado</th><th className="text-right">Cantidad</th><th className="text-right">Monto total</th><th /></tr>
          </thead>
          <tbody>
            {ESTADOS_ORDEN.map((e) => (
              <tr key={e}>
                <td><EstadoBadge estado={e} /></td>
                <td className="text-right">{r.porEstado[e].cantidad}</td>
                <td className="text-right">{formatoMoneda(r.porEstado[e].monto)}</td>
                <td className="text-right">
                  {r.porEstado[e].cantidad > 0 && (
                    <Link href={`/cotizaciones?estado=${e}`} className="text-blue-700 hover:underline">Ver</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-semibold">Enviadas por vencer (3 días o menos)</h2>
        <table className="tabla mt-2">
          <thead>
            <tr><th>Cotización</th><th>Cliente</th><th>Vence</th><th className="text-right">Total</th></tr>
          </thead>
          <tbody>
            {r.porVencer.map((f) => (
              <tr key={f.id}>
                <td><Link href={`/cotizaciones/${f.id}`} className="font-medium text-blue-700 hover:underline">{f.numero}</Link></td>
                <td>{f.cliente}</td>
                <td className={f.dias <= 1 ? 'font-medium text-rose-700' : 'text-amber-700'}>
                  {formatoFecha(sumarDias(f.fecha_emision, f.validez_dias))} ({f.dias === 0 ? 'hoy' : `en ${f.dias} d`})
                </td>
                <td className="text-right">{formatoMoneda(f.total)}</td>
              </tr>
            ))}
            {r.porVencer.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-slate-500">Ninguna cotización enviada vence en los próximos días</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Indicador({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle: string }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{etiqueta}</div>
      <div className="mt-1 text-2xl font-semibold">{valor}</div>
      <div className="text-xs text-slate-500">{detalle}</div>
    </div>
  );
}
