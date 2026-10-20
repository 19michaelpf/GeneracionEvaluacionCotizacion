'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requerirPerfil, ROLES_CATALOGO } from '@/lib/auth';
import { mensajeErrorBD } from '@/lib/errores';
import { createClient } from '@/lib/supabase/server';
import type { ResultadoAccion } from '@/lib/types';
import { erroresPorCampo, precioSchema, productoSchema, tarifaSchema } from '@/lib/validation/schemas';

function leerProducto(formData: FormData) {
  return productoSchema.safeParse({
    codigo: formData.get('codigo'),
    nombre: formData.get('nombre'),
    descripcion: formData.get('descripcion'),
    unidad: formData.get('unidad'),
    activo: formData.get('activo') === 'on',
  });
}

export async function crearProducto(_prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_CATALOGO);

  const producto = leerProducto(formData);
  const precio = precioSchema.safeParse(Number(formData.get('precio')));
  if (!producto.success || !precio.success) {
    return {
      error: 'Revise los datos del formulario',
      campos: {
        ...(producto.success ? {} : erroresPorCampo(producto.error)),
        ...(precio.success ? {} : { precio: precio.error.issues[0].message }),
      },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from('productos').insert(producto.data).select('id').single();
  if (error) return { error: mensajeErrorBD(error) };

  const { error: errorTarifa } = await supabase.from('tarifas').insert({ producto_id: data.id, precio: precio.data });
  if (errorTarifa) {
    revalidatePath('/productos');
    return { error: `Producto creado, pero no se registró el precio: ${mensajeErrorBD(errorTarifa)}` };
  }

  revalidatePath('/productos');
  redirect('/productos');
}

export async function actualizarProducto(id: string, _prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_CATALOGO);

  const producto = leerProducto(formData);
  if (!producto.success) return { error: 'Revise los datos del formulario', campos: erroresPorCampo(producto.error) };

  const supabase = await createClient();
  const { error } = await supabase.from('productos').update(producto.data).eq('id', id);
  if (error) return { error: mensajeErrorBD(error) };

  revalidatePath('/productos');
  redirect('/productos');
}

/** Registra un nuevo precio. Las tarifas anteriores se conservan como historial. */
export async function registrarTarifa(productoId: string, _prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  await requerirPerfil(ROLES_CATALOGO);

  const parsed = tarifaSchema.safeParse({
    precio: Number(formData.get('precio')),
    vigente_desde: formData.get('vigente_desde'),
  });
  if (!parsed.success) return { error: 'Revise los datos de la tarifa', campos: erroresPorCampo(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from('tarifas').insert({ producto_id: productoId, ...parsed.data });
  if (error) return { error: mensajeErrorBD(error) };

  revalidatePath(`/productos/${productoId}`);
  revalidatePath('/productos');
  return { ok: true };
}
