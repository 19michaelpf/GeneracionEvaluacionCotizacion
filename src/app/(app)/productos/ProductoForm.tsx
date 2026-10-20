'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Campo } from '@/components/Campo';
import type { ProductoVigente } from '@/lib/types';
import { actualizarProducto, crearProducto } from './actions';

export function ProductoForm({ producto }: { producto?: ProductoVigente }) {
  const [estado, accion, pendiente] = useActionState(
    producto ? actualizarProducto.bind(null, producto.id) : crearProducto,
    {},
  );
  const e = estado.campos ?? {};

  return (
    <form action={accion} className="card grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Código" name="codigo" defaultValue={producto?.codigo} error={e.codigo} required />
      <Campo etiqueta="Unidad" name="unidad" defaultValue={producto?.unidad ?? 'UND'} error={e.unidad} required />
      <Campo etiqueta="Nombre" name="nombre" defaultValue={producto?.nombre} error={e.nombre} className="sm:col-span-2" required />
      <Campo etiqueta="Descripción" name="descripcion" defaultValue={producto?.descripcion ?? ''} error={e.descripcion} className="sm:col-span-2" />
      {!producto && (
        <Campo etiqueta="Precio (S/, sin IGV)" name="precio" type="number" step="0.01" min="0.01" error={e.precio} required />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activo" defaultChecked={producto?.activo ?? true} /> Activo
      </label>
      {estado.error && <p className="text-sm text-rose-600 sm:col-span-2">{estado.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar'}</button>
        <Link href="/productos" className="btn">Cancelar</Link>
      </div>
    </form>
  );
}
