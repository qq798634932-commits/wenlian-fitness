import { Exercise, Workout, workouts } from "./workouts";

export type TrainingLevel = "beginner" | "intermediate" | "advanced";
export type TrainingGoal = "general" | "muscle" | "strength" | "fat-loss";
export type TrainingTarget = "chest" | "back" | "legs" | "shoulders" | "arms" | "core" | "full";
export type PainStatus = "none" | "mild" | "sharp";

export type TrainingProfile = {
  name: string;
  age: number;
  heightCm: number;
  weightKg: number;
  level: TrainingLevel;
  goal: TrainingGoal;
  weeklyDays: 3 | 4;
};

export type DailyCheckIn = {
  id: string;
  date: string;
  weightKg: number;
  sleepHours: number;
  energy: 1 | 2 | 3 | 4 | 5;
  soreness: 0 | 1 | 2;
  pain: PainStatus;
  target: TrainingTarget;
  durationMinutes: 30 | 45 | 60 | 75;
};

export type PersonalizedWorkout = Workout & {
  generatedAt: string;
  target: TrainingTarget;
  readiness: "恢复优先" | "正常训练" | "状态良好";
  effortGuide: string;
  analysis: string[];
};

export const targetLabels: Record<TrainingTarget, string> = {
  chest: "胸部",
  back: "背部",
  legs: "腿部",
  shoulders: "肩部",
  arms: "手臂",
  core: "核心",
  full: "全身",
};

export const levelLabels: Record<TrainingLevel, string> = {
  beginner: "新手",
  intermediate: "有一定基础",
  advanced: "训练经验丰富",
};

export const goalLabels: Record<TrainingGoal, string> = {
  general: "提升体能",
  muscle: "增肌",
  strength: "提升力量",
  "fat-loss": "减脂塑形",
};

const exerciseMap = new Map<string, Exercise>();
workouts.forEach((workout) => workout.exercises.forEach((exercise) => exerciseMap.set(exercise.id, exercise)));

const templates: Record<TrainingTarget, string[]> = {
  chest: ["0025", "0314", "0861", "0334", "0241", "0175"],
  back: ["2330", "0861", "0180", "0380", "0031", "0276"],
  legs: ["0043", "0085", "0739", "0586", "1372", "0276"],
  shoulders: ["0405", "0334", "0380", "0861", "0241", "3699"],
  arms: ["0031", "0241", "0314", "2330", "0334", "0276"],
  core: ["0276", "0872", "0175", "3699", "0630", "1685"],
  full: ["0043", "0025", "2330", "0085", "0405", "0276"],
};

const compoundIds = new Set(["0025", "0043", "0085", "0314", "0405", "0739", "2330"]);

function baseSetCount(level: TrainingLevel) {
  if (level === "advanced") return 4;
  if (level === "intermediate") return 3;
  return 2;
}

function repetitionGuide(goal: TrainingGoal, isCompound: boolean, original: string) {
  if (goal === "strength") return isCompound ? "4-6 次" : "8-12 次";
  if (goal === "muscle") return isCompound ? "6-10 次" : "10-15 次";
  if (goal === "fat-loss") return isCompound ? "8-12 次" : "12-15 次";
  return original;
}

export function calculateBmi(profile: Pick<TrainingProfile, "heightCm" | "weightKg">) {
  const heightMeters = profile.heightCm / 100;
  if (!heightMeters || !profile.weightKg) return null;
  return profile.weightKg / (heightMeters * heightMeters);
}

export function createPersonalizedWorkout(
  profile: TrainingProfile,
  checkIn: DailyCheckIn,
): PersonalizedWorkout {
  const lowReadiness = checkIn.energy <= 2 || checkIn.sleepHours < 6 || checkIn.soreness === 2;
  const highReadiness = checkIn.energy >= 4 && checkIn.sleepHours >= 7 && checkIn.soreness === 0;
  const readiness = lowReadiness ? "恢复优先" : highReadiness ? "状态良好" : "正常训练";
  const exerciseLimit = Math.max(
    3,
    Math.min(
      checkIn.durationMinutes <= 30 ? 4 : checkIn.durationMinutes <= 45 ? 5 : 6,
      profile.level === "beginner" ? 5 : 6,
    ),
  );
  const normalSets = baseSetCount(profile.level);
  const setReduction = lowReadiness ? 1 : 0;
  const effortGuide = lowReadiness ? "RPE 6-7，至少保留 3 次余力" : "RPE 7-8，保留 2-3 次余力";
  const selectedIds = templates[checkIn.target].slice(0, exerciseLimit);
  if (profile.goal === "fat-loss" && checkIn.target !== "core" && exerciseLimit >= 5) {
    selectedIds[selectedIds.length - 1] = "0630";
  }

  const exercises = selectedIds
    .map((id, index) => {
      const source = exerciseMap.get(id);
      if (!source) return null;
      const mainMovement = index < 2 || compoundIds.has(id);
      const sets = Math.max(1, normalSets - setReduction - (mainMovement ? 0 : 1));
      return {
        ...source,
        sets,
        reps: repetitionGuide(profile.goal, mainMovement, source.reps),
        tip: `${source.tip} 本次按 ${effortGuide} 控制强度。`,
      };
    })
    .filter((exercise): exercise is Exercise => Boolean(exercise));

  const analysis = [
    `${profile.level === "beginner" ? "新手起始量" : "按当前训练经验"}安排 ${exercises.length} 个动作，共约 ${exercises.reduce((sum, exercise) => sum + exercise.sets, 0)} 组。`,
    lowReadiness
      ? "睡眠、精力或酸痛提示恢复不足，本次已减少训练量并降低强度。"
      : "今日恢复状态允许完成常规训练量，仍不建议做到力竭。",
    `身高 ${profile.heightCm} cm 用于提醒器械座椅和活动范围调整，不用于推算重量。`,
    `体重 ${checkIn.weightKg} kg 已写入身体记录，负重请以动作稳定和余力为准。`,
  ];

  return {
    id: `personal-${checkIn.id}`,
    shortName: "今日方案",
    title: `${targetLabels[checkIn.target]}训练`,
    focus: `${targetLabels[checkIn.target]}为主，兼顾拮抗肌和核心稳定`,
    schedule: "今日生成",
    duration: `${checkIn.durationMinutes} 分钟`,
    exercises,
    generatedAt: new Date().toISOString(),
    target: checkIn.target,
    readiness,
    effortGuide,
    analysis,
  };
}
