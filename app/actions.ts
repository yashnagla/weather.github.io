"use server";

export async function fetchWeather(city: string) {
  const API_KEY = process.env.OPENWEATHER_API_KEY;

  if (!API_KEY) {
    throw new Error("Missing OpenWeather API key");
  }

  const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
    city
  )}&units=metric&appid=${API_KEY}`;

  const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
    city
  )}&units=metric&appid=${API_KEY}`;

  // Fetch current weather and 5-day forecast concurrently
  const [weatherRes, forecastRes] = await Promise.all([
    fetch(weatherUrl, { cache: "no-store" }),
    fetch(forecastUrl, { cache: "no-store" }).catch(() => null),
  ]);

  const weatherJson = await weatherRes.json();

  if (!weatherRes.ok) {
    throw new Error(
      weatherJson?.message || `OpenWeather API failed with status ${weatherRes.status}`
    );
  }

  let forecastJson = null;
  if (forecastRes && forecastRes.ok) {
    try {
      forecastJson = await forecastRes.json();
    } catch {
      forecastJson = null;
    }
  }

  return {
    current: weatherJson,
    forecast: forecastJson,
  };
}