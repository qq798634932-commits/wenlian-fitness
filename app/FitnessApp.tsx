"use client";

import {
  ArrowRight,
  Barbell,
  CalendarDots,
  CaretLeft,
  ChartBar,
  CheckCircle,
  DownloadSimple,
  House,
  ListChecks,
  Minus,
  Notebook,
  Plus,
  ShareNetwork,
  Timer,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Exercise, Workout, workouts } from "./workouts";

type Tab = "today" | "plan" | "records";

type ExerciseEntry = {
  completedSets: number;
  weight: string;
  reps: string;
  rpe: string;
};

type WorkoutRecord = {
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
};

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STORAGE_KEY = "wenlian-records-v1";
const BACKUP_VERSION = 1;

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

function entriesToMarkdown(records: WorkoutRecord[]) {
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

  if (sorted.length === 0) {
    lines.push("暂无已完成训练。");
  }

  sorted.forEach((record) => {
    const workout = workouts.find((item) => item.id === record.workoutId);
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
    workout?.exercises.forEach((exercise) => {
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
}: {
  weekRecords: WorkoutRecord[];
  nextWorkout: Workout;
  onStart: (workout: Workout) => void;
  onOpenPlan: () => void;
  onInstall: () => void;
}) {
  const coreCount = new Set(
    weekRecords.filter((record) => !record.optional).map((record) => record.workoutId),
  ).size;
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
          <h2>{coreCount === 3 ? "三次主训练已完成" : "保持节奏，继续下一练"}</h2>
          <p>{week.label}</p>
        </div>
        <ProgressRing value={coreCount} total={3} />
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
            <p>三次力量训练，第 4 天按恢复情况选择。</p>
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

function PlanView({
  weekRecords,
  onStart,
}: {
  weekRecords: WorkoutRecord[];
  onStart: (workout: Workout) => void;
}) {
  return (
    <>
      <header className="page-heading">
        <span>推荐安排</span>
        <h1>三练为主，四练可选</h1>
        <p>建议周一、周三、周五训练。如果错过一天，下次从未完成的那天继续。</p>
      </header>

      <section className="plan-stack">
        {workouts.map((workout) => {
          const done = weekRecords.some((record) => record.workoutId === workout.id);
          return (
            <article className="plan-card" key={workout.id}>
              <div className="plan-card-header">
                <div>
                  <span>{workout.shortName}</span>
                  <h2>{workout.title}</h2>
                  <p>{workout.focus}</p>
                </div>
                <div className={`completion-mark ${done ? "done" : ""}`}>
                  {done ? <CheckCircle size={25} weight="fill" /> : <Barbell size={24} />}
                </div>
              </div>
              <div className="plan-meta">
                <span>{workout.schedule}</span>
                <span>{workout.duration}</span>
                <span>{workout.exercises.length} 个动作</span>
              </div>
              <div className="exercise-strip">
                {workout.exercises.slice(0, 4).map((exercise) => (
                  <div key={exercise.id}>
                    <ExerciseThumb exercise={exercise} />
                    <span>{exercise.name}</span>
                  </div>
                ))}
              </div>
              <button className="secondary-button" type="button" onClick={() => onStart(workout)}>
                {done ? "再练一次" : "开始这组"}
                <ArrowRight size={19} />
              </button>
            </article>
          );
        })}
      </section>
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

export default function FitnessApp() {
  const [tab, setTab] = useState<Tab>("today");
  const [records, setRecords] = useState<WorkoutRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setRecords(JSON.parse(stored));
    } catch {
      setMessage("本地记录读取失败，请从 JSON 备份恢复。");
    } finally {
      setReady(true);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    }

    const handleInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records, ready]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const week = currentWeekKeys();
  const weekRecords = useMemo(
    () => records.filter((record) => record.date >= week.start && record.date <= week.end),
    [records, week.end, week.start],
  );
  const nextWorkout =
    workouts.slice(0, 3).find(
      (workout) => !weekRecords.some((record) => record.workoutId === workout.id),
    ) ?? workouts[3];

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
    };
    setRecords((current) => [...current, record]);
    setActiveWorkout(null);
    setTab("records");
    setMessage("训练已保存。继续保持这个节奏。");
  }

  async function exportMarkdown() {
    const content = entriesToMarkdown(records);
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
      [JSON.stringify({ version: BACKUP_VERSION, exportedAt: new Date().toISOString(), records }, null, 2)],
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
      if (parsed.version !== BACKUP_VERSION || !Array.isArray(parsed.records)) {
        throw new Error("invalid");
      }
      setRecords(parsed.records);
      setMessage(`已恢复 ${parsed.records.length} 条训练记录。`);
    } catch {
      setMessage("无法识别这个备份文件，请选择稳练导出的 JSON。");
    }
  }

  if (!ready) {
    return (
      <main className="loading-shell" role="status" aria-live="polite">
        <Barbell size={38} weight="duotone" />
        <span>正在载入训练计划</span>
      </main>
    );
  }

  if (activeWorkout) {
    return (
      <WorkoutSession
        workout={activeWorkout}
        onExit={() => {
          if (window.confirm("退出后，本次未保存的记录会丢失。确定退出吗？")) {
            setActiveWorkout(null);
          }
        }}
        onFinish={finishWorkout}
      />
    );
  }

  return (
    <div className="app-shell">
      <main className="content-shell">
        {tab === "today" && (
          <TodayView
            weekRecords={weekRecords}
            nextWorkout={nextWorkout}
            onStart={setActiveWorkout}
            onOpenPlan={() => setTab("plan")}
            onInstall={() => setInstallOpen(true)}
          />
        )}
        {tab === "plan" && (
          <PlanView weekRecords={weekRecords} onStart={setActiveWorkout} />
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
      {message && (
        <div className="toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
    </div>
  );
}
