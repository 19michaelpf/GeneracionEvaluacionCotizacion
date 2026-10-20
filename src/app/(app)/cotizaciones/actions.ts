'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { mensajeErrorBD } from '@/lib/errores';
import { createClient } from '@/lib/supabase/server';
import type { ResultadoAccion } from '@/lib/types';
import { cotizacionSchema, erroresPorCampo } from '@/lib/validation/schemas';

/**
 * Crea o actualiza una cotización en borrador.
 * Se valida aquí con zod y nuevamente en la BD (guardar_cotizacion), que además
 * fija los precios desde la tarifa vigente y recalcula los totales.
 */
export async function guardarCotizacion(payload: unknown): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_COTIZAN);

  const parsed = cotizacionSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Revise los datos de la cotización', campos: erroresPorCampo(parsed.error) };
  const c = parsed.data;

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc('guardar_cotizacion', {
    p_id: c.id,
    p_cliente_id: c.cliente_id,
    p_solicitud: c.solicitud,
    p_validez_dias: c.validez_dias,
    p_descuento_global_pct: c.descuento_global_pct,
    p_items: c.items,
  });
  if (error) return { error: mensajeErrorBD(error) };

  revalidatePath('/cotizaciones');
  redirect(`/cotizaciones/${id}`);
}
