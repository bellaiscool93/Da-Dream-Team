import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ImageBackground,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { chaserSounds } from "../../assets/sounds";
import { getChallengeStreak, getCurrentWeekWorkoutMeters, getDistanceSummary, getWeeklyChaseResults, recordChallengeCompletion, recordDistance, recordWeeklyChaseResult, recordWorkout } from "../services/distanceStats";
import { requestHealthPermissions, saveWorkoutToHealth } from "../services/healthkit";

const metersPerMile = 1609.344;
const maximumAcceptedAccuracy = 100;
const maximumAcceptedSegment = 50;
type AvatarCustomization = {
  skinColor: string;
  hairColor: string;
  clothingColor: string;
  backgroundColor: string;
};

const defaultAvatarCustomization: AvatarCustomization = {
  skinColor: "edb98a",
  hairColor: "2c1b18",
  clothingColor: "b4e36a",
  backgroundColor: "17231f",
};

const avatarOptions: AvatarCustomization[] = [
  defaultAvatarCustomization,
  { skinColor: "f8d25c", hairColor: "6b4423", clothingColor: "ef8a72", backgroundColor: "263b30" },
  { skinColor: "ae5d29", hairColor: "1c1917", clothingColor: "8ccf82", backgroundColor: "34495e" },
  { skinColor: "ffdbac", hairColor: "c026d3", clothingColor: "60a5fa", backgroundColor: "472b4e" },
];
const villains = {
  werewolf: { label: "WEREWOLF", seed: "moon-werewolf", color: "6b7280", background: "d9f0e2", sprintSpeedMph: 6.2, weeklyTargetMiles: 5, difficulty: "EASY" },
  witch: { label: "WITCH", seed: "night-witch", color: "7c3aed", background: "eadcff", sprintSpeedMph: 8.7, weeklyTargetMiles: 15, difficulty: "MEDIUM" },
  vampire: { label: "VAMPIRE", seed: "crimson-vampire", color: "991b1b", background: "f9dede", sprintSpeedMph: 11.2, weeklyTargetMiles: 30, difficulty: "HARD" },
} as const;

type VillainKey = keyof typeof villains;

type Challenge = {
  title: string;
  detail: string;
  durationSeconds: number;
  status: "offered" | "active";
};

type DistanceSummary = {
  todayMeters: number;
  weekMeters: number;
  lifetimeMeters: number;
};

const villainChallengeMessages: Record<
  VillainKey,
  { headline: string; instruction: string; cue: string }
> = {
  werewolf: {
    headline: "The werewolf caught up to you.",
    instruction: "Run for 1 minute to break away from the pack.",
    cue: "WEREWOLF CATCH-UP",
  },
  witch: {
    headline: "The witch is on your trail.",
    instruction: "Sprint for 1 minute to shake the curse.",
    cue: "WITCH CATCH-UP",
  },
  vampire: {
    headline: "The vampire is right behind you.",
    instruction: "Move for 1 minute before the night closes in.",
    cue: "VAMPIRE CATCH-UP",
  },
};

type LocationLike = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

const challengePool = [
  { title: "Quick push", detail: "Keep working continuously for 10 minutes.", durationSeconds: 600 },
  { title: "Steady effort", detail: "Keep working continuously for 15 minutes.", durationSeconds: 900 },
  { title: "Trail focus", detail: "Keep working continuously for 20 minutes.", durationSeconds: 1200 },
  { title: "Long haul", detail: "Keep working continuously for 30 minutes.", durationSeconds: 1800 },
  { title: "Deep endurance", detail: "Keep working continuously for 45 minutes.", durationSeconds: 2700 },
  { title: "Hour of power", detail: "Keep working continuously for 60 minutes.", durationSeconds: 3600 },
];

function getDailyChallenge() {
  const dayNumber = Math.floor(Date.now() / 86400000);
  const weightedPool = [challengePool[0], challengePool[0], challengePool[0], challengePool[1], challengePool[1], challengePool[2], challengePool[3], challengePool[4], challengePool[5]];
  return weightedPool[dayNumber % weightedPool.length];
}

function buildRandomChaseChallenge(villainKey: VillainKey, template = getDailyChallenge()): Challenge {
  void villainKey;

  return {
    title: template.title,
    detail: template.detail,
    durationSeconds: template.durationSeconds,
    status: "offered",
  };
}

function distanceBetweenPoints(start: LocationLike, end: LocationLike) {
  const earthRadius = 6371000;
  const latitudeDelta = ((end.latitude - start.latitude) * Math.PI) / 180;
  const longitudeDelta = ((end.longitude - start.longitude) * Math.PI) / 180;
  const startLatitude = (start.latitude * Math.PI) / 180;
  const endLatitude = (end.latitude * Math.PI) / 180;

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export default function Index() {
  const router = useRouter();
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [distance, setDistance] = useState(0);
  const [workoutWeekMeters, setWorkoutWeekMeters] = useState(0);
  const [distanceSummary, setDistanceSummary] = useState<DistanceSummary>({ todayMeters: 0, weekMeters: 0, lifetimeMeters: 0 });
  const [workoutDistance, setWorkoutDistance] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState("not-connected");
  const [selectedVillain, setSelectedVillain] = useState<VillainKey>("werewolf");
  const [showChaserPicker, setShowChaserPicker] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [challengeStreak, setChallengeStreak] = useState({ current: 0, highest: 0 });
  const [weeklyChaseResults, setWeeklyChaseResults] = useState({ wins: 0, losses: 0 });
  const [avatarCustomization, setAvatarCustomization] = useState(defaultAvatarCustomization);
  const avatarMotion = useRef(new Animated.Value(0)).current;
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeSeconds, setChallengeSeconds] = useState(0);
  const [eventStartDistance, setEventStartDistance] = useState(0);
  const eventAudioPlayer = useAudioPlayer(null);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const webLocationWatchId = useRef<number | null>(null);
  const previousLocation = useRef<LocationLike | null>(null);
  const liveDistanceRef = useRef(0);
  const workoutPreviousLocation = useRef<LocationLike | null>(null);
  const workoutDistanceRef = useRef(0);
  const completedEventsRef = useRef(0);
  const isTrackingRef = useRef(false);
  const startedAt = useRef<Date | null>(null);
  const workoutStartedAt = useRef<Date | null>(null);

  useEffect(() => {
    getDistanceSummary().then((summary) => {
      setDistanceSummary(summary);
      liveDistanceRef.current = summary.todayMeters;
      setDistance(summary.todayMeters);
    });
  }, []);

  useEffect(() => {
    getCurrentWeekWorkoutMeters().then(setWorkoutWeekMeters);
  }, []);

  useEffect(() => {
    getWeeklyChaseResults(selectedVillain).then(setWeeklyChaseResults);
  }, [selectedVillain]);

  useEffect(() => {
    getChallengeStreak().then((streak) => setChallengeStreak(streak));
  }, []);

  useEffect(() => {
    if (!isTracking || startedAt.current === null) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current!.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isTracking]);

  useEffect(() => {
    let cancelled = false;

    const handleLocationUpdate = (coords: LocationLike) => {
      const currentAccuracy = coords.accuracy;
      const usableAccuracy =
        currentAccuracy === null || currentAccuracy === undefined || currentAccuracy <= maximumAcceptedAccuracy;

      if (!usableAccuracy) {
        return;
      }

      if (previousLocation.current) {
        const segmentDistance = distanceBetweenPoints(previousLocation.current, coords);

        if (segmentDistance >= 1 && segmentDistance <= maximumAcceptedSegment) {
          liveDistanceRef.current += segmentDistance;
          setDistance(liveDistanceRef.current);
          setDistanceSummary((summary) => ({
            todayMeters: summary.todayMeters + segmentDistance,
            weekMeters: summary.weekMeters + segmentDistance,
            lifetimeMeters: summary.lifetimeMeters + segmentDistance,
          }));
          void recordDistance(segmentDistance);

          if (isTrackingRef.current && workoutPreviousLocation.current) {
            const workoutSegment = distanceBetweenPoints(workoutPreviousLocation.current, coords);
            if (workoutSegment >= 1 && workoutSegment <= maximumAcceptedSegment) {
              workoutDistanceRef.current += workoutSegment;
              setWorkoutDistance(workoutDistanceRef.current);
              setWorkoutWeekMeters((current) => current + workoutSegment);
            }
          }
        }
      }

      previousLocation.current = coords;
      workoutPreviousLocation.current = isTrackingRef.current ? coords : null;
    };

    async function startLiveLocation() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          setErrorMessage("Location access is needed to show live distance.");
          return;
        }

        if (typeof Location.hasServicesEnabledAsync === "function" && !(await Location.hasServicesEnabledAsync())) {
          setErrorMessage("Turn on Location Services in Settings, then try again.");
          return;
        }

        if (cancelled) {
          return;
        }

        try {
          subscription.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 1, timeInterval: 1000 },
            (location) => handleLocationUpdate(location.coords),
            (reason) => setErrorMessage(reason),
          );
        } catch {
          if (typeof navigator !== "undefined" && "geolocation" in navigator) {
            webLocationWatchId.current = navigator.geolocation.watchPosition(
              (position) => handleLocationUpdate(position.coords),
              () => setErrorMessage("The browser could not access your GPS location."),
              { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
            );
          } else {
            throw new Error("Location tracking is unavailable on this device.");
          }
        }
      } catch {
        setErrorMessage("We could not start live location. Please try again.");
      }
    }

    void startLiveLocation();

    return () => {
      cancelled = true;
      subscription.current?.remove();
      subscription.current = null;
      if (typeof navigator !== "undefined" && "geolocation" in navigator && webLocationWatchId.current !== null) {
        navigator.geolocation.clearWatch(webLocationWatchId.current);
        webLocationWatchId.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      subscription.current?.remove();
      if (typeof navigator !== "undefined" && "geolocation" in navigator && webLocationWatchId.current !== null) {
        navigator.geolocation.clearWatch(webLocationWatchId.current);
      }
    };
  }, []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(avatarMotion, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(avatarMotion, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [avatarMotion]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    });
  }, []);

  useEffect(() => {
    if (!challenge || challenge.status !== "offered") {
      return;
    }

    const soundSource = chaserSounds[selectedVillain];
    if (soundSource !== null) {
      eventAudioPlayer.replace(soundSource);
      eventAudioPlayer.play();
    }
  }, [challenge, eventAudioPlayer, selectedVillain]);

  useEffect(() => {
    if (!isTracking || challenge) {
      return;
    }

    const delay = (Math.floor(Math.random() * 16) + 18) * 1000;
    const challengeTimer = setTimeout(() => {
      const nextChase = buildRandomChaseChallenge(selectedVillain);
      setChallenge(nextChase);
    }, delay);

    return () => clearTimeout(challengeTimer);
  }, [isTracking, challenge, selectedVillain]);

  useEffect(() => {
    if (!challenge || challenge.status !== "active") {
      return;
    }

    if (challengeSeconds <= 0) {
      const completionTimer = setTimeout(() => {
        completedEventsRef.current += 1;
        void recordChallengeCompletion().then(() => getChallengeStreak().then((streak) => setChallengeStreak(streak)));
        setChallenge(null);
      }, 900);
      return () => clearTimeout(completionTimer);
    }

    const countdownTimer = setTimeout(() => {
      setChallengeSeconds((seconds) => seconds - 1);
    }, 1000);

    return () => clearTimeout(countdownTimer);
  }, [challenge, challengeSeconds]);

  async function startTracking() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage("Location access is needed to start a workout.");
        return;
      }

      if (typeof Location.hasServicesEnabledAsync === "function" && !(await Location.hasServicesEnabledAsync())) {
        setErrorMessage("Turn on Location Services in Settings, then try again.");
        return;
      }

      try {
        const healthAvailable = await requestHealthPermissions();
        setHealthStatus(healthAvailable ? "connected" : "not-supported");
      } catch {
        setHealthStatus("not-supported");
      }

      isTrackingRef.current = true;
      workoutPreviousLocation.current = previousLocation.current;

      if (!isPaused) {
        workoutDistanceRef.current = 0;
        completedEventsRef.current = 0;
        workoutStartedAt.current = new Date();
        setWorkoutDistance(0);
        setElapsedSeconds(0);
        setChallenge(null);
        setChallengeSeconds(0);
      }

      startedAt.current = new Date(Date.now() - elapsedSeconds * 1000);

      setIsTracking(true);
      setIsPaused(false);
    } catch {
      setErrorMessage("We could not start location tracking. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function stopTracking() {
    const workoutStart = workoutStartedAt.current;
    const completedWorkoutDistance = workoutDistanceRef.current;
    const completedWorkoutSeconds = isTracking && startedAt.current
      ? Math.max(0, Math.floor((Date.now() - startedAt.current.getTime()) / 1000))
      : elapsedSeconds;
    const completedEvents = completedEventsRef.current;
    const workoutEnd = new Date();

    isTrackingRef.current = false;
    startedAt.current = null;
    workoutStartedAt.current = null;
    workoutPreviousLocation.current = null;
    setIsTracking(false);
    setIsPaused(false);

    if (workoutStart) {
      await recordWorkout({
        startedAt: workoutStart.toISOString(),
        distanceMeters: completedWorkoutDistance,
        durationSeconds: completedWorkoutSeconds,
        eventsCompleted: completedEvents,
      });
    }

    if (workoutStart && completedWorkoutDistance > 0) {
      try {
        const saved = await saveWorkoutToHealth(completedWorkoutDistance, workoutStart, workoutEnd);
        setHealthStatus(saved ? "saved" : "not-supported");
      } catch {
        setHealthStatus("error");
        setErrorMessage("The workout stayed on this device, but Apple Health could not save it.");
      }
    }

    workoutDistanceRef.current = 0;
    setWorkoutDistance(0);
    setElapsedSeconds(0);
  }

  function pauseTracking() {
    if (!isTracking) {
      return;
    }

    if (startedAt.current) {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt.current.getTime()) / 1000)));
    }
    isTrackingRef.current = false;
    startedAt.current = null;
    workoutPreviousLocation.current = null;
    setIsTracking(false);
    setIsPaused(true);
    setChallenge(null);
    setChallengeSeconds(0);
  }

  async function resetWorkout() {
    await stopTracking();
    setErrorMessage(null);
  }

  function acceptChallenge() {
    const nextChallenge = challenge ?? { ...challengePool[0], status: "offered" as const };
    setEventStartDistance(workoutDistanceRef.current);
    setChallenge({ ...nextChallenge, status: "active" });
    setChallengeSeconds(nextChallenge.durationSeconds);
  }

  function skipChallenge() {
    setChallenge(null);
    setChallengeSeconds(0);
  }

  const totalMiles = distance / metersPerMile;
  const dailyMiles = distanceSummary.todayMeters / metersPerMile;
  const weeklyMiles = distanceSummary.weekMeters / metersPerMile;
  const lifetimeMiles = distanceSummary.lifetimeMeters / metersPerMile;
  const workoutMiles = workoutDistance / metersPerMile;
  const formattedWorkoutMiles = workoutMiles.toFixed(2);
  const getLevelThreshold = (level: number) => (level * (level + 1)) / 2;

  let currentLevel = 0;
  while (getLevelThreshold(currentLevel + 1) <= totalMiles) {
    currentLevel += 1;
  }

  const currentThreshold = getLevelThreshold(currentLevel);
  const nextLevel = currentLevel + 1;
  const nextThreshold = getLevelThreshold(nextLevel);
  const levelProgress =
    nextThreshold === currentThreshold ? 0 : (totalMiles - currentThreshold) / (nextThreshold - currentThreshold);
  const progressPercent = Math.min(Math.max(Math.round(levelProgress * 100), 0), 100);
  const progressWidth = `${progressPercent}%` as `${number}%`;
  const villainProgressPercent = Math.max(progressPercent - 18, 0);
  const villainProgressWidth = `${villainProgressPercent}%` as `${number}%`;
  const selectedVillainConfig = villains[selectedVillain];
  const eventFinishMeters = selectedVillainConfig.sprintSpeedMph * 0.44704 * (challenge?.durationSeconds ?? 1);
  const eventPlayerMeters = Math.max(workoutDistance - eventStartDistance, 0);
  const eventPlayerPercent = Math.min((eventPlayerMeters / eventFinishMeters) * 100, 100);
  const eventMonsterPercent = challenge
    ? Math.min(((challenge.durationSeconds - challengeSeconds) / challenge.durationSeconds) * 100, 100)
    : 0;
  const workoutWeeklyMiles = workoutWeekMeters / metersPerMile;
  const weeklyTargetPercent = Math.min((workoutWeeklyMiles / selectedVillainConfig.weeklyTargetMiles) * 100, 100);
  const weekProgressPercent = Math.min(((new Date().getDay() + new Date().getHours() / 24) / 7) * 100, 100);
  const monsterWeeklyMiles = selectedVillainConfig.weeklyTargetMiles * (weekProgressPercent / 100);
  const userIsWinning = workoutWeeklyMiles >= monsterWeeklyMiles;
  const weeklyOutcome = workoutWeeklyMiles >= selectedVillainConfig.weeklyTargetMiles
    ? "win"
    : weekProgressPercent >= 100 && workoutWeeklyMiles < selectedVillainConfig.weeklyTargetMiles
      ? "loss"
      : null;
  const weeklyFillPercent = Math.max(weeklyTargetPercent, weekProgressPercent);
  const weeklyUserWidth = `${weeklyTargetPercent}%` as `${number}%`;
  const weeklyFillWidth = `${weeklyFillPercent}%` as `${number}%`;
  const weeklyMonsterWidth = `${weekProgressPercent}%` as `${number}%`;
  const eventPlayerWidth = `${eventPlayerPercent}%` as `${number}%`;
  const eventMonsterWidth = `${eventMonsterPercent}%` as `${number}%`;
  const avatarSeed = `questfit-runner-${avatarCustomization.skinColor}-${avatarCustomization.hairColor}-${avatarCustomization.clothingColor}`;
  const avatarUrl = `https://api.dicebear.com/9.x/avataaars/png?size=96&seed=${avatarSeed}&skinColor=${avatarCustomization.skinColor}&hairColor=${avatarCustomization.hairColor}&clothingColor=${avatarCustomization.clothingColor}&backgroundColor=${avatarCustomization.backgroundColor}`;
  const villainUrl = `https://api.dicebear.com/9.x/adventurer/png?size=96&seed=${selectedVillainConfig.seed}&backgroundColor=${selectedVillainConfig.background}&hairColor=${selectedVillainConfig.color}`;
  const currentMileageLabel = `${totalMiles.toFixed(1)} mi`;
  const currentLevelLabel = `${currentThreshold.toFixed(1)} mi`;
  const nextLevelLabel = `${nextThreshold.toFixed(1)} mi`;
  const formattedTime = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(
    elapsedSeconds % 60,
  ).padStart(2, "0")}`;
  const healthStatusText =
    healthStatus === "saved"
      ? "Saved to Apple Health"
      : healthStatus === "connected"
        ? "Apple Health connected"
        : healthStatus === "error"
          ? "Apple Health needs attention"
            : healthStatus === "not-supported"
              ? "Apple Health is available on iPhone"
          : "Apple Health not connected";
  const challengeCountdownLabel = challenge
    ? `${String(Math.floor(challengeSeconds / 60)).padStart(2, "0")}:${String(challengeSeconds % 60).padStart(2, "0")}`
    : "00:00";
  const displayedChallenge = challenge ?? { ...getDailyChallenge(), status: "offered" as const };

  useEffect(() => {
    if (!weeklyOutcome) {
      return;
    }

    void recordWeeklyChaseResult(selectedVillain, weeklyOutcome).then(() => {
      getWeeklyChaseResults(selectedVillain).then(setWeeklyChaseResults);
    });
  }, [selectedVillain, weeklyOutcome]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
  source={require("../../assets/images/forest-background.png")}
  resizeMode="cover"
  style={styles.backgroundImage}
  imageStyle={styles.backgroundImageStyle}
>
        <View style={styles.backgroundOverlay}>
          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.brandLockup}>
              <Text style={styles.brandName}>QuestFit</Text>
              <Text style={styles.brandTagline}>RUN · ESCAPE · GET STRONGER</Text>
            </View>

            <View style={styles.heroRow}>
              <View style={styles.distancePanel}>
                <View style={styles.cardEyebrowRow}>
                  <Text style={styles.cardIcon}>⌁</Text>
                  <Text style={styles.cardEyebrow}>DISTANCE</Text>
                </View>
                <Text style={styles.distanceValue}>{dailyMiles.toFixed(2)}</Text>
                <Text style={styles.distanceUnit}>MILES</Text>
                <View style={styles.distanceSummaryRow}>
                  <Text numberOfLines={1} style={styles.distanceSummaryText}>WEEK {weeklyMiles.toFixed(2)} mi</Text>
                  <Text numberOfLines={1} style={styles.distanceSummaryText}>LIFE {lifetimeMiles.toFixed(2)} mi</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/stats")}
                  style={({ pressed }) => [styles.statsButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.statsButtonText}>VIEW STATS</Text>
                  <Text style={styles.statsButtonArrow}>→</Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose your chaser"
                onPress={() => setShowChaserPicker(true)}
                style={styles.chaserHeroCard}
              >
                <Text style={styles.cardEyebrow}>YOUR CHASER</Text>
                <Image source={villainUrl} style={styles.chaserHeroImage} contentFit="cover" />
                <Text style={styles.chaserHeroName}>{selectedVillainConfig.label}</Text>
                <Text style={styles.chaserHeroLabel}>{selectedVillainConfig.difficulty} CHASER</Text>
                <Text style={styles.chaserHeroDistance}>{selectedVillainConfig.sprintSpeedMph} mph sprint</Text>
                <Text style={styles.chaserHeroWeekly}>{selectedVillainConfig.weeklyTargetMiles} mi weekly target</Text>
                <Text style={styles.chaserTapHint}>TAP TO CHOOSE</Text>
              </Pressable>
            </View>

            <View style={styles.sessionStatus}>
              <View style={[styles.statusDot, isTracking && styles.statusDotActive]} />
              <Text style={styles.statusText}>{isTracking ? "TRACKING NOW" : "READY TO TRACK"}</Text>
            </View>

        <View style={styles.levelProgressCard}>
          <View style={styles.glassCardHeader}>
            <View>
              <Text style={styles.cardEyebrow}>RUN PROGRESS</Text>
              <Text style={styles.cardTitle}>MILES TO NEXT LEVEL</Text>
            </View>
            <View style={styles.levelHeaderActions}>
              <Pressable onPress={() => setShowAvatarPicker(true)} style={styles.avatarEditButton}>
                <Text style={styles.avatarEditText}>EDIT AVATAR</Text>
              </Pressable>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>LVL {currentLevel}</Text>
              </View>
            </View>
          </View>

          <View style={styles.levelProgressMeta}>
            <View style={styles.levelProgressSide}>
              <Text style={styles.levelProgressLabel}>LVL {currentLevel}</Text>
              <Text style={styles.levelProgressSubLabel}>{currentLevelLabel}</Text>
            </View>
            <View style={[styles.levelProgressSide, { alignItems: "flex-end" }]}>
              <Text style={styles.levelProgressLabel}>LVL {nextLevel}</Text>
              <Text style={styles.levelProgressSubLabel}>{nextLevelLabel}</Text>
            </View>
          </View>

          <View accessibilityLabel="Level progress" style={styles.progressTrackWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <View style={[styles.avatarMarker, { left: progressWidth }]}> 
              <Image
                accessibilityLabel="Your customized running QuestFit avatar"
                cachePolicy="none"
                contentFit="cover"
                key={avatarUrl}
                source={avatarUrl}
                style={styles.markerImage}
                transition={250}
              />
            </View>
          </View>

          <Text style={styles.levelProgressReadout}>{currentMileageLabel}</Text>
        </View>

        <View style={styles.weeklyChaseCard}>
          <View style={styles.glassCardHeader}>
            <View>
              <Text style={styles.cardEyebrow}>WEEKLY CHASE</Text>
              <Text style={styles.cardTitle}>{selectedVillainConfig.label} TARGET</Text>
            </View>
            <Text style={styles.weeklyChaseReset}>BEAT {weeklyChaseResults.wins} · LOST {weeklyChaseResults.losses}</Text>
          </View>
          <View style={styles.weeklyChaseLabels}>
            <Text style={styles.levelProgressLabel}>0 mi</Text>
            <Text style={styles.levelProgressLabel}>{selectedVillainConfig.weeklyTargetMiles} mi</Text>
          </View>
          <View style={styles.weeklyChaseTrackWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.weeklyChaseFill, userIsWinning ? styles.weeklyChaseFillWinning : styles.weeklyChaseFillLosing, { width: weeklyFillWidth }]} />
            </View>
            <View style={[styles.weeklyUserMarker, { left: weeklyUserWidth }]}>
              <Image source={avatarUrl} style={styles.weeklyChaseMarkerImage} contentFit="cover" />
            </View>
            <View style={[styles.weeklyChaseMarker, { left: weeklyMonsterWidth }]}>
              <Image source={villainUrl} style={styles.weeklyChaseMarkerImage} contentFit="cover" />
            </View>
          </View>
          <View style={styles.weeklyChaseReadoutRow}>
            <Text style={styles.weeklyChaseReadout}>YOU {workoutWeeklyMiles.toFixed(2)} mi</Text>
            <Text style={styles.weeklyChaseReadout}>{selectedVillainConfig.label} {monsterWeeklyMiles.toFixed(2)} mi</Text>
          </View>
        </View>

        <View style={styles.workoutCard}>
          <View style={styles.glassCardHeader}>
            <View>
              <Text style={styles.cardEyebrow}>CURRENT WORKOUT</Text>
              <Text style={styles.cardTitle}>DISTANCE SINCE START</Text>
            </View>
            <Text style={styles.workoutStatus}>{isTracking ? "LIVE" : "READY"}</Text>
          </View>
          <View style={styles.workoutDistanceRow}>
            <View>
              <Text style={styles.workoutDistanceValue}>{formattedWorkoutMiles}</Text>
              <Text style={styles.workoutDistanceUnit}>MILES</Text>
            </View>
            <View style={styles.workoutMeta}>
              <Text style={styles.workoutTime}>{formattedTime}</Text>
              <Text style={styles.workoutTimeLabel}>ELAPSED</Text>
            </View>
          </View>
          {isTracking ? (
            <View style={styles.workoutActionRow}>
              <Pressable
                accessibilityRole="button"
                disabled={isLoading}
                onPress={pauseTracking}
                style={({ pressed }) => [styles.workoutActionButton, styles.pauseButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.startRunIcon}>Ⅱ</Text>
                <Text style={styles.workoutActionText}>PAUSE</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isLoading}
                onPress={stopTracking}
                style={({ pressed }) => [styles.workoutActionButton, styles.stopButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.workoutActionText}>STOP</Text>
              </Pressable>
            </View>
          ) : isPaused ? (
            <View style={styles.workoutActionRow}>
              <Pressable
                accessibilityRole="button"
                disabled={isLoading}
                onPress={startTracking}
                style={({ pressed }) => [styles.workoutActionButton, styles.resumeButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.startRunIcon}>▶</Text>
                <Text style={styles.workoutActionText}>START</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isLoading}
                onPress={stopTracking}
                style={({ pressed }) => [styles.workoutActionButton, styles.stopButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.workoutActionText}>STOP</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={isLoading}
              onPress={startTracking}
              style={({ pressed }) => [styles.startRunButton, pressed && styles.buttonPressed]}
            >
              {isLoading ? <ActivityIndicator color="#e7f6c9" /> : <>
                <Text style={styles.startRunIcon}>▶</Text>
                <Text style={styles.startRunText}>Start Run</Text>
                <Text style={styles.startRunArrow}>→</Text>
              </>}
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/past-workouts")}
            style={({ pressed }) => [styles.workoutStatsButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.workoutStatsButtonText}>VIEW PAST WORKOUTS →</Text>
          </Pressable>
        </View>

        <View style={styles.challengePreviewCard}>
          <Text style={styles.challengeStreakBadge}>STREAK {challengeStreak.current} · BEST {challengeStreak.highest}</Text>
          <View style={styles.challengePreviewIcon}>
            <Text style={styles.challengePreviewIconText}>◎</Text>
          </View>
          <View style={styles.challengePreviewCopy}>
            <Text style={styles.challengeEyebrow}>TODAY&apos;S CHALLENGE</Text>
            <Text style={styles.challengeTitle}>{displayedChallenge.title}</Text>
            <Text style={styles.challengeDetail}>{displayedChallenge.detail}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={challenge ? (challenge.status === "offered" ? acceptChallenge : skipChallenge) : acceptChallenge}
            style={({ pressed }) => [styles.challengeArrowButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.challengeArrow}>→</Text>
          </Pressable>
        </View>

        <View style={styles.healthRow}>
          <View style={[styles.healthIcon, healthStatus === "saved" && styles.healthIconSaved]}>
            <Text style={styles.healthIconText}>♥</Text>
          </View>
          <View style={styles.healthCopy}>
            <Text style={styles.healthTitle}>{healthStatusText}</Text>
            <Text style={styles.healthSubtitle}>
              {isTracking ? "Workout distance will save when you pause." : "Pause after moving to save this workout."}
            </Text>
          </View>
        </View>

        {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

        {challenge && (
          <View style={styles.challengeOverlay}>
            <View style={styles.challengeCard}>
              <Image source={villainUrl} style={styles.challengeVillainImage} contentFit="cover" />
              <Text style={styles.challengeEyebrow}>
                {challenge.status === "active" ? "CHASE IN PROGRESS" : villainChallengeMessages[selectedVillain].cue}
              </Text>
              <Text style={styles.challengeTitle}>{challenge.title}</Text>
              <Text style={styles.challengeDetail}>{challenge.detail}</Text>

              {challenge.status === "active" && (
                <View style={styles.eventRaceSection}>
                  <View style={styles.eventRaceLabels}>
                    <Text style={styles.eventRaceLabel}>YOU</Text>
                    <Text style={styles.eventRaceLabel}>FINISH</Text>
                    <Text style={styles.eventRaceLabel}>{selectedVillainConfig.label}</Text>
                  </View>
                  <View style={styles.eventRaceTrackWrap}>
                    <View style={styles.eventRaceTrack}>
                      <View style={[styles.eventRacePlayerFill, { width: eventPlayerWidth }]} />
                    </View>
                    <View style={[styles.eventRacePlayerMarker, { left: eventPlayerWidth }]}>
                      <Image source={avatarUrl} style={styles.eventRaceMarkerImage} contentFit="cover" />
                    </View>
                    <View style={[styles.eventRaceMonsterMarker, { left: eventMonsterWidth }]}>
                      <Image source={villainUrl} style={styles.eventRaceMarkerImage} contentFit="cover" />
                    </View>
                  </View>
                  <Text style={styles.eventRaceReadout}>{Math.round(eventPlayerPercent)}% of the finish distance</Text>
                </View>
              )}

              {challenge.status === "active" && (
                <View style={styles.challengeTimerWrap}>
                  <Text style={styles.challengeTimerLabel}>RUN TIMER</Text>
                  <Text style={styles.challengeTimerValue}>{challengeCountdownLabel}</Text>
                </View>
              )}

              <View style={styles.challengeActions}>
                {challenge.status === "offered" ? (
                  <>
                    <Pressable accessibilityRole="button" onPress={acceptChallenge} style={({ pressed }) => [styles.challengeActionPrimary, pressed && styles.buttonPressed]}>
                      <Text style={styles.challengeActionPrimaryText}>RUN NOW</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={skipChallenge} style={({ pressed }) => [styles.challengeActionSecondary, pressed && styles.buttonPressed]}>
                      <Text style={styles.challengeActionSecondaryText}>IGNORE</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable accessibilityRole="button" onPress={skipChallenge} style={({ pressed }) => [styles.challengeActionSecondary, pressed && styles.buttonPressed]}>
                    <Text style={styles.challengeActionSecondaryText}>FINISH CHASE</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}

        {showAvatarPicker && (
          <View style={styles.chaserPickerOverlay}>
            <View style={styles.chaserPickerCard}>
              <Text style={styles.cardEyebrow}>CUSTOMIZE YOUR AVATAR</Text>
              <Text style={styles.cardTitle}>CHOOSE A LOOK</Text>
              <View style={styles.avatarPickerChoices}>
                {avatarOptions.map((option) => {
                  const optionSeed = `questfit-runner-${option.skinColor}-${option.hairColor}-${option.clothingColor}`;
                  const optionUrl = `https://api.dicebear.com/9.x/avataaars/png?size=96&seed=${optionSeed}&skinColor=${option.skinColor}&hairColor=${option.hairColor}&clothingColor=${option.clothingColor}&backgroundColor=${option.backgroundColor}`;
                  const isSelected = option === avatarCustomization;
                  return (
                    <Pressable
                      key={optionUrl}
                      onPress={() => { setAvatarCustomization(option); setShowAvatarPicker(false); }}
                      style={[styles.avatarChoice, isSelected && styles.avatarChoiceSelected]}
                    >
                      <Image source={optionUrl} style={styles.avatarChoiceImage} contentFit="cover" />
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => setShowAvatarPicker(false)} style={styles.pickerCloseButton}>
                <Text style={styles.pickerCloseText}>CLOSE</Text>
              </Pressable>
            </View>
          </View>
        )}

          </ScrollView>

          {showChaserPicker && (
            <View style={styles.chaserPickerOverlay}>
              <View style={styles.chaserPickerCard}>
                <Text style={styles.cardEyebrow}>CHOOSE YOUR CHASER</Text>
                <Text style={styles.cardTitle}>SELECT YOUR NIGHTMARE</Text>
                <View style={styles.chaserPickerChoices}>
                  {(Object.keys(villains) as VillainKey[]).map((villainKey) => {
                    const villain = villains[villainKey];
                    const isSelected = villainKey === selectedVillain;
                    const choiceUrl = `https://api.dicebear.com/9.x/adventurer/png?size=72&seed=${villain.seed}&backgroundColor=${villain.background}&hairColor=${villain.color}`;
                    return (
                      <Pressable key={villainKey} onPress={() => { setSelectedVillain(villainKey); setShowChaserPicker(false); }} style={styles.pickerChoice}>
                        <Image source={choiceUrl} style={styles.pickerChoiceImage} contentFit="cover" />
                        <Text style={[styles.pickerChoiceLabel, isSelected && styles.pickerChoiceSelected]}>{villain.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable onPress={() => setShowChaserPicker(false)} style={styles.pickerCloseButton}>
                  <Text style={styles.pickerCloseText}>CLOSE</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#07110e",
  },
  backgroundImage: {
    flex: 1,
  },
  backgroundImageStyle: {
    opacity: 0.55,
  },
  backgroundOverlay: {
    flex: 1,
    backgroundColor: "rgba(5, 15, 12, 0.68)",
  },
  container: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  topHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerIconButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  headerIcon: {
    color: "#eff8ed",
    fontSize: 30,
    fontWeight: "300",
  },
  brandLockup: {
    alignItems: "center",
    marginBottom: 16,
  },
  brandName: {
    color: "#f5f7f3",
    fontFamily: "serif",
    fontSize: 30,
  },
  brandTagline: {
    color: "rgba(235, 245, 239, 0.62)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2.4,
    marginTop: 3,
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  searchField: {
    alignItems: "center",
    backgroundColor: "rgba(235, 245, 239, 0.13)",
    borderColor: "rgba(235, 245, 239, 0.30)",
    borderRadius: 28,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    height: 56,
    paddingHorizontal: 16,
  },
  searchIcon: {
    color: "#eff8ed",
    fontSize: 31,
    lineHeight: 34,
    marginRight: 10,
  },
  searchPlaceholder: {
    color: "rgba(235, 245, 239, 0.72)",
    fontSize: 14,
  },
  filterButton: {
    alignItems: "center",
    backgroundColor: "rgba(235, 245, 239, 0.13)",
    borderColor: "rgba(235, 245, 239, 0.25)",
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  filterIcon: {
    color: "#eff8ed",
    fontSize: 27,
  },
  heroRow: {
    flexDirection: "row",
    gap: 12,
  },
  cardEyebrowRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  cardIcon: {
    color: "#d9efc0",
    fontSize: 25,
  },
  header: {
    marginBottom: 20,
  },
  eyebrow: {
    color: "#c8e8a1",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.2,
    marginBottom: 9,
  },
  title: {
    color: "#f5f7f3",
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 40,
    letterSpacing: -0.6,
  },
  subtitle: {
    color: "#c0ccc6",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 340,
  },
  distancePanel: {
    backgroundColor: "rgba(235, 245, 239, 0.10)",
    borderColor: "rgba(235, 245, 239, 0.30)",
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    minHeight: 218,
    padding: 12,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  chaserHeroCard: {
    backgroundColor: "rgba(235, 245, 239, 0.10)",
    borderColor: "rgba(235, 245, 239, 0.30)",
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    minHeight: 218,
    overflow: "hidden",
    padding: 12,
  },
  chaserHeroImage: {
    alignSelf: "center",
    height: 88,
    marginTop: 4,
    width: "100%",
  },
  chaserHeroName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  chaserHeroLabel: {
    color: "rgba(235, 245, 239, 0.60)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 8,
  },
  chaserHeroDistance: {
    color: "#f4f8f3",
    fontSize: 14,
    marginTop: 4,
  },
  chaserHeroWeekly: {
    color: "#c8e8a1",
    fontSize: 11,
    marginTop: 4,
  },
  chaserTapHint: {
    color: "#c8e8a1",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 8,
  },
  startRunButton: {
    alignItems: "center",
    backgroundColor: "rgba(200, 232, 161, 0.28)",
    borderColor: "rgba(220, 241, 197, 0.42)",
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    minHeight: 42,
    paddingHorizontal: 11,
  },
  startRunIcon: {
    color: "#f0ffdc",
    fontSize: 19,
  },
  startRunText: {
    color: "#e1f2ca",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 8,
  },
  startRunArrow: {
    color: "#f0ffdc",
    fontSize: 20,
  },
  sessionStatus: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 10,
    paddingHorizontal: 4,
  },
  sessionStatusText: {
    color: "rgba(235, 245, 239, 0.58)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginLeft: "auto",
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  statusDot: {
    backgroundColor: "rgba(230, 239, 233, 0.45)",
    borderRadius: 6,
    height: 8,
    width: 8,
  },
  statusDotActive: {
    backgroundColor: "#c8e8a1",
  },
  statusText: {
    color: "#d9e3de",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  distanceValue: {
    color: "#ffffff",
    fontSize: 48,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 54,
    marginTop: 10,
  },
  distanceUnit: {
    color: "#c8e8a1",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2.2,
  },
  secondaryDistance: {
    color: "#b3c0b9",
    fontSize: 13,
    marginTop: 7,
  },
  distanceSummaryRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 7,
  },
  distanceSummaryText: {
    color: "#b3c0b9",
    flex: 1,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  statsButton: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 10,
  },
  statsButtonText: {
    color: "#c8e8a1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  statsButtonArrow: {
    color: "#c8e8a1",
    fontSize: 17,
    marginLeft: 6,
  },
  glassCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  cardEyebrow: {
    color: "rgba(235, 245, 239, 0.72)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
    marginTop: 5,
  },
  levelBadge: {
    backgroundColor: "rgba(205, 231, 174, 0.16)",
    borderColor: "rgba(220, 241, 197, 0.38)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  levelBadgeText: {
    color: "#e1f2ca",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  dangerBadge: {
    backgroundColor: "rgba(190, 72, 57, 0.18)",
    borderColor: "rgba(235, 130, 111, 0.42)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  dangerBadgeText: {
    color: "#ffb4a5",
    fontSize: 12,
    fontWeight: "800",
  },
  levelProgressCard: {
    backgroundColor: "rgba(235, 245, 239, 0.10)",
    borderColor: "rgba(235, 245, 239, 0.28)",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 14,
    minHeight: 180,
    padding: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.20,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  levelProgressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  levelHeaderActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  avatarEditButton: {
    borderColor: "rgba(200, 232, 161, 0.30)",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  avatarEditText: {
    color: "#c8e8a1",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  levelProgressSide: {
    alignItems: "flex-start",
  },
  levelProgressLabel: {
    color: "#f3f6f3",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  levelProgressSubLabel: {
    color: "#aebcb5",
    fontSize: 11,
    marginTop: 4,
  },
  progressTrackWrap: {
    justifyContent: "center",
    minHeight: 48,
    position: "relative",
    marginTop: 4,
  },
  progressTrack: {
    backgroundColor: "rgba(5, 15, 12, 0.62)",
    borderColor: "rgba(235, 245, 239, 0.16)",
    borderRadius: 999,
    borderWidth: 1,
    height: 12,
    overflow: "hidden",
  },
  avatarMarker: {
    backgroundColor: "rgba(8, 18, 15, 0.85)",
    borderColor: "#d7f2b5",
    borderRadius: 21,
    borderWidth: 2,
    height: 42,
    justifyContent: "center",
    marginLeft: -21,
    overflow: "hidden",
    position: "absolute",
    top: 3,
    width: 42,
    zIndex: 2,
  },
  chaserMarker: {
    backgroundColor: "rgba(8, 18, 15, 0.85)",
    borderColor: "#e87a61",
    borderRadius: 17,
    borderWidth: 2,
    height: 34,
    justifyContent: "center",
    marginLeft: -17,
    opacity: 0.96,
    overflow: "hidden",
    position: "absolute",
    width: 34,
    zIndex: 1,
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  markerImage: {
    height: "100%",
    width: "100%",
  },
  progressFill: {
    backgroundColor: "#c8e8a1",
    borderRadius: 999,
    height: "100%",
  },
  levelProgressReadout: {
    color: "#bdc9c3",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "center",
  },
  weeklyChaseCard: {
    backgroundColor: "rgba(235, 245, 239, 0.10)",
    borderColor: "rgba(235, 245, 239, 0.28)",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  weeklyChaseReset: {
    color: "#c8e8a1",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  weeklyChaseLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  weeklyChaseTrackWrap: {
    justifyContent: "center",
    minHeight: 42,
    position: "relative",
  },
  weeklyChaseFill: {
    borderRadius: 999,
    height: "100%",
  },
  weeklyChaseFillWinning: {
    backgroundColor: "#c8e8a1",
  },
  weeklyChaseFillLosing: {
    backgroundColor: "#f08a72",
  },
  weeklyChaseMarker: {
    borderColor: "#f08a72",
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    marginLeft: -15,
    overflow: "hidden",
    position: "absolute",
    top: 6,
    width: 30,
    zIndex: 2,
  },
  weeklyUserMarker: {
    borderColor: "#d7f2b5",
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    marginLeft: -15,
    overflow: "hidden",
    position: "absolute",
    top: 6,
    width: 30,
    zIndex: 3,
  },
  weeklyChaseMarkerImage: {
    height: "100%",
    width: "100%",
  },
  weeklyChaseReadout: {
    color: "#bdc9c3",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  weeklyChaseReadoutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  workoutCard: {
    backgroundColor: "rgba(235, 245, 239, 0.10)",
    borderColor: "rgba(235, 245, 239, 0.28)",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  workoutStatus: {
    color: "#c8e8a1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  workoutDistanceRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  workoutActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  workoutActionButton: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  pauseButton: {
    backgroundColor: "rgba(235, 190, 70, 0.82)",
    borderColor: "#f8d875",
  },
  stopButton: {
    backgroundColor: "rgba(183, 61, 52, 0.88)",
    borderColor: "#f18b7b",
  },
  resumeButton: {
    backgroundColor: "rgba(116, 181, 91, 0.88)",
    borderColor: "#c9efaa",
  },
  workoutActionText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginLeft: 5,
  },
  workoutMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  workoutDistanceValue: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 38,
  },
  workoutDistanceUnit: {
    color: "#c8e8a1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  workoutTime: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "800",
    lineHeight: 29,
  },
  workoutTimeLabel: {
    color: "#c8e8a1",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  workoutStatsButton: {
    alignItems: "center",
    borderColor: "rgba(200, 232, 161, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    paddingVertical: 9,
  },
  workoutStatsButtonText: {
    color: "#c8e8a1",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  villainTile: {
    backgroundColor: "rgba(235, 245, 239, 0.10)",
    borderColor: "rgba(235, 245, 239, 0.28)",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 14,
    padding: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.20,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  villainTileHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  villainTileLabel: {
    color: "#c8e8a1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  villainTileTitle: {
    color: "#f5f7f3",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 5,
  },
  villainTileDistance: {
    color: "#f08a72",
    fontSize: 20,
    fontWeight: "800",
  },
  viewAllText: {
    color: "#c8e8a1",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  villainChoices: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  villainChoice: {
    alignItems: "center",
    backgroundColor: "rgba(5, 15, 12, 0.28)",
    borderColor: "rgba(235, 245, 239, 0.18)",
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    paddingBottom: 8,
    paddingTop: 5,
  },
  villainChoiceSelected: {
    backgroundColor: "rgba(200, 232, 161, 0.82)",
    borderColor: "#e0f5c8",
  },
  villainImageFrame: {
    alignItems: "center",
    backgroundColor: "rgba(235, 245, 239, 0.12)",
    borderRadius: 12,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  villainChoiceImage: {
    height: 52,
    width: 52,
  },
  villainChoiceLabel: {
    color: "#c0ccc6",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 2,
  },
  villainChoiceLabelSelected: {
    color: "#e1f2ca",
  },
  villainChoiceStatus: {
    color: "rgba(235, 245, 239, 0.38)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
  },
  villainChoiceStatusSelected: {
    color: "#ffb4a5",
  },
  healthRow: {
    alignItems: "center",
    backgroundColor: "rgba(235, 245, 239, 0.09)",
    borderColor: "rgba(235, 245, 239, 0.22)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 12,
    padding: 16,
  },
  challengePreviewCard: {
    alignItems: "center",
    backgroundColor: "rgba(235, 245, 239, 0.10)",
    borderColor: "rgba(235, 245, 239, 0.28)",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 14,
    padding: 14,
    position: "relative",
  },
  challengePreviewIcon: {
    alignItems: "center",
    backgroundColor: "rgba(200, 232, 161, 0.15)",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  challengePreviewIconText: {
    color: "#dff5c4",
    fontSize: 31,
  },
  challengePreviewCopy: {
    flex: 1,
    marginLeft: 12,
  },
  challengeStreakText: {
    color: "#c8e8a1",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 7,
  },
  challengeStreakBadge: {
    color: "#c8e8a1",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
    position: "absolute",
    right: 14,
    top: 12,
  },
  challengeArrowButton: {
    alignItems: "center",
    backgroundColor: "rgba(235, 245, 239, 0.08)",
    borderColor: "rgba(235, 245, 239, 0.14)",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    marginLeft: 8,
    width: 44,
  },
  challengeArrow: {
    color: "#eaf5e7",
    fontSize: 24,
  },
  healthIcon: {
    alignItems: "center",
    backgroundColor: "rgba(240, 138, 114, 0.18)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  healthIconSaved: {
    backgroundColor: "rgba(200, 232, 161, 0.18)",
  },
  healthIconText: {
    color: "#f08a72",
    fontSize: 18,
  },
  healthCopy: {
    flex: 1,
    marginLeft: 12,
  },
  healthTitle: {
    color: "#f5f7f3",
    fontSize: 14,
    fontWeight: "800",
  },
  healthSubtitle: {
    color: "#aebcb5",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  error: {
    color: "#ffb19d",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
  },
  challengeCard: {
    backgroundColor: "rgba(55, 25, 22, 0.62)",
    borderColor: "rgba(240, 138, 114, 0.52)",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 18,
    padding: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 7,
  },
  challengeOverlay: {
    backgroundColor: "rgba(3, 8, 6, 0.72)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 18,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 10,
  },
  challengeVillainImage: {
    alignSelf: "center",
    borderColor: "rgba(240, 138, 114, 0.62)",
    borderRadius: 42,
    borderWidth: 2,
    height: 84,
    marginBottom: 14,
    width: 84,
  },
  eventRaceSection: {
    backgroundColor: "rgba(5, 15, 12, 0.28)",
    borderColor: "rgba(235, 245, 239, 0.16)",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 12,
  },
  eventRaceLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eventRaceLabel: {
    color: "#c8e8a1",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  eventRaceTrackWrap: {
    justifyContent: "center",
    minHeight: 44,
    position: "relative",
  },
  eventRaceTrack: {
    backgroundColor: "rgba(235, 245, 239, 0.16)",
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
  },
  eventRacePlayerFill: {
    backgroundColor: "#c8e8a1",
    borderRadius: 999,
    height: "100%",
  },
  eventRacePlayerMarker: {
    borderColor: "#e1f2ca",
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    marginLeft: -15,
    overflow: "hidden",
    position: "absolute",
    top: 7,
    width: 30,
    zIndex: 2,
  },
  eventRaceMonsterMarker: {
    borderColor: "#f08a72",
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    marginLeft: -15,
    overflow: "hidden",
    position: "absolute",
    top: 7,
    width: 30,
    zIndex: 3,
  },
  eventRaceMarkerImage: {
    height: "100%",
    width: "100%",
  },
  eventRaceReadout: {
    color: "#bdc9c3",
    fontSize: 10,
    marginTop: 5,
    textAlign: "center",
  },
  chaserPickerOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(3, 8, 6, 0.78)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 24,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 12,
  },
  chaserPickerCard: {
    backgroundColor: "#17231f",
    borderColor: "rgba(220, 241, 197, 0.38)",
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    width: "100%",
  },
  chaserPickerChoices: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },
  pickerChoice: {
    alignItems: "center",
    flex: 1,
  },
  pickerChoiceImage: {
    borderRadius: 32,
    height: 64,
    width: 64,
  },
  pickerChoiceLabel: {
    color: "#c0ccc6",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 6,
  },
  pickerChoiceSelected: {
    color: "#c8e8a1",
  },
  avatarPickerChoices: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginTop: 18,
  },
  avatarChoice: {
    alignItems: "center",
    borderColor: "rgba(235, 245, 239, 0.16)",
    borderRadius: 34,
    borderWidth: 1,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  avatarChoiceSelected: {
    borderColor: "#c8e8a1",
    borderWidth: 2,
  },
  avatarChoiceImage: {
    borderRadius: 28,
    height: 60,
    width: 60,
  },
  pickerCloseButton: {
    alignItems: "center",
    borderColor: "rgba(235, 245, 239, 0.20)",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    paddingVertical: 11,
  },
  pickerCloseText: {
    color: "#c8e8a1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  challengeEyebrow: {
    color: "#f08a72",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  challengeTitle: {
    color: "#fff4ef",
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 29,
    marginTop: 10,
  },
  challengeDetail: {
    color: "#dbcac5",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  challengeTimerWrap: {
    alignItems: "center",
    backgroundColor: "rgba(240, 138, 114, 0.12)",
    borderColor: "rgba(240, 138, 114, 0.20)",
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 16,
    paddingVertical: 10,
  },
  challengeTimerLabel: {
    color: "#f08a72",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  challengeTimerValue: {
    color: "#fff4ef",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
  },
  challengeActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  challengeActionPrimary: {
    backgroundColor: "#f08a72",
    borderRadius: 999,
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  challengeActionPrimaryText: {
    color: "#24100c",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  challengeActionSecondary: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  challengeActionSecondaryText: {
    color: "#f1ddd7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(210, 239, 177, 0.92)",
    borderColor: "rgba(235, 250, 216, 0.55)",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 56,
    marginTop: 24,
    shadowColor: "#000000",
    shadowOpacity: 0.20,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  primaryButtonText: {
    color: "#102019",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  resetButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: 8,
  },
  resetButtonText: {
    color: "#aebcb5",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  note: {
    color: "#92a19a",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 24,
    textAlign: "center",
  },
  bottomNav: {
    alignItems: "stretch",
    backgroundColor: "rgba(15, 31, 24, 0.76)",
    borderColor: "rgba(235, 245, 239, 0.24)",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 18,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  bottomNavItem: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    paddingVertical: 8,
  },
  bottomNavItemActive: {
    backgroundColor: "rgba(200, 232, 161, 0.16)",
  },
  bottomNavIcon: {
    color: "rgba(235, 245, 239, 0.72)",
    fontSize: 21,
  },
  bottomNavLabel: {
    color: "rgba(235, 245, 239, 0.68)",
    fontSize: 9,
    marginTop: 4,
  },
  bottomNavActiveText: {
    color: "#dff5c4",
  },
});
