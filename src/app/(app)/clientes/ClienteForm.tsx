'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Campo } from '@/components/Campo';
import type { Cliente } from '@/lib/types';
import { guardarCliente } from './actions';

export function ClienteForm({ cliente }: { cliente?: Cliente }) {
  const [estado, accion, pendiente] = useActionState(guardarCliente.bind(null, cliente?.id ?? null), {});
  const e = estado.campos ?? {};

  return (
    <form action={accion} className="card grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="RUC" name="ruc" defaultValue={cliente?.ruc} error={e.ruc} inputMode="numeric" maxLength={11} required />
      <Campo etiqueta="Razón social" name="razon_social" defaultValue={cliente?.razon_social} error={e.razon_social} required />
      <Campo etiqueta="Contacto" name="contacto" defaultValue={cliente?.contacto ?? ''} error={e.contacto} />
      <Campo etiqueta="Correo" name="email" type="email" defaultValue={cliente?.email ?? ''} error={e.email} />
      <Campo etiqueta="Teléfono" name="telefono" defaultValue={cliente?.telefono ?? ''} error={e.telefono} />
      <Campo etiqueta="Dirección" name="direccion" defaultValue={cliente?.direccion ?? ''} error={e.direccion} />
      {estado.error && <p className="text-sm text-rose-600 sm:col-span-2">{estado.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar'}</button>
        <Link href="/clientes" className="btn">Cancelar</Link>
      </div>
    </form>
  );
}
