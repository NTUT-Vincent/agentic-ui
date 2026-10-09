"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useGeocodeQuery } from "@/hooks/use-geocode-query";
import { useDayFlowStore } from "@/lib/dayflow/state/store";
import { GoogleAuth } from "./google-auth";
export function DayFlowHeader() {
  const location=useDayFlowStore((s)=>s.shared.location); const setLocationQuery=useDayFlowStore((s)=>s.setLocationQuery); const setResolvedLocation=useDayFlowStore((s)=>s.setResolvedLocation);
  const [input,setInput]=useState(location.query); const needsResolve=location.query!==location.name && location.query.trim().length>0; const geocode=useGeocodeQuery(location.query,needsResolve);
  useEffect(()=>{ const first=geocode.data?.[0]; if(first) setResolvedLocation({query:location.query,name:first.name,country:first.country,latitude:first.latitude,longitude:first.longitude}); },[geocode.data,location.query,setResolvedLocation]);
  useEffect(()=>setInput(location.name),[location.name]);
  function submit(e:FormEvent){e.preventDefault();setLocationQuery(input);}
  return <header className="dayflow-header"><div><strong className="dayflow-logo">DayFlow</strong><span>Your everyday city copilot</span></div><div className="dayflow-header-actions"><form className="dayflow-location" onSubmit={submit}><span>⌖</span><input value={input} onChange={(e)=>setInput(e.target.value)} aria-label="City"/><button type="submit">Search</button></form><Link href="/my-trips" className="dayflow-trips-link">My Trips</Link><GoogleAuth /></div></header>;
}
