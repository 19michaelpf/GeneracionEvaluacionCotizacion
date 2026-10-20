'use client';

import { useActionState } from 'react';
import { Campo } from '@/components/Campo';
import { registrarTarifa } from './actions';

export function TarifaForm({ productoId, hoy }: { productoId: string; hoy: string }) {
  const [estado, accion, pendiente] = useActionState(registrarTarifa.bind(null, productoId), {});
  const e = estado.campos ?? {};

  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <Campo etiqueta="Nuevo precio (S/, sin IGV)" name="precio" type="number" step="0.01" min="0.01" error={e.precio} required />
      <Campo etiqueta="Vigente desde" name="vigente_desde" type="date" defaultValue={hoy} error={e.vigente_desde} required />
      <button className="btn btn-primary" disabled={pendiente}>{pendiente ? 'Registrando…' : 'Registrar precio'}</button>
      {estado.error && <p className="w-full text-sm text-rose-600">{estado.error}</p>}
      {estado.ok && <p className="w-full text-sm text-emerald-700">Precio registrado.</p>}
    </form>
  );
}
