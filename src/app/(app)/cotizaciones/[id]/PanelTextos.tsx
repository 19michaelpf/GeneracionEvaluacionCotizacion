'use client';

import { useState, useTransition } from 'react';
import { formatoFechaHora } from '@/lib/format';
import type { TextosPdf } from '@/lib/pdf/textos';
import type { ResultadoAccion, TextosGuardados } from '@/lib/types';
import { guardarTextosManual, redactarConIA, type ResultadoRedaccion } from './textos-actions';

interface Props {
  cotizacionId: string;
  guardados: TextosGuardados | null;
  plantilla: TextosPdf;
  iaHabilitada: boolean;
  editable: boolean;
}

/** Textos libres del PDF: redacción con IA, revisión y edición por el asesor. */
export function PanelTextos({ cotizacionId, guardados, plantilla, iaHabilitada, editable }: Props) {
  const actuales = guardados ?? plantilla;
  const [editando, setEditando] = useState(false);
  const [presentacion, setPresentacion] = useState(actuales.presentacion);
  const [condiciones, setCondiciones] = useState(actuales.condiciones.join('\n'));
  const [cierre, setCierre] = useState(actuales.cierre);
  const [resultado, setResultado] = useState<ResultadoRedaccion & ResultadoAccion>({});
  const [pendiente, startTransition] = useTransition();

  const advertencias = resultado.advertencias ?? guardados?.advertencias ?? [];

  function redactar() {
    startTransition(async () => {
      const r = await redactarConIA(cotizacionId);
      setResultado(r);
      if (r.ok) setEditando(false);
    });
  }

  function guardar() {
    startTransition(async () => {
      const r = await guardarTextosManual(cotizacionId, {
        presentacion,
        condiciones: condiciones.split('\n'),
        cierre,
      });
      setResultado(r);
      if (r.ok) setEditando(false);
    });
  }

  function empezarEdicion() {
    setPresentacion(actuales.presentacion);
    setCondiciones(actuales.condiciones.join('\n'));
    setCierre(actuales.cierre);
    setResultado({});
    setEditando(true);
  }

  const origen = !guardados
    ? 'Plantilla estándar (aún sin redactar)'
    : guardados.origen === 'ia'
      ? `Redactado con IA · ${formatoFechaHora(guardados.actualizado_en)}`
      : `Editado por el asesor · ${formatoFechaHora(guardados.actualizado_en)}`;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="font-semibold">Textos de la cotización</h2>
          <p className="text-xs text-slate-500">{origen}. Precios y totales nunca los redacta la IA.</p>
        </div>
        {editable && !editando && (
          <>
            {iaHabilitada && (
              <button type="button" className="btn" disabled={pendiente} onClick={redactar}>
                {pendiente ? 'Redactando…' : guardados?.origen === 'ia' ? 'Volver a redactar con IA' : 'Redactar con IA'}
              </button>
            )}
            <button type="button" className="btn" disabled={pendiente} onClick={empezarEdicion}>Editar</button>
          </>
        )}
      </div>

      {advertencias.length > 0 && (
        <ul className="list-disc rounded-md bg-amber-50 py-2 pl-6 pr-3 text-sm text-amber-900">
          {advertencias.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}

      {editando ? (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="t-presentacion">Presentación</label>
            <textarea id="t-presentacion" className="input min-h-24" maxLength={1500} value={presentacion} onChange={(e) => setPresentacion(e.target.value)} />
            {resultado.campos?.presentacion && <p className="error-campo">{resultado.campos.presentacion}</p>}
          </div>
          <div>
            <label className="label" htmlFor="t-condiciones">Condiciones comerciales (una por línea, máximo 12)</label>
            <textarea id="t-condiciones" className="input min-h-32" value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
            {Object.entries(resultado.campos ?? {}).filter(([k]) => k.startsWith('condiciones')).slice(0, 1).map(([k, v]) => (
              <p key={k} className="error-campo">{v}</p>
            ))}
          </div>
          <div>
            <label className="label" htmlFor="t-cierre">Cierre</label>
            <textarea id="t-cierre" className="input min-h-16" maxLength={800} value={cierre} onChange={(e) => setCierre(e.target.value)} />
            {resultado.campos?.cierre && <p className="error-campo">{resultado.campos.cierre}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" disabled={pendiente} onClick={guardar}>
              {pendiente ? 'Guardando…' : 'Guardar textos'}
            </button>
            <button type="button" className="btn" disabled={pendiente} onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="whitespace-pre-line">{actuales.presentacion}</p>
          <ul className="list-disc pl-5 text-slate-700">
            {actuales.condiciones.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
          <p className="whitespace-pre-line">{actuales.cierre}</p>
        </div>
      )}

      {resultado.error && <p className="text-sm text-rose-600">{resultado.error}</p>}
    </section>
  );
}
