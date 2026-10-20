'use server';

import { revalidatePath } from 'next/cache';
import { redactarYGuardar } from '@/lib/ai/guardar';
import { iaDisponible } from '@/lib/ai/redaccion';
import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { mensajeErrorBD } from '@/lib/errores';
import { accionesDisponibles } from '@/lib/estados';
import { cargarDatosPdf } from '@/lib/pdf/datos';
import { generarPdf } from '@/lib/pdf/generar';
import { eliminarPdf, subirPdf } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ResultadoAccion } from '@/lib/types';

/**
 * Genera una nueva versión del PDF:
 *   1. lee los datos con la sesión del usuario (RLS) y verifica que la acción esté permitida,
 *   2. si aún no hay textos, los redacta automáticamente con IA (si falla, usa la plantilla),
 *   3. renderiza el PDF en el servidor y lo sube al bucket privado (service role),
 *   4. lo registra con registrar_pdf, que vuelve a validar rol, estado y versión en la BD.
 * Si el registro falla, se elimina el archivo subido.
 */
export async function generarPdfCotizacion(cotizacionId: string): Promise<ResultadoAccion> {
  const perfil = await requerirPerfil(ROLES_COTIZAN);
  const supabase = await createClient();

  let cargado = await cargarDatosPdf(supabase, cotizacionId);
  if (!cargado) return { error: 'No se encontró la cotización.' };
  if (!accionesDisponibles(cargado.cot, perfil).generarPdf) {
    return { error: 'La cotización no está en un estado que permita generar el PDF.' };
  }

  let aviso: string | undefined;
  if (!cargado.cot.textos_ia && iaDisponible()) {
    try {
      const r = await redactarYGuardar(supabase, cotizacionId, cargado.datos);
      if (r.advertencias.length > 0) aviso = 'La IA redactó textos con posibles cifras: revíselos antes de validar.';
      cargado = (await cargarDatosPdf(supabase, cotizacionId)) ?? cargado;
    } catch (e) {
      console.error('Redacción automática con IA', e);
      aviso = 'No se pudo redactar con IA; se usó la plantilla estándar. Puede editar los textos y regenerar.';
    }
  }
  const { cot, datos } = cargado;

  const path = `${cot.id}/v${datos.version}.pdf`;
  try {
    await subirPdf(path, await generarPdf(datos));
  } catch (e) {
    console.error('Error al generar o subir el PDF', e);
    return { error: 'No se pudo generar el PDF. Intente nuevamente.' };
  }

  const { error } = await supabase.rpc('registrar_pdf', { p_cotizacion_id: cot.id, p_version: datos.version });
  if (error) {
    await eliminarPdf(path);
    return { error: mensajeErrorBD(error) };
  }

  revalidatePath(`/cotizaciones/${cot.id}`);
  revalidatePath('/cotizaciones');
  return { ok: true, aviso };
}

export async function validarCotizacion(cotizacionId: string): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_COTIZAN);
  const supabase = await createClient();
  const { error } = await supabase.rpc('validar_cotizacion', { p_cotizacion_id: cotizacionId });
  if (error) return { error: mensajeErrorBD(error) };

  revalidatePath(`/cotizaciones/${cotizacionId}`);
  revalidatePath('/cotizaciones');
  return { ok: true };
}
