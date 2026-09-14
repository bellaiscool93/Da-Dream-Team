import { Image } from "expo-image";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { requestHealthPermissions, saveWorkoutToHealth } from "../services/healthkit";

const metersPerMile = 1609.344;
const feetPerMeter = 3.28084;
const maximumAcceptedAccuracy = 100;
const maximumAcceptedSegment = 50;
const avatarProfiles = {
  sprinter: {
    label: "SPRINTER",
    seed: "questtfit-sprinter",
    skinColor: "edb98a",
    hairColor: "2c1b18",
    clothingColor: "de5c38",
    backgroundColor: "f6c453",
    runner: "🏃",
  },
  trailblazer: {
    label: "TRAILBLAZER",
    seed: "questtfit-trailblazer",
    skinColor: "9e5622",
    hairColor: "4a312c",
    clothingColor: "7bd6a7",
    backgroundColor: "d9f0e2",
    runner: "🏃🏻",
  },
  nightRunner: {
    label: "NIGHT RUNNER",
    seed: "questtfit-night-runner",
    skinColor: "614335",
    hairColor: "111827",
    clothingColor: "7c3aed",
    backgroundColor: "eadcff",
    runner: "🏃🏿",
  },
} as const;

type AvatarProfileKey = keyof typeof avatarProfiles;
const villains = {
  werewolf: {
    label: "WEREWOLF",
    seed: "moon-werewolf",
    color: "6b7280",
    background: "d9f0e2",
    image: require("../../assets/images/werewolf.png"),
  },
  witch: {
    label: "WITCH",
    seed: "night-witch",
    color: "7c3aed",
    background: "eadcff",
    image: require("../../assets/images/witch.png"),
  },
  vampire: {
    label: "VAMPIRE",
    seed: "crimson-vampire",
    color: "991b1b",
    background: "f9dede",
    image: require("../../assets/images/vampire.png"),
  },
} as const;

type VillainKey = keyof typeof villains;

function distanceBetweenPoints(
  start: Location.LocationObjectCoords,
  end: Location.LocationObjectCoords,
) {
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
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarProfileKey>("sprinter");
  const avatarMotion = useRef(new Animated.Value(0)).current;
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const previousLocation = useRef<Location.LocationObjectCoords | null>(null);
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
    return () => subscription.current?.remove();
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

  async function startTracking() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage("Location access is needed to measure your workout.");
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setErrorMessage("Turn on Location Services in Settings, then try again.");
        return;
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

      subscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 1,
        },
        (location) => {
          const { coords } = location;
          setAccuracy(coords.accuracy);

          const currentAccuracy = coords.accuracy;
          const usableAccuracy =
            currentAccuracy !== null && currentAccuracy <= maximumAcceptedAccuracy;

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
        },
        (reason) => setErrorMessage(reason),
      );

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

  const formattedDistance = (distance / 1000).toFixed(3);
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
  const villainProgressPercent = Math.max(progressPercent - 18, 0);
  const villainProgressWidth = `${villainProgressPercent}%` as `${number}%`;
  const selectedAvatarConfig = avatarProfiles[selectedAvatar];
  const avatarUrl = `https://api.dicebear.com/9.x/avataaars/png?size=96&seed=${selectedAvatarConfig.seed}&skinColor=${selectedAvatarConfig.skinColor}&hairColor=${selectedAvatarConfig.hairColor}&clothingColor=${selectedAvatarConfig.clothingColor}&backgroundColor=${selectedAvatarConfig.backgroundColor}`;
  const selectedVillainConfig = villains[selectedVillain];
  const villainUrl = selectedVillainConfig.image ?? `https://api.dicebear.com/9.x/adventurer/png?size=96&seed=${selectedVillainConfig.seed}&backgroundColor=${selectedVillainConfig.background}&hairColor=${selectedVillainConfig.color}`;
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

  return (
    <SafeAreaView style={styles.safeArea}>
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
          <Text style={styles.distanceValue}>{formattedDistance}</Text>
          <Text style={styles.distanceUnit}>KILOMETERS</Text>
          <Text style={styles.secondaryDistance}>{formattedFeet} feet · {formattedMiles} miles</Text>
        </View>

        <View style={styles.levelProgressCard}>
          <View style={styles.levelProgressMeta}>
            <View style={styles.levelProgressSide}>
              <Text style={styles.levelProgressLabel}>lvl.{currentLevel}</Text>
              <Text style={styles.levelProgressSubLabel}>{currentLevelLabel}</Text>
            </View>
            <View style={styles.levelProgressSide}>
              <Text style={styles.levelProgressLabel}>lvl.{nextLevel}</Text>
              <Text style={styles.levelProgressSubLabel}>{nextLevelLabel}</Text>
            </View>
          </View>
          <View style={styles.progressTrackWrap}>
            <View style={[styles.chaserMarker, { left: villainProgressWidth }]}>
              <Image
                accessibilityLabel={`${selectedVillainConfig.label} chasing your avatar`}
                cachePolicy="disk"
                contentFit="cover"
                source={villainUrl}
                style={styles.markerImage}
                transition={250}
              />
            </View>
            <Animated.View
              style={[
                styles.runnerMarker,
                { left: progressWidth },
                {
                  transform: [
                    { translateY: avatarMotion.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
                    { rotate: avatarMotion.interpolate({ inputRange: [0, 1], outputRange: ["-5deg", "5deg"] }) },
                  ],
                },
              ]}
            >
              <Text accessibilityLabel={`${selectedAvatarConfig.label} running`} style={styles.runnerGlyph}>
                {selectedAvatarConfig.runner}
              </Text>
            </Animated.View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
          </View>
          <Text style={styles.levelProgressReadout}>{currentMileageLabel} / {nextLevelLabel}</Text>
        </View>

        <View style={styles.villainTile}>
          <View style={styles.villainTileHeader}>
            <View>
              <Text style={styles.villainTileLabel}>CHOOSE YOUR CHASER</Text>
              <Text style={styles.villainTileTitle}>{selectedVillainConfig.label} IS CLOSING IN</Text>
            </View>
            <Text style={styles.villainTileDistance}>{villainProgressPercent}%</Text>
          </View>
          <View style={styles.villainChoices}>
            {(Object.keys(villains) as VillainKey[]).map((villainKey) => {
              const villain = villains[villainKey];
              const isSelected = villainKey === selectedVillain;
              const choiceUrl = villain.image ?? `https://api.dicebear.com/9.x/adventurer/png?size=72&seed=${villain.seed}&backgroundColor=${villain.background}&hairColor=${villain.color}`;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={villainKey}
                  onPress={() => setSelectedVillain(villainKey)}
                  style={[styles.villainChoice, isSelected && styles.villainChoiceSelected]}
                >
                  <Image source={choiceUrl} style={styles.villainChoiceImage} contentFit="cover" />
                  <Text style={[styles.villainChoiceLabel, isSelected && styles.villainChoiceLabelSelected]}>
                    {villain.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.avatarTile}>
          <View style={styles.avatarTileHeader}>
            <View>
              <Text style={styles.avatarTileLabel}>CUSTOMIZE YOUR AVATAR</Text>
              <Text style={styles.avatarTileTitle}>{selectedAvatarConfig.label}</Text>
            </View>
            <Image
              accessibilityLabel={`${selectedAvatarConfig.label} avatar preview`}
              cachePolicy="disk"
              contentFit="cover"
              source={avatarUrl}
              style={styles.avatarPreview}
              transition={250}
            />
          </View>
          <View style={styles.avatarChoices}>
            {(Object.keys(avatarProfiles) as AvatarProfileKey[]).map((avatarKey) => {
              const avatar = avatarProfiles[avatarKey];
              const isSelected = avatarKey === selectedAvatar;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={avatarKey}
                  onPress={() => setSelectedAvatar(avatarKey)}
                  style={[styles.avatarChoice, isSelected && styles.avatarChoiceSelected]}
                >
                  <Text style={styles.avatarChoiceRunner}>{avatar.runner}</Text>
                  <Text style={[styles.avatarChoiceLabel, isSelected && styles.avatarChoiceLabelSelected]}>
                    {avatar.label}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3f0e8",
  },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 48,
  },
  header: {
    marginBottom: 32,
  },
  eyebrow: {
    color: "#de5c38",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 12,
  },
  title: {
    color: "#10211d",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 44,
  },
  subtitle: {
    color: "#5e6c66",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 340,
  },
  distancePanel: {
    backgroundColor: "#10211d",
    borderRadius: 18,
    minHeight: 270,
    padding: 24,
    justifyContent: "center",
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  statusDot: {
    backgroundColor: "#f6c453",
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  statusDotActive: {
    backgroundColor: "#7bd6a7",
  },
  statusText: {
    color: "#c9d1cb",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  distanceValue: {
    color: "#f3f0e8",
    fontSize: 76,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 88,
    marginTop: 22,
  },
  distanceUnit: {
    color: "#7bd6a7",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  secondaryDistance: {
    color: "#9ea9a1",
    fontSize: 15,
    marginTop: 8,
  },
  levelProgressCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    marginTop: 12,
    padding: 16,
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
    color: "#10211d",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  levelProgressSubLabel: {
    color: "#7b8981",
    fontSize: 12,
    marginTop: 4,
  },
  progressTrack: {
    backgroundColor: "#ebe6dc",
    borderRadius: 999,
    height: 12,
    overflow: "hidden",
  },
  progressTrackWrap: {
    justifyContent: "center",
    minHeight: 28,
    position: "relative",
  },
  avatarMarker: {
    backgroundColor: "#ffffff",
    borderColor: "#de5c38",
    borderRadius: 23,
    borderWidth: 3,
    height: 46,
    justifyContent: "center",
    marginLeft: -23,
    overflow: "hidden",
    position: "absolute",
    width: 46,
    zIndex: 2,
    
  },
  runnerMarker: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginLeft: -22,
    position: "absolute",
    width: 44,
    zIndex: 2,
  },
  runnerGlyph: {
    fontSize: 30,
    lineHeight: 38,
    transform: [{scaleX: -1}],
  },
  chaserMarker: {
    backgroundColor: "#ffffff",
    borderColor: "#10211d",
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    marginLeft: -18,
    opacity: 0.9,
    overflow: "hidden",
    position: "absolute",
    width: 36,
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
    backgroundColor: "#de5c38",
    borderRadius: 999,
    height: "100%",
  },
  levelProgressReadout: {
    color: "#10211d",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 10,
    textAlign: "center",
  },
  villainTile: {
    backgroundColor: "#10211d",
    borderRadius: 14,
    marginTop: 12,
    padding: 16,
  },
  villainTileHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  villainTileLabel: {
    color: "#7bd6a7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  villainTileTitle: {
    color: "#f3f0e8",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 5,
  },
  villainTileDistance: {
    color: "#f6c453",
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
    backgroundColor: "#1c302b",
    borderColor: "#345048",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingBottom: 8,
    paddingTop: 5,
  },
  villainChoiceSelected: {
    backgroundColor: "#de5c38",
    borderColor: "#f6c453",
  },
  villainChoiceImage: {
    height: 52,
    width: 52,
  },
  villainChoiceLabel: {
    color: "#c9d1cb",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 2,
  },
  villainChoiceLabelSelected: {
    color: "#10211d",
  },
  avatarTile: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    marginTop: 12,
    padding: 16,
  },
  avatarTileHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  avatarTileLabel: {
    color: "#de5c38",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  avatarTileTitle: {
    color: "#10211d",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 5,
  },
  avatarPreview: {
    backgroundColor: "#f3f0e8",
    borderRadius: 24,
    height: 48,
    width: 48,
  },
  avatarChoices: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  avatarChoice: {
    alignItems: "center",
    backgroundColor: "#f3f0e8",
    borderColor: "#ebe6dc",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    minHeight: 70,
    paddingHorizontal: 4,
    paddingVertical: 7,
  },
  avatarChoiceSelected: {
    backgroundColor: "#f6c453",
    borderColor: "#de5c38",
  },
  avatarChoiceRunner: {
    fontSize: 27,
    lineHeight: 34,
    transform: [{scaleX: -1}],
  },
  avatarChoiceLabel: {
    color: "#5e6c66",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginTop: 2,
    textAlign: "center",
  },
  avatarChoiceLabelSelected: {
    color: "#10211d",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  statBlock: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    flex: 1,
    padding: 18,
  },
  statLabel: {
    color: "#7b8981",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  statValue: {
    color: "#10211d",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 8,
  },
  healthRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    flexDirection: "row",
    marginTop: 12,
    padding: 16,
  },
  healthIcon: {
    alignItems: "center",
    backgroundColor: "#f9dede",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  healthIconSaved: {
    backgroundColor: "#d9f0e2",
  },
  healthIconText: {
    color: "#de5c38",
    fontSize: 18,
  },
  healthCopy: {
    flex: 1,
    marginLeft: 12,
  },
  healthTitle: {
    color: "#10211d",
    fontSize: 14,
    fontWeight: "800",
  },
  healthSubtitle: {
    color: "#7b8981",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  error: {
    color: "#b43e2a",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#f6c453",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 56,
    marginTop: 24,
  },
  primaryButtonText: {
    color: "#10211d",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  resetButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: 8,
  },
  resetButtonText: {
    color: "#5e6c66",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  note: {
    color: "#7b8981",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 24,
    textAlign: "center",
  },
});
