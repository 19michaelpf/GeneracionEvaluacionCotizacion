import { notFound, redirect } from 'next/navigation';
import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Cotizacion, CotizacionItem } from '@/lib/types';
import { CotizacionForm } from '../../CotizacionForm';
import { cargarDatosFormulario } from '../../datos';

export default async function EditarCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await requerirPerfil(ROLES_COTIZAN);
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: cot }, { data: items }, datos] = await Promise.all([
    supabase.from('cotizaciones').select('*').eq('id', id).maybeSingle<Cotizacion>(),
    supabase.from('cotizacion_items').select('*').eq('cotizacion_id', id).order('orden').overrideTypes<CotizacionItem[], { merge: false }>(),
    cargarDatosFormulario(),
  ]);
  if (!cot) notFound();
  // Mismas reglas que la BD: solo el asesor dueño (o admin) y solo en borrador
  if (cot.estado !== 'borrador' || (cot.asesor_id !== perfil.id && perfil.rol !== 'admin')) {
    redirect(`/cotizaciones/${id}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Editar {cot.numero}</h1>
      <CotizacionForm
        {...datos}
        inicial={{
          id: cot.id,
          cliente_id: cot.cliente_id,
          solicitud: cot.solicitud,
          validez_dias: cot.validez_dias,
          descuento_global_pct: cot.descuento_global_pct,
          items: (items ?? []).map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad, descuento_pct: i.descuento_pct })),
        }}
      />
    </div>
  );
}
