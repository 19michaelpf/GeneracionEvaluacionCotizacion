import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Marca como vencidas las ofertas cuya validez terminó (idempotente).
 * Se invoca antes de listar cotizaciones; un fallo no debe impedir mostrar la página.
 */
export async function actualizarVencimientos(supabase: SupabaseClient) {
  const { error } = await supabase.rpc('actualizar_vencimientos');
  if (error) console.error('No se pudieron actualizar los vencimientos', error);
}
