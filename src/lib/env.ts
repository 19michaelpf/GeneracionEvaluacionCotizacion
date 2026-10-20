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
