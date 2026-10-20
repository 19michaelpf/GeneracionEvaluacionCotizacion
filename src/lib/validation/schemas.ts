import { z } from 'zod';

const dosDecimales = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

const texto = (max: number) => z.string().trim().max(max);
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const porcentajeSchema = z
  .number({ error: 'Ingrese un porcentaje' })
  .min(0, 'Mínimo 0 %')
  .max(100, 'Máximo 100 %')
  .refine(dosDecimales, 'Máximo 2 decimales');

// ---------- Clientes ----------
export const clienteSchema = z.object({
  ruc: z.string().trim().regex(/^\d{11}$/, 'El RUC debe tener 11 dígitos'),
  razon_social: texto(200).min(2, 'Ingrese la razón social'),
  contacto: textoOpcional(120),
  email: z
    .union([z.literal(''), z.email('Correo inválido').max(160)])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  telefono: textoOpcional(30),
  direccion: textoOpcional(250),
});
export type ClienteInput = z.infer<typeof clienteSchema>;

// ---------- Productos y tarifas ----------
export const productoSchema = z.object({
  codigo: texto(30).min(1, 'Ingrese el código').toUpperCase(),
  nombre: texto(200).min(2, 'Ingrese el nombre'),
  descripcion: textoOpcional(500),
  unidad: texto(10).min(1, 'Ingrese la unidad').toUpperCase(),
  activo: z.boolean(),
});
export type ProductoInput = z.infer<typeof productoSchema>;

export const precioSchema = z
  .number({ error: 'Ingrese el precio' })
  .positive('El precio debe ser mayor a 0')
  .max(9_999_999_999.99, 'Precio demasiado alto')
  .refine(dosDecimales, 'Máximo 2 decimales');

export const tarifaSchema = z.object({
  precio: precioSchema,
  vigente_desde: z.iso.date('Fecha inválida'),
});

// ---------- Cotizaciones ----------
// El precio NO forma parte de la entrada: la BD lo toma de la tarifa vigente.
export const cotizacionItemSchema = z.object({
  producto_id: z.uuid('Seleccione un producto'),
  cantidad: z
    .number({ error: 'Ingrese la cantidad' })
    .positive('La cantidad debe ser mayor a 0')
    .max(1_000_000, 'Cantidad demasiado alta')
    .refine(dosDecimales, 'Máximo 2 decimales'),
  descuento_pct: porcentajeSchema,
});

export const cotizacionSchema = z.object({
  id: z.uuid().nullable(),
  cliente_id: z.uuid('Seleccione un cliente'),
  solicitud: texto(2000).min(5, 'Describa la solicitud del cliente'),
  validez_dias: z.number().int('Debe ser un número entero').min(1, 'Mínimo 1 día').max(90, 'Máximo 90 días'),
  descuento_global_pct: porcentajeSchema,
  items: z.array(cotizacionItemSchema).min(1, 'Agregue al menos un ítem').max(100, 'Máximo 100 ítems'),
});
export type CotizacionInputForm = z.infer<typeof cotizacionSchema>;

/** Primer mensaje de error por campo (ruta unida con puntos). */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
