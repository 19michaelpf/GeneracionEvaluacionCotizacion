'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { mensajeErrorBD } from '@/lib/errores';
import { createClient } from '@/lib/supabase/server';
import type { ResultadoAccion } from '@/lib/types';
import { clienteSchema, erroresPorCampo } from '@/lib/validation/schemas';

export async function guardarCliente(
  id: string | null,
  _prev: ResultadoAccion,
  formData: FormData,
): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_COTIZAN);

  const parsed = clienteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Revise los datos del formulario', campos: erroresPorCampo(parsed.error) };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('clientes').update(parsed.data).eq('id', id)
    : await supabase.from('clientes').insert(parsed.data);
  if (error) return { error: mensajeErrorBD(error) };

  revalidatePath('/clientes');
  redirect('/clientes');
}
