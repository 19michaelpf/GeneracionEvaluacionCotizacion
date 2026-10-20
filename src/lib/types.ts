export type Rol = 'asesor' | 'finanzas' | 'admin';

export type EstadoCotizacion =
  | 'borrador'
  | 'pendiente_aprobacion'
  | 'aprobada'
  | 'generada'
  | 'validada'
  | 'enviada'
  | 'aceptada'
  | 'rechazada_cliente'
  | 'vencida';

export interface Perfil {
  id: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  activo: boolean;
}

export interface Parametros {
  igv_pct: number;
  umbral_descuento_pct: number;
  moneda: string;
  validez_dias_default: number;
}

export interface Cliente {
  id: string;
  ruc: string;
  razon_social: string;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
}

export interface ProductoVigente {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  unidad: string;
  activo: boolean;
  precio_vigente: number | null;
}

export interface Tarifa {
  id: string;
  precio: number;
  vigente_desde: string;
  vigente_hasta: string | null;
  created_at: string;
}

export interface CotizacionItem {
  id: string;
  orden: number;
  producto_id: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  importe_bruto: number;
  descuento_monto: number;
  importe: number;
}

export interface Cotizacion {
  id: string;
  numero: string;
  cliente_id: string;
  asesor_id: string;
  solicitud: string;
  moneda: string;
  fecha_emision: string;
  validez_dias: number;
  descuento_global_pct: number;
  igv_pct: number;
  subtotal: number;
  descuento_total: number;
  base_imponible: number;
  igv: number;
  total: number;
  descuento_pct_max: number;
  requiere_aprobacion: boolean;
  estado: EstadoCotizacion;
  pdf_path: string | null;
  pdf_version: number;
  pdf_desactualizado: boolean;
  textos_ia: TextosGuardados | null;
  validada_por: string | null;
  validada_en: string | null;
  envio_medio: string | null;
  envio_destinatario: string | null;
  enviada_en: string | null;
  created_at: string;
  updated_at: string;
}

export interface CotizacionEvento {
  id: number;
  accion: string;
  estado_anterior: EstadoCotizacion | null;
  estado_nuevo: EstadoCotizacion | null;
  detalle: Record<string, unknown> | null;
  created_at: string;
  usuario_id: string | null;
}

/** Contenido de cotizaciones.textos_ia (ver public.guardar_textos). */
export interface TextosGuardados {
  presentacion: string;
  condiciones: string[];
  cierre: string;
  advertencias?: string[];
  modelo?: string | null;
  origen: 'ia' | 'manual';
  actualizado_en: string;
}

export type EstadoAprobacion = 'pendiente' | 'aprobada' | 'rechazada' | 'anulada';

export interface Aprobacion {
  id: string;
  cotizacion_id: string;
  descuento_pct: number;
  total: number;
  estado: EstadoAprobacion;
  solicitado_por: string;
  solicitado_en: string;
  resuelto_por: string | null;
  resuelto_en: string | null;
  comentario: string | null;
  comentario_resolucion: string | null;
}

/** Resultado estándar de las Server Actions de formularios. */
export interface ResultadoAccion {
  error?: string;
  campos?: Record<string, string>;
  ok?: boolean;
  /** Mensaje informativo cuando la acción se completó con observaciones. */
  aviso?: string;
}
