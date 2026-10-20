import { z } from 'zod';
import { formatoFecha } from '@/lib/format';

/**
 * Textos libres del PDF. Son lo ÚNICO que puede redactarse con IA (Etapa 4):
 * precios, cantidades, descuentos y totales siempre salen de la base de datos.
 */
export const textosPdfSchema = z.object({
  presentacion: z.string().trim().min(1).max(1500),
  condiciones: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
  cierre: z.string().trim().min(1).max(800),
});
export type TextosPdf = z.infer<typeof textosPdfSchema>;

/** Suma días a una fecha 'AAAA-MM-DD' sin depender de la zona horaria. */
export function sumarDias(fechaIso: string, dias: number): string {
  const [a, m, d] = fechaIso.slice(0, 10).split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d + dias));
  return fecha.toISOString().slice(0, 10);
}

/** Condiciones que siempre figuran, se usen o no textos redactados con IA. */
export function condicionesObligatorias(p: { validezDias: number; fechaVencimiento: string }): string[] {
  return [
    'Precios expresados en soles (PEN). El total incluye IGV.',
    `Validez de la oferta: ${p.validezDias} días calendario (hasta el ${formatoFecha(p.fechaVencimiento)}).`,
  ];
}

export function textosPorDefecto(p: { cliente: string; validezDias: number; fechaVencimiento: string }): TextosPdf {
  return {
    presentacion:
      `Señores ${p.cliente}:\n` +
      'En atención a su solicitud, tenemos el agrado de presentarles nuestra propuesta comercial, ' +
      'detallada a continuación.',
    condiciones: [
      ...condicionesObligatorias(p),
      'Forma de pago y plazo de entrega: a coordinar con su asesor comercial.',
      'Precios sujetos a disponibilidad de stock al momento de recibir la orden de compra.',
    ],
    cierre: 'Quedamos atentos a sus comentarios y a cualquier consulta adicional.',
  };
}

/** Usa los textos guardados si son válidos; si no, la plantilla por defecto. */
export function resolverTextos(guardados: unknown, porDefecto: TextosPdf): TextosPdf {
  const r = textosPdfSchema.safeParse(guardados);
  return r.success ? r.data : porDefecto;
}
