"use client";

import { divIcon, map, marker, tileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

const tiles = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png";

export default function PartnerPrivateMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const element = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const position = { lat: latitude, lng: longitude };
    const instance = map(element.current, { scrollWheelZoom: false, minZoom: 3 }).setView(position, 16);
    let loaded = false;
    tileLayer(tiles, {
      maxZoom: 19,
      referrerPolicy: "no-referrer",
      attribution: '© <a href="https://www.ign.fr/">IGN</a>',
    }).on("tileload", () => { loaded = true; }).on("load", () => setAvailable(loaded)).addTo(instance);
    marker(position, {
      icon: divIcon({
        className: "rounded-full border-[3px] border-white bg-sanispa-blue shadow-lg",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
      title: "Adresse de l’intervention",
      alt: "Adresse de l’intervention",
    }).addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); };
  }, [latitude, longitude]);

  return <>
    <div ref={element} role="region" aria-label="Carte de l’adresse" className="isolate h-72 w-full rounded-xl bg-sanispa-ice sm:h-96" />
    {available === false ? <p role="status" className="mt-2 text-sm">Le fond de carte est indisponible. L’adresse et l’itinéraire restent accessibles ci-dessous.</p> : null}
  </>;
}
