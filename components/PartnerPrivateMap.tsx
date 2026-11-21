"use client";

import { divIcon, latLngBounds, map, marker, tileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { partnerDirections, type PartnerMapPoint } from "@/lib/partner-planner";

const tiles = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png";

export default function PartnerPrivateMap({ points, label = "Carte de l’adresse" }: { points: PartnerMapPoint[]; label?: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!element.current || !points.length) return;
    const instance = map(element.current, { scrollWheelZoom: false, minZoom: 3 });
    const groups = new Map<string, PartnerMapPoint[]>();
    for (const point of points) {
      const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
      const group = groups.get(key);
      if (group) group.push(point);
      else groups.set(key, [point]);
    }
    const bounds = latLngBounds(points.map(point => [point.latitude, point.longitude]));
    instance.fitBounds(bounds, { maxZoom: 16, padding: [36, 36] });
    let loaded = false;
    tileLayer(tiles, {
      maxZoom: 19,
      referrerPolicy: "no-referrer",
      attribution: '© <a href="https://www.ign.fr/">IGN</a>',
    }).on("tileload", () => { loaded = true; }).on("load", () => setAvailable(loaded)).addTo(instance);
    for (const group of groups.values()) {
      const first = group[0];
      const title = group.length > 1 ? `${group.length} interventions à cette adresse` : first.title;
      marker([first.latitude, first.longitude], {
        icon: divIcon({
          className: "grid place-items-center rounded-full border-[3px] border-white bg-sanispa-blue text-sm font-bold text-white shadow-lg",
          html: group.length > 1 ? "+" + group.length : String(points.indexOf(first) + 1),
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -16],
        }),
        title,
        alt: title,
      }).bindPopup(() => {
        const popup = document.createElement("div");
        popup.className = "grid gap-2";
        for (const point of group) {
          const item = document.createElement("div");
          const name = document.createElement("strong");
          name.textContent = point.title;
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
          popup.append(item);
        }
        return popup;
      }).addTo(instance);
    }
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); };
  }, [points]);

  return <>
    <div ref={element} role="region" aria-label={label} className="isolate h-72 w-full rounded-xl bg-sanispa-ice sm:h-96" />
    {available === false ? <p role="status" className="mt-2 text-sm">Le fond de carte est indisponible. L’adresse et l’itinéraire restent accessibles ci-dessous.</p> : null}
  </>;
}
