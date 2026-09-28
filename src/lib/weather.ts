import type { Weather } from '#/lib/moods'

// Current weather from Open-Meteo (free, no key, CORS-enabled), using the
// browser's location. Only called when the user taps "Detect", so the
// location prompt never appears unasked.

export type WeatherReading = {
  weather: Weather
  tempC: number
  description: string
}

// WMO weather interpretation codes → our five buckets.
function bucket(
  code: number,
  tempC: number,
): { weather: Weather; description: string } {
  if (code >= 95) return { weather: 'stormy', description: 'Thunderstorms' }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return { weather: 'rainy', description: 'Rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { weather: 'cold', description: 'Snow' }
  if (tempC < 8)
    return {
      weather: 'cold',
      description: code <= 1 ? 'Clear and cold' : 'Cold and grey',
    }
  if (code === 45 || code === 48)
    return { weather: 'cloudy', description: 'Fog' }
  if (code >= 2)
    return {
      weather: 'cloudy',
      description: code === 2 ? 'Partly cloudy' : 'Overcast',
    }
  return { weather: 'sunny', description: 'Clear skies' }
}

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator))
      return reject(new Error('Location is not available in this browser.'))
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      maximumAge: 30 * 60_000,
      timeout: 10_000,
    })
  })
}

export async function detectWeather(): Promise<WeatherReading> {
  const pos = await position()
  const { latitude, longitude } = pos.coords
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&current=temperature_2m,weather_code`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Weather service unavailable.')
  const json = (await res.json()) as {
    current: { temperature_2m: number; weather_code: number }
  }
  const tempC = Math.round(json.current.temperature_2m)
  return { ...bucket(json.current.weather_code, tempC), tempC }
}
