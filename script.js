
"use strict";

/* =========================================================
   PENNYPILOT — SMART EXPENSE TRACKER
   Supabase authentication, expense storage and dashboard
   ========================================================= */

// 1. SUPABASE CONFIGURATION

const SUPABASE_URL = "https://dqcjhbiduogttljgfkau.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_eHuDa1uoMvWdv-hqAWYviA_YrnQoBhg";

const MONTHLY_BUDGET = 10000;

const CATEGORIES = [
    "Food",
    "Transport",
    "Shopping",
    "Education",
    "Bills",
    "Health",
    "Entertainment",
    "Other"
];

const $ = (id) => document.getElementById(id);

let supabaseClient = null;
let currentUser = null;
let expenses = [];
let expenseChart = null;
let authRequestInProgress = false;
let expenseRequestInProgress = false;


// 2. GENERAL HELPERS

function setMessage(message, isError = false) {
    const element = $("appMessage");

    if (element) {
        element.textContent = message;
        element.style.color = isError ? "#dc2626" : "#15803d";
        element.setAttribute("role", "status");
        element.setAttribute("aria-live", "polite");
    } else {
        alert(message);
    }
}

function escapeHTML(value) {
    const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };

    return String(value ?? "").replace(/[&<>"']/g, character => entities[character]);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
    return getToday().slice(0, 7);
}

function getElementValue(id) {
    const element = $(id);
    return element ? element.value.trim() : "";
}

function setElementValue(id, value) {
    const element = $(id);

    if (element) {
        element.value = value;
    }
}

function showElement(id, visible) {
    const element = $(id);

    if (element) {
        element.hidden = !visible;
    }
}

function setButtonLoading(id, loading, loadingText) {
    const button = $(id);

    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
    } else {
        button.textContent =
            button.dataset.originalText || button.textContent;
        button.disabled = false;
        delete button.dataset.originalText;
    }
}


// 3. INITIALIZE SUPABASE

function initializeSupabase() {
    if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
    ) {
        setMessage(
            "Supabase failed to load. Check the Supabase script in index.html.",
            true
        );
        return false;
    }

    try {
        supabaseClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        );

        return true;
    } catch (error) {
        setMessage(
            "Could not initialize Supabase: " + error.message,
            true
        );
        return false;
    }
}


// 4. AUTHENTICATION UI

function showSignedOut() {
    currentUser = null;
    expenses = [];
    expenseRequestInProgress = false;

    showElement("authSection", true);
    showElement("appSection", false);

    renderDashboard();
}

function showSignedIn(user) {
    if (!user) return;

    currentUser = user;

    showElement("authSection", false);
    showElement("appSection", true);

    const emailElement = $("userEmail");

    if (emailElement) {
        emailElement.textContent = user.email || "";
    }

    setElementValue("expenseDate", getToday());
    return loadExpenses();
}


// 5. CREATE ACCOUNT

async function signUp(event) {
    if (event) event.preventDefault();

    if (authRequestInProgress) return;

    if (!supabaseClient) {
        setMessage("Supabase is not initialized. Refresh the page.", true);
        return;
    }

    // These are the actual IDs in your index.html.
    const email = getElementValue("authEmail");
    const password = $("authPassword")?.value || "";

    if (!email || !password) {
        setMessage("Please enter your email and password.", true);
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setMessage("Please enter a valid email address.", true);
        return;
    }

    if (password.length < 6) {
        setMessage("Password must contain at least 6 characters.", true);
        return;
    }

    authRequestInProgress = true;
    setButtonLoading("signUpButton", true, "Creating account...");
    setMessage("Creating your account...");

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (error) {
            setMessage(error.message, true);
            return;
        }

        if (data.session && data.user) {
            await showSignedIn(data.user);
            setMessage("Account created successfully!");
        } else {
            setMessage(
                "Account request successful. Check your email for a confirmation link if email confirmation is enabled. After confirming, sign in."
            );
        }
    } catch (error) {
        setMessage(
            error.message || "Unable to create your account.",
            true
        );
    } finally {
        authRequestInProgress = false;
        setButtonLoading("signUpButton", false);
    }
}


// 6. SIGN IN

async function signIn(event) {
    if (event) event.preventDefault();

    if (authRequestInProgress) return;

    if (!supabaseClient) {
        setMessage("Supabase is not initialized. Refresh the page.", true);
        return;
    }

    // Use the same actual input IDs as the HTML.
    const email = getElementValue("authEmail");
    const password = $("authPassword")?.value || "";

    if (!email || !password) {
        setMessage("Please enter your email and password.", true);
        return;
    }

    authRequestInProgress = true;
    setButtonLoading("signInButton", true, "Signing in...");
    setMessage("Signing in...");

    try {
        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

        if (error) {
            setMessage(error.message, true);
            return;
        }

        await showSignedIn(data.user);
        setMessage("Signed in successfully!");
    } catch (error) {
        setMessage(error.message || "Unable to sign in.", true);
    } finally {
        authRequestInProgress = false;
        setButtonLoading("signInButton", false);
    }
}


// 7. SIGN OUT

async function signOut(event) {
    if (event) event.preventDefault();

    if (!supabaseClient) return;

    try {
        const { error } = await supabaseClient.auth.signOut();

        if (error) {
            setMessage(error.message, true);
            return;
        }

        showSignedOut();
        setMessage("You have signed out.");
    } catch (error) {
        setMessage(error.message || "Unable to sign out.", true);
    }
}


// 8. LOAD EXPENSES FROM SUPABASE

async function loadExpenses() {
    if (!supabaseClient || !currentUser || expenseRequestInProgress) {
        return;
    }

    expenseRequestInProgress = true;

    try {
        const userId = currentUser.id;

        const { data, error } = await supabaseClient
            .from("expenses")
            .select("*")
            .eq("user_id", userId)
            .order("expense_date", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) {
            setMessage("Could not load expenses: " + error.message, true);
            return;
        }

        // Ignore results if the user changed while the request was running.
        if (!currentUser || currentUser.id !== userId) return;

        expenses = data || [];
        renderDashboard();
    } catch (error) {
        setMessage(error.message || "Unable to load expenses.", true);
    } finally {
        expenseRequestInProgress = false;
    }
}


// 9. ADD AN EXPENSE

async function addExpense(event) {
    if (event) event.preventDefault();

    if (!supabaseClient || !currentUser) {
        setMessage("Please sign in before adding an expense.", true);
        return;
    }

    const title = getElementValue("expenseTitle");
    const amountText = getElementValue("expenseAmount");
    const category = getElementValue("expenseCategory");
    const expenseDate = getElementValue("expenseDate");
    const description = getElementValue("expenseDescription");
    const amount = Number(amountText);

    if (!title) {
        setMessage("Enter an expense name.", true);
        return;
    }

    if (title.length > 150) {
        setMessage("Expense name must be 150 characters or fewer.", true);
        return;
    }

    if (
        !amountText ||
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        setMessage("Enter an amount greater than zero.", true);
        return;
    }

    if (!CATEGORIES.includes(category)) {
        setMessage("Please choose a valid expense category.", true);
        return;
    }

    if (!expenseDate) {
        setMessage("Please choose an expense date.", true);
        return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
        setMessage("Please enter a valid expense date.", true);
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

    const submitButton = $("expenseForm")?.querySelector(
        'button[type="submit"]'
    );

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.originalText = submitButton.textContent;
        submitButton.textContent = "Saving...";
    }

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

        expenses.push(data);

        expenses.sort((a, b) => {
            const dateCompare = String(b.expense_date).localeCompare(
                String(a.expense_date)
            );

            if (dateCompare !== 0) return dateCompare;

            return String(b.created_at || "").localeCompare(
                String(a.created_at || "")
            );
        });

        const form = $("expenseForm");

        if (form) form.reset();

        setElementValue("expenseDate", getToday());

        renderDashboard();
        setMessage("Expense added successfully!");
    } catch (error) {
        setMessage(error.message || "Unable to add expense.", true);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent =
                submitButton.dataset.originalText || "Add Expense";
            delete submitButton.dataset.originalText;
        }
    }
}


// 10. DELETE AN EXPENSE

async function deleteExpense(id) {
    if (!supabaseClient || !currentUser) {
        setMessage("Please sign in first.", true);
        return;
    }

    const expenseId = Number(id);

    if (!Number.isSafeInteger(expenseId) || expenseId <= 0) {
        setMessage("Invalid expense ID.", true);
        return;
    }

    if (!window.confirm("Are you sure you want to delete this expense?")) {
        return;
    }

    try {
        const userId = currentUser.id;

        const { error } = await supabaseClient
            .from("expenses")
            .delete()
            .eq("id", expenseId)
            .eq("user_id", userId);

        if (error) {
            setMessage("Could not delete expense: " + error.message, true);
            return;
        }

        if (!currentUser || currentUser.id !== userId) return;

        expenses = expenses.filter(
            expense => Number(expense.id) !== expenseId
        );

        renderDashboard();
        setMessage("Expense deleted successfully.");
    } catch (error) {
        setMessage(error.message || "Unable to delete expense.", true);
    }
}


// 11. SEARCH AND FILTER

function getFilteredExpenses() {
    let filtered = [...expenses];

    const search = getElementValue("searchExpenses").toLowerCase();
    const category = getElementValue("filterCategory");
    const month = getElementValue("filterMonth");

    if (search) {
        filtered = filtered.filter(expense => {
            const title = String(expense.title || "").toLowerCase();
            const description = String(
                expense.description || ""
            ).toLowerCase();

            return title.includes(search) || description.includes(search);
        });
    }

    if (category && category !== "all") {
        filtered = filtered.filter(
            expense => expense.category === category
        );
    }

    if (month) {
        filtered = filtered.filter(
            expense => String(expense.expense_date || "").slice(0, 7) === month
        );
    }

    return filtered;
}


// 12. RENDER EXPENSE HISTORY

function renderExpenseList() {
    const container = $("expenseList");

    if (!container) return;

    const filtered = getFilteredExpenses();

    if (filtered.length === 0) {
        container.innerHTML = "<p>No expenses found.</p>";
        return;
    }

    container.innerHTML = filtered.map(expense => `
        <div class="expense-item"
             data-expense-id="${escapeHTML(expense.id)}">

            <div class="expense-details">
                <strong>${escapeHTML(expense.title)}</strong>
                <p>${escapeHTML(expense.category)}</p>
                <small>${escapeHTML(expense.expense_date || "")}</small>

                ${
                    expense.description
                        ? `<p>${escapeHTML(expense.description)}</p>`
                        : ""
                }
            </div>

            <div class="expense-actions">
                <strong>${formatCurrency(expense.amount)}</strong>
                <button
                    type="button"
                    class="delete-expense"
                    data-delete-expense="${escapeHTML(expense.id)}"
                    aria-label="Delete ${escapeHTML(expense.title)}">
                    Delete
                </button>
            </div>
        </div>
    `).join("");
}


// 13. DASHBOARD SUMMARY AND BUDGET

function renderSummary() {
    const total = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
    );

    const today = getToday();
    const month = getCurrentMonth();

    const todayTotal = expenses
        .filter(expense => expense.expense_date === today)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const monthTotal = expenses
        .filter(expense =>
            String(expense.expense_date || "").startsWith(month)
        )
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const values = {
        totalExpenses: formatCurrency(total),
        todayExpenses: formatCurrency(todayTotal),
        monthlyExpenses: formatCurrency(monthTotal),
        expenseCount: String(expenses.length)
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = $(id);
        if (element) element.textContent = value;
    });

    const remaining = MONTHLY_BUDGET - monthTotal;

    if ($("budgetRemaining")) {
        $("budgetRemaining").textContent = formatCurrency(remaining);
    }

    const percentage = Math.min(
        100,
        (monthTotal / MONTHLY_BUDGET) * 100
    );

    if ($("budgetProgress")) {
        $("budgetProgress").style.width = `${percentage}%`;
    }

    if ($("budgetProgressTrack")) {
        $("budgetProgressTrack").setAttribute(
            "aria-valuenow",
            String(Math.round(percentage))
        );
    }

    if ($("budgetMessage")) {
        if (monthTotal > MONTHLY_BUDGET) {
            $("budgetMessage").textContent =
                "You have exceeded your monthly budget by " +
                formatCurrency(monthTotal - MONTHLY_BUDGET) + ".";
        } else {
            $("budgetMessage").textContent =
                `${percentage.toFixed(1)}% of your monthly budget used.`;
        }
    }
}


// 14. CATEGORY TOTALS

function getCategoryTotals() {
    const totals = {};

    CATEGORIES.forEach(category => {
        totals[category] = 0;
    });

    expenses.forEach(expense => {
        const category = CATEGORIES.includes(expense.category)
            ? expense.category
            : "Other";

        totals[category] += Number(expense.amount || 0);
    });

    return totals;
}

function renderCategoryTotals() {
    const container = $("categoryTotals");

    if (!container) return;

    const totals = Object.entries(getCategoryTotals())
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);

    if (totals.length === 0) {
        container.innerHTML = "<p>No category spending yet.</p>";
        return;
    }

    container.innerHTML = totals.map(([category, amount]) => `
        <div class="category-total">
            <span>${escapeHTML(category)}</span>
            <strong>${formatCurrency(amount)}</strong>
        </div>
    `).join("");
}


// 15. EXPENSE CHART

function renderChart() {
    const canvas = $("expenseChart");

    if (!canvas || typeof window.Chart === "undefined") {
        return;
    }

    const totals = getCategoryTotals();

    const labels = Object.keys(totals).filter(
        category => totals[category] > 0
    );

    const values = labels.map(category => totals[category]);

    if (expenseChart) {
        expenseChart.destroy();
        expenseChart = null;
    }

    if (labels.length === 0) {
        const context = canvas.getContext("2d");
        if (context) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
    }

    expenseChart = new window.Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                label: "Expenses",
                data: values,
                borderWidth: 1
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
                            return `${context.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}


// 16. SPENDING INSIGHTS

function renderInsights() {
    const container = $("insights");

    if (!container) return;

    if (expenses.length === 0) {
        container.textContent =
            "Add your first expense to see your spending insights.";
        return;
    }

    const totals = Object.entries(getCategoryTotals())
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);

    const month = getCurrentMonth();

    const monthlyTotal = expenses
        .filter(expense =>
            String(expense.expense_date || "").startsWith(month)
        )
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    let message = "";

    if (totals.length > 0) {
        message =
            `Your highest-spending category is ${totals[0][0]} ` +
            `(${formatCurrency(totals[0][1])}). `;
    }

    if (monthlyTotal > MONTHLY_BUDGET) {
        message +=
            `You exceeded your ₹10,000 monthly budget by ` +
            `${formatCurrency(monthlyTotal - MONTHLY_BUDGET)}.`;
    } else {
        message +=
            `${formatCurrency(MONTHLY_BUDGET - monthlyTotal)} ` +
            "remains in your monthly budget.";
    }

    container.textContent = message;
}


// 17. RENDER COMPLETE DASHBOARD

function renderDashboard() {
    renderSummary();
    renderExpenseList();
    renderCategoryTotals();
    renderChart();
    renderInsights();
}


// 18. QUICK ADD BUTTONS

function setupQuickCash() {
    document.querySelectorAll("[data-quick-cash]").forEach(button => {
        button.addEventListener("click", () => {
            const amount = button.dataset.quickCash;

            setElementValue("expenseTitle", "Quick Expense");
            setElementValue("expenseAmount", amount);
            setElementValue("expenseCategory", "Other");
            setElementValue("expenseDate", getToday());

            const form = $("expenseForm");

            if (form) {
                form.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }
        });
    });
}


// 19. VOICE EXPENSE INPUT

function setupVoiceInput() {
    const button = $("voiceButton");
    const message = $("voiceMessage");

    if (!button) return;

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        button.disabled = true;

        if (message) {
            message.textContent =
                "Voice input is not supported in this browser.";
        }

        return;
    }

    button.addEventListener("click", () => {
        const recognition = new SpeechRecognition();

        recognition.lang = "en-IN";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        if (message) message.textContent = "Listening...";

        recognition.onresult = event => {
            const transcript = event.results[0][0].transcript;
            const lower = transcript.toLowerCase();

            if (message) message.textContent = `Heard: ${transcript}`;

            const amountMatch = transcript.match(
                /(?:₹\s*|rs\.?\s*|rupees?\s*)?(\d+(?:\.\d+)?)(?:\s*rupees?)?/i
            );

            if (amountMatch) {
                setElementValue("expenseAmount", amountMatch[1]);
            }

            const categoryWords = {
                food: "Food",
                lunch: "Food",
                dinner: "Food",
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
                    .replace(
                        /\b(rupees?|rs|for|spent|expense|on|of|in)\b/gi,
                        ""
                    )
                    .trim();

                if (title) {
                    setElementValue("expenseTitle", title);
                }
            }
        };

        recognition.onerror = event => {
            if (message) {
                message.textContent = `Voice input error: ${event.error}`;
            }
        };

        recognition.onend = () => {
            if (button) button.disabled = false;
            if (message && message.textContent === "Listening...") {
                message.textContent = "Voice input ended.";
            }
        };

        button.disabled = true;

        try {
            recognition.start();
        } catch (error) {
            button.disabled = false;

            if (message) {
                message.textContent = "Could not start voice input. Try again.";
            }
        }
    });
}


// 20. CONNECT ALL BUTTONS AND FORMS

function setupEventListeners() {
    $("signUpButton")?.addEventListener("click", signUp);
    $("signInButton")?.addEventListener("click", signIn);
    $("signOutButton")?.addEventListener("click", signOut);

    $("authForm")?.addEventListener("submit", event => {
        event.preventDefault();
        signIn(event);
    });

    $("expenseForm")?.addEventListener("submit", addExpense);

    $("searchExpenses")?.addEventListener("input", renderExpenseList);
    $("filterCategory")?.addEventListener("change", renderExpenseList);
    $("filterMonth")?.addEventListener("change", renderExpenseList);

    document.addEventListener("click", event => {
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


// 21. APP STARTUP

async function initializeApp() {
    if (!initializeSupabase()) return;

    setupEventListeners();
    setElementValue("expenseDate", getToday());

    try {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) {
            showSignedOut();
            setMessage("Unable to check login session: " + error.message, true);
            return;
        }

        if (data.session?.user) {
            await showSignedIn(data.session.user);
        } else {
            showSignedOut();
        }

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT") {
                showSignedOut();
                return;
            }

            if (event === "SIGNED_IN" && session?.user) {
                // Avoid duplicate reload if the current user is already shown.
                const sameUser =
                    currentUser && currentUser.id === session.user.id;

                currentUser = session.user;

                showElement("authSection", false);
                showElement("appSection", true);

                if (!sameUser) {
                    showSignedIn(session.user);
                }

                const emailElement = $("userEmail");
                if (emailElement) {
                    emailElement.textContent = session.user.email || "";
                }
            }
        });
    } catch (error) {
        showSignedOut();
        setMessage(
            error.message || "Unable to initialize PennyPilot.",
            true
        );
    }
}

document.addEventListener("DOMContentLoaded", initializeApp);
