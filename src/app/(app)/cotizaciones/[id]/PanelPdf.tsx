'use client';

import { useState, useTransition } from 'react';
import type { ResultadoAccion } from '@/lib/types';
import { generarPdfCotizacion, validarCotizacion } from './pdf-actions';

interface Props {
  cotizacionId: string;
  pdfVersion: number;
  puedeGenerar: boolean;
  puedeValidar: boolean;
  validadaInfo: string | null;
  pdfDesactualizado: boolean;
}

export function PanelPdf({ cotizacionId, pdfVersion, puedeGenerar, puedeValidar, validadaInfo, pdfDesactualizado }: Props) {
  const [resultado, setResultado] = useState<ResultadoAccion>({});
  const [pendiente, startTransition] = useTransition();

  if (!puedeGenerar && !puedeValidar && pdfVersion === 0) return null;

  const ejecutar = (accion: () => Promise<ResultadoAccion>) =>
    startTransition(async () => setResultado(await accion()));

  const urlPdf = (v: number, descargar = false) =>
    `/cotizaciones/${cotizacionId}/pdf?v=${v}${descargar ? '&descargar' : ''}`;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Documento PDF</h2>
        {pdfVersion > 0 && (
          <>
            <a href={urlPdf(pdfVersion)} target="_blank" rel="noopener" className="btn">Ver PDF (v{pdfVersion})</a>
            <a href={urlPdf(pdfVersion, true)} className="btn">Descargar</a>
          </>
        )}
        {puedeGenerar && (
          <button className="btn btn-primary" disabled={pendiente} onClick={() => ejecutar(() => generarPdfCotizacion(cotizacionId))}>
            {pendiente ? 'Procesando…' : pdfVersion > 0 ? 'Regenerar PDF' : 'Generar PDF'}
          </button>
        )}
        {puedeValidar && (
          <button
            className="btn btn-primary"
            disabled={pendiente}
            onClick={() => {
              if (confirm(`¿Confirma que revisó el PDF v${pdfVersion} y que es correcto para enviar al cliente?`)) {
                ejecutar(() => validarCotizacion(cotizacionId));
              }
            }}
          >
            Validar cotización
          </button>
        )}
      </div>
      {puedeValidar && (
        <p className="text-sm text-slate-500">Revise el PDF antes de validarlo. Una vez validada, la cotización queda lista para enviarse.</p>
      )}
      {validadaInfo && <p className="text-sm text-indigo-700">{validadaInfo}</p>}
      {pdfVersion > 1 && (
        <p className="text-xs text-slate-500">
          Versiones anteriores:{' '}
          {Array.from({ length: pdfVersion - 1 }, (_, i) => pdfVersion - 1 - i).map((v, idx) => (
            <span key={v}>
              {idx > 0 && ', '}
              <a href={urlPdf(v)} target="_blank" rel="noopener" className="text-blue-700 hover:underline">v{v}</a>
            </span>
          ))}
        </p>
      )}
      {pdfDesactualizado && (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Los textos cambiaron después de generar el PDF. Regenérelo antes de validar.
        </p>
      )}
      {resultado.aviso && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">{resultado.aviso}</p>}
      {resultado.error && <p className="text-sm text-rose-600">{resultado.error}</p>}
    </section>
  );
}
