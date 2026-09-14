import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ImageBackground,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { DistanceRange, getDistanceRange, WeeklyDistancePoint } from "../services/distanceStats";

const chartHeight = 190;

export default function Stats() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [distanceRange, setDistanceRange] = useState<DistanceRange>("7d");
  const [weeklyDistance, setWeeklyDistance] = useState<WeeklyDistancePoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getDistanceRange(distanceRange).then((points) => {
      if (!cancelled) {
        setWeeklyDistance(points);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [distanceRange]);

  const chartWidth = Math.max(width - 96, 240);
  const maxMiles = Math.max(...weeklyDistance.map((point) => point.miles), 1);
  const totalMiles = weeklyDistance.reduce((total, point) => total + point.miles, 0);
  const averageMiles = weeklyDistance.length > 0 ? totalMiles / weeklyDistance.length : 0;
  const selectedPointData = weeklyDistance.find((point) => point.dateKey === selectedPoint);
  const plotPoints = weeklyDistance.map((point, index) => ({
    ...point,
    x: weeklyDistance.length > 1 ? (index / (weeklyDistance.length - 1)) * (chartWidth - 24) + 12 : chartWidth / 2,
    y: chartHeight - (point.miles / maxMiles) * (chartHeight - 28) - 14,
  }));

  const lineSegments = useMemo(
    () =>
      plotPoints.slice(1).map((point, index) => {
        const previousPoint = plotPoints[index];
        const deltaX = point.x - previousPoint.x;
        const deltaY = point.y - previousPoint.y;
        const length = Math.sqrt(deltaX ** 2 + deltaY ** 2);
        const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

        return {
          key: `${previousPoint.dateKey}-${point.dateKey}`,
          left: (previousPoint.x + point.x) / 2 - length / 2,
          top: (previousPoint.y + point.y) / 2 - 1.5,
          width: length,
          angle,
        };
      }),
    [plotPoints],
  );

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
                <Text style={styles.title}>Your stats</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>THIS WEEK</Text>
                <Text style={styles.summaryValue}>{totalMiles.toFixed(2)}</Text>
                <Text style={styles.summaryUnit}>MILES</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>DAILY AVERAGE</Text>
                <Text style={styles.summaryValue}>{averageMiles.toFixed(2)}</Text>
                <Text style={styles.summaryUnit}>MILES</Text>
              </View>
            </View>

            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.cardEyebrow}>DISTANCE TREND</Text>
                  <Text style={styles.cardTitle}>{distanceRange === "7d" ? "LAST 7 DAYS" : distanceRange === "month" ? "LAST MONTH" : distanceRange === "ytd" ? "YEAR TO DATE" : "LIFETIME"}</Text>
                </View>
                <Text style={styles.chartLegend}>MILES</Text>
              </View>

              <View style={styles.rangeRow}>
                {(["7d", "month", "ytd", "lifetime"] as DistanceRange[]).map((range) => (
                  <Pressable key={range} onPress={() => setDistanceRange(range)} style={[styles.rangeButton, distanceRange === range && styles.rangeButtonActive]}>
                    <Text style={[styles.rangeButtonText, distanceRange === range && styles.rangeButtonTextActive]}>{range === "7d" ? "7D" : range === "month" ? "1M" : range === "ytd" ? "YTD" : "ALL"}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.chartRow}>
                <View style={styles.yAxis}>
                  {[3, 2, 1, 0].map((step) => (
                    <Text key={step} style={styles.yAxisLabel}>
                      {(maxMiles * step / 3).toFixed(1)}
                    </Text>
                  ))}
                </View>
                <View style={[styles.chart, { width: chartWidth }]}>
                {[0, 1, 2, 3].map((line) => (
                  <View
                    key={line}
                    style={[styles.gridLine, { top: (line / 3) * (chartHeight - 28) + 14 }]}
                  />
                ))}
                {lineSegments.map((segment) => (
                  <View
                    key={segment.key}
                    style={[
                      styles.chartLine,
                      {
                        left: segment.left,
                        top: segment.top,
                        transform: [{ rotate: `${segment.angle}deg` }],
                        width: segment.width,
                      },
                    ]}
                  />
                ))}
                {plotPoints.map((point) => (
                  <Pressable accessibilityLabel={`${point.miles.toFixed(2)} miles`} key={point.dateKey} onPress={() => setSelectedPoint(point.dateKey)} style={[styles.chartPointButton, { left: point.x - 12, top: point.y - 12 }]}>
                    <View style={styles.chartPoint} />
                  </Pressable>
                ))}
                </View>
              </View>

              <View style={[styles.axisLabels, { width: chartWidth }]}>
                {weeklyDistance.map((point) => (
                  <Text key={point.dateKey} style={styles.axisLabel}>
                    {point.label}
                  </Text>
                ))}
              </View>
              {selectedPointData && (
                <Text style={styles.selectedPointText}>{selectedPointData.label}: {selectedPointData.miles.toFixed(2)} miles</Text>
              )}
            </View>

            <View style={styles.insightCard}>
              <Text style={styles.cardEyebrow}>KEEP MOVING</Text>
              <Text style={styles.insightText}>
                Every mile adds momentum. Your next level is waiting on the trail.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/past-workouts")}
              style={({ pressed }) => [styles.workoutsButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.workoutsButtonText}>VIEW PAST WORKOUTS →</Text>
            </Pressable>
          </ScrollView>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#07110e",
    flex: 1,
  },
  background: {
    flex: 1,
  },
  backgroundImage: {
    opacity: 0.55,
  },
  overlay: {
    backgroundColor: "rgba(5, 15, 12, 0.70)",
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 18,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 22,
  },
  backButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    marginRight: 12,
    width: 42,
  },
  backArrow: {
    color: "#eff8ed",
    fontSize: 30,
  },
  eyebrow: {
    color: "#c8e8a1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  title: {
    color: "#f5f7f3",
    fontFamily: "serif",
    fontSize: 32,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    backgroundColor: "rgba(235, 245, 239, 0.11)",
    borderColor: "rgba(235, 245, 239, 0.27)",
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    padding: 14,
  },
  summaryLabel: {
    color: "rgba(235, 245, 239, 0.65)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  summaryValue: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 10,
  },
  summaryUnit: {
    color: "#c8e8a1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  chartCard: {
    backgroundColor: "rgba(235, 245, 239, 0.11)",
    borderColor: "rgba(235, 245, 239, 0.27)",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  chartHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
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
    marginTop: 5,
  },
  chartLegend: {
    color: "#c8e8a1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  rangeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
  },
  rangeButton: {
    borderColor: "rgba(235, 245, 239, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 8,
  },
  rangeButtonActive: {
    backgroundColor: "rgba(200, 232, 161, 0.18)",
    borderColor: "rgba(200, 232, 161, 0.48)",
  },
  rangeButtonText: {
    color: "rgba(235, 245, 239, 0.58)",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  rangeButtonTextActive: {
    color: "#e1f2ca",
  },
  chart: {
    height: chartHeight,
    marginTop: 20,
    position: "relative",
  },
  chartRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    marginTop: 20,
  },
  yAxis: {
    height: chartHeight,
    justifyContent: "space-between",
    paddingBottom: 14,
    paddingTop: 14,
    width: 32,
  },
  yAxisLabel: {
    color: "rgba(235, 245, 239, 0.58)",
    fontSize: 9,
    textAlign: "right",
  },
  gridLine: {
    backgroundColor: "rgba(235, 245, 239, 0.14)",
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
  },
  chartLine: {
    backgroundColor: "#c8e8a1",
    height: 3,
    position: "absolute",
  },
  chartPoint: {
    backgroundColor: "#17231f",
    borderColor: "#e1f2ca",
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    width: 10,
  },
  chartPointButton: {
    alignItems: "center",
    position: "absolute",
    width: 24,
  },
  pointValue: {
    color: "#e1f2ca",
    fontSize: 8,
    fontWeight: "800",
    marginBottom: 3,
  },
  pointValueSelected: {
    color: "#ffffff",
    fontSize: 10,
  },
  selectedPointText: {
    color: "#e1f2ca",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 10,
    textAlign: "center",
  },
  axisLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginLeft: 32,
  },
  axisLabel: {
    color: "rgba(235, 245, 239, 0.58)",
    fontSize: 9,
    fontWeight: "800",
  },
  historyCard: {
    backgroundColor: "rgba(235, 245, 239, 0.11)",
    borderColor: "rgba(235, 245, 239, 0.27)",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  metricCell: {
    backgroundColor: "rgba(5, 15, 12, 0.24)",
    borderColor: "rgba(235, 245, 239, 0.12)",
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    padding: 10,
  },
  metricCellWide: {
    backgroundColor: "rgba(5, 15, 12, 0.24)",
    borderColor: "rgba(235, 245, 239, 0.12)",
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: "100%",
    padding: 10,
  },
  metricLabel: {
    color: "rgba(235, 245, 239, 0.58)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  metricValue: {
    color: "#e1f2ca",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 5,
  },
  emptyHistory: {
    color: "rgba(235, 245, 239, 0.62)",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  historyRow: {
    alignItems: "center",
    borderBottomColor: "rgba(235, 245, 239, 0.12)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 11,
  },
  historyDate: {
    color: "rgba(235, 245, 239, 0.68)",
    flex: 1,
    fontSize: 11,
  },
  historyDistance: {
    color: "#e1f2ca",
    fontSize: 12,
    fontWeight: "800",
  },
  historyTime: {
    color: "rgba(235, 245, 239, 0.58)",
    fontSize: 11,
    marginLeft: 14,
  },
  insightCard: {
    backgroundColor: "rgba(200, 232, 161, 0.13)",
    borderColor: "rgba(200, 232, 161, 0.28)",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  insightText: {
    color: "#e1f2ca",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  workoutsButton: {
    alignItems: "center",
    borderColor: "rgba(200, 232, 161, 0.28)",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    paddingVertical: 12,
  },
  workoutsButtonText: {
    color: "#c8e8a1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  buttonPressed: {
    opacity: 0.72,
  },
});
