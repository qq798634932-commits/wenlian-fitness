"use client";

import {
  ArrowRight,
  ArrowSquareOut,
  Barbell,
  CalendarDots,
  CaretLeft,
  ChartBar,
  CheckCircle,
  DownloadSimple,
  Headphones,
  House,
  ListChecks,
  Minus,
  MusicNotes,
  Notebook,
  Pause,
  Play,
  Plus,
  ShareNetwork,
  SkipForward,
  Timer,
  Trash,
  UploadSimple,
  UserCircle,
  Warning,
  X,
} from "@phosphor-icons/react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  MusicPlatform,
  neteasePlaylistUrl,
  normalizeQQMusicUrl,
  parseNeteasePlaylistId,
} from "./music-links";
import type { CloudSession } from "./cloud/client";
import {
  CloudSnapshot,
  hasCloudData,
  importLocalSnapshot,
  loadCloudSnapshot,
  saveCloudCheckInAndPlan,
  saveCloudConnections,
  saveCloudProfile,
  saveCloudRecord,
} from "./cloud/data";
import {
  listStoredAudioTracks,
  removeStoredAudioTrack,
  saveAudioFiles,
  StoredAudioTrack,
} from "./music-storage";
import PersonalPlanner from "./PersonalPlanner";
import {
  createPersonalizedWorkout,
  DailyCheckIn,
  PersonalizedWorkout,
  targetLabels,
  TrainingProfile,
} from "./training-planner";
import { Exercise, Workout, workouts } from "./workouts";

type Tab = "today" | "plan" | "music" | "records";

type MusicSource = "all" | MusicPlatform;

type MusicPlaylist = {
  id: MusicPlatform;
  platform: string;
  title: string;
  description: string;
  trackCount: string;
  firstTrack: string;
  artist: string;
  capability: string;
  actionLabel: string;
};

export type MusicConnections = {
  netease?: { playlistId: string; title: string };
  qq?: { url: string; title: string };
};

type ExerciseEntry = {
  completedSets: number;
  weight: string;
  reps: string;
  rpe: string;
};

export type WorkoutRecord = {
  id: string;
  workoutId: string;
  title: string;
  shortName: string;
  focus: string;
  optional: boolean;
  date: string;
  finishedAt: string;
  durationMinutes: number;
  note: string;
  entries: Record<string, ExerciseEntry>;
  exercises?: Exercise[];
};

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STORAGE_KEY = "wenlian-records-v1";
const MUSIC_CONNECTIONS_KEY = "wenlian-music-connections-v1";
const PROFILE_KEY = "wenlian-training-profile-v1";
const BODY_LOGS_KEY = "wenlian-body-logs-v1";
const PERSONAL_WORKOUT_KEY = "wenlian-personal-workout-v1";
const BACKUP_VERSION = 2;

type StorageKeys = {
  records: string;
  connections: string;
  profile: string;
  bodyLogs: string;
  personalWorkout: string;
  dirty: string;
};

function parseStoredValue<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function readStoredSnapshot(keys: StorageKeys): CloudSnapshot {
  return {
    records: parseStoredValue<WorkoutRecord[]>(keys.records, []),
    connections: parseStoredValue<MusicConnections>(keys.connections, {}),
    trainingProfile: parseStoredValue<TrainingProfile | null>(keys.profile, null),
    bodyLogs: parseStoredValue<DailyCheckIn[]>(keys.bodyLogs, []),
    personalWorkout: parseStoredValue<PersonalizedWorkout | null>(keys.personalWorkout, null),
  };
}

function legacyStorageKeys(): StorageKeys {
  return {
    records: STORAGE_KEY,
    connections: MUSIC_CONNECTIONS_KEY,
    profile: PROFILE_KEY,
    bodyLogs: BODY_LOGS_KEY,
    personalWorkout: PERSONAL_WORKOUT_KEY,
    dirty: "wenlian-cloud-dirty-v1",
  };
}

function createMusicPlaylists(
  connections: MusicConnections,
  localTracks: StoredAudioTrack[],
  activeTrack: StoredAudioTrack | null,
): MusicPlaylist[] {
  return [
    {
      id: "netease",
      platform: "网易云音乐",
      title: connections.netease?.title || "连接训练歌单",
      description: connections.netease
        ? "歌单链接已保存，训练时从网易云官方页面打开。"
        : "粘贴网易云歌单链接或数字 ID，保存到私人档案。",
      trackCount: connections.netease ? "已连接" : "等待添加",
      firstTrack: connections.netease?.title || "网易云官方播放器",
      artist: "网易云音乐",
      capability: "官方页面播放",
      actionLabel: connections.netease ? "打开播放器" : "连接歌单",
    },
    {
      id: "qq",
      platform: "QQ 音乐",
      title: connections.qq?.title || "连接训练歌单",
      description: connections.qq
        ? "通过 QQ 音乐官方页面或 App 播放，不读取账号 Cookie。"
        : "粘贴 QQ 音乐歌单分享链接，训练时从官方页面打开。",
      trackCount: connections.qq ? "已连接" : "等待添加",
      firstTrack: connections.qq?.title || "QQ 音乐官方歌单",
      artist: "QQ 音乐",
      capability: "官方跳转",
      actionLabel: connections.qq ? "用 QQ 音乐打开" : "连接歌单",
    },
    {
      id: "local",
      platform: "本地音频",
      title: "离线训练音乐",
      description: "从 iPhone 文件或 Obsidian 导出音频，只保存在当前设备。",
      trackCount: localTracks.length ? `${localTracks.length} 首已保存` : "还没有音频",
      firstTrack: activeTrack?.name || localTracks[0]?.name || "选择本地音频",
      artist: "本机离线音乐",
      capability: "离线播放",
      actionLabel: localTracks.length ? "查看音频" : "导入音频",
    },
  ];
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function currentWeekKeys() {
  const start = startOfWeek();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    start: localDateKey(start),
    end: localDateKey(end),
    label: `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`,
  };
}

function longDate() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${pad(minutes)}:${pad(rest)}`;
}

function createEntries(workout: Workout) {
  return Object.fromEntries(
    workout.exercises.map((exercise) => [
      exercise.id,
      { completedSets: 0, weight: "", reps: "", rpe: "" },
    ]),
  );
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function entriesToMarkdown(
  records: WorkoutRecord[],
  profile: TrainingProfile | null,
  bodyLogs: DailyCheckIn[],
) {
  const sorted = [...records].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const lines = [
    "---",
    "type: workout-log-export",
    `exported: ${localDateKey()}`,
    "tags:",
    '  - "健身/训练记录"',
    "---",
    "",
    "# 稳练训练记录",
    "",
    "> 来自 iPhone 稳练应用。可直接保存到 Obsidian 训练记录目录。",
    "",
  ];

  if (profile) {
    lines.push(
      "## 个人训练档案",
      "",
      `- 称呼：${profile.name}`,
      `- 年龄：${profile.age}`,
      `- 身高：${profile.heightCm} cm`,
      `- 当前体重：${profile.weightKg} kg`,
      `- 每周训练：${profile.weeklyDays} 天`,
      "",
    );
  }

  if (bodyLogs.length) {
    lines.push(
      "## 最近身体状态",
      "",
      "| 日期 | 体重 | 睡眠 | 精力 | 训练部位 |",
      "|---|---:|---:|---:|---|",
      ...bodyLogs.slice(0, 12).map((item) =>
        `| ${item.date} | ${item.weightKg} kg | ${item.sleepHours} h | ${item.energy}/5 | ${targetLabels[item.target]} |`,
      ),
      "",
    );
  }

  if (sorted.length === 0) {
    lines.push("暂无已完成训练。");
  }

  sorted.forEach((record) => {
    const workout = workouts.find((item) => item.id === record.workoutId);
    const recordExercises = record.exercises ?? workout?.exercises ?? [];
    lines.push(
      `## ${record.date} ${record.shortName}：${record.title}`,
      "",
      `- 主练：${record.focus}`,
      `- 用时：${record.durationMinutes} 分钟`,
      record.note ? `- 总结：${record.note}` : "- 总结：未填写",
      "",
      "| 动作 | 完成组数 | 重量 | 实际次数 | RPE |",
      "|---|---:|---:|---:|---:|",
    );
    recordExercises.forEach((exercise) => {
      const entry = record.entries[exercise.id];
      if (!entry) return;
      lines.push(
        `| ${exercise.name} | ${entry.completedSets}/${exercise.sets} | ${entry.weight || "-"} | ${entry.reps || "-"} | ${entry.rpe || "-"} |`,
      );
    });
    lines.push("");
  });

  return lines.join("\n");
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className="icon-button" type="button" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function ProgressRing({ value, total }: { value: number; total: number }) {
  const progress = Math.min(value / total, 1);
  return (
    <div
      className="progress-ring"
      style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}
      aria-label={`本周已完成 ${value} 次，共 ${total} 次`}
    >
      <div>
        <strong>{value}</strong>
        <span>/ {total}</span>
      </div>
    </div>
  );
}

function ExerciseThumb({ exercise, priority = false }: { exercise: Exercise; priority?: boolean }) {
  if (!exercise.gif) {
    return (
      <div className="exercise-placeholder" aria-label="低强度有氧">
        <Timer size={34} weight="duotone" />
        <span>20-30 分钟</span>
      </div>
    );
  }
  return (
    <img
      className="exercise-gif"
      src={exercise.gif}
      alt={`${exercise.name}动作演示`}
      width={360}
      height={360}
      loading={priority ? "eager" : "lazy"}
    />
  );
}

function WorkoutSession({
  workout,
  onExit,
  onFinish,
}: {
  workout: Workout;
  onExit: () => void;
  onFinish: (entries: Record<string, ExerciseEntry>, note: string, seconds: number) => void;
}) {
  const [entries, setEntries] = useState<Record<string, ExerciseEntry>>(() =>
    createEntries(workout),
  );
  const [note, setNote] = useState("");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const completed = workout.exercises.filter(
    (exercise) => entries[exercise.id].completedSets >= exercise.sets,
  ).length;

  function updateEntry(id: string, patch: Partial<ExerciseEntry>) {
    setEntries((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  function finish() {
    const totalSets = Object.values(entries).reduce(
      (sum, entry) => sum + entry.completedSets,
      0,
    );
    if (totalSets === 0 && !window.confirm("还没有记录完成组数，仍要结束训练吗？")) return;
    onFinish(entries, note, seconds);
  }

  return (
    <main className="session-shell">
      <header className="session-header">
        <IconButton label="退出本次训练" onClick={onExit}>
          <CaretLeft size={23} />
        </IconButton>
        <div>
          <span>{workout.shortName}</span>
          <h1>{workout.title}</h1>
        </div>
        <div className="session-timer" aria-label={`已训练 ${formatDuration(seconds)}`}>
          <Timer size={18} />
          {formatDuration(seconds)}
        </div>
      </header>

      <div className="session-progress">
        <span>动作进度</span>
        <strong>
          {completed}/{workout.exercises.length}
        </strong>
      </div>

      <section className="exercise-session-list" aria-label="训练动作">
        {workout.exercises.map((exercise, index) => {
          const entry = entries[exercise.id];
          const isDone = entry.completedSets >= exercise.sets;
          return (
            <article className={`session-exercise ${isDone ? "is-done" : ""}`} key={exercise.id}>
              <div className="exercise-media">
                <ExerciseThumb exercise={exercise} priority={index === 0} />
                <span className="exercise-index">{pad(index + 1)}</span>
              </div>
              <div className="exercise-copy">
                <div>
                  <p>{exercise.body}</p>
                  <h2>{exercise.name}</h2>
                  <span className="target">
                    {exercise.sets} 组 × {exercise.reps}
                  </span>
                </div>
                <p className="tip">{exercise.tip}</p>
              </div>

              <div className="set-stepper">
                <span>完成组数</span>
                <div>
                  <IconButton
                    label={`${exercise.name}减少一组`}
                    onClick={() =>
                      updateEntry(exercise.id, {
                        completedSets: Math.max(0, entry.completedSets - 1),
                      })
                    }
                  >
                    <Minus size={20} weight="bold" />
                  </IconButton>
                  <strong>
                    {entry.completedSets}
                    <small>/ {exercise.sets}</small>
                  </strong>
                  <IconButton
                    label={`${exercise.name}增加一组`}
                    onClick={() =>
                      updateEntry(exercise.id, {
                        completedSets: Math.min(exercise.sets, entry.completedSets + 1),
                      })
                    }
                  >
                    <Plus size={20} weight="bold" />
                  </IconButton>
                </div>
              </div>

              <div className="entry-grid">
                <label>
                  重量 kg
                  <input
                    inputMode="decimal"
                    value={entry.weight}
                    onChange={(event) => updateEntry(exercise.id, { weight: event.target.value })}
                    placeholder={exercise.id === "cardio" ? "可不填" : "例如 40"}
                  />
                </label>
                <label>
                  实际次数
                  <input
                    inputMode="numeric"
                    value={entry.reps}
                    onChange={(event) => updateEntry(exercise.id, { reps: event.target.value })}
                    placeholder={exercise.isTimed ? "例如 30秒" : "例如 10"}
                  />
                </label>
                <label>
                  RPE
                  <select
                    value={entry.rpe}
                    onChange={(event) => updateEntry(exercise.id, { rpe: event.target.value })}
                  >
                    <option value="">未填</option>
                    <option value="6">6 轻松</option>
                    <option value="7">7 适中</option>
                    <option value="8">8 较难</option>
                    <option value="9">9 很难</option>
                    <option value="10">10 极限</option>
                  </select>
                </label>
              </div>
            </article>
          );
        })}
      </section>

      <section className="session-note">
        <label htmlFor="session-note">今天的感受</label>
        <textarea
          id="session-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="恢复、疼痛、动作感受，或下次只改的一件事"
          rows={3}
        />
      </section>

      <div className="finish-bar">
        <button className="primary-button" type="button" onClick={finish}>
          <CheckCircle size={22} weight="fill" />
          完成本次训练
        </button>
      </div>
    </main>
  );
}

function TodayView({
  weekRecords,
  nextWorkout,
  onStart,
  onOpenPlan,
  onInstall,
  weeklyGoal,
}: {
  weekRecords: WorkoutRecord[];
  nextWorkout: Workout;
  onStart: (workout: Workout) => void;
  onOpenPlan: () => void;
  onInstall: () => void;
  weeklyGoal: 3 | 4;
}) {
  const coreCount = Math.min(weeklyGoal, new Set(
    weekRecords.filter((record) => !record.optional).map((record) => record.workoutId),
  ).size);
  const optionalDone = weekRecords.some((record) => record.optional);
  const week = currentWeekKeys();

  return (
    <>
      <header className="topbar">
        <div>
          <span>{longDate()}</span>
          <h1>稳练</h1>
        </div>
        <button className="install-button" type="button" onClick={onInstall}>
          <DownloadSimple size={18} />
          添加到主屏
        </button>
      </header>

      <section className="week-overview">
        <div>
          <span>本周训练</span>
          <h2>{coreCount === weeklyGoal ? `本周 ${weeklyGoal} 次训练已完成` : "保持节奏，继续下一练"}</h2>
          <p>{week.label}</p>
        </div>
        <ProgressRing value={coreCount} total={weeklyGoal} />
      </section>

      <section className="next-workout">
        <div className="workout-hero-copy">
          <div className="day-label">{nextWorkout.shortName}</div>
          <h2>{nextWorkout.title}</h2>
          <p>{nextWorkout.focus}</p>
          <div className="workout-meta">
            <span>
              <CalendarDots size={18} />
              {nextWorkout.schedule}
            </span>
            <span>
              <Timer size={18} />
              {nextWorkout.duration}
            </span>
          </div>
        </div>
        <div className="hero-motion">
          <ExerciseThumb exercise={nextWorkout.exercises[0]} priority />
        </div>
        <button className="primary-button" type="button" onClick={() => onStart(nextWorkout)}>
          开始训练
          <ArrowRight size={21} weight="bold" />
        </button>
      </section>

      <section className="today-plan">
        <div className="section-heading">
          <div>
            <h2>本周路线</h2>
            <p>每周目标 {weeklyGoal} 次，根据恢复情况安排间隔。</p>
          </div>
          <button type="button" onClick={onOpenPlan}>
            查看计划
          </button>
        </div>
        <div className="route-list">
          {workouts.map((workout) => {
            const done = weekRecords.some((record) => record.workoutId === workout.id);
            return (
              <div className="route-row" key={workout.id}>
                <div className={`route-status ${done ? "done" : ""}`}>
                  {done ? <CheckCircle size={22} weight="fill" /> : <span />}
                </div>
                <div>
                  <strong>{workout.shortName}</strong>
                  <span>{workout.title}</span>
                </div>
                <small>
                  {done ? "已完成" : workout.optional ? (optionalDone ? "已完成" : "可选") : workout.schedule}
                </small>
              </div>
            );
          })}
        </div>
      </section>

      <aside className="safety-note">
        <Warning size={22} weight="duotone" />
        <p>如果出现锐痛、麻木或关节不适，立即停止该动作。新动作先用轻重量。</p>
      </aside>
    </>
  );
}

function RecordsView({
  records,
  onExportMarkdown,
  onExportJson,
  onImport,
}: {
  records: WorkoutRecord[];
  onExportMarkdown: () => void;
  onExportJson: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const totalMinutes = records.reduce((sum, record) => sum + record.durationMinutes, 0);
  const recent = [...records].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const lastFour = recent.slice(0, 4);
  const avgRpeValues = records.flatMap((record) =>
    Object.values(record.entries)
      .map((entry) => Number(entry.rpe))
      .filter(Boolean),
  );
  const avgRpe =
    avgRpeValues.length > 0
      ? (avgRpeValues.reduce((sum, value) => sum + value, 0) / avgRpeValues.length).toFixed(1)
      : "-";

  return (
    <>
      <header className="page-heading record-heading">
        <span>训练记录</span>
        <h1>看见稳定积累</h1>
        <p>数据保存在这台设备。定期导出到 Obsidian 或下载备份。</p>
      </header>

      <section className="stat-grid" aria-label="训练统计">
        <div>
          <span>已训练</span>
          <strong>{records.length}</strong>
          <small>次</small>
        </div>
        <div>
          <span>总用时</span>
          <strong>{totalMinutes}</strong>
          <small>分钟</small>
        </div>
        <div>
          <span>平均 RPE</span>
          <strong>{avgRpe}</strong>
          <small>强度</small>
        </div>
      </section>

      <section className="export-panel">
        <div>
          <h2>备份与 Obsidian</h2>
          <p>Markdown 可直接分享给 Obsidian，JSON 用于恢复应用数据。</p>
        </div>
        <div className="export-actions">
          <button className="primary-button" type="button" onClick={onExportMarkdown}>
            <ShareNetwork size={20} />
            导出 Obsidian
          </button>
          <button className="secondary-button" type="button" onClick={onExportJson}>
            <DownloadSimple size={20} />
            下载备份
          </button>
          <label className="secondary-button file-button">
            <UploadSimple size={20} />
            恢复备份
            <input type="file" accept="application/json,.json" onChange={onImport} />
          </label>
        </div>
      </section>

      <section className="history-section">
        <div className="section-heading">
          <div>
            <h2>最近训练</h2>
            <p>最近四次完成记录。</p>
          </div>
        </div>
        {lastFour.length === 0 ? (
          <div className="empty-state">
            <ListChecks size={42} weight="duotone" />
            <h3>还没有训练记录</h3>
            <p>完成第一组训练后，重量、次数和 RPE 会出现在这里。</p>
          </div>
        ) : (
          <div className="history-list">
            {lastFour.map((record) => {
              const sets = Object.values(record.entries).reduce(
                (sum, entry) => sum + entry.completedSets,
                0,
              );
              return (
                <article key={record.id}>
                  <div className="history-date">
                    <strong>{record.date.slice(8)}</strong>
                    <span>{record.date.slice(5, 7)}月</span>
                  </div>
                  <div>
                    <span>{record.shortName}</span>
                    <h3>{record.title}</h3>
                    <p>
                      {sets} 组，{record.durationMinutes} 分钟
                    </p>
                  </div>
                  <CheckCircle size={25} weight="fill" />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function MusicCover({ source, compact = false }: { source: MusicPlatform; compact?: boolean }) {
  return (
    <div
      className={`music-cover ${compact ? "is-compact" : ""}`}
      data-source={source}
      role="img"
      aria-label={`${source} 音乐来源图标`}
    >
      <MusicNotes size={compact ? 20 : 34} weight="fill" />
    </div>
  );
}

function MusicView({
  playlists,
  currentPlaylistId,
  connections,
  localTracks,
  activeTrack,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSelectPlaylist,
  onAddPlaylist,
  onSelectTrack,
  onSeek,
  onPrevious,
  onNext,
  onRemoveTrack,
  linksOnly,
}: {
  playlists: MusicPlaylist[];
  currentPlaylistId: MusicPlatform;
  connections: MusicConnections;
  localTracks: StoredAudioTrack[];
  activeTrack: StoredAudioTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => Promise<void>;
  onSelectPlaylist: (playlist: MusicPlaylist) => void;
  onAddPlaylist: (source?: MusicPlatform) => void;
  onSelectTrack: (track: StoredAudioTrack) => void;
  onSeek: (seconds: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onRemoveTrack: (track: StoredAudioTrack) => void;
  linksOnly: boolean;
}) {
  const [source, setSource] = useState<MusicSource>("all");
  const current =
    playlists.find((playlist) => playlist.id === currentPlaylistId) ?? playlists[0];
  const visiblePlaylists =
    source === "all"
      ? playlists
      : playlists.filter((playlist) => playlist.id === source);
  const progressMaximum = duration > 0 ? duration : 1;

  return (
    <>
      <header className="page-heading music-heading">
        <span>训练音乐</span>
        <h1>让节奏跟上动作</h1>
        <p>{linksOnly ? "保存常用歌单，训练时跳转到网易云或 QQ 音乐。" : "连接常用歌单，或导入自己的音频。训练记录与音乐都留在手机上。"}</p>
      </header>

      <section className="music-player-panel" aria-label="正在播放">
        <div className="now-playing-copy">
          <MusicCover source={current.id} />
          <div>
            <span>{current.platform}</span>
            <h2>{current.id === "local" ? activeTrack?.name || current.firstTrack : current.title}</h2>
            <p>
              {current.id === "local" && !activeTrack
                ? "导入音频后可离线播放"
                : current.artist}
            </p>
          </div>
        </div>
        {current.id === "local" && !linksOnly ? (
          <>
            <input
              className="music-progress"
              type="range"
              min="0"
              max={progressMaximum}
              step="0.1"
              value={Math.min(currentTime, progressMaximum)}
              onChange={(event) => onSeek(Number(event.target.value))}
              aria-label="本地音频播放进度"
              disabled={!activeTrack}
              style={{ "--music-progress": `${(currentTime / progressMaximum) * 100}%` } as React.CSSProperties}
            />
            <div className="player-controls">
              <span>{formatDuration(Math.floor(currentTime))}</span>
              <div>
                <button type="button" aria-label="播放上一首" onClick={onPrevious} disabled={localTracks.length < 2}>
                  <SkipForward size={20} style={{ transform: "rotate(180deg)" }} />
                </button>
                <button
                  className="play-button"
                  type="button"
                  aria-label={isPlaying ? "暂停本地音频" : "播放本地音频"}
                  onClick={onTogglePlay}
                  disabled={!activeTrack}
                >
                  {isPlaying ? <Pause size={23} weight="fill" /> : <Play size={23} weight="fill" />}
                </button>
                <button type="button" aria-label="播放下一首" onClick={onNext} disabled={localTracks.length < 2}>
                  <SkipForward size={20} />
                </button>
              </div>
              <span>{duration ? formatDuration(Math.floor(duration)) : "00:00"}</span>
            </div>
          </>
        ) : (
          <div className="external-source-note">
            <span>{current.capability}</span>
            <p>
              {current.id === "netease"
                ? "点击下方按钮打开网易云官方歌单。"
                : "点击歌单卡片，从 QQ 音乐官方页面播放。"}
            </p>
          </div>
        )}
      </section>

      {currentPlaylistId === "netease" && connections.netease && (
        <section className="netease-player" aria-labelledby="netease-player-title">
          <div className="netease-player-heading">
            <span>网易云音乐</span>
            <h2 id="netease-player-title">{connections.netease.title}</h2>
          </div>
          <div className="netease-player-fallback">
            <div className="netease-player-fallback-icon" aria-hidden="true">
              <Headphones size={22} weight="fill" />
            </div>
            <div className="netease-player-fallback-copy">
              <strong>从官方页面打开</strong>
              <p>歌单链接会保存在你的私人档案中，不读取音乐账号信息。</p>
            </div>
            <div className="netease-player-actions">
              <a
                className="netease-player-primary"
                href={neteasePlaylistUrl(connections.netease.playlistId)}
                target="_blank"
                rel="noreferrer"
              >
                在网易云打开歌单
                <ArrowSquareOut size={16} weight="bold" />
              </a>
            </div>
          </div>
        </section>
      )}

      <section className="music-library">
        <div className="section-heading music-section-heading">
          <div>
            <h2>我的歌单</h2>
            <p>按来源查看训练音乐。</p>
          </div>
          <button type="button" onClick={() => onAddPlaylist()}>
            <Plus size={16} weight="bold" />
            添加歌单
          </button>
        </div>

        <div className={`source-switcher ${linksOnly ? "is-links-only" : ""}`} aria-label="音乐来源">
          {([
            ["all", "全部"],
            ["netease", "网易云"],
            ["qq", "QQ 音乐"],
            ...(!linksOnly ? [["local", "本地"]] as const : []),
          ] as readonly (readonly [MusicSource, string])[]).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={source === value ? "active" : ""}
              onClick={() => setSource(value)}
              aria-pressed={source === value}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="playlist-stack">
          {visiblePlaylists.map((playlist) => (
            <article
              className={`playlist-card ${current.id === playlist.id ? "is-current" : ""}`}
              key={playlist.id}
            >
              <MusicCover source={playlist.id} />
              <div className="playlist-copy">
                <div>
                  <span>{playlist.platform}</span>
                  <small>{playlist.capability}</small>
                </div>
                <h3>{playlist.title}</h3>
                <p>{playlist.description}</p>
                <strong>{playlist.trackCount}</strong>
              </div>
              {playlist.id === "qq" && connections.qq ? (
                <a href={connections.qq.url} target="_blank" rel="noreferrer">
                  {playlist.actionLabel}
                  <ArrowSquareOut size={18} />
                </a>
              ) : (
                <button type="button" onClick={() => onSelectPlaylist(playlist)}>
                  {playlist.actionLabel}
                  <Play size={18} weight="fill" />
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      {!linksOnly && currentPlaylistId === "local" && (
        <section className="local-audio-library" aria-labelledby="local-audio-title">
          <div className="section-heading music-section-heading">
            <div>
              <h2 id="local-audio-title">本地音频</h2>
              <p>音频保存在当前浏览器，可离线使用。</p>
            </div>
            <button type="button" onClick={() => onAddPlaylist("local")}>
              <UploadSimple size={16} weight="bold" />
              导入
            </button>
          </div>
          {localTracks.length === 0 ? (
            <div className="music-empty-state">
              <Headphones size={34} weight="duotone" />
              <h3>还没有本地音频</h3>
              <p>从 iPhone 文件或 Obsidian 附件目录选择音频。</p>
              <button type="button" onClick={() => onAddPlaylist("local")}>选择音频</button>
            </div>
          ) : (
            <div className="local-track-list">
              {localTracks.map((track) => (
                <article className={track.id === activeTrack?.id ? "is-current" : ""} key={track.id}>
                  <button className="track-play" type="button" onClick={() => onSelectTrack(track)}>
                    {track.id === activeTrack?.id && isPlaying ? (
                      <Pause size={18} weight="fill" />
                    ) : (
                      <Play size={18} weight="fill" />
                    )}
                    <span>
                      <strong>{track.name}</strong>
                      <small>{track.fileName}</small>
                    </span>
                  </button>
                  <button className="track-remove" type="button" onClick={() => onRemoveTrack(track)} aria-label={`删除 ${track.name}`}>
                    <Trash size={17} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className={`music-access-panel ${linksOnly ? "is-links-only" : ""}`} aria-labelledby="music-access-title">
        <div>
          <Headphones size={24} weight="duotone" />
          <div>
            <h2 id="music-access-title">{linksOnly ? "两个官方入口" : "三种播放方式"}</h2>
            <p>{linksOnly ? "只保存歌单链接，不读取网易云或 QQ 音乐账号。" : "不读取音乐账号 Cookie，也不会把本地音频上传到公开仓库。"}</p>
          </div>
        </div>
        <ol>
          <li><strong>网易云</strong><span>官方页面播放</span></li>
          <li><strong>QQ 音乐</strong><span>官方页面播放</span></li>
          {!linksOnly && <li><strong>本地音频</strong><span>离线播放</span></li>}
        </ol>
      </section>
    </>
  );
}

function MusicSetupSheet({
  initialSource,
  onClose,
  onSaveNetease,
  onSaveQQ,
  onImportFiles,
  linksOnly,
}: {
  initialSource: MusicPlatform;
  onClose: () => void;
  onSaveNetease: (value: string, title: string) => string | null;
  onSaveQQ: (value: string, title: string) => string | null;
  onImportFiles: (files: File[]) => Promise<void>;
  linksOnly: boolean;
}) {
  const [source, setSource] = useState<MusicPlatform>(initialSource);
  const [value, setValue] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  function saveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = source === "netease" ? onSaveNetease(value, title) : onSaveQQ(value, title);
    if (result) {
      setError(result);
      return;
    }
    onClose();
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setImporting(true);
    setError("");
    try {
      await onImportFiles(files);
      onClose();
    } catch {
      setError("音频保存失败，请确认浏览器仍有可用存储空间。");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="install-sheet music-setup-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-setup-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <IconButton label="关闭" onClick={onClose}><X size={22} /></IconButton>
        <h2 id="music-setup-title">添加训练音乐</h2>
        <p>{linksOnly ? "歌单链接会保存到你的私人档案。" : "选择音乐来源。连接信息和本地音频仅保存在这台设备。"}</p>

        <div className="music-setup-sources" aria-label="选择音乐来源">
          {([
            ["netease", "网易云"],
            ["qq", "QQ 音乐"],
            ...(!linksOnly ? [["local", "本地音频"]] as const : []),
          ] as readonly (readonly [MusicPlatform, string])[]).map(([itemSource, label]) => (
            <button
              type="button"
              key={itemSource}
              className={source === itemSource ? "active" : ""}
              onClick={() => {
                setSource(itemSource);
                setError("");
              }}
              aria-pressed={source === itemSource}
            >
              {label}
            </button>
          ))}
        </div>

        {source === "local" ? (
          <div className="music-file-import">
            <UploadSimple size={34} weight="duotone" />
            <strong>选择一个或多个音频文件</strong>
            <span>支持 iPhone 文件 App 中可打开的音频格式。</span>
            <label className="primary-button file-button">
              {importing ? "正在保存" : "选择音频"}
              <input type="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.flac" multiple onChange={importFiles} disabled={importing} />
            </label>
          </div>
        ) : (
          <form className="music-connection-form" onSubmit={saveConnection}>
            <label>
              <span>{source === "netease" ? "歌单链接或数字 ID" : "歌单分享链接"}</span>
              <input
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={source === "netease" ? "例如 123456789" : "粘贴 QQ 音乐分享链接"}
                autoCapitalize="none"
                autoCorrect="off"
                required
              />
            </label>
            <label>
              <span>显示名称（可选）</span>
              <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如 力量训练歌单" />
            </label>
            <p className="music-form-help">
              {source === "netease"
                ? "保存后会跳转网易云官方页面或 App。"
                : "保存后会通过 QQ 音乐官方页面或 App 打开。"}
            </p>
            <button className="primary-button" type="submit">保存连接</button>
          </form>
        )}
        {error && <div className="music-form-error" role="alert"><Warning size={17} />{error}</div>}
      </section>
    </div>
  );
}

function LocalMigrationSheet({
  snapshot,
  onImport,
  onSkip,
}: {
  snapshot: CloudSnapshot;
  onImport: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="sheet-backdrop" role="presentation">
      <section className="install-sheet migration-sheet" role="dialog" aria-modal="true" aria-labelledby="migration-title">
        <div className="migration-icon"><DownloadSimple size={28} weight="duotone" /></div>
        <span>发现本机旧档案</span>
        <h2 id="migration-title">导入到当前账号？</h2>
        <p>导入后可以在其他设备登录查看，本机原数据仍会保留。</p>
        <dl>
          <div><dt>个人档案</dt><dd>{snapshot.trainingProfile ? "1 份" : "无"}</dd></div>
          <div><dt>身体记录</dt><dd>{snapshot.bodyLogs.length} 条</dd></div>
          <div><dt>训练记录</dt><dd>{snapshot.records.length} 条</dd></div>
          <div><dt>歌单链接</dt><dd>{Number(Boolean(snapshot.connections.netease)) + Number(Boolean(snapshot.connections.qq))} 个</dd></div>
        </dl>
        <button className="primary-button" type="button" onClick={onImport}>导入我的档案</button>
        <button className="migration-skip" type="button" onClick={onSkip}>暂不导入，创建空白档案</button>
      </section>
    </div>
  );
}

function InstallSheet({
  onClose,
  deferredPrompt,
}: {
  onClose: () => void;
  deferredPrompt: DeferredInstallPrompt | null;
}) {
  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    onClose();
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="install-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <IconButton label="关闭" onClick={onClose}>
          <X size={22} />
        </IconButton>
        <div className="app-icon">
          <img src="icon-512.png" alt="" width={72} height={72} />
        </div>
        <h2 id="install-title">把稳练放到主屏幕</h2>
        {deferredPrompt ? (
          <>
            <p>安装后可像普通应用一样打开，并在弱网环境继续使用。</p>
            <button className="primary-button" type="button" onClick={install}>
              立即安装
            </button>
          </>
        ) : (
          <>
            <ol>
              <li>
                <strong>1</strong>
                用 Safari 打开此页面。
              </li>
              <li>
                <strong>2</strong>
                点击底部的分享按钮。
              </li>
              <li>
                <strong>3</strong>
                选择“添加到主屏幕”，再点“添加”。
              </li>
            </ol>
            <button className="primary-button" type="button" onClick={onClose}>
              我知道了
            </button>
          </>
        )}
      </section>
    </div>
  );
}

export default function FitnessApp({
  cloudSession,
  account,
}: {
  cloudSession?: CloudSession;
  account?: { displayName: string; onOpen: () => void };
}) {
  const [tab, setTab] = useState<Tab>("today");
  const [records, setRecords] = useState<WorkoutRecord[]>([]);
  const [trainingProfile, setTrainingProfile] = useState<TrainingProfile | null>(null);
  const [bodyLogs, setBodyLogs] = useState<DailyCheckIn[]>([]);
  const [personalWorkout, setPersonalWorkout] = useState<PersonalizedWorkout | null>(null);
  const [currentPlaylistId, setCurrentPlaylistId] = useState<MusicPlatform>(cloudSession ? "netease" : "local");
  const [connections, setConnections] = useState<MusicConnections>({});
  const [localTracks, setLocalTracks] = useState<StoredAudioTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicCurrentTime, setMusicCurrentTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicSetupOpen, setMusicSetupOpen] = useState(false);
  const [musicSetupSource, setMusicSetupSource] = useState<MusicPlatform>("netease");
  const [ready, setReady] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [message, setMessage] = useState("");
  const [cloudLoading, setCloudLoading] = useState(Boolean(cloudSession));
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationSnapshot, setMigrationSnapshot] = useState<CloudSnapshot | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingAutoplayRef = useRef(false);
  const storageKeys = useMemo(() => {
    const suffix = cloudSession ? `:${cloudSession.userId}` : "";
    return {
      records: `${STORAGE_KEY}${suffix}`,
      connections: `${MUSIC_CONNECTIONS_KEY}${suffix}`,
      profile: `${PROFILE_KEY}${suffix}`,
      bodyLogs: `${BODY_LOGS_KEY}${suffix}`,
      personalWorkout: `${PERSONAL_WORKOUT_KEY}${suffix}`,
      dirty: `wenlian-cloud-dirty-v1${suffix}`,
    };
  }, [cloudSession?.userId]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKeys.records);
      if (stored) setRecords(JSON.parse(stored));
      const storedConnections = window.localStorage.getItem(storageKeys.connections);
      if (storedConnections) setConnections(JSON.parse(storedConnections));
      const storedProfile = window.localStorage.getItem(storageKeys.profile);
      if (storedProfile) setTrainingProfile(JSON.parse(storedProfile));
      const storedBodyLogs = window.localStorage.getItem(storageKeys.bodyLogs);
      if (storedBodyLogs) setBodyLogs(JSON.parse(storedBodyLogs));
      const storedPersonalWorkout = window.localStorage.getItem(storageKeys.personalWorkout);
      if (storedPersonalWorkout) setPersonalWorkout(JSON.parse(storedPersonalWorkout));
    } catch {
      setMessage("本地记录读取失败，请从 JSON 备份恢复。");
    } finally {
      setReady(true);
    }

    let refreshingForUpdate = false;
    const handleServiceWorkerUpdate = () => {
      if (refreshingForUpdate) return;
      refreshingForUpdate = true;
      window.location.reload();
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", handleServiceWorkerUpdate);
      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    const handleInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstall);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleServiceWorkerUpdate);
      }
    };
  }, [storageKeys]);

  useEffect(() => {
    if (cloudSession) {
      setLocalTracks([]);
      setActiveTrackId(null);
      return;
    }
    listStoredAudioTracks()
      .then((tracks) => {
        setLocalTracks(tracks);
        if (tracks[0]) setActiveTrackId(tracks[0].id);
      })
      .catch(() => setMessage("本地音频读取失败，可重新导入音频。"));
  }, [cloudSession]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(storageKeys.records, JSON.stringify(records));
  }, [records, ready, storageKeys.records]);

  useEffect(() => {
    if (!ready || !cloudSession) return;
    let active = true;
    setCloudLoading(true);

    const pendingSnapshot = readStoredSnapshot(storageKeys);
    const flushPending = window.localStorage.getItem(storageKeys.dirty) === "1" && hasCloudData(pendingSnapshot)
      ? importLocalSnapshot(cloudSession.client, cloudSession.userId, pendingSnapshot).then(() => {
          window.localStorage.removeItem(storageKeys.dirty);
        })
      : Promise.resolve();

    flushPending
      .then(() => loadCloudSnapshot(cloudSession.client, cloudSession.userId))
      .then((snapshot) => {
        if (!active) return;
        if (hasCloudData(snapshot)) {
          setRecords(snapshot.records);
          setConnections(snapshot.connections);
          setTrainingProfile(snapshot.trainingProfile);
          setBodyLogs(snapshot.bodyLogs);
          setPersonalWorkout(snapshot.personalWorkout);
          window.localStorage.setItem(storageKeys.records, JSON.stringify(snapshot.records));
          window.localStorage.setItem(storageKeys.connections, JSON.stringify(snapshot.connections));
          window.localStorage.setItem(storageKeys.profile, JSON.stringify(snapshot.trainingProfile));
          window.localStorage.setItem(storageKeys.bodyLogs, JSON.stringify(snapshot.bodyLogs));
          window.localStorage.setItem(storageKeys.personalWorkout, JSON.stringify(snapshot.personalWorkout));
          return;
        }

        const scopedSnapshot = readStoredSnapshot(storageKeys);
        const localSnapshot = hasCloudData(scopedSnapshot) ? scopedSnapshot : readStoredSnapshot(legacyStorageKeys());
        if (hasCloudData(localSnapshot)) {
          setRecords(localSnapshot.records);
          setConnections(localSnapshot.connections);
          setTrainingProfile(localSnapshot.trainingProfile);
          setBodyLogs(localSnapshot.bodyLogs);
          setPersonalWorkout(localSnapshot.personalWorkout);
          setMigrationSnapshot(localSnapshot);
          setMigrationOpen(true);
        }
      })
      .catch(() => {
        if (active) setMessage("云端档案暂时无法读取，本机缓存仍然保留。");
      })
      .finally(() => {
        if (active) setCloudLoading(false);
      });

    return () => { active = false; };
  }, [cloudSession?.client, cloudSession?.userId, ready, storageKeys]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const activeTrack = useMemo(
    () => localTracks.find((track) => track.id === activeTrackId) ?? null,
    [activeTrackId, localTracks],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;
    const url = URL.createObjectURL(activeTrack.blob);
    audio.src = url;
    audio.load();
    return () => {
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [activeTrack]);

  const week = currentWeekKeys();
  const weekRecords = useMemo(
    () => records.filter((record) => record.date >= week.start && record.date <= week.end),
    [records, week.end, week.start],
  );
  const nextWorkout =
    workouts.slice(0, 3).find(
      (workout) => !weekRecords.some((record) => record.workoutId === workout.id),
    ) ?? workouts[3];
  const musicPlaylists = useMemo(
    () => createMusicPlaylists(connections, localTracks, activeTrack)
      .filter((playlist) => !cloudSession || playlist.id !== "local"),
    [activeTrack, cloudSession, connections, localTracks],
  );
  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio || !activeTrack) {
      setTab("music");
      setCurrentPlaylistId("local");
      setMessage("请先导入并选择一首本地音频。");
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setMessage("浏览器没有开始播放，请再次点击播放按钮。");
      }
    } else {
      audio.pause();
    }
  }

  function openMusicSetup(source: MusicPlatform = "netease") {
    setMusicSetupSource(source);
    setMusicSetupOpen(true);
  }

  function selectMusicPlaylist(playlist: MusicPlaylist) {
    setCurrentPlaylistId(playlist.id);
    if (playlist.id !== "local" && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    if (playlist.id === "netease" && !connections.netease) {
      openMusicSetup("netease");
      return;
    }
    if (playlist.id === "qq") {
      if (!connections.qq) {
        openMusicSetup("qq");
        return;
      }
      window.open(connections.qq.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (playlist.id === "local" && localTracks.length === 0) openMusicSetup("local");
  }

  function activateTrack(track: StoredAudioTrack, autoplay = true) {
    const isCurrent = track.id === activeTrackId;
    setCurrentPlaylistId("local");
    if (isCurrent) {
      if (autoplay) void toggleMusic();
      return;
    }
    setMusicCurrentTime(0);
    setMusicDuration(0);
    pendingAutoplayRef.current = autoplay;
    setActiveTrackId(track.id);
  }

  function moveTrack(direction: -1 | 1) {
    if (localTracks.length < 2) return;
    const currentIndex = Math.max(0, localTracks.findIndex((track) => track.id === activeTrackId));
    const nextIndex = (currentIndex + direction + localTracks.length) % localTracks.length;
    activateTrack(localTracks[nextIndex], true);
  }

  function seekMusic(seconds: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setMusicCurrentTime(seconds);
  }

  function saveConnections(next: MusicConnections) {
    setConnections(next);
    window.localStorage.setItem(storageKeys.connections, JSON.stringify(next));
    if (cloudSession) {
      void saveCloudConnections(cloudSession.client, cloudSession.userId, next)
        .catch(() => {
          window.localStorage.setItem(storageKeys.dirty, "1");
          setMessage("歌单已保存在本机，联网后会继续同步。");
        });
    }
  }

  function saveNeteaseConnection(value: string, title: string) {
    const playlistId = parseNeteasePlaylistId(value);
    if (!playlistId) return "无法识别歌单。请粘贴网易云歌单链接或数字 ID。";
    saveConnections({
      ...connections,
      netease: { playlistId, title: title.trim() || "我的网易云训练歌单" },
    });
    setCurrentPlaylistId("netease");
    setMessage("网易云歌单已连接。iPhone 请使用官方页面播放。");
    return null;
  }

  function saveQQConnection(value: string, title: string) {
    const url = normalizeQQMusicUrl(value);
    if (!url) return "无法识别链接。请从 QQ 音乐复制歌单分享链接。";
    saveConnections({
      ...connections,
      qq: { url, title: title.trim() || "我的 QQ 音乐训练歌单" },
    });
    setCurrentPlaylistId("qq");
    setMessage("QQ 音乐歌单已连接。点击歌单会打开官方页面。");
    return null;
  }

  async function importAudioFiles(files: File[]) {
    const audioFiles = files.filter((file) => file.type.startsWith("audio/") || /\.(m4a|mp3|wav|aac|flac)$/i.test(file.name));
    if (!audioFiles.length) throw new Error("not-audio");
    const saved = await saveAudioFiles(audioFiles);
    setLocalTracks((current) => [...saved, ...current]);
    setCurrentPlaylistId("local");
    setMusicCurrentTime(0);
    setMusicDuration(0);
    setActiveTrackId(saved[0].id);
    setMessage(`已保存 ${saved.length} 首本地音频，可离线播放。`);
  }

  async function removeLocalTrack(track: StoredAudioTrack) {
    if (!window.confirm(`从本机删除“${track.name}”？`)) return;
    await removeStoredAudioTrack(track.id);
    const remaining = localTracks.filter((item) => item.id !== track.id);
    setLocalTracks(remaining);
    if (activeTrackId === track.id) {
      audioRef.current?.pause();
      setActiveTrackId(remaining[0]?.id ?? null);
      setMusicCurrentTime(0);
      setMusicDuration(0);
    }
    setMessage("本地音频已删除。");
  }

  function saveTrainingProfile(profile: TrainingProfile) {
    setTrainingProfile(profile);
    window.localStorage.setItem(storageKeys.profile, JSON.stringify(profile));
    if (cloudSession) {
      void saveCloudProfile(cloudSession.client, cloudSession.userId, profile)
        .catch(() => {
          window.localStorage.setItem(storageKeys.dirty, "1");
          setMessage("档案已保存在本机，联网后会继续同步。");
        });
    }
    setMessage("个人训练档案已保存。");
  }

  function generatePersonalWorkout(checkIn: DailyCheckIn) {
    if (!trainingProfile) return;
    const updatedProfile = { ...trainingProfile, weightKg: checkIn.weightKg };
    const nextWorkout = createPersonalizedWorkout(updatedProfile, checkIn);
    const nextBodyLogs = [checkIn, ...bodyLogs.filter((item) => item.id !== checkIn.id)].slice(0, 120);
    setTrainingProfile(updatedProfile);
    setBodyLogs(nextBodyLogs);
    setPersonalWorkout(nextWorkout);
    window.localStorage.setItem(storageKeys.profile, JSON.stringify(updatedProfile));
    window.localStorage.setItem(storageKeys.bodyLogs, JSON.stringify(nextBodyLogs));
    window.localStorage.setItem(storageKeys.personalWorkout, JSON.stringify(nextWorkout));
    if (cloudSession) {
      void saveCloudCheckInAndPlan(
        cloudSession.client,
        cloudSession.userId,
        updatedProfile,
        checkIn,
        nextWorkout,
      ).catch(() => {
        window.localStorage.setItem(storageKeys.dirty, "1");
        setMessage("训练方案已保存在本机，联网后会继续同步。");
      });
    }
    setMessage(`${nextWorkout.title}已生成，可查看分析后开始。`);
  }

  function finishWorkout(
    entries: Record<string, ExerciseEntry>,
    note: string,
    seconds: number,
  ) {
    if (!activeWorkout) return;
    const now = new Date();
    const record: WorkoutRecord = {
      id: `${now.getTime()}-${activeWorkout.id}`,
      workoutId: activeWorkout.id,
      title: activeWorkout.title,
      shortName: activeWorkout.shortName,
      focus: activeWorkout.focus,
      optional: Boolean(activeWorkout.optional),
      date: localDateKey(now),
      finishedAt: now.toISOString(),
      durationMinutes: Math.max(1, Math.round(seconds / 60)),
      note: note.trim(),
      entries,
      exercises: activeWorkout.exercises,
    };
    setRecords((current) => [...current, record]);
    if (cloudSession) {
      void saveCloudRecord(cloudSession.client, cloudSession.userId, record)
        .catch(() => {
          window.localStorage.setItem(storageKeys.dirty, "1");
          setMessage("训练已保存在本机，联网后会继续同步。");
        });
    }
    setActiveWorkout(null);
    setTab("records");
    setMessage("训练已保存。继续保持这个节奏。");
  }

  async function migrateLocalData() {
    if (!cloudSession || !migrationSnapshot) return;
    try {
      await importLocalSnapshot(cloudSession.client, cloudSession.userId, migrationSnapshot);
      window.localStorage.setItem(storageKeys.records, JSON.stringify(migrationSnapshot.records));
      window.localStorage.setItem(storageKeys.connections, JSON.stringify(migrationSnapshot.connections));
      window.localStorage.setItem(storageKeys.profile, JSON.stringify(migrationSnapshot.trainingProfile));
      window.localStorage.setItem(storageKeys.bodyLogs, JSON.stringify(migrationSnapshot.bodyLogs));
      window.localStorage.setItem(storageKeys.personalWorkout, JSON.stringify(migrationSnapshot.personalWorkout));
      setMigrationOpen(false);
      setMigrationSnapshot(null);
      window.localStorage.removeItem(storageKeys.dirty);
      setMessage("本机档案已导入当前账号。");
    } catch {
      setMessage("本机档案导入失败，数据仍保留在这部手机上。");
    }
  }

  function skipLocalMigration() {
    setRecords([]);
    setConnections({});
    setTrainingProfile(null);
    setBodyLogs([]);
    setPersonalWorkout(null);
    setMigrationOpen(false);
    setMigrationSnapshot(null);
    setMessage("已为当前账号创建空白档案，本机旧数据没有删除。");
  }

  async function exportMarkdown() {
    const content = entriesToMarkdown(records, trainingProfile, bodyLogs);
    const file = new File([content], `稳练训练记录-${localDateKey()}.md`, {
      type: "text/markdown",
    });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "稳练训练记录",
          text: "保存到 Obsidian 训练记录目录",
        });
      } else {
        downloadFile(file);
        setMessage("Markdown 已下载，可移动到 Obsidian 仓库。");
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        downloadFile(file);
        setMessage("分享未完成，已改为下载 Markdown。");
      }
    }
  }

  function exportJson() {
    const file = new File(
      [JSON.stringify({
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        records,
        trainingProfile,
        bodyLogs,
        personalWorkout,
      }, null, 2)],
      `稳练备份-${localDateKey()}.json`,
      { type: "application/json" },
    );
    downloadFile(file);
    setMessage("JSON 备份已下载。");
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (![1, BACKUP_VERSION].includes(parsed.version) || !Array.isArray(parsed.records)) {
        throw new Error("invalid");
      }
      setRecords(parsed.records);
      if (parsed.trainingProfile) {
        setTrainingProfile(parsed.trainingProfile);
        window.localStorage.setItem(storageKeys.profile, JSON.stringify(parsed.trainingProfile));
      }
      if (Array.isArray(parsed.bodyLogs)) {
        setBodyLogs(parsed.bodyLogs);
        window.localStorage.setItem(storageKeys.bodyLogs, JSON.stringify(parsed.bodyLogs));
      }
      if (parsed.personalWorkout) {
        setPersonalWorkout(parsed.personalWorkout);
        window.localStorage.setItem(storageKeys.personalWorkout, JSON.stringify(parsed.personalWorkout));
      }
      setMessage(`已恢复 ${parsed.records.length} 条训练记录。`);
    } catch {
      setMessage("无法识别这个备份文件，请选择稳练导出的 JSON。");
    }
  }

  if (!ready || cloudLoading) {
    return (
      <main className="loading-shell" role="status" aria-live="polite">
        <Barbell size={38} weight="duotone" />
        <span>{cloudLoading ? "正在载入私人档案" : "正在载入训练计划"}</span>
      </main>
    );
  }

  const audioPlayer = (
    <audio
      ref={audioRef}
      hidden
      preload="metadata"
      onPlay={() => setIsMusicPlaying(true)}
      onPause={() => setIsMusicPlaying(false)}
      onTimeUpdate={(event) => setMusicCurrentTime(event.currentTarget.currentTime)}
      onDurationChange={(event) => {
        const nextDuration = event.currentTarget.duration;
        setMusicDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
      }}
      onCanPlay={(event) => {
        if (!pendingAutoplayRef.current) return;
        pendingAutoplayRef.current = false;
        event.currentTarget.play().catch(() => setMessage("音频已选中，请点击播放按钮开始。"));
      }}
      onEnded={() => moveTrack(1)}
      onError={() => {
        pendingAutoplayRef.current = false;
        setIsMusicPlaying(false);
        setMessage("这段音频无法播放，请尝试导入其他格式。");
      }}
    />
  );

  if (activeWorkout) {
    return (
      <>
        {audioPlayer}
        <WorkoutSession
          workout={activeWorkout}
          onExit={() => {
            if (window.confirm("退出后，本次未保存的记录会丢失。确定退出吗？")) {
              setActiveWorkout(null);
            }
          }}
          onFinish={finishWorkout}
        />
      </>
    );
  }

  return (
    <>
    {audioPlayer}
    <div className={`app-shell ${tab !== "music" && activeTrack ? "has-mini-player" : ""}`}>
      <main className="content-shell">
        {account && (
          <div className="account-bar">
            <span><CheckCircle size={16} weight="fill" />私人档案已同步</span>
            <button type="button" onClick={account.onOpen} aria-label="打开账号设置">
              <UserCircle size={20} weight="duotone" />
              {account.displayName}
            </button>
          </div>
        )}
        {tab === "today" && (
          <TodayView
            weekRecords={weekRecords}
            nextWorkout={personalWorkout ?? nextWorkout}
            onStart={setActiveWorkout}
            onOpenPlan={() => setTab("plan")}
            onInstall={() => setInstallOpen(true)}
            weeklyGoal={trainingProfile?.weeklyDays ?? 3}
          />
        )}
        {tab === "plan" && (
          <PersonalPlanner
            profile={trainingProfile}
            checkIns={bodyLogs}
            workout={personalWorkout}
            onSaveProfile={saveTrainingProfile}
            onGenerate={generatePersonalWorkout}
            onStart={setActiveWorkout}
          />
        )}
        {tab === "music" && (
          <MusicView
            playlists={musicPlaylists}
            currentPlaylistId={currentPlaylistId}
            connections={connections}
            localTracks={localTracks}
            activeTrack={activeTrack}
            isPlaying={isMusicPlaying}
            currentTime={musicCurrentTime}
            duration={musicDuration}
            onTogglePlay={toggleMusic}
            onSelectPlaylist={selectMusicPlaylist}
            onAddPlaylist={openMusicSetup}
            onSelectTrack={(track) => activateTrack(track)}
            onSeek={seekMusic}
            onPrevious={() => moveTrack(-1)}
            onNext={() => moveTrack(1)}
            onRemoveTrack={(track) => void removeLocalTrack(track)}
            linksOnly={Boolean(cloudSession)}
          />
        )}
        {tab === "records" && (
          <RecordsView
            records={records}
            onExportMarkdown={exportMarkdown}
            onExportJson={exportJson}
            onImport={importJson}
          />
        )}
      </main>

      {tab !== "music" && activeTrack && (
        <aside className="mini-player" aria-label="迷你音乐播放器">
          <button className="mini-player-copy" type="button" onClick={() => setTab("music")}>
            <MusicCover source="local" compact />
            <span>
              <strong>{activeTrack.name}</strong>
              <small>本机离线音乐</small>
            </span>
          </button>
          <button
            className="mini-player-control"
            type="button"
            aria-label={isMusicPlaying ? "暂停本地音频" : "播放本地音频"}
            onClick={() => void toggleMusic()}
          >
            {isMusicPlaying ? <Pause size={21} weight="fill" /> : <Play size={21} weight="fill" />}
          </button>
        </aside>
      )}

      <nav className="bottom-nav" aria-label="主要导航">
        <button
          type="button"
          className={tab === "today" ? "active" : ""}
          onClick={() => setTab("today")}
          aria-current={tab === "today" ? "page" : undefined}
        >
          <House size={23} weight={tab === "today" ? "fill" : "regular"} />
          <span>今天</span>
        </button>
        <button
          type="button"
          className={tab === "plan" ? "active" : ""}
          onClick={() => setTab("plan")}
          aria-current={tab === "plan" ? "page" : undefined}
        >
          <Notebook size={23} weight={tab === "plan" ? "fill" : "regular"} />
          <span>计划</span>
        </button>
        <button
          type="button"
          className={tab === "music" ? "active" : ""}
          onClick={() => setTab("music")}
          aria-current={tab === "music" ? "page" : undefined}
        >
          <MusicNotes size={23} weight={tab === "music" ? "fill" : "regular"} />
          <span>音乐</span>
        </button>
        <button
          type="button"
          className={tab === "records" ? "active" : ""}
          onClick={() => setTab("records")}
          aria-current={tab === "records" ? "page" : undefined}
        >
          <ChartBar size={23} weight={tab === "records" ? "fill" : "regular"} />
          <span>记录</span>
        </button>
      </nav>

      {installOpen && (
        <InstallSheet
          onClose={() => setInstallOpen(false)}
          deferredPrompt={deferredPrompt}
        />
      )}
      {musicSetupOpen && (
        <MusicSetupSheet
          initialSource={musicSetupSource}
          onClose={() => setMusicSetupOpen(false)}
          onSaveNetease={saveNeteaseConnection}
          onSaveQQ={saveQQConnection}
          onImportFiles={importAudioFiles}
          linksOnly={Boolean(cloudSession)}
        />
      )}
      {migrationOpen && migrationSnapshot && (
        <LocalMigrationSheet
          snapshot={migrationSnapshot}
          onImport={() => void migrateLocalData()}
          onSkip={skipLocalMigration}
        />
      )}
      {message && (
        <div className="toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
    </div>
    </>
  );
}
