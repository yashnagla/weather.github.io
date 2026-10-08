"use server";

export async function fetchWeather(city: string) {
  const API_KEY = process.env.OPENWEATHER_API_KEY;

  if (!API_KEY) {
    throw new Error("Missing OpenWeather API key");
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
    city
  )}&units=metric&appid=${API_KEY}`;

  const res = await fetch(url, {
    cache: "no-store",
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(
      json?.message || `OpenWeather API failed with status ${res.status}`
    );
  }

  return json;
}