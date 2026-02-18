const BASE_INTERVALS_DAYS = [1, 3, 7, 15, 30, 60] as const;

type ReviewScheduleInput = {
  studiedAt: Date;
  accuracyPercent: number;
  previousReviews?: number;
};

export function clampAccuracy(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getNextReviewDate(input: ReviewScheduleInput) {
  const reviews = Math.max(0, Math.floor(input.previousReviews ?? 0));
  const stage = Math.min(reviews, BASE_INTERVALS_DAYS.length - 1);
  const baseDays = BASE_INTERVALS_DAYS[stage];
  const accuracy = clampAccuracy(input.accuracyPercent);

  let multiplier = 1;
  if (accuracy >= 90) multiplier = 1.2;
  else if (accuracy < 70) multiplier = 0.7;

  const intervalDays = Math.max(1, Math.round(baseDays * multiplier));
  const next = new Date(input.studiedAt);
  next.setDate(next.getDate() + intervalDays);

  return {
    intervalDays,
    nextReviewAt: next
  };
}
