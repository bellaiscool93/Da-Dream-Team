import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { requestHealthPermissions, saveWorkoutToHealth } from "../services/healthkit";

const metersPerMile = 1609.344;

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

  async function startTracking() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const healthAvailable = await requestHealthPermissions();
      setHealthStatus(healthAvailable ? "connected" : "not-supported");

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

      previousLocation.current = null;
      startedAt.current = new Date();
      setDistance(0);
      setElapsedSeconds(0);

      subscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
        },
        (location) => {
          const { coords } = location;
          setAccuracy(coords.accuracy);

          if (coords.accuracy !== null && coords.accuracy <= 100) {
            if (previousLocation.current) {
              setDistance((currentDistance) =>
                currentDistance + distanceBetweenPoints(previousLocation.current!, coords),
              );
            }
            previousLocation.current = coords;
          }
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

  const formattedDistance = (distance / 1000).toFixed(2);
  const formattedMiles = (distance / metersPerMile).toFixed(2);
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
          <Text style={styles.secondaryDistance}>{formattedMiles} miles</Text>
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
            <Text style={styles.healthSubtitle}>Workout distance will sync when you stop.</Text>
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
