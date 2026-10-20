'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { calcularCotizacion } from '@/lib/calc/cotizacion';
import { formatoMoneda, formatoPct } from '@/lib/format';
import type { Cliente, Parametros, ProductoVigente, ResultadoAccion } from '@/lib/types';
import { guardarCotizacion } from './actions';

interface ItemForm {
  key: number;
  producto_id: string;
  cantidad: string;
  descuento_pct: string;
}

export interface CotizacionInicial {
  id: string;
  cliente_id: string;
  solicitud: string;
  validez_dias: number;
  descuento_global_pct: number;
  items: { producto_id: string; cantidad: number; descuento_pct: number }[];
}

interface Props {
  clientes: Pick<Cliente, 'id' | 'ruc' | 'razon_social'>[];
  productos: ProductoVigente[];
  parametros: Parametros;
  inicial?: CotizacionInicial;
}

let siguienteKey = 1;
const itemVacio = (): ItemForm => ({ key: siguienteKey++, producto_id: '', cantidad: '1', descuento_pct: '0' });
const aNumero = (v: string) => (v.trim() === '' ? NaN : Number(v));

export function CotizacionForm({ clientes, productos, parametros, inicial }: Props) {
  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? '');
  const [solicitud, setSolicitud] = useState(inicial?.solicitud ?? '');
  const [validez, setValidez] = useState(String(inicial?.validez_dias ?? parametros.validez_dias_default));
  const [descGlobal, setDescGlobal] = useState(String(inicial?.descuento_global_pct ?? 0));
  const [items, setItems] = useState<ItemForm[]>(
    inicial?.items.map((i) => ({
      key: siguienteKey++,
      producto_id: i.producto_id,
      cantidad: String(i.cantidad),
      descuento_pct: String(i.descuento_pct),
    })) ?? [itemVacio()],
  );
  const [resultado, setResultado] = useState<ResultadoAccion>({});
  const [pendiente, startTransition] = useTransition();

  const productoPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const seleccionables = productos.filter((p) => p.activo && p.precio_vigente != null);

  // Vista previa: solo con líneas completas y válidas. Los importes definitivos los calcula la BD.
  const calculo = useMemo(() => {
    const lineas = items.map((i) => {
      const precio = productoPorId.get(i.producto_id)?.precio_vigente ?? null;
      const cantidad = aNumero(i.cantidad);
      const descuento = aNumero(i.descuento_pct);
      const valida = precio != null && cantidad > 0 && descuento >= 0 && descuento <= 100;
      return valida ? { cantidad, precioUnitario: precio, descuentoPct: descuento } : null;
    });
    const g = aNumero(descGlobal);
    const r = calcularCotizacion({
      lineas: lineas.filter((l) => l !== null),
      descuentoGlobalPct: g >= 0 && g <= 100 ? g : 0,
      igvPct: parametros.igv_pct,
      umbralDescuentoPct: parametros.umbral_descuento_pct,
    });
    let idx = 0;
    return { ...r, porLinea: lineas.map((l) => (l ? r.lineas[idx++] : null)) };
  }, [items, descGlobal, productoPorId, parametros]);

  const actualizarItem = (key: number, cambios: Partial<ItemForm>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...cambios } : i)));

  function enviar() {
    const payload = {
      id: inicial?.id ?? null,
      cliente_id: clienteId,
      solicitud,
      validez_dias: aNumero(validez),
      descuento_global_pct: aNumero(descGlobal),
      items: items.map((i) => ({
        producto_id: i.producto_id,
        cantidad: aNumero(i.cantidad),
        descuento_pct: aNumero(i.descuento_pct),
      })),
    };
    startTransition(async () => {
      const r = await guardarCotizacion(payload);
      if (r) setResultado(r);
    });
  }

  const err = resultado.campos ?? {};

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      className="space-y-6"
    >
      <section className="card grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">1. Cliente y solicitud</h2>
        <div>
          <label className="label" htmlFor="cliente">Cliente</label>
          <select id="cliente" className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
            <option value="">Seleccione…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.razon_social} — {c.ruc}</option>
            ))}
          </select>
          {err.cliente_id && <p className="error-campo">{err.cliente_id}</p>}
          <Link href="/clientes/nuevo" className="mt-1 inline-block text-xs text-blue-700 hover:underline">
            + Registrar nuevo cliente
          </Link>
        </div>
        <div>
          <label className="label" htmlFor="validez">Validez de la oferta (días)</label>
          <input id="validez" className="input" type="number" min={1} max={90} step={1} value={validez} onChange={(e) => setValidez(e.target.value)} required />
          {err.validez_dias && <p className="error-campo">{err.validez_dias}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="solicitud">Descripción de la solicitud</label>
          <textarea id="solicitud" className="input min-h-24" value={solicitud} onChange={(e) => setSolicitud(e.target.value)} maxLength={2000} required />
          {err.solicitud && <p className="error-campo">{err.solicitud}</p>}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">2. Productos</h2>
        <div className="overflow-x-auto">
          <table className="tabla min-w-[760px]">
            <thead>
              <tr>
                <th className="w-[38%]">Producto</th>
                <th className="w-24">Cantidad</th>
                <th className="text-right">P. unitario</th>
                <th className="w-24">Desc. %</th>
                <th className="text-right">Importe</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const producto = productoPorId.get(item.producto_id);
                const linea = calculo.porLinea[i];
                return (
                  <tr key={item.key}>
                    <td>
                      <select className="input" value={item.producto_id} onChange={(e) => actualizarItem(item.key, { producto_id: e.target.value })} required>
                        <option value="">Seleccione…</option>
                        {producto && !seleccionables.includes(producto) && (
                          <option value={producto.id} disabled>{producto.codigo} — {producto.nombre} (no disponible)</option>
                        )}
                        {seleccionables.map((p) => (
                          <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                        ))}
                      </select>
                      {err[`items.${i}.producto_id`] && <p className="error-campo">{err[`items.${i}.producto_id`]}</p>}
                    </td>
                    <td>
                      <input className="input" type="number" min="0.01" step="0.01" value={item.cantidad} onChange={(e) => actualizarItem(item.key, { cantidad: e.target.value })} required />
                      {err[`items.${i}.cantidad`] && <p className="error-campo">{err[`items.${i}.cantidad`]}</p>}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {producto?.precio_vigente != null ? formatoMoneda(producto.precio_vigente) : '—'}
                      {producto && <div className="text-xs text-slate-500">por {producto.unidad}</div>}
                    </td>
                    <td>
                      <input className="input" type="number" min="0" max="100" step="0.01" value={item.descuento_pct} onChange={(e) => actualizarItem(item.key, { descuento_pct: e.target.value })} required />
                      {err[`items.${i}.descuento_pct`] && <p className="error-campo">{err[`items.${i}.descuento_pct`]}</p>}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {linea ? formatoMoneda(linea.importe) : '—'}
                      {linea && linea.descuentoEfectivoPct > parametros.umbral_descuento_pct && (
                        <div className="text-xs text-amber-700">Desc. efectivo {formatoPct(linea.descuentoEfectivoPct)}</div>
                      )}
                    </td>
                    <td className="text-right">
                      <button type="button" className="btn btn-danger" onClick={() => setItems((prev) => prev.filter((x) => x.key !== item.key))} disabled={items.length === 1} aria-label="Quitar ítem">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {err.items && <p className="error-campo">{err.items}</p>}
        <button type="button" className="btn" onClick={() => setItems((prev) => [...prev, itemVacio()])} disabled={items.length >= 100}>
          + Agregar ítem
        </button>
      </section>

      <section className="card grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-semibold">3. Descuento y totales</h2>
          <div className="max-w-48">
            <label className="label" htmlFor="desc-global">Descuento global %</label>
            <input id="desc-global" className="input" type="number" min="0" max="100" step="0.01" value={descGlobal} onChange={(e) => setDescGlobal(e.target.value)} required />
            {err.descuento_global_pct && <p className="error-campo">{err.descuento_global_pct}</p>}
          </div>
          {calculo.requiereAprobacion ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              El descuento efectivo máximo es {formatoPct(calculo.descuentoPctMax)} y supera el{' '}
              {formatoPct(parametros.umbral_descuento_pct)} permitido. Esta cotización necesitará aprobación de Finanzas.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Descuento efectivo máximo: {formatoPct(calculo.descuentoPctMax)} (límite sin aprobación: {formatoPct(parametros.umbral_descuento_pct)}).
            </p>
          )}
        </div>
        <dl className="space-y-1 text-sm sm:justify-self-end sm:min-w-72">
          <Fila etiqueta="Subtotal" valor={calculo.subtotal} />
          <Fila etiqueta="(−) Descuentos" valor={calculo.descuentoTotal} />
          <Fila etiqueta="Base imponible" valor={calculo.baseImponible} />
          <Fila etiqueta={`IGV (${formatoPct(parametros.igv_pct)})`} valor={calculo.igv} />
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatoMoneda(calculo.total)}</dd>
          </div>
          <p className="pt-1 text-xs text-slate-500">Vista previa. Los precios e importes definitivos se calculan al guardar.</p>
        </dl>
      </section>

      {resultado.error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{resultado.error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar borrador'}
        </button>
        <Link href={inicial ? `/cotizaciones/${inicial.id}` : '/cotizaciones'} className="btn">Cancelar</Link>
      </div>
    </form>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between gap-8">
      <dt className="text-slate-600">{etiqueta}</dt>
      <dd>{formatoMoneda(valor)}</dd>
    </div>
  );
}
