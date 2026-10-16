
/* =========================================================
   PennyPilot — Smart Expense Tracker
   Supabase authentication, expenses, budgets and analytics
   ========================================================= */

const SUPABASE_URL = "https://dqcjhbiduogttljgfkau.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_eHuDa1uoMvWdv-hqAWYviA_YrnQoBhg";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let currentUser = null;
let expenses = [];
let expenseChart = null;
let authSubscription = null;

const $ = (id) => document.getElementById(id);

function showMessage(message, type = "info") {
  let element = $("appMessage");

  if (!element) {
    element = document.createElement("div");
    element.id = "appMessage";
    element.setAttribute("role", "status");

    const main = $("appSection") || document.querySelector("main");

    if (main) {
      main.prepend(element);
    } else {
      document.body.prepend(element);
    }
  }

  element.textContent = message;
  element.dataset.type = type;
  element.style.padding = "10px";
  element.style.margin = "10px 0";
  element.style.borderRadius = "8px";
  element.style.background =
    type === "error" ? "#fee2e2" :
    type === "success" ? "#dcfce7" : "#e0f2fe";
  element.style.color =
    type === "error" ? "#991b1b" :
    type === "success" ? "#166534" : "#075985";

  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    if (element) element.textContent = "";
  }, 4500);
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function getToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getBudgetKey() {
  return currentUser ? `pennypilot_budget_${currentUser.id}` : null;
}

function getBudget() {
  const key = getBudgetKey();

  if (!key) return 0;

  return Number(localStorage.getItem(key)) || 0;
}

function setBudget(value) {
  const key = getBudgetKey();

  if (!key) return;

  localStorage.setItem(key, String(value));
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

  const emailElement = $("userEmail");

  if (emailElement && currentUser) {
    emailElement.textContent = currentUser.email || "";
  }
}

/* -------------------- Authentication -------------------- */

async function signUp() {
  const email = $("signupEmail")?.value.trim();
  const password = $("signupPassword")?.value;

  if (!email || !password) {
    showMessage("Enter your email and password to create an account.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("Your password must contain at least 6 characters.", "error");
    return;
  }

  const button = $("signupButton");
  if (button) button.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    if (data.session) {
      currentUser = data.user;
      showMessage("Account created successfully!", "success");
    } else {
      showMessage(
        "Account created. Check your email to confirm your account, then sign in.",
        "success"
      );
    }
  } catch (error) {
    showMessage(error.message || "Could not create your account.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function signIn() {
  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  if (!email || !password) {
    showMessage("Enter your email and password.", "error");
    return;
  }

  const button = $("loginButton");
  if (button) button.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
  } catch (error) {
    showMessage(error.message || "Sign-in failed.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    currentUser = null;
    expenses = [];
    showAuthenticatedApp(false);
    showMessage("You have signed out.", "success");
  } catch (error) {
    showMessage(error.message || "Could not sign out.", "error");
  }
}

async function sendPasswordReset() {
  const email =
    $("resetEmail")?.value.trim() ||
    $("loginEmail")?.value.trim();

  if (!email) {
    showMessage("Enter your email address first.", "error");
    return;
  }

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });

    if (error) throw error;

    showMessage("If the account exists, a password-reset email will be sent.", "success");
  } catch (error) {
    showMessage(error.message || "Could not send the reset email.", "error");
  }
}

function showPasswordReset() {
  const authSection = $("authSection");
  const resetSection = $("passwordResetSection");

  if (authSection) authSection.style.display = "none";

  if (resetSection) {
    resetSection.hidden = false;
    resetSection.style.display = "";
  }
}

function showLogin() {
  const authSection = $("authSection");
  const resetSection = $("passwordResetSection");

  if (resetSection) {
    resetSection.hidden = true;
    resetSection.style.display = "none";
  }

  if (authSection) {
    authSection.hidden = false;
    authSection.style.display = "";
  }
}

/* -------------------- Expense management -------------------- */

async function loadExpenses() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("expenses")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("expense_date", { ascending: false });

  if (error) {
    console.error("Loading expenses failed:", error);
    showMessage(
      "Could not load expenses. Check your Supabase table and security policies.",
      "error"
    );
    return;
  }

  expenses = data || [];
  renderEverything();
}

async function addExpense(event) {
  if (event) event.preventDefault();

  if (!currentUser) {
    showMessage("Please sign in first.", "error");
    return;
  }

  const description =
    $("expenseName")?.value.trim() ||
    $("expenseTitle")?.value.trim() ||
    $("description")?.value.trim();

  const amountValue = $("expenseAmount")?.value;
  const category = $("expenseCategory")?.value;
  const date =
    $("expenseDate")?.value || getToday();

  const amount = Number(amountValue);

  if (!description || !amountValue || !category || !date) {
    showMessage("Fill in the expense name, amount, category and date.", "error");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("Enter an amount greater than zero.", "error");
    return;
  }

  const button = $("addExpenseButton");
  if (button) button.disabled = true;

  try {
    const { error } = await supabaseClient.from("expenses").insert({
      user_id: currentUser.id,
      description,
      amount,
      category,
      expense_date: date
    });

    if (error) throw error;

    const form = $("expenseForm");

    if (form) form.reset();

    if ($("expenseDate")) $("expenseDate").value = getToday();

    showMessage("Expense added successfully!", "success");
    await loadExpenses();
  } catch (error) {
    console.error("Adding expense failed:", error);
    showMessage(
      error.message || "Could not add the expense. Check the database columns.",
      "error"
    );
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

/* -------------------- Search and filters -------------------- */

function getFilteredExpenses() {
  const search = ($("searchInput")?.value || "").trim().toLowerCase();
  const category = $("categoryFilter")?.value || "";
  const month = $("monthFilter")?.value || "";

  return expenses.filter((expense) => {
    const description = String(
      expense.description || expense.title || ""
    ).toLowerCase();

    const matchesSearch =
      !search || description.includes(search);

    const matchesCategory =
      !category || expense.category === category;

    const expenseMonth = String(
      expense.expense_date || expense.date || ""
    ).slice(0, 7);

    const matchesMonth = !month || expenseMonth === month;

    return matchesSearch && matchesCategory && matchesMonth;
  });
}

function renderExpenseList() {
  const list = $("expenseList");
  if (!list) return;

  const filtered = getFilteredExpenses();

  if (filtered.length === 0) {
    list.innerHTML = "<p>No expenses found. Add an expense to get started.</p>";
    return;
  }

  list.innerHTML = filtered.map((expense) => {
    const description = escapeHTML(
      expense.description || expense.title || "Expense"
    );
    const category = escapeHTML(expense.category || "Other");
    const date = escapeHTML(
      String(expense.expense_date || expense.date || "").slice(0, 10)
    );
    const amount = formatMoney(expense.amount);

    return `
      <article class="transaction">
        <div class="transaction-details">
          <strong>${description}</strong>
          <p>${category} · ${date}</p>
        </div>
        <strong>${amount}</strong>
        <button type="button"
          class="delete-expense-button"
          data-delete-expense="${escapeHTML(String(expense.id))}"
          aria-label="Delete ${description}">
          Delete
        </button>
      </article>
    `;
  }).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

/* -------------------- Dashboard totals -------------------- */

function renderTotals() {
  const total = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0
  );

  const today = getToday();
  const todayTotal = expenses
    .filter((expense) =>
      String(expense.expense_date || expense.date || "").slice(0, 10) === today
    )
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const currentMonth = today.slice(0, 7);
  const monthTotal = expenses
    .filter((expense) =>
      String(expense.expense_date || expense.date || "").slice(0, 7) === currentMonth
    )
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  setText("totalExpenses", formatMoney(total));
  setText("totalSpent", formatMoney(total));
  setText("todayExpenses", formatMoney(todayTotal));
  setText("todayTotal", formatMoney(todayTotal));
  setText("monthlyExpenses", formatMoney(monthTotal));
  setText("monthlyTotal", formatMoney(monthTotal));
  setText("expenseCount", String(expenses.length));
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

/* -------------------- Budget -------------------- */

function renderBudget() {
  const budget = getBudget();

  const today = getToday();
  const month = today.slice(0, 7);

  const monthSpent = expenses
    .filter((expense) =>
      String(expense.expense_date || expense.date || "").slice(0, 7) === month
    )
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const remaining = budget - monthSpent;
  const percentage = budget > 0
    ? Math.min((monthSpent / budget) * 100, 100)
    : 0;

  setText("budgetAmount", formatMoney(budget));
  setText("budgetSpent", formatMoney(monthSpent));
  setText("budgetRemaining", formatMoney(remaining));

  const progress = $("budgetProgress");

  if (progress) {
    progress.style.width = `${percentage}%`;
    progress.setAttribute("aria-valuenow", String(Math.round(percentage)));
  }

  const track = $("budget-track") || $("budgetTrack");

  if (track) {
    track.setAttribute("aria-valuenow", String(Math.round(percentage)));
  }
}

function saveBudgetFromInput() {
  const input = $("budgetInput");
  const amount = Number(input?.value);

  if (!input || input.value.trim() === "" ||
      !Number.isFinite(amount) || amount < 0) {
    showMessage("Enter a valid monthly budget.", "error");
    return;
  }

  setBudget(amount);
  renderBudget();
  showMessage("Monthly budget saved on this device.", "success");
}

/* -------------------- Category summary and chart -------------------- */

function getCategoryTotals() {
  return expenses.reduce((totals, expense) => {
    const category = expense.category || "Other";
    totals[category] = (totals[category] || 0) + Number(expense.amount || 0);
    return totals;
  }, {});
}

function renderCategoryTotals() {
  const container = $("categoryTotals");
  const totals = getCategoryTotals();

  if (!container) return;

  const categories = Object.entries(totals)
    .sort((a, b) => b[1] - a[1]);

  if (categories.length === 0) {
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

  const totals = getCategoryTotals();
  const labels = Object.keys(totals);
  const values = Object.values(totals);

  if (expenseChart) {
    expenseChart.destroy();
    expenseChart = null;
  }

  if (labels.length === 0) return;

  expenseChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          "#22c55e",
          "#3b82f6",
          "#a855f7",
          "#f59e0b",
          "#ef4444",
          "#14b8a6",
          "#ec4899",
          "#64748b"
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom"
        },
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

/* -------------------- Insights -------------------- */

function renderInsights() {
  const container = $("insights");
  if (!container) return;

  if (expenses.length === 0) {
    container.textContent =
      "Add your first expense to see spending insights.";
    return;
  }

  const totals = getCategoryTotals();
  const largestCategory = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])[0];

  const largestExpense = [...expenses].sort(
    (a, b) => Number(b.amount || 0) - Number(a.amount || 0)
  )[0];

  const budget = getBudget();
  const month = getToday().slice(0, 7);

  const monthSpent = expenses
    .filter((expense) =>
      String(expense.expense_date || expense.date || "").slice(0, 7) === month
    )
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const messages = [
    `Your highest-spending category is ${largestCategory[0]} (${formatMoney(largestCategory[1])}).`,
    `Your largest single expense is ${formatMoney(largestExpense.amount)} for ${largestExpense.description || largestExpense.title || "an expense"}.`
  ];

  if (budget > 0) {
    messages.push(
      monthSpent > budget
        ? `You are ${formatMoney(monthSpent - budget)} over your monthly budget.`
        : `You have ${formatMoney(budget - monthSpent)} left in your monthly budget.`
    );
  }

  container.innerHTML = messages
    .map((message) => `<p>${escapeHTML(message)}</p>`)
    .join("");
}

/* -------------------- Quick add and voice input -------------------- */

function quickAddExpense() {
  const input = $("quickExpenseInput");
  if (!input) {
    showMessage("Quick-add input is not available.", "error");
    return;
  }

  const raw = input.value.trim();

  // Format: description, amount, category
  // Example: Lunch, 150, Food
  const parts = raw.split(",").map((part) => part.trim());

  if (parts.length < 2) {
    showMessage("Use: Expense name, amount, category", "error");
    return;
  }

  const description = parts[0];
  const amount = Number(parts[1]);
  const category = parts[2] || "Other";

  if (!description || !Number.isFinite(amount) || amount <= 0) {
    showMessage("Enter a valid expense name and amount.", "error");
    return;
  }

  addExpenseFromValues(description, amount, category);
}

async function addExpenseFromValues(description, amount, category) {
  if (!currentUser) return;

  try {
    const { error } = await supabaseClient.from("expenses").insert({
      user_id: currentUser.id,
      description,
      amount,
      category,
      expense_date: getToday()
    });

    if (error) throw error;

    if ($("quickExpenseInput")) $("quickExpenseInput").value = "";

    showMessage("Quick expense added!", "success");
    await loadExpenses();
  } catch (error) {
    showMessage(error.message || "Could not add quick expense.", "error");
  }
}

function startVoiceInput() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showMessage("Voice input is not supported by this browser.", "error");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;

    if ($("quickExpenseInput")) {
      $("quickExpenseInput").value = transcript;
    } else if ($("expenseName")) {
      $("expenseName").value = transcript;
    }

    showMessage(`Heard: ${transcript}`, "success");
  };

  recognition.onerror = () => {
    showMessage("Could not recognize your voice. Please try again.", "error");
  };

  recognition.start();
}

/* -------------------- Rendering -------------------- */

function renderEverything() {
  renderTotals();
  renderExpenseList();
  renderBudget();
  renderCategoryTotals();
  renderChart();
  renderInsights();
}

async function handleAuthState(session) {
  currentUser = session?.user || null;
  showAuthenticatedApp(Boolean(currentUser));

  if (currentUser) {
    await loadExpenses();
  } else {
    expenses = [];
    if (expenseChart) {
      expenseChart.destroy();
      expenseChart = null;
    }
  }
}

/* -------------------- Event listeners -------------------- */

function addClickListener(id, callback) {
  const element = $(id);
  if (element) element.addEventListener("click", callback);
}

function addInputListener(id, callback) {
  const element = $(id);
  if (element) element.addEventListener("input", callback);
}

function initialisePennyPilot() {
  // Authentication buttons
  addClickListener("signupButton", signUp);
  addClickListener("loginButton", signIn);
  addClickListener("logoutButton", signOut);
  addClickListener("signOutButton", signOut);
  addClickListener("resetPasswordButton", sendPasswordReset);
  addClickListener("forgotPasswordButton", showPasswordReset);
  addClickListener("backToLoginButton", showLogin);

  // Expense form
  const expenseForm = $("expenseForm");

  if (expenseForm) {
    expenseForm.addEventListener("submit", addExpense);
  }

  addClickListener("addExpenseButton", addExpense);
  addClickListener("saveBudgetButton", saveBudgetFromInput);
  addClickListener("quickAddButton", quickAddExpense);
  addClickListener("voiceButton", startVoiceInput);

  // Search and filters
  addInputListener("searchInput", renderExpenseList);

  const categoryFilter = $("categoryFilter");
  if (categoryFilter) {
    categoryFilter.addEventListener("change", renderExpenseList);
  }

  const monthFilter = $("monthFilter");
  if (monthFilter) {
    monthFilter.addEventListener("change", renderExpenseList);
  }

  // Delegated delete button listener
  const list = $("expenseList");

  if (list) {
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-expense]");
      if (button) {
        deleteExpense(button.dataset.deleteExpense);
      }
    });
  }

  // Support Enter key on password fields
  ["loginPassword", "signupPassword"].forEach((id) => {
    const input = $(id);

    if (input) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();

          if (id === "loginPassword") signIn();
          if (id === "signupPassword") signUp();
        }
      });
    }
  });

  if ($("expenseDate")) {
    $("expenseDate").value = getToday();
  }

  // Observe login/logout state changes
  const { data } = supabaseClient.auth.onAuthStateChange(
    (_event, session) => {
      // Defer data fetching so auth state changes do not block the listener.
      setTimeout(() => {
        handleAuthState(session);
      }, 0);
    }
  );

  authSubscription = data?.subscription || null;

  // Restore any existing session
  supabaseClient.auth.getSession().then(({ data: sessionData, error }) => {
    if (error) {
      console.error("Session restore failed:", error);
      showMessage("Could not restore your login session.", "error");
      return;
    }

    handleAuthState(sessionData.session);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialisePennyPilot);
} else {
  initialisePennyPilot();
}
