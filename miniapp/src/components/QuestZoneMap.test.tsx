import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestZoneMap, zoneFix, zoneLayout } from "./QuestZoneMap";
import type { Quest } from "../types";
const quest: Quest = { id:"q", title:"Checkpoint", description:"Public path", latitude:40, longitude:44, radius_m:250, base_xp:175, run:null };
const sample = {latitude:40.01,longitude:44,horizontal_accuracy:18};
describe("schematic checkpoint zone",()=>{
 it("uses configured content without inventing a fix or checkpoint label",()=>{
  const html=renderToStaticMarkup(<QuestZoneMap quest={quest}/>);
  expect(html).toContain("250 M");expect(html).toContain("+175 XP");expect(html).not.toContain("YOUR FIX");expect(html).not.toContain("checkpoint-caption");expect(html).toContain("OPEN IN MAPS");
  expect(renderToStaticMarkup(<QuestZoneMap quest={{...quest,place_label:"FIELD TEST CHECKPOINT"}}/>)).toContain("FIELD TEST CHECKPOINT");
 });
 it("keeps real sample distance, accuracy and age in the footer",()=>{
  const fix=zoneFix(quest,sample)!;expect(fix.outside).toBe(fix.distance-250);expect(fix.accuracy).toBe(18);
  const html=renderToStaticMarkup(<QuestZoneMap quest={quest} sample={sample} sampleAge="2 MIN AGO"/>);
  expect(html).toContain("1.1\u00a0KM");expect(html).toContain("±18\u00a0M");expect(html).toContain("2 MIN AGO");expect(html).toContain("NOT A LIVE POSITION");
  expect(html).toContain("Last check-in was 1.1 KM from the checkpoint");
 });
 it("omits expired and invalid samples",()=>{
  for(const data of [{latitude:NaN,longitude:44,horizontal_accuracy:18},{latitude:40,longitude:44,horizontal_accuracy:-1}])expect(zoneFix(quest,data)).toBeNull();
  expect(renderToStaticMarkup(<QuestZoneMap quest={quest} sample={sample} sampleAge={null}/>)).not.toContain("last-fix");
  expect(renderToStaticMarkup(<QuestZoneMap quest={{...quest,latitude:null,radius_m:null}}/>)).toContain("Checkpoint map is unavailable");
 });
 it("keeps the threshold and a distinct far presentation",()=>{
  for(const [meters,far] of [[1249,false],[1250,false],[1251,true]] as const){
   const latitude=40+meters/6371000*180/Math.PI;
   expect(zoneFix(quest,{latitude,longitude:44,horizontal_accuracy:14})!.far).toBe(far);
  }
  const html=renderToStaticMarkup(<QuestZoneMap quest={quest} sample={{...sample,latitude:41}}/>);
  expect(html).toContain('data-direction="horizontal-left"');expect(html).toContain("broken-fix-line");expect(html).not.toContain('class="fix-dot"');
  expect(html).toContain("YOUR FIX · OFF THE MAP");expect(html).toContain("SCHEMATIC · NOT TO SCALE · NORTH ↑");
  expect(renderToStaticMarkup(<QuestZoneMap quest={quest} sample={sample}/>)).not.toContain("NOT TO SCALE");
 });
 it("scales nearby distances and connects the line to the zone boundary",()=>{
  const fix=zoneFix(quest,{...sample,latitude:40.0025})!,g=zoneLayout(fix,300,220);
  expect(Math.hypot(g.x-g.cx,g.y-g.cy)).toBeCloseTo(fix.distance/fix.radius*g.radius);
  expect(Math.hypot(g.zoneX-g.cx,g.zoneY-g.cy)).toBeCloseTo(g.radius);
  const inside=zoneLayout(zoneFix(quest,{...sample,latitude:40}),300,220);
  expect([inside.zoneX,inside.zoneY]).toEqual([inside.cx,inside.cy]);
 });
 it("bounds nearby points with at least 24px clear space at every bearing",()=>{
  for(const width of [284,324,344])for(const height of [160,179.2,180,220])for(const bearing of [0,45,90,135,180,225,270,315]){
   const fix={...zoneFix(quest,sample)!,far:false,bearing:bearing*Math.PI/180},g=zoneLayout(fix,width,height);
   expect(g.x-6.5).toBeGreaterThanOrEqual(24);expect(width-g.x-6.5).toBeGreaterThanOrEqual(24);
   expect(g.y-6.5).toBeGreaterThanOrEqual(24);expect(height-g.y-6.5).toBeGreaterThanOrEqual(24);
   expect(Math.hypot(g.x-g.cx,g.y-g.cy)).toBeGreaterThan(g.radius);
   if(g.y<48)expect(g.labelY).toBeGreaterThan(g.y+6.5);
  }
 });
});

it("keeps an inside fix label below the marker and checkpoint heading for local errors",()=>{
 const g=zoneLayout(zoneFix(quest,{...sample,latitude:40}),300,220);
 expect(g.labelY-24).toBeGreaterThan(g.y+6.5);
});

it('idle map has a large configured radius and map landmarks without inventing a player fix',()=>{
 const g=zoneLayout(null,344,154);expect(g.radius).toBeGreaterThan(60);expect(g.cy-g.radius).toBeGreaterThan(0);expect(g.cy+g.radius).toBeLessThan(154);
 const html=renderToStaticMarkup(<QuestZoneMap quest={quest}/>);for(const text of ['is-idle','zone-street-blocks','idle-radius-label','250 M','idle-map-north'])expect(html).toContain(text);
 expect(html).not.toContain('YOUR FIX');expect(html).not.toContain('last-fix');
});
