import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mount } from "./fixtures";
import type { Quest } from "../src/types";

test.use({ hasTouch:true });

const artifacts = process.env.AYLOOR_DENSITY_DIR || ".visual-qa/quests-density/after";
const quests: Quest[] = ["First Checkpoint","Republic Square","Cascade","Vernissage Market","Blue Mosque"].map((title,index)=>({
  id:`q${index}`,title,description:"Frontend density fixture only.",base_xp:100,radius_m:100,latitude:40,longitude:44,
  run:index===1 ? {id:`r${index}`,status:"started"} : index===2 ? null : {id:`r${index}`,status:"completed"},
}));

for (const width of [320,360,390]) test(`QUESTS progress and filters density at ${width}px`, async ({page})=>{
  await page.setViewportSize({width,height:844}); await page.emulateMedia({reducedMotion:"reduce"});
  const {counters}=await mount(page,{quests,seasonXp:300});
  await page.getByRole("navigation").getByRole("button",{name:"QUESTS",exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>{
    const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    const title=box(".quests-screen .page-title"),summary=box(".season-summary"),badge=box(".season-summary strong"),label=box(".season-summary > span"),tiles=box(".season-segments"),tile=box(".checkpoint-segment"),filters=box(".quest-filters"),card=box(".quest-row");
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".quest-filters button")).map(el=>{
      const r=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect();
      range.selectNode(el.firstChild!);const label=range.getBoundingClientRect();
      const count=el.querySelector("span")!;const countRange=document.createRange();countRange.selectNodeContents(count);const c=countRange.getBoundingClientRect();
      return{countGap:c.x-label.right,centerDifference:Math.abs((c.y+c.height/2)-(label.y+label.height/2)),countWidth:c.width,labelLines:range.getClientRects().length,height:r.height,width:r.width,textHeight:text.height,lineHeight:parseFloat(getComputedStyle(el).lineHeight),border:getComputedStyle(el).borderLeftWidth};
    });
    return{width:innerWidth,title,summary,badge,label,tiles,tile,filters,card,buttons,
      blockHeight:card.y-title.bottom,gaps:{underlineToHeader:summary.y-title.bottom,headerToTiles:tiles.y-summary.bottom,tilesToFilters:filters.y-tiles.bottom,filtersToCard:card.y-filters.bottom},overflow:document.documentElement.scrollWidth>innerWidth};
  });
  mkdirSync(artifacts,{recursive:true});writeFileSync(`${artifacts}/${width}.json`,JSON.stringify(geometry,null,2));
  await page.screenshot({path:`${artifacts}/${width}-quests.png`});
  await page.screenshot({path:`${artifacts}/${width}-block.png`,clip:{x:0,y:geometry.tiles.y-3,width,height:Math.ceil(geometry.card.bottom-geometry.tiles.y+13)}});
  // Captured from the pre-change fixture at these viewports.
  const before={blockHeight:width===320 ? 179 : width===360 ? 180 : 181.5,card:{height:width===320 ? 91.078125 : width===360 ? 92.078125 : 93.078125}};
  const saving=1-geometry.blockHeight/before.blockHeight;
  expect(saving).toBeGreaterThanOrEqual(.25);expect(saving).toBeLessThanOrEqual(.30);
  expect(geometry.card.height).toBe(before.card.height);
  expect(geometry.tile.height).toBe(30);expect(geometry.filters.height).toBe(44);
  expect(geometry.gaps).toEqual({underlineToHeader:8,headerToTiles:6,tilesToFilters:6,filtersToCard:8});
  for(const button of await page.locator(".quest-filters button").all()) {
    await expect(button).toHaveCSS("border-top-width","3px");await expect(button).toHaveCSS("border-bottom-width","3px");await expect(button).toHaveCSS("border-right-width","3px");
    await expect(button.locator("span")).toBeVisible();
  }
  await expect(page.locator(".quest-filters button").first()).toHaveCSS("border-left-width","3px");
  expect(geometry.overflow).toBe(false); expect(geometry.label.right).toBeLessThan(geometry.badge.x);
  for(const b of geometry.buttons){expect(b.height).toBe(44);expect(b.labelLines).toBe(1);expect(b.countWidth).toBeGreaterThan(0);expect(b.countGap).toBeGreaterThanOrEqual(3);expect(b.centerDifference).toBeLessThanOrEqual(3);}
  await expect(page.locator(".season-summary")).toHaveText("SEASON PROGRESS3 / 5 · 300 XP");
  await expect(page.locator(".checkpoint-segment")).toHaveCount(5);await expect(page.locator(".checkpoint-segment.filled")).toHaveCount(3);
  for(const [label,count] of [["ALL",5],["TO DO",2],["DONE",3]] as const){
    await page.getByRole("button",{name:`${label} ${count}`,exact:true}).tap();await expect(page.locator(".quest-row")).toHaveCount(count);
    await expect(page.locator(".checkpoint-segment")).toHaveCount(5);
  }
  const todo=page.getByRole("button",{name:"TO DO 2",exact:true});
  await todo.focus();await page.keyboard.press("Enter");await expect(todo).toHaveAttribute("aria-pressed","true");await expect(page.locator(".quest-row")).toHaveCount(2);
  await page.keyboard.press("Tab");const done=page.getByRole("button",{name:"DONE 3",exact:true});await expect(done).toBeFocused();
  await page.keyboard.press("Space");await expect(done).toHaveAttribute("aria-pressed","true");await expect(page.locator(".quest-row")).toHaveCount(3);
  expect(counters.starts).toBe(0);expect(counters.checkins).toBe(0);expect(counters.gps).toBe(0);
});
