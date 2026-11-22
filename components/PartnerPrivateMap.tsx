"use client";

import { divIcon, latLngBounds, layerGroup, map, marker, polyline, tileLayer, type LatLng, type LayerGroup, type Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { partnerDirections, type PartnerMapPoint } from "@/lib/partner-planner";
import type { RouteLine } from "@/lib/partner-tour-routing";

const tiles = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png";

export default function PartnerPrivateMap({ points, label = "Carte de l’adresse", onAppointment, routeLines, overview = false }: {
  points: PartnerMapPoint[]; label?: string; onAppointment?: (id: string) => void; routeLines?: RouteLine[]; overview?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const routeLayer = useRef<LayerGroup | null>(null);
  const openedPoint = useRef<string | null>(null);
  const lastViewport = useRef<{ center: LatLng; zoom: number } | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const instance = map(element.current, { scrollWheelZoom: false, minZoom: 2 });
    const reopenId = points.some(point => point.id === openedPoint.current) ? openedPoint.current : null;
    openedPoint.current = reopenId;
    let reopen: Marker | undefined;
    let disposing = false;
    const groups = new Map<string, PartnerMapPoint[]>();
    for (const point of points) {
      const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
      const group = groups.get(key);
      if (group) group.push(point);
      else groups.set(key, [point]);
    }
    const highlighted = points.find(point => point.highlighted);
    if (reopenId && lastViewport.current) {
      instance.setView(lastViewport.current.center, lastViewport.current.zoom, { animate: false });
    } else if (highlighted) {
      instance.setView([highlighted.latitude, highlighted.longitude], overview ? 12 : 14);
    } else if (points.length) {
      const bounds = latLngBounds(points.map(point => [point.latitude, point.longitude]));
      instance.fitBounds(bounds, { maxZoom: overview ? 13 : 16, padding: overview ? [50, 44] : [36, 36] });
      if (overview && groups.size > 1) instance.zoomOut(1, { animate: false });
    } else {
      instance.setView([46.6, 2.45], 5);
    }
    let loaded = false;
    tileLayer(tiles, {
      minZoom: 2,
      maxZoom: 19,
      referrerPolicy: "no-referrer",
      attribution: '© <a href="https://www.ign.fr/">IGN</a>',
    }).on("tileload", () => { loaded = true; }).on("load", () => setAvailable(loaded)).addTo(instance);
    routeLayer.current = layerGroup().addTo(instance);
    for (const group of groups.values()) {
      const first = group[0];
      const steps = group.flatMap(point => point.step ?? []);
      const highlighted = group.some(point => point.highlighted);
      const title = group.length > 1
        ? steps.length ? "Étapes " + steps.join(", ") : `${group.length} interventions à cette adresse`
        : first.step ? `Étape ${first.step} · ${first.title}` : first.title;
      const pinLabel = steps.length
        ? steps.length > 3 ? `${steps[0]} +${steps.length - 1}` : steps.join("·")
        : group.length > 1 ? "+" + group.length : String(points.indexOf(first) + 1);
      const width = Math.max(36, pinLabel.length * 8 + 10);
      const pinColor = group.every(point => point.pending) ? "bg-amber-600"
        : group.every(point => point.workStatus && !["pending", "scheduled", "due", "in_progress"].includes(point.workStatus)) ? "bg-emerald-700"
        : "bg-sanispa-blue";
      const pin = marker([first.latitude, first.longitude], {
        icon: divIcon({
          className: `grid place-items-center rounded-full border-[3px] border-white ${pinColor} text-sm font-bold text-white shadow-lg ${highlighted ? "ring-4 ring-sanispa-navy" : ""}`,
          html: pinLabel,
          iconSize: [width, 36],
          iconAnchor: [width / 2, 18],
          popupAnchor: [0, -16],
        }),
        title,
        alt: title,
        zIndexOffset: highlighted ? 1000 : 0,
      }).addTo(instance);
      if (group.length === 1 && (!first.workStatus || first.workStatus === "scheduled") && !first.pending && onAppointment) {
        pin.on("click", () => onAppointment(first.id));
      }
      pin.bindPopup(() => {
        const options = pin.getPopup()?.options;
        const size = instance.getSize();
        if (options) {
          const width = Math.max(110, Math.min(352, size.x - 72));
          options.minWidth = width;
          options.maxWidth = width;
          options.maxHeight = Math.max(100, Math.min(300, size.y - 96));
        }
        const popup = document.createElement("div");
        popup.className = "divide-y divide-sanispa-line";
        for (const point of group) {
          const item = document.createElement("div");
          item.className = "min-w-0 break-words py-2 first:pt-0 last:pb-0";
          const name = document.createElement("strong");
          name.className = "block text-base font-bold text-sanispa-navy";
          name.textContent = point.step ? `${point.step}. ${point.title}` : point.title;
          item.append(name);
          if (point.detail) {
            const detail = document.createElement("div");
            detail.className = "mt-0.5 text-xs text-sanispa-steel";
            detail.textContent = point.detail;
            item.append(detail);
          }
          const actions = document.createElement("div");
          actions.className = "flex flex-wrap gap-x-4 gap-y-1";
          if (point.address) {
            const location = document.createElement("div");
            location.className = "mt-1 text-sm";
            location.textContent = point.address;
            item.append(location);
            const address = document.createElement("a");
            address.href = partnerDirections(point.address);
            address.target = "_blank";
            address.rel = "noreferrer";
            address.className = "focus-ring inline-flex min-h-11 items-center text-sm font-bold underline";
            address.textContent = "Itinéraire";
            actions.append(address);
          }
          if (point.recordHref) {
            const link = document.createElement("a");
            link.href = point.recordHref;
            link.className = "focus-ring inline-flex min-h-11 items-center text-sm font-bold underline";
            link.textContent = "Ouvrir la fiche terrain";
            actions.append(link);
          }
          if ((!point.workStatus || point.workStatus === "scheduled") && !point.pending && onAppointment) {
            const choose = document.createElement("button");
            choose.type = "button";
            choose.className = "focus-ring min-h-11 text-left text-sm font-bold text-sanispa-blue underline";
            choose.textContent = "Interventions à proximité";
            choose.addEventListener("click", () => {
              pin.closePopup();
              onAppointment(point.id);
            });
            actions.append(choose);
          }
          if (actions.childElementCount) item.append(actions);
          popup.append(item);
        }
        return popup;
      }, { autoPanPadding: [14, 14] });
      pin.on("popupopen", () => {
        openedPoint.current = group.find(point => point.id === reopenId)?.id ?? first.id;
      }).on("popupclose", () => {
        if (!disposing && group.some(point => point.id === openedPoint.current)) openedPoint.current = null;
      });
      if (group.some(point => point.id === reopenId)) reopen = pin;
    }
    reopen?.openPopup();
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => {
      disposing = true;
      lastViewport.current = { center: instance.getCenter(), zoom: instance.getZoom() };
      observer.disconnect();
      instance.remove();
      routeLayer.current = null;
    };
  }, [points, onAppointment, overview]);
  useEffect(() => {
    const layer = routeLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const line of routeLines ?? []) {
      const coordinates = line.map(([longitude, latitude]): [number, number] => [latitude, longitude]);
      polyline(coordinates, { color: "#fff", weight: 8, opacity: 0.95, interactive: false }).addTo(layer);
      polyline(coordinates, { color: "#096fd0", weight: 5, opacity: 0.92, interactive: false }).addTo(layer);
    }
  }, [points, onAppointment, overview, routeLines]);

  return <>
    <div ref={element} role="region" aria-label={label} className="isolate h-72 w-full rounded-xl bg-sanispa-ice sm:h-96" />
    {available === false ? <p role="status" className="mt-2 text-sm">Le fond de carte est temporairement indisponible.</p> : null}
  </>;
}
