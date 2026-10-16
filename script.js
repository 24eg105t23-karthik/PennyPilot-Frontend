"use strict";

/* =========================================================
   PENNYPILOT — EXPENSE TRACKER
   Supabase authentication and expense storage
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
let authInitialized = false;


// 2. GENERAL HELPERS

function setMessage(message, isError = false) {
    // Prefer a message element visible outside the hidden app section.
    const element =
        $("appMessage") ||
        $("authMessage") ||
        $("message");

    if (!element) {
        console[isError ? "error" : "log"](message);
        return;
    }

    element.textContent = message;
    element.style.color = isError ? "#dc2626" : "#15803d";
    element.setAttribute("role", "status");
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
    const date = new Date();

    return `${date.getFullYear()}-${String(
        date.getMonth() + 1
    ).padStart(2, "0")}`;
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


// 3. INITIALIZE SUPABASE

function initializeSupabase() {
    if (!window.supabase || !window.supabase.createClient) {
        setMessage(
            "Supabase failed to load. Check the Supabase script in index.html.",
            true
        );

        return false;
    }

    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    return true;
}


// 4. SHOW THE CORRECT SECTION

function showSignedOut() {
    currentUser = null;
    expenses = [];

    showElement("authSection", true);
    showElement("appSection", false);

    // Also support common alternative section IDs.
    showElement("loginSection", true);
    showElement("signupSection", true);

    renderExpenseList();
    renderSummary();
    renderCategoryTotals();
    renderChart();
}

function showSignedIn(user) {
    currentUser = user;

    showElement("authSection", false);
    showElement("appSection", true);

    showElement("loginSection", false);
    showElement("signupSection", false);

    const emailElement =
        $("userEmail") ||
        $("loggedInEmail") ||
        $("currentUserEmail");

    if (emailElement) {
        emailElement.textContent = user.email || "";
    }

    loadExpenses();
}


// 5. SIGN UP

async function signUp(event) {
    if (event) {
        event.preventDefault();
    }

    if (!supabaseClient) {
        setMessage("Supabase is not initialized.", true);
        return;
    }

    const email =
        getElementValue("signupEmail") ||
        getElementValue("signUpEmail") ||
        getElementValue("email");

    const password =
        getElementValue("signupPassword") ||
        getElementValue("signUpPassword") ||
        getElementValue("password");

    if (!email || !password) {
        setMessage("Enter your email and password.", true);
        return;
    }

    if (password.length < 6) {
        setMessage(
            "Your password must contain at least 6 characters.",
            true
        );
        return;
    }

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
            setMessage("Account created successfully.");
            await showSignedIn(data.user);
        } else {
            setMessage(
                "Account created. Check your email to confirm your account before signing in."
            );
        }
    } catch (error) {
        setMessage(
            error.message || "Unable to create your account.",
            true
        );
    }
}


// 6. SIGN IN

async function signIn(event) {
    if (event) {
        event.preventDefault();
    }

    if (!supabaseClient) {
        setMessage("Supabase is not initialized.", true);
        return;
    }

    const email =
        getElementValue("signinEmail") ||
        getElementValue("signInEmail") ||
        getElementValue("loginEmail") ||
        getElementValue("email");

    const password =
        getElementValue("signinPassword") ||
        getElementValue("signInPassword") ||
        getElementValue("loginPassword") ||
        getElementValue("password");

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
            setMessage(error.message, true);
            return;
        }

        setMessage("Signed in successfully.");
        await showSignedIn(data.user);
    } catch (error) {
        setMessage(error.message || "Unable to sign in.", true);
    }
}


// 7. SIGN OUT

async function signOut(event) {
    if (event) {
        event.preventDefault();
    }

    if (!supabaseClient) {
        return;
    }

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
    if (!supabaseClient || !currentUser) {
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from("expenses")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("expense_date", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) {
            setMessage(
                "Could not load expenses: " + error.message,
                true
            );
            return;
        }

        expenses = data || [];

        renderDashboard();
    } catch (error) {
        setMessage(error.message || "Unable to load expenses.", true);
    }
}


// 9. ADD AN EXPENSE

async function addExpense(event) {
    if (event) {
        event.preventDefault();
    }

    if (!supabaseClient || !currentUser) {
        setMessage("Please sign in before adding an expense.", true);
        return;
    }

    const title =
        getElementValue("expenseTitle") ||
        getElementValue("expenseName") ||
        getElementValue("title");

    const amountText = getElementValue("expenseAmount");
    const category = getElementValue("expenseCategory");
    const expenseDate =
        getElementValue("expenseDate") || getToday();

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

    if (!expenseDate) {
        setMessage("Choose an expense date.", true);
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
            setMessage(
                "Could not save expense: " + error.message,
                true
            );
            return;
        }

        expenses.unshift(data);

        const form = $("expenseForm");

        if (form) {
            form.reset();
        }

        setElementValue("expenseDate", getToday());

        renderDashboard();
        setMessage("Expense added successfully.");
    } catch (error) {
        setMessage(error.message || "Unable to add expense.", true);
    }
}


// 10. DELETE AN EXPENSE

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

    const confirmed = window.confirm(
        "Are you sure you want to delete this expense?"
    );

    if (!confirmed) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from("expenses")
            .delete()
            .eq("id", expenseId)
            .eq("user_id", currentUser.id);

        if (error) {
            setMessage(
                "Could not delete expense: " + error.message,
                true
            );
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


// 11. FILTER EXPENSES

function getFilteredExpenses() {
    let filtered = [...expenses];

    const search = getElementValue("searchExpenses").toLowerCase();
    const category = getElementValue("filterCategory");
    const month = getElementValue("filterMonth");

    if (search) {
        filtered = filtered.filter((expense) => {
            const title = String(expense.title || "").toLowerCase();
            const description = String(
                expense.description || ""
            ).toLowerCase();

            return (
                title.includes(search) ||
                description.includes(search)
            );
        });
    }

    if (category && category !== "all") {
        filtered = filtered.filter(
            (expense) => expense.category === category
        );
    }

    if (month) {
        filtered = filtered.filter(
            (expense) =>
                String(expense.expense_date || "").slice(0, 7) === month
        );
    }

    return filtered;
}


// 12. RENDER EXPENSE LIST

function renderExpenseList() {
    const container =
        $("expensesList") ||
        $("expenseList") ||
        $("recentTransactions") ||
        $("allExpenses");

    if (!container) {
        return;
    }

    const filtered = getFilteredExpenses();

    if (filtered.length === 0) {
        container.innerHTML = "<p>No expenses found.</p>";
        return;
    }

    container.innerHTML = filtered.map((expense) => `
        <div class="expense-item" data-expense-id="${escapeHTML(expense.id)}">
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
                    aria-label="Delete ${escapeHTML(expense.title)}"
                >
                    Delete
                </button>
            </div>
        </div>
    `).join("");
}


// 13. RENDER SUMMARY CARDS

function renderSummary() {
    const total = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
    );

    const today = getToday();

    const todayTotal = expenses
        .filter((expense) => expense.expense_date === today)
        .reduce(
            (sum, expense) => sum + Number(expense.amount || 0),
            0
        );

    const month = getCurrentMonth();

    const monthTotal = expenses
        .filter((expense) =>
            String(expense.expense_date || "").startsWith(month)
        )
        .reduce(
            (sum, expense) => sum + Number(expense.amount || 0),
            0
        );

    const values = {
        totalExpenses: formatCurrency(total),
        todayExpenses: formatCurrency(todayTotal),
        monthlyExpenses: formatCurrency(monthTotal),
        expenseCount: String(expenses.length)
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = $(id);

        if (element) {
            element.textContent = value;
        }
    });

    const budgetRemaining = $("budgetRemaining");

    if (budgetRemaining) {
        budgetRemaining.textContent = formatCurrency(
            MONTHLY_BUDGET - monthTotal
        );
    }

    const budgetProgress = $("budgetProgress");

    if (budgetProgress) {
        const percentage = Math.min(
            100,
            (monthTotal / MONTHLY_BUDGET) * 100
        );

        budgetProgress.style.width = `${percentage}%`;
        budgetProgress.setAttribute(
            "aria-valuenow",
            String(Math.round(percentage))
        );
    }

    const budgetMessage = $("budgetMessage");

    if (budgetMessage) {
        budgetMessage.textContent =
            monthTotal > MONTHLY_BUDGET
                ? "You have exceeded your monthly budget."
                : "You are within your monthly budget.";
    }
}


// 14. CATEGORY TOTALS

function getCategoryTotals() {
    const totals = {};

    CATEGORIES.forEach((category) => {
        totals[category] = 0;
    });

    expenses.forEach((expense) => {
        const category = expense.category || "Other";

        if (totals[category] === undefined) {
            totals[category] = 0;
        }

        totals[category] += Number(expense.amount || 0);
    });

    return totals;
}

function renderCategoryTotals() {
    const container = $("categoryTotals");

    if (!container) {
        return;
    }

    const totals = getCategoryTotals();

    const nonZero = Object.entries(totals)
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);

    if (nonZero.length === 0) {
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


// 15. CATEGORY CHART

function renderChart() {
    const canvas = $("expenseChart") || $("categoryChart");

    if (!canvas || typeof window.Chart === "undefined") {
        return;
    }

    const totals = getCategoryTotals();

    const labels = Object.keys(totals).filter(
        (category) => totals[category] > 0
    );

    const data = labels.map((category) => totals[category]);

    if (expenseChart) {
        expenseChart.destroy();
        expenseChart = null;
    }

    expenseChart = new window.Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                label: "Expenses",
                data,
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
                            return `${context.label}: ${formatCurrency(
                                context.raw
                            )}`;
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

    if (!container) {
        return;
    }

    if (expenses.length === 0) {
        container.textContent =
            "Add your first expense to see your spending insights.";
        return;
    }

    const totals = getCategoryTotals();

    const highestCategory = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])[0];

    const monthlyTotal = expenses
        .filter((expense) =>
            String(expense.expense_date || "").startsWith(
                getCurrentMonth()
            )
        )
        .reduce(
            (sum, expense) => sum + Number(expense.amount || 0),
            0
        );

    let message =
        `Your highest-spending category is ${highestCategory[0]} ` +
        `(${formatCurrency(highestCategory[1])}). `;

    message += monthlyTotal > MONTHLY_BUDGET
        ? "Your monthly spending is above your ₹10,000 budget."
        : `You have ${formatCurrency(
            MONTHLY_BUDGET - monthlyTotal
        )} remaining in your monthly budget.`;

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


// 18. QUICK CASH BUTTONS

function setupQuickCash() {
    document.querySelectorAll("[data-quick-cash]").forEach((button) => {
        button.addEventListener("click", () => {
            const amount = button.dataset.amount;
            const title = button.dataset.title || button.dataset.name;
            const category = button.dataset.category;

            if (amount !== undefined) {
                setElementValue("expenseAmount", amount);
                setElementValue("quickCashAmount", amount);
            }

            if (title) {
                setElementValue("expenseTitle", title);
                setElementValue("quickCashName", title);
            }

            if (category) {
                setElementValue("expenseCategory", category);
                setElementValue("quickCashCategory", category);
            }

            const form = $("expenseForm");

            if (form) {
                form.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }
        });
    });

    const quickCashForm = $("quickCashForm");

    if (quickCashForm) {
        quickCashForm.addEventListener("submit", (event) => {
            event.preventDefault();

            setElementValue(
                "expenseTitle",
                getElementValue("quickCashName")
            );

            setElementValue(
                "expenseAmount",
                getElementValue("quickCashAmount")
            );

            setElementValue(
                "expenseCategory",
                getElementValue("quickCashCategory")
            );

            const expenseForm = $("expenseForm");

            if (expenseForm) {
                expenseForm.requestSubmit();
            } else {
                addExpense();
            }
        });
    }
}


// 19. VOICE EXPENSE INPUT

function setupVoiceInput() {
    const voiceButton =
        $("voiceButton") ||
        $("startVoice") ||
        $("voiceInputButton");

    const voiceMessage = $("voiceMessage");

    if (!voiceButton) {
        return;
    }

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        voiceButton.disabled = true;

        if (voiceMessage) {
            voiceMessage.textContent =
                "Voice input is not supported in this browser.";
        }

        return;
    }

    voiceButton.addEventListener("click", () => {
        const recognition = new SpeechRecognition();

        recognition.lang = "en-IN";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        if (voiceMessage) {
            voiceMessage.textContent = "Listening...";
        }

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;

            if (voiceMessage) {
                voiceMessage.textContent = `Heard: ${transcript}`;
            }

            const amountMatch = transcript.trim().match(
                /(?:₹\s*|rs\.?\s*|rupees?\s*)?(\d+(?:\.\d+)?)(?:\s*rupees?)?/i
            );

            if (amountMatch) {
                setElementValue(
                    "expenseAmount",
                    amountMatch[1]
                );

                setElementValue(
                    "quickCashAmount",
                    amountMatch[1]
                );
            }

            const lowerTranscript = transcript.toLowerCase();

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
                if (lowerTranscript.includes(word)) {
                    setElementValue("expenseCategory", category);
                    setElementValue("quickCashCategory", category);
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
                    setElementValue("quickCashName", title);
                }
            }
        };

        recognition.onerror = (event) => {
            if (voiceMessage) {
                voiceMessage.textContent =
                    `Voice input error: ${event.error}`;
            }
        };

        recognition.onend = () => {
            if (voiceMessage && voiceMessage.textContent === "Listening...") {
                voiceMessage.textContent = "Voice input ended.";
            }
        };

        try {
            recognition.start();
        } catch (error) {
            if (voiceMessage) {
                voiceMessage.textContent =
                    "Could not start voice input. Try again.";
            }
        }
    });
}


// 20. CONNECT FORM EVENTS

function setupEventListeners() {
    const signupForm =
        $("signupForm") ||
        $("signUpForm");

    if (signupForm) {
        signupForm.addEventListener("submit", signUp);
    }

    const signinForm =
        $("signinForm") ||
        $("signInForm") ||
        $("loginForm");

    if (signinForm) {
        signinForm.addEventListener("submit", signIn);
    }

    const signupButton =
        $("signupButton") ||
        $("signUpButton");

    if (signupButton && !signupForm) {
        signupButton.addEventListener("click", signUp);
    }

    const signinButton =
        $("signinButton") ||
        $("signInButton") ||
        $("loginButton");

    if (signinButton && !signinForm) {
        signinButton.addEventListener("click", signIn);
    }

    const signoutButton =
        $("signoutButton") ||
        $("signOutButton") ||
        $("logoutButton");

    if (signoutButton) {
        signoutButton.addEventListener("click", signOut);
    }

    const expenseForm = $("expenseForm");

    if (expenseForm) {
        expenseForm.addEventListener("submit", addExpense);
    }

    const searchInput = $("searchExpenses");

    if (searchInput) {
        searchInput.addEventListener("input", renderExpenseList);
    }

    const categoryFilter = $("filterCategory");

    if (categoryFilter) {
        categoryFilter.addEventListener("change", renderExpenseList);
    }

    const monthFilter = $("filterMonth");

    if (monthFilter) {
        monthFilter.addEventListener("change", renderExpenseList);
    }

    document.addEventListener("click", (event) => {
        const deleteButton = event.target.closest(
            "[data-delete-expense]"
        );

        if (deleteButton) {
            deleteExpense(
                deleteButton.dataset.deleteExpense
            );
        }
    });

    setupQuickCash();
    setupVoiceInput();
}


// 21. APP STARTUP

async function initializeApp() {
    if (!initializeSupabase()) {
        return;
    }

    setupEventListeners();

    setElementValue("expenseDate", getToday());

    // Subscribe before retrieving the initial session.
    supabaseClient.auth.onAuthStateChange((event, session) => {
        // Avoid starting overlapping loads for routine token refreshes.
        if (event === "SIGNED_IN" && session?.user) {
            currentUser = session.user;

            showElement("authSection", false);
            showElement("appSection", true);

            // Load once on sign-in; avoid duplicate loading from startup.
            if (!authInitialized) {
                authInitialized = true;

                setTimeout(() => {
                    if (currentUser) {
                        loadExpenses();
                    }
                }, 0);
            }
        }

        if (event === "SIGNED_OUT") {
            authInitialized = false;
            showSignedOut();
        }
    });

    try {
        const { data, error } =
            await supabaseClient.auth.getSession();

        if (error) {
            setMessage(error.message, true);
            showSignedOut();
            return;
        }

        if (data.session?.user) {
            currentUser = data.session.user;
            authInitialized = true;
            await showSignedIn(data.session.user);
        } else {
            showSignedOut();
        }
    } catch (error) {
        showSignedOut();

        setMessage(
            error.message || "Unable to check your login session.",
            true
        );
    }
}

document.addEventListener("DOMContentLoaded", initializeApp);
