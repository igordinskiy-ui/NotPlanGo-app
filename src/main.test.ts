import { describe, expect, it } from "vitest";
import {
  addDays,
  buildDailyReminderBody,
  buildReviewReminderBody,
  buildWeekMarkdown,
  compactBackup,
  createEmptyState,
  createTask,
  formatRuCount,
  ensureCurrentWeek,
  getSelectedWeekDay,
  getThemeColor,
  getUpcomingTasks,
  getWeekDays,
  getUnfinishedTasksForDays,
  getNextReminderSummary,
  getNextReminderDelayMs,
  getNotificationPermissionCopy,
  getPwaInstallActionCopy,
  getPwaReadinessItems,
  getReminderLastDateAfterEnable,
  getReminderLastDateAfterTimeChange,
  getReminderScheduleCopy,
  isSavedPlannerState,
  isReminderTime,
  moveUnfinishedTasksToDay,
  normalizeReminderDays,
  normalizeState,
  parsePlannerDeepLink,
  searchPlannerState,
  shouldSendDailyReminder,
  shouldSkipReminderForDay,
  snoozeRemindersForDate,
  themePresets,
  toggleReminderDay,
  updateTaskMetadata,
} from "./main";

describe("planner week rollover", () => {
  it("normalizes imported task metadata and preserves task timestamps", () => {
    const task = createTask("Imported", false, {
      priority: "unexpected" as never,
      repeat: "monthly" as never,
      createdAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-02T09:00:00.000Z",
    });

    expect(task.priority).toBe("normal");
    expect(task.repeat).toBe("none");
    expect(task.createdAt).toBe("2026-07-01T08:00:00.000Z");
    expect(task.updatedAt).toBe("2026-07-02T09:00:00.000Z");
  });

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

  it("schedules a newly daily task for the remaining days of its current week", () => {
    const weekStart = "2026-07-06";
    const days = getWeekDays(weekStart);
    const state = createEmptyState(weekStart);
    const task = createTask("Walk", false, { priority: "high" });
    state.tasks[days[2]] = [task];
    state.tasks[days[4]] = [createTask("Walk", false, { priority: "high", repeat: "daily" })];

    const next = updateTaskMetadata(state, days[2], task.id, { repeat: "daily" }, "2026-07-08T10:00:00.000Z");

    expect(next.tasks[days[2]][0]).toMatchObject({ repeat: "daily", updatedAt: "2026-07-08T10:00:00.000Z" });
    expect(next.tasks[days[3]].map((item) => item.title)).toEqual(["Walk"]);
    expect(next.tasks[days[4]].filter((item) => item.title === "Walk")).toHaveLength(1);
    expect(next.tasks[days[6]].map((item) => item.title)).toEqual(["Walk"]);
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

describe("weekly review carry-over", () => {
  it("moves unfinished tasks from a reviewed week into the target day", () => {
    const sourceWeek = getWeekDays("2026-06-29");
    const targetDay = "2026-07-08";
    const state = createEmptyState("2026-06-29");
    const doneTask = createTask("Closed", true);
    const openTask = createTask("Still relevant", false, { priority: "high", repeat: "weekly" });
    state.tasks[sourceWeek[0]] = [doneTask, openTask];
    state.tasks[sourceWeek[2]] = [createTask("Second open", false)];
    state.tasks[targetDay] = [createTask("Today already")];

    const result = moveUnfinishedTasksToDay(state, sourceWeek, targetDay, "2026-07-08T10:00:00.000Z");

    expect(result.moved).toBe(2);
    expect(result.state.tasks[sourceWeek[0]].map((task) => task.title)).toEqual(["Closed"]);
    expect(result.state.tasks[sourceWeek[2]]).toEqual([]);
    expect(result.state.tasks[targetDay].map((task) => task.title)).toEqual(["Today already", "Still relevant", "Second open"]);
    expect(result.state.tasks[targetDay][1].done).toBe(false);
    expect(result.state.tasks[targetDay][1].updatedAt).toBe("2026-07-08T10:00:00.000Z");
  });

  it("keeps unfinished tasks that are already on the target day", () => {
    const week = getWeekDays("2026-07-06");
    const state = createEmptyState("2026-07-06");
    state.tasks[week[0]] = [createTask("Monday", false)];
    state.tasks[week[1]] = [createTask("Tuesday", false)];

    const result = moveUnfinishedTasksToDay(state, week, week[1], "2026-07-08T10:00:00.000Z");

    expect(result.moved).toBe(1);
    expect(result.state.tasks[week[0]]).toEqual([]);
    expect(result.state.tasks[week[1]].map((task) => task.title)).toEqual(["Tuesday", "Monday"]);
    expect(getUnfinishedTasksForDays(result.state.tasks, [week[0]])).toEqual([]);
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

describe("notification reminders", () => {
  it("validates reminder time strings", () => {
    expect(isReminderTime("09:30")).toBe(true);
    expect(isReminderTime("23:59")).toBe(true);
    expect(isReminderTime("24:00")).toBe(false);
    expect(isReminderTime("9:00")).toBe(false);
  });

  it("detects whether the daily reminder is due only once per day", () => {
    const now = new Date("2026-07-06T09:30:00");

    expect(shouldSendDailyReminder(now, "09:00", "")).toBe(true);
    expect(shouldSendDailyReminder(now, "10:00", "")).toBe(false);
    expect(shouldSendDailyReminder(now, "09:00", "2026-07-06")).toBe(false);
  });

  it("calculates the next reminder delay", () => {
    const before = new Date("2026-07-06T08:30:00");
    const after = new Date("2026-07-06T09:30:00");

    expect(getNextReminderDelayMs(before, "09:00", "")).toBe(30 * 60 * 1000);
    expect(getNextReminderDelayMs(after, "09:00", "")).toBe(0);
    expect(getNextReminderDelayMs(after, "09:00", "2026-07-06")).toBe(23.5 * 60 * 60 * 1000);
  });

  it("respects selected reminder weekdays", () => {
    const mondayBefore = new Date("2026-07-06T08:30:00");
    const mondayAfter = new Date("2026-07-06T09:30:00");

    expect(shouldSendDailyReminder(mondayBefore, "09:00", "", [2])).toBe(false);
    expect(getNextReminderDelayMs(mondayBefore, "09:00", "", [2])).toBe(24.5 * 60 * 60 * 1000);
    expect(getNextReminderDelayMs(mondayAfter, "09:00", "2026-07-06", [1, 3])).toBe(47.5 * 60 * 60 * 1000);
  });

  it("normalizes and toggles reminder weekdays without empty schedules", () => {
    expect(normalizeReminderDays([7, 1, 1, 9])).toEqual([1, 7]);
    expect(normalizeReminderDays([])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(toggleReminderDay([1, 2], 2)).toEqual([1]);
    expect(toggleReminderDay([1], 1)).toEqual([1]);
    expect(toggleReminderDay([1], 3)).toEqual([1, 3]);
  });

  it("describes selected reminder weekdays", () => {
    expect(getReminderScheduleCopy([1, 2, 3, 4, 5, 6, 7])).toBe("каждый день");
    expect(getReminderScheduleCopy([1, 2, 3, 4, 5])).toBe("по будням");
    expect(getReminderScheduleCopy([6, 7])).toBe("по выходным");
    expect(getReminderScheduleCopy([1, 3, 5])).toBe("Пн, Ср, Пт");
  });

  it("summarizes the next active reminder", () => {
    const state = createEmptyState("2026-07-06");
    state.settings.remindersEnabled = true;
    state.settings.reminderTime = "09:00";
    state.settings.reviewReminderEnabled = true;
    state.settings.reviewReminderTime = "21:30";

    expect(getNextReminderSummary(state.settings, new Date("2026-07-06T08:30:00"))).toBe("План дня: сегодня в 09:00");

    state.settings.reminderLastDate = "2026-07-06";
    expect(getNextReminderSummary(state.settings, new Date("2026-07-06T09:30:00"))).toBe("Итог дня: сегодня в 21:30");

    state.settings.reviewReminderEnabled = false;
    expect(getNextReminderSummary(state.settings, new Date("2026-07-06T09:30:00"))).toBe("План дня: завтра в 09:00");
  });

  it("explains browser notification permission states", () => {
    expect(getNotificationPermissionCopy("default", false).label).toBe("нужно разрешение");
    expect(getNotificationPermissionCopy("granted", true).hint).toBe("Напоминания включены и работают локально на этом устройстве.");
    expect(getNotificationPermissionCopy("denied", false).label).toBe("запрещены");
    expect(getNotificationPermissionCopy("unsupported", false).hint).toBe("Этот браузер не поддерживает уведомления.");
  });

  it("prevents an immediate duplicate reminder when enabling after reminder time", () => {
    expect(getReminderLastDateAfterEnable(new Date("2026-07-06T08:30:00"), "09:00")).toBe("");
    expect(getReminderLastDateAfterEnable(new Date("2026-07-06T09:30:00"), "09:00")).toBe("2026-07-06");
  });

  it("allows same-day rescheduling when time moves into the future", () => {
    const now = new Date("2026-07-06T09:30:00");

    expect(getReminderLastDateAfterTimeChange("2026-07-06", "18:00", now)).toBe("");
    expect(getReminderLastDateAfterTimeChange("2026-07-06", "09:00", now)).toBe("2026-07-06");
    expect(getReminderLastDateAfterTimeChange("2026-07-05", "18:00", now)).toBe("2026-07-05");
  });

  it("snoozes only enabled reminders for the selected day", () => {
    const state = createEmptyState("2026-07-06");
    state.settings.remindersEnabled = true;
    state.settings.reviewReminderEnabled = false;
    state.settings.reminderLastDate = "";
    state.settings.reviewReminderLastDate = "2026-07-05";

    const settings = snoozeRemindersForDate(state.settings, "2026-07-06");

    expect(settings.reminderLastDate).toBe("2026-07-06");
    expect(settings.reviewReminderLastDate).toBe("2026-07-05");
  });

  it("builds a contextual daily reminder body", () => {
    const state = createEmptyState("2026-07-06");
    state.tasks["2026-07-06"] = [createTask("Open task", false), createTask("Closed task", true)];
    state.habits = [
      { id: "habit-1", title: "Walk", completions: {} },
      { id: "habit-2", title: "Water", completions: { "2026-07-06": true } },
    ];

    expect(buildDailyReminderBody(state, "2026-07-06")).toBe("На сегодня осталось: 1 задача и 1 привычка.");
  });

  it("builds a completion reminder body when the day is closed", () => {
    const state = createEmptyState("2026-07-06");
    state.tasks["2026-07-06"] = [createTask("Closed task", true)];
    state.habits = [{ id: "habit-1", title: "Walk", completions: { "2026-07-06": true } }];

    expect(buildDailyReminderBody(state, "2026-07-06")).toBe("Все на сегодня закрыто. Можно оставить короткий итог дня.");
  });

  it("builds a review reminder body for the evening ritual", () => {
    const state = createEmptyState("2026-07-06");
    state.tasks["2026-07-06"] = [createTask("Closed task", true)];

    expect(buildReviewReminderBody(state, "2026-07-06")).toBe("Закройте день: отметьте настроение и запишите итог после 1 закрытой задачи.");

    state.dayLogs["2026-07-06"] = { sleep: 7, energy: 4, mood: 4, summary: "Done" };
    expect(buildReviewReminderBody(state, "2026-07-06")).toBe("Итог дня уже есть. Можно быстро проверить задачи и закрыть вечер.");
  });

  it("skips reminders when the relevant day work is already closed", () => {
    const state = createEmptyState("2026-07-06");
    state.tasks["2026-07-06"] = [createTask("Closed task", true)];
    state.habits = [{ id: "habit-1", title: "Walk", completions: { "2026-07-06": true } }];

    expect(shouldSkipReminderForDay(state, "2026-07-06", "plan")).toBe(true);

    state.habits[0].completions["2026-07-06"] = false;
    expect(shouldSkipReminderForDay(state, "2026-07-06", "plan")).toBe(false);

    state.habits = [];
    state.tasks["2026-07-07"] = [];
    expect(shouldSkipReminderForDay(state, "2026-07-07", "plan")).toBe(false);

    state.dayLogs["2026-07-06"] = { sleep: 7, energy: 4, mood: 4, summary: "Done" };
    expect(shouldSkipReminderForDay(state, "2026-07-06", "review")).toBe(true);
  });

  it("formats Russian count forms", () => {
    const forms: [string, string, string] = ["задача", "задачи", "задач"];

    expect(formatRuCount(1, forms)).toBe("1 задача");
    expect(formatRuCount(2, forms)).toBe("2 задачи");
    expect(formatRuCount(5, forms)).toBe("5 задач");
    expect(formatRuCount(11, forms)).toBe("11 задач");
    expect(formatRuCount(21, forms)).toBe("21 задача");
  });
});

describe("PWA readiness", () => {
  it("summarizes install and offline runtime state", () => {
    const items = getPwaReadinessItems({
      secureContext: true,
      standalone: false,
      serviceWorkerSupported: true,
      serviceWorkerControlled: false,
      online: true,
    });

    expect(items.map((item) => item.value)).toEqual(["готов", "в браузере", "после перезапуска", "online"]);
    expect(items.map((item) => item.ok)).toEqual([true, false, false, true]);
  });

  it("marks installed offline-ready PWA state as ready", () => {
    const items = getPwaReadinessItems({
      secureContext: true,
      standalone: true,
      serviceWorkerSupported: true,
      serviceWorkerControlled: true,
      online: false,
    });

    expect(items.map((item) => item.value)).toEqual(["готов", "открыто как PWA", "кэш активен", "offline"]);
    expect(items.every((item) => item.ok)).toBe(true);
  });

  it("describes the install action for browser and standalone modes", () => {
    const browserStatus = {
      secureContext: true,
      standalone: false,
      serviceWorkerSupported: true,
      serviceWorkerControlled: true,
      online: true,
    };

    expect(getPwaInstallActionCopy(browserStatus, true)).toMatchObject({ label: "Установить PWA", enabled: true });
    expect(getPwaInstallActionCopy(browserStatus, false)).toMatchObject({ label: "Установить через браузер", enabled: false });
    expect(getPwaInstallActionCopy({ ...browserStatus, standalone: true }, true)).toMatchObject({ label: "Уже установлено", enabled: false });
  });
});

describe("planner deep links", () => {
  it("parses notification deep links safely", () => {
    expect(parsePlannerDeepLink("?tab=today&focus=summary")).toEqual({ tab: "today", focus: "summary", action: "" });
    expect(parsePlannerDeepLink("tab=habits")).toEqual({ tab: "habits", focus: "", action: "" });
    expect(parsePlannerDeepLink("?tab=today&action=snooze-reminders")).toEqual({ tab: "today", focus: "", action: "snooze-reminders" });
    expect(parsePlannerDeepLink("?tab=unknown&focus=tasks&action=delete")).toEqual({ tab: "today", focus: "", action: "" });
  });
});

describe("global search", () => {
  it("finds tasks, goals, summaries, and habits across stored planner data", () => {
    const state = createEmptyState("2026-07-06");
    state.tasks["2026-07-07"] = [createTask("Pay clinic invoice")];
    state.tasks["2026-08-01"] = [createTask("Book clinic visit")];
    state.weeklyGoals["2026-07-06"] = [{ id: "goal-1", title: "Choose clinic schedule", done: false }];
    state.dayLogs["2026-07-08"] = { sleep: 7, energy: 3, mood: 4, summary: "Called the clinic and confirmed details" };
    state.habits = [{ id: "habit-1", title: "Clinic rehab walk", completions: {} }];

    const results = searchPlannerState(state, "clinic");

    expect(results.map((result) => result.kind)).toEqual(["task", "task", "goal", "summary", "habit"]);
    expect(results.map((result) => result.title)).toEqual([
      "Pay clinic invoice",
      "Book clinic visit",
      "Choose clinic schedule",
      "Called the clinic and confirmed details",
      "Clinic rehab walk",
    ]);
  });

  it("returns an empty result for blank queries", () => {
    expect(searchPlannerState(createEmptyState("2026-07-06"), "   ")).toEqual([]);
  });
});

describe("markdown export", () => {
  it("builds a readable weekly snapshot", () => {
    const state = createEmptyState("2026-07-06");
    const days = getWeekDays("2026-07-06");
    state.weeklyGoals["2026-07-06"] = [{ id: "goal-1", title: "Close weekly review", done: true }];
    state.tasks[days[0]] = [createTask("Plan Monday", false)];
    state.tasks[days[1]] = [createTask("Done task", true)];
    state.habits = [{ id: "habit-1", title: "Walk", completions: { [days[0]]: true, [days[1]]: true } }];
    state.dayLogs[days[0]] = { sleep: 7, energy: 4, mood: 4, summary: "Good start" };

    const markdown = buildWeekMarkdown(state, "2026-07-06");

    expect(markdown).toContain("# NotPlanGo · неделя 2026-07-06");
    expect(markdown).toContain("- [x] Close weekly review");
    expect(markdown).toContain("- [ ] Plan Monday");
    expect(markdown).toContain("- [x] Done task");
    expect(markdown).toContain("- Walk: 2/7");
    expect(markdown).toContain("- 2026-07-06: Good start");
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
    expect(normalized.settings.remindersEnabled).toBe(false);
    expect(normalized.settings.reminderDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(normalized.settings.reminderTime).toBe("09:00");
    expect(normalized.settings.reminderLastDate).toBe("");
    expect(normalized.settings.reviewReminderEnabled).toBe(false);
    expect(normalized.settings.reviewReminderTime).toBe("21:30");
    expect(normalized.settings.reviewReminderLastDate).toBe("");
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
