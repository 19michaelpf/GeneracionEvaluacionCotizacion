'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ResultadoAccion } from '@/lib/types';

const loginSchema = z.object({
  email: z.email('Correo inválido'),
  password: z.string().min(1, 'Ingrese su contraseña'),
});

export async function iniciarSesion(_prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'Correo o contraseña incorrectos' };

  redirect('/cotizaciones');
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
