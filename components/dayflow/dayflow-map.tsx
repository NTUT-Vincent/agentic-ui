"use client";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { PlaceSummary } from "@/lib/dayflow/state/types";
function Recenter({ latitude, longitude }: { latitude:number; longitude:number }) { const map=useMap(); useEffect(()=>{map.setView([latitude,longitude],map.getZoom())},[latitude,longitude,map]); return null; }
export function DayFlowMap({latitude,longitude,places,selectedPlaceId,onSelect}:{latitude:number;longitude:number;places:PlaceSummary[];selectedPlaceId:string|null;onSelect:(id:string)=>void}){
  return <MapContainer center={[latitude,longitude]} zoom={14} scrollWheelZoom className="dayflow-map-canvas"><Recenter latitude={latitude} longitude={longitude}/><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{places.map((place)=><CircleMarker key={place.id} center={[place.latitude,place.longitude]} radius={selectedPlaceId===place.id?10:7} eventHandlers={{click:()=>onSelect(place.id)}}><Popup><strong>{place.name}</strong><br/>{place.category}<br/>{place.distanceMeters} m</Popup></CircleMarker>)}</MapContainer>
}
