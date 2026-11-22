"use client";

import { useEffect, useId, useRef, type PointerEvent } from "react";
import { hasSignatureStroke, maxSignaturePoints, maxSignatureStrokes, signatureHeight, signatureWidth,
  type SignaturePoint, type SignatureStrokes } from "@/lib/partner-field-signature";

function drawStroke(ctx: CanvasRenderingContext2D, stroke: SignaturePoint[]) {
  if (stroke.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(...stroke[0]);
  for (const point of stroke.slice(1)) ctx.lineTo(...point);
  ctx.stroke();
}

export function CustomerSignaturePad({ strokes, onChange, disabled }: {
  strokes: SignatureStrokes; onChange: (strokes: SignatureStrokes) => void; disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<{ id: number; stroke: SignaturePoint[] } | null>(null);
  const helpId = useId();
  const recorded = strokes.reduce((total, stroke) => total + stroke.length, 0);

  function redraw(current: SignaturePoint[] = []) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, signatureWidth, signatureHeight);
    ctx.strokeStyle = "#163654";
    ctx.lineWidth = 3.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokes.forEach(stroke => drawStroke(ctx, stroke));
    drawStroke(ctx, current);
  }

  useEffect(() => { redraw(gesture.current?.stroke); });

  function coordinates(event: PointerEvent<HTMLCanvasElement>): SignaturePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.round(Math.min(signatureWidth, Math.max(0, (event.clientX - rect.left) * signatureWidth / rect.width))),
      Math.round(Math.min(signatureHeight, Math.max(0, (event.clientY - rect.top) * signatureHeight / rect.height))),
    ];
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || gesture.current || event.button !== 0 || strokes.length >= maxSignatureStrokes || recorded >= maxSignaturePoints - 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, stroke: [coordinates(event)] };
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const current = gesture.current;
    if (disabled || !current || current.id !== event.pointerId || current.stroke.length + recorded >= maxSignaturePoints) return;
    const point = coordinates(event);
    const last = current.stroke[current.stroke.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 2) return;
    current.stroke.push(point);
    redraw(current.stroke);
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (!disabled && hasSignatureStroke(current.stroke)) onChange([...strokes, current.stroke]);
    else redraw();
  }

  return <div>
    <p id={helpId} className="mb-2 text-sm">Signez du doigt dans le cadre pour confirmer que vous avez pris connaissance du compte rendu.</p>
    <canvas ref={canvas} width={signatureWidth} height={signatureHeight} aria-label="Zone de signature du client" aria-describedby={helpId}
      onPointerDown={start} onPointerMove={move} onPointerUp={event => { move(event); finish(event); }}
      onPointerCancel={finish} onLostPointerCapture={finish}
      className="block h-auto w-full touch-none select-none rounded-lg border border-sanispa-line bg-white" />
    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
      <p role="status" className="text-xs text-sanispa-steel">{strokes.length ? "Signature saisie" : "Cadre prêt à signer"}</p>
      <button type="button" disabled={disabled || !strokes.length} onClick={() => onChange([])}
        className="focus-ring min-h-11 text-sm font-bold text-sanispa-blue underline disabled:opacity-45">Effacer la signature</button>
    </div>
  </div>;
}
