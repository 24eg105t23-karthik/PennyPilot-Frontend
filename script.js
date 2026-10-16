
"use strict";

/* =========================================================
   PENNYPILOT — EXPENSE TRACKER
   Supabase authentication, password recovery and expenses
   ========================================================= */

// 1. SUPABASE CONFIGURATION

const SUPABASE_URL = "https://dqcjhbiduogttljgfkau.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_eHuDa1uoMvWdv-hqAWYviA_YrnQoBhg";

const MONTHLY_BUDGET = 10000;

const CATEGORIES = [
    "Food", "Transport", "Shopping", "Education",
    "Bills", "Health", "Entertainment", "Other"
];

const $ = (id) => document.getElementById(id);

let supabaseClient = null;
let currentUser = null;
let expenses = [];
let expenseChart = null;
let recoveryMode = false;
let handledUserId = null;

function setMessage(message, isError = false) {
    const element = $("appMessage") || $("authMessage") || $("message");

    if (!element) {
        console[isError ? "error" : "log"](message);
        return;
    }

    element.textContent = message;
    element.style.color = isError ? "#dc2626" : "#15803d";
    element.setAttribute("role", "status");
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

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function getToday() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCurrentMonth() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getElementValue(id) {
    const element = $(id);
    return element ? element.value.trim() : "";
}

function setElementValue(id, value) {
    const element = $(id);
    if (element) element.value = value;
}

function showElement(id, visible) {
    const element = $(id);
    if (element) element.hidden = !visible;
}

function getCredentials() {
    const form = $("authForm");

    const emailInput =
        $("authEmail") ||
        $("signinEmail") ||
        $("signInEmail") ||
        $("loginEmail") ||
        form?.querySelector('input[type="email"]');

    const passwordInput =
        $("authPassword") ||
        $("signinPassword") ||
        $("signInPassword") ||
        $("loginPassword") ||
        form?.querySelector('input[type="password"]');

    return {
        email: emailInput?.value.trim() || "",
        password: passwordInput?.value || ""
    };
}

// 2. INITIALIZE SUPABASE

function initializeSupabase() {
    if (!window.supabase?.createClient) {
        setMessage(
            "Supabase failed to load. Check your script tags in index.html.",
            true
        );
        return false;
    }

    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        }
    );

    return true;
}

// 3. DISPLAY SECTIONS

function showSignedOut() {
    currentUser = null;
    handledUserId = null;
    expenses = [];

    showElement("authSection", true);
    showElement("appSection", false);
    showElement("passwordResetSection", false);

    renderDashboard();
}

async function showSignedIn(user) {
    if (!user) return;

    currentUser = user;
    showElement("authSection", false);
    showElement("passwordResetSection", false);
    showElement("appSection", true);

    const emailElement = $("userEmail");
    if (emailElement) emailElement.textContent = user.email || "";

    handledUserId = user.id;
    await loadExpenses();
}

// 4. SIGN UP

async function signUp(event) {
    event?.preventDefault();

    if (!supabaseClient) {
        setMessage("Supabase is not initialized.", true);
        return;
    }

    const { email, password } = getCredentials();

    if (!email || !password) {
        setMessage("Enter your email and password.", true);
        return;
    }

    if (password.length < 6) {
        setMessage("Your password must contain at least 6 characters.", true);
        return;
    }

    setMessage("Creating your account...");

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin +
                    window.location.pathname
            }
        });

        if (error) {
            setMessage("Sign-up failed: " + error.message, true);
            return;
        }

        if (data.session && data.user) {
            setMessage("Account created successfully.");
            await showSignedIn(data.user);
        } else {
            setMessage(
                "Signup request accepted. Check your email for a confirmation link if email confirmation is enabled. Then sign in."
            );
        }
    } catch (error) {
        setMessage(error.message || "Unable to create your account.", true);
    }
}

// 5. SIGN IN

async function signIn(event) {
    event?.preventDefault();

    if (!supabaseClient) {
        setMessage("Supabase is not initialized.", true);
        return;
    }

    const { email, password } = getCredentials();

    if (!email || !password) {
        setMessage("Enter your email and password.", true);
        return;
    }

    setMessage("Signing in...");

    try {
        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

        if (error) {
            setMessage("Sign-in failed: " + error.message, true);
            return;
        }

        recoveryMode = false;
        setMessage("Signed in successfully.");
        await showSignedIn(data.user);
    } catch (error) {
        setMessage(error.message || "Unable to sign in.", true);
    }
}

// 6. PASSWORD RECOVERY: SEND EMAIL

async function sendPasswordReset(event) {
    event?.preventDefault();

    if (!supabaseClient) {
        setMessage("Supabase is not initialized.", true);
        return;
    }

    const { email } = getCredentials();

    if (!email) {
        setMessage("Enter your account email first.", true);
        $("authEmail")?.focus();
        return;
    }

    const redirectUrl = window.location.origin +
        window.location.pathname;

    setMessage("Sending password reset email...");

    try {
        const { error } =
            await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: redirectUrl
            });

        if (error) {
            setMessage("Password reset failed: " + error.message, true);
            return;
        }

        setMessage(
            "If an account exists for this email, a password reset link will be sent. Check your inbox and spam folder."
        );
    } catch (error) {
        setMessage(error.message || "Unable to send the reset email.", true);
    }
}

// 7. PASSWORD RECOVERY: SHOW NEW PASSWORD FORM

function showPasswordReset() {
    recoveryMode = true;

    showElement("authSection", false);
    showElement("appSection", false);
    showElement("passwordResetSection", true);

    setMessage("Enter and confirm your new password.");
}

// 8. PASSWORD RECOVERY: SAVE NEW PASSWORD

async function saveNewPassword(event) {
    event?.preventDefault();

    if (!supabaseClient) {
        setMessage("Supabase is not initialized.", true);
        return;
    }

    const newPassword = getElementValue("newPassword");
    const confirmPassword = getElementValue("confirmNewPassword");

    if (!newPassword || !confirmPassword) {
        setMessage("Enter and confirm your new password.", true);
        return;
    }

    if (newPassword.length < 6) {
        setMessage("Your new password must contain at least 6 characters.", true);
        return;
    }

    if (newPassword !== confirmPassword) {
        setMessage("The passwords do not match.", true);
        return;
    }

    setMessage("Updating your password...");

    try {
        const { data: sessionData, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError || !sessionData.session) {
            setMessage(
                "Your recovery session is missing or expired. Request a new password reset email and open its latest link.",
                true
            );
            return;
        }

        const { error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) {
            setMessage("Could not update password: " + error.message, true);
            return;
        }

        recoveryMode = false;

        const form = $("resetPasswordForm");
        if (form) form.reset();

        // Sign out so the user can sign in with the new password.
        await supabaseClient.auth.signOut();
        showSignedOut();

        setMessage(
            "Password updated successfully. Sign in using your new password."
        );
    } catch (error) {
        setMessage(error.message || "Unable to update your password.", true);
    }
}

function cancelPasswordReset() {
    recoveryMode = false;
    showElement("passwordResetSection", false);
    showElement("appSection", false);
    showElement("authSection", true);
    setMessage("Enter your email and new password to sign in.");
}

// 9. SIGN OUT

async function signOut(event) {
    event?.preventDefault();

    if (!supabaseClient) return;

    try {
        const { error } = await supabaseClient.auth.signOut();

        if (error) {
            setMessage("Sign-out failed: " + error.message, true);
            return;
        }

        showSignedOut();
        setMessage("You have signed out.");
    } catch (error) {
        setMessage(error.message || "Unable to sign out.", true);
    }
}

// 10. LOAD EXPENSES

async function loadExpenses() {
    if (!supabaseClient || !currentUser) return;

    try {
        const { data, error } = await supabaseClient
            .from("expenses")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("expense_date", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) {
            setMessage("Could not load expenses: " + error.message, true);
            return;
        }

        expenses = data || [];
        renderDashboard();
    } catch (error) {
        setMessage(error.message || "Unable to load expenses.", true);
    }
}

// 11. ADD EXPENSE

async function addExpense(event) {
    event?.preventDefault();

    if (!supabaseClient || !currentUser) {
        setMessage("Please sign in before adding an expense.", true);
        return;
    }

    const title = getElementValue("expenseTitle");
    const amountText = getElementValue("expenseAmount");
    const category = getElementValue("expenseCategory");
    const expenseDate = getElementValue("expenseDate") || getToday();
    const description = getElementValue("expenseDescription");
    const amount = Number(amountText);

    if (!title) {
        setMessage("Enter an expense name.", true);
        return;
    }

    if (!amountText || !Number.isFinite(amount) || amount <= 0) {
        setMessage("Enter a valid amount greater than zero.", true);
        return;
    }

    if (!category) {
        setMessage("Choose an expense category.", true);
        return;
    }

    const expenseData = {
        user_id: currentUser.id,
        title,
        amount,
        category,
        expense_date: expenseDate,
        description: description || null
    };

    try {
        setMessage("Saving expense...");

        const { data, error } = await supabaseClient
            .from("expenses")
            .insert([expenseData])
            .select()
            .single();

        if (error) {
            setMessage("Could not save expense: " + error.message, true);
            return;
        }

        expenses.unshift(data);

        $("expenseForm")?.reset();
        setElementValue("expenseDate", getToday());

        renderDashboard();
        setMessage("Expense added successfully.");
    } catch (error) {
        setMessage(error.message || "Unable to add expense.", true);
    }
}

// 12. DELETE EXPENSE

async function deleteExpense(id) {
    if (!supabaseClient || !currentUser) {
        setMessage("Please sign in first.", true);
        return;
    }

    const expenseId = Number(id);

    if (!Number.isFinite(expenseId)) {
        setMessage("Invalid expense ID.", true);
        return;
    }

    if (!window.confirm("Are you sure you want to delete this expense?")) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from("expenses")
            .delete()
            .eq("id", expenseId)
            .eq("user_id", currentUser.id);

        if (error) {
            setMessage("Could not delete expense: " + error.message, true);
            return;
        }

        expenses = expenses.filter(
            (expense) => Number(expense.id) !== expenseId
        );

        renderDashboard();
        setMessage("Expense deleted successfully.");
    } catch (error) {
        setMessage(error.message || "Unable to delete expense.", true);
    }
}

// 13. FILTER EXPENSES

function getFilteredExpenses() {
    let filtered = [...expenses];

    const search = getElementValue("searchExpenses").toLowerCase();
    const category = getElementValue("filterCategory");
    const month = getElementValue("filterMonth");

    if (search) {
        filtered = filtered.filter((expense) =>
            String(expense.title || "").toLowerCase().includes(search) ||
            String(expense.description || "").toLowerCase().includes(search)
        );
    }

    if (category && category !== "all") {
        filtered = filtered.filter(
            (expense) => expense.category === category
        );
    }

    if (month) {
        filtered = filtered.filter(
            (expense) => String(expense.expense_date || "").slice(0, 7) === month
        );
    }

    return filtered;
}

// 14. RENDER EXPENSE LIST

function renderExpenseList() {
    const container = $("expenseList");
    if (!container) return;

    const filtered = getFilteredExpenses();

    if (!filtered.length) {
        container.innerHTML = "<p>No expenses found.</p>";
        return;
    }

    container.innerHTML = filtered.map((expense) => `
        <div class="expense-item" data-expense-id="${escapeHTML(expense.id)}">
            <div class="expense-details">
                <strong>${escapeHTML(expense.title)}</strong>
                <p>${escapeHTML(expense.category)}</p>
                <small>${escapeHTML(expense.expense_date || "")}</small>
                ${expense.description
                    ? `<p>${escapeHTML(expense.description)}</p>`
                    : ""}
            </div>
            <div class="expense-actions">
                <strong>${formatCurrency(expense.amount)}</strong>
                <button
                    type="button"
                    class="delete-expense"
                    data-delete-expense="${escapeHTML(expense.id)}"
                    aria-label="Delete ${escapeHTML(expense.title)}"
                >Delete</button>
            </div>
        </div>
    `).join("");
}

// 15. SUMMARY AND BUDGET

function renderSummary() {
    const total = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0), 0
    );

    const todayTotal = expenses
        .filter((expense) => expense.expense_date === getToday())
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const monthTotal = expenses
        .filter((expense) =>
            String(expense.expense_date || "").startsWith(getCurrentMonth())
        )
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const values = {
        totalExpenses: formatCurrency(total),
        todayExpenses: formatCurrency(todayTotal),
        monthlyExpenses: formatCurrency(monthTotal),
        expenseCount: String(expenses.length)
    };

    Object.entries(values).forEach(([id, value]) => {
        if ($(id)) $(id).textContent = value;
    });

    if ($("budgetRemaining")) {
        $("budgetRemaining").textContent =
            formatCurrency(MONTHLY_BUDGET - monthTotal);
    }

    const percentage = Math.min(100, (monthTotal / MONTHLY_BUDGET) * 100);

    if ($("budgetProgress")) {
        $("budgetProgress").style.width = `${percentage}%`;
    }

    if ($("budgetProgressTrack")) {
        $("budgetProgressTrack").setAttribute(
            "aria-valuenow", String(Math.round(percentage))
        );
    }

    if ($("budgetMessage")) {
        $("budgetMessage").textContent =
            monthTotal > MONTHLY_BUDGET
                ? "You have exceeded your monthly budget."
                : "You are within your monthly budget.";
    }
}

// 16. CATEGORY TOTALS AND CHART

function getCategoryTotals() {
    const totals = {};

    CATEGORIES.forEach((category) => {
        totals[category] = 0;
    });

    expenses.forEach((expense) => {
        const category = expense.category || "Other";
        totals[category] = (totals[category] || 0) +
            Number(expense.amount || 0);
    });

    return totals;
}

function renderCategoryTotals() {
    const container = $("categoryTotals");
    if (!container) return;

    const nonZero = Object.entries(getCategoryTotals())
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);

    if (!nonZero.length) {
        container.innerHTML = "<p>No category spending yet.</p>";
        return;
    }

    container.innerHTML = nonZero.map(([category, amount]) => `
        <div class="category-total">
            <span>${escapeHTML(category)}</span>
            <strong>${formatCurrency(amount)}</strong>
        </div>
    `).join("");
}

function renderChart() {
    const canvas = $("expenseChart");
    if (!canvas || typeof window.Chart === "undefined") return;

    if (expenseChart) {
        expenseChart.destroy();
        expenseChart = null;
    }

    const totals = getCategoryTotals();
    const labels = Object.keys(totals).filter(
        (category) => totals[category] > 0
    );

    if (!labels.length) {
        return;
    }

    expenseChart = new window.Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                label: "Expenses",
                data: labels.map((category) => totals[category]),
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
                        label(context) {
                            return `${context.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

// 17. SPENDING INSIGHTS

function renderInsights() {
    const container = $("insights");
    if (!container) return;

    if (!expenses.length) {
        container.textContent =
            "Add your first expense to see your spending insights.";
        return;
    }

    const totals = getCategoryTotals();
    const highestCategory = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])[0];

    const monthlyTotal = expenses
        .filter((expense) =>
            String(expense.expense_date || "").startsWith(getCurrentMonth())
        )
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const budgetMessage = monthlyTotal > MONTHLY_BUDGET
        ? "Your monthly spending is above your ₹10,000 budget."
        : `You have ${formatCurrency(MONTHLY_BUDGET - monthlyTotal)} remaining in your monthly budget.`;

    container.textContent =
        `Your highest-spending category is ${highestCategory[0]} (${formatCurrency(highestCategory[1])}). ${budgetMessage}`;
}

function renderDashboard() {
    renderSummary();
    renderExpenseList();
    renderCategoryTotals();
    renderChart();
    renderInsights();
}

// 18. QUICK ADD

function setupQuickCash() {
    document.querySelectorAll("[data-quick-cash]").forEach((button) => {
        button.addEventListener("click", () => {
            setElementValue("expenseAmount", button.dataset.quickCash);

            $("expenseForm")?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        });
    });
}

// 19. VOICE INPUT

function setupVoiceInput() {
    const button = $("voiceButton");
    const message = $("voiceMessage");
    if (!button) return;

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        button.disabled = true;
        if (message) {
            message.textContent = "Voice input is not supported in this browser.";
        }
        return;
    }

    button.addEventListener("click", () => {
        const recognition = new SpeechRecognition();
        recognition.lang = "en-IN";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        if (message) message.textContent = "Listening...";

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;

            if (message) message.textContent = `Heard: ${transcript}`;

            const amountMatch = transcript.match(
                /(?:₹\s*|rs\.?\s*|rupees?\s*)?(\d+(?:\.\d+)?)(?:\s*rupees?)?/i
            );

            if (amountMatch) {
                setElementValue("expenseAmount", amountMatch[1]);
            }

            const lower = transcript.toLowerCase();
            const categoryWords = {
                food: "Food",
                transport: "Transport",
                travel: "Transport",
                shopping: "Shopping",
                education: "Education",
                bills: "Bills",
                health: "Health",
                entertainment: "Entertainment"
            };

            for (const [word, category] of Object.entries(categoryWords)) {
                if (lower.includes(word)) {
                    setElementValue("expenseCategory", category);
                    break;
                }
            }

            if (amountMatch) {
                const title = transcript
                    .replace(amountMatch[0], "")
                    .replace(/\b(rupees?|rs|for|spent|expense|on|of|in)\b/gi, "")
                    .trim();

                if (title) setElementValue("expenseTitle", title);
            }
        };

        recognition.onerror = (event) => {
            if (message) message.textContent = `Voice input error: ${event.error}`;
        };

        try {
            recognition.start();
        } catch {
            if (message) message.textContent = "Could not start voice input. Try again.";
        }
    });
}

// 20. EVENT LISTENERS

function setupEventListeners() {
    $("signUpButton")?.addEventListener("click", signUp);
    $("signInButton")?.addEventListener("click", signIn);
    $("signOutButton")?.addEventListener("click", signOut);

    $("forgotPasswordButton")?.addEventListener("click", sendPasswordReset);
    $("resetPasswordForm")?.addEventListener("submit", saveNewPassword);
    $("cancelPasswordResetButton")?.addEventListener("click", cancelPasswordReset);

    $("expenseForm")?.addEventListener("submit", addExpense);
    $("searchExpenses")?.addEventListener("input", renderExpenseList);
    $("filterCategory")?.addEventListener("change", renderExpenseList);
    $("filterMonth")?.addEventListener("change", renderExpenseList);

    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const deleteButton = target.closest("[data-delete-expense]");
        if (deleteButton) {
            deleteExpense(deleteButton.dataset.deleteExpense);
        }
    });

    setupQuickCash();
    setupVoiceInput();
}

// 21. STARTUP AND RECOVERY SESSION DETECTION

async function initializeApp() {
    if (!initializeSupabase()) return;

    setupEventListeners();
    setElementValue("expenseDate", getToday());

    // The recovery email must redirect back to this deployed page.
    // Supabase exchanges the recovery token and creates a session.
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const queryType = url.searchParams.get("type");
    const hashType = hash.get("type");

    const isRecoveryLink =
        queryType === "recovery" || hashType === "recovery";

    if (isRecoveryLink) {
        recoveryMode = true;
    }

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
            recoveryMode = true;
            showPasswordReset();
            return;
        }

        if (recoveryMode) {
            showPasswordReset();
            return;
        }

        if (event === "SIGNED_OUT") {
            showSignedOut();
            return;
        }

        if (
            (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
            session?.user &&
            handledUserId !== session.user.id
        ) {
            await showSignedIn(session.user);
        }
    });

    try {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) {
            setMessage("Session error: " + error.message, true);
            showSignedOut();
            return;
        }

        if (recoveryMode) {
            if (data.session) {
                showPasswordReset();
            } else {
                setMessage(
                    "This recovery link is expired or invalid. Request a new password reset email and open the newest link.",
                    true
                );
                showElement("authSection", true);
                showElement("appSection", false);
                showElement("passwordResetSection", false);
            }
            return;
        }

        if (data.session?.user) {
            await showSignedIn(data.session.user);
        } else {
            showSignedOut();
        }
    } catch (error) {
        showSignedOut();
        setMessage(error.message || "Unable to check your session.", true);
    }
}

document.addEventListener("DOMContentLoaded", initializeApp);
