export const DEFAULTS = Object.freeze({baseline:80,threshold:180,sensitivity:1,debounce:220,window:700,bands:[{brightness:64,color:'#ff0000'},{brightness:153,color:'#00ff00'},{brightness:255,color:'#0000ff'}]});
export const cloneDefaults=()=>JSON.parse(JSON.stringify(DEFAULTS));
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function validate(c){
 const limits={baseline:[0,1023],threshold:[1,1023],sensitivity:[.5,3],debounce:[50,1000],window:[300,1500]};
 for(const [k,[a,b]] of Object.entries(limits))if(!Number.isFinite(c[k])||c[k]<a||c[k]>b||(k!=='sensitivity'&&!Number.isInteger(c[k])))return false;
 return Array.isArray(c.bands)&&c.bands.length===3&&c.bands.every(b=>Number.isInteger(b.brightness)&&b.brightness>=0&&b.brightness<=255&&/^#[\da-f]{6}$/i.test(b.color));
}
export function thresholds(c){const gain=Math.round(c.sensitivity*100);return {high:c.baseline+Math.ceil(c.threshold*100/gain),release:c.baseline+Math.floor(c.threshold*70/gain)};}
export function createDetector(){return {latched:false,lastClap:-Infinity,events:[],pending:0,lastGesture:0,completed:0,lastCount:0,mode:'sleep',level:0,paused:false,phase:0,lastUpdate:null,lastAction:'Sleeping · 1 or 2+ claps to wake'};}
export function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export function applyGesture(d,c,count){
 if(d.mode==='sleep'){if(count===1){d.mode='brightness';d.level=0;d.lastAction='Single clap → awake, brightness level 1';}else if(count>=2){d.mode='colors';d.level=0;d.phase=0;d.paused=false;d.lastAction='2+ claps → awake, color cycle started';}else d.lastAction=`${count} claps ignored while sleeping`;return;}
 if(d.mode==='brightness'){
  if(count===1){if(d.level<2){d.level++;d.lastAction=`Single clap → brightness level ${d.level+1}`;}else{d.mode='sleep';d.lastAction='Single clap → sleeping';}}
  else if(count>=3){d.mode='colors';d.phase=0;d.paused=false;d.lastAction='3+ claps → color cycle started';}
  else d.lastAction=`${count} claps → no action in brightness mode`;
 }else if(count>=2){d.mode='sleep';d.paused=false;d.lastAction='2+ claps → sleeping';}
 else if(count===1){d.paused=!d.paused;d.lastAction=d.paused?'Single clap → current color paused':'Single clap → color cycle resumed';}
 else d.lastAction=`${count} claps → no action in color mode`;
}
export function advance(d,c,now){
 const elapsed=d.lastUpdate===null?0:Math.max(0,now-d.lastUpdate);d.lastUpdate=now;
 if(d.mode==='colors'&&!d.paused)d.phase=(d.phase+elapsed)%15000;
 if(d.pending&&now-d.lastGesture>=c.window){const count=d.pending;d.pending=0;d.lastCount=count;d.completed++;applyGesture(d,c,count);}
}
// A button press is an explicit clap; physical samples still use threshold/debounce.
export function recordClap(d,c,now,raw){
 advance(d,c,now);d.lastClap=now;d.lastGesture=now;d.pending=Math.min(4,d.pending+1);
 d.events.push({time:now,raw});d.events=d.events.slice(-100);
}
export function feed(d,c,raw,now){
 advance(d,c,now);
 const scaled=Math.max(0,raw-c.baseline)*Math.round(c.sensitivity*100);
 if(scaled<=c.threshold*70)d.latched=false;
 let accepted=false;
 if(scaled>=c.threshold*100&&!d.latched){d.latched=true;if(now-d.lastClap>=c.debounce){recordClap(d,c,now,raw);accepted=true;}}
 return {accepted,signal:scaled/100,count:d.pending};
}
export function lampFor(c,d){
 if(d.mode==='sleep')return {index:-1,brightness:0,color:'#000000'};
 let color='#ffddaa';
 if(d.mode==='colors'){
  const i=Math.floor(d.phase/5000)%3,t=(d.phase%5000)/5000,a=rgb(c.bands[i].color),b=rgb(c.bands[(i+1)%3].color);
  color='#'+a.map((v,j)=>Math.floor(v*(1-t)+b[j]*t).toString(16).padStart(2,'0')).join('');
 }
 return {index:d.level,brightness:c.bands[d.level].brightness,color};
}
export function configCode(c){return `// Clap It! | 10-bit rising-envelope ADC\nconstexpr uint16_t BASELINE = ${c.baseline};\nconstexpr uint16_t SENSITIVITY_X100 = ${Math.round(c.sensitivity*100)};\nconstexpr uint16_t CLAP_THRESHOLD = ${c.threshold};\nconstexpr uint8_t RELEASE_PERCENT = 70;\nconstexpr uint32_t DEBOUNCE_MS = ${c.debounce};\nconstexpr uint32_t GESTURE_GAP_MS = ${c.window};\nconstexpr uint32_t COLOR_STEP_MS = 5000;\nconstexpr uint8_t BRIGHTNESS[3] = { ${c.bands.map(b=>b.brightness).join(', ')} };\nstruct RGB { uint8_t r, g, b; };\nconstexpr RGB WHITE = {255, 221, 170};\nconstexpr RGB COLORS[3] = {\n${c.bands.map(b=>'  { '+rgb(b.color).join(', ')+' }').join(',\n')}\n};\n// Sleep: 1 clap wakes in white; 2+ claps wake in colors (level 1).\n// Brightness: 1 clap -> level 2 -> level 3 -> sleep.\n// Awake: 3+ claps start colors at the current brightness.\n// Colors: 1 clap pauses/resumes at the current color; 2+ claps turn off.\n// Only consecutive claps belong to the same command.\n// A quiet gap ends the command and resets its count to zero.\n// Other gestures are ignored. Brightness is global, RGB unscaled.`;}
export function detectorCode(){return `enum class Mode { Sleep, Brightness, Colors };\nMode mode = Mode::Sleep;\nuint8_t level = 0, pending = 0;\nbool latched = false, hasClap = false, paused = false, hasTick = false;\nuint32_t lastClap = 0, lastGesture = 0, lastTick = 0, colorPhase = 0;\nstruct LampOutput { uint8_t brightness; RGB color; };\n\nvoid applyGesture(uint8_t count) {\n  if (mode == Mode::Sleep) {\n    if (count == 1) { mode = Mode::Brightness; level = 0; }\n    else if (count >= 2) { mode = Mode::Colors; level = 0; colorPhase = 0; paused = false; }\n  } else if (mode == Mode::Brightness) {\n    if (count == 1) {\n      if (level < 2) ++level; else mode = Mode::Sleep;\n    } else if (count >= 3) {\n      mode = Mode::Colors; colorPhase = 0; paused = false;\n    }\n  } else if (count >= 2) { mode = Mode::Sleep; paused = false; }\n  else if (count == 1) paused = !paused;\n}\n\nuint8_t mixChannel(uint8_t a, uint8_t b, uint32_t phase) {\n  return (uint32_t(a) * (COLOR_STEP_MS - phase) + uint32_t(b) * phase) / COLOR_STEP_MS;\n}\n\n// Call continuously: LampOutput out = updateLamp(raw, millis());\nLampOutput updateLamp(uint16_t raw, uint32_t now) {\n  uint32_t elapsed = hasTick ? uint32_t(now - lastTick) : 0;\n  hasTick = true; lastTick = now;\n  if (mode == Mode::Colors && !paused)\n    colorPhase = (colorPhase + elapsed % (3 * COLOR_STEP_MS)) % (3 * COLOR_STEP_MS);\n  if (pending && uint32_t(now - lastGesture) >= GESTURE_GAP_MS) {\n    uint8_t count = pending; pending = 0; applyGesture(count);\n  }\n  uint32_t signal = uint32_t(raw > BASELINE ? raw - BASELINE : 0) * SENSITIVITY_X100;\n  if (signal <= uint32_t(CLAP_THRESHOLD) * RELEASE_PERCENT) latched = false;\n  if (signal >= uint32_t(CLAP_THRESHOLD) * 100 && !latched) {\n    latched = true;\n    if (!hasClap || uint32_t(now - lastClap) >= DEBOUNCE_MS) {\n      hasClap = true; lastClap = now; lastGesture = now;\n      if (pending < 4) ++pending;\n    }\n  }\n  if (mode == Mode::Sleep) return {0, {0, 0, 0}};\n  RGB color = WHITE;\n  if (mode == Mode::Colors) {\n    uint8_t i = colorPhase / COLOR_STEP_MS;\n    uint32_t phase = colorPhase % COLOR_STEP_MS;\n    RGB a = COLORS[i], b = COLORS[(i + 1) % 3];\n    color = {mixChannel(a.r, b.r, phase), mixChannel(a.g, b.g, phase), mixChannel(a.b, b.b, phase)};\n  }\n  return {BRIGHTNESS[level], color};\n}\n// Apply returned global brightness and RGB with your LED library.\n// No delay(): keep sampling, even while a color is paused.`;}
