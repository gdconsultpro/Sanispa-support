export const signatureWidth = 640;
export const signatureHeight = 240;
export const maxSignatureStrokes = 24;
export const maxSignaturePoints = 1200;

export type SignaturePoint = [number, number];
export type SignatureStrokes = SignaturePoint[][];
export type CustomerSignature = { name: string; strokes: SignatureStrokes };

export function hasSignatureStroke(stroke: SignaturePoint[]) {
  const first = stroke[0];
  return Boolean(first && stroke.some(point => Math.hypot(point[0] - first[0], point[1] - first[1]) >= 8));
}
