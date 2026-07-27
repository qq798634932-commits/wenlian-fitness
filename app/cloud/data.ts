import type { SupabaseClient } from "@supabase/supabase-js";
import type { MusicConnections, WorkoutRecord } from "../FitnessApp";
import type { DailyCheckIn, PersonalizedWorkout, TrainingProfile } from "../training-planner";

export type CloudSnapshot = {
  trainingProfile: TrainingProfile | null;
  bodyLogs: DailyCheckIn[];
  personalWorkout: PersonalizedWorkout | null;
  records: WorkoutRecord[];
  connections: MusicConnections;
};

export function hasCloudData(snapshot: CloudSnapshot) {
  return Boolean(
    snapshot.trainingProfile ||
    snapshot.bodyLogs.length ||
    snapshot.personalWorkout ||
    snapshot.records.length ||
    snapshot.connections.netease ||
    snapshot.connections.qq,
  );
}

export async function loadCloudSnapshot(client: SupabaseClient, userId: string): Promise<CloudSnapshot> {
  const [profileResult, logsResult, plansResult, recordsResult, musicResult] = await Promise.all([
    client.from("training_profiles").select("*").eq("user_id", userId).maybeSingle(),
    client.from("body_logs").select("*").eq("user_id", userId).order("log_date", { ascending: false }).limit(120),
    client.from("training_plans").select("payload").eq("user_id", userId).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("workout_records").select("payload").eq("user_id", userId).order("finished_at", { ascending: false }).limit(500),
    client.from("music_links").select("provider,title,url,external_id").eq("user_id", userId),
  ]);

  const firstError = [profileResult, logsResult, plansResult, recordsResult, musicResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const profile = profileResult.data;
  const trainingProfile = profile ? {
    name: profile.name,
    age: Number(profile.age),
    heightCm: Number(profile.height_cm),
    weightKg: Number(profile.weight_kg),
    level: profile.level,
    goal: profile.goal,
    weeklyDays: Number(profile.weekly_days),
  } as TrainingProfile : null;

  const bodyLogs = (logsResult.data ?? []).map((log) => ({
    id: log.id,
    date: log.log_date,
    weightKg: Number(log.weight_kg),
    sleepHours: Number(log.sleep_hours),
    energy: Number(log.energy),
    soreness: Number(log.soreness),
    pain: log.pain,
    target: log.target,
    durationMinutes: Number(log.duration_minutes),
  })) as DailyCheckIn[];

  const connections: MusicConnections = {};
  for (const link of musicResult.data ?? []) {
    if (link.provider === "netease" && link.external_id) {
      connections.netease = { playlistId: link.external_id, title: link.title };
    }
    if (link.provider === "qq" && link.url) {
      connections.qq = { url: link.url, title: link.title };
    }
  }

  return {
    trainingProfile,
    bodyLogs,
    personalWorkout: (plansResult.data?.payload as PersonalizedWorkout | undefined) ?? null,
    records: (recordsResult.data ?? []).map((row) => row.payload as WorkoutRecord),
    connections,
  };
}

export async function saveCloudProfile(client: SupabaseClient, userId: string, profile: TrainingProfile) {
  const { error } = await client.from("training_profiles").upsert({
    user_id: userId,
    name: profile.name,
    age: profile.age,
    height_cm: profile.heightCm,
    weight_kg: profile.weightKg,
    level: profile.level,
    goal: profile.goal,
    weekly_days: profile.weeklyDays,
  });
  if (error) throw error;
}

export async function saveCloudCheckInAndPlan(
  client: SupabaseClient,
  userId: string,
  profile: TrainingProfile,
  checkIn: DailyCheckIn,
  workout: PersonalizedWorkout,
) {
  const [profileResult, logResult, planResult] = await Promise.all([
    client.from("training_profiles").upsert({
      user_id: userId,
      name: profile.name,
      age: profile.age,
      height_cm: profile.heightCm,
      weight_kg: profile.weightKg,
      level: profile.level,
      goal: profile.goal,
      weekly_days: profile.weeklyDays,
    }),
    client.from("body_logs").upsert({
      user_id: userId,
      id: checkIn.id,
      log_date: checkIn.date,
      weight_kg: checkIn.weightKg,
      sleep_hours: checkIn.sleepHours,
      energy: checkIn.energy,
      soreness: checkIn.soreness,
      pain: checkIn.pain,
      target: checkIn.target,
      duration_minutes: checkIn.durationMinutes,
    }),
    client.from("training_plans").upsert({
      user_id: userId,
      id: workout.id,
      title: workout.title,
      target: workout.target,
      generated_at: workout.generatedAt,
      payload: workout,
    }),
  ]);
  const error = profileResult.error ?? logResult.error ?? planResult.error;
  if (error) throw error;
}

async function saveCloudBodyLog(client: SupabaseClient, userId: string, checkIn: DailyCheckIn) {
  const { error } = await client.from("body_logs").upsert({
    user_id: userId,
    id: checkIn.id,
    log_date: checkIn.date,
    weight_kg: checkIn.weightKg,
    sleep_hours: checkIn.sleepHours,
    energy: checkIn.energy,
    soreness: checkIn.soreness,
    pain: checkIn.pain,
    target: checkIn.target,
    duration_minutes: checkIn.durationMinutes,
  });
  if (error) throw error;
}

async function saveCloudPlan(client: SupabaseClient, userId: string, workout: PersonalizedWorkout) {
  const { error } = await client.from("training_plans").upsert({
    user_id: userId,
    id: workout.id,
    title: workout.title,
    target: workout.target,
    generated_at: workout.generatedAt,
    payload: workout,
  });
  if (error) throw error;
}

export async function saveCloudRecord(client: SupabaseClient, userId: string, record: WorkoutRecord) {
  const { error } = await client.from("workout_records").upsert({
    user_id: userId,
    id: record.id,
    workout_id: record.workoutId,
    title: record.title,
    finished_at: record.finishedAt,
    payload: record,
  });
  if (error) throw error;
}

export async function saveCloudConnections(client: SupabaseClient, userId: string, connections: MusicConnections) {
  const rows = [];
  if (connections.netease) {
    rows.push({
      user_id: userId,
      provider: "netease",
      title: connections.netease.title,
      external_id: connections.netease.playlistId,
      url: null,
    });
  }
  if (connections.qq) {
    rows.push({
      user_id: userId,
      provider: "qq",
      title: connections.qq.title,
      external_id: null,
      url: connections.qq.url,
    });
  }
  if (!connections.netease) {
    const { error } = await client.from("music_links").delete().eq("user_id", userId).eq("provider", "netease");
    if (error) throw error;
  }
  if (!connections.qq) {
    const { error } = await client.from("music_links").delete().eq("user_id", userId).eq("provider", "qq");
    if (error) throw error;
  }
  if (rows.length) {
    const { error } = await client.from("music_links").upsert(rows, { onConflict: "user_id,provider" });
    if (error) throw error;
  }
}

export async function importLocalSnapshot(
  client: SupabaseClient,
  userId: string,
  snapshot: CloudSnapshot,
) {
  const jobs: Promise<unknown>[] = [];
  if (snapshot.trainingProfile) jobs.push(saveCloudProfile(client, userId, snapshot.trainingProfile));
  if (snapshot.connections.netease || snapshot.connections.qq) {
    jobs.push(saveCloudConnections(client, userId, snapshot.connections));
  }
  for (const log of snapshot.bodyLogs) jobs.push(saveCloudBodyLog(client, userId, log));
  if (snapshot.personalWorkout) jobs.push(saveCloudPlan(client, userId, snapshot.personalWorkout));
  for (const record of snapshot.records) jobs.push(saveCloudRecord(client, userId, record));
  await Promise.all(jobs);
}
