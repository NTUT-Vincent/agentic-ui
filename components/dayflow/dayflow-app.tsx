"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { usePlacesQuery } from "@/hooks/use-places-query";
import { useWeatherQuery } from "@/hooks/use-weather-query";
import { getVisiblePlaces } from "@/lib/dayflow/state/selectors";
import { useDayFlowStore } from "@/lib/dayflow/state/store";
import { DayFlowHeader } from "./dayflow-header";
import { DayFlowFilters } from "./dayflow-filters";
import { DayFlowPlaceList } from "./dayflow-place-list";
import { DayFlowPlaceDetail } from "./dayflow-place-detail";
import { DayFlowPlan } from "./dayflow-plan";
import { DayFlowChat } from "./dayflow-chat";
import { StateActivity } from "./state-activity";
const DayFlowMap=dynamic(()=>import("./dayflow-map").then((m)=>m.DayFlowMap),{ssr:false});
function weatherLabel(code:number){if(code===0)return"Clear";if(code<=3)return"Cloudy";if(code<=67)return"Rain";if(code<=77)return"Snow";if(code<=82)return"Showers";return"Storm";}
export function DayFlowApp(){const state=useDayFlowStore((s)=>s.shared);const select=useDayFlowStore((s)=>s.selectPlace);const weather=useWeatherQuery(state.location.latitude,state.location.longitude);const places=usePlacesQuery(state.location.latitude,state.location.longitude,state.filters.radiusKm);const allPlaces=places.data??[];const visible=useMemo(()=>getVisiblePlaces(state,allPlaces),[state,allPlaces]);const selected=allPlaces.find((p)=>p.id===state.selection.placeId)??null;return <div className="dayflow-app"><DayFlowHeader/><main className="dayflow-main"><section className="dayflow-hero"><div><span className="dayflow-kicker">EXPLORE YOUR CITY</span><h1>What do you want to do today?</h1><p>{state.location.name}, {state.location.country}</p></div>{weather.data&&<div className="dayflow-weather"><strong>{Math.round(weather.data.temperatureC)}°C</strong><span>{weatherLabel(weather.data.weatherCode)}</span><small>Feels like {Math.round(weather.data.apparentTemperatureC)}° · Wind {Math.round(weather.data.windSpeedKmh)} km/h</small></div>}</section><DayFlowFilters/><section className={`dayflow-content view-${state.view.mode}`}>{state.view.mode!=="list"&&<div className="dayflow-map"><DayFlowMap latitude={state.location.latitude} longitude={state.location.longitude} places={visible} selectedPlaceId={state.selection.placeId} onSelect={select}/></div>}{state.view.mode!=="map"&&<DayFlowPlaceList places={visible} loading={places.isLoading}/>}</section><DayFlowPlan places={allPlaces}/></main><DayFlowPlaceDetail place={selected}/><StateActivity/><DayFlowChat weather={weather.data??null} visiblePlaces={visible}/></div>}
