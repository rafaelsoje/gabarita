export function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type ComputeCurrentStreakDaysParams = {
  dayKeys: Set<string>;
  today?: Date;
  maxWindowDays?: number;
};

export function computeCurrentStreakDays(params: ComputeCurrentStreakDaysParams) {
  const today = params.today ?? new Date();
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const window = Math.max(1, params.maxWindowDays ?? 400);

  if (!params.dayKeys.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!params.dayKeys.has(localDayKey(cursor))) return 0;
  }

  let streak = 0;
  for (let offset = 0; offset < window; offset += 1) {
    if (!params.dayKeys.has(localDayKey(cursor))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
