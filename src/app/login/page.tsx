'use client';

import { useActionState } from 'react';
import { iniciarSesion } from './actions';

export default function LoginPage() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, {});

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={accion} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Soluciones Industriales del Norte</h1>
          <p className="text-sm text-slate-500">Sistema de cotizaciones</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Correo</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Contraseña</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {estado.error && <p className="text-sm text-rose-600">{estado.error}</p>}
        <button className="btn btn-primary w-full" disabled={pendiente}>
          {pendiente ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
