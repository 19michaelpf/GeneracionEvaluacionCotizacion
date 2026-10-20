import { describe, expect, it } from 'vitest';
import { accionesDisponibles } from './estados';
import type { EstadoCotizacion, Rol } from './types';

const asesor = { id: 'a', rol: 'asesor' as Rol };
const otroAsesor = { id: 'b', rol: 'asesor' as Rol };
const finanzas = { id: 'f', rol: 'finanzas' as Rol };
const admin = { id: 'x', rol: 'admin' as Rol };

const cot = (estado: EstadoCotizacion, requiere_aprobacion = true) => ({ estado, asesor_id: 'a', requiere_aprobacion });

describe('accionesDisponibles', () => {
  it('el asesor dueño edita y solicita aprobación en borrador, pero no genera PDF sin aprobación', () => {
    expect(accionesDisponibles(cot('borrador'), asesor)).toEqual({
      editar: true, solicitarAprobacion: true, resolverAprobacion: false, reabrir: false, generarPdf: false, validar: false,
      editarTextos: true, registrarEnvio: false, registrarRespuesta: false, registrarSeguimiento: false,
    });
  });

  it('envío y seguimiento', () => {
    expect(accionesDisponibles(cot('validada'), asesor)).toMatchObject({ registrarEnvio: true, registrarRespuesta: false });
    expect(accionesDisponibles(cot('enviada'), asesor)).toMatchObject({
      registrarEnvio: false, registrarRespuesta: true, registrarSeguimiento: true, reabrir: true,
    });
    expect(accionesDisponibles(cot('vencida'), asesor)).toMatchObject({ reabrir: true, registrarRespuesta: false });
    for (const e of ['aceptada', 'rechazada_cliente'] as const) {
      expect(accionesDisponibles(cot(e), asesor)).toMatchObject({ reabrir: false, registrarSeguimiento: true, editar: false });
    }
    expect(accionesDisponibles(cot('enviada'), finanzas).registrarRespuesta).toBe(false);
  });

  it('los textos se editan hasta antes de validar, y un PDF desactualizado no se valida', () => {
    expect(accionesDisponibles(cot('pendiente_aprobacion'), asesor).editarTextos).toBe(false);
    expect(accionesDisponibles(cot('aprobada'), asesor).editarTextos).toBe(true);
    expect(accionesDisponibles(cot('validada'), asesor).editarTextos).toBe(false);
    expect(accionesDisponibles({ ...cot('generada'), pdf_desactualizado: true }, asesor)).toMatchObject({
      validar: false, generarPdf: true, editarTextos: true,
    });
  });

  it('sin descuento alto: no solicita aprobación y puede generar el PDF desde borrador', () => {
    expect(accionesDisponibles(cot('borrador', false), asesor)).toMatchObject({ solicitarAprobacion: false, generarPdf: true });
  });

  it('otro asesor no puede hacer nada en ningún estado', () => {
    for (const e of ['borrador', 'pendiente_aprobacion', 'aprobada', 'generada', 'validada', 'enviada', 'vencida'] as const) {
      expect(Object.values(accionesDisponibles(cot(e), otroAsesor)).some(Boolean)).toBe(false);
    }
  });

  it('solo Finanzas resuelve, y solo si está pendiente', () => {
    expect(accionesDisponibles(cot('pendiente_aprobacion'), finanzas).resolverAprobacion).toBe(true);
    expect(accionesDisponibles(cot('pendiente_aprobacion'), admin).resolverAprobacion).toBe(false);
    expect(accionesDisponibles(cot('pendiente_aprobacion'), asesor).resolverAprobacion).toBe(false);
    expect(accionesDisponibles(cot('aprobada'), finanzas).resolverAprobacion).toBe(false);
  });

  it('mientras espera aprobación no se genera PDF', () => {
    expect(accionesDisponibles(cot('pendiente_aprobacion'), asesor).generarPdf).toBe(false);
  });

  it('aprobada: genera PDF; generada: regenera y valida; validada: solo reabrir', () => {
    expect(accionesDisponibles(cot('aprobada'), asesor)).toMatchObject({ generarPdf: true, validar: false, editar: false });
    expect(accionesDisponibles(cot('generada'), asesor)).toMatchObject({ generarPdf: true, validar: true });
    expect(accionesDisponibles(cot('validada'), asesor)).toMatchObject({ generarPdf: false, validar: false, reabrir: true });
  });

  it('el dueño o admin reabren desde pendiente, aprobada, generada o validada', () => {
    for (const e of ['pendiente_aprobacion', 'aprobada', 'generada', 'validada'] as const) {
      expect(accionesDisponibles(cot(e), asesor)).toMatchObject({ reabrir: true, editar: false });
      expect(accionesDisponibles(cot(e), admin).reabrir).toBe(true);
    }
    expect(accionesDisponibles(cot('borrador'), asesor).reabrir).toBe(false);
  });
});
