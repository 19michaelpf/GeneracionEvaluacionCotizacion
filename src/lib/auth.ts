import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Perfil, Rol } from '@/lib/types';

/** Perfil del usuario autenticado (una consulta por request). */
export const obtenerPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, nombre, email, rol, activo')
    .eq('id', user.id)
    .single<Perfil>();
  return data && data.activo ? data : null;
});

/** Exige sesión (y opcionalmente un rol). Redirige si no se cumple. */
export async function requerirPerfil(roles?: Rol[]): Promise<Perfil> {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect('/login');
  if (roles && !roles.includes(perfil.rol)) redirect('/cotizaciones?error=permiso');
  return perfil;
}

export const ROLES_CATALOGO: Rol[] = ['finanzas', 'admin'];
export const ROLES_COTIZAN: Rol[] = ['asesor', 'admin'];
