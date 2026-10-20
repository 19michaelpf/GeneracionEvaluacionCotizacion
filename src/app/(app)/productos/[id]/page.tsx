import { notFound } from 'next/navigation';
import { requerirPerfil, ROLES_CATALOGO } from '@/lib/auth';
import { formatoFecha, formatoMoneda } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { ProductoVigente, Tarifa } from '@/lib/types';
import { ProductoForm } from '../ProductoForm';
import { TarifaForm } from '../TarifaForm';

export default async function EditarProductoPage({ params }: { params: Promise<{ id: string }> }) {
  await requerirPerfil(ROLES_CATALOGO);
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: producto }, { data: tarifas }] = await Promise.all([
    supabase.from('productos_vigentes').select('*').eq('id', id).maybeSingle<ProductoVigente>(),
    supabase
      .from('tarifas')
      .select('id, precio, vigente_desde, vigente_hasta, created_at')
      .eq('producto_id', id)
      .order('vigente_desde', { ascending: false })
      .order('created_at', { ascending: false })
      .overrideTypes<Tarifa[], { merge: false }>(),
  ]);
  if (!producto) notFound();

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Editar producto</h1>
      <ProductoForm producto={producto} />

      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">Precios</h2>
          <p className="text-sm text-slate-500">
            Precio vigente: {producto.precio_vigente != null ? formatoMoneda(producto.precio_vigente) : 'sin precio'}.
            Un nuevo precio no modifica las cotizaciones ya registradas.
          </p>
        </div>
        <TarifaForm productoId={producto.id} hoy={hoy} />
        <table className="tabla">
          <thead>
            <tr><th>Vigente desde</th><th>Vigente hasta</th><th className="text-right">Precio</th></tr>
          </thead>
          <tbody>
            {tarifas?.map((t) => (
              <tr key={t.id}>
                <td>{formatoFecha(t.vigente_desde)}</td>
                <td>{t.vigente_hasta ? formatoFecha(t.vigente_hasta) : '—'}</td>
                <td className="text-right">{formatoMoneda(t.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
