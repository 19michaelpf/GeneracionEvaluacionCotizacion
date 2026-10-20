import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Cliente, Parametros, ProductoVigente } from '@/lib/types';

/** Datos de referencia para el formulario de cotización. */
export async function cargarDatosFormulario() {
  const supabase = await createClient();
  const [clientes, productos, parametros] = await Promise.all([
    supabase.from('clientes').select('id, ruc, razon_social').order('razon_social')
      .overrideTypes<Pick<Cliente, 'id' | 'ruc' | 'razon_social'>[], { merge: false }>(),
    supabase.from('productos_vigentes').select('*').order('codigo').overrideTypes<ProductoVigente[], { merge: false }>(),
    supabase.from('parametros').select('igv_pct, umbral_descuento_pct, moneda, validez_dias_default').single<Parametros>(),
  ]);
  if (clientes.error || productos.error || parametros.error || !parametros.data) {
    throw new Error('No se pudieron cargar los datos del formulario');
  }
  return { clientes: clientes.data, productos: productos.data, parametros: parametros.data };
}
