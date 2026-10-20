import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatosPdf } from '@/lib/pdf/CotizacionPdf';
import { mensajeErrorBD } from '@/lib/errores';
import { redactarTextos, type ContextoRedaccion } from './redaccion';

/** Contexto para la IA a partir de los datos del PDF, sin precios ni totales. */
export function contextoDesdePdf(d: DatosPdf): ContextoRedaccion {
  return {
    empresa: d.empresa.razon_social,
    cliente: d.cliente.razon_social,
    contacto: d.cliente.contacto,
    solicitud: d.solicitud,
    items: d.items.map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, unidad: i.unidad })),
    validezDias: d.validezDias,
    fechaVencimiento: d.fechaVencimiento,
  };
}

/**
 * Redacta con IA y guarda con guardar_textos (sesión del usuario: la BD valida permisos y estado).
 * Lanza ErrorRedaccion si la IA falla, o Error con mensaje para el usuario si la BD rechaza.
 */
export async function redactarYGuardar(supabase: SupabaseClient, cotizacionId: string, datos: DatosPdf) {
  const r = await redactarTextos(contextoDesdePdf(datos));
  const { error } = await supabase.rpc('guardar_textos', {
    p_cotizacion_id: cotizacionId,
    p_textos: { ...r.textos, advertencias: r.advertencias, modelo: r.modelo },
    p_origen: 'ia',
  });
  if (error) throw new Error(mensajeErrorBD(error));
  return r;
}
