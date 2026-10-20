'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { mensajeErrorBD } from '@/lib/errores';
import { createClient } from '@/lib/supabase/server';
import type { ResultadoAccion } from '@/lib/types';
import { erroresPorCampo } from '@/lib/validation/schemas';

const envioSchema = z.object({
  medio: z.enum(['email', 'whatsapp', 'presencial', 'otro'], { error: 'Seleccione el medio' }),
  destinatario: z.string().trim().min(3, 'Indique el destinatario').max(200),
  nota: z.string().trim().max(1000).optional(),
});

const textoSchema = z.string().trim().max(1000, 'Máximo 1000 caracteres');

function refrescar(id: string) {
  revalidatePath(`/cotizaciones/${id}`);
  revalidatePath('/cotizaciones');
  revalidatePath('/tablero');
}

export async function registrarEnvio(cotizacionId: string, _prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_COTIZAN);
  const parsed = envioSchema.safeParse({
    medio: formData.get('medio'),
    destinatario: formData.get('destinatario'),
    nota: formData.get('nota') ?? undefined,
  });
  if (!parsed.success) return { error: 'Revise los datos del envío', campos: erroresPorCampo(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc('registrar_envio', {
    p_cotizacion_id: cotizacionId,
    p_medio: parsed.data.medio,
    p_destinatario: parsed.data.destinatario,
    p_nota: parsed.data.nota ?? null,
  });
  if (error) return { error: mensajeErrorBD(error) };
  refrescar(cotizacionId);
  return { ok: true };
}

export async function registrarRespuesta(cotizacionId: string, _prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_COTIZAN);
  const respuesta = formData.get('respuesta');
  if (respuesta !== 'aceptada' && respuesta !== 'rechazada') return { error: 'Respuesta inválida' };
  const comentario = textoSchema.safeParse(formData.get('comentario') ?? '');
  if (!comentario.success) return { error: comentario.error.issues[0].message };
  if (respuesta === 'rechazada' && !comentario.data) return { campos: { comentario: 'Indique el motivo del rechazo' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('registrar_respuesta', {
    p_cotizacion_id: cotizacionId,
    p_aceptada: respuesta === 'aceptada',
    p_comentario: comentario.data,
  });
  if (error) return { error: mensajeErrorBD(error) };
  refrescar(cotizacionId);
  return { ok: true };
}

export async function registrarSeguimiento(cotizacionId: string, _prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_COTIZAN);
  const nota = textoSchema.safeParse(formData.get('nota') ?? '');
  if (!nota.success) return { error: nota.error.issues[0].message };
  if (!nota.data) return { campos: { nota: 'Escriba la nota' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('registrar_seguimiento', { p_cotizacion_id: cotizacionId, p_nota: nota.data });
  if (error) return { error: mensajeErrorBD(error) };
  refrescar(cotizacionId);
  return { ok: true };
}
