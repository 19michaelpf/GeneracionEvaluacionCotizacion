import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env, problemasConfiguracion } from '@/lib/env';

const RUTAS_PUBLICAS = ['/login'];

/** Página de error legible cuando falta configuración (muestra nombres de variables, nunca valores). */
function errorConfiguracion(problemas: string[]) {
  const items = problemas.map((p) => `<li>${p}</li>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configuración incompleta</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#0f172a">
<h1 style="font-size:20px">Configuración incompleta</h1>
<p>La aplicación no puede conectarse a Supabase:</p><ul>${items}</ul>
<p style="color:#475569">Configure las variables en Vercel (Settings &gt; Environment Variables) para el entorno Production
y vuelva a desplegar: las variables <code>NEXT_PUBLIC_*</code> se incorporan al compilar.</p>
</body></html>`;
  return new NextResponse(html, { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function middleware(request: NextRequest) {
  const problemas = problemasConfiguracion();
  if (problemas.length > 0) {
    console.error('Configuración de Supabase incompleta:', problemas.join(' '));
    return errorConfiguracion(problemas);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Refresca la sesión. No colocar código entre createServerClient y getUser.
  // Si Supabase no responde, se trata como sesión no iniciada en lugar de caer con 500.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    console.error('No se pudo verificar la sesión con Supabase', e);
  }

  const esPublica = RUTAS_PUBLICAS.some((r) => request.nextUrl.pathname.startsWith(r));
  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
