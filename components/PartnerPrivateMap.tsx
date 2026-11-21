"use client";

import { divIcon, latLngBounds, layerGroup, map, marker, polyline, tileLayer, type LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { partnerDirections, type PartnerMapPoint } from "@/lib/partner-planner";
import type { RouteLine } from "@/lib/partner-tour-routing";

const tiles = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png";

export default function PartnerPrivateMap({ points, label = "Carte de l’adresse", onAppointment, routeLines }: {
  points: PartnerMapPoint[]; label?: string; onAppointment?: (id: string) => void; routeLines?: RouteLine[];
}) {
  const element = useRef<HTMLDivElement>(null);
  const routeLayer = useRef<LayerGroup | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const instance = map(element.current, { scrollWheelZoom: false, minZoom: 3 });
    const groups = new Map<string, PartnerMapPoint[]>();
    for (const point of points) {
      const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
      const group = groups.get(key);
      if (group) group.push(point);
      else groups.set(key, [point]);
    }
    if (points.length) {
      const bounds = latLngBounds(points.map(point => [point.latitude, point.longitude]));
      instance.fitBounds(bounds, { maxZoom: 16, padding: [36, 36] });
    } else {
      instance.setView([46.6, 2.45], 5);
    }
    let loaded = false;
    tileLayer(tiles, {
      maxZoom: 19,
      referrerPolicy: "no-referrer",
      attribution: '© <a href="https://www.ign.fr/">IGN</a>',
    }).on("tileload", () => { loaded = true; }).on("load", () => setAvailable(loaded)).addTo(instance);
    routeLayer.current = layerGroup().addTo(instance);
    for (const group of groups.values()) {
      const first = group[0];
      const steps = group.flatMap(point => point.step ?? []);
      const title = group.length > 1
        ? steps.length ? "Étapes " + steps.join(", ") : `${group.length} interventions à cette adresse`
        : first.step ? `Étape ${first.step} · ${first.title}` : first.title;
      const pinLabel = steps.length
        ? steps.length > 3 ? `${steps[0]} +${steps.length - 1}` : steps.join("·")
        : group.length > 1 ? "+" + group.length : String(points.indexOf(first) + 1);
      const width = Math.max(36, pinLabel.length * 8 + 10);
      const pinColor = group.every(point => point.pending) ? "bg-amber-600" : "bg-sanispa-blue";
      const pin = marker([first.latitude, first.longitude], {
        icon: divIcon({
          className: `grid place-items-center rounded-full border-[3px] border-white ${pinColor} text-sm font-bold text-white shadow-lg`,
          html: pinLabel,
          iconSize: [width, 36],
          iconAnchor: [width / 2, 18],
          popupAnchor: [0, -16],
        }),
        title,
        alt: title,
      }).addTo(instance);
      if (group.length === 1 && !first.pending && onAppointment) {
        pin.on("click", () => onAppointment(first.id));
        continue;
      }
      pin.bindPopup(() => {
        const popup = document.createElement("div");
        popup.className = "grid gap-2";
        for (const point of group) {
          const item = document.createElement("div");
          const name = document.createElement("strong");
          name.textContent = point.step ? `${point.step}. ${point.title}` : point.title;
          item.append(name);
          if (point.detail) {
            const detail = document.createElement("div");
            detail.textContent = point.detail;
            item.append(detail);
          }
          if (point.address) {
            const address = document.createElement("a");
            address.href = partnerDirections(point.address);
            address.target = "_blank";
            address.rel = "noreferrer";
            address.textContent = point.address + " · Itinéraire";
            item.append(address);
          }
          if (!point.pending && onAppointment) {
            const choose = document.createElement("button");
            choose.type = "button";
            choose.className = "block min-h-11 text-left font-bold text-sanispa-blue underline";
            choose.textContent = "Interventions à proximité";
            choose.addEventListener("click", () => {
              pin.closePopup();
              onAppointment(point.id);
            });
            item.append(choose);
          }
          popup.append(item);
        }
        return popup;
      });
    }
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); routeLayer.current = null; };
  }, [points, onAppointment]);
  useEffect(() => {
    const layer = routeLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const line of routeLines ?? []) {
      const coordinates = line.map(([longitude, latitude]): [number, number] => [latitude, longitude]);
      polyline(coordinates, { color: "#fff", weight: 8, opacity: 0.95, interactive: false }).addTo(layer);
      polyline(coordinates, { color: "#096fd0", weight: 5, opacity: 0.92, interactive: false }).addTo(layer);
    }
  }, [points, onAppointment, routeLines]);

  return <>
    <div ref={element} role="region" aria-label={label} className="isolate h-72 w-full rounded-xl bg-sanispa-ice sm:h-96" />
    {available === false ? <p role="status" className="mt-2 text-sm">Le fond de carte est temporairement indisponible.</p> : null}
  </>;
}
