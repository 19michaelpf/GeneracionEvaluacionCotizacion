'use client';

import { useActionState } from 'react';
import { reabrirCotizacion, resolverAprobacion, solicitarAprobacion } from '@/app/(app)/aprobaciones/actions';
import type { AccionesCotizacion } from '@/lib/estados';
import type { ResultadoAccion } from '@/lib/types';

interface Props {
  cotizacionId: string;
  aprobacionPendienteId: string | null;
  acciones: AccionesCotizacion;
}

/** Acciones del flujo de aprobación disponibles para el usuario actual. */
export function PanelAprobacion({ cotizacionId, aprobacionPendienteId, acciones }: Props) {
  return (
    <>
      {acciones.solicitarAprobacion && <Solicitar cotizacionId={cotizacionId} />}
      {acciones.resolverAprobacion && aprobacionPendienteId && (
        <Resolver cotizacionId={cotizacionId} aprobacionId={aprobacionPendienteId} />
      )}
      {acciones.reabrir && <Reabrir cotizacionId={cotizacionId} />}
    </>
  );
}

function Mensaje({ estado }: { estado: ResultadoAccion }) {
  if (estado.error) return <p className="text-sm text-rose-600">{estado.error}</p>;
  return null;
}

function Solicitar({ cotizacionId }: { cotizacionId: string }) {
  const [estado, accion, pendiente] = useActionState(solicitarAprobacion.bind(null, cotizacionId), {});
  return (
    <form action={accion} className="card space-y-3">
      <h2 className="font-semibold">Solicitar aprobación de Finanzas</h2>
      <textarea name="comentario" className="input min-h-20" maxLength={1000} placeholder="Justificación del descuento (opcional)" />
      <Mensaje estado={estado} />
      <button className="btn btn-primary" disabled={pendiente}>{pendiente ? 'Enviando…' : 'Solicitar aprobación'}</button>
    </form>
  );
}

function Resolver({ cotizacionId, aprobacionId }: { cotizacionId: string; aprobacionId: string }) {
  const [estado, accion, pendiente] = useActionState(resolverAprobacion.bind(null, aprobacionId, cotizacionId), {});
  return (
    <form action={accion} className="card space-y-3 border-amber-300">
      <h2 className="font-semibold">Resolver descuento</h2>
      <div>
        <textarea name="comentario" className="input min-h-20" maxLength={1000} placeholder="Comentario (obligatorio para rechazar)" />
        {estado.campos?.comentario && <p className="error-campo">{estado.campos.comentario}</p>}
      </div>
      <Mensaje estado={estado} />
      <div className="flex gap-2">
        <button name="decision" value="aprobar" className="btn btn-primary" disabled={pendiente}>Aprobar</button>
        <button name="decision" value="rechazar" className="btn btn-danger" disabled={pendiente}>Rechazar</button>
      </div>
    </form>
  );
}

function Reabrir({ cotizacionId }: { cotizacionId: string }) {
  const [estado, accion, pendiente] = useActionState(reabrirCotizacion.bind(null, cotizacionId), {});
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm('La cotización volverá a borrador. ¿Continuar?')) e.preventDefault();
      }}
      className="card space-y-3"
    >
      <h2 className="font-semibold">Reabrir para editar</h2>
      <p className="text-sm text-slate-500">
        Vuelve a borrador para corregir o actualizar la oferta. Se anulan la aprobación, la validación y el registro de envío
        vigentes; si el descuento supera el umbral, deberá solicitar aprobación otra vez.
      </p>
      <input name="comentario" className="input" maxLength={1000} placeholder="Motivo (opcional)" />
      <Mensaje estado={estado} />
      <button className="btn" disabled={pendiente}>{pendiente ? 'Reabriendo…' : 'Reabrir'}</button>
    </form>
  );
}
