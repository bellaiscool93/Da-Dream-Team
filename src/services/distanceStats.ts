import AsyncStorage from "@react-native-async-storage/async-storage";

const distanceStatsKey = "questtfit.distance-stats.v1";
const workoutHistoryKey = "questtfit.workout-history.v1";
const challengeStreakKey = "questtfit.challenge-streak.v1";
const weeklyChaseResultsKey = "questtfit.weekly-chase-results.v1";

export type WeeklyDistancePoint = {
  dateKey: string;
  label: string;
  miles: number;
};

export type WorkoutRecord = {
  id: string;
  dateKey: string;
  startedAt: string;
  distanceMeters: number;
  durationSeconds: number;
  eventsCompleted: number;
};

export type DistanceSummary = {
  todayMeters: number;
  weekMeters: number;
  lifetimeMeters: number;
};

export type DistanceRange = "7d" | "month" | "ytd" | "lifetime";

export type ChallengeStreak = {
  current: number;
  highest: number;
  lastCompletedDate: string | null;
};

export type WeeklyChaseResults = {
  wins: number;
  losses: number;
};

type DailyDistance = Record<string, number>;

let writeQueue = Promise.resolve();

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekKey(date: Date) {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(date.getDate() - date.getDay());
  return getDateKey(weekStart);
}

async function readDailyDistance() {
  const stored = await AsyncStorage.getItem(distanceStatsKey);

  if (!stored) {
    return {};
  }

  try {
    return JSON.parse(stored) as DailyDistance;
  } catch {
    return {};
  }
}

async function readWorkoutHistory() {
  const stored = await AsyncStorage.getItem(workoutHistoryKey);

  if (!stored) {
    return [];
  }

  try {
    return JSON.parse(stored) as WorkoutRecord[];
  } catch {
    return [];
  }
}

function getYesterdayKey(date: Date) {
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  return getDateKey(yesterday);
}

export function recordDistance(meters: number) {
  writeQueue = writeQueue.then(async () => {
    const dailyDistance = await readDailyDistance();
    const todayKey = getDateKey(new Date());
    dailyDistance[todayKey] = (dailyDistance[todayKey] ?? 0) + meters;
    await AsyncStorage.setItem(distanceStatsKey, JSON.stringify(dailyDistance));
  });

  return writeQueue;
}

export function recordWorkout(workout: Omit<WorkoutRecord, "id" | "dateKey">) {
  writeQueue = writeQueue.then(async () => {
    const history = await readWorkoutHistory();
    const startedAt = new Date(workout.startedAt);
    const dateKey = getDateKey(startedAt);
    history.unshift({
      ...workout,
      dateKey,
      id: `${startedAt.getTime()}`,
    });
    await AsyncStorage.setItem(workoutHistoryKey, JSON.stringify(history.slice(0, 100)));
  });

  return writeQueue;
}

export async function getWorkoutHistory() {
  return readWorkoutHistory();
}

export function deleteWorkout(workoutId: string) {
  writeQueue = writeQueue.then(async () => {
    const history = await readWorkoutHistory();
    const nextHistory = history.filter((workout) => workout.id !== workoutId);
    await AsyncStorage.setItem(workoutHistoryKey, JSON.stringify(nextHistory));
  });

  return writeQueue;
}

export async function getCurrentWeekWorkoutMeters() {
  const history = await readWorkoutHistory();
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(today.getDate() - today.getDay());

  return history.reduce((total, workout) => {
    return new Date(workout.startedAt) >= weekStart ? total + workout.distanceMeters : total;
  }, 0);
}

export async function getWeeklyChaseResults(villainKey: string): Promise<WeeklyChaseResults> {
  const stored = await AsyncStorage.getItem(weeklyChaseResultsKey);
  if (!stored) {
    return { wins: 0, losses: 0 };
  }

  try {
    const results = JSON.parse(stored) as Record<string, WeeklyChaseResults>;
    return results[`${getWeekKey(new Date())}:${villainKey}`] ?? { wins: 0, losses: 0 };
  } catch {
    return { wins: 0, losses: 0 };
  }
}

export function recordWeeklyChaseResult(villainKey: string, result: "win" | "loss") {
  writeQueue = writeQueue.then(async () => {
    const stored = await AsyncStorage.getItem(weeklyChaseResultsKey);
    const results = stored ? JSON.parse(stored) as Record<string, WeeklyChaseResults> : {};
    const resultKey = `${getWeekKey(new Date())}:${villainKey}`;
    const current = results[resultKey] ?? { wins: 0, losses: 0 };

    if (current.wins > 0 || current.losses > 0) {
      return;
    }

    results[resultKey] = {
      wins: current.wins + (result === "win" ? 1 : 0),
      losses: current.losses + (result === "loss" ? 1 : 0),
    };
    await AsyncStorage.setItem(weeklyChaseResultsKey, JSON.stringify(results));
  });

  return writeQueue;
}

export async function getChallengeStreak(): Promise<ChallengeStreak> {
  const stored = await AsyncStorage.getItem(challengeStreakKey);
  if (!stored) {
    return { current: 0, highest: 0, lastCompletedDate: null };
  }

  try {
    const streak = JSON.parse(stored) as ChallengeStreak;
    const todayKey = getDateKey(new Date());
    const yesterdayKey = getYesterdayKey(new Date());
    return streak.lastCompletedDate === todayKey || streak.lastCompletedDate === yesterdayKey
      ? streak
      : { ...streak, current: 0 };
  } catch {
    return { current: 0, highest: 0, lastCompletedDate: null };
  }
}

export function recordChallengeCompletion() {
  writeQueue = writeQueue.then(async () => {
    const current = await getChallengeStreak();
    const todayKey = getDateKey(new Date());
    const nextCurrent = current.lastCompletedDate === todayKey
      ? current.current
      : current.lastCompletedDate === getYesterdayKey(new Date())
        ? current.current + 1
        : 1;
    const next = {
      current: nextCurrent,
      highest: Math.max(current.highest, nextCurrent),
      lastCompletedDate: todayKey,
    };
    await AsyncStorage.setItem(challengeStreakKey, JSON.stringify(next));
  });

  return writeQueue;
}

export async function getWeeklyDistance() {
  return getDistanceRange("7d");
}

export async function getDistanceRange(range: DistanceRange) {
  const dailyDistance = await readDailyDistance();
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  if (range === "7d") {
    start.setDate(today.getDate() - 6);
  } else if (range === "month") {
    start.setDate(today.getDate() - 29);
  } else if (range === "ytd") {
    start.setMonth(0, 1);
  } else {
    const storedDates = Object.keys(dailyDistance).sort();
    if (storedDates.length > 0) {
      const [year, month, day] = storedDates[0].split("-").map(Number);
      start.setFullYear(year, month - 1, day);
    }
  }

  const dayCount = Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
  const buckets = new Map<string, { date: Date; meters: number }>();

  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + (dayCount - 1 - offset));
    const dateKey = getDateKey(date);
    let bucketKey: string;
    let bucketDate = new Date(date);

    if (range === "7d") {
      bucketKey = dateKey;
    } else if (range === "month") {
      const weekIndex = Math.floor((date.getTime() - start.getTime()) / (7 * 86400000));
      bucketKey = `week-${weekIndex}`;
      bucketDate = new Date(start);
      bucketDate.setDate(start.getDate() + weekIndex * 7);
    } else if (range === "ytd") {
      bucketKey = `${date.getFullYear()}-${date.getMonth()}`;
      bucketDate = new Date(date.getFullYear(), date.getMonth(), 1);
    } else {
      bucketKey = `${date.getFullYear()}`;
      bucketDate = new Date(date.getFullYear(), 0, 1);
    }

    const bucket = buckets.get(bucketKey) ?? { date: bucketDate, meters: 0 };
    bucket.meters += dailyDistance[dateKey] ?? 0;
    buckets.set(bucketKey, bucket);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    dateKey: getDateKey(bucket.date),
    label: range === "7d"
      ? bucket.date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()
      : range === "month"
        ? bucket.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : range === "ytd"
          ? bucket.date.toLocaleDateString(undefined, { month: "short" })
          : bucket.date.getFullYear().toString(),
    miles: bucket.meters / 1609.344,
  }));
}

export async function getDistanceSummary(): Promise<DistanceSummary> {
  const dailyDistance = await readDailyDistance();
  const today = new Date();
  const todayKey = getDateKey(today);
  let weekMeters = 0;
  let lifetimeMeters = 0;

  Object.values(dailyDistance).forEach((meters) => {
    lifetimeMeters += meters;
  });

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - offset);
    weekMeters += dailyDistance[getDateKey(date)] ?? 0;
  }

  return {
    todayMeters: dailyDistance[todayKey] ?? 0,
    weekMeters,
    lifetimeMeters,
  };
}
