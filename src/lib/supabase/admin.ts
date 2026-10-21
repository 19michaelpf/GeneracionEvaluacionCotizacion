import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export const BUCKET_PDF = 'cotizaciones-pdf';

/**
 * Cliente con service role, SOLO para escribir PDFs generados por el servidor.
 * Los usuarios no tienen permisos de escritura en el bucket; la autorización de
 * negocio la hace public.registrar_pdf con la sesión del usuario.
 * No exporte este cliente ni lo use para consultas de datos.
 */
function clienteServicio() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY (solo servidor).');
  return createClient(env.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Indica si el servidor tiene la clave necesaria para guardar PDFs. */
export const almacenamientoConfigurado = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

export async function subirPdf(path: string, contenido: Uint8Array) {
  const { error } = await clienteServicio()
    .storage.from(BUCKET_PDF)
    .upload(path, contenido, { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error(`No se pudo guardar el PDF: ${error.message}`);
}

export async function eliminarPdf(path: string) {
  await clienteServicio().storage.from(BUCKET_PDF).remove([path]);
}
