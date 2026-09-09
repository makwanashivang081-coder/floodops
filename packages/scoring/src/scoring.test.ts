import assert from "node:assert/strict";
import { test } from "node:test";
import { credibility } from "./credibility";
import { planWithSopRules } from "./planner";
import { risk } from "./risk";
import { severity } from "./severity";

test("credibility rewards photo + water more than checkbox-only", () => {
  const noPhoto = credibility({
    hasPhoto: false,
    waterDetected: true,
    distanceMeters: 40,
    ageMinutes: 10,
    duplicateHit: false,
    hasGps: true,
  });
  const withPhoto = credibility({
    hasPhoto: true,
    waterDetected: true,
    distanceMeters: 40,
    ageMinutes: 10,
    duplicateHit: false,
    hasGps: true,
  });
  assert.ok(withPhoto.value > noPhoto.value);
  assert.ok(withPhoto.value >= 0.85);
  assert.ok(noPhoto.value < 0.6);
});

test("severity escalates with depth and rain", () => {
  assert.equal(
    severity({ depthCue: "vehicle", nearbyVerifiedReports: 0, rainIntensityMm1h: 1 }).value,
    "impassable",
  );
  assert.equal(
    severity({ depthCue: "unknown", nearbyVerifiedReports: 0, rainIntensityMm1h: 2 }).value,
    "minor",
  );
});

test("risk is deterministic and higher for blackspot+rain", () => {
  const base = {
    id: "1",
    name: "A",
    lat: 18.5,
    lon: 73.8,
    isBlackspot: false,
    lowPointScore: 0.4,
    rainNext3hMm: 5,
    verifiedReportCount: 0,
  };
  const hot = {
    ...base,
    id: "2",
    isBlackspot: true,
    blackspotSince: 2019,
    lowPointScore: 0.9,
    rainNext3hMm: 45,
    verifiedReportCount: 3,
  };
  assert.ok(risk(hot).value > risk(base).value);
  assert.equal(risk(hot).value, risk(hot).value);
});

test("sop planner returns actions from vocabulary", () => {
  const plan = planWithSopRules(
    [
      {
        id: "s1",
        name: "Underpass",
        lat: 18.48,
        lon: 73.82,
        isBlackspot: true,
        blackspotSince: 2019,
        lowPointScore: 0.91,
        rainNext3hMm: 42,
        verifiedReportCount: 3,
        latestSeverity: "impassable",
      },
    ],
    [{ id: "p1", kind: "pump", name: "Pump 1", available: true }],
  );
  assert.equal(plan.length, 1);
  assert.ok(["pump", "desilt", "barricade", "monitor"].includes(plan[0]!.action));
  assert.equal(plan[0]!.planner, "sop-rules");
});
