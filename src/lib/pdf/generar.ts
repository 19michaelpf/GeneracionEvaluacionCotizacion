import { renderToBuffer } from '@react-pdf/renderer';
import { CotizacionPdf, type DatosPdf } from './CotizacionPdf';

export async function generarPdf(datos: DatosPdf): Promise<Uint8Array> {
  const buffer = await renderToBuffer(CotizacionPdf({ d: datos }));
  return new Uint8Array(buffer);
}
