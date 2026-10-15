```javascript
const MONTHLY_BUDGET = 10000;

const CATEGORIES = [
    "Food", "Travel", "Shopping", "Bills",
    "Education", "Health", "Other"
];

const CHART_COLORS = [
    "#2563EB", "#7C3AED", "#059669", "#0891B2",
    "#6D28D9", "#10B981", "#D4A017"
];

const STORAGE_KEY = "pennypilot-expenses";

const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
});

const $ = id => document.getElementById(id);

const form = $("expenseForm");
const expenseList = $("expenseList");
const allExpenseList = $("allExpenseList");
const allExpensesSection = $("allExpensesSection");
const chartCanvas = $("expenseChart");
const chartContext = chartCanvas ? chartCanvas.getContext("2d") : null;

let expenses = [];

function formatMoney(amount) {
    return currency.format(Number(amount) || 0);
}

function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(
        now.getMonth() + 1
    ).padStart(2, "0")}`;
}

function todayIsoDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function showMessage(message, isError = false) {
    const element = $("formMessage") || $("appMessage");
    if (!element) {
        console.log(message);
        return;
    }
    element.textContent = message;
    element.style.color = isError ? "#b84040" : "#286b50";
}

function showQuickCashMessage(message, isError = false) {
    const element = $("quickCashMessage");
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#b84040" : "#286b50";
}

function saveExpensesToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function loadExpensesFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const data = saved ? JSON.parse(saved) : [];

        if (!Array.isArray(data)) {
            expenses = [];
            return;
        }

        expenses = data
            .filter(item =>
                item &&
                item.id != null &&
                Number.isFinite(Number(item.amount)) &&
                Number(item.amount) > 0
            )
            .map(item => {
                const isoDate = item.expenseDate ||
                    item.dateIso ||
                    todayIsoDate();

                const parsedDate = new Date(`${isoDate}T00:00:00`);

                return {
                    id: String(item.id),
                    name: item.name || item.title || "Untitled expense",
                    amount: Number(item.amount),
                    category: CATEGORIES.includes(item.category)
                        ? item.category
                        : "Other",
                    date: Number.isNaN(parsedDate.getTime())
                        ? isoDate
                        : parsedDate.toLocaleDateString("en-IN"),
                    monthKey: item.monthKey || String(isoDate).slice(0, 7),
                    expenseDate: isoDate
                };
            });
    } catch (error) {
        console.error("Could not load saved expenses:", error);
        expenses = [];
    }
}

function addExpenseToStorage(expense) {
    const isoDate = todayIsoDate();

    const newExpense = {
        id: (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
        ) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        name: expense.name,
        title: expense.name,
        amount: Number(expense.amount),
        category: expense.category,
        date: new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN"),
        expenseDate: isoDate,
        monthKey: isoDate.slice(0, 7)
    };

    expenses.push(newExpense);
    saveExpensesToStorage();
    return newExpense;
}

function deleteExpense(id) {
    expenses = expenses.filter(
        expense => String(expense.id) !== String(id)
    );

    saveExpensesToStorage();
    showMessage("Expense deleted successfully!");
    renderDashboard();
}

function getMonthlyExpenses() {
    return expenses.filter(expense => expense.monthKey === currentMonthKey());
}

function getTotals() {
    const monthlyExpenses = getMonthlyExpenses();

    const totals = Object.fromEntries(
        CATEGORIES.map(category => [category, 0])
    );

    monthlyExpenses.forEach(expense => {
        totals[expense.category] =
            (totals[expense.category] || 0) + expense.amount;
    });

    const spent = monthlyExpenses.reduce(
        (sum, expense) => sum + expense.amount,
        0
    );

    return {
        monthlyExpenses,
        totals,
        spent,
        remaining: MONTHLY_BUDGET - spent,
        percent: (spent / MONTHLY_BUDGET) * 100
    };
}

function renderSummary(data) {
    const todayDate = $("todayDate");

    if (todayDate) {
        todayDate.textContent = new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    if ($("budget")) $("budget").textContent = formatMoney(MONTHLY_BUDGET);
    if ($("totalSpent")) $("totalSpent").textContent = formatMoney(data.spent);

    if ($("remaining")) {
        $("remaining").textContent = formatMoney(data.remaining);
        $("remaining").style.color =
            data.remaining < 0 ? "#b84040" : "#286b50";
    }

    if ($("budgetPercentage")) {
        $("budgetPercentage").textContent =
            `${Number(data.percent.toFixed(1))}%`;
    }

    if ($("progressFill")) {
        $("progressFill").style.width =
            `${Math.min(100, Math.max(0, data.percent))}%`;
    }

    if ($("budgetProgress")) {
        $("budgetProgress").setAttribute(
            "aria-valuenow",
            Math.min(100, Math.max(0, data.percent))
        );
    }

    if ($("progressCaption")) {
        $("progressCaption").textContent =
            `${formatMoney(data.spent)} spent · ${formatMoney(data.remaining)} remaining`;

        if (data.percent > 100) {
            $("progressCaption").textContent += " · Budget exceeded!";
        }
    }
}

function renderChart(data) {
    if (!chartCanvas || !chartContext) return;

    const rect = chartCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    chartCanvas.width = Math.round(rect.width * dpr);
    chartCanvas.height = Math.round(rect.height * dpr);

    const ctx = chartContext;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const total = data.spent;
    if ($("chartTotal")) $("chartTotal").textContent = formatMoney(total);

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const radius = Math.min(centerX, centerY) * 0.82;
    const thickness = Math.max(17, radius * 0.27);

    if (total === 0) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "#e8ece6";
        ctx.lineWidth = thickness;
        ctx.stroke();

        if ($("categoryLegend")) {
            $("categoryLegend").textContent =
                "Add expenses to see your category percentages.";
        }
        return;
    }

    let startAngle = -Math.PI / 2;
    const gap = 0.035;

    CATEGORIES.forEach((category, index) => {
        const amount = data.totals[category] || 0;
        if (amount <= 0) return;

        const sliceAngle = (amount / total) * Math.PI * 2;
        const drawStart = startAngle + gap / 2;
        const drawEnd = startAngle + sliceAngle - gap / 2;

        if (drawEnd > drawStart) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, drawStart, drawEnd);
            ctx.strokeStyle = CHART_COLORS[index % CHART_COLORS.length];
            ctx.lineWidth = thickness;
            ctx.stroke();
        }

        startAngle += sliceAngle;
    });

    const legend = $("categoryLegend");
    if (!legend) return;

    legend.replaceChildren();

    CATEGORIES.filter(category => data.totals[category] > 0)
        .forEach(category => {
            const index = CATEGORIES.indexOf(category);
            const amount = data.totals[category];

            const row = document.createElement("div");
            row.className = "legend-item";

            const dot = document.createElement("span");
            dot.className = "legend-dot";
            dot.style.backgroundColor = CHART_COLORS[index];

            const name = document.createElement("span");
            name.className = "legend-name";
            name.textContent = category;

            const value = document.createElement("span");
            value.className = "legend-value";
            value.textContent = formatMoney(amount);

            const percentage = document.createElement("span");
            percentage.className = "legend-percent";
            percentage.textContent =
                `${((amount / total) * 100).toFixed(1)}% of spending`;

            value.appendChild(percentage);
            row.append(dot, name, value);
            legend.appendChild(row);
        });
}

function addInsight(container, symbol, title, description) {
    const item = document.createElement("div");
    item.className = "insight-item";

    const icon = document.createElement("span");
    icon.className = "insight-icon";
    icon.textContent = symbol;

    const content = document.createElement("div");
    const heading = document.createElement("strong");
    const paragraph = document.createElement("p");

    heading.textContent = title;
    paragraph.textContent = description;

    content.append(heading, paragraph);
    item.append(icon, content);
    container.appendChild(item);
}

function renderInsights(data) {
    const container = $("insights");
    if (!container) return;

    container.replaceChildren();

    const items = CATEGORIES
        .map((category, index) => ({
            category,
            amount: data.totals[category] || 0,
            color: CHART_COLORS[index % CHART_COLORS.length]
        }))
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount);

    if (data.spent === 0) {
        addInsight(
            container, "✦", "Your smart insights start here",
            "Add your expenses to see your biggest spending category and saving suggestions."
        );
        return;
    }

    const highest = items[0];

    addInsight(
        container, "↗", `${highest.category} is your top category`,
        `You've spent ${formatMoney(highest.amount)} on ${highest.category}, which is ${((highest.amount / data.spent) * 100).toFixed(1)}% of your recorded spending.`
    );

    const flexibleCategories = ["Food", "Shopping", "Travel", "Other"];
    const flexibleTotal = items
        .filter(item => flexibleCategories.includes(item.category))
        .reduce((sum, item) => sum + item.amount, 0);

    if (flexibleTotal > 0) {
        addInsight(
            container, "₹", "Try a 10% savings goal",
            `A 10% reduction in flexible spending would save about ${formatMoney(flexibleTotal * 0.10)}.`
        );
    }

    if (data.remaining < 0) {
        addInsight(
            container, "!", "You've exceeded your budget",
            `You are ${formatMoney(Math.abs(data.remaining))} over your monthly budget.`
        );
    } else {
        addInsight(
            container, "✓", "Budget remaining",
            `You have ${formatMoney(data.remaining)} left from your monthly budget of ${formatMoney(MONTHLY_BUDGET)}.`
        );
    }
}

function makeTransaction(expense) {
    const row = document.createElement("div");
    row.className = "transaction";

    const details = document.createElement("div");
    details.className = "transaction-details";

    const name = document.createElement("strong");
    name.textContent = expense.name;

    const category = document.createElement("small");
    category.textContent = `${expense.category} · ${expense.date}`;

    details.append(name, category);

    const amount = document.createElement("strong");
    amount.className = "transaction-amount";
    amount.textContent = `−${formatMoney(expense.amount)}`;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", () => deleteExpense(expense.id));

    row.append(details, amount, deleteButton);
    return row;
}

function renderExpenseList(container, list, emptyMessage) {
    if (!container) return;

    container.replaceChildren();

    if (list.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = emptyMessage;
        container.appendChild(empty);
        return;
    }

    list.forEach(expense => container.appendChild(makeTransaction(expense)));
}

function renderTransactions() {
    const data = getTotals();

    renderExpenseList(
        expenseList,
        [...data.monthlyExpenses].reverse().slice(0, 5),
        "No expenses recorded this month. Add your first one!"
    );

    renderExpenseList(
        allExpenseList,
        [...expenses].reverse(),
        "No expenses recorded yet."
    );
}

function renderDashboard() {
    const data = getTotals();
    renderSummary(data);
    renderChart(data);
    renderInsights(data);
    renderTransactions();
}

function openAllExpenses() {
    if (!allExpensesSection) return;

    allExpensesSection.hidden = false;
    renderExpenseList(
        allExpenseList,
        [...expenses].reverse(),
        "No expenses recorded yet."
    );

    allExpensesSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

if (form) {
    form.addEventListener("submit", event => {
        event.preventDefault();

        const nameField = $("expenseName") || $("expenseTitle");
        const name = nameField ? nameField.value.trim() : "";
        const amount = Number($("expenseAmount")?.value);
        const category = $("expenseCategory")?.value;

        if (!name || !Number.isFinite(amount) || amount <= 0) {
            showMessage("Enter a valid name and amount.", true);
            return;
        }

        if (!CATEGORIES.includes(category)) {
            showMessage("Please select a valid category.", true);
            return;
        }

        try {
            addExpenseToStorage({ name, amount, category });
            form.reset();
            showMessage("Expense added successfully!");
            renderDashboard();
        } catch (error) {
            console.error("PennyPilot save error:", error);
            showMessage("Could not save expense in this browser.", true);
        }
    });
}

if ($("totalCard")) $("totalCard").addEventListener("click", openAllExpenses);
if ($("viewAllButton")) $("viewAllButton").addEventListener("click", openAllExpenses);

if ($("closeAllButton")) {
    $("closeAllButton").addEventListener("click", () => {
        if (allExpensesSection) allExpensesSection.hidden = true;
    });
}

window.addEventListener("resize", () => renderChart(getTotals()));

// QUICK CASH
const quickCashAmount = $("quickCashAmount");
const quickCashName = $("quickCashName");
const quickCashCategory = $("quickCashCategory");

document.querySelectorAll(".cash-amount-button").forEach(button => {
    button.addEventListener("click", () => {
        if (quickCashAmount) {
            quickCashAmount.value = button.dataset.cashAmount;
            quickCashAmount.focus();
        }
        if ($("quickCashMessage")) $("quickCashMessage").textContent = "";
    });
});

if ($("addQuickCashButton")) {
    $("addQuickCashButton").addEventListener("click", event => {
        event.preventDefault();

        const name = quickCashName?.value.trim() || "";
        const amount = Number(quickCashAmount?.value);
        const category = quickCashCategory?.value || "";

        if (!name || !Number.isFinite(amount) || amount <= 0) {
            showQuickCashMessage("Enter an expense name and a valid amount.", true);
            return;
        }

        if (!CATEGORIES.includes(category)) {
            showQuickCashMessage("Please select a valid category.", true);
            return;
        }

        addExpenseToStorage({ name, amount, category });
        if (quickCashName) quickCashName.value = "";
        if (quickCashAmount) quickCashAmount.value = "";
        showQuickCashMessage("Cash expense added successfully!");
        renderDashboard();
    });
}

// COMPATIBILITY WITH QUICK ADD BUTTONS
document.querySelectorAll("[data-quick-cash]").forEach(button => {
    button.addEventListener("click", () => {
        const titleField = $("expenseTitle") || $("expenseName");
        const amountField = $("expenseAmount");

        if (amountField) amountField.value = button.dataset.quickCash;
        if (titleField && !titleField.value.trim()) {
            titleField.value = "Quick expense";
        }
        if ($("expenseCategory") && !$("expenseCategory").value) {
            $("expenseCategory").value = "Other";
        }
        if ($("expenseDate") && !$("expenseDate").value) {
            $("expenseDate").value = todayIsoDate();
        }

        if (titleField) titleField.focus();
        showMessage("Amount filled in. Complete the expense form and submit.");
    });
});

// VOICE EXPENSE FEATURE
(() => {
    const voiceButton = $("voiceButton");
    const voiceMessage = $("voiceMessage");
    const nameInput = $("quickCashName");
    const amountInput = $("quickCashAmount");
    const categoryInput = $("quickCashCategory");

    if (!voiceButton || !voiceMessage || !nameInput ||
        !amountInput || !categoryInput) return;

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        voiceButton.disabled = true;
        voiceMessage.textContent =
            "Voice recognition is not supported in this browser. Try Google Chrome.";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let isListening = false;

    function guessCategory(name) {
        const text = name.toLowerCase();

        if (/\b(tea|coffee|food|lunch|dinner|breakfast|snack|pizza|meal|restaurant|juice|water)\b/.test(text)) return "Food";
        if (/\b(bus|train|metro|auto|taxi|cab|petrol|fuel|travel|parking)\b/.test(text)) return "Travel";
        if (/\b(shopping|clothes|shirt|shoes|dress|bag)\b/.test(text)) return "Shopping";
        if (/\b(bill|electricity|recharge|internet|mobile bill)\b/.test(text)) return "Bills";
        if (/\b(book|books|course|college|school|education|tuition)\b/.test(text)) return "Education";
        if (/\b(doctor|medicine|medical|hospital|health)\b/.test(text)) return "Health";

        return "Other";
    }

    function parseExpense(transcript) {
        const amountMatch = transcript.trim().match(
            /(?:₹\s*|rs\.?\s*|rupees?\s*)?(\d+(?:\.\d+)?)(?:\s*rupees?)?/i
        );

        if (!amountMatch) return null;

        const amount = Number(amountMatch[1]);
        if (!Number.isFinite(amount) || amount <= 0) return null;

        let name = transcript.trim()
            .replace(amountMatch[0], " ")
            .replace(/\b(i\s+)?(spent|spend|paid|pay|bought|buy|purchased|purchase|for|on|rupees?|rs)\b/gi, " ")
            .replace(/[₹,]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        name = name.replace(/^(a|an|the)\s+/i, "").trim();
        if (!name) return null;

        return {
            name: name.charAt(0).toUpperCase() + name.slice(1),
            amount,
            category: guessCategory(name)
        };
    }

    voiceButton.addEventListener("click", () => {
        if (isListening) {
            recognition.stop();
            return;
        }

        voiceMessage.textContent =
            "Listening... Say, for example, 'Spent 20 rupees on tea'.";
        isListening = true;
        voiceButton.disabled = true;

        try {
            recognition.start();
        } catch (error) {
            isListening = false;
            voiceButton.disabled = false;
            voiceMessage.textContent =
                "Could not start the microphone. Please try again.";
        }
    });

    recognition.onresult = event => {
        const transcript = event.results[0][0].transcript;
        const expense = parseExpense(transcript);

        if (!expense) {
            voiceMessage.textContent =
                `I heard "${transcript}", but couldn't find both an amount and an expense name.`;
            return;
        }

        nameInput.value = expense.name;
        amountInput.value = expense.amount;
        categoryInput.value = expense.category;

        voiceMessage.textContent =
            `Heard "${transcript}". Check the fields, then click Add Cash Expense.`;
    };

    recognition.onerror = event => {
        voiceMessage.textContent = event.error === "not-allowed"
            ? "Microphone access was blocked. Allow microphone access in browser settings."
            : `Voice recognition issue: ${event.error}. Please try again.`;
    };

    recognition.onend = () => {
        isListening = false;
        voiceButton.disabled = false;
    };
})();

// SUPABASE AUTHENTICATION
(() => {
    const authSection = $("authSection");
    const appSection = $("appSection");
    const emailField = $("authEmail");
    const passwordField = $("authPassword");
    const signUpButton = $("signUpButton");
    const signInButton = $("signInButton");
    const signOutButton = $("signOutButton");
    const message = $("appMessage");

    function authMessage(text, isError = false) {
        if (!message) {
            console[isError ? "error" : "log"](text);
            alert(text);
            return;
        }

        message.textContent = text;
        message.style.color = isError ? "#b84040" : "#286b50";
    }

    // Report missing HTML elements instead of silently doing nothing.
    const missingElements = [];

    if (!authSection) missingElements.push("authSection");
    if (!appSection) missingElements.push("appSection");
    if (!emailField) missingElements.push("authEmail");
    if (!passwordField) missingElements.push("authPassword");
    if (!signUpButton) missingElements.push("signUpButton");
    if (!signInButton) missingElements.push("signInButton");
    if (!signOutButton) missingElements.push("signOutButton");

    if (missingElements.length) {
        console.error(
            "PennyPilot authentication HTML elements are missing:",
            missingElements.join(", ")
        );
        authMessage(
            "Sign-in setup error: missing HTML element(s): " +
            missingElements.join(", ") +
            ". Check the IDs in index.html.",
            true
        );
        return;
    }

    function showSignedOut() {
        authSection.hidden = false;
        appSection.hidden = true;
    }

    function showSignedIn(user) {
        authSection.hidden = true;
        appSection.hidden = false;

        if ($("userEmail")) {
            $("userEmail").textContent = user?.email || "";
        }

        renderDashboard();
    }

    if (!window.supabase ||
        typeof window.supabase.createClient !== "function") {
        showSignedOut();
        authMessage(
            "Supabase library did not load. Check that the Supabase CDN script is included before script.js in index.html.",
            true
        );
        return;
    }

    const SUPABASE_URL = "https://dqcjhbiduogttljgfkau.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_eHuDa1uoMvWdv-hqAWYviA_YrnQoBhg";

    const supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    // Prevent form submission or page reload if these buttons are inside a form.
    signUpButton.type = "button";
    signInButton.type = "button";
    signOutButton.type = "button";

    signUpButton.addEventListener("click", async event => {
        event.preventDefault();

        const email = emailField.value.trim();
        const password = passwordField.value;

        if (!email || !password) {
            authMessage("Enter your email and password.", true);
            return;
        }

        if (password.length < 6) {
            authMessage("Password must contain at least 6 characters.", true);
            return;
        }

        signUpButton.disabled = true;
        authMessage("Creating your account...");

        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password
            });

            if (error) throw error;

            if (data.session && data.user) {
                authMessage("Account created successfully!");
                showSignedIn(data.user);
            } else {
                authMessage(
                    "Your account request was successful. Check your email for a confirmation link, then sign in."
                );
            }
        } catch (error) {
            console.error("PennyPilot sign-up error:", error);
            authMessage(
                error.message || "Could not create your account. Please try again.",
                true
            );
        } finally {
            signUpButton.disabled = false;
        }
    });

    signInButton.addEventListener("click", async event => {
        event.preventDefault();

        const email = emailField.value.trim();
        const password = passwordField.value;

        if (!email || !password) {
            authMessage("Enter your email and password.", true);
            return;
        }

        signInButton.disabled = true;
        authMessage("Signing in...");

        try {
            const { data, error } =
                await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

            if (error) throw error;

            authMessage("Signed in successfully!");
            showSignedIn(data.user);
        } catch (error) {
            console.error("PennyPilot sign-in error:", error);
            authMessage(
                error.message || "Could not sign in. Check your credentials.",
                true
            );
        } finally {
            signInButton.disabled = false;
        }
    });

    signOutButton.addEventListener("click", async event => {
        event.preventDefault();
        signOutButton.disabled = true;

        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;

            showSignedOut();
            authMessage("You have signed out.");
        } catch (error) {
            console.error("PennyPilot sign-out error:", error);
            authMessage(error.message || "Could not sign out.", true);
        } finally {
            signOutButton.disabled = false;
        }
    });

    // Keep the screen synchronized with the saved Supabase login session.
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            showSignedIn(session.user);
        } else {
            showSignedOut();
        }
    });

    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) {
            console.error("PennyPilot session error:", error);
            showSignedOut();
            authMessage(error.message || "Could not check your session.", true);
            return;
        }

        if (data.session?.user) {
            showSignedIn(data.session.user);
        } else {
            showSignedOut();
        }
    }).catch(error => {
        console.error("PennyPilot session error:", error);
        showSignedOut();
        authMessage("Could not check your login session. Please refresh.", true);
    });
})();

// START THE DASHBOARD
loadExpensesFromStorage();
renderDashboard();
```
