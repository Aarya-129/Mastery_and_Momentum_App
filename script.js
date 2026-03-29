const App = (() => {
  const state = {
    dashboard: null,
    selectedDate: new Date().toISOString().slice(0, 10),
    editingTaskId: null,
    toastTimer: null,
    notificationPermission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  };

  const els = {};

  const categories = {
    "deep-work": "Deep work",
    health: "Health",
    study: "Study",
    career: "Career",
    reflection: "Reflection",
  };

  const Api = {
    async request(path, options = {}) {
      const response = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Request failed." }));
        throw new Error(error.error || "Request failed.");
      }
      return response.json();
    },
    getDashboard(date) { return this.request(`/api/dashboard?date=${date}`); },
    createTask(payload) { return this.request("/api/tasks", { method: "POST", body: JSON.stringify(payload) }); },
    updateTask(id, payload) { return this.request(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); },
    deleteTask(id) { return this.request(`/api/tasks/${id}`, { method: "DELETE" }); },
    updateHabit(id, completed) { return this.request(`/api/habits/${id}`, { method: "PATCH", body: JSON.stringify({ completed, date: state.selectedDate }) }); },
    createNote(text) { return this.request("/api/notes", { method: "POST", body: JSON.stringify({ text, date: state.selectedDate }) }); },
    deleteNote(id) { return this.request(`/api/notes/${id}`, { method: "DELETE" }); },
    updateProgress(key, delta) { return this.request("/api/progress", { method: "PATCH", body: JSON.stringify({ key, delta }) }); },
    updateReminder(key, value) { return this.request("/api/settings/reminders", { method: "PATCH", body: JSON.stringify({ key, value }) }); },
  };

  const Time = {
    now() { return new Date(); },
    formatDate(dateString) {
      return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    },
    parseMinutes(value) {
      const [hours, minutes] = value.split(":").map(Number);
      return hours * 60 + minutes;
    },
    formatTime(value) {
      const [hours, minutes] = value.split(":").map(Number);
      return new Date(2026, 0, 1, hours, minutes).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    },
    duration(start, end) { return this.parseMinutes(end) - this.parseMinutes(start); },
    shiftDate(dateString, days) {
      const date = new Date(`${dateString}T00:00:00`);
      date.setDate(date.getDate() + days);
      return date.toISOString().slice(0, 10);
    },
    isToday(dateString) {
      return dateString === new Date().toISOString().slice(0, 10);
    },
    countdown(task) {
      if (!Time.isToday(state.selectedDate)) return "Browse day";
      const now = this.now();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = this.parseMinutes(task.startTime);
      const endMinutes = this.parseMinutes(task.endTime);
      if (currentMinutes < startMinutes) return `${startMinutes - currentMinutes} min until start`;
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) return `${endMinutes - currentMinutes} min remaining`;
      return "Completed window";
    },
    taskStatus(task) {
      if (task.completed) return "done";
      if (!Time.isToday(state.selectedDate)) return "planned";
      const now = this.now();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = this.parseMinutes(task.startTime);
      const endMinutes = this.parseMinutes(task.endTime);
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) return "active";
      if (currentMinutes < startMinutes) return "upcoming";
      return "missed";
    },
  };

  const Notifications = {
    async requestPermission() {
      if (typeof Notification === "undefined") return showToast("Notifications are not supported in this browser.");
      const permission = await Notification.requestPermission();
      state.notificationPermission = permission;
      renderReminderPanel();
      showToast(permission === "granted" ? "Notifications enabled." : "Notifications are blocked. You can re-enable them in browser settings.");
    },
    async notify(title, body) {
      if (state.notificationPermission !== "granted") return;
      const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (registration) return registration.showNotification(title, { body, icon: "icons/app-icon.svg", badge: "icons/app-icon.svg" });
      new Notification(title, { body });
    },
    async checkUpcomingTasks() {
      if (!state.dashboard || !Time.isToday(state.selectedDate) || state.notificationPermission !== "granted") return;
      if (!state.dashboard.settings.remindersEnabled) return;
      const currentMinutes = Time.now().getHours() * 60 + Time.now().getMinutes();
      for (const task of state.dashboard.day.tasks) {
        if (task.completed || !task.reminderEnabled) continue;
        const triggerMinutes = Time.parseMinutes(task.startTime) - Number(task.reminderMinutesBefore || 0);
        const notificationKey = `mm-alert:${state.selectedDate}:${task.id}:${currentMinutes}`;
        if (currentMinutes === triggerMinutes && !sessionStorage.getItem(notificationKey)) {
          sessionStorage.setItem(notificationKey, "1");
          await this.notify(task.title, `${Time.formatTime(task.startTime)} to ${Time.formatTime(task.endTime)}`);
          showToast(`Reminder sent for ${task.title}.`);
        }
      }
    },
  };

  function cacheElements() {
    els.syncStatus = document.getElementById("sync-status");
    els.notificationBtn = document.getElementById("notification-btn");
    els.heroDate = document.getElementById("hero-date");
    els.todayLabel = document.getElementById("today-label");
    els.currentFocusTitle = document.getElementById("current-focus-title");
    els.currentFocusMeta = document.getElementById("current-focus-meta");
    els.currentFocusTime = document.getElementById("current-focus-time");
    els.currentFocusWindow = document.getElementById("current-focus-window");
    els.currentFocusState = document.getElementById("current-focus-state");
    els.statsGrid = document.getElementById("stats-grid");
    els.scheduleList = document.getElementById("schedule-list");
    els.habitList = document.getElementById("habit-list");
    els.progressList = document.getElementById("progress-list");
    els.noteList = document.getElementById("note-list");
    els.toggleList = document.getElementById("toggle-list");
    els.taskForm = document.getElementById("task-form");
    els.noteForm = document.getElementById("note-form");
    els.refreshBtn = document.getElementById("refresh-btn");
    els.toast = document.getElementById("toast");
    els.datePicker = document.getElementById("date-picker");
    els.prevDayBtn = document.getElementById("prev-day-btn");
    els.nextDayBtn = document.getElementById("next-day-btn");
    els.todayBtn = document.getElementById("today-btn");
    els.taskFormTitle = document.getElementById("task-form-title");
    els.taskFormSubtitle = document.getElementById("task-form-subtitle");
    els.cancelEditBtn = document.getElementById("cancel-edit-btn");
    els.taskSubmitBtn = document.getElementById("task-submit-btn");
    els.taskTitle = document.getElementById("task-title");
    els.taskStart = document.getElementById("task-start");
    els.taskEnd = document.getElementById("task-end");
    els.taskCategory = document.getElementById("task-category");
    els.taskReminder = document.getElementById("task-reminder");
    els.taskDescription = document.getElementById("task-description");
  }

  async function loadDashboard() {
    els.syncStatus.textContent = "Syncing schedule...";
    try {
      state.dashboard = await Api.getDashboard(state.selectedDate);
      state.notificationPermission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
      render();
      els.syncStatus.textContent = "API connected";
    } catch (error) {
      els.syncStatus.textContent = "Backend unavailable";
      showToast(error.message);
    }
  }

  function render() {
    if (!state.dashboard) return;
    els.datePicker.value = state.selectedDate;
    renderHero();
    renderStats();
    renderSchedule();
    renderHabits();
    renderProgress();
    renderNotes();
    renderReminderPanel();
    renderTaskFormState();
  }

  function renderHero() {
    const { profile, day } = state.dashboard;
    const activeTask = day.tasks.find((task) => Time.taskStatus(task) === "active");
    const nextTask = day.tasks.find((task) => ["upcoming", "planned"].includes(Time.taskStatus(task)));
    els.todayLabel.textContent = Time.isToday(day.date) ? `Today for ${profile.name}` : `Viewing ${profile.name}'s plan`;
    els.heroDate.textContent = Time.formatDate(day.date);
    if (activeTask) {
      els.currentFocusTitle.textContent = activeTask.title;
      els.currentFocusMeta.textContent = activeTask.description || "Stay in the block until the current window closes.";
      els.currentFocusTime.textContent = Time.countdown(activeTask);
      els.currentFocusWindow.textContent = `${Time.formatTime(activeTask.startTime)} to ${Time.formatTime(activeTask.endTime)}`;
      els.currentFocusState.textContent = "Active now";
    } else if (nextTask) {
      els.currentFocusTitle.textContent = nextTask.title;
      els.currentFocusMeta.textContent = nextTask.description || "This is the next scheduled focus block.";
      els.currentFocusTime.textContent = Time.countdown(nextTask);
      els.currentFocusWindow.textContent = `${Time.formatTime(nextTask.startTime)} to ${Time.formatTime(nextTask.endTime)}`;
      els.currentFocusState.textContent = Time.isToday(day.date) ? "Upcoming" : "Planned";
    } else {
      els.currentFocusTitle.textContent = "No block selected";
      els.currentFocusMeta.textContent = "Create a task for this day or choose another date.";
      els.currentFocusTime.textContent = Time.isToday(day.date) ? "Reset" : "Plan";
      els.currentFocusWindow.textContent = Time.isToday(day.date) ? "Review notes and prep tomorrow" : "No scheduled window yet";
      els.currentFocusState.textContent = "Open day";
    }
  }

  function renderStats() {
    const { summary, tasks, habits, notes } = state.dashboard.day;
    const stats = [
      { label: "Tasks complete", value: `${summary.completedTasks}/${tasks.length}` },
      { label: "Habits locked", value: `${summary.completedHabits}/${habits.length}` },
      { label: "Current streak", value: state.dashboard.activity.streak },
      { label: "Notes captured", value: notes.length },
    ];
    els.statsGrid.innerHTML = stats.map((stat) => `<article class="stat-card"><strong>${stat.value}</strong><span>${stat.label}</span></article>`).join("");
  }

  function renderSchedule() {
    const items = state.dashboard.day.tasks;
    if (!items.length) {
      els.scheduleList.innerHTML = '<div class="empty-state">No tasks scheduled yet. Add your first block above.</div>';
      return;
    }
    els.scheduleList.innerHTML = items.map((task) => {
      const status = Time.taskStatus(task);
      const tone = status === "active" ? "active" : task.completed ? "done" : "upcoming";
      return `
        <article class="schedule-item" data-status="${status}">
          <div class="schedule-meta">
            <div>
              <span class="schedule-time">${Time.formatTime(task.startTime)} to ${Time.formatTime(task.endTime)}</span>
              <h3>${escapeHtml(task.title)}</h3>
              <p>${escapeHtml(task.description || "No extra notes for this block.")}</p>
            </div>
            <span class="chip" data-tone="${tone}">${status}</span>
          </div>
          <div class="schedule-actions">
            <div class="inline-actions">
              <span class="chip">${categories[task.category] || task.category}</span>
              <span class="chip">${Time.duration(task.startTime, task.endTime)} min</span>
              <span class="chip">Reminder ${task.reminderMinutesBefore} min</span>
            </div>
            <div class="inline-actions">
              <button type="button" data-action="edit-task" data-id="${task.id}">Edit</button>
              <button type="button" data-action="toggle-task" data-id="${task.id}">${task.completed ? "Mark pending" : "Mark complete"}</button>
              ${task.isCustom ? `<button class="danger" type="button" data-action="delete-task" data-id="${task.id}">Delete</button>` : ""}
            </div>
          </div>
        </article>`;
    }).join("");
  }

  function renderHabits() {
    els.habitList.innerHTML = state.dashboard.day.habits.map((habit) => `
      <article class="habit-item">
        <div>
          <strong>${escapeHtml(habit.label)}</strong>
          <p class="subdued">${escapeHtml(habit.timeLabel)}</p>
        </div>
        <button type="button" class="${habit.completed ? "is-complete" : ""}" data-action="toggle-habit" data-id="${habit.id}">${habit.completed ? "Done" : "Pending"}</button>
      </article>`).join("");
  }

  function renderProgress() {
    const { progress, goals } = state.dashboard;
    els.progressList.innerHTML = Object.entries(goals).map(([key, goal]) => {
      const current = progress[key] || 0;
      const percent = Math.min(100, Math.round((current / goal.target) * 100));
      return `
        <article class="progress-card">
          <div class="progress-row">
            <div>
              <strong>${escapeHtml(goal.label)}</strong>
              <span class="meta-copy">${current} / ${goal.target}</span>
              <div class="progress-bar"><span style="width:${percent}%"></span></div>
            </div>
            <div class="progress-controls">
              <button type="button" data-action="progress-down" data-key="${key}">-</button>
              <span>${current}</span>
              <button type="button" data-action="progress-up" data-key="${key}">+</button>
            </div>
          </div>
        </article>`;
    }).join("");
  }

  function renderNotes() {
    const notes = state.dashboard.day.notes;
    if (!notes.length) {
      els.noteList.innerHTML = '<div class="empty-state">No notes yet for this day. Save a reflection after your next block.</div>';
      return;
    }
    els.noteList.innerHTML = notes.map((note) => `
      <article class="note-card">
        <div class="note-meta">
          <strong>${new Date(note.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</strong>
          <button type="button" data-action="delete-note" data-id="${note.id}">Delete</button>
        </div>
        <p>${escapeHtml(note.text)}</p>
      </article>`).join("");
  }

  function renderReminderPanel() {
    if (!state.dashboard) return;
    const { settings } = state.dashboard;
    const permissionLabel = state.notificationPermission === "granted" ? "Notifications ready" : state.notificationPermission === "denied" ? "Notifications blocked" : state.notificationPermission === "unsupported" ? "Notifications unsupported" : "Notifications off";
    els.notificationBtn.textContent = state.notificationPermission === "granted" ? "Notifications enabled" : "Enable notifications";
    const rows = [
      { key: "remindersEnabled", label: "Global reminders", description: `Browser status: ${permissionLabel}`, value: settings.remindersEnabled },
      { key: "morningReview", label: "Morning review reminder", description: "Nudges the first daily block sequence.", value: settings.morningReview },
      { key: "shutdownReminder", label: "Shutdown reminder", description: "Pushes your end-of-day review and reset.", value: settings.shutdownReminder },
    ];
    els.toggleList.innerHTML = rows.map((row) => `
      <div class="toggle-row">
        <div>
          <strong>${row.label}</strong>
          <p class="subdued">${row.description}</p>
        </div>
        <button type="button" class="${row.value ? "is-on" : ""}" data-action="toggle-reminder" data-key="${row.key}">${row.value ? "On" : "Off"}</button>
      </div>`).join("");
  }

  function renderTaskFormState() {
    const editingTask = state.editingTaskId ? state.dashboard.day.tasks.find((task) => task.id === state.editingTaskId) : null;
    els.taskFormTitle.textContent = editingTask ? "Edit task" : "Create task";
    els.taskFormSubtitle.textContent = editingTask ? "Update this block for the selected day." : "Add a block to the selected day.";
    els.taskSubmitBtn.textContent = editingTask ? "Save changes" : "Create task";
    els.cancelEditBtn.classList.toggle("is-hidden", !editingTask);
  }

  function resetTaskForm() {
    state.editingTaskId = null;
    els.taskForm.reset();
    renderTaskFormState();
  }

  function populateTaskForm(task) {
    state.editingTaskId = task.id;
    els.taskTitle.value = task.title;
    els.taskStart.value = task.startTime;
    els.taskEnd.value = task.endTime;
    els.taskCategory.value = task.category;
    els.taskReminder.value = String(task.reminderMinutesBefore || 0);
    els.taskDescription.value = task.description || "";
    renderTaskFormState();
    els.taskTitle.focus();
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
  }

  function escapeHtml(text) {
    return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();
    const form = new FormData(els.taskForm);
    const payload = {
      date: state.selectedDate,
      title: String(form.get("title")).trim(),
      startTime: String(form.get("startTime")),
      endTime: String(form.get("endTime")),
      category: String(form.get("category")),
      description: String(form.get("description")).trim(),
      reminderMinutesBefore: Number(form.get("reminderMinutesBefore")),
    };
    if (!payload.title) return showToast("Task title is required.");
    if (Time.parseMinutes(payload.endTime) <= Time.parseMinutes(payload.startTime)) return showToast("End time must be after the start time.");
    try {
      if (state.editingTaskId) {
        await Api.updateTask(state.editingTaskId, payload);
        showToast("Task updated.");
      } else {
        await Api.createTask(payload);
        showToast("Task created.");
      }
      resetTaskForm();
      await loadDashboard();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function handleNoteSubmit(event) {
    event.preventDefault();
    const text = String(new FormData(els.noteForm).get("text")).trim();
    if (!text) return showToast("Write a note before saving.");
    try {
      await Api.createNote(text);
      els.noteForm.reset();
      await loadDashboard();
      showToast("Note saved.");
    } catch (error) {
      showToast(error.message);
    }
  }

  async function handleActionClick(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    const { action, id, key } = trigger.dataset;
    try {
      if (action === "edit-task") {
        const task = state.dashboard.day.tasks.find((item) => item.id === id);
        if (task) populateTaskForm(task);
        return;
      }
      if (action === "toggle-task") {
        const task = state.dashboard.day.tasks.find((item) => item.id === id);
        await Api.updateTask(id, { completed: !task.completed, date: state.selectedDate });
      }
      if (action === "delete-task") {
        if (state.editingTaskId === id) resetTaskForm();
        await Api.deleteTask(id);
      }
      if (action === "toggle-habit") {
        const habit = state.dashboard.day.habits.find((item) => item.id === id);
        await Api.updateHabit(id, !habit.completed);
      }
      if (action === "delete-note") await Api.deleteNote(id);
      if (action === "progress-up") await Api.updateProgress(key, 1);
      if (action === "progress-down") await Api.updateProgress(key, -1);
      if (action === "toggle-reminder") await Api.updateReminder(key, !Boolean(state.dashboard.settings[key]));
      await loadDashboard();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function switchDate(nextDate) {
    state.selectedDate = nextDate;
    resetTaskForm();
    await loadDashboard();
  }

  function wireEvents() {
    els.taskForm.addEventListener("submit", handleTaskSubmit);
    els.noteForm.addEventListener("submit", handleNoteSubmit);
    els.notificationBtn.addEventListener("click", () => Notifications.requestPermission());
    els.refreshBtn.addEventListener("click", () => loadDashboard());
    els.prevDayBtn.addEventListener("click", () => switchDate(Time.shiftDate(state.selectedDate, -1)));
    els.nextDayBtn.addEventListener("click", () => switchDate(Time.shiftDate(state.selectedDate, 1)));
    els.todayBtn.addEventListener("click", () => switchDate(new Date().toISOString().slice(0, 10)));
    els.datePicker.addEventListener("change", (event) => switchDate(event.target.value));
    els.cancelEditBtn.addEventListener("click", resetTaskForm);
    document.body.addEventListener("click", handleActionClick);
  }

  function setupServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/service-worker.js").catch(() => showToast("Service worker registration failed."));
      });
    }
  }

  function startScheduleTicker() {
    setInterval(async () => {
      if (!state.dashboard) return;
      renderHero();
      renderSchedule();
      await Notifications.checkUpcomingTasks();
    }, 30000);
  }

  async function init() {
    cacheElements();
    wireEvents();
    setupServiceWorker();
    await loadDashboard();
    startScheduleTicker();
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", App.init);
