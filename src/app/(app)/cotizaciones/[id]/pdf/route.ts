import { NextResponse, type NextRequest } from 'next/server';
import { obtenerPerfil } from '@/lib/auth';
import { BUCKET_PDF } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Descarga autorizada del PDF: comprueba la visibilidad de la cotización con la
 * sesión del usuario y redirige a una URL firmada de 60 segundos.
 * La firma también se pide con la sesión del usuario (política RLS del bucket).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const perfil = await obtenerPerfil();
  if (!perfil) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();
  const { data: cot } = await supabase
    .from('cotizaciones')
    .select('id, numero, pdf_version')
    .eq('id', id)
    .maybeSingle<{ id: string; numero: string; pdf_version: number }>();
  if (!cot || cot.pdf_version < 1) return NextResponse.json({ error: 'PDF no encontrado' }, { status: 404 });

  const v = Number(request.nextUrl.searchParams.get('v') ?? cot.pdf_version);
  if (!Number.isInteger(v) || v < 1 || v > cot.pdf_version) {
    return NextResponse.json({ error: 'Versión inválida' }, { status: 400 });
  }

  const descargar = request.nextUrl.searchParams.has('descargar');
  const { data, error } = await supabase.storage
    .from(BUCKET_PDF)
    .createSignedUrl(`${cot.id}/v${v}.pdf`, 60, descargar ? { download: `${cot.numero}-v${v}.pdf` } : undefined);
  if (error || !data) return NextResponse.json({ error: 'PDF no disponible' }, { status: 404 });

  return NextResponse.redirect(data.signedUrl);
}
