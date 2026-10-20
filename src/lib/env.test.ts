import { describe, expect, it } from 'vitest';
import { problemasConfiguracion } from './env';

describe('problemasConfiguracion', () => {
  it('acepta una configuración correcta', () => {
    expect(problemasConfiguracion('https://abcd.supabase.co', 'clave')).toEqual([]);
    expect(problemasConfiguracion('https://abcd.supabase.co/', 'clave')).toEqual([]);
  });

  it('detecta variables faltantes', () => {
    expect(problemasConfiguracion(undefined, undefined)).toEqual([
      'Falta NEXT_PUBLIC_SUPABASE_URL.',
      'Falta NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    ]);
    expect(problemasConfiguracion('  ', 'clave')).toEqual(['Falta NEXT_PUBLIC_SUPABASE_URL.']);
  });

  it('detecta URLs mal escritas', () => {
    expect(problemasConfiguracion('abcd.supabase.co', 'clave')[0]).toMatch(/no es una URL válida/);
    expect(problemasConfiguracion('http://abcd.supabase.co', 'clave')[0]).toMatch(/https/);
    expect(problemasConfiguracion('https://abcd.supabase.co/rest/v1', 'clave')[0]).toMatch(/sin rutas/);
  });

  it('nunca incluye los valores en los mensajes', () => {
    const r = problemasConfiguracion('https://secreto.supabase.co/rest/v1', '');
    expect(r.join(' ')).not.toContain('secreto');
  });
});
