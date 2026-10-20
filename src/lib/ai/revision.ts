// Revisión de los textos redactados por IA: la IA no debe introducir cifras comerciales.
// Cualquier monto, porcentaje o número relevante se marca para que el asesor lo revise.

const PATRONES: { motivo: string; regex: RegExp }[] = [
  { motivo: 'menciona un monto o moneda', regex: /(S\/|US\$|\$|€|\bsoles?\b|\bd[oó]lares?\b|\bPEN\b|\bUSD\b)/i },
  { motivo: 'menciona un porcentaje', regex: /(\d+([.,]\d+)?\s*%|por\s*ciento)/i },
  { motivo: 'menciona un descuento', regex: /\bdescuentos?\b/i },
  { motivo: 'contiene cifras', regex: /\d{2,}|\d+[.,]\d+/ },
];

/** Devuelve advertencias legibles, una por fragmento con posibles cifras. */
export function detectarCifras(fragmentos: { campo: string; texto: string }[]): string[] {
  const advertencias: string[] = [];
  for (const { campo, texto } of fragmentos) {
    const motivos = PATRONES.filter((p) => p.regex.test(texto)).map((p) => p.motivo);
    if (motivos.length > 0) advertencias.push(`${campo}: ${motivos.join(', ')}. Verifique antes de validar.`);
  }
  return advertencias;
}
