
/* =========================================================
   PennyPilot — Smart Expense Tracker
   Supabase authentication, expenses, budget and analytics
   Keeps the existing HTML and CSS unchanged.
   ========================================================= */

const SUPABASE_URL = "https://dqcjhbiduogttljgfkau.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_eHuDa1uoMvWdv-hqAWYviA_YrnQoBhg";

const MONTHLY_BUDGET = 10000;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let currentUser = null;
let expenses = [];
let expenseChart = null;
let authSubscription = null;
let authRequestInProgress = false;

const $ = (id) => document.getElementById(id);

function showMessage(message, type = "info") {
  let element = $("appMessage");

  if (!element) {
    element = document.createElement("p");
    element.id = "appMessage";
    element.setAttribute("role", "status");

    const parent = $("authSection") || $("appSection") ||
      document.querySelector("main") || document.body;

    parent.prepend(element);
  }

  element.textContent = message;
  element.dataset.type = type;

  // Preserve the existing stylesheet's appearance.
  element.style.padding = "10px";
  element.style.margin = "10px 0";
  element.style.borderRadius = "8px";

  if (type === "error") {
    element.style.background = "#fee2e2";
    element.style.color = "#991b1b";
  } else if (type === "success") {
    element.style.background = "#dcfce7";
    element.style.color = "#166534";
  } else {
    element.style.background = "#e0f2fe";
    element.style.color = "#075985";
  }

  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    if (element.isConnected) element.textContent = "";
  }, 5000);
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function getToday() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function getBudget() {
  if (!currentUser) return MONTHLY_BUDGET;

  const saved = localStorage.getItem(
    `pennypilot_budget_${currentUser.id}`
  );

  return saved === null ? MONTHLY_BUDGET : Math.max(0, Number(saved) || 0);
}

function showAuthenticatedApp(isAuthenticated) {
  const authSection = $("authSection");
  const resetSection = $("passwordResetSection");
  const appSection = $("appSection");

  if (authSection) {
    authSection.hidden = isAuthenticated;
    authSection.style.display = isAuthenticated ? "none" : "";
  }

  if (resetSection) {
    resetSection.hidden = true;
    resetSection.style.display = "none";
  }

  if (appSection) {
    appSection.hidden = !isAuthenticated;
    appSection.style.display = isAuthenticated ? "" : "none";
  }

  setText("userEmail", currentUser?.email || "");
}

/* ==================== AUTHENTICATION ==================== */

async function signIn(event) {
  if (event) event.preventDefault();

  if (authRequestInProgress) return;

  const email = $("authEmail")?.value.trim();
  const password = $("authPassword")?.value;

  if (!email || !password) {
    showMessage("Enter your email and password.", "error");
    return;
  }

  authRequestInProgress = true;
  const button = $("signInButton");
  if (button) button.disabled = true;

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    currentUser = data.user;
    showAuthenticatedApp(true);
    showMessage("Signed in successfully!", "success");
    await loadExpenses();
  } catch (error) {
    console.error("Sign-in failed:", error);
    showMessage(error.message || "Sign-in failed. Please try again.", "error");
  } finally {
    authRequestInProgress = false;
    if (button) button.disabled = false;
  }
}

async function signUp() {
  if (authRequestInProgress) return;

  const email = $("authEmail")?.value.trim();
  const password = $("authPassword")?.value;

  if (!email || !password) {
    showMessage("Enter your email and password to create an account.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("Your password must contain at least 6 characters.", "error");
    return;
  }

  authRequestInProgress = true;
  const button = $("signUpButton");
  if (button) button.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    if (data.session) {
      currentUser = data.user;
      showAuthenticatedApp(true);
      showMessage("Account created successfully!", "success");
      await loadExpenses();
    } else {
      showMessage(
        "Account created. Check your email to confirm your account, then sign in.",
        "success"
      );
    }
  } catch (error) {
    console.error("Sign-up failed:", error);
    showMessage(error.message || "Could not create your account.", "error");
  } finally {
    authRequestInProgress = false;
    if (button) button.disabled = false;
  }
}

async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    currentUser = null;
    expenses = [];

    if (expenseChart) {
      expenseChart.destroy();
      expenseChart = null;
    }

    showAuthenticatedApp(false);
    renderEverything();
    showMessage("You have signed out.", "success");
  } catch (error) {
    console.error("Sign-out failed:", error);
    showMessage(error.message || "Could not sign out.", "error");
  }
}

function showPasswordReset() {
  const authSection = $("authSection");
  const resetSection = $("passwordResetSection");

  if (authSection) {
    authSection.hidden = true;
    authSection.style.display = "none";
  }

  if (resetSection) {
    resetSection.hidden = false;
    resetSection.style.display = "";
  }
}

function showLogin() {
  const resetSection = $("passwordResetSection");
  const authSection = $("authSection");

  if (resetSection) {
    resetSection.hidden = true;
    resetSection.style.display = "none";
  }

  if (authSection) {
    authSection.hidden = false;
    authSection.style.display = "";
  }
}

async function sendPasswordReset() {
  const email = $("authEmail")?.value.trim();

  if (!email) {
    showMessage("Enter your email address first.", "error");
    return;
  }

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(
      email,
      { redirectTo: window.location.origin + window.location.pathname }
    );

    if (error) throw error;

    showMessage("Check your email for the password-reset link.", "success");
  } catch (error) {
    console.error("Password reset request failed:", error);
    showMessage(error.message || "Could not send the reset email.", "error");
  }
}

async function saveNewPassword(event) {
  if (event) event.preventDefault();

  const password = $("newPassword")?.value;
  const confirmation = $("confirmNewPassword")?.value;

  if (!password || password.length < 6) {
    showMessage("Your new password must contain at least 6 characters.", "error");
    return;
  }

  if (password !== confirmation) {
    showMessage("The passwords do not match.", "error");
    return;
  }

  const button = $("saveNewPasswordButton");
  if (button) button.disabled = true;

  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;

    showMessage("Password updated successfully.", "success");

    $("resetPasswordForm")?.reset();
    showLogin();
  } catch (error) {
    console.error("Password update failed:", error);
    showMessage(
      error.message || "Could not update the password. Open the reset link again.",
      "error"
    );
  } finally {
    if (button) button.disabled = false;
  }
}

/* ==================== EXPENSES ==================== */

async function loadExpenses() {
  if (!currentUser) {
    expenses = [];
    renderEverything();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("expenses")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    expenses = data || [];
    renderEverything();
  } catch (error) {
    console.error("Loading expenses failed:", error);
    showMessage(
      "Could not load expenses. Check the Supabase table and security policies.",
      "error"
    );
  }
}

async function addExpense(event) {
  if (event) event.preventDefault();

  if (!currentUser) {
    showMessage("Please sign in first.", "error");
    return;
  }

  const title =
    $("expenseTitle")?.value.trim() ||
    $("expenseName")?.value.trim() || "";

  const amountValue = $("expenseAmount")?.value;
  const category = $("expenseCategory")?.value;
  const date = $("expenseDate")?.value || getToday();
  const description = $("expenseDescription")?.value.trim() || "";

  const amount = Number(amountValue);

  if (!title || !amountValue || !category || !date) {
    showMessage("Fill in the expense name, amount, category and date.", "error");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("Enter an amount greater than zero.", "error");
    return;
  }

  const button = $("expenseForm")?.querySelector('[type="submit"]');
  if (button) button.disabled = true;

  try {
    const { error } = await supabaseClient.from("expenses").insert({
      user_id: currentUser.id,
      title,
      amount,
      category,
      expense_date: date,
      description
    });

    if (error) throw error;

    $("expenseForm")?.reset();
    if ($("expenseDate")) $("expenseDate").value = getToday();

    showMessage("Expense added successfully!", "success");
    await loadExpenses();
  } catch (error) {
    console.error("Adding expense failed:", error);
    showMessage(error.message || "Could not add the expense.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteExpense(id) {
  if (!currentUser) return;
  if (!window.confirm("Delete this expense?")) return;

  try {
    const { error } = await supabaseClient
      .from("expenses")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    showMessage("Expense deleted.", "success");
    await loadExpenses();
  } catch (error) {
    console.error("Deleting expense failed:", error);
    showMessage(error.message || "Could not delete this expense.", "error");
  }
}

/* ==================== FILTERS AND HISTORY ==================== */

function getFilteredExpenses() {
  const search = (
    $("searchExpenses")?.value ||
    $("searchInput")?.value || ""
  ).trim().toLowerCase();

  const category =
    $("filterCategory")?.value ||
    $("categoryFilter")?.value || "";

  const month =
    $("filterMonth")?.value ||
    $("monthFilter")?.value || "";

  return expenses.filter((expense) => {
    const title = String(
      expense.title || expense.description || ""
    ).toLowerCase();

    const matchesSearch = !search || title.includes(search);
    const matchesCategory = !category || category === "All" ||
      expense.category === category;

    const expenseMonth = String(expense.expense_date || "").slice(0, 7);
    const matchesMonth = !month || expenseMonth === month;

    return matchesSearch && matchesCategory && matchesMonth;
  });
}

function renderExpenseList() {
  const list = $("expenseList");
  if (!list) return;

  const filtered = getFilteredExpenses();

  if (!filtered.length) {
    list.innerHTML = "<p>No expenses found. Add an expense to get started.</p>";
    return;
  }

  list.innerHTML = filtered.map((expense) => {
    const title = escapeHTML(expense.title || expense.description || "Expense");
    const category = escapeHTML(expense.category || "Other");
    const date = escapeHTML(String(expense.expense_date || "").slice(0, 10));

    return `
      <article class="transaction">
        <div class="transaction-details">
          <strong>${title}</strong>
          <p>${category} · ${date}</p>
        </div>
        <strong>${formatMoney(expense.amount)}</strong>
        <button type="button"
          class="delete-expense-button"
          data-delete-expense="${escapeHTML(expense.id)}"
          aria-label="Delete ${title}">Delete</button>
      </article>
    `;
  }).join("");
}

/* ==================== DASHBOARD TOTALS ==================== */

function getMonthExpenses() {
  const month = getToday().slice(0, 7);

  return expenses.filter((expense) =>
    String(expense.expense_date || "").slice(0, 7) === month
  );
}

function sumExpenses(items) {
  return items.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0
  );
}

function renderTotals() {
  const total = sumExpenses(expenses);
  const today = getToday();

  const todayTotal = sumExpenses(expenses.filter((expense) =>
    String(expense.expense_date || "").slice(0, 10) === today
  ));

  const monthTotal = sumExpenses(getMonthExpenses());

  // Each field is updated separately because each is a different summary.
  setText("totalExpenses", formatMoney(total));
  setText("todayExpenses", formatMoney(todayTotal));
  setText("monthlyExpenses", formatMoney(monthTotal));
  setText("expenseCount", String(expenses.length));

  // Support older versions of the dashboard if these elements exist.
  setText("totalSpent", formatMoney(total));
  setText("todayTotal", formatMoney(todayTotal));
  setText("monthlyTotal", formatMoney(monthTotal));
}

/* ==================== MONTHLY BUDGET ==================== */

function renderBudget() {
  const budget = getBudget();
  const spent = sumExpenses(getMonthExpenses());
  const remaining = budget - spent;
  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const progressWidth = Math.min(percentage, 100);

  setText("budgetAmount", formatMoney(budget));
  setText("budgetSpent", formatMoney(spent));
  setText("budgetRemaining", formatMoney(remaining));

  const progress = $("budgetProgress");

  if (progress) {
    progress.style.width = `${progressWidth}%`;
    progress.setAttribute("aria-valuenow", String(Math.round(progressWidth)));
  }

  const track = $("budgetProgressTrack") ||
    $("budget-track") || $("budgetTrack");

  if (track) {
    track.setAttribute("aria-valuenow", String(Math.round(progressWidth)));
  }

  const message = $("budgetMessage");

  if (message) {
    if (budget === 0) {
      message.textContent = "Set a monthly budget to track your spending.";
    } else if (remaining < 0) {
      message.textContent =
        `You are ${formatMoney(Math.abs(remaining))} over your monthly budget.`;
    } else {
      message.textContent =
        `${formatMoney(remaining)} remaining in your monthly budget.`;
    }
  }
}

function saveBudgetFromInput() {
  const input = $("budgetInput");

  if (!input || input.value.trim() === "") {
    showMessage("Enter a monthly budget.", "error");
    return;
  }

  const amount = Number(input.value);

  if (!Number.isFinite(amount) || amount < 0) {
    showMessage("Enter a valid monthly budget.", "error");
    return;
  }

  if (currentUser) {
    localStorage.setItem(
      `pennypilot_budget_${currentUser.id}`,
      String(amount)
    );
  }

  renderBudget();
  renderInsights();
  showMessage("Monthly budget saved on this device.", "success");
}

/* ==================== CATEGORY TOTALS AND CHART ==================== */

function getCategoryTotals() {
  return expenses.reduce((totals, expense) => {
    const category = expense.category || "Other";
    totals[category] = (totals[category] || 0) +
      Number(expense.amount || 0);
    return totals;
  }, {});
}

function renderCategoryTotals() {
  const container = $("categoryTotals");
  if (!container) return;

  const categories = Object.entries(getCategoryTotals())
    .sort((a, b) => b[1] - a[1]);

  if (!categories.length) {
    container.innerHTML = "<p>No category data yet.</p>";
    return;
  }

  container.innerHTML = categories.map(([category, amount]) => `
    <div class="category-total">
      <span>${escapeHTML(category)}</span>
      <strong>${formatMoney(amount)}</strong>
    </div>
  `).join("");
}

function renderChart() {
  const canvas = $("expenseChart");

  if (!canvas || typeof Chart === "undefined") return;

  if (expenseChart) {
    expenseChart.destroy();
    expenseChart = null;
  }

  const totals = getCategoryTotals();
  const labels = Object.keys(totals);

  if (!labels.length) return;

  expenseChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: Object.values(totals),
        backgroundColor: [
          "#22c55e", "#3b82f6", "#a855f7", "#f59e0b",
          "#ef4444", "#14b8a6", "#ec4899", "#64748b"
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.label}: ${formatMoney(context.raw)}`;
            }
          }
        }
      }
    }
  });
}

/* ==================== SPENDING INSIGHTS ==================== */

function renderInsights() {
  const container = $("insights");
  if (!container) return;

  if (!expenses.length) {
    container.textContent =
      "Add your first expense to see spending insights.";
    return;
  }

  const categories = Object.entries(getCategoryTotals())
    .sort((a, b) => b[1] - a[1]);

  const largest = [...expenses].sort(
    (a, b) => Number(b.amount || 0) - Number(a.amount || 0)
  )[0];

  const monthSpent = sumExpenses(getMonthExpenses());
  const budget = getBudget();

  const messages = [
    `Your highest-spending category is ${categories[0][0]} (${formatMoney(categories[0][1])}).`,
    `Your largest single expense is ${formatMoney(largest.amount)} for ${largest.title || largest.description || "an expense"}.`
  ];

  if (budget > 0) {
    const remaining = budget - monthSpent;

    messages.push(
      remaining < 0
        ? `You are ${formatMoney(Math.abs(remaining))} over your monthly budget.`
        : `You have ${formatMoney(remaining)} left in your monthly budget.`
    );
  }

  container.innerHTML = messages.map((message) =>
    `<p>${escapeHTML(message)}</p>`
  ).join("");
}

/* ==================== QUICK ADD AND VOICE ==================== */

function quickAddExpense(amount) {
  const input = $("expenseAmount");

  if (input) {
    input.value = String(amount);
    input.focus();
    showMessage(`${formatMoney(amount)} added to the amount field. Complete the form to save it.`);
  } else {
    showMessage("Expense amount field was not found.", "error");
  }
}

function startVoiceInput() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setText("voiceMessage", "Voice input is not supported by this browser.");
    showMessage("Voice input is not supported by this browser.", "error");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();

    // Put the recognized words in the expense title field.
    const titleInput = $("expenseTitle") || $("expenseName");

    if (titleInput) titleInput.value = transcript;

    setText("voiceMessage", `Heard: ${transcript}`);
    showMessage(`Heard: ${transcript}`, "success");
  };

  recognition.onerror = () => {
    setText("voiceMessage", "Could not recognize your voice. Please try again.");
    showMessage("Could not recognize your voice. Please try again.", "error");
  };

  recognition.start();
}

/* ==================== RENDER EVERYTHING ==================== */

function renderEverything() {
  renderTotals();
  renderBudget();
  renderExpenseList();
  renderCategoryTotals();
  renderChart();
  renderInsights();
}

/* ==================== AUTH SESSION ==================== */

async function handleAuthState(session) {
  const newUser = session?.user || null;
  const previousUserId = currentUser?.id || null;
  const newUserId = newUser?.id || null;

  currentUser = newUser;

  showAuthenticatedApp(Boolean(currentUser));

  if (!currentUser) {
    expenses = [];

    if (expenseChart) {
      expenseChart.destroy();
      expenseChart = null;
    }

    renderEverything();
    return;
  }

  if (previousUserId !== newUserId) {
    expenses = [];
  }

  await loadExpenses();
}

/* ==================== EVENT LISTENERS ==================== */

function addClickListener(id, callback) {
  const element = $(id);
  if (element) element.addEventListener("click", callback);
}

function initialisePennyPilot() {
  // IMPORTANT: handle the actual form submission to prevent page reload.
  const authForm = $("authForm");

  if (authForm) {
    authForm.addEventListener("submit", signIn);
  }

  // Do not also attach a click listener to the sign-in submit button.
  addClickListener("signUpButton", signUp);
  addClickListener("signOutButton", signOut);

  // Support alternate IDs without requiring HTML changes.
  addClickListener("logoutButton", signOut);

  addClickListener("forgotPasswordButton", showPasswordReset);
  addClickListener("cancelPasswordResetButton", showLogin);
  addClickListener("saveNewPasswordButton", saveNewPassword);

  const resetForm = $("resetPasswordForm");

  if (resetForm) {
    resetForm.addEventListener("submit", saveNewPassword);
  }

  // Expense form: attach only to form submission to avoid double inserts.
  const expenseForm = $("expenseForm");

  if (expenseForm) {
    expenseForm.addEventListener("submit", addExpense);
  }

  addClickListener("saveBudgetButton", saveBudgetFromInput);
  addClickListener("voiceButton", startVoiceInput);

  // Quick Add amount buttons.
  document.querySelectorAll("[data-quick-cash]").forEach((button) => {
    button.addEventListener("click", () => {
      const amount = Number(button.dataset.quickCash);
      if (Number.isFinite(amount) && amount > 0) quickAddExpense(amount);
    });
  });

  // Search and filters: support the IDs in the current HTML.
  ["searchExpenses", "searchInput"].forEach((id) => {
    const input = $(id);
    if (input) input.addEventListener("input", renderExpenseList);
  });

  ["filterCategory", "categoryFilter"].forEach((id) => {
    const input = $(id);
    if (input) input.addEventListener("change", renderExpenseList);
  });

  ["filterMonth", "monthFilter"].forEach((id) => {
    const input = $(id);
    if (input) input.addEventListener("change", renderExpenseList);
  });

  const list = $("expenseList");

  if (list) {
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-expense]");
      if (button) deleteExpense(button.dataset.deleteExpense);
    });
  }

  if ($("expenseDate")) {
    $("expenseDate").value = getToday();
  }

  // Subscribe to login/logout and password recovery session changes.
  const { data } = supabaseClient.auth.onAuthStateChange(
    (_event, session) => {
      // Defer Supabase queries until the auth callback has completed.
      Promise.resolve().then(() => handleAuthState(session));
    }
  );

  authSubscription = data?.subscription || null;

  // Restore an existing session when the page loads.
  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("Session restore failed:", error);
      showMessage("Could not restore your login session.", "error");
      return;
    }

    return handleAuthState(data.session);
  }).catch((error) => {
    console.error("Session initialization failed:", error);
    showMessage("Could not initialize your login session.", "error");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialisePennyPilot);
} else {
  initialisePennyPilot();
}
