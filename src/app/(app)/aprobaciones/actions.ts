'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requerirPerfil } from '@/lib/auth';
import { mensajeErrorBD } from '@/lib/errores';
import { createClient } from '@/lib/supabase/server';
import type { ResultadoAccion } from '@/lib/types';

const comentarioSchema = z.string().trim().max(1000, 'Máximo 1000 caracteres');

function leerComentario(formData: FormData) {
  return comentarioSchema.safeParse(formData.get('comentario') ?? '');
}

function refrescar(cotizacionId: string) {
  revalidatePath(`/cotizaciones/${cotizacionId}`);
  revalidatePath('/cotizaciones');
  revalidatePath('/aprobaciones');
}

export async function solicitarAprobacion(cotizacionId: string, _prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  await requerirPerfil(['asesor', 'admin']);
  const comentario = leerComentario(formData);
  if (!comentario.success) return { error: comentario.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc('solicitar_aprobacion', {
    p_cotizacion_id: cotizacionId,
    p_comentario: comentario.data,
  });
  if (error) return { error: mensajeErrorBD(error) };

  refrescar(cotizacionId);
  return { ok: true };
}

export async function resolverAprobacion(
  aprobacionId: string,
  cotizacionId: string,
  _prev: ResultadoAccion,
  formData: FormData,
): Promise<ResultadoAccion> {
  await requerirPerfil(['finanzas']);
  const decision = formData.get('decision');
  if (decision !== 'aprobar' && decision !== 'rechazar') return { error: 'Decisión inválida' };
  const comentario = leerComentario(formData);
  if (!comentario.success) return { error: comentario.error.issues[0].message };
  if (decision === 'rechazar' && !comentario.data) return { campos: { comentario: 'Indique el motivo del rechazo' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('resolver_aprobacion', {
    p_aprobacion_id: aprobacionId,
    p_aprobar: decision === 'aprobar',
    p_comentario: comentario.data,
  });
  if (error) return { error: mensajeErrorBD(error) };

  refrescar(cotizacionId);
  return { ok: true };
}

export async function reabrirCotizacion(cotizacionId: string, _prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  await requerirPerfil(['asesor', 'admin']);
  const motivo = leerComentario(formData);
  if (!motivo.success) return { error: motivo.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc('reabrir_cotizacion', {
    p_cotizacion_id: cotizacionId,
    p_motivo: motivo.data,
  });
  if (error) return { error: mensajeErrorBD(error) };

  refrescar(cotizacionId);
  return { ok: true };
}
