"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import Image from "next/image";

import { fetchWeather } from "./actions";
import { analytics } from "@/lib/firebase";
import { logEvent } from "firebase/analytics";

type WeatherState = "idle" | "loading" | "found" | "not-found";
type Unit = "C" | "F";
type ActiveTab = "overview" | "aqi" | "hourly" | "daily" | "sun";

interface AirQualityData {
  aqi: number;
  co: number;
  no2: number;
  o3: number;
  so2: number;
  pm2_5: number;
  pm10: number;
}

interface WeatherData {
  cityName: string;
  country: string;
  temp: number; // in Celsius
  tempMin: number;
  tempMax: number;
  feelsLike: number;
  description: string;
  humidity: number;
  windSpeed: number; // km/h
  windDeg?: number;
  windGust?: number;
  pressure: number; // hPa
  visibility: number; // km
  clouds: number; // %
  sunrise: number; // unix timestamp
  sunset: number; // unix timestamp
  timezone: number; // offset in seconds
  condition: string;
  coord?: { lat: number; lon: number };
}

interface HourlyItem {
  time: string;
  temp: number;
  condition: string;
  description: string;
  pop: number; // %
}

interface DailyItem {
  day: string;
  date: string;
  tempMin: number;
  tempMax: number;
  condition: string;
  description: string;
}

/* ─────────────────────────────────────────
   Per-condition config: image + bg gradient
───────────────────────────────────────── */
const conditionConfig: Record<
  string,
  { image: string; from: string; via: string; to: string }
> = {
  Clear: {
    image: "/images/clear.png",
    from: "from-amber-400",
    via: "via-orange-300",
    to: "to-sky-500",
  },
  Rain: {
    image: "/images/rain.png",
    from: "from-slate-700",
    via: "via-blue-800",
    to: "to-indigo-900",
  },
  Drizzle: {
    image: "/images/rain.png",
    from: "from-slate-600",
    via: "via-blue-700",
    to: "to-indigo-900",
  },
  Thunderstorm: {
    image: "/images/rain.png",
    from: "from-gray-900",
    via: "via-indigo-950",
    to: "to-purple-900",
  },
  Snow: {
    image: "/images/snow.png",
    from: "from-sky-200",
    via: "via-blue-300",
    to: "to-indigo-500",
  },
  Clouds: {
    image: "/images/cloud.png",
    from: "from-slate-500",
    via: "via-gray-600",
    to: "to-slate-700",
  },
  Haze: {
    image: "/images/mist.png",
    from: "from-gray-400",
    via: "via-slate-500",
    to: "to-gray-600",
  },
  Mist: {
    image: "/images/mist.png",
    from: "from-gray-400",
    via: "via-slate-500",
    to: "to-gray-600",
  },
  Fog: {
    image: "/images/mist.png",
    from: "from-gray-400",
    via: "via-slate-500",
    to: "to-gray-600",
  },
};

const defaultConfig = {
  image: "/images/clear.png",
  from: "from-sky-500",
  via: "via-blue-600",
  to: "to-indigo-700",
};

function getCfg(condition: string) {
  return conditionConfig[condition] ?? defaultConfig;
}

function getConditionImage(condition: string): string {
  return getCfg(condition).image;
}

/* ═══════════════════════════════════════════
   Formatters & Helpers
═══════════════════════════════════════════ */
function toUnit(celsius: number, unit: Unit): number {
  return unit === "C" ? celsius : Math.round((celsius * 9) / 5 + 32);
}

function getWindDirection(deg?: number): string {
  if (deg === undefined) return "N/A";
  const directions = [
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW"
  ];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}

function formatSunTime(timestamp: number, timezoneSec: number): string {
  if (!timestamp) return "--:--";
  const date = new Date((timestamp + timezoneSec) * 1000);
  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function formatCityLocalTime(timezoneSec: number): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const cityDate = new Date(utcMs + timezoneSec * 1000);
  return cityDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getHumidityCategory(val: number): string {
  if (val < 30) return "Dry & Crisp";
  if (val <= 60) return "Optimal Comfort";
  if (val <= 80) return "Moderate Humidity";
  return "High Humidity";
}

function getVisibilityCategory(valKm: number): string {
  if (valKm >= 10) return "Excellent (Clear)";
  if (valKm >= 6) return "Good Visibility";
  if (valKm >= 2) return "Moderate Haze";
  return "Dense Fog / Low";
}

function getCloudCategory(all: number): string {
  if (all <= 10) return "Clear Sky";
  if (all <= 40) return "Partly Cloudy";
  if (all <= 75) return "Broken Clouds";
  return "Overcast";
}

/* ═══════════════════════════════════════════
   Animated temperature counter
═══════════════════════════════════════════ */
function AnimatedTemp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    let start: number | null = null;
    const from = display;
    const to = value;
    const duration = 600; // ms

    function step(ts: number) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display}</>;
}

/* ═══════════════════════════════════════════
   SVG Icons
═══════════════════════════════════════════ */
function IconLocation({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={`w-3.5 h-4 fill-white/80 shrink-0 ${className}`}>
      <path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 512 512" className="w-4 h-4 fill-white relative z-10">
      <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg className="animate-spin w-4 h-4 relative z-10" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function IconDrop() {
  return (
    <svg viewBox="0 0 384 512" className="w-5 h-5 fill-sky-300">
      <path d="M192 512C86 512 0 426 0 320C0 228.8 130.2 57.7 166.6 11.7C172.6 4.2 181.5 0 191 0l1.9 0c9.5 0 18.4 4.2 24.4 11.7C254.2 57.7 384 228.8 384 320c0 106-86 192-192 192z" />
    </svg>
  );
}

function IconWind() {
  return (
    <svg viewBox="0 0 512 512" className="w-5 h-5 fill-cyan-300">
      <path d="M288 32c0 17.7 14.3 32 32 32l32 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128c-17.7 0-32 14.3-32 32s14.3 32 32 32l320 0c53 0 96-43 96-96s-43-96-96-96L320 0c-17.7 0-32 14.3-32 32zm64 352c0 17.7 14.3 32 32 32l32 0c53 0 96-43 96-96s-43-96-96-96l-192 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0c-17.7 0-32 14.3-32 32zM128 512l32 0c53 0 96-43 96-96s-43-96-96-96L32 320c-17.7 0-32 14.3-32 32s14.3 32 32 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0c-17.7 0-32 14.3-32 32z" />
    </svg>
  );
}

function IconThermometer() {
  return (
    <svg viewBox="0 0 320 512" className="w-4 h-4 fill-amber-300">
      <path d="M160 64c-26.5 0-48 21.5-48 48l0 164.5c0 17.3-7.1 31.9-15.3 42.5C86.2 332.6 80 349.5 80 368c0 44.2 35.8 80 80 80s80-35.8 80-80c0-18.5-6.2-35.4-16.7-48.9c-8.2-10.6-15.3-25.2-15.3-42.5L208 112c0-26.5-21.5-48-48-48zM48 112C48 50.2 98.1 0 160 0s112 50.1 112 112l0 164.4c0 .1 .1 .3 .2 .6c.2 .6 .8 1.6 1.7 2.8C290.3 301.4 304 332.8 304 368c0 79.5-64.5 144-144 144S16 447.5 16 368c0-35.2 13.7-66.6 30.1-88.2c1-1.3 1.5-2.3 1.7-2.8c.1-.3 .2-.5 .2-.6L48 112z" />
    </svg>
  );
}

function IconGauge() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-purple-300 stroke-2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12l3-3m-3 3a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-emerald-300 stroke-2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconCloudCover() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-blue-200 stroke-2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
    </svg>
  );
}

function IconSunrise() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-amber-400 stroke-2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4m-7 5H3m18 0h-2m-2.93-4.93l-1.414 1.414M7.344 8.484L5.93 7.07M12 11a5 5 0 00-5 5h10a5 5 0 00-5-5zM4 20h16" />
    </svg>
  );
}

function IconSunset() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-rose-400 stroke-2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v4m-7 1H3m18 0h-2m-2.93-2.93l-1.414 1.414M7.344 10.484L5.93 9.07M12 13a5 5 0 00-5 5h10a5 5 0 00-5-5zM4 21h16" />
    </svg>
  );
}

function IconCompass() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-teal-300 stroke-2">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

function IconLeaf({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-none stroke-emerald-300 stroke-2`}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 01-9-9c0-4.97 4.03-9 9-9 0 0 9 0 9 9 0 4.97-4.03 9-9 9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12c4 0 7 2 9 9" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-sky-300 stroke-2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function IconWindow() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-teal-300 stroke-2">
      <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="3" x2="12" y2="21" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMask() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-amber-300 stroke-2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10c0-1.5 2-3 8-3s8 1.5 8 3v4c0 3-3 6-8 6s-8-3-8-6v-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 11H2m18 0h2m-2 3h2M4 14H2" />
    </svg>
  );
}

function IconShieldAlert() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-rose-300 stroke-2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

interface AqiInfo {
  label: string;
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  summary: string;
  outdoorAdvice: string;
  ventilationAdvice: string;
  maskAdvice: string;
  vulnerableAdvice: string;
}

function getAqiInfo(aqi: number): AqiInfo {
  switch (aqi) {
    case 1:
      return {
        label: "Good",
        badgeBg: "bg-emerald-500/20",
        badgeBorder: "border-emerald-500/40",
        textColor: "text-emerald-300",
        summary: "Air quality is satisfactory and poses little to no health risk.",
        outdoorAdvice: "Ideal conditions for outdoor sports, jogging, and walking.",
        ventilationAdvice: "Great time to open windows and let fresh air into your home.",
        maskAdvice: "No mask required for general public or sensitive groups.",
        vulnerableAdvice: "Safe for children, elderly, and respiratory patients.",
      };
    case 2:
      return {
        label: "Fair",
        badgeBg: "bg-lime-500/20",
        badgeBorder: "border-lime-500/40",
        textColor: "text-lime-300",
        summary: "Air quality is acceptable; mild sensitivity possible for very few people.",
        outdoorAdvice: "Normal outdoor activities and exercise are safe.",
        ventilationAdvice: "Safe to open windows and ventilate rooms.",
        maskAdvice: "Unusually sensitive people may monitor for minor coughing.",
        vulnerableAdvice: "Generally safe; keep regular medications accessible.",
      };
    case 3:
      return {
        label: "Moderate",
        badgeBg: "bg-amber-500/20",
        badgeBorder: "border-amber-500/40",
        textColor: "text-amber-300",
        summary: "Sensitive groups may experience symptoms; general public is less affected.",
        outdoorAdvice: "Reduce strenuous or prolonged outdoor workouts.",
        ventilationAdvice: "Close windows during peak traffic or dusty hours.",
        maskAdvice: "Wear a mask if sensitive to dust, haze, or smoke.",
        vulnerableAdvice: "People with asthma or lung conditions should limit exertion.",
      };
    case 4:
      return {
        label: "Poor",
        badgeBg: "bg-rose-500/20",
        badgeBorder: "border-rose-500/40",
        textColor: "text-rose-300",
        summary: "Everyone may begin to experience health effects; sensitive groups higher risk.",
        outdoorAdvice: "Avoid prolonged outdoor running, sports, or heavy exertion.",
        ventilationAdvice: "Keep windows shut; run an indoor air purifier.",
        maskAdvice: "Wear an N95 or KN95 protective mask outdoors.",
        vulnerableAdvice: "Children, seniors, and asthmatics should remain indoors.",
      };
    case 5:
    default:
      return {
        label: "Very Poor",
        badgeBg: "bg-purple-500/25",
        badgeBorder: "border-purple-500/50",
        textColor: "text-purple-300",
        summary: "Emergency health warning: Entire population is at high risk.",
        outdoorAdvice: "Avoid all outdoor physical activity and exercise.",
        ventilationAdvice: "Keep all windows and doors tightly sealed; run air purifier.",
        maskAdvice: "N95 / respirator mask strictly required if stepping outside.",
        vulnerableAdvice: "Sensitive groups must remain strictly indoors with filtered air.",
      };
  }
}

/* ═══════════════════════════════════════════
   Stat card component
═══════════════════════════════════════════ */
function StatCard({
  icon,
  value,
  label,
  subtext,
  className = "",
  style,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  subtext?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`stat-card bg-white/10 border border-white/20 rounded-2xl p-3.5 flex items-center gap-3 backdrop-blur-sm cursor-default hover:bg-white/15 transition-all ${className}`}
      style={style}
    >
      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-white font-bold text-lg leading-tight truncate">{value}</p>
        <p className="text-white/60 text-xs font-medium uppercase tracking-wider">{label}</p>
        {subtext && (
          <p className="text-white/45 text-[11px] truncate mt-0.5">{subtext}</p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Loading skeleton placeholder
═══════════════════════════════════════════ */
function LoadingSkeleton() {
  return (
    <div className="mt-5 space-y-4 animate-fade-in">
      <div className="flex justify-center">
        <div className="animate-skeleton h-4 w-36 rounded-full" />
      </div>
      <div className="flex justify-center">
        <div className="animate-skeleton w-[130px] h-[100px] rounded-2xl" />
      </div>
      <div className="flex justify-center">
        <div className="animate-skeleton h-16 w-44 rounded-2xl" />
      </div>
      <div className="flex justify-center gap-2">
        <div className="animate-skeleton h-6 w-24 rounded-full" />
        <div className="animate-skeleton h-6 w-28 rounded-full" />
      </div>
      <div className="h-px bg-white/10 rounded-full my-4" />
      <div className="grid grid-cols-2 gap-3">
        <div className="animate-skeleton h-16 rounded-2xl" />
        <div className="animate-skeleton h-16 rounded-2xl" />
        <div className="animate-skeleton h-16 rounded-2xl" />
        <div className="animate-skeleton h-16 rounded-2xl" />
      </div>
    </div>
  );
}

const POPULAR_CITIES = ["Delhi", "Mumbai", "Jaipur", "Chennai", "Hyderabad", "Bengaluru"];

/* ═══════════════════════════════════════════
   Main Weather Page
═══════════════════════════════════════════ */
export default function WeatherPage() {
  const [city, setCity] = useState("");
  const [appState, setAppState] = useState<WeatherState>("idle");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [hourlyForecast, setHourlyForecast] = useState<HourlyItem[]>([]);
  const [dailyForecast, setDailyForecast] = useState<DailyItem[]>([]);
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [unit, setUnit] = useState<Unit>("C");
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [animKey, setAnimKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cfg = weather ? getCfg(weather.condition) : defaultConfig;

  async function handleSearch(cityNameToSearch?: string) {
    const targetCity = (cityNameToSearch ?? city).trim();
    if (!targetCity) return;
    setCity(targetCity);
    setAppState("loading");

    try {
      const data = await fetchWeather(targetCity);
      const json = data.current;

      if (!json || json.cod === "404" || json.cod === 404) {
        if (analytics) {
          logEvent(analytics, "search_weather", {
            search_term: targetCity,
            result: "not_found",
          });
        }
        setAppState("not-found");
        return;
      }

      if (analytics) {
        logEvent(analytics, "search_weather", {
          search_term: targetCity,
          result: "found",
        });
      }

      const timezone = json.timezone || 0;

      // Parse current weather
      setWeather({
        cityName: json.name,
        country: json.sys?.country || "",
        temp: Math.round(json.main.temp),
        tempMin: Math.round(json.main.temp_min),
        tempMax: Math.round(json.main.temp_max),
        feelsLike: Math.round(json.main.feels_like),
        description: json.weather?.[0]?.description || "",
        humidity: json.main.humidity,
        windSpeed: Math.round(json.wind.speed * 3.6), // convert m/s to km/h
        windDeg: json.wind.deg,
        windGust: json.wind.gust ? Math.round(json.wind.gust * 3.6) : undefined,
        pressure: json.main.pressure,
        visibility: Math.round((json.visibility || 10000) / 100) / 10, // km
        clouds: json.clouds?.all ?? 0,
        sunrise: json.sys?.sunrise,
        sunset: json.sys?.sunset,
        timezone: timezone,
        condition: json.weather?.[0]?.main || "Clear",
        coord: json.coord,
      });

      // Parse forecast if available
      if (data.forecast?.list) {
        // Hourly (next 8 slots = 24h)
        const hourly: HourlyItem[] = data.forecast.list.slice(0, 8).map((item: any) => {
          const date = new Date((item.dt + timezone) * 1000);
          let h = date.getUTCHours();
          const ampm = h >= 12 ? "PM" : "AM";
          h = h % 12 || 12;
          return {
            time: `${h} ${ampm}`,
            temp: Math.round(item.main.temp),
            condition: item.weather?.[0]?.main || "Clear",
            description: item.weather?.[0]?.description || "",
            pop: Math.round((item.pop || 0) * 100),
          };
        });
        setHourlyForecast(hourly);

        // Daily grouping by date
        const groups: Record<string, any[]> = {};
        data.forecast.list.forEach((item: any) => {
          const dStr = item.dt_txt ? item.dt_txt.slice(0, 10) : "";
          if (!dStr) return;
          if (!groups[dStr]) groups[dStr] = [];
          groups[dStr].push(item);
        });

        const daily: DailyItem[] = Object.entries(groups).slice(0, 5).map(([dStr, items], idx) => {
          const min = Math.min(...items.map((i) => i.main.temp_min));
          const max = Math.max(...items.map((i) => i.main.temp_max));
          const midItem = items[Math.floor(items.length / 2)] || items[0];
          const dObj = new Date(dStr + "T00:00:00Z");
          const dayName =
            idx === 0
              ? "Today"
              : dObj.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
          const dateFormatted = dObj.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          });

          return {
            day: dayName,
            date: dateFormatted,
            tempMin: Math.round(min),
            tempMax: Math.round(max),
            condition: midItem.weather?.[0]?.main || "Clear",
            description: midItem.weather?.[0]?.description || "",
          };
        });
        setDailyForecast(daily);
      } else {
        setHourlyForecast([]);
        setDailyForecast([]);
      }

      // Parse Air Quality if available
      if (data.airPollution?.list?.[0]) {
        const aqItem = data.airPollution.list[0];
        setAirQuality({
          aqi: aqItem.main?.aqi || 1,
          co: Math.round(aqItem.components?.co || 0),
          no2: Math.round((aqItem.components?.no2 || 0) * 10) / 10,
          o3: Math.round((aqItem.components?.o3 || 0) * 10) / 10,
          so2: Math.round((aqItem.components?.so2 || 0) * 10) / 10,
          pm2_5: Math.round((aqItem.components?.pm2_5 || 0) * 10) / 10,
          pm10: Math.round((aqItem.components?.pm10 || 0) * 10) / 10,
        });
      } else {
        setAirQuality(null);
      }

      setAnimKey((k) => k + 1);
      setAppState("found");
    } catch {
      setAirQuality(null);
      setAppState("not-found");
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-3 sm:p-5 overflow-hidden z-0">
      {/* ── Dynamic cross-fading background gradients ── */}
      <div
        className={`absolute inset-0 -z-10 bg-gradient-to-br ${defaultConfig.from} ${defaultConfig.via} ${defaultConfig.to} transition-opacity duration-1000 ease-in-out ${
          cfg === defaultConfig ? "opacity-100" : "opacity-0"
        }`}
      />
      {Object.entries(conditionConfig).map(([key, config]) => (
        <div
          key={key}
          className={`absolute inset-0 -z-10 bg-gradient-to-br ${config.from} ${config.via} ${config.to} transition-opacity duration-1000 ease-in-out ${
            weather?.condition === key ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* ── Bokeh floating atmosphere ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
        <div className="animate-drift-1 absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="animate-drift-2 absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="animate-drift-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-black/10 blur-3xl" />
        <div className="animate-drift-2 absolute top-[15%] right-[10%] w-32 h-32 rounded-full bg-white/5 blur-2xl" />
        <div className="animate-drift-1 absolute bottom-[20%] left-[15%] w-40 h-40 rounded-full bg-white/5 blur-2xl" />
      </div>

      {/* ── Main Glass Card Container ── */}
      <div className="relative w-full max-w-lg md:max-w-xl transition-all duration-500 my-auto">
        <div className="glass-card backdrop-blur-2xl bg-white/15 border border-white/25 rounded-3xl shadow-2xl overflow-hidden">
          {/* Top gloss shimmer line */}
          <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
            <div className="animate-shimmer h-full w-full bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          </div>

          <div className="p-4 sm:p-6 max-h-[92vh] overflow-y-auto custom-scrollbar">
            {/* ── Header: Search & Unit Toggle ── */}
            <div className="flex items-center gap-2">
              <div className="search-bar flex-1 flex items-center gap-2 bg-white/15 border border-white/20 rounded-2xl px-3.5 py-2.5">
                <IconLocation className="transition-transform duration-300" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search city (e.g. Tokyo, Paris)..."
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/50 text-sm font-medium outline-none"
                />
                <button
                  onClick={() => handleSearch()}
                  disabled={appState === "loading"}
                  aria-label="Search weather"
                  className="search-btn w-8 h-8 rounded-xl bg-white/20 hover:bg-white/35 text-white flex items-center justify-center disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {appState === "loading" ? <IconSpinner /> : <IconSearch />}
                </button>
              </div>

              {/* °C / °F Unit Switcher */}
              <div className="flex bg-white/15 border border-white/20 rounded-2xl p-1 shrink-0">
                <button
                  onClick={() => setUnit("C")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    unit === "C"
                      ? "bg-white text-slate-800 shadow-md"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  °C
                </button>
                <button
                  onClick={() => setUnit("F")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    unit === "F"
                      ? "bg-white text-slate-800 shadow-md"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  °F
                </button>
              </div>
            </div>

            {/* ── Quick City Chips ── */}
            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
              <span className="text-[11px] font-medium text-white/50 shrink-0">Popular:</span>
              {POPULAR_CITIES.map((c) => (
                <button
                  key={c}
                  onClick={() => handleSearch(c)}
                  className="text-xs px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 hover:text-white shrink-0 transition-all cursor-pointer active:scale-95"
                >
                  {c}
                </button>
              ))}
            </div>

            {/* ── Idle State Hint ── */}
            {appState === "idle" && (
              <div className="py-12 text-center animate-fade-in">
                <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                  <IconLocation className="w-8 h-8 fill-white/60" />
                </div>
                <p className="text-white font-semibold text-lg">Real-Time Global Weather</p>
                <p className="animate-pulse-soft text-white/60 text-xs sm:text-sm mt-1 max-w-xs mx-auto">
                  Type any city or click a popular destination to view comprehensive live conditions & forecasts.
                </p>
              </div>
            )}

            {/* ── Loading Skeleton ── */}
            {appState === "loading" && <LoadingSkeleton />}

            {/* ── 404 Not Found State ── */}
            {appState === "not-found" && (
              <div className="py-8 text-center animate-fade-slide-up">
                <div className="animate-shake">
                  <Image
                    src="/images/404.png"
                    alt="City not found"
                    width={160}
                    height={120}
                    className="mx-auto opacity-80"
                  />
                </div>
                <p className="text-white font-semibold text-lg mt-3">City Not Found</p>
                <p className="text-white/60 text-sm mt-1">
                  We couldn&apos;t find &quot;{city}&quot;. Please verify spelling or try another city.
                </p>
              </div>
            )}

            {/* ── Weather Found Content ── */}
            {appState === "found" && weather && (
              <div key={animKey} className="mt-4 animate-fade-in">
                {/* ── City, Country & Local Time Header ── */}
                <div className="flex items-center justify-between text-white/80 text-xs font-semibold tracking-wide border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-1.5 uppercase">
                    <IconLocation />
                    <span>
                      {weather.cityName}, {weather.country}
                    </span>
                  </div>
                  <div className="text-white/60 font-medium">
                    Local Time: {formatCityLocalTime(weather.timezone)}
                  </div>
                </div>

                {/* ── Hero Weather Block ── */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4 px-2">
                  {/* Weather Illustration */}
                  <div className="animate-float drop-shadow-[0_8px_20px_rgba(0,0,0,0.3)]">
                    <Image
                      src={getConditionImage(weather.condition)}
                      alt={weather.condition}
                      width={125}
                      height={95}
                      priority
                    />
                  </div>

                  {/* Temperature & High / Low */}
                  <div className="text-center sm:text-right">
                    <div className="flex items-start justify-center sm:justify-end gap-1 leading-none animate-temp-reveal">
                      <span className="text-6xl sm:text-7xl font-black text-white tracking-tight">
                        <AnimatedTemp value={toUnit(weather.temp, unit)} />
                      </span>
                      <span className="text-2xl sm:text-3xl font-bold text-white/70 mt-2">
                        °{unit}
                      </span>
                    </div>

                    <div className="flex items-center justify-center sm:justify-end gap-2 mt-2">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 border border-white/25 text-white text-xs font-medium capitalize">
                        {weather.description}
                      </span>
                    </div>

                    <div className="text-white/60 text-xs font-medium mt-1.5 flex items-center justify-center sm:justify-end gap-2">
                      <span className="flex items-center gap-0.5 text-white/75">
                        <IconThermometer /> Feels like {toUnit(weather.feelsLike, unit)}°{unit}
                      </span>
                      <span>•</span>
                      <span>H: {toUnit(weather.tempMax, unit)}°</span>
                      <span>L: {toUnit(weather.tempMin, unit)}°</span>
                    </div>
                  </div>
                </div>

                {/* ── Navigation Tabs ── */}
                <div className="mt-5 grid grid-cols-5 gap-1 bg-white/10 p-1 rounded-2xl border border-white/15">
                  {(
                    [
                      { id: "overview", label: "Overview" },
                      { id: "aqi", label: "Air Quality" },
                      { id: "sun", label: "Sun & Astro" },
                      { id: "hourly", label: "Hourly (24h)" },
                      { id: "daily", label: "5-Day" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`tab-btn py-1.5 text-xs font-semibold rounded-xl text-center cursor-pointer ${
                        activeTab === tab.id
                          ? "bg-white text-slate-800 shadow-md font-bold"
                          : "text-white/70 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* ── TAB 1: Detailed Weather Overview ── */}
                {activeTab === "overview" && (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5 animate-fade-in">
                    <StatCard
                      icon={<IconDrop />}
                      value={`${weather.humidity}%`}
                      label="Humidity"
                      subtext={getHumidityCategory(weather.humidity)}
                    />
                    <StatCard
                      icon={<IconWind />}
                      value={
                        unit === "C"
                          ? `${weather.windSpeed} km/h`
                          : `${Math.round(weather.windSpeed * 0.621)} mph`
                      }
                      label="Wind Speed"
                      subtext={`${getWindDirection(weather.windDeg)} (${weather.windDeg ?? 0}°)${
                        weather.windGust ? ` • Gust ${toUnit(weather.windGust, unit)}` : ""
                      }`}
                    />
                    <StatCard
                      icon={<IconGauge />}
                      value={`${weather.pressure} hPa`}
                      label="Pressure"
                      subtext={weather.pressure >= 1013 ? "High / Stable" : "Low / Dynamic"}
                    />
                    <StatCard
                      icon={<IconEye />}
                      value={
                        unit === "C"
                          ? `${weather.visibility} km`
                          : `${(weather.visibility * 0.621).toFixed(1)} mi`
                      }
                      label="Visibility"
                      subtext={getVisibilityCategory(weather.visibility)}
                    />
                    <StatCard
                      icon={<IconCloudCover />}
                      value={`${weather.clouds}%`}
                      label="Cloudiness"
                      subtext={getCloudCategory(weather.clouds)}
                    />
                    <StatCard
                      icon={<IconThermometer />}
                      value={`${toUnit(weather.tempMin, unit)}° / ${toUnit(weather.tempMax, unit)}°`}
                      label="Min / Max"
                      subtext={`Spread ${Math.abs(toUnit(weather.tempMax, unit) - toUnit(weather.tempMin, unit))}°`}
                    />

                    {/* AQI Quick-Banner in Overview */}
                    {airQuality && (
                      <button
                        onClick={() => setActiveTab("aqi")}
                        className={`col-span-2 sm:col-span-3 p-3 rounded-2xl border backdrop-blur-sm flex items-center justify-between text-left transition-all hover:bg-white/15 cursor-pointer ${getAqiInfo(airQuality.aqi).badgeBg} ${getAqiInfo(airQuality.aqi).badgeBorder}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                            <IconLeaf className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-bold text-xs uppercase tracking-wider">Air Quality</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getAqiInfo(airQuality.aqi).badgeBg} ${getAqiInfo(airQuality.aqi).textColor} ${getAqiInfo(airQuality.aqi).badgeBorder}`}>
                                Level {airQuality.aqi} • {getAqiInfo(airQuality.aqi).label}
                              </span>
                            </div>
                            <p className="text-white/70 text-[11px] truncate mt-0.5">{getAqiInfo(airQuality.aqi).summary}</p>
                          </div>
                        </div>
                        <span className="text-white/80 hover:text-white text-xs font-semibold shrink-0 ml-2">Health Advice →</span>
                      </button>
                    )}
                  </div>
                )}

                {/* ── TAB: Air Quality Index ── */}
                {activeTab === "aqi" && (
                  <div className="mt-4 animate-fade-in">
                    {airQuality ? (
                      (() => {
                        const info = getAqiInfo(airQuality.aqi);
                        const aqiPercent = Math.min((airQuality.aqi / 5) * 100, 100);
                        return (
                          <div className="space-y-3">
                            {/* AQI Header Card */}
                            <div className="p-4 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                                    <IconLeaf />
                                  </div>
                                  <div>
                                    <p className="text-white font-bold text-base leading-tight">
                                      Air Quality Index
                                    </p>
                                    <p className="text-white/50 text-[11px] font-medium mt-0.5">
                                      OpenWeather Air Pollution API
                                    </p>
                                  </div>
                                </div>
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-bold border ${info.badgeBg} ${info.badgeBorder} ${info.textColor}`}
                                >
                                  {airQuality.aqi} — {info.label}
                                </span>
                              </div>

                              {/* AQI Progress Bar */}
                              <div className="relative h-3 rounded-full bg-white/10 overflow-hidden">
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-all duration-700"
                                  style={{ width: `${aqiPercent}%` }}
                                />
                                <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none">
                                  {[1, 2, 3, 4, 5].map((level) => (
                                    <div
                                      key={level}
                                      className={`w-1 h-1 rounded-full ${
                                        airQuality.aqi >= level ? "bg-white/80" : "bg-white/20"
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className="flex justify-between text-[10px] text-white/40 mt-1 px-0.5">
                                <span>Good</span>
                                <span>Fair</span>
                                <span>Moderate</span>
                                <span>Poor</span>
                                <span>Very Poor</span>
                              </div>

                              {/* Summary */}
                              <p className="text-white/70 text-xs leading-relaxed mt-3">
                                {info.summary}
                              </p>
                            </div>

                            {/* Pollutant Breakdown Grid */}
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { label: "PM₂.₅", value: airQuality.pm2_5, unit: "µg/m³", warn: 25 },
                                { label: "PM₁₀", value: airQuality.pm10, unit: "µg/m³", warn: 50 },
                                { label: "O₃", value: airQuality.o3, unit: "µg/m³", warn: 100 },
                                { label: "NO₂", value: airQuality.no2, unit: "µg/m³", warn: 40 },
                                { label: "SO₂", value: airQuality.so2, unit: "µg/m³", warn: 20 },
                                { label: "CO", value: airQuality.co, unit: "µg/m³", warn: 4400 },
                              ].map((p) => (
                                <div
                                  key={p.label}
                                  className="p-2.5 rounded-xl bg-white/10 border border-white/15 text-center hover:bg-white/15 transition-all"
                                >
                                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">
                                    {p.label}
                                  </p>
                                  <p
                                    className={`text-base font-bold mt-0.5 ${
                                      p.value > p.warn ? "text-rose-300" : "text-white"
                                    }`}
                                  >
                                    {p.value}
                                  </p>
                                  <p className="text-white/35 text-[9px] mt-0.5">{p.unit}</p>
                                </div>
                              ))}
                            </div>

                            {/* Health Advice Cards */}
                            <div className="space-y-2">
                              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                <IconShieldAlert />
                                Health Advice
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {[
                                  {
                                    icon: <IconActivity />,
                                    title: "Outdoor Activity",
                                    advice: info.outdoorAdvice,
                                  },
                                  {
                                    icon: <IconWindow />,
                                    title: "Ventilation",
                                    advice: info.ventilationAdvice,
                                  },
                                  {
                                    icon: <IconMask />,
                                    title: "Mask Advisory",
                                    advice: info.maskAdvice,
                                  },
                                  {
                                    icon: <IconShieldAlert />,
                                    title: "Vulnerable Groups",
                                    advice: info.vulnerableAdvice,
                                  },
                                ].map((card) => (
                                  <div
                                    key={card.title}
                                    className="p-3 rounded-xl bg-white/8 border border-white/15 hover:bg-white/12 transition-all"
                                  >
                                    <div className="flex items-center gap-2 mb-1.5">
                                      {card.icon}
                                      <span className="text-white/80 text-xs font-semibold">
                                        {card.title}
                                      </span>
                                    </div>
                                    <p className="text-white/55 text-[11px] leading-relaxed">
                                      {card.advice}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="py-6 text-center text-white/60 text-xs">
                        Air quality data not available for this location.
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB 2: Hourly Forecast Strip ── */}
                {activeTab === "hourly" && (
                  <div className="mt-4 animate-fade-in">
                    {hourlyForecast.length > 0 ? (
                      <div>
                        <p className="text-white/70 text-xs font-semibold mb-2 flex items-center justify-between">
                          <span>Next 24-Hour Timeline</span>
                          <span className="text-[11px] text-white/50">Scroll for more →</span>
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                          {hourlyForecast.map((hour, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col items-center justify-between min-w-[76px] p-2.5 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm shrink-0 hover:bg-white/20 transition-all text-center"
                            >
                              <span className="text-white/75 text-[11px] font-semibold">
                                {hour.time}
                              </span>
                              <div className="my-1.5 drop-shadow">
                                <Image
                                  src={getConditionImage(hour.condition)}
                                  alt={hour.condition}
                                  width={34}
                                  height={34}
                                />
                              </div>
                              <span className="text-white font-bold text-sm">
                                {toUnit(hour.temp, unit)}°{unit}
                              </span>
                              {hour.pop > 0 && (
                                <span className="text-sky-300 text-[10px] font-medium mt-1">
                                  💧 {hour.pop}%
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-white/60 text-xs">
                        Hourly forecast not available for this location.
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB 3: 5-Day Forecast ── */}
                {activeTab === "daily" && (
                  <div className="mt-4 space-y-2 animate-fade-in">
                    {dailyForecast.length > 0 ? (
                      dailyForecast.map((day, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 transition-all backdrop-blur-sm"
                        >
                          <div className="w-24">
                            <p className="text-white font-bold text-sm leading-none">{day.day}</p>
                            <p className="text-white/50 text-[11px] mt-0.5">{day.date}</p>
                          </div>

                          <div className="flex items-center gap-2 flex-1 justify-center">
                            <Image
                              src={getConditionImage(day.condition)}
                              alt={day.condition}
                              width={28}
                              height={28}
                            />
                            <span className="text-white/80 text-xs font-medium capitalize hidden sm:inline">
                              {day.description}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-right">
                            <span className="text-white/60 text-xs font-semibold">
                              {toUnit(day.tempMin, unit)}°
                            </span>
                            <div className="w-16 h-1.5 rounded-full bg-white/15 overflow-hidden hidden sm:block">
                              <div className="h-full bg-gradient-to-r from-sky-400 to-amber-400 rounded-full w-full" />
                            </div>
                            <span className="text-white font-bold text-sm">
                              {toUnit(day.tempMax, unit)}°{unit}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-center text-white/60 text-xs">
                        5-Day forecast not available for this location.
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB 4: Sun, Coordinates & Details ── */}
                {activeTab === "sun" && (
                  <div className="mt-4 grid grid-cols-2 gap-3 animate-fade-in">
                    <div className="p-3.5 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-400/20 flex items-center justify-center shrink-0">
                        <IconSunrise />
                      </div>
                      <div>
                        <p className="text-white font-bold text-base leading-tight">
                          {formatSunTime(weather.sunrise, weather.timezone)}
                        </p>
                        <p className="text-white/60 text-xs font-medium uppercase mt-0.5">
                          Sunrise
                        </p>
                        <p className="text-white/40 text-[11px]">Local Solar Time</p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-400/20 flex items-center justify-center shrink-0">
                        <IconSunset />
                      </div>
                      <div>
                        <p className="text-white font-bold text-base leading-tight">
                          {formatSunTime(weather.sunset, weather.timezone)}
                        </p>
                        <p className="text-white/60 text-xs font-medium uppercase mt-0.5">
                          Sunset
                        </p>
                        <p className="text-white/40 text-[11px]">Dusk Horizon</p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-400/20 flex items-center justify-center shrink-0">
                        <IconCompass />
                      </div>
                      <div>
                        <p className="text-white font-bold text-sm leading-tight">
                          {weather.coord ? `${weather.coord.lat.toFixed(2)}°, ${weather.coord.lon.toFixed(2)}°` : "N/A"}
                        </p>
                        <p className="text-white/60 text-xs font-medium uppercase mt-0.5">
                          Coordinates
                        </p>
                        <p className="text-white/40 text-[11px]">Latitude / Longitude</p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-400/20 flex items-center justify-center shrink-0">
                        <IconGauge />
                      </div>
                      <div>
                        <p className="text-white font-bold text-sm leading-tight">
                          UTC {weather.timezone >= 0 ? "+" : ""}
                          {(weather.timezone / 3600).toFixed(1)}h
                        </p>
                        <p className="text-white/60 text-xs font-medium uppercase mt-0.5">
                          Time Zone
                        </p>
                        <p className="text-white/40 text-[11px]">Offset from UTC</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
