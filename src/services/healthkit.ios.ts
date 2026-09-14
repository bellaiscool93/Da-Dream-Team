import AppleHealthKit, {
    HealthKitPermissions,
    HealthValueOptions,
} from "react-native-health";

const permissions: HealthKitPermissions = {
  permissions: {
    read: [AppleHealthKit.Constants.Permissions.Workout],
    write: [
      AppleHealthKit.Constants.Permissions.Workout,
      AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
    ],
  },
};

function callHealthKit<T>(
  callback: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) {
  return new Promise<T>((resolve, reject) => callback(resolve, reject));
}

export async function requestHealthPermissions() {
  await callHealthKit<void>((resolve, reject) => {
    AppleHealthKit.initHealthKit(permissions, (error) => {
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve();
    });
  });

  return true;
}

export async function saveWorkoutToHealth(
  distanceMeters: number,
  startDate: Date,
  endDate: Date,
) {
  const dateOptions = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  await callHealthKit<void>((resolve, reject) => {
    AppleHealthKit.saveWorkout(
      {
        ...dateOptions,
        type: AppleHealthKit.Constants.Activities.Running,
      },
      (error) => {
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve();
      },
    );
  });

  const distanceOptions: HealthValueOptions = {
    ...dateOptions,
    value: distanceMeters,
    unit: AppleHealthKit.Constants.Units.meter,
  };

  await callHealthKit<void>((resolve, reject) => {
    AppleHealthKit.saveWalkingRunningDistance(distanceOptions, (error) => {
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve();
    });
  });

  return true;
}