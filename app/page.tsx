"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import Image from "next/image";

import { fetchWeather } from "./actions";
import { analytics } from "@/lib/firebase";
import { logEvent } from "firebase/analytics";
type WeatherState = "idle" | "loading" | "found" | "not-found";

interface WeatherData {
  temp: number;
  feelsLike: number;
  description: string;
  humidity: number;
  windSpeed: number;
  condition: string;
  cityName: string;
  country: string;
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

/* ═══════════════════════════════════════════
   Animated temperature counter
═══════════════════════════════════════════ */
function AnimatedTemp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    const from = 0;
    const to = value;
    const duration = 800; // ms

    function step(ts: number) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }, [value]);

  return <>{display}</>;
}

/* ═══════════════════════════════════════════
   SVG icons (inline — zero CDN deps)
═══════════════════════════════════════════ */
function IconLocation({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 384 512"
      className={`w-3.5 h-4 fill-white/70 shrink-0 ${className}`}
    >
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
    <svg
      className="animate-spin w-4 h-4 relative z-10"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}

function IconDrop() {
  return (
    <svg viewBox="0 0 384 512" className="w-5 h-5 fill-white/80">
      <path d="M192 512C86 512 0 426 0 320C0 228.8 130.2 57.7 166.6 11.7C172.6 4.2 181.5 0 191 0l1.9 0c9.5 0 18.4 4.2 24.4 11.7C254.2 57.7 384 228.8 384 320c0 106-86 192-192 192z" />
    </svg>
  );
}

function IconWind() {
  return (
    <svg viewBox="0 0 512 512" className="w-5 h-5 fill-white/80">
      <path d="M288 32c0 17.7 14.3 32 32 32l32 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128c-17.7 0-32 14.3-32 32s14.3 32 32 32l320 0c53 0 96-43 96-96s-43-96-96-96L320 0c-17.7 0-32 14.3-32 32zm64 352c0 17.7 14.3 32 32 32l32 0c53 0 96-43 96-96s-43-96-96-96l-192 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0c-17.7 0-32 14.3-32 32zM128 512l32 0c53 0 96-43 96-96s-43-96-96-96L32 320c-17.7 0-32 14.3-32 32s14.3 32 32 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0c-17.7 0-32 14.3-32 32s14.3 32 32 32z" />
    </svg>
  );
}

function IconThermometer() {
  return (
    <svg viewBox="0 0 320 512" className="w-4 h-4 fill-white/50">
      <path d="M160 64c-26.5 0-48 21.5-48 48l0 164.5c0 17.3-7.1 31.9-15.3 42.5C86.2 332.6 80 349.5 80 368c0 44.2 35.8 80 80 80s80-35.8 80-80c0-18.5-6.2-35.4-16.7-48.9c-8.2-10.6-15.3-25.2-15.3-42.5L208 112c0-26.5-21.5-48-48-48zM48 112C48 50.2 98.1 0 160 0s112 50.1 112 112l0 164.4c0 .1 .1 .3 .2 .6c.2 .6 .8 1.6 1.7 2.8C290.3 301.4 304 332.8 304 368c0 79.5-64.5 144-144 144S16 447.5 16 368c0-35.2 13.7-66.6 30.1-88.2c1-1.3 1.5-2.3 1.7-2.8c.1-.3 .2-.5 .2-.6L48 112z" />
    </svg>
  );
}

/* ═══════════════════════════════════════════
   Stat card with hover animation
═══════════════════════════════════════════ */
function StatCard({
  icon,
  value,
  label,
  className = "",
  style,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`stat-card flex-1 bg-white/10 border border-white/20 rounded-2xl p-4 flex items-center gap-3 backdrop-blur-sm cursor-default ${className}`}
      style={style}
    >
      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110">
        {icon}
      </div>
      <div>
        <p className="text-white font-bold text-xl leading-none">{value}</p>
        <p className="text-white/50 text-xs mt-1 font-medium">{label}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Loading skeleton placeholder
═══════════════════════════════════════════ */
function LoadingSkeleton() {
  return (
    <div className="mt-5 space-y-5 animate-fade-in">
      {/* City placeholder */}
      <div className="flex justify-center">
        <div className="animate-skeleton h-4 w-32 rounded-full" />
      </div>
      {/* Image placeholder */}
      <div className="flex justify-center">
        <div className="animate-skeleton w-[120px] h-[90px] rounded-2xl" />
      </div>
      {/* Temp placeholder */}
      <div className="flex justify-center">
        <div className="animate-skeleton h-16 w-36 rounded-2xl" />
      </div>
      {/* Badge placeholder */}
      <div className="flex justify-center">
        <div className="animate-skeleton h-7 w-28 rounded-full" />
      </div>
      {/* Divider */}
      <div className="h-px bg-white/10 rounded-full" />
      {/* Stat placeholders */}
      <div className="flex gap-3">
        <div className="animate-skeleton flex-1 h-[72px] rounded-2xl" />
        <div className="animate-skeleton flex-1 h-[72px] rounded-2xl" />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main page
══════════════════════════════════════════ */
export default function WeatherPage() {
  const [city, setCity] = useState("");
  const [appState, setAppState] = useState<WeatherState>("idle");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cfg = weather ? getCfg(weather.condition) : defaultConfig;

  // Determine explicit height for smooth container transitions
  let cardHeight = "h-[140px]";
  if (appState === "loading") cardHeight = "h-[480px]";
  if (appState === "not-found") cardHeight = "h-[400px]";
  if (appState === "found") cardHeight = "h-[620px]";

  async function handleSearch() {
    if (!city.trim()) return;
    setAppState("loading");
    try {
      const json = await fetchWeather(city.trim());

      if (json.cod === "404") {
        if (analytics) {
          logEvent(analytics, "search_weather", { search_term: city.trim(), result: "not_found" });
        }
        setAppState("not-found");
        return;
      }

      if (analytics) {
        logEvent(analytics, "search_weather", { search_term: city.trim(), result: "found" });
      }

      setWeather({
        temp: Math.round(json.main.temp),
        feelsLike: Math.round(json.main.feels_like),
        description: json.weather[0].description,
        humidity: json.main.humidity,
        windSpeed: Math.round(json.wind.speed),
        condition: json.weather[0].main,
        cityName: json.name,
        country: json.sys.country,
      });
      setAnimKey((k) => k + 1);
      setAppState("found");
    } catch {
      setAppState("not-found");
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    /* ── Main Container ── */
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden z-0">
      
      {/* ── Background Gradients (Cross-fading) ── */}
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${defaultConfig.from} ${defaultConfig.via} ${defaultConfig.to} transition-opacity duration-1000 ease-in-out ${cfg === defaultConfig ? 'opacity-100' : 'opacity-0'}`} />
      {Object.entries(conditionConfig).map(([key, config]) => (
        <div
          key={key}
          className={`absolute inset-0 -z-10 bg-gradient-to-br ${config.from} ${config.via} ${config.to} transition-opacity duration-1000 ease-in-out ${weather?.condition === key ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}

      {/* ── Animated bokeh blobs ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
        <div className="animate-drift-1 absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="animate-drift-2 absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="animate-drift-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-black/10 blur-3xl" />
        {/* Extra sparkle blobs */}
        <div className="animate-drift-2 absolute top-[15%] right-[10%] w-32 h-32 rounded-full bg-white/5 blur-2xl" />
        <div className="animate-drift-1 absolute bottom-[20%] left-[15%] w-40 h-40 rounded-full bg-white/5 blur-2xl" />
      </div>

      {/* ── Glass card ── */}
      <div className="relative w-full max-w-sm">
        <div className={`glass-card backdrop-blur-xl bg-white/15 border border-white/25 rounded-3xl shadow-2xl overflow-hidden ${cardHeight}`}>
          {/* Animated top-gloss shimmer */}
          <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
            <div className="animate-shimmer h-full w-full bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          </div>

          <div className="p-6">
            {/* ── Search bar ── */}
            <div className="search-bar flex items-center gap-2.5 bg-white/15 border border-white/20 rounded-2xl px-4 py-3">
              <IconLocation className="transition-transform duration-300" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search city..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/50 text-sm font-medium outline-none"
              />
              <button
                onClick={handleSearch}
                disabled={appState === "loading"}
                aria-label="Search weather"
                className="search-btn w-8 h-8 rounded-xl bg-white/20 hover:bg-white/35 text-white flex items-center justify-center disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {appState === "loading" ? <IconSpinner /> : <IconSearch />}
              </button>
            </div>

            {/* ── Idle hint ── */}
            {appState === "idle" && (
              <div className="mt-6 mb-4 text-center animate-fade-in">
                <p className="animate-pulse-soft text-white/60 text-sm">
                  Enter a city name to get started
                </p>
              </div>
            )}

            {/* ── Loading skeleton ── */}
            {appState === "loading" && <LoadingSkeleton />}

            {/* ── Not found ── */}
            {appState === "not-found" && (
              <div className="mt-8 mb-2 text-center animate-fade-slide-up">
                <div className="animate-shake">
                  <Image
                    src="/images/404.png"
                    alt="City not found"
                    width={180}
                    height={135}
                    className="mx-auto opacity-75"
                  />
                </div>
                <p
                  className="text-white font-semibold text-lg mt-4"
                  style={{ animation: "fadeSlideUp 0.4s ease both 0.4s" }}
                >
                  City not found
                </p>
                <p
                  className="text-white/50 text-sm mt-1"
                  style={{ animation: "fadeSlideUp 0.4s ease both 0.55s" }}
                >
                  Check the spelling and try again
                </p>
              </div>
            )}

            {/* ── Weather found ── */}
            {appState === "found" && weather && (
              <div key={animKey} className="mt-5">
                {/* City & country — fade in */}
                <div
                  className="flex items-center justify-center gap-1.5"
                  style={{ animation: "fadeIn 0.4s ease both 0.05s" }}
                >
                  <IconLocation />
                  <p className="text-white/80 text-sm font-semibold tracking-wide uppercase">
                    {weather.cityName}, {weather.country}
                  </p>
                </div>

                {/* Weather image — float animation */}
                <div
                  className="flex justify-center mt-5 drop-shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                  style={{ animation: "fadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1) both 0.1s" }}
                >
                  <div className="animate-float">
                    <Image
                      src={getCfg(weather.condition).image}
                      alt={weather.condition}
                      width={150}
                      height={112}
                      priority
                    />
                  </div>
                </div>

                {/* Temperature hero — blur-reveal + counter */}
                <div
                  className="text-center mt-3 animate-temp-reveal"
                >
                  <div className="flex items-start justify-center gap-1 leading-none">
                    <span className="text-[5.5rem] font-black text-white tracking-tighter">
                      <AnimatedTemp value={weather.temp} />
                    </span>
                    <span className="text-3xl font-bold text-white/70 mt-4">
                      °C
                    </span>
                  </div>
                </div>

                {/* Description badge — pop-in */}
                <div className="text-center">
                  <span
                    className="animate-pop-in inline-block px-3 py-1 rounded-full bg-white/15 border border-white/20 text-white/90 text-sm font-medium capitalize"
                    style={{ animationDelay: "0.35s" }}
                  >
                    {weather.description}
                  </span>

                  {/* Feels like — staggered fade */}
                  <p
                    className="text-white/45 text-xs mt-2 font-medium flex items-center justify-center gap-1"
                    style={{ animation: "fadeIn 0.4s ease both 0.5s" }}
                  >
                    <IconThermometer /> Feels like {weather.feelsLike}°C
                  </p>
                </div>

                {/* Divider — expand from center */}
                <div
                  className="animate-expand-width mt-5 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  style={{ animationDelay: "0.4s" }}
                />

                {/* Stat cards — staggered left/right entrance */}
                <div className="mt-4 flex gap-3">
                  <StatCard
                    icon={<IconDrop />}
                    value={`${weather.humidity}%`}
                    label="Humidity"
                    className="animate-slide-in-left"
                    style={{ animationDelay: "0.45s" }}
                  />
                  <StatCard
                    icon={<IconWind />}
                    value={
                      <>
                        {weather.windSpeed}{" "}
                        <span className="text-sm font-medium">km/h</span>
                      </>
                    }
                    label="Wind Speed"
                    className="animate-slide-in-right"
                    style={{ animationDelay: "0.55s" }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card outer glow */}
        <div className="absolute inset-0 rounded-3xl ring-1 ring-white/10 pointer-events-none transition-all duration-500" />
      </div>
    </div>
  );
}
