import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EstadoBadge } from '@/components/EstadoBadge';
import { requerirPerfil } from '@/lib/auth';
import { accionesDisponibles } from '@/lib/estados';
import { ETIQUETA_ESTADO, formatoFecha, formatoFechaHora, formatoMoneda, formatoNumero, formatoPct } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { Aprobacion, Cliente, Cotizacion, CotizacionEvento, CotizacionItem, EstadoAprobacion } from '@/lib/types';
import { iaDisponible } from '@/lib/ai/redaccion';
import { hoyLima } from '@/lib/pdf/datos';
import { sumarDias, textosPorDefecto } from '@/lib/pdf/textos';
import { diasParaVencer } from '@/lib/tablero';
import { actualizarVencimientos } from '@/lib/vencimientos';
import { PanelAprobacion } from './PanelAprobacion';
import { PanelEnvio } from './PanelEnvio';
import { PanelPdf } from './PanelPdf';
import { PanelTextos } from './PanelTextos';

type Detalle = Cotizacion & {
  clientes: Cliente | null;
  profiles: { nombre: string } | null;
};

type AprobacionConNombres = Aprobacion & {
  solicitante: { nombre: string } | null;
  resolutor: { nombre: string } | null;
};

const ETIQUETA_ACCION: Record<string, string> = {
  creada: 'Cotización creada',
  modificada: 'Cotización modificada',
  cambio_estado: 'Cambio de estado',
  aprobacion_solicitada: 'Aprobación solicitada',
  descuento_aprobado: 'Descuento aprobado por Finanzas',
  descuento_rechazado: 'Descuento rechazado por Finanzas',
  reabierta: 'Cotización reabierta',
  textos_actualizados: 'Textos actualizados',
  pdf_generado: 'PDF generado',
  validada: 'Cotización validada por el asesor',
  enviada: 'Cotización enviada al cliente',
  respuesta_aceptada: 'El cliente aceptó la cotización',
  respuesta_rechazada: 'El cliente rechazó la cotización',
  seguimiento: 'Seguimiento',
  vencimiento_automatico: 'Oferta vencida (automático)',
};

// Estados en los que ya existe fecha de emisión del documento
const CON_VENCIMIENTO = new Set(['generada', 'validada', 'enviada', 'vencida']);

const ESTILO_APROBACION: Record<EstadoAprobacion, string> = {
  pendiente: 'text-amber-700',
  aprobada: 'text-emerald-700',
  rechazada: 'text-rose-700',
  anulada: 'text-slate-500',
};

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await requerirPerfil();
  const { id } = await params;

  const supabase = await createClient();
  await actualizarVencimientos(supabase);
  const [{ data: cot }, { data: items }, { data: eventos }, { data: aprobaciones }] = await Promise.all([
    supabase
      .from('cotizaciones')
      .select('*, clientes(*), profiles!cotizaciones_asesor_id_fkey(nombre)')
      .eq('id', id)
      .maybeSingle<Detalle>(),
    supabase.from('cotizacion_items').select('*').eq('cotizacion_id', id).order('orden').overrideTypes<CotizacionItem[], { merge: false }>(),
    supabase.from('cotizacion_eventos').select('*').eq('cotizacion_id', id).order('created_at').overrideTypes<CotizacionEvento[], { merge: false }>(),
    supabase
      .from('aprobaciones')
      .select('*, solicitante:profiles!aprobaciones_solicitado_por_fkey(nombre), resolutor:profiles!aprobaciones_resuelto_por_fkey(nombre)')
      .eq('cotizacion_id', id)
      .order('solicitado_en', { ascending: false })
      .overrideTypes<AprobacionConNombres[], { merge: false }>(),
  ]);
  if (!cot) notFound();

  const acciones = accionesDisponibles(cot, perfil);
  const pendiente = aprobaciones?.find((a) => a.estado === 'pendiente') ?? null;
  // Plantilla que se usaría si no hay textos guardados (fecha estimada: generación hoy)
  const plantilla = textosPorDefecto({
    cliente: cot.clientes?.razon_social ?? '',
    validezDias: cot.validez_dias,
    fechaVencimiento: sumarDias(hoyLima(), cot.validez_dias),
  });
  const vence = CON_VENCIMIENTO.has(cot.estado)
    ? {
        fecha: sumarDias(cot.fecha_emision, cot.validez_dias),
        dias: diasParaVencer(cot.fecha_emision, cot.validez_dias, hoyLima()),
      }
    : null;
  const validadaInfo =
    cot.estado === 'validada' && cot.validada_en ? `Validada el ${formatoFechaHora(cot.validada_en)} (PDF v${cot.pdf_version}).` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{cot.numero}</h1>
        <EstadoBadge estado={cot.estado} />
        <div className="ml-auto flex gap-2">
          {acciones.editar && <Link href={`/cotizaciones/${cot.id}/editar`} className="btn btn-primary">Editar</Link>}
          <Link href="/cotizaciones" className="btn">Volver</Link>
        </div>
      </div>

      {cot.requiere_aprobacion && cot.estado === 'borrador' && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Descuento efectivo máximo de {formatoPct(cot.descuento_pct_max)}: requiere aprobación de Finanzas antes de generar el PDF.
        </p>
      )}
      {cot.estado === 'pendiente_aprobacion' && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          En espera de aprobación de Finanzas por un descuento de {formatoPct(cot.descuento_pct_max)}. Los ítems no se pueden modificar.
        </p>
      )}

      <PanelEnvio
        cotizacionId={cot.id}
        acciones={acciones}
        emailCliente={cot.clientes?.email ?? null}
        envio={{ medio: cot.envio_medio, destinatario: cot.envio_destinatario, enviada_en: cot.enviada_en }}
        vence={vence}
      />
      <PanelAprobacion cotizacionId={cot.id} aprobacionPendienteId={pendiente?.id ?? null} acciones={acciones} />
      <PanelPdf
        cotizacionId={cot.id}
        pdfVersion={cot.pdf_version}
        puedeGenerar={acciones.generarPdf}
        puedeValidar={acciones.validar}
        validadaInfo={validadaInfo}
        pdfDesactualizado={cot.pdf_desactualizado}
      />
      {(acciones.editarTextos || cot.textos_ia) && (
        <PanelTextos
          cotizacionId={cot.id}
          guardados={cot.textos_ia}
          plantilla={plantilla}
          iaHabilitada={iaDisponible()}
          editable={acciones.editarTextos}
        />
      )}

      <section className="card grid gap-4 text-sm sm:grid-cols-3">
        <Dato etiqueta="Cliente" valor={`${cot.clientes?.razon_social ?? ''} (RUC ${cot.clientes?.ruc ?? ''})`} />
        <Dato etiqueta="Contacto" valor={[cot.clientes?.contacto, cot.clientes?.email].filter(Boolean).join(' · ') || '—'} />
        <Dato etiqueta="Asesor" valor={cot.profiles?.nombre ?? '—'} />
        <Dato etiqueta="Fecha de emisión" valor={formatoFecha(cot.fecha_emision)} />
        <Dato etiqueta="Validez" valor={`${cot.validez_dias} días`} />
        <Dato etiqueta="Moneda" valor={cot.moneda} />
        <div className="sm:col-span-3">
          <Dato etiqueta="Solicitud" valor={cot.solicitud} />
        </div>
      </section>

      <section className="card overflow-x-auto p-0">
        <table className="tabla">
          <thead>
            <tr>
              <th>#</th><th>Descripción</th><th className="text-right">Cantidad</th><th className="text-right">P. unitario</th>
              <th className="text-right">Desc. %</th><th className="text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((i) => (
              <tr key={i.id}>
                <td>{i.orden}</td>
                <td>{i.descripcion}</td>
                <td className="text-right">{formatoNumero(i.cantidad)} {i.unidad}</td>
                <td className="text-right">{formatoMoneda(i.precio_unitario)}</td>
                <td className="text-right">{formatoPct(i.descuento_pct)}</td>
                <td className="text-right">{formatoMoneda(i.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto max-w-sm space-y-1 p-5 text-sm">
          <Total etiqueta="Subtotal" valor={cot.subtotal} />
          {Number(cot.descuento_global_pct) > 0 && (
            <p className="text-right text-xs text-slate-500">Incluye descuento global de {formatoPct(cot.descuento_global_pct)}</p>
          )}
          <Total etiqueta="(−) Descuentos" valor={cot.descuento_total} />
          <Total etiqueta="Base imponible" valor={cot.base_imponible} />
          <Total etiqueta={`IGV (${formatoPct(cot.igv_pct)})`} valor={cot.igv} />
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <dt>Total</dt><dd>{formatoMoneda(cot.total)}</dd>
          </div>
        </dl>
      </section>

      {aprobaciones && aprobaciones.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">Aprobaciones</h2>
          <table className="tabla">
            <thead>
              <tr><th>Solicitada</th><th className="text-right">Descuento</th><th className="text-right">Total</th><th>Estado</th><th>Resolución</th></tr>
            </thead>
            <tbody>
              {aprobaciones.map((a) => (
                <tr key={a.id}>
                  <td>
                    {formatoFechaHora(a.solicitado_en)} · {a.solicitante?.nombre}
                    {a.comentario && <div className="text-xs text-slate-500">“{a.comentario}”</div>}
                  </td>
                  <td className="text-right">{formatoPct(a.descuento_pct)}</td>
                  <td className="text-right">{formatoMoneda(a.total)}</td>
                  <td className={`font-medium capitalize ${ESTILO_APROBACION[a.estado]}`}>{a.estado}</td>
                  <td>
                    {a.resuelto_en && `${formatoFechaHora(a.resuelto_en)}${a.resolutor ? ' · ' + a.resolutor.nombre : ''}`}
                    {a.comentario_resolucion && <div className="text-xs text-slate-500">“{a.comentario_resolucion}”</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 font-semibold">Historial</h2>
        <ol className="space-y-2 text-sm">
          {eventos?.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3">
              <span className="text-slate-500">{formatoFechaHora(e.created_at)}</span>
              <span>
                {ETIQUETA_ACCION[e.accion] ?? e.accion}
                {e.estado_nuevo && `: ${e.estado_anterior ? ETIQUETA_ESTADO[e.estado_anterior] + ' → ' : ''}${ETIQUETA_ESTADO[e.estado_nuevo]}`}
                {e.detalle && typeof e.detalle.version === 'number' && ` · v${e.detalle.version}`}
                {e.detalle && typeof e.detalle.total === 'number' && ` · total ${formatoMoneda(e.detalle.total)}`}
                {e.detalle && typeof e.detalle.comentario === 'string' && ` · “${e.detalle.comentario}”`}
                {e.detalle && typeof e.detalle.motivo === 'string' && ` · motivo: “${e.detalle.motivo}”`}
                {e.accion === 'enviada' && typeof e.detalle?.destinatario === 'string' && ` · ${e.detalle.medio} a ${e.detalle.destinatario}`}
                {e.accion === 'textos_actualizados' && e.detalle?.origen === 'ia' && ' · redactados con IA'}
                {e.accion === 'textos_actualizados' && e.detalle?.origen === 'manual' && ' · editados por el asesor'}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{etiqueta}</div>
      <div className="whitespace-pre-line">{valor}</div>
    </div>
  );
}

function Total({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between gap-8">
      <dt className="text-slate-600">{etiqueta}</dt>
      <dd>{formatoMoneda(valor)}</dd>
    </div>
  );
}
