"use server";

export async function fetchWeather(city: string) {
  const API_KEY = process.env.OPENWEATHER_API_KEY || "d4d914666a024567ee8d2f9efd3ce27f";

  if (!API_KEY) {
    throw new Error("Missing OpenWeather API key. Please set OPENWEATHER_API_KEY in your .env.local file.");
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

  // Fetch Air Pollution (AQI) if coordinates are available
  let airPollutionJson: any = null;
  if (weatherJson.coord && weatherJson.coord.lat != null && weatherJson.coord.lon != null) {
    try {
      const airPollutionUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${weatherJson.coord.lat}&lon=${weatherJson.coord.lon}&appid=${API_KEY}`;
      const airRes = await fetch(airPollutionUrl, { cache: "no-store" });
      if (airRes.ok) {
        airPollutionJson = await airRes.json();
      }
    } catch {
      airPollutionJson = null;
    }
  }

  let forecastJson: any = null;
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
    airPollution: airPollutionJson,
  };
}
