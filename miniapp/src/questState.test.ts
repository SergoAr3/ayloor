import { describe, expect, it, vi } from "vitest";
import { ApiError, ApiTransportError } from "./apiErrors";
import { checkInAge, isFarCheckIn, outsideZoneMeters, checkInFeedback, currentQuest, formatCheckInDistance, mapsLink, sampleDistance, startQuest } from "./questState";
import type { Quest, Run } from "./types";

const quest: Quest = { id: "q", title: "Real checkpoint", description: "Public spot", base_xp: 100, latitude: 40, longitude: 44, radius_m: 100, run: null };
const run: Run = { id: "r", status: "started" };

describe("server quest state", () => {
  it("prefers an existing run, then an available quest, then a completed one", () => {
    const done = { ...quest, run: { ...run, status: "completed" as const } };
    const started = { ...quest, id: "started", run };
    expect(currentQuest([done, quest, started])).toBe(started);
    expect(currentQuest([done, quest])).toBe(quest);
    expect(currentQuest([done])).toBe(done);
    expect(currentQuest([])).toBeUndefined();
  });
  it("recovers a lost start response with one POST and a server read", async () => {
    const mutate = vi.fn().mockRejectedValue(new ApiTransportError("Lost response"));
    const detail = vi.fn().mockResolvedValue({ ...quest, run });
    await expect(startQuest(mutate, detail)).resolves.toEqual(run);
    expect(mutate).toHaveBeenCalledOnce();
    expect(detail).toHaveBeenCalledOnce();
  });
  it("reconciles a concurrent start conflict including completed state", async () => {
    const done = { ...run, status: "completed" };
    await expect(startQuest(() => Promise.reject(new ApiError(409, "This team has already started or completed this quest")), () => Promise.resolve({ ...quest, run: done } as Quest))).resolves.toEqual(done);
  });
  it.each([new ApiError(409, "Team must be active"), new ApiError(403, "Join a team first"), new ApiError(422, "Invalid input")])("preserves unrelated validation errors", async error => {
    const detail = vi.fn();
    await expect(startQuest(() => Promise.reject(error), detail)).rejects.toBe(error);
    expect(detail).not.toHaveBeenCalled();
  });
  it("keeps ambiguous errors when no started/completed run is confirmed", async () => {
    const error = new ApiTransportError("Offline");
    await expect(startQuest(() => Promise.reject(error), () => Promise.resolve(quest))).rejects.toBe(error);
    await expect(startQuest(() => Promise.reject(error), () => Promise.reject(new Error("Still offline")))).rejects.toBe(error);
  });
});
describe("location presentation", () => {
  it("maps use server coordinates and suppress development placeholder", () => {
    expect(mapsLink(quest)).toContain("query=40%2C44");
    expect(mapsLink({ ...quest, latitude: 0, longitude: 0 })).toBeNull();
    expect(mapsLink({ ...quest, latitude: null })).toBeNull();
    expect(mapsLink({ ...quest, latitude: NaN })).toBeNull();
    expect(mapsLink({ ...quest, longitude: 200 })).toBeNull();
  });
  it("calculates approximate straight-line sample distance without deciding completion", () => {
    expect(sampleDistance({ latitude: 40, longitude: 44, horizontal_accuracy: 20 }, quest)).toBe(0);
    expect(sampleDistance({ latitude: 40.01, longitude: 44, horizontal_accuracy: 20 }, quest)).toBeGreaterThan(1000);
    expect(sampleDistance({ latitude: NaN, longitude: 44, horizontal_accuracy: 20 }, quest)).toBeNull();
  });
});

describe("check-in feedback presentation", () => {
  it.each([
    ["You are outside the checkpoint radius", "OUTSIDE CHECK-IN ZONE"],
    ["Location permission denied. Open location settings and retry.", "LOCATION ACCESS DENIED"],
    ["Location is unavailable on this device.", "GPS UNAVAILABLE"],
    ["Location request timed out. Please retry.", "CHECK-IN TIMED OUT"],
    ["GPS accuracy is too low; retry with a clearer view of the sky", "GPS ACCURACY TOO LOW"],
    ["GPS accuracy is unavailable. Please retry outdoors.", "GPS ACCURACY UNAVAILABLE"],
    ["Verification temporarily unavailable", "CHECK-IN FAILED"],
  ])("turns %s into actionable local feedback", (error, title) => {
    const feedback = checkInFeedback(error);
    expect(feedback.title).toBe(title);
    expect(feedback.description).toMatch(/try|retry/i);
  });
});

describe("check-in distance formatting", () => {
  it.each([[240,"240 M"],[87,"87 M"],[999,"999 M"],[1000,"1.0 KM"],[1249,"1.2 KM"],[9999,"10.0 KM"],[10000,"10.0 KM"],[86239,"86.2 KM"],[86000,"86.0 KM"],[86449,"86.4 KM"],[86500,"86.5 KM"]])("formats %s meters as %s", (meters, expected) => {
    expect(formatCheckInDistance(meters as number)).toBe(expected);
  });
});

describe("check-in presentation thresholds and age",()=>{
  it.each([[501,100,false],[1000,100,false],[1001,100,true],[2500,500,false],[2501,500,true],[999,100,false]])("classifies %s m with radius %s",(distance,radius,expected)=>expect(isFarCheckIn(distance as number,radius as number)).toBe(expected));
  it.each([[0,"JUST NOW"],[59999,"JUST NOW"],[60000,"1 MIN AGO"],[14*60000,"14 MIN AGO"],[15*60000,null],[60*60000,null]])("labels age %s",(elapsed,expected)=>expect(checkInAge(1000,1000+Number(elapsed))).toBe(expected));
  it.each([[240,100,140],[244,100,140],[245,100,150],[100,100,0],[80,100,0]])("rounds near outside distance to ten metres",(distance,radius,expected)=>expect(outsideZoneMeters(distance,radius)).toBe(expected));
});

it("keeps GPS accuracy in metres with the shared display formatter",()=>{
 expect(formatCheckInDistance(14,true)).toBe("14 M");
 expect(formatCheckInDistance(1200,true)).toBe("1200 M");
});

it("retains numeric metres until presentation and leaves the GPS sample unchanged",()=>{
 const sample={latitude:40+86239/6371000*180/Math.PI,longitude:44,horizontal_accuracy:11};
 const original={...sample};const meters=sampleDistance(sample,quest);
 expect(meters).toBe(86239);expect(typeof meters).toBe("number");
 expect(formatCheckInDistance(meters!)).toBe("86.2 KM");expect(sample).toEqual(original);
});
