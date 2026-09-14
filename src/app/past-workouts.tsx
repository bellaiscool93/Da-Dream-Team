import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ImageBackground,
    Modal,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { getWorkoutHistory, WorkoutRecord } from "../services/distanceStats";

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

function formatPace(minutesPerMile: number) {
  if (minutesPerMile <= 0) {
    return "-- /mi";
  }

  const totalSeconds = Math.round(minutesPerMile * 60);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")} /mi`;
}

export default function PastWorkouts() {
  const router = useRouter();
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutRecord[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [dateQuery, setDateQuery] = useState("");

  useEffect(() => {
    getWorkoutHistory().then(setWorkoutHistory);
  }, []);

  const totalMiles = workoutHistory.reduce((total, workout) => total + workout.distanceMeters / 1609.344, 0);
  const averageDistance = workoutHistory.length > 0 ? totalMiles / workoutHistory.length : 0;
  const averageSeconds = workoutHistory.length > 0
    ? workoutHistory.reduce((total, workout) => total + workout.durationSeconds, 0) / workoutHistory.length
    : 0;
  const averagePace = averageDistance > 0 ? averageSeconds / 60 / averageDistance : 0;
  const completedEvents = workoutHistory.reduce((total, workout) => total + workout.eventsCompleted, 0);
  const filteredHistory = workoutHistory.filter((workout) => {
    if (!dateQuery.trim()) {
      return true;
    }

    const searchDate = new Date(workout.startedAt).toLocaleDateString().toLowerCase();
    const monthDay = new Date(workout.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase();
    return searchDate.includes(dateQuery.toLowerCase()) || monthDay.includes(dateQuery.toLowerCase());
  });
  const visibleHistory = (showAll ? filteredHistory : filteredHistory.slice(0, 5));

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <ImageBackground
        source={require("../../assets/images/forest-background.png")}
        resizeMode="cover"
        style={styles.background}
        imageStyle={styles.backgroundImage}
      >
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.header}>
              <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
                <Text style={styles.backArrow}>←</Text>
              </Pressable>
              <View>
                <Text style={styles.eyebrow}>QUESTFIT / PERFORMANCE</Text>
                <Text style={styles.title}>Past workouts</Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.cardEyebrow}>WORKOUT SUMMARY</Text>
              <Text style={styles.cardTitle}>YOUR RUN HISTORY</Text>
              <View style={styles.metricGrid}>
                <Metric label="WORKOUTS" value={`${workoutHistory.length}`} />
                <Metric label="AVG DISTANCE" value={`${averageDistance.toFixed(2)} mi`} />
                <Metric label="AVG TIME" value={formatDuration(averageSeconds)} />
                <Metric label="AVG PACE" value={formatPace(averagePace)} />
                <View style={styles.metricCellWide}>
                  <Text style={styles.metricLabel}>EVENTS COMPLETED</Text>
                  <Text style={styles.metricValue}>{completedEvents}</Text>
                </View>
              </View>
            </View>

            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <View>
                  <Text style={styles.cardEyebrow}>RECENT RUNS</Text>
                  <Text style={styles.cardTitle}>PAST WORKOUTS</Text>
                </View>
                <Pressable onPress={() => setShowAll(true)} style={styles.viewAllButton}>
                  <Text style={styles.viewAllText}>VIEW ALL</Text>
                </Pressable>
              </View>
              {workoutHistory.length === 0 ? (
                <Text style={styles.emptyHistory}>Complete a run to start building your workout history.</Text>
              ) : (
                visibleHistory.map((workout) => (
                  <View key={workout.id} style={styles.historyRow}>
                    <View style={styles.historyDateBlock}>
                      <Text style={styles.historyDate}>{new Date(workout.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                      <Text style={styles.historyEvents}>{workout.eventsCompleted} events</Text>
                    </View>
                    <View style={styles.historyMetric}>
                      <Text style={styles.historyValue}>{(workout.distanceMeters / 1609.344).toFixed(2)} mi</Text>
                      <Text style={styles.historyLabel}>DISTANCE</Text>
                    </View>
                    <View style={styles.historyMetric}>
                      <Text style={styles.historyValue}>{formatDuration(workout.durationSeconds)}</Text>
                      <Text style={styles.historyLabel}>TIME</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </ImageBackground>
      <Modal animationType="slide" transparent visible={showAll} onRequestClose={() => setShowAll(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.cardEyebrow}>FULL HISTORY</Text>
                <Text style={styles.cardTitle}>ALL WORKOUTS</Text>
              </View>
              <Pressable onPress={() => setShowAll(false)} style={styles.closeButton}>
                <Text style={styles.closeText}>CLOSE</Text>
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Search workouts by date"
              onChangeText={setDateQuery}
              placeholder="Search by date"
              placeholderTextColor="rgba(235, 245, 239, 0.46)"
              style={styles.dateSearch}
              value={dateQuery}
            />
            <ScrollView>
              {filteredHistory.length === 0 ? (
                <Text style={styles.emptyHistory}>No workouts match that date.</Text>
              ) : (
                filteredHistory.map((workout) => (
                  <View key={workout.id} style={styles.historyRow}>
                    <View style={styles.historyDateBlock}>
                      <Text style={styles.historyDate}>{new Date(workout.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
                      <Text style={styles.historyEvents}>{workout.eventsCompleted} events</Text>
                    </View>
                    <View style={styles.historyMetric}>
                      <Text style={styles.historyValue}>{(workout.distanceMeters / 1609.344).toFixed(2)} mi</Text>
                      <Text style={styles.historyLabel}>DISTANCE</Text>
                    </View>
                    <View style={styles.historyMetric}>
                      <Text style={styles.historyValue}>{formatDuration(workout.durationSeconds)}</Text>
                      <Text style={styles.historyLabel}>TIME</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#07110e", flex: 1 },
  background: { flex: 1 },
  backgroundImage: { opacity: 0.55 },
  overlay: { backgroundColor: "rgba(5, 15, 12, 0.70)", flex: 1 },
  container: { padding: 18, paddingBottom: 32 },
  header: { alignItems: "center", flexDirection: "row", marginBottom: 22 },
  backButton: { alignItems: "center", height: 42, justifyContent: "center", marginRight: 12, width: 42 },
  backArrow: { color: "#eff8ed", fontSize: 30 },
  eyebrow: { color: "#c8e8a1", fontSize: 10, fontWeight: "800", letterSpacing: 1.8 },
  title: { color: "#f5f7f3", fontFamily: "serif", fontSize: 32, marginTop: 4 },
  summaryCard: { backgroundColor: "rgba(235, 245, 239, 0.11)", borderColor: "rgba(235, 245, 239, 0.27)", borderRadius: 24, borderWidth: 1, padding: 16 },
  historyCard: { backgroundColor: "rgba(235, 245, 239, 0.11)", borderColor: "rgba(235, 245, 239, 0.27)", borderRadius: 24, borderWidth: 1, marginTop: 14, padding: 16 },
  cardEyebrow: { color: "rgba(235, 245, 239, 0.72)", fontSize: 10, fontWeight: "800", letterSpacing: 1.8 },
  cardTitle: { color: "#ffffff", fontSize: 15, fontWeight: "800", marginTop: 5 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  metricCell: { backgroundColor: "rgba(5, 15, 12, 0.24)", borderColor: "rgba(235, 245, 239, 0.12)", borderRadius: 12, borderWidth: 1, flexBasis: "47%", flexGrow: 1, padding: 10 },
  metricCellWide: { backgroundColor: "rgba(5, 15, 12, 0.24)", borderColor: "rgba(235, 245, 239, 0.12)", borderRadius: 12, borderWidth: 1, flexBasis: "100%", padding: 10 },
  metricLabel: { color: "rgba(235, 245, 239, 0.58)", fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  metricValue: { color: "#e1f2ca", fontSize: 16, fontWeight: "800", marginTop: 5 },
  historyHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  viewAllButton: { borderColor: "rgba(200, 232, 161, 0.28)", borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  viewAllText: { color: "#c8e8a1", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  emptyHistory: { color: "rgba(235, 245, 239, 0.62)", fontSize: 12, lineHeight: 18, marginTop: 14 },
  historyRow: { alignItems: "center", borderBottomColor: "rgba(235, 245, 239, 0.12)", borderBottomWidth: 1, flexDirection: "row", paddingVertical: 13 },
  historyDateBlock: { flex: 1 },
  historyDate: { color: "#e1f2ca", fontSize: 13, fontWeight: "800" },
  historyEvents: { color: "rgba(235, 245, 239, 0.55)", fontSize: 10, marginTop: 4 },
  historyMetric: { alignItems: "flex-end", marginLeft: 12 },
  historyValue: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  historyLabel: { color: "rgba(235, 245, 239, 0.48)", fontSize: 8, fontWeight: "800", letterSpacing: 0.8, marginTop: 3 },
  modalOverlay: { backgroundColor: "rgba(3, 8, 6, 0.82)", flex: 1, justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#17231f", borderColor: "rgba(220, 241, 197, 0.34)", borderRadius: 24, borderWidth: 1, maxHeight: "86%", padding: 18 },
  closeButton: { borderColor: "rgba(235, 245, 239, 0.20)", borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  closeText: { color: "#c8e8a1", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  dateSearch: { backgroundColor: "rgba(235, 245, 239, 0.10)", borderColor: "rgba(235, 245, 239, 0.22)", borderRadius: 14, borderWidth: 1, color: "#ffffff", fontSize: 13, marginTop: 16, paddingHorizontal: 12, paddingVertical: 11 },
});
