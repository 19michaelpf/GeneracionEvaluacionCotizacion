import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatoFecha, formatoMoneda, formatoNumero, formatoPct } from '@/lib/format';
import type { TextosPdf } from './textos';

export interface DatosPdf {
  empresa: {
    razon_social: string;
    ruc: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
  };
  numero: string;
  version: number;
  fechaEmision: string;
  validezDias: number;
  fechaVencimiento: string;
  cliente: {
    razon_social: string;
    ruc: string;
    contacto: string | null;
    email: string | null;
    telefono: string | null;
    direccion: string | null;
  };
  asesor: { nombre: string; email: string | null };
  solicitud: string;
  items: {
    orden: number;
    descripcion: string;
    unidad: string;
    cantidad: number;
    precio_unitario: number;
    descuento_pct: number;
    importe: number;
  }[];
  totales: {
    subtotal: number;
    descuento_total: number;
    descuento_global_pct: number;
    base_imponible: number;
    igv_pct: number;
    igv: number;
    total: number;
  };
  textos: TextosPdf;
}

const AZUL = '#1e3a8a';
const GRIS = '#64748b';

const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 48, fontSize: 9, fontFamily: 'Helvetica', color: '#0f172a', lineHeight: 1.35 },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: AZUL, paddingBottom: 10, marginBottom: 14 },
  empresa: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: AZUL },
  muted: { color: GRIS },
  cajaNumero: { alignItems: 'flex-end' },
  titulo: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  bloque: { marginBottom: 12 },
  dosCol: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  col: { flex: 1, padding: 8, backgroundColor: '#f1f5f9', borderRadius: 3 },
  etiqueta: { fontSize: 7, color: GRIS, textTransform: 'uppercase', marginBottom: 2 },
  negrita: { fontFamily: 'Helvetica-Bold' },
  tabla: { borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 10 },
  filaHead: { flexDirection: 'row', backgroundColor: AZUL, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  fila: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  celda: { padding: 4 },
  cN: { width: '5%' },
  cDesc: { width: '39%' },
  cCant: { width: '14%', textAlign: 'right' },
  cPU: { width: '15%', textAlign: 'right' },
  cDto: { width: '10%', textAlign: 'right' },
  cImp: { width: '17%', textAlign: 'right' },
  totales: { alignSelf: 'flex-end', width: '45%', marginBottom: 14 },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  total: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: AZUL, marginTop: 3, paddingTop: 4, fontSize: 11, fontFamily: 'Helvetica-Bold' },
  subtitulo: { fontFamily: 'Helvetica-Bold', color: AZUL, marginBottom: 4 },
  vineta: { flexDirection: 'row', marginBottom: 2 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 7, color: GRIS },
});

// La fuente estándar (WinAnsi) no incluye algunos espacios Unicode que usa Intl
const t = (v: string) => v.replace(/[  ]/g, ' ');
const m = (v: number) => t(formatoMoneda(v));

export function CotizacionPdf({ d }: { d: DatosPdf }) {
  const contactoEmpresa = [d.empresa.ruc && `RUC ${d.empresa.ruc}`, d.empresa.direccion, d.empresa.telefono, d.empresa.email]
    .filter(Boolean)
    .join(' · ');

  return (
    <Document title={`Cotización ${d.numero}`} author={d.empresa.razon_social} subject={`Cotización para ${d.cliente.razon_social}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View style={{ maxWidth: '65%' }}>
            <Text style={s.empresa}>{d.empresa.razon_social}</Text>
            {contactoEmpresa ? <Text style={s.muted}>{contactoEmpresa}</Text> : null}
          </View>
          <View style={s.cajaNumero}>
            <Text style={s.titulo}>COTIZACIÓN</Text>
            <Text style={s.negrita}>{d.numero}</Text>
            <Text style={s.muted}>Emisión: {formatoFecha(d.fechaEmision)}</Text>
            <Text style={s.muted}>Válida hasta: {formatoFecha(d.fechaVencimiento)}</Text>
          </View>
        </View>

        <View style={s.dosCol}>
          <View style={s.col}>
            <Text style={s.etiqueta}>Cliente</Text>
            <Text style={s.negrita}>{d.cliente.razon_social}</Text>
            <Text>RUC {d.cliente.ruc}</Text>
            {d.cliente.direccion ? <Text>{d.cliente.direccion}</Text> : null}
            {d.cliente.contacto ? <Text>Atención: {d.cliente.contacto}</Text> : null}
            {d.cliente.email || d.cliente.telefono ? (
              <Text>{[d.cliente.email, d.cliente.telefono].filter(Boolean).join(' · ')}</Text>
            ) : null}
          </View>
          <View style={s.col}>
            <Text style={s.etiqueta}>Asesor comercial</Text>
            <Text style={s.negrita}>{d.asesor.nombre}</Text>
            {d.asesor.email ? <Text>{d.asesor.email}</Text> : null}
            <Text style={[s.etiqueta, { marginTop: 6 }]}>Solicitud</Text>
            <Text>{d.solicitud}</Text>
          </View>
        </View>

        <View style={s.bloque}>
          <Text>{d.textos.presentacion}</Text>
        </View>

        <View style={s.tabla}>
          <View style={s.filaHead} fixed>
            <Text style={[s.celda, s.cN]}>#</Text>
            <Text style={[s.celda, s.cDesc]}>Descripción</Text>
            <Text style={[s.celda, s.cCant]}>Cantidad</Text>
            <Text style={[s.celda, s.cPU]}>P. unitario</Text>
            <Text style={[s.celda, s.cDto]}>Dscto.</Text>
            <Text style={[s.celda, s.cImp]}>Importe</Text>
          </View>
          {d.items.map((i) => (
            <View key={i.orden} style={s.fila} wrap={false}>
              <Text style={[s.celda, s.cN]}>{i.orden}</Text>
              <Text style={[s.celda, s.cDesc]}>{i.descripcion}</Text>
              <Text style={[s.celda, s.cCant]}>{t(formatoNumero(i.cantidad))} {i.unidad}</Text>
              <Text style={[s.celda, s.cPU]}>{m(i.precio_unitario)}</Text>
              <Text style={[s.celda, s.cDto]}>{i.descuento_pct > 0 ? t(formatoPct(i.descuento_pct)) : '-'}</Text>
              <Text style={[s.celda, s.cImp]}>{m(i.importe)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totales} wrap={false}>
          <View style={s.filaTotal}><Text>Subtotal</Text><Text>{m(d.totales.subtotal)}</Text></View>
          {d.totales.descuento_total > 0 ? (
            <View style={s.filaTotal}>
              <Text>
                Descuentos{d.totales.descuento_global_pct > 0 ? ` (incluye ${t(formatoPct(d.totales.descuento_global_pct))} global)` : ''}
              </Text>
              <Text>- {m(d.totales.descuento_total)}</Text>
            </View>
          ) : null}
          <View style={s.filaTotal}><Text>Valor de venta</Text><Text>{m(d.totales.base_imponible)}</Text></View>
          <View style={s.filaTotal}><Text>IGV ({t(formatoPct(d.totales.igv_pct))})</Text><Text>{m(d.totales.igv)}</Text></View>
          <View style={s.total}><Text>TOTAL</Text><Text>{m(d.totales.total)}</Text></View>
        </View>

        <View style={s.bloque} wrap={false}>
          <Text style={s.subtitulo}>Condiciones comerciales</Text>
          {d.textos.condiciones.map((c, idx) => (
            <View key={idx} style={s.vineta}>
              <Text style={{ width: 10 }}>•</Text>
              <Text style={{ flex: 1 }}>{c}</Text>
            </View>
          ))}
        </View>

        <View style={s.bloque} wrap={false}>
          <Text>{d.textos.cierre}</Text>
          <Text style={{ marginTop: 18 }}>Atentamente,</Text>
          <Text style={s.negrita}>{d.asesor.nombre}</Text>
          <Text style={s.muted}>{d.empresa.razon_social}</Text>
        </View>

        <Text style={s.footer} fixed>
          {d.numero} · versión {d.version} · {d.empresa.razon_social}
        </Text>
      </Page>
    </Document>
  );
}
