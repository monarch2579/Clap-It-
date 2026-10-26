import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefaults,validate,thresholds,createDetector,feed,expire,lampFor,configCode} from '../dist/model.mjs';
test('threshold crossing counts once until release; debounce blocks echoes',()=>{
 const c=cloneDefaults(),d=createDetector();
 assert.equal(feed(d,c,259,0).accepted,false);
 assert.equal(feed(d,c,260,1).accepted,true);
 assert.equal(feed(d,c,500,100).accepted,false);
 feed(d,c,80,120);
 assert.equal(feed(d,c,300,130).accepted,false);
 assert.equal(feed(d,c,300,200).accepted,false,'held-high echo stays latched');
 feed(d,c,200,220);
 assert.equal(feed(d,c,260,221).accepted,true);
 assert.equal(d.claps.length,2);
});
test('sensitivity and 70% release match the effective ADC values',()=>{
 const c=cloneDefaults();c.sensitivity=2;
 assert.deepEqual(thresholds(c),{high:170,release:143});
 const d=createDetector();assert.equal(feed(d,c,170,0).accepted,true);
 feed(d,c,144,200);assert.equal(d.latched,true);
 feed(d,c,143,201);assert.equal(d.latched,false);
 assert.equal(feed(d,c,170,202).accepted,true);
});
test('rolling window excludes claps exactly at its age boundary',()=>{
 const c=cloneDefaults(),d=createDetector();feed(d,c,300,0);feed(d,c,80,200);feed(d,c,300,250);
 assert.equal(expire(d,c,4999),2);assert.equal(expire(d,c,5000),1);assert.equal(expire(d,c,5250),0);
});
test('all inclusive band boundaries, idle, brightness and colors are preserved',()=>{
 const c=cloneDefaults();
 assert.equal(lampFor(c,0).index,-1);assert.equal(lampFor(c,1).index,0);assert.equal(lampFor(c,2).index,0);assert.equal(lampFor(c,3).index,1);assert.equal(lampFor(c,4).index,1);assert.equal(lampFor(c,5).index,2);assert.equal(lampFor(c,99).index,2);
 c.bands[1].brightness=197;c.bands[1].color='#123456';assert.equal(lampFor(c,3).brightness,197);assert.equal(lampFor(c,3).color,'#123456');
 assert.match(configCode(c),/\{ 3, 197, 18, 52, 86 \}/);
});
test('stored or edited configurations reject overlapping ranges and corrupt values',()=>{
 const c=cloneDefaults();assert.equal(validate(c),true);c.bands[1].min=1;assert.equal(validate(c),false);c.bands[1].min=3;c.threshold=NaN;assert.equal(validate(c),false);
});
