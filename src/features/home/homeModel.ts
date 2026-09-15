export const metersPerMile = 1609.344;
export const maximumAcceptedAccuracy = 100;
export const maximumAcceptedSegment = 50;

export type RunnerCustomization = {
  label: string;
  runner: string;
};

export const defaultRunnerCustomization: RunnerCustomization = {
  label: "SPRINTER",
  runner: "🏃",
};

export const runnerOptions: RunnerCustomization[] = [
  defaultRunnerCustomization,
  { label: "PACE", runner: "🏃🏻" },
  { label: "GRIT", runner: "🏃🏾" },
  { label: "NIGHT", runner: "🏃🏿" },
  { label: "LUNA", runner: "🏃‍♀️" },
  { label: "MAYA", runner: "🏃🏼‍♀️" },
  { label: "ZOE", runner: "🏃🏽‍♀️" },
  { label: "TRAIL", runner: "🏃🏽" },
  { label: "ENDURE", runner: "🏃🏼" },
  { label: "POWER", runner: "🏃🏾‍♂️" },
];

export const villains = {
  werewolf: { label: "WEREWOLF", image: require("../../../assets/images/werewolf.png"), sprintSpeedMph: 6.2, weeklyTargetMiles: 5, difficulty: "EASY" },
  witch: { label: "WITCH", image: require("../../../assets/images/witch.png"), sprintSpeedMph: 8.7, weeklyTargetMiles: 15, difficulty: "MEDIUM" },
  vampire: { label: "VAMPIRE", image: require("../../../assets/images/vampire.png"), sprintSpeedMph: 11.2, weeklyTargetMiles: 30, difficulty: "HARD" },
} as const;

export type VillainKey = keyof typeof villains;

export type Challenge = {
  title: string;
  detail: string;
  durationSeconds: number;
  status: "offered" | "active";
};

export type LocationLike = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

export const villainChallengeMessages: Record<
  VillainKey,
  { headline: string; instruction: string; cue: string }
> = {
  werewolf: { headline: "The werewolf caught up to you.", instruction: "Run for 1 minute to break away from the pack.", cue: "WEREWOLF CATCH-UP" },
  witch: { headline: "The witch is on your trail.", instruction: "Sprint for 1 minute to shake the curse.", cue: "WITCH CATCH-UP" },
  vampire: { headline: "The vampire is right behind you.", instruction: "Move for 1 minute before the night closes in.", cue: "VAMPIRE CATCH-UP" },
};

export const challengePool = [
  { title: "Quick push", detail: "Keep working continuously for 10 minutes.", durationSeconds: 600 },
  { title: "Steady effort", detail: "Keep working continuously for 15 minutes.", durationSeconds: 900 },
  { title: "Trail focus", detail: "Keep working continuously for 20 minutes.", durationSeconds: 1200 },
  { title: "Long haul", detail: "Keep working continuously for 30 minutes.", durationSeconds: 1800 },
  { title: "Deep endurance", detail: "Keep working continuously for 45 minutes.", durationSeconds: 2700 },
  { title: "Hour of power", detail: "Keep working continuously for 60 minutes.", durationSeconds: 3600 },
];

export function getDailyChallenge() {
  const dayNumber = Math.floor(Date.now() / 86400000);
  const weightedPool = [challengePool[0], challengePool[0], challengePool[0], challengePool[1], challengePool[1], challengePool[2], challengePool[3], challengePool[4], challengePool[5]];
  return weightedPool[dayNumber % weightedPool.length];
}

export function buildRandomChaseChallenge(villainKey: VillainKey, template = getDailyChallenge()): Challenge {
  void villainKey;

  return { title: template.title, detail: template.detail, durationSeconds: template.durationSeconds, status: "offered" };
}

export function distanceBetweenPoints(start: LocationLike, end: LocationLike) {
  const earthRadius = 6371000;
  const latitudeDelta = ((end.latitude - start.latitude) * Math.PI) / 180;
  const longitudeDelta = ((end.longitude - start.longitude) * Math.PI) / 180;
  const startLatitude = (start.latitude * Math.PI) / 180;
  const endLatitude = (end.latitude * Math.PI) / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
