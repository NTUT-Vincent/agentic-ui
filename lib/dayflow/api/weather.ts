import type { WeatherSummary } from "../state/types";
type Raw = {
  current: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
};
export async function getWeather(latitude: number, longitude: number): Promise<WeatherSummary> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m");
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", "auto");
  const response = await fetch(url, { next: { revalidate: 600 } });
  if (!response.ok) throw new Error(`Weather failed: ${response.status}`);
  const data = (await response.json()) as Raw;
  return {
    temperatureC: data.current.temperature_2m,
    apparentTemperatureC: data.current.apparent_temperature,
    windSpeedKmh: data.current.wind_speed_10m,
    weatherCode: data.current.weather_code,
    hourly: data.hourly.time.map((time, index) => ({
      time,
      temperatureC: data.hourly.temperature_2m[index],
      precipitationProbability: data.hourly.precipitation_probability[index],
      weatherCode: data.hourly.weather_code[index],
    })),
  };
}
