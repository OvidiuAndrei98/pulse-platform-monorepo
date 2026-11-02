"use client";
import { useEffect, useRef, useState } from "react";
import { mountVectorMap, type VectorMapController, type VectorEventMapProps } from "@packages/browser-core/maps/vectorMap";
import "maplibre-gl/dist/maplibre-gl.css";
import "@packages/browser-core/maps/style.css";
export type { MapEvent, MapFocus, VectorEventMapProps } from "@packages/browser-core/maps/vectorMap";

export function VectorEventMap(props: VectorEventMapProps) {
  const host=useRef<HTMLDivElement>(null), latest=useRef(props), instance=useRef<VectorMapController|undefined>(undefined);
  latest.current=props;
  const [attempt,setAttempt]=useState(0),[failed,setFailed]=useState(false);
  useEffect(()=>{
    const scene=mountVectorMap(host.current!,()=>latest.current,setFailed);instance.current=scene;
    return()=>{scene?.dispose();instance.current=undefined;};
  },[attempt]);
  useEffect(()=>{instance.current?.viewport(props.center,props.zoom);},[props.center.latitude,props.center.longitude,props.zoom]);
  useEffect(()=>{instance.current?.render();},[props.events,props.selected,props.location]);
  useEffect(()=>{instance.current?.focus();},[props.focus?.id,props.focus?.revision]);
  useEffect(()=>{instance.current?.attribution(props.attributionBottom??0);},[props.attributionBottom,attempt]);
  return <>
    <div ref={host} data-testid="event-map" role="region" aria-label={props.label} className="spottr-vector-map"/>
    {failed&&<div role="status" className="spottr-map-error"><span>{props.errorLabel}</span><button type="button" onClick={()=>setAttempt(value=>value+1)}>{props.retryLabel}</button></div>}
  </>;
}
