// Weather forecast — fetches real weather for a random global location
// via Open-Meteo (free, no API key). Used after hourly news bulletins.

import { ollama } from './ollama.js';
import { textToMp3 } from './tts.js';

// Random locations from around the planet — obscure, interesting, varied
const LOCATIONS = [
  { name: 'Ushuaia, Argentina', lat: -54.80, lon: -68.30 },
  { name: 'Tromsø, Norway', lat: 69.65, lon: 18.96 },
  { name: 'Ulaanbaatar, Mongolia', lat: 47.92, lon: 106.91 },
  { name: 'Reykjavik, Iceland', lat: 64.15, lon: -21.94 },
  { name: 'Timbuktu, Mali', lat: 16.77, lon: -3.01 },
  { name: 'McMurdo Station, Antarctica', lat: -77.85, lon: 166.67 },
  { name: 'Yakutsk, Russia', lat: 62.03, lon: 129.73 },
  { name: 'Lhasa, Tibet', lat: 29.65, lon: 91.10 },
  { name: 'Nairobi, Kenya', lat: -1.29, lon: 36.82 },
  { name: 'Svalbard, Norway', lat: 78.22, lon: 15.63 },
  { name: 'Barrow, Alaska', lat: 71.29, lon: -156.79 },
  { name: 'Marrakech, Morocco', lat: 31.63, lon: -8.00 },
  { name: 'Kathmandu, Nepal', lat: 27.70, lon: 85.32 },
  { name: 'Havana, Cuba', lat: 23.11, lon: -82.37 },
  { name: 'Vladivostok, Russia', lat: 43.12, lon: 131.87 },
  { name: 'Addis Ababa, Ethiopia', lat: 9.02, lon: 38.75 },
  { name: 'Nuuk, Greenland', lat: 64.17, lon: -51.74 },
  { name: 'Kyoto, Japan', lat: 35.01, lon: 135.77 },
  { name: 'Cusco, Peru', lat: -13.53, lon: -71.97 },
  { name: 'Zanzibar, Tanzania', lat: -6.16, lon: 39.19 },
  { name: 'Bhutan, Thimphu', lat: 27.47, lon: 89.64 },
  { name: 'Easter Island, Chile', lat: -27.11, lon: -109.35 },
  { name: 'Faroe Islands', lat: 62.01, lon: -6.77 },
  { name: 'Baku, Azerbaijan', lat: 40.41, lon: 49.87 },
  { name: 'Antananarivo, Madagascar', lat: -18.88, lon: 47.51 },
  { name: 'Queenstown, New Zealand', lat: -45.03, lon: 168.66 },
  { name: 'Oymyakon, Russia', lat: 63.46, lon: 142.77 },
  { name: 'Dakar, Senegal', lat: 14.69, lon: -17.44 },
  { name: 'Valparaíso, Chile', lat: -33.05, lon: -71.62 },
  { name: 'Tbilisi, Georgia', lat: 41.69, lon: 44.80 },
  { name: 'Hanoi, Vietnam', lat: 21.03, lon: 105.85 },
  { name: 'Luang Prabang, Laos', lat: 19.89, lon: 102.13 },
  { name: 'Dubrovnik, Croatia', lat: 42.65, lon: 18.09 },
  { name: 'Irkutsk, Russia', lat: 52.29, lon: 104.28 },
  { name: 'Windhoek, Namibia', lat: -22.56, lon: 17.08 },
  { name: 'Salar de Uyuni, Bolivia', lat: -20.13, lon: -67.49 },
  { name: 'Alert, Canada', lat: 82.50, lon: -62.35 },
  { name: 'Manaus, Brazil', lat: -3.12, lon: -60.02 },
  { name: 'Palermo, Sicily', lat: 38.12, lon: 13.36 },
  { name: 'Ulan-Ude, Russia', lat: 51.83, lon: 107.59 },
];

// WMO weather codes → human descriptions
const WMO_CODES = {
  0: 'clear skies', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'depositing rime fog',
  51: 'light drizzle', 53: 'moderate drizzle', 55: 'dense drizzle',
  61: 'slight rain', 63: 'moderate rain', 65: 'heavy rain',
  71: 'slight snow', 73: 'moderate snow', 75: 'heavy snow',
  77: 'snow grains', 80: 'slight rain showers', 81: 'moderate rain showers',
  82: 'violent rain showers', 85: 'slight snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with slight hail', 99: 'thunderstorm with heavy hail',
};

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,weathercode&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();
  const d = data.daily;
  return {
    maxTemp: d.temperature_2m_max[0],
    minTemp: d.temperature_2m_min[0],
    precipitation: d.precipitation_sum[0],
    windSpeed: d.windspeed_10m_max[0],
    weatherCode: d.weathercode[0],
    condition: WMO_CODES[d.weathercode[0]] || 'variable conditions',
    timezone: data.timezone,
  };
}

const WEATHER_PROMPT = (location, weather) => `You are Clara Fontaine, the news anchor on radioGAGA, delivering a weather forecast after the news bulletin.

Write a SHORT weather forecast (60–80 words) for ${location} today.

REAL WEATHER DATA:
- Conditions: ${weather.condition}
- High: ${weather.maxTemp}°C / Low: ${weather.minTemp}°C
- Precipitation: ${weather.precipitation}mm
- Wind: up to ${weather.windSpeed} km/h
- Timezone: ${weather.timezone}

RULES:
1. Open with a smooth transition like "And now the weather — today we're heading to ${location}."
2. Describe the forecast using the REAL data above — be accurate but conversational.
3. Add a brief colourful detail about why this place is interesting (one sentence max).
4. End with ONE random, surprising weather fact from anywhere in the world. Preface it with "And your weather fact for today:" — make it genuinely fascinating.
5. Close with: "That's your weather on radioGAGA."
6. Warm, clear, classic radio delivery. Output ONLY the spoken text.`;

export async function generateWeatherForecast() {
  const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];

  console.log(`[weather] Fetching forecast for ${location.name}`);

  const weather = await fetchWeather(location.lat, location.lon);

  const response = await ollama.generate({
    prompt: WEATHER_PROMPT(location.name, weather),
    options: { temperature: 0.8, num_predict: 200 },
  });

  const script = response.response.trim();
  const { path } = await textToMp3(script, 'en-US-JennyNeural', { energy: 3 });

  console.log(`[weather] Forecast ready: ${location.name} — ${weather.condition}, ${weather.maxTemp}°C`);

  return {
    path,
    type: 'weather',
    title: `Weather — ${location.name}`,
    script,
    voice: 'en-US-JennyNeural',
    slot: null,
    generator: 'groq+edge-tts+open-meteo',
    model: 'llama-3.3-70b-versatile',
    source: 'ai-generated-weather',
    createdAt: new Date().toISOString(),
  };
}
