import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ImageBackground,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { chaserSounds } from "../../assets/sounds";
import { requestHealthPermissions, saveWorkoutToHealth } from "../services/healthkit";

const metersPerMile = 1609.344;
const feetPerMeter = 3.28084;
const maximumAcceptedAccuracy = 100;
const maximumAcceptedSegment = 50;
const avatarCustomization = {
  seed: "questtfit-runner",
  skinColor: "edb98a",
  hairColor: "2c1b18",
  clothingColor: "b4e36a",
  backgroundColor: "17231f",
};

const avatarUrl = `https://api.dicebear.com/9.x/avataaars/png?size=96&seed=${avatarCustomization.seed}&skinColor=${avatarCustomization.skinColor}&hairColor=${avatarCustomization.hairColor}&clothingColor=${avatarCustomization.clothingColor}&backgroundColor=${avatarCustomization.backgroundColor}`;
const villains = {
  werewolf: { label: "WEREWOLF", seed: "moon-werewolf", color: "6b7280", background: "d9f0e2" },
  witch: { label: "WITCH", seed: "night-witch", color: "7c3aed", background: "eadcff" },
  vampire: { label: "VAMPIRE", seed: "crimson-vampire", color: "991b1b", background: "f9dede" },
} as const;

type VillainKey = keyof typeof villains;

type Challenge = {
  title: string;
  detail: string;
  durationSeconds: number;
  status: "offered" | "active";
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
  { title: "Quick sprint", detail: "Pick up the pace for 30 seconds.", durationSeconds: 30 },
  { title: "Steady push", detail: "Keep moving continuously for 60 seconds.", durationSeconds: 60 },
  { title: "Form check", detail: "Relax your shoulders and take 10 controlled steps.", durationSeconds: 30 },
];

function buildRandomChaseChallenge(villainKey: VillainKey): Challenge {
  const copy = villainChallengeMessages[villainKey];

  return {
    title: copy.headline,
    detail: copy.instruction,
    durationSeconds: 60,
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
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [distance, setDistance] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState("not-connected");
  const [selectedVillain, setSelectedVillain] = useState<VillainKey>("werewolf");
  const avatarMotion = useRef(new Animated.Value(0)).current;
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeSeconds, setChallengeSeconds] = useState(0);
  const [scrubbedProgress, setScrubbedProgress] = useState(0);
  const [sliderWidth, setSliderWidth] = useState(1);
  const eventAudioPlayer = useAudioPlayer(null);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const webLocationWatchId = useRef<number | null>(null);
  const previousLocation = useRef<LocationLike | null>(null);
  const startedAt = useRef<Date | null>(null);

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
      const completionTimer = setTimeout(() => setChallenge(null), 900);
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
        setErrorMessage("Location access is needed to measure your workout.");
        return;
      }

      if (typeof Location.hasServicesEnabledAsync === "function") {
        const servicesEnabled = await Location.hasServicesEnabledAsync();

        if (!servicesEnabled) {
          setErrorMessage("Turn on Location Services in Settings, then try again.");
          return;
        }
      }

      try {
        const healthAvailable = await requestHealthPermissions();
        setHealthStatus(healthAvailable ? "connected" : "not-supported");
      } catch {
        setHealthStatus("not-supported");
      }

      previousLocation.current = null;
      startedAt.current = new Date();
      setDistance(0);
      setElapsedSeconds(0);
      setChallenge(null);
      setChallengeSeconds(0);

      const handleLocationUpdate = (coords: LocationLike) => {
        setAccuracy(coords.accuracy ?? null);

        const currentAccuracy = coords.accuracy;
        const usableAccuracy = currentAccuracy !== null && currentAccuracy !== undefined && currentAccuracy <= maximumAcceptedAccuracy;

        if (!usableAccuracy) {
          return;
        }

        if (previousLocation.current) {
          const segmentDistance = distanceBetweenPoints(previousLocation.current, coords);

          if (segmentDistance >= 1 && segmentDistance <= maximumAcceptedSegment) {
            setDistance((currentDistance) => currentDistance + segmentDistance);
          }
        }

        previousLocation.current = coords;
      };

      try {
        subscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
          },
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

      setIsTracking(true);
    } catch {
      setErrorMessage("We could not start location tracking. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function stopTracking() {
    const workoutStart = startedAt.current;
    const workoutDistance = distance;
    const workoutEnd = new Date();

    subscription.current?.remove();
    subscription.current = null;

    if (typeof navigator !== "undefined" && "geolocation" in navigator && webLocationWatchId.current !== null) {
      navigator.geolocation.clearWatch(webLocationWatchId.current);
      webLocationWatchId.current = null;
    }

    startedAt.current = null;
    previousLocation.current = null;
    setIsTracking(false);

    if (workoutStart && workoutDistance > 0) {
      try {
        const saved = await saveWorkoutToHealth(workoutDistance, workoutStart, workoutEnd);
        setHealthStatus(saved ? "saved" : "not-supported");
      } catch {
        setHealthStatus("error");
        setErrorMessage("The workout stayed on this device, but Apple Health could not save it.");
      }
    }
  }

  async function resetWorkout() {
    await stopTracking();
    setDistance(0);
    setElapsedSeconds(0);
    setAccuracy(null);
    setErrorMessage(null);
  }

  function acceptChallenge() {
    if (!challenge) {
      return;
    }

    setChallenge({ ...challenge, status: "active" });
    setChallengeSeconds(challenge.durationSeconds);
  }

  function skipChallenge() {
    setChallenge(null);
    setChallengeSeconds(0);
  }

  const totalMiles = distance / metersPerMile;
  const formattedMiles = totalMiles.toFixed(2);
  const formattedFeet = Math.round(distance * feetPerMeter);
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
  useEffect(() => {
    setScrubbedProgress(progressPercent);
  }, [progressPercent]);

  function updateSliderFromX(x: number) {
    const next = Math.min(100, Math.max(0, (x / Math.max(sliderWidth, 1)) * 100));
    setScrubbedProgress(next);
  }

  const sliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => updateSliderFromX(event.nativeEvent.locationX),
      onPanResponderMove: (event) => updateSliderFromX(event.nativeEvent.locationX),
    }),
  ).current;
  const villainProgressPercent = Math.max(progressPercent - 18, 0);
  const villainProgressWidth = `${villainProgressPercent}%` as `${number}%`;
  const selectedVillainConfig = villains[selectedVillain];
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
        <View style={styles.header}>
          <Text style={styles.eyebrow}>QUESTTFIT / LIVE SESSION</Text>
          <Text style={styles.title}>Move with purpose.</Text>
          <Text style={styles.subtitle}>
            Use your iPhone&apos;s location to measure the ground you cover.
          </Text>
        </View>

        <View style={styles.distancePanel}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isTracking && styles.statusDotActive]} />
            <Text style={styles.statusText}>{isTracking ? "TRACKING NOW" : "READY TO TRACK"}</Text>
          </View>
          <Text style={styles.distanceValue}>{formattedMiles}</Text>
          <Text style={styles.distanceUnit}>MILES</Text>
          <Text style={styles.secondaryDistance}>{formattedFeet} feet</Text>
        </View>

        <View style={styles.levelProgressCard}>
          <View style={styles.glassCardHeader}>
            <View>
              <Text style={styles.cardEyebrow}>RUN PROGRESS</Text>
              <Text style={styles.cardTitle}>MILES TO NEXT LEVEL</Text>
            </View>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>LVL {currentLevel}</Text>
            </View>
          </View>

          <View style={styles.levelProgressMeta}>
            <View style={styles.levelProgressSide}>
              <Text style={styles.levelProgressLabel}>{currentMileageLabel}</Text>
              <Text style={styles.levelProgressSubLabel}>CURRENT</Text>
            </View>
            <View style={[styles.levelProgressSide, { alignItems: "flex-end" }]}>
              <Text style={styles.levelProgressLabel}>{nextLevelLabel}</Text>
              <Text style={styles.levelProgressSubLabel}>NEXT LEVEL</Text>
            </View>
          </View>

          <View
            accessibilityLabel="Level progress slider"
            style={styles.sliderArea}
            onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
            {...sliderPanResponder.panHandlers}
          >
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${scrubbedProgress}%` }]} />
            </View>
            <View style={[styles.liveMarker, { left: progressWidth }]}>
              <Text style={styles.liveMarkerText}>LIVE</Text>
            </View>
            <View style={[styles.sliderThumb, { left: `${scrubbedProgress}%` }]}>
              <View style={styles.sliderThumbInner} />
            </View>
          </View>

          <Text style={styles.sliderHint}>SLIDE TO PREVIEW LEVEL PROGRESS</Text>

          <View style={styles.levelRail}>
            {[currentLevel, currentLevel + 1, currentLevel + 2].map((level) => (
              <View key={level} style={[styles.levelRailItem, level === currentLevel && styles.levelRailItemActive]}>
                <Text style={[styles.levelRailText, level === currentLevel && styles.levelRailTextActive]}>LVL {level}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.villainTile}>
          <View style={styles.glassCardHeader}>
            <View>
              <Text style={styles.cardEyebrow}>YOUR CHASER</Text>
              <Text style={styles.cardTitle}>{selectedVillainConfig.label} IS CLOSING IN</Text>
            </View>
            <View style={styles.dangerBadge}>
              <Text style={styles.dangerBadgeText}>{villainProgressPercent}%</Text>
            </View>
          </View>

          <View style={styles.villainChoices}>
            {(Object.keys(villains) as VillainKey[]).map((villainKey) => {
              const villain = villains[villainKey];
              const isSelected = villainKey === selectedVillain;
              const choiceUrl = `https://api.dicebear.com/9.x/adventurer/png?size=72&seed=${villain.seed}&backgroundColor=${villain.background}&hairColor=${villain.color}`;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={villainKey}
                  onPress={() => setSelectedVillain(villainKey)}
                  style={[styles.villainChoice, isSelected && styles.villainChoiceSelected]}
                >
                  <View style={styles.villainImageFrame}>
                    <Image source={choiceUrl} style={styles.villainChoiceImage} contentFit="cover" />
                  </View>
                  <Text style={[styles.villainChoiceLabel, isSelected && styles.villainChoiceLabelSelected]}>
                    {villain.label}
                  </Text>
                  <Text style={[styles.villainChoiceStatus, isSelected && styles.villainChoiceStatusSelected]}>
                    {isSelected ? "ACTIVE" : "SELECT"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>TIME</Text>
            <Text style={styles.statValue}>{formattedTime}</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>GPS ACCURACY</Text>
            <Text style={styles.statValue}>{accuracy === null ? "--" : `${Math.round(accuracy)} m`}</Text>
          </View>
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
          <View style={styles.challengeCard}>
            <Text style={styles.challengeEyebrow}>
              {challenge.status === "active" ? "CHASE IN PROGRESS" : villainChallengeMessages[selectedVillain].cue}
            </Text>
            <Text style={styles.challengeTitle}>{challenge.title}</Text>
            <Text style={styles.challengeDetail}>{challenge.detail}</Text>

            {challenge.status === "active" && (
              <View style={styles.challengeTimerWrap}>
                <Text style={styles.challengeTimerLabel}>RUN TIMER</Text>
                <Text style={styles.challengeTimerValue}>{challengeCountdownLabel}</Text>
              </View>
            )}

            <View style={styles.challengeActions}>
              {challenge.status === "offered" ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={acceptChallenge}
                    style={({ pressed }) => [styles.challengeActionPrimary, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.challengeActionPrimaryText}>RUN NOW</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={skipChallenge}
                    style={({ pressed }) => [styles.challengeActionSecondary, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.challengeActionSecondaryText}>IGNORE</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={skipChallenge}
                  style={({ pressed }) => [styles.challengeActionSecondary, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.challengeActionSecondaryText}>FINISH CHASE</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={isLoading}
          onPress={isTracking ? stopTracking : startTracking}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
        >
          {isLoading ? (
            <ActivityIndicator color="#10211d" />
          ) : (
            <Text style={styles.primaryButtonText}>{isTracking ? "PAUSE TRACKING" : "START TRACKING"}</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={isLoading || (distance === 0 && elapsedSeconds === 0)}
          onPress={resetWorkout}
          style={({ pressed }) => [styles.resetButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.resetButtonText}>RESET SESSION</Text>
        </Pressable>

        <Text style={styles.note}>
          Tracking works while the app is open. Keep Location Services and Precise Location enabled for the most reliable measurement.
        </Text>
          </ScrollView>
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
    padding: 20,
    paddingTop: 30,
    paddingBottom: 36,
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
    minHeight: 280,
    aspectRatio: 1,
    alignSelf: "stretch",
    padding: 22,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
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
    fontSize: 70,
    fontWeight: "800",
    letterSpacing: -2,
    lineHeight: 78,
    marginTop: 15,
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
    minHeight: 285,
    padding: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.20,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  levelProgressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
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
  sliderArea: {
    justifyContent: "center",
    minHeight: 36,
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
  sliderThumb: {
    alignItems: "center",
    backgroundColor: "rgba(220, 241, 197, 0.95)",
    borderColor: "rgba(255,255,255,0.8)",
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: "center",
    marginLeft: -15,
    position: "absolute",
    width: 30,
  },
  sliderThumbInner: {
    backgroundColor: "#203028",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  liveMarker: {
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -16,
    position: "absolute",
    top: -17,
    width: 32,
  },
  liveMarkerText: {
    color: "rgba(235, 245, 239, 0.55)",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  sliderHint: {
    color: "rgba(235, 245, 239, 0.48)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 12,
    textAlign: "center",
  },
  levelRail: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  levelRailItem: {
    alignItems: "center",
    backgroundColor: "rgba(5, 15, 12, 0.28)",
    borderColor: "rgba(235, 245, 239, 0.12)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  levelRailItemActive: {
    backgroundColor: "rgba(205, 231, 174, 0.15)",
    borderColor: "rgba(220, 241, 197, 0.35)",
  },
  levelRailText: {
    color: "rgba(235, 245, 239, 0.45)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  levelRailTextActive: {
    color: "#e1f2ca",
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
    marginTop: 9,
    textAlign: "center",
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
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  statBlock: {
    backgroundColor: "rgba(235, 245, 239, 0.09)",
    borderColor: "rgba(235, 245, 239, 0.22)",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    padding: 17,
  },
  statLabel: {
    color: "#aebcb5",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  statValue: {
    color: "#f6f8f5",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 8,
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
});
