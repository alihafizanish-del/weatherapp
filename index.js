const $ = id => document.getElementById(id);
const status = $('status');
const result = $('result');
const cityInput = $('cityInput');
const searchBtn = $('searchBtn');
const geoBtn = $('geoBtn');
const unitToggle = $('unitToggle');
const unitLabel = $('unitLabel');

let fetched = null;
let unitIsC = true; // default Celsius

// map Open-Meteo weathercode to readable text & emoji (improved)
const weatherMap = {
  0: {text:'Clear sky', icon:'☀️'},
  1: {text:'Mainly clear', icon:'🌤'},
  2: {text:'Partly cloudy', icon:'⛅'},
  3: {text:'Overcast', icon:'☁️'},
  45: {text:'Fog', icon:'🌫'},
  48: {text:'Depositing rime fog', icon:'🌫'},
  51: {text:'Light drizzle', icon:'🌦'},
  53: {text:'Moderate drizzle', icon:'🌦'},
  55: {text:'Dense drizzle', icon:'🌧'},
  61: {text:'Slight rain', icon:'🌧'},
  63: {text:'Moderate rain', icon:'🌧'},
  65: {text:'Heavy rain', icon:'⛈'},
  71: {text:'Snow', icon:'🌨'},
  80: {text:'Rain showers', icon:'🌦'},
  95: {text:'Thunderstorm', icon:'🌩'},
};

// show status messages
function setStatus(msg, type='info') {
  status.textContent = msg || '';
  status.style.color = type === 'error' ? '#b91c1c' : (type === 'success' ? '#065f46' : '');
}

// format temperature based on toggle
function tempFormat(celsius) {
  if (unitIsC) return `${celsius.toFixed(1)} °C`;
  const f = (celsius * 9/5) + 32;
  return `${f.toFixed(1)} °F`;
}

// small util to fetch JSON with timeout
async function fetchJSON(url, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: {'Accept':'application/json'} });
    clearTimeout(id);
    if (!res.ok) throw new Error(`Network response not ok (${res.status})`);
    return await res.json();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// get country code quick (best-effort) from display_name
function countryCodeFromDisplay(display) {
  // try to take last token after comma, then map common names
  const parts = display.split(',');
  const last = parts[parts.length - 1].trim();
  const short = last.slice(0,2).toLowerCase();
  const mapping = { 'pakistan':'pk','united states':'us','united states of america':'us','india':'in','canada':'ca','united kingdom':'gb','uk':'gb' };
  return mapping[last.toLowerCase()] || short;
}

// ---------- UI update ----------
function showResult(data) {
  fetched = data;
  // flag
  const flag = $('flag');
  const code = countryCodeFromDisplay(data.display_name);
  flag.src = `https://flagcdn.com/w40/${code}.png`;
  flag.alt = data.display_name;

  // location
  $('locationName').textContent = data.display_name;
  $('coords').textContent = `${data.lat.toFixed(3)}, ${data.lon.toFixed(3)}`;

  // temps and condition
  const map = weatherMap[data.iconCode] || {text:'Unknown', icon:'🌈'};
  $('condText').textContent = map.text;
  $('iconWrap').textContent = map.icon;
  $('tempVal').textContent = tempFormat(data.tempC);

  // details (wind, pressure, humidity - Open-Meteo current_weather doesn't provide humidity/pressure)
  $('wind').textContent = data.wind ? `${data.wind.toFixed(1)} km/h` : '—';
  $('pressure').textContent = data.pressure ? `${data.pressure} hPa` : '—';
  $('humidity').textContent = data.humidity ? `${data.humidity}%` : '—';

  // updated time
  const now = new Date();
  $('updated').textContent = `Updated: ${now.toLocaleString()}`;

  result.hidden = false;
  setStatus('Data loaded.', 'success');
}

// ---------- main fetching logic ----------
async function lookupByQuery(query) {
  setStatus('Searching location...');
  result.hidden = true;

  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const locJson = await fetchJSON(nomUrl);
    if (!locJson || !locJson.length) throw new Error('Location not found');
    const { lat, lon, display_name } = locJson[0];

    // call open-meteo (add hourly or current weather)
    setStatus('Fetching weather...');
    const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&pressure_unit=hpa&temperature_unit=celsius&windspeed_unit=kmh`;
    const weatherJson = await fetchJSON(meteoUrl);

    if (!weatherJson.current_weather) throw new Error('Weather data unavailable');

    // open-meteo current_weather includes temperature, windspeed and weathercode
    const cw = weatherJson.current_weather;
    const payload = {
      display_name, lat: Number(lat), lon: Number(lon),
      tempC: Number(cw.temperature),
      wind: Number(cw.windspeed),
      iconCode: Number(cw.weathercode),
      pressure: weatherJson?.hourly_units?.pressure ? undefined : undefined, // keep placeholders
      humidity: undefined // open-meteo separate endpoint required for humidity; we skip for light app
    };

    showResult(payload);
  } catch (err) {
    setStatus(err.message || 'Error fetching data', 'error');
    console.error(err);
  }
}

async function lookupByCoords(lat, lon) {
  setStatus('Fetching weather for your location...');
  result.hidden = true;
  try {
    const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&pressure_unit=hpa&temperature_unit=celsius&windspeed_unit=kmh`;
    const weatherJson = await fetchJSON(meteoUrl);
    if (!weatherJson.current_weather) throw new Error('Weather data unavailable for coordinates');

    // reverse geocode for human-friendly name
    const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    const rev = await fetchJSON(revUrl);

    const cw = weatherJson.current_weather;
    const payload = {
      display_name: rev.display_name || `Coordinates ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
      lat: Number(lat), lon: Number(lon),
      tempC: Number(cw.temperature),
      wind: Number(cw.windspeed),
      iconCode: Number(cw.weathercode)
    };
    showResult(payload);
  } catch (err) {
    setStatus(err.message || 'Error fetching location weather', 'error');
    console.error(err);
  }
}

// ---------- event handlers ----------
searchBtn.addEventListener('click', () => {
  const q = cityInput.value.trim();
  if (!q) { setStatus('Please enter a city or country', 'error'); return; }
  lookupByQuery(q);
});

unitToggle.addEventListener('change', () => {
  unitIsC = !unitToggle.checked ? true : false; // unchecked -> C
  unitLabel.textContent = unitIsC ? '°C' : '°F';
  if (fetched) { $('tempVal').textContent = tempFormat(fetched.tempC); }
});

geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) { setStatus('Geolocation not supported', 'error'); return; }
  setStatus('Requesting your location...');
  navigator.geolocation.getCurrentPosition(
    pos => lookupByCoords(pos.coords.latitude, pos.coords.longitude),
    err => setStatus('Unable to get location: ' + err.message, 'error'),
    { timeout: 10000 }
  );
});

// keyboard: Enter on input triggers search
cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchBtn.click();
});

// initial placeholder
setStatus('Enter a city and click Search, or use the 📍 button for your location');


// let fetchedData = null;

// document.getElementById("searchBtn").addEventListener("click", async () => {
//   const query = document.getElementById("cityInput").value.trim();
//   if (!query) return alert("Please enter city or country!");

//   try {
//     const locRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
//     const locJson = await locRes.json();
//     if (!locJson.length) throw new Error("Location not found");

//     const { lat, lon, display_name } = locJson[0];

//     const weatherRes = await fetch(
//       `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=celsius&windspeed_unit=kmh`
//     );
//     const weatherJson = await weatherRes.json();
//     if (!weatherJson.current_weather) throw new Error("Weather data unavailable");

//     fetchedData = {
//       display_name, lat, lon, tempC: weatherJson.current_weather.temperature,
//       tempF: (weatherJson.current_weather.temperature * 9 / 5 + 32).toFixed(2),
//       iconCode: weatherJson.current_weather.weathercode
//     };

//     alert("✔️ Data fetched! Now click 'Show Weather'");
//   } catch (err) {
//     alert(err.message);
//     fetchedData = null;
//   }
// });

// document.getElementById("showBtn").addEventListener("click", () => {
//   if (!fetchedData) return alert("Please fetch data first!");

//   document.getElementById("location").innerText = `Location: ${fetchedData.display_name}`;

//   const countryMatch = fetchedData.display_name.match(/,\s*([A-Za-z\s]+)$/);
//   if (countryMatch) {
//     const countryName = countryMatch[1].trim();
//     const codes = { Pakistan: 'pk', USA:'us', Canada:'ca', India:'in', UK:'gb' };
//     const code = codes[countryName] || countryName.slice(0,2).toLowerCase();
//     document.getElementById("flag").src = `https://flagcdn.com/w40/${code}.png`;
//   }

//   const icons = {
//     0: "☀️", 1: "🌤", 2: "⛅", 3: "☁️", 45: "🌫",
//     48: "🌫", 51: "🌦", 61: "🌧", 71: "🌨", 80: "🌧", 95: "🌩"
//   };
//   document.getElementById("weatherIcon").alt = icons[fetchedData.iconCode] || "🌈";
//   document.getElementById("weatherIcon").title = icons[fetchedData.iconCode] || "";

//   document.getElementById("tempC").innerText = `Temperature: ${fetchedData.tempC} °C`;
//   document.getElementById("tempF").innerText = `Temperature: ${fetchedData.tempF} °F`;
//   document.getElementById("condition").innerText = `Weather Code: ${fetchedData.iconCode}`;

//   document.getElementById("weatherResult").style.display = "block";
// });




