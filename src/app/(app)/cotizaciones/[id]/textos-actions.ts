'use server';

import { revalidatePath } from 'next/cache';
import { redactarYGuardar } from '@/lib/ai/guardar';
import { ErrorRedaccion } from '@/lib/ai/redaccion';
import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { mensajeErrorBD } from '@/lib/errores';
import { accionesDisponibles } from '@/lib/estados';
import { cargarDatosPdf } from '@/lib/pdf/datos';
import { textosPdfSchema } from '@/lib/pdf/textos';
import { createClient } from '@/lib/supabase/server';
import type { ResultadoAccion } from '@/lib/types';
import { erroresPorCampo } from '@/lib/validation/schemas';

export interface ResultadoRedaccion extends ResultadoAccion {
  advertencias?: string[];
}

/** Redacta (o vuelve a redactar) los textos con IA. */
export async function redactarConIA(cotizacionId: string): Promise<ResultadoRedaccion> {
  const perfil = await requerirPerfil(ROLES_COTIZAN);
  const supabase = await createClient();

  const cargado = await cargarDatosPdf(supabase, cotizacionId);
  if (!cargado) return { error: 'No se encontró la cotización.' };
  if (!accionesDisponibles(cargado.cot, perfil).editarTextos) {
    return { error: 'Los textos no se pueden modificar en el estado actual.' };
  }

  try {
    const r = await redactarYGuardar(supabase, cotizacionId, cargado.datos);
    revalidatePath(`/cotizaciones/${cotizacionId}`);
    return { ok: true, advertencias: r.advertencias };
  } catch (e) {
    if (e instanceof ErrorRedaccion || e instanceof Error) return { error: e.message };
    throw e;
  }
}

/** Guarda los textos editados por el asesor. */
export async function guardarTextosManual(
  cotizacionId: string,
  textos: { presentacion: string; condiciones: string[]; cierre: string },
): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_COTIZAN);

  const parsed = textosPdfSchema.safeParse({
    ...textos,
    condiciones: textos.condiciones.map((c) => c.trim()).filter(Boolean),
  });
  if (!parsed.success) return { error: 'Revise los textos', campos: erroresPorCampo(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc('guardar_textos', {
    p_cotizacion_id: cotizacionId,
    p_textos: parsed.data,
    p_origen: 'manual',
  });
  if (error) return { error: mensajeErrorBD(error) };

  revalidatePath(`/cotizaciones/${cotizacionId}`);
  return { ok: true };
}
