function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. Revise .env.local (ver .env.example).`);
  }
  return valor;
}

// Solo URL y anon key públicas: la anon key es segura en el navegador porque la RLS protege los datos.
export const env = {
  get supabaseUrl() {
    return requerida('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey() {
    return requerida('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
};

/**
 * Problemas de configuración pública de Supabase (solo nombres de variables, nunca valores).
 * Las variables NEXT_PUBLIC_* se incorporan al compilar: tras cambiarlas hay que volver a desplegar.
 */
export function problemasConfiguracion(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): string[] {
  const problemas: string[] = [];
  if (!url?.trim()) {
    problemas.push('Falta NEXT_PUBLIC_SUPABASE_URL.');
  } else {
    try {
      const u = new URL(url.trim());
      if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        problemas.push('NEXT_PUBLIC_SUPABASE_URL debe empezar con https://');
      }
      if (u.pathname !== '/' && u.pathname !== '') {
        problemas.push('NEXT_PUBLIC_SUPABASE_URL debe ser solo la URL del proyecto (https://xxxx.supabase.co), sin rutas como /rest/v1.');
      }
    } catch {
      problemas.push('NEXT_PUBLIC_SUPABASE_URL no es una URL válida (ejemplo: https://xxxx.supabase.co).');
    }
  }
  if (!anonKey?.trim()) problemas.push('Falta NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  return problemas;
}
