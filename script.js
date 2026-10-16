
/* =========================================================
   PENNYPILOT — COMPLETE script.js
   Authentication, password recovery, expenses, budgets,
   filters, charts, insights and voice input.
   ========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // 1. CONFIGURATION
  const SUPABASE_URL = "https://dqcjhbiduogttljgfkau.supabase.co";
  const SUPABASE_ANON_KEY =
    "sb_publishable_eHuDa1uoMvWdv-hqAWYviA_YrnQoBhg";
  const TABLE_NAME = "expenses";

  if (!window.supabase?.createClient) {
    alert("Supabase failed to load. Check your internet connection and index.html.");
    console.error("Supabase library did not load.");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  // 2. HTML ELEMENTS
  const $ = (id) => document.getElementById(id);

  const elements = {
    appMessage: $("appMessage"),
    authSection: $("authSection"),
    authForm: $("authForm"),
    authEmail: $("authEmail"),
    authPassword: $("authPassword"),
    signInButton: $("signInButton"),
    signUpButton: $("signUpButton"),
    forgotPasswordButton: $("forgotPasswordButton"),
    passwordResetSection: $("passwordResetSection"),
    resetPasswordForm: $("resetPasswordForm"),
    newPassword: $("newPassword"),
    confirmNewPassword: $("confirmNewPassword"),
    saveNewPasswordButton: $("saveNewPasswordButton"),
    cancelPasswordResetButton: $("cancelPasswordResetButton"),
    appSection: $("appSection"),
    expenseForm: $("expenseForm"),
    expenseTitle: $("expenseTitle"),
    expenseAmount: $("expenseAmount"),
    expenseCategory: $("expenseCategory"),
    expenseDate: $("expenseDate"),
    expenseDescription: $("expenseDescription"),
    expenseList: $("expenseList"),
    expenseHistory: $("expenseHistory"),
    totalExpenses: $("totalExpenses"),
    monthlyExpenses: $("monthlyExpenses"),
    remainingBudget: $("remainingBudget"),
    budgetInput: $("budgetInput"),
    budgetForm: $("budgetForm"),
    searchInput: $("searchInput"),
    categoryFilter: $("categoryFilter"),
    monthFilter: $("monthFilter"),
    categoryTotals: $("categoryTotals"),
    expenseChart: $("expenseChart"),
    insights: $("insights"),
    voiceButton: $("voiceButton"),
    voiceMessage: $("voiceMessage")
  };

  // 3. STATE
  let currentUser = null;
  let expenses = [];
  let expenseChart = null;
  let monthlyBudget = 0;
  let isLoadingExpenses = false;
  let isSavingExpense = false;
  let isSavingBudget = false;
  let isSavingPassword = false;
  let isSigningIn = false;
  let isSigningUp = false;
  let isRequestingReset = false;
  let isResetMode = false;

  const currencyFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  });

  function localDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  const today = localDateString(new Date());

  // 4. GENERAL HELPERS
  function money(value) {
    const amount = Number(value);
    return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
  }

  function formatDate(value) {
    if (!value) return "No date";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function getCurrentMonth() {
    return localDateString(new Date()).slice(0, 7);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function showMessage(message, type = "info") {
    if (elements.appMessage) {
      elements.appMessage.textContent = message;
      elements.appMessage.dataset.type = type;
      elements.appMessage.setAttribute("role", "status");
      elements.appMessage.style.display = message ? "block" : "none";
    }
    if (message) console.log(`[PennyPilot: ${type}] ${message}`);
  }

  function clearMessage() {
    showMessage("");
  }

  function showButtonLoading(button, loading, normalText) {
    if (!button) return;

    if (loading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent.trim() || normalText || "Submit";
      }
      button.disabled = true;
      button.textContent = "Please wait...";
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || normalText || button.textContent;
      delete button.dataset.originalText;
    }
  }

  function setSectionVisibility(section, visible) {
    if (!section) return;
    section.hidden = !visible;
    section.style.display = visible ? "" : "none";
  }

  function showAuthentication() {
    setSectionVisibility(elements.authSection, true);
    setSectionVisibility(elements.passwordResetSection, false);
    setSectionVisibility(elements.appSection, false);
  }

  function showDashboard() {
    setSectionVisibility(elements.authSection, false);
    setSectionVisibility(elements.passwordResetSection, false);
    setSectionVisibility(elements.appSection, true);
  }

  function showPasswordReset() {
    isResetMode = true;
    setSectionVisibility(elements.authSection, false);
    setSectionVisibility(elements.passwordResetSection, true);
    setSectionVisibility(elements.appSection, false);
    elements.newPassword?.focus();
    showMessage("Enter and confirm your new password.", "info");
  }

  function getErrorMessage(error, fallback) {
    const message = String(error?.message || "");

    if (/invalid login credentials/i.test(message)) {
      return "Incorrect email or password. Please try again.";
    }
    if (/email not confirmed/i.test(message)) {
      return "Please verify your email address before signing in.";
    }
    if (/user already registered/i.test(message)) {
      return "An account with this email already exists. Please sign in.";
    }
    if (/password should be at least/i.test(message)) {
      return "Your password does not meet the minimum length requirement.";
    }
    if (/rate limit/i.test(message)) {
      return "Too many attempts. Please wait before trying again.";
    }
    if (/row-level security|permission denied/i.test(message)) {
      return "Supabase denied this action. Check the table's Row Level Security policies.";
    }
    if (/failed to fetch|networkerror/i.test(message)) {
      return "Network connection failed. Check your internet connection and Supabase URL.";
    }

    return message || fallback;
  }

  function getInputValue(element) {
    return element ? element.value.trim() : "";
  }

  function setDefaultExpenseDate() {
    if (elements.expenseDate && !elements.expenseDate.value) {
      elements.expenseDate.value = today;
    }
  }

  function getExpenseMonth(expense) {
    return String(expense.expense_date || "").slice(0, 7);
  }

  function isCurrentMonth(expense) {
    return getExpenseMonth(expense) === getCurrentMonth();
  }

  function getTotal(list) {
    return list.reduce((total, expense) => total + Number(expense.amount || 0), 0);
  }

  function getCategory(expense) {
    return String(expense.category || "Other").trim() || "Other";
  }

  function getCategoryBreakdown(list) {
    const result = {};
    list.forEach((expense) => {
      const category = getCategory(expense);
      result[category] = (result[category] || 0) + Number(expense.amount || 0);
    });
    return result;
  }

  // 5. AUTHENTICATION
  async function signIn() {
    if (isSigningIn) return;

    clearMessage();

    const email = getInputValue(elements.authEmail);
    const password = elements.authPassword?.value || "";

    if (!email || !password) {
      showMessage("Enter your email address and password.", "error");
      return;
    }
    if (!elements.authEmail?.checkValidity()) {
      showMessage("Enter a valid email address.", "error");
      return;
    }

    isSigningIn = true;
    showButtonLoading(elements.signInButton, true, "Sign In");

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;

      currentUser = data.user || data.session?.user || null;
      if (!currentUser) throw new Error("No user session was returned.");

      loadBudget();
      showDashboard();
      await loadExpenses();
      showMessage("You are signed in successfully.", "success");
    } catch (error) {
      showMessage(getErrorMessage(error, "Unable to sign in. Please try again."), "error");
    } finally {
      isSigningIn = false;
      showButtonLoading(elements.signInButton, false, "Sign In");
    }
  }

  async function signUp() {
    if (isSigningUp) return;
    clearMessage();

    const email = getInputValue(elements.authEmail);
    const password = elements.authPassword?.value || "";

    if (!email || !password) {
      showMessage("Enter an email address and password.", "error");
      return;
    }
    if (!elements.authEmail?.checkValidity()) {
      showMessage("Enter a valid email address.", "error");
      return;
    }
    if (password.length < 6) {
      showMessage("Choose a password containing at least 6 characters.", "error");
      return;
    }

    isSigningUp = true;
    showButtonLoading(elements.signUpButton, true, "Create Account");

    try {
      const redirectURL = window.location.origin + window.location.pathname;
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectURL }
      });
      if (error) throw error;

      if (data.session && data.user) {
        currentUser = data.user;
        loadBudget();
        showDashboard();
        await loadExpenses();
        showMessage("Your PennyPilot account has been created.", "success");
      } else {
        showMessage("Registration submitted. Check your email for a verification link, then sign in.", "success");
      }
    } catch (error) {
      showMessage(getErrorMessage(error, "Unable to create your account."), "error");
    } finally {
      isSigningUp = false;
      showButtonLoading(elements.signUpButton, false, "Create Account");
    }
  }

  async function requestPasswordReset() {
    if (isRequestingReset) return;
    clearMessage();

    const email = getInputValue(elements.authEmail);
    if (!email || !elements.authEmail?.checkValidity()) {
      showMessage("Enter a valid email address first.", "error");
      elements.authEmail?.focus();
      return;
    }

    isRequestingReset = true;
    showButtonLoading(elements.forgotPasswordButton, true, "Forgot Password");

    try {
      const redirectURL = window.location.origin + window.location.pathname;
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: redirectURL
      });
      if (error) throw error;

      showMessage("If an account exists for that email, a reset link will be sent. Check your inbox and spam folder.", "success");
    } catch (error) {
      showMessage(getErrorMessage(error, "Unable to request a password reset."), "error");
    } finally {
      isRequestingReset = false;
      showButtonLoading(elements.forgotPasswordButton, false, "Forgot Password");
    }
  }

  async function saveNewPassword(event) {
    event?.preventDefault();
    if (isSavingPassword) return;
    clearMessage();

    const password = elements.newPassword?.value || "";
    const confirmation = elements.confirmNewPassword?.value || "";

    if (!password || !confirmation) {
      showMessage("Enter and confirm your new password.", "error");
      return;
    }
    if (password.length < 6) {
      showMessage("Your new password must contain at least 6 characters.", "error");
      return;
    }
    if (password !== confirmation) {
      showMessage("The passwords do not match.", "error");
      return;
    }

    isSavingPassword = true;
    showButtonLoading(elements.saveNewPasswordButton, true, "Save New Password");

    try {
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        throw new Error("Password-reset session is missing or expired. Request a new reset link.");
      }

      const { data, error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;

      currentUser = data.user || sessionData.session.user;
      elements.resetPasswordForm?.reset();
      isResetMode = false;
      window.history.replaceState({}, document.title, window.location.pathname);

      loadBudget();
      showDashboard();
      await loadExpenses();
      showMessage("Your password has been updated successfully.", "success");
    } catch (error) {
      showMessage(getErrorMessage(error, "Unable to update your password."), "error");
    } finally {
      isSavingPassword = false;
      showButtonLoading(elements.saveNewPasswordButton, false, "Save New Password");
    }
  }

  async function cancelPasswordReset() {
    isResetMode = false;
    elements.resetPasswordForm?.reset();

    const { data } = await supabaseClient.auth.getSession();
    if (data.session?.user) {
      currentUser = data.session.user;
      loadBudget();
      showDashboard();
      await loadExpenses();
    } else {
      showAuthentication();
    }
    clearMessage();
  }

  async function signOut() {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;

      currentUser = null;
      expenses = [];
      monthlyBudget = 0;
      renderDashboard();
      showAuthentication();
      showMessage("You have signed out.", "success");
    } catch (error) {
      showMessage(getErrorMessage(error, "Unable to sign out."), "error");
    }
  }

  // 6. EXPENSE DATABASE
  async function loadExpenses() {
    if (!currentUser || isLoadingExpenses) return;
    isLoadingExpenses = true;

    try {
      const { data, error } = await supabaseClient
        .from(TABLE_NAME)
        .select("id, user_id, title, amount, category, expense_date, description, created_at")
        .eq("user_id", currentUser.id)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      expenses = Array.isArray(data) ? data : [];
      renderDashboard();
    } catch (error) {
      showMessage(getErrorMessage(error, "Unable to load your expenses."), "error");
    } finally {
      isLoadingExpenses = false;
    }
  }

  async function addExpense(event) {
    event?.preventDefault();
    if (isSavingExpense) return;

    if (!currentUser) {
      showMessage("Please sign in before adding an expense.", "error");
      return;
    }

    const title = getInputValue(elements.expenseTitle);
    const amountText = getInputValue(elements.expenseAmount);
    const category = getInputValue(elements.expenseCategory) || "Other";
    const expenseDate = getInputValue(elements.expenseDate) || today;
    const description = getInputValue(elements.expenseDescription);
    const amount = Number(amountText);

    if (!title) {
      showMessage("Enter an expense title.", "error");
      return;
    }
    if (!amountText || !Number.isFinite(amount) || amount <= 0) {
      showMessage("Enter an amount greater than zero.", "error");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      showMessage("Choose a valid expense date.", "error");
      return;
    }

    isSavingExpense = true;
    const submitButton = elements.expenseForm?.querySelector('button[type="submit"]');
    showButtonLoading(submitButton, true, "Add Expense");

    try {
      const payload = {
        user_id: currentUser.id,
        title,
        amount,
        category,
        expense_date: expenseDate,
        description: description || null
      };

      const { data, error } = await supabaseClient
        .from(TABLE_NAME)
        .insert(payload)
        .select("id, user_id, title, amount, category, expense_date, description, created_at")
        .single();

      if (error) throw error;
      expenses.unshift(data);
      elements.expenseForm?.reset();
      setDefaultExpenseDate();
      renderDashboard();
      showMessage("Expense added successfully.", "success");
    } catch (error) {
      showMessage(getErrorMessage(error, "Unable to add this expense."), "error");
    } finally {
      isSavingExpense = false;
      showButtonLoading(submitButton, false, "Add Expense");
    }
  }

  async function deleteExpense(expenseId) {
    if (!currentUser) {
      showMessage("Please sign in again.", "error");
      return;
    }

    const expense = expenses.find((item) => String(item.id) === String(expenseId));
    if (!expense) {
      showMessage("This expense could not be found.", "error");
      return;
    }
    if (!window.confirm(`Delete "${expense.title}" (${money(expense.amount)})?`)) return;

    try {
      const { error } = await supabaseClient
        .from(TABLE_NAME)
        .delete()
        .eq("id", expenseId)
        .eq("user_id", currentUser.id);

      if (error) throw error;
      expenses = expenses.filter((item) => String(item.id) !== String(expenseId));
      renderDashboard();
      showMessage("Expense deleted successfully.", "success");
    } catch (error) {
      showMessage(getErrorMessage(error, "Unable to delete this expense."), "error");
    }
  }

  // 7. BUDGETS — stored separately for each signed-in user
  function getBudgetStorageKey() {
    return currentUser ? `pennypilot_budget_${currentUser.id}` : null;
  }

  function loadBudget() {
    monthlyBudget = 0;
    const key = getBudgetStorageKey();

    if (key) {
      try {
        const stored = window.localStorage.getItem(key);
        if (stored !== null) {
          const value = Number(stored);
          monthlyBudget = Number.isFinite(value) && value >= 0 ? value : 0;
        }
      } catch (error) {
        console.warn("Unable to read local budget:", error);
      }
    }

    if (elements.budgetInput) {
      elements.budgetInput.value = monthlyBudget > 0 ? String(monthlyBudget) : "";
    }
  }

  function saveBudget(event) {
    event?.preventDefault();
    if (isSavingBudget) return;

    if (!currentUser) {
      showMessage("Please sign in before setting a budget.", "error");
      return;
    }

    const valueText = getInputValue(elements.budgetInput);
    const value = Number(valueText);

    if (valueText === "" || !Number.isFinite(value) || value < 0) {
      showMessage("Enter a valid monthly budget of zero or more.", "error");
      return;
    }

    isSavingBudget = true;
    try {
      const key = getBudgetStorageKey();
      if (key) window.localStorage.setItem(key, String(value));
      monthlyBudget = value;
      renderDashboard();
      showMessage("Monthly budget saved.", "success");
    } catch (error) {
      showMessage("Could not save your budget in this browser.", "error");
    } finally {
      isSavingBudget = false;
    }
  }

  // 8. FILTERS
  function getFilteredExpenses() {
    const search = getInputValue(elements.searchInput).toLowerCase();
    const selectedCategory = elements.categoryFilter?.value || "";
    const selectedMonth = elements.monthFilter?.value || "";

    return expenses.filter((expense) => {
      const title = String(expense.title || "").toLowerCase();
      const category = getCategory(expense);
      const description = String(expense.description || "").toLowerCase();

      const matchesSearch = !search ||
        title.includes(search) ||
        category.toLowerCase().includes(search) ||
        description.includes(search);

      const matchesCategory = !selectedCategory ||
        selectedCategory === "all" ||
        category === selectedCategory;

      const matchesMonth = !selectedMonth ||
        selectedMonth === "all" ||
        getExpenseMonth(expense) === selectedMonth;

      return matchesSearch && matchesCategory && matchesMonth;
    });
  }

  function updateFilterOptions() {
    if (elements.categoryFilter) {
      const previous = elements.categoryFilter.value;
      const categories = [...new Set(expenses.map(getCategory))]
        .sort((a, b) => a.localeCompare(b));

      elements.categoryFilter.replaceChildren();
      const all = document.createElement("option");
      all.value = "all";
      all.textContent = "All Categories";
      elements.categoryFilter.appendChild(all);

      categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        elements.categoryFilter.appendChild(option);
      });

      elements.categoryFilter.value = categories.includes(previous) ? previous : "all";
    }

    if (elements.monthFilter) {
      const previous = elements.monthFilter.value;
      const months = [...new Set(expenses.map(getExpenseMonth)
        .filter((month) => /^\d{4}-\d{2}$/.test(month)))]
        .sort((a, b) => b.localeCompare(a));

      elements.monthFilter.replaceChildren();
      const all = document.createElement("option");
      all.value = "all";
      all.textContent = "All Months";
      elements.monthFilter.appendChild(all);

      months.forEach((month) => {
        const [year, monthNumber] = month.split("-");
        const date = new Date(Number(year), Number(monthNumber) - 1, 1);
        const option = document.createElement("option");
        option.value = month;
        option.textContent = date.toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric"
        });
        elements.monthFilter.appendChild(option);
      });

      elements.monthFilter.value = months.includes(previous) ? previous : "all";
    }
  }

  // 9. SUMMARY
  function renderSummary() {
    const total = getTotal(expenses);
    const currentMonthTotal = getTotal(expenses.filter(isCurrentMonth));
    const remaining = monthlyBudget - currentMonthTotal;

    if (elements.totalExpenses) elements.totalExpenses.textContent = money(total);
    if (elements.monthlyExpenses) elements.monthlyExpenses.textContent = money(currentMonthTotal);

    if (elements.remainingBudget) {
      elements.remainingBudget.textContent = money(monthlyBudget > 0 ? remaining : 0);
      elements.remainingBudget.dataset.status = monthlyBudget === 0
        ? "unset"
        : remaining < 0 ? "over-budget" : "within-budget";
    }
  }

  // 10. EXPENSE HISTORY
  function renderExpenseList() {
    const target = elements.expenseList || elements.expenseHistory;
    if (!target) return;

    const filtered = getFilteredExpenses();
    if (!filtered.length) {
      target.innerHTML = '<p class="empty-state">No expenses found. Add an expense or change your filters.</p>';
      return;
    }

    target.innerHTML = filtered.map((expense) => {
      const title = escapeHTML(expense.title);
      const category = escapeHTML(getCategory(expense));
      const description = escapeHTML(expense.description || "");
      const date = escapeHTML(formatDate(expense.expense_date));
      const amount = escapeHTML(money(expense.amount));
      const id = escapeHTML(expense.id);

      return `
        <article class="expense-item" data-expense-id="${id}">
          <div class="expense-details">
            <h3>${title}</h3>
            <p class="expense-category">${category}</p>
            ${description ? `<p class="expense-description">${description}</p>` : ""}
            <small class="expense-date">${date}</small>
          </div>
          <div class="expense-actions">
            <strong class="expense-amount">${amount}</strong>
            <button type="button" class="delete-expense-button"
              data-delete-expense="${id}" aria-label="Delete ${title}">Delete</button>
          </div>
        </article>`;
    }).join("");
  }

  // 11. CATEGORY TOTALS
  function renderCategoryTotals() {
    const target = elements.categoryTotals;
    if (!target) return;

    const entries = Object.entries(getCategoryBreakdown(expenses.filter(isCurrentMonth)))
      .sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      target.innerHTML = '<p class="empty-state">No category expenses for this month yet.</p>';
      return;
    }

    const maxAmount = Math.max(...entries.map((entry) => entry[1]), 1);
    target.innerHTML = entries.map(([category, amount]) => {
      const percentage = Math.max(0, Math.min(100, amount / maxAmount * 100));

      return `
        <div class="category-total">
          <div class="category-total-header">
            <span>${escapeHTML(category)}</span>
            <strong>${escapeHTML(money(amount))}</strong>
          </div>
          <div class="category-progress-track" role="progressbar"
            aria-label="${escapeHTML(category)} spending"
            aria-valuemin="0" aria-valuemax="100"
            aria-valuenow="${Math.round(percentage)}">
            <div class="category-progress-fill" style="width:${percentage}%"></div>
          </div>
        </div>`;
    }).join("");
  }

  // 12. CHART
  function renderExpenseChart() {
    const canvas = elements.expenseChart;
    if (!canvas || typeof window.Chart !== "function") return;

    const entries = Object.entries(getCategoryBreakdown(expenses.filter(isCurrentMonth)))
      .sort((a, b) => b[1] - a[1]);

    expenseChart?.destroy();
    expenseChart = null;

    const context = canvas.getContext("2d");
    if (!context) return;

    expenseChart = new window.Chart(context, {
      type: "doughnut",
      data: {
        labels: entries.map((entry) => entry[0]),
        datasets: [{
          label: "Expenses",
          data: entries.map((entry) => entry[1]),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label(item) {
                return `${item.label}: ${money(item.parsed)}`;
              }
            }
          }
        }
      }
    });
  }

  // 13. INSIGHTS
  function renderInsights() {
    const target = elements.insights;
    if (!target) return;

    const current = expenses.filter(isCurrentMonth);
    const total = getTotal(current);
    const entries = Object.entries(getCategoryBreakdown(current))
      .sort((a, b) => b[1] - a[1]);

    const messages = [];

    if (!current.length) {
      messages.push("Start tracking your expenses to see your insights.");
    } else {
      messages.push(`You recorded ${current.length} expense${current.length === 1 ? "" : "s"} this month.`);

      if (entries.length) {
        messages.push(`Your highest-spending category is ${entries[0][0]} at ${money(entries[0][1])}.`);
      }

      if (monthlyBudget > 0) {
        const remaining = monthlyBudget - total;
        messages.push(remaining < 0
          ? `You are ${money(Math.abs(remaining))} over your monthly budget.`
          : `You have ${money(remaining)} remaining in your monthly budget.`);
      } else {
        messages.push("Set a monthly budget to compare your spending with your target.");
      }
    }

    target.innerHTML = messages.map((message) => `<p>${escapeHTML(message)}</p>`).join("");
  }

  function renderDashboard() {
    updateFilterOptions();
    renderSummary();
    renderExpenseList();
    renderCategoryTotals();
    renderExpenseChart();
    renderInsights();
  }

  // 14. QUICK ADD
  function handleQuickAdd(button) {
    if (!currentUser) {
      showMessage("Please sign in before adding an expense.", "error");
      return;
    }

    const amount = Number(button.dataset.quickCash || button.dataset.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage("This quick-add button has an invalid amount.", "error");
      return;
    }

    if (elements.expenseAmount) elements.expenseAmount.value = String(amount);
    if (elements.expenseTitle && !elements.expenseTitle.value.trim()) {
      elements.expenseTitle.value = "Quick expense";
    }

    setDefaultExpenseDate();
    elements.expenseForm?.scrollIntoView({ behavior: "smooth", block: "center" });
    elements.expenseTitle?.focus();
    showMessage(`${money(amount)} entered. Choose the category and click Add Expense.`, "info");
  }

  // 15. VOICE INPUT
  function setVoiceMessage(message) {
    if (elements.voiceMessage) elements.voiceMessage.textContent = message;
  }

  function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceMessage("Voice input is not supported in this browser. Try a recent version of Chrome.");
      return;
    }
    if (!currentUser) {
      setVoiceMessage("Please sign in before using voice input.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceMessage("Listening... Say the expense title and amount.");

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
      if (!transcript) {
        setVoiceMessage("I could not recognize your voice. Please try again.");
        return;
      }

      if (elements.expenseTitle) elements.expenseTitle.value = transcript;

      const match = transcript.match(
        /(?:₹|rs\.?|rupees?\s*)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:rupees?|rs\.?)/i
      );
      if (match && elements.expenseAmount) {
        elements.expenseAmount.value = match[1] || match[2];
      }

      setDefaultExpenseDate();
      setVoiceMessage(`Recognized: "${transcript}". Check the title and amount, then save the expense.`);
      elements.expenseTitle?.focus();
    };

    recognition.onerror = (event) => {
      const error = event.error || "unknown error";
      setVoiceMessage(error === "not-allowed"
        ? "Microphone access was denied. Allow microphone permission in your browser settings."
        : `Voice input failed (${error}). Please try again.`);
    };

    recognition.onend = () => {
      if (elements.voiceMessage?.textContent === "Listening... Say the expense title and amount.") {
        setVoiceMessage("Voice input ended. Try again if needed.");
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.error("Voice recognition error:", error);
      setVoiceMessage("Could not start voice input. Please try again.");
    }
  }

  // 16. EVENT LISTENERS — FIXED
  // The form handles submit buttons. A type="button" Sign In button
  // is handled by its click listener. This avoids duplicate sign-in calls.
  if (elements.authForm) {
    elements.authForm.addEventListener("submit", (event) => {
      event.preventDefault();
      signIn();
    });
  }

  if (elements.signInButton) {
    elements.signInButton.addEventListener("click", (event) => {
      if (
        elements.authForm &&
        elements.authForm.contains(elements.signInButton) &&
        elements.signInButton.type === "submit"
      ) {
        // The submit listener will call signIn().
        return;
      }

      event.preventDefault();
      signIn();
    });
  }

  if (elements.signUpButton) {
    elements.signUpButton.addEventListener("click", (event) => {
      event.preventDefault();
      signUp();
    });
  }

  if (elements.forgotPasswordButton) {
    elements.forgotPasswordButton.addEventListener("click", (event) => {
      event.preventDefault();
      requestPasswordReset();
    });
  }

  if (elements.resetPasswordForm) {
    elements.resetPasswordForm.addEventListener("submit", saveNewPassword);
  }

  if (elements.cancelPasswordResetButton) {
    elements.cancelPasswordResetButton.addEventListener("click", (event) => {
      event.preventDefault();
      cancelPasswordReset();
    });
  }

  if (elements.expenseForm) {
    elements.expenseForm.addEventListener("submit", addExpense);
  }

  if (elements.budgetForm) {
    elements.budgetForm.addEventListener("submit", saveBudget);
  }

  if (elements.searchInput) {
    elements.searchInput.addEventListener("input", renderExpenseList);
  }

  if (elements.categoryFilter) {
    elements.categoryFilter.addEventListener("change", renderExpenseList);
  }

  if (elements.monthFilter) {
    elements.monthFilter.addEventListener("change", renderExpenseList);
  }

  const expenseContainer = elements.expenseList || elements.expenseHistory;
  if (expenseContainer) {
    expenseContainer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-expense]");
      if (!button || !expenseContainer.contains(button)) return;
      deleteExpense(button.dataset.deleteExpense);
    });
  }

  document.querySelectorAll("[data-quick-cash], [data-amount]").forEach((button) => {
    button.addEventListener("click", () => handleQuickAdd(button));
  });

  if (elements.voiceButton) {
    elements.voiceButton.addEventListener("click", startVoiceInput);
  }

  const signOutButton = $("signOutButton");
  if (signOutButton) signOutButton.addEventListener("click", signOut);

  const refreshButton = $("refreshExpensesButton");
  if (refreshButton) refreshButton.addEventListener("click", loadExpenses);

  // 17. INITIAL SESSION AND PASSWORD RECOVERY
  setDefaultExpenseDate();

  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const recoveryRequested =
    urlParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery";

  if (recoveryRequested) {
    showPasswordReset();
  } else {
    showAuthentication();
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      isResetMode = true;
      showPasswordReset();
      return;
    }

    if (session?.user) {
      currentUser = session.user;

      if (!isResetMode) {
        loadBudget();
        showDashboard();
        loadExpenses();
      }
      return;
    }

    if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
      currentUser = null;
      expenses = [];
      monthlyBudget = 0;

      if (!isResetMode) {
        renderDashboard();
        showAuthentication();
      }
    }
  });

  async function initializeSession() {
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;

      if (data.session?.user) {
        currentUser = data.session.user;

        if (!isResetMode) {
          loadBudget();
          showDashboard();
          await loadExpenses();
        }
      } else if (!isResetMode) {
        currentUser = null;
        showAuthentication();
      }
    } catch (error) {
      console.error("Session initialization error:", error);
      if (!isResetMode) showAuthentication();
      showMessage(getErrorMessage(error, "Could not restore your login session."), "error");
    }
  }

  initializeSession();

  // 18. GLOBAL HELPERS FOR OPTIONAL INLINE HTML HANDLERS
  window.PennyPilot = {
    signIn,
    signUp,
    requestPasswordReset,
    saveNewPassword,
    signOut,
    loadExpenses,
    addExpense,
    deleteExpense,
    saveBudget,
    renderDashboard
  };
});
