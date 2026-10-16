
"use strict";

/* =========================================================
   PENNYPILOT — COMPLETE EXPENSE TRACKER
   Authentication, Supabase database, dashboard and charts
   ========================================================= */

// 1. CONFIGURATION

const SUPABASE_URL = "https://dqcjhbiduogttljgfkau.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_eHuDa1uoMvWdv-hqAWYviA_YrnQoBhg";

const MONTHLY_BUDGET = 10000;

const CATEGORIES = [
    "Food", "Transport", "Shopping", "Education",
    "Bills", "Health", "Entertainment", "Other"
];

const $ = id => document.getElementById(id);

let supabaseClient = null;
let currentUser = null;
let expenses = [];
let expenseChart = null;
let authBusy = false;
let expenseBusy = false;


// 2. HELPERS

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
    const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };

    return String(value ?? "").replace(
        /[&<>"']/g,
        character => replacements[character]
    );
}

function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
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

function getCurrentMonth() {
    return getToday().slice(0, 7);
}

function setValue(id, value) {
    const element = $(id);
    if (element) element.value = value;
}

function showElement(id, visible) {
    const element = $(id);
    if (element) element.hidden = !visible;
}

function setButtonState(id, disabled, text) {
    const button = $(id);
    if (!button) return;

    if (disabled) {
        if (!button.disabled) {
            button.dataset.originalText = button.textContent;
        }
        button.disabled = true;
        if (text) button.textContent = text;
    } else {
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

/*
 * Find credentials using IDs, names, or input types.
 * This supports authEmail/authPassword and common alternatives.
 */
function getAuthCredentials() {
    const emailElement =
        $("authEmail") ||
        $("signupEmail") ||
        $("signUpEmail") ||
        $("signinEmail") ||
        $("signInEmail") ||
        $("loginEmail") ||
        document.querySelector(
            '#authForm input[type="email"], ' +
            '#signupForm input[type="email"], ' +
            '#signUpForm input[type="email"], ' +
            '#signinForm input[type="email"], ' +
            '#loginForm input[type="email"], ' +
            'input[name="email"], input[type="email"]'
        );

    const passwordElement =
        $("authPassword") ||
        $("signupPassword") ||
        $("signUpPassword") ||
        $("signinPassword") ||
        $("signInPassword") ||
        $("loginPassword") ||
        document.querySelector(
            '#authForm input[type="password"], ' +
            '#signupForm input[type="password"], ' +
            '#signUpForm input[type="password"], ' +
            '#signinForm input[type="password"], ' +
            '#loginForm input[type="password"], ' +
            'input[name="password"], input[type="password"]'
        );

    return {
        emailElement,
        passwordElement,
        email: emailElement ? emailElement.value.trim() : "",
        password: passwordElement ? passwordElement.value : ""
    };
}


// 3. SUPABASE INITIALIZATION

function initializeSupabase() {
    if (!window.supabase ||
        typeof window.supabase.createClient !== "function") {
        setMessage(
            "Supabase library did not load. Check the Supabase script in index.html.",
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
        setMessage("Supabase initialization failed: " + error.message, true);
        return false;
    }
}


// 4. SHOW LOGIN OR DASHBOARD

function showSignedOut() {
    currentUser = null;
    expenses = [];
    expenseBusy = false;

    showElement("authSection", true);
    showElement("appSection", false);

    renderDashboard();
}

async function showSignedIn(user) {
    if (!user) return;

    currentUser = user;
    showElement("authSection", false);
    showElement("appSection", true);

    if ($("userEmail")) {
        $("userEmail").textContent = user.email || "";
    }

    setValue("expenseDate", getToday());

    await loadExpenses();
}


// 5. CREATE ACCOUNT

async function signUp(event) {
    if (event) event.preventDefault();

    if (authBusy) return;

    if (!supabaseClient) {
        setMessage("Supabase is not ready. Refresh the page.", true);
        return;
    }

    const credentials = getAuthCredentials();
    const { email, password, emailElement, passwordElement } = credentials;

    if (!emailElement || !passwordElement) {
        setMessage(
            "The email or password input was not found. Check the IDs in index.html.",
            true
        );
        console.error("PennyPilot: authentication input elements not found.", {
            emailElementFound: Boolean(emailElement),
            passwordElementFound: Boolean(passwordElement)
        });
        return;
    }

    if (!email || !password) {
        setMessage(
            "The email or password field is empty. Enter both fields and try again.",
            true
        );
        console.log("PennyPilot credential check:", {
            emailFieldFound: true,
            passwordFieldFound: true,
            emailHasValue: Boolean(email),
            passwordHasValue: Boolean(password)
        });
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setMessage("Enter a valid email address.", true);
        return;
    }

    if (password.length < 6) {
        setMessage("Your password must be at least 6 characters.", true);
        return;
    }

    authBusy = true;
    setButtonState("signUpButton", true, "Creating account...");
    setMessage("Creating your account...");

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (error) {
            setMessage("Sign-up failed: " + error.message, true);
            return;
        }

        if (data.session && data.user) {
            await showSignedIn(data.user);
            setMessage("Your account was created successfully.");
        } else {
            setMessage(
                "Signup request accepted. Check your email for a confirmation link if email confirmation is enabled. Then sign in."
            );
        }
    } catch (error) {
        setMessage(
            "Sign-up error: " + (error.message || "Unknown error"),
            true
        );
    } finally {
        authBusy = false;
        setButtonState("signUpButton", false);
    }
}


// 6. SIGN IN

async function signIn(event) {
    if (event) event.preventDefault();

    if (authBusy) return;

    if (!supabaseClient) {
        setMessage("Supabase is not ready. Refresh the page.", true);
        return;
    }

    const credentials = getAuthCredentials();
    const { email, password, emailElement, passwordElement } = credentials;

    if (!emailElement || !passwordElement) {
        setMessage(
            "Cannot find the email or password input. Check index.html.",
            true
        );
        console.error("PennyPilot: missing authentication inputs.", {
            emailFieldFound: Boolean(emailElement),
            passwordFieldFound: Boolean(passwordElement)
        });
        return;
    }

    if (!email || !password) {
        setMessage(
            "The email or password field is empty. Enter both fields and try again.",
            true
        );
        return;
    }

    authBusy = true;
    setButtonState("signInButton", true, "Signing in...");
    setMessage("Checking your account...");

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

        await showSignedIn(data.user);
        setMessage("Signed in successfully.");
    } catch (error) {
        setMessage(
            "Sign-in error: " + (error.message || "Unknown error"),
            true
        );
    } finally {
        authBusy = false;
        setButtonState("signInButton", false);
    }
}


// 7. SIGN OUT

async function signOut(event) {
    if (event) event.preventDefault();
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


// 8. LOAD USER EXPENSES

async function loadExpenses() {
    if (!supabaseClient || !currentUser || expenseBusy) return;

    expenseBusy = true;
    const requestedUserId = currentUser.id;

    try {
        const { data, error } = await supabaseClient
            .from("expenses")
            .select("*")
            .eq("user_id", requestedUserId)
            .order("expense_date", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) {
            setMessage("Loading expenses failed: " + error.message, true);
            return;
        }

        if (!currentUser || currentUser.id !== requestedUserId) return;

        expenses = data || [];
        renderDashboard();
    } catch (error) {
        setMessage(error.message || "Unable to load expenses.", true);
    } finally {
        expenseBusy = false;
    }
}


// 9. ADD EXPENSE

async function addExpense(event) {
    if (event) event.preventDefault();

    if (!supabaseClient || !currentUser) {
        setMessage("Please sign in before adding an expense.", true);
        return;
    }

    const title = $("expenseTitle")?.value.trim() || "";
    const amountText = $("expenseAmount")?.value.trim() || "";
    const category = $("expenseCategory")?.value || "";
    const expenseDate = $("expenseDate")?.value || "";
    const description = $("expenseDescription")?.value.trim() || "";
    const amount = Number(amountText);

    if (!title) {
        setMessage("Enter an expense name.", true);
        return;
    }

    if (!amountText || !Number.isFinite(amount) || amount <= 0) {
        setMessage("Enter a valid amount greater than zero.", true);
        return;
    }

    if (!CATEGORIES.includes(category)) {
        setMessage("Choose a valid category.", true);
        return;
    }

    if (!expenseDate) {
        setMessage("Choose the expense date.", true);
        return;
    }

    const submitButton = $("expenseForm")?.querySelector(
        'button[type="submit"]'
    );

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.originalText = submitButton.textContent;
        submitButton.textContent = "Saving...";
    }

    try {
        const { data, error } = await supabaseClient
            .from("expenses")
            .insert([{
                user_id: currentUser.id,
                title,
                amount,
                category,
                expense_date: expenseDate,
                description: description || null
            }])
            .select()
            .single();

        if (error) {
            setMessage("Saving expense failed: " + error.message, true);
            return;
        }

        expenses.push(data);

        expenses.sort((a, b) =>
            String(b.expense_date).localeCompare(String(a.expense_date))
        );

        $("expenseForm")?.reset();
        setValue("expenseDate", getToday());

        renderDashboard();
        setMessage("Expense added successfully.");
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


// 10. DELETE EXPENSE

async function deleteExpense(id) {
    if (!supabaseClient || !currentUser) {
        setMessage("Please sign in first.", true);
        return;
    }

    if (!window.confirm("Delete this expense?")) return;

    const expenseId = Number(id);
    const userId = currentUser.id;

    try {
        const { error } = await supabaseClient
            .from("expenses")
            .delete()
            .eq("id", expenseId)
            .eq("user_id", userId);

        if (error) {
            setMessage("Deleting expense failed: " + error.message, true);
            return;
        }

        expenses = expenses.filter(
            expense => Number(expense.id) !== expenseId
        );

        renderDashboard();
        setMessage("Expense deleted.");
    } catch (error) {
        setMessage(error.message || "Unable to delete expense.", true);
    }
}


// 11. FILTER EXPENSES

function getFilteredExpenses() {
    let result = [...expenses];

    const search = $("searchExpenses")?.value.trim().toLowerCase() || "";
    const category = $("filterCategory")?.value || "";
    const month = $("filterMonth")?.value || "";

    if (search) {
        result = result.filter(expense =>
            String(expense.title || "").toLowerCase().includes(search) ||
            String(expense.description || "").toLowerCase().includes(search)
        );
    }

    if (category) {
        result = result.filter(expense => expense.category === category);
    }

    if (month) {
        result = result.filter(expense =>
            String(expense.expense_date || "").startsWith(month)
        );
    }

    return result;
}


// 12. EXPENSE HISTORY

function renderExpenseList() {
    const container = $("expenseList");
    if (!container) return;

    const result = getFilteredExpenses();

    if (result.length === 0) {
        container.innerHTML = "<p>No expenses found.</p>";
        return;
    }

    container.innerHTML = result.map(expense => `
        <article class="expense-item">
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
                <button type="button"
                        data-delete-expense="${escapeHTML(expense.id)}">
                    Delete
                </button>
            </div>
        </article>
    `).join("");
}


// 13. SUMMARY AND MONTHLY BUDGET

function renderSummary() {
    const total = expenses.reduce(
        (sum, item) => sum + Number(item.amount || 0), 0
    );

    const todayTotal = expenses
        .filter(item => item.expense_date === getToday())
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const monthTotal = expenses
        .filter(item =>
            String(item.expense_date || "").startsWith(getCurrentMonth())
        )
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const values = {
        totalExpenses: formatCurrency(total),
        todayExpenses: formatCurrency(todayTotal),
        monthlyExpenses: formatCurrency(monthTotal),
        expenseCount: String(expenses.length)
    };

    Object.entries(values).forEach(([id, value]) => {
        if ($(id)) $(id).textContent = value;
    });

    const remaining = MONTHLY_BUDGET - monthTotal;
    const percentage = Math.min(100, monthTotal / MONTHLY_BUDGET * 100);

    if ($("budgetRemaining")) {
        $("budgetRemaining").textContent = formatCurrency(remaining);
    }

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
        $("budgetMessage").textContent =
            monthTotal > MONTHLY_BUDGET
                ? `Budget exceeded by ${formatCurrency(monthTotal - MONTHLY_BUDGET)}.`
                : `${percentage.toFixed(1)}% of your monthly budget used.`;
    }
}


// 14. CATEGORY BREAKDOWN

function getCategoryTotals() {
    const totals = Object.fromEntries(CATEGORIES.map(category => [category, 0]));

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


// 15. CHART

function renderChart() {
    const canvas = $("expenseChart");

    if (!canvas || !window.Chart) return;

    if (expenseChart) {
        expenseChart.destroy();
        expenseChart = null;
    }

    const totals = getCategoryTotals();
    const labels = Object.keys(totals).filter(category => totals[category] > 0);

    if (labels.length === 0) {
        const context = canvas.getContext("2d");
        if (context) context.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    expenseChart = new window.Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                label: "Expenses",
                data: labels.map(category => totals[category]),
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


// 16. INSIGHTS

function renderInsights() {
    const container = $("insights");
    if (!container) return;

    if (expenses.length === 0) {
        container.textContent = "Add expenses to see your spending insights.";
        return;
    }

    const totals = Object.entries(getCategoryTotals())
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);

    const monthlyTotal = expenses
        .filter(item =>
            String(item.expense_date || "").startsWith(getCurrentMonth())
        )
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    let message = totals.length
        ? `Your highest-spending category is ${totals[0][0]} (${formatCurrency(totals[0][1])}). `
        : "";

    message += monthlyTotal > MONTHLY_BUDGET
        ? `You exceeded your budget by ${formatCurrency(monthlyTotal - MONTHLY_BUDGET)}.`
        : `${formatCurrency(MONTHLY_BUDGET - monthlyTotal)} remains in your monthly budget.`;

    container.textContent = message;
}


// 17. RENDER EVERYTHING

function renderDashboard() {
    renderSummary();
    renderExpenseList();
    renderCategoryTotals();
    renderChart();
    renderInsights();
}


// 18. QUICK ADD

function setupQuickCash() {
    document.querySelectorAll("[data-quick-cash]").forEach(button => {
        button.addEventListener("click", () => {
            setValue("expenseTitle", "Quick Expense");
            setValue("expenseAmount", button.dataset.quickCash);
            setValue("expenseCategory", "Other");
            setValue("expenseDate", getToday());

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
        if (message) message.textContent =
            "Voice input is not supported by this browser.";
        return;
    }

    button.addEventListener("click", () => {
        const recognition = new SpeechRecognition();
        recognition.lang = "en-IN";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        if (message) message.textContent = "Listening...";
        button.disabled = true;

        recognition.onresult = event => {
            const transcript = event.results[0][0].transcript;
            const amountMatch = transcript.match(
                /(?:₹\s*|rs\.?\s*|rupees?\s*)?(\d+(?:\.\d+)?)(?:\s*rupees?)?/i
            );

            if (message) message.textContent = `Heard: ${transcript}`;

            if (amountMatch) {
                setValue("expenseAmount", amountMatch[1]);

                const title = transcript
                    .replace(amountMatch[0], "")
                    .replace(/\b(rupees?|rs|for|spent|expense|on|of|in)\b/gi, "")
                    .trim();

                if (title) setValue("expenseTitle", title);
            }

            const lower = transcript.toLowerCase();

            for (const category of CATEGORIES) {
                if (lower.includes(category.toLowerCase())) {
                    setValue("expenseCategory", category);
                    break;
                }
            }
        };

        recognition.onerror = event => {
            if (message) message.textContent = `Voice error: ${event.error}`;
        };

        recognition.onend = () => {
            button.disabled = false;
        };

        try {
            recognition.start();
        } catch (error) {
            button.disabled = false;
            if (message) message.textContent = "Could not start voice input. Try again.";
        }
    });
}


// 20. EVENT LISTENERS

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
        if (!(event.target instanceof Element)) return;

        const button = event.target.closest("[data-delete-expense]");

        if (button) deleteExpense(button.dataset.deleteExpense);
    });

    setupQuickCash();
    setupVoiceInput();
}


// 21. START APPLICATION

async function initializeApp() {
    if (!initializeSupabase()) return;

    setupEventListeners();
    setValue("expenseDate", getToday());

    try {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) {
            showSignedOut();
            setMessage("Session error: " + error.message, true);
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
                const sameUser =
                    currentUser && currentUser.id === session.user.id;

                currentUser = session.user;

                showElement("authSection", false);
                showElement("appSection", true);

                if ($("userEmail")) {
                    $("userEmail").textContent = session.user.email || "";
                }

                if (!sameUser) {
                    void showSignedIn(session.user);
                }
            }
        });
    } catch (error) {
        showSignedOut();
        setMessage(
            "App startup error: " + (error.message || "Unknown error"),
            true
        );
    }
}

document.addEventListener("DOMContentLoaded", initializeApp);
