// Map RMS audio amplitude into the same rising-envelope ADC scale as the sensor.
export function audioReading(samples,baseline,gain=8){
 let energy=0;for(const x of samples)energy+=x*x;
 const rms=samples.length?Math.sqrt(energy/samples.length):0;
 return Math.min(1023,Math.max(0,Math.round(baseline+rms*1023*gain)));
}
