'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { AccionesCotizacion } from '@/lib/estados';
import { formatoFecha, formatoFechaHora } from '@/lib/format';
import { registrarEnvio, registrarRespuesta, registrarSeguimiento } from './envio-actions';

const ETIQUETA_MEDIO: Record<string, string> = { email: 'Correo', whatsapp: 'WhatsApp', presencial: 'Presencial', otro: 'Otro' };

interface Props {
  cotizacionId: string;
  acciones: AccionesCotizacion;
  emailCliente: string | null;
  envio: { medio: string | null; destinatario: string | null; enviada_en: string | null };
  vence: { fecha: string; dias: number } | null;
}

export function PanelEnvio({ cotizacionId, acciones, emailCliente, envio, vence }: Props) {
  const mostrarInfo = Boolean(envio.enviada_en);
  if (!acciones.registrarEnvio && !acciones.registrarRespuesta && !acciones.registrarSeguimiento && !mostrarInfo) return null;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="mr-auto font-semibold">Envío y seguimiento</h2>
        {vence && (
          <span className={`text-sm ${vence.dias < 0 ? 'text-rose-700' : vence.dias <= 3 ? 'text-amber-700' : 'text-slate-500'}`}>
            {vence.dias < 0
              ? `Oferta vencida el ${formatoFecha(vence.fecha)}`
              : `Vence el ${formatoFecha(vence.fecha)} (${vence.dias === 0 ? 'hoy' : `en ${vence.dias} día${vence.dias === 1 ? '' : 's'}`})`}
          </span>
        )}
      </div>

      {mostrarInfo && (
        <p className="text-sm">
          Enviada por <strong>{ETIQUETA_MEDIO[envio.medio ?? ''] ?? envio.medio}</strong> a {envio.destinatario} el{' '}
          {formatoFechaHora(envio.enviada_en!)}.
        </p>
      )}

      {acciones.registrarEnvio && <FormEnvio cotizacionId={cotizacionId} emailCliente={emailCliente} />}
      {acciones.registrarRespuesta && <FormRespuesta cotizacionId={cotizacionId} />}
      {acciones.registrarSeguimiento && <FormSeguimiento cotizacionId={cotizacionId} />}
    </section>
  );
}

function FormEnvio({ cotizacionId, emailCliente }: { cotizacionId: string; emailCliente: string | null }) {
  const [estado, accion, pendiente] = useActionState(registrarEnvio.bind(null, cotizacionId), {});
  const e = estado.campos ?? {};
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor="medio">Medio</label>
        <select id="medio" name="medio" className="input" defaultValue="email">
          {Object.entries(ETIQUETA_MEDIO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        {e.medio && <p className="error-campo">{e.medio}</p>}
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="destinatario">Destinatario (correo, teléfono o persona)</label>
        <input id="destinatario" name="destinatario" className="input" defaultValue={emailCliente ?? ''} maxLength={200} required />
        {e.destinatario && <p className="error-campo">{e.destinatario}</p>}
      </div>
      <div className="sm:col-span-3">
        <input name="nota" className="input" maxLength={1000} placeholder="Nota (opcional)" />
      </div>
      {estado.error && <p className="text-sm text-rose-600 sm:col-span-3">{estado.error}</p>}
      <div className="sm:col-span-3">
        <button className="btn btn-primary" disabled={pendiente}>{pendiente ? 'Registrando…' : 'Registrar envío'}</button>
        <p className="mt-1 text-xs text-slate-500">Envíe el PDF validado por el medio elegido y registre aquí el envío.</p>
      </div>
    </form>
  );
}

function FormRespuesta({ cotizacionId }: { cotizacionId: string }) {
  const [estado, accion, pendiente] = useActionState(registrarRespuesta.bind(null, cotizacionId), {});
  return (
    <form action={accion} className="space-y-2 rounded-md border border-slate-200 p-3">
      <h3 className="text-sm font-semibold">Respuesta del cliente</h3>
      <textarea name="comentario" className="input min-h-16" maxLength={1000} placeholder="Comentario (obligatorio si rechazó: precio, plazo, competencia…)" />
      {estado.campos?.comentario && <p className="error-campo">{estado.campos.comentario}</p>}
      {estado.error && <p className="text-sm text-rose-600">{estado.error}</p>}
      <div className="flex gap-2">
        <button name="respuesta" value="aceptada" className="btn btn-primary" disabled={pendiente}>Aceptó</button>
        <button name="respuesta" value="rechazada" className="btn btn-danger" disabled={pendiente}>Rechazó</button>
      </div>
    </form>
  );
}

function FormSeguimiento({ cotizacionId }: { cotizacionId: string }) {
  const [estado, accion, pendiente] = useActionState(registrarSeguimiento.bind(null, cotizacionId), {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  return (
    <form ref={form} action={accion} className="flex flex-wrap items-start gap-2">
      <div className="min-w-60 flex-1">
        <input name="nota" className="input" maxLength={1000} placeholder="Nota de seguimiento (llamada, reunión, acuerdo…)" />
        {estado.campos?.nota && <p className="error-campo">{estado.campos.nota}</p>}
      </div>
      <button className="btn" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Agregar nota'}</button>
      {estado.error && <p className="w-full text-sm text-rose-600">{estado.error}</p>}
    </form>
  );
}
