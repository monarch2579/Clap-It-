export const DEFAULTS = Object.freeze({baseline:80,threshold:180,sensitivity:1,debounce:180,window:5000,bands:[{min:1,brightness:64,color:'#8fe3bf'},{min:3,brightness:153,color:'#ffcc76'},{min:5,brightness:255,color:'#ff704f'}]});
export const cloneDefaults=()=>JSON.parse(JSON.stringify(DEFAULTS));
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function validate(c){
  const limits={baseline:[0,1023],threshold:[1,1023],sensitivity:[0.5,3],debounce:[50,1000],window:[1000,10000]};
  for(const [k,[min,max]] of Object.entries(limits)) if(!Number.isFinite(c[k])||c[k]<min||c[k]>max||(k!=='sensitivity'&&!Number.isInteger(c[k]))) return false;
  return Array.isArray(c.bands)&&c.bands.length===3&&c.bands.every((b,i)=>Number.isInteger(b.min)&&b.min>=1&&b.min<=99&&(!i||b.min>c.bands[i-1].min)&&Number.isInteger(b.brightness)&&b.brightness>=0&&b.brightness<=255&&/^#[\da-f]{6}$/i.test(b.color));
}
export function thresholds(c){const gain=Math.round(c.sensitivity*100);return {high:c.baseline+Math.ceil(c.threshold*100/gain),release:c.baseline+Math.floor(c.threshold*70/gain)};}
export function createDetector(){return {latched:false,lastClap:-Infinity,claps:[],events:[]};}
export function expire(d,c,now){d.claps=d.claps.filter(t=>now-t<c.window);return d.claps.length;}
export function feed(d,c,raw,now){
  expire(d,c,now);
  const scaledSignal=Math.max(0,raw-c.baseline)*Math.round(c.sensitivity*100),signal=scaledSignal/100;
  if(scaledSignal<=c.threshold*70)d.latched=false;
  let accepted=false;
  if(scaledSignal>=c.threshold*100&&!d.latched){
    d.latched=true;
    if(now-d.lastClap>=c.debounce){d.lastClap=now;d.claps.push(now);d.events.push({time:now,raw});d.events=d.events.slice(-100);accepted=true;}
  }
  return {accepted,signal,count:d.claps.length};
}
export function lampFor(c,count){let index=-1;for(let i=0;i<c.bands.length;i++)if(count>=c.bands[i].min)index=i;return index<0?{index,brightness:0,color:'#000000',min:0}:{...c.bands[index],index};}
export function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export function configCode(c){
 const bands=c.bands.map(b=>`  { ${b.min}, ${b.brightness}, ${rgb(b.color).join(', ')} }`).join(',\n');
 return `// Clap It! | rising envelope, 10-bit ADC (0..1023)\n// signal = max(0, raw - BASELINE) * sensitivity\nconstexpr uint16_t BASELINE = ${c.baseline};\nconstexpr uint16_t SENSITIVITY_X100 = ${Math.round(c.sensitivity*100)}; // ${c.sensitivity.toFixed(2)}x\nconstexpr uint16_t CLAP_THRESHOLD = ${c.threshold};\nconstexpr uint8_t RELEASE_PERCENT = 70;\nconstexpr uint32_t DEBOUNCE_MS = ${c.debounce};\nconstexpr uint32_t WINDOW_MS = ${c.window};\nstruct Band { uint8_t minClaps, brightness, r, g, b; };\nconstexpr Band BANDS[] = {\n${bands}\n};\n// Select the last band where count >= minClaps.\n// Below the first band: brightness 0, RGB(0, 0, 0).\n// Brightness is global (0..255); RGB values are unscaled.\n// Window keeps claps younger than WINDOW_MS.`;
}
export function detectorCode(){return `// Call updateClaps(raw, millis()) for every sensor sample.\nconstexpr uint16_t CAPACITY = WINDOW_MS / DEBOUNCE_MS + 2;\nuint32_t clapTimes[CAPACITY];\nuint16_t clapCount = 0;\nuint32_t lastClap = 0;\nbool hasClap = false, latched = false;\n\nBand updateClaps(uint16_t raw, uint32_t now) {\n  while (clapCount && uint32_t(now - clapTimes[0]) >= WINDOW_MS) {\n    for (uint16_t i = 1; i < clapCount; ++i)\n      clapTimes[i - 1] = clapTimes[i];\n    --clapCount;\n  }\n  uint32_t signal = uint32_t(raw > BASELINE ? raw - BASELINE : 0) * SENSITIVITY_X100;\n  if (signal <= uint32_t(CLAP_THRESHOLD) * RELEASE_PERCENT) latched = false;\n  if (signal >= uint32_t(CLAP_THRESHOLD) * 100 && !latched) {\n    latched = true;\n    if (!hasClap || uint32_t(now - lastClap) >= DEBOUNCE_MS) {\n      if (clapCount < CAPACITY) clapTimes[clapCount++] = now;\n      lastClap = now; hasClap = true;\n    }\n  }\n  Band output = {0, 0, 0, 0, 0};\n  for (const Band &band : BANDS)\n    if (clapCount >= band.minClaps) output = band;\n  return output;\n}\n// Apply returned brightness and RGB to your LED library.\n// Keep sampling; do not use delay(). Reset state after config changes.`;}
