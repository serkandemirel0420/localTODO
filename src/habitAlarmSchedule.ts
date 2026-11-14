export const isHabitQuietHour = (hour: number) => hour >= 0 && hour < 7;

export const getHabitAnchorClock = (createdAt: number, quietHoursEnabled: boolean) => {
  const anchor = new Date(createdAt);
  return quietHoursEnabled && isHabitQuietHour(anchor.getHours())
    ? { hour: 7, minute: 0 }
    : { hour: anchor.getHours(), minute: anchor.getMinutes() };
};

export const shouldSuppressHabitNotification = (
  identifier: string,
  settings: { habitNotificationsPaused: boolean; habitQuietHoursEnabled: boolean },
  hour: number,
) => identifier.startsWith('local-todo:todo-alarm:') && identifier.includes(':habit:') && (
  settings.habitNotificationsPaused || (settings.habitQuietHoursEnabled && isHabitQuietHour(hour))
);

export const getClockAlignedHabitHours = (
  intervalHours: number,
  quietHoursEnabled: boolean,
  quietHoursStart: number,
  quietHoursEnd: number,
): number[] => {
  if (!Number.isInteger(intervalHours) || intervalHours < 1) {
    return [];
  }

  return Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => {
    if (
      quietHoursEnabled &&
      hour >= quietHoursStart &&
      hour < quietHoursEnd
    ) {
      return false;
    }

    return hour % intervalHours === 0;
  });
};
