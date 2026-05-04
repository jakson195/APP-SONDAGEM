/** NSPT = N2 + N3 (standard SPT sum of second and third 6 in intervals). */
export function computeNspt(n2: number, n3: number): number {
  const a = Number.isFinite(n2) ? n2 : 0;
  const b = Number.isFinite(n3) ? n3 : 0;
  return a + b;
}

export function calcularNSPT(n1: number, n2: number, n3: number) {
  return n2 + n3;
}
