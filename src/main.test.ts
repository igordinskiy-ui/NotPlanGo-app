import { describe, expect, it } from "vitest";
import {
  addDays,
  compactBackup,
  createEmptyState,
  createTask,
  ensureCurrentWeek,
  getSelectedWeekDay,
  getThemeColor,
  getUpcomingTasks,
  getWeekDays,
  isSavedPlannerState,
  normalizeState,
  themePresets,
} from "./main";

describe("planner week rollover", () => {
  it("creates one daily repeated task per next-week day instead of multiplying duplicates", () => {
    const weekStart = "2026-06-29";
    const nextWeekStart = "2026-07-06";
    const weekDays = getWeekDays(weekStart);
    const state = createEmptyState(weekStart);

    state.tasks = Object.fromEntries(
      weekDays.map((day) => [
        day,
        [createTask("Drink water", false, { repeat: "daily", priority: "normal" })],
      ]),
    );

    const next = ensureCurrentWeek(state, nextWeekStart);

    getWeekDays(nextWeekStart).forEach((day) => {
      const dailyCopies = next.tasks[day].filter((task) => task.title === "Drink water");
      expect(dailyCopies).toHaveLength(1);
      expect(dailyCopies[0].done).toBe(false);
      expect(dailyCopies[0].repeat).toBe("daily");
    });
  });

  it("keeps tasks that were already planned in the next week", () => {
    const weekStart = "2026-06-29";
    const nextWeekStart = "2026-07-06";
    const state = createEmptyState(weekStart);
    const nextMonday = getWeekDays(nextWeekStart)[0];
    const planned = createTask("Doctor appointment", false, { priority: "high" });
    state.tasks[nextMonday] = [planned];

    const next = ensureCurrentWeek(state, nextWeekStart);

    expect(next.tasks[nextMonday].some((task) => task.id === planned.id)).toBe(true);
  });
});

describe("upcoming tasks", () => {
  it("returns future tasks after the visible week sorted by date", () => {
    const weekStart = "2026-07-06";
    const weekDays = getWeekDays(weekStart);
    const currentWeekTask = createTask("Visible this week");
    const later = addDays(weekDays[6], 5);
    const sooner = addDays(weekDays[6], 1);
    const tasks = {
      [weekDays[2]]: [currentWeekTask],
      [later]: [createTask("Later")],
      [sooner]: [createTask("Sooner")],
    };

    const upcoming = getUpcomingTasks(tasks, weekDays);

    expect(upcoming.map((item) => item.task.title)).toEqual(["Sooner", "Later"]);
    expect(upcoming.every((item) => item.day > weekDays[6])).toBe(true);
  });
});

describe("week navigation", () => {
  it("keeps today selected only when it belongs to the visible week", () => {
    const currentWeek = getWeekDays("2026-07-06");
    const nextWeek = getWeekDays("2026-07-13");

    expect(getSelectedWeekDay("2026-07-08", currentWeek)).toBe("2026-07-08");
    expect(getSelectedWeekDay("2026-07-08", nextWeek)).toBe("2026-07-13");
  });
});

describe("theme presets", () => {
  it("exposes saved app themes with status-bar colors", () => {
    expect(themePresets).toHaveLength(8);
    expect(new Set(themePresets.map((preset) => preset.id)).size).toBe(themePresets.length);

    themePresets.forEach((preset) => {
      expect(getThemeColor(preset.id)).toBe(preset.swatches[1]);
      expect(getThemeColor(preset.id)).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe("import normalization", () => {
  it("rejects values that are not planner-shaped", () => {
    expect(isSavedPlannerState({ tasks: [] })).toBe(false);
    expect(isSavedPlannerState({ habits: {} })).toBe(false);
    expect(isSavedPlannerState({ tasks: {}, weeklyGoals: {} })).toBe(true);
  });

  it("normalizes invalid settings to safe defaults", () => {
    const normalized = normalizeState({
      activeWeekStart: "2026-07-06",
      tasks: {},
      settings: { startMode: "paid" as "demo", weeklyExportReminder: "yes" as unknown as boolean, theme: "neon" as "olive", lastExportAt: 123 as unknown as string },
    });

    expect(normalized.settings.startMode).toBe("demo");
    expect(normalized.settings.weeklyExportReminder).toBe(true);
    expect(normalized.settings.theme).toBe("olive");
    expect(normalized.settings.lastExportAt).toBe("");
  });
});

describe("backup snapshots", () => {
  it("does not recursively embed previous backups", () => {
    const state = createEmptyState("2026-07-06");
    state.backups = [{ id: "old", createdAt: "2026-07-06T10:00:00.000Z", label: "Old", data: "{\"large\":true}" }];

    const backup = compactBackup(state, "Manual");
    const parsed = JSON.parse(backup.data);

    expect(backup.label).toBe("Manual");
    expect(parsed.backups).toEqual([]);
  });
});
