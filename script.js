
const MONTHLY_BUDGET = 10000;

const CATEGORIES = [
    "Food",
    "Travel",
    "Shopping",
    "Bills",
    "Education",
    "Health",
    "Other"
];

const CHART_COLORS = [
    "#2563EB",
    "#7C3AED",
    "#059669",
    "#0891B2",
    "#6D28D9",
    "#10B981",
    "#D4A017"
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

if (!form || !expenseList || !allExpenseList ||
    !allExpensesSection || !chartCanvas) {
    throw new Error(
        "PennyPilot could not find required HTML elements. Check index.html."
    );
}

const chartContext = chartCanvas.getContext("2d");

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
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function showMessage(message, isError = false) {
    const element = $("formMessage");
    if (!element) return;

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
    const month = currentMonthKey();

    return expenses.filter(expense => expense.monthKey === month);
}

function getTotals() {
    const monthlyExpenses = getMonthlyExpenses();

    const totals = Object.fromEntries(
        CATEGORIES.map(category => [category, 0])
    );

    monthlyExpenses.forEach(expense => {
        if (totals[expense.category] === undefined) {
            totals[expense.category] = 0;
        }

        totals[expense.category] += expense.amount;
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

    if ($("budget")) {
        $("budget").textContent = formatMoney(MONTHLY_BUDGET);
    }

    if ($("totalSpent")) {
        $("totalSpent").textContent = formatMoney(data.spent);
    }

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
            `${formatMoney(data.spent)} spent · ` +
            `${formatMoney(data.remaining)} remaining`;

        $("progressCaption").style.color =
            data.percent > 100 ? "#b84040" : "#7b8981";

        if (data.percent > 100) {
            $("progressCaption").textContent += " · Budget exceeded!";
        }
    }
}

function renderChart(data) {
    const rect = chartCanvas.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    chartCanvas.width = Math.round(rect.width * dpr);
    chartCanvas.height = Math.round(rect.height * dpr);

    const ctx = chartContext;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const total = data.spent;

    if ($("chartTotal")) {
        $("chartTotal").textContent = formatMoney(total);
    }

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
            $("categoryLegend").innerHTML =
                '<p class="muted">Add expenses to see your category percentages.</p>';
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
            ctx.arc(
                centerX,
                centerY,
                radius,
                drawStart,
                drawEnd
            );

            ctx.strokeStyle = CHART_COLORS[index % CHART_COLORS.length];
            ctx.lineWidth = thickness;
            ctx.lineCap = "butt";
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
            const percent = (amount / total) * 100;

            const row = document.createElement("div");
            row.className = "legend-item";

            const dot = document.createElement("span");
            dot.className = "legend-dot";
            dot.style.backgroundColor =
                CHART_COLORS[index % CHART_COLORS.length];

            const name = document.createElement("span");
            name.className = "legend-name";
            name.textContent = category;

            const value = document.createElement("span");
            value.className = "legend-value";
            value.textContent = formatMoney(amount);

            const percentage = document.createElement("span");
            percentage.className = "legend-percent";
            percentage.textContent = `${percent.toFixed(1)}% of spending`;

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
            container,
            "✦",
            "Your smart insights start here",
            "Add your expenses to see your biggest spending category and personalized saving suggestions."
        );
        return;
    }

    const highest = items[0];
    const highestPercent = (highest.amount / data.spent) * 100;

    addInsight(
        container,
        "↗",
        `${highest.category} is your top category`,
        `You've spent ${formatMoney(highest.amount)} on ${highest.category}, which is ${highestPercent.toFixed(1)}% of your recorded spending.`
    );

    const flexibleCategories = ["Food", "Shopping", "Travel", "Other"];

    const flexibleTotal = items
        .filter(item => flexibleCategories.includes(item.category))
        .reduce((sum, item) => sum + item.amount, 0);

    if (flexibleTotal > 0) {
        addInsight(
            container,
            "₹",
            "Try a 10% savings goal",
            `A 10% reduction in flexible spending would save about ${formatMoney(flexibleTotal * 0.10)}. This is a target, not guaranteed savings.`
        );
    }

    if (data.remaining < 0) {
        addInsight(
            container,
            "!",
            "You've exceeded your budget",
            `You are ${formatMoney(Math.abs(data.remaining))} over your monthly budget. Review flexible expenses.`
        );
    } else {
        addInsight(
            container,
            "✓",
            `${((data.remaining / MONTHLY_BUDGET) * 100).toFixed(1)}% of budget remains`,
            `You have ${formatMoney(data.remaining)} left from your monthly budget of ${formatMoney(MONTHLY_BUDGET)}.`
        );
    }

    const shopping = data.totals.Shopping || 0;

    if (shopping > 0) {
        addInsight(
            container,
            "◇",
            "Review shopping expenses",
            `Your recorded shopping total is ${formatMoney(shopping)}. Check for unnecessary purchases.`
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
    deleteButton.setAttribute("aria-label", `Delete ${expense.name}`);

    deleteButton.addEventListener("click", () => {
        deleteExpense(expense.id);
    });

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

    list.forEach(expense => {
        container.appendChild(makeTransaction(expense));
    });
}

function renderTransactions() {
    const data = getTotals();

    const recent = [...data.monthlyExpenses]
        .reverse()
        .slice(0, 5);

    renderExpenseList(
        expenseList,
        recent,
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

// Add an expense from the main form.
form.addEventListener("submit", event => {
    event.preventDefault();

    const name = $("expenseName").value.trim();
    const amount = Number($("expenseAmount").value);
    const category = $("expenseCategory").value;

    if (!name || !Number.isFinite(amount) ||
        amount <= 0 || amount > 100000000) {
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

if ($("totalCard")) {
    $("totalCard").addEventListener("click", openAllExpenses);
}

if ($("viewAllButton")) {
    $("viewAllButton").addEventListener("click", openAllExpenses);
}

if ($("closeAllButton")) {
    $("closeAllButton").addEventListener("click", () => {
        allExpensesSection.hidden = true;
    });
}

window.addEventListener("resize", () => {
    renderChart(getTotals());
});

// QUICK CASH FEATURE

const quickCashAmount = $("quickCashAmount");
const quickCashName = $("quickCashName");
const quickCashCategory = $("quickCashCategory");

[
    $("expenseCategory"),
    quickCashCategory
].forEach(selectElement => {
    if (
        selectElement &&
        !Array.from(selectElement.options).some(
            option => option.value === "Other"
        )
    ) {
        const option = document.createElement("option");
        option.value = "Other";
        option.textContent = "Other";
        selectElement.appendChild(option);
    }
});

document.querySelectorAll(".cash-amount-button").forEach(button => {
    button.addEventListener("click", () => {
        if (quickCashAmount) {
            quickCashAmount.value = button.dataset.cashAmount;
            quickCashAmount.focus();
        }

        if ($("quickCashMessage")) {
            $("quickCashMessage").textContent = "";
        }
    });
});

if ($("addQuickCashButton")) {
    $("addQuickCashButton").addEventListener("click", () => {
        const name = quickCashName ? quickCashName.value.trim() : "";
        const amount = Number(
            quickCashAmount ? quickCashAmount.value : ""
        );
        const category = quickCashCategory
            ? quickCashCategory.value
            : "";

        if (!name) {
            showQuickCashMessage(
                "Please enter what you spent money on.",
                true
            );
            if (quickCashName) quickCashName.focus();
            return;
        }

        if (!Number.isFinite(amount) ||
            amount <= 0 || amount > 100000000) {
            showQuickCashMessage("Please enter a valid amount.", true);
            if (quickCashAmount) quickCashAmount.focus();
            return;
        }

        if (!CATEGORIES.includes(category)) {
            showQuickCashMessage("Please select a valid category.", true);
            return;
        }

        try {
            addExpenseToStorage({ name, amount, category });

            if (quickCashName) quickCashName.value = "";
            if (quickCashAmount) quickCashAmount.value = "";

            showQuickCashMessage("Cash expense added successfully!");
            renderDashboard();
        } catch (error) {
            console.error("PennyPilot Quick Cash error:", error);
            showQuickCashMessage("Could not save expense.", true);
        }
    });
}

// VOICE EXPENSE FEATURE

(() => {
    const voiceButton = $("voiceButton");
    const voiceMessage = $("voiceMessage");
    const nameInput = $("quickCashName");
    const amountInput = $("quickCashAmount");
    const categoryInput = $("quickCashCategory");

    if (!voiceButton || !voiceMessage || !nameInput ||
        !amountInput || !categoryInput) {
        return;
    }

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

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

        if (/\b(tea|coffee|food|lunch|dinner|breakfast|snack|snacks|pizza|meal|restaurant|juice|water)\b/.test(text)) {
            return "Food";
        }

        if (/\b(bus|train|metro|auto|taxi|cab|petrol|fuel|travel|parking)\b/.test(text)) {
            return "Travel";
        }

        if (/\b(shopping|clothes|shirt|shoes|dress|bag)\b/.test(text)) {
            return "Shopping";
        }

        if (/\b(bill|electricity|recharge|internet|mobile bill)\b/.test(text)) {
            return "Bills";
        }

        if (/\b(book|books|course|college|school|education|tuition)\b/.test(text)) {
            return "Education";
        }

        if (/\b(doctor|medicine|medical|hospital|health)\b/.test(text)) {
            return "Health";
        }

        return "Other";
    }

    function parseExpense(transcript) {
        const spokenText = transcript.trim();

        const amountMatch = spokenText.match(
            /(?:₹\s*|rs\.?\s*|rupees?\s*)?(\d+(?:\.\d+)?)(?:\s*rupees?)?/i
        );

        if (!amountMatch) return null;

        const amount = Number(amountMatch[1]);

        if (!Number.isFinite(amount) || amount <= 0) {
            return null;
        }

        let name = spokenText
            .replace(amountMatch[0], " ")
            .replace(
                /\b(i\s+)?(spent|spend|paid|pay|bought|buy|purchased|purchase|for|on|rupees?|rs)\b/gi,
                " "
            )
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
        voiceMessage.style.color = "#286b50";

        isListening = true;
        voiceButton.disabled = true;

        try {
            recognition.start();
        } catch (error) {
            isListening = false;
            voiceButton.disabled = false;
            voiceMessage.textContent =
                "Could not start the microphone. Please try again.";
            console.error("PennyPilot voice error:", error);
        }
    });

    recognition.onresult = event => {
        const transcript = event.results[0][0].transcript;
        const expense = parseExpense(transcript);

        if (!expense) {
            voiceMessage.textContent =
                `I heard "${transcript}", but couldn't find both an amount and an expense name. Please try again.`;
            voiceMessage.style.color = "#b45309";
            return;
        }

        nameInput.value = expense.name;
        amountInput.value = expense.amount;
        categoryInput.value = expense.category;

        voiceMessage.textContent =
            `Heard: "${transcript}". Check the fields, then click Add Cash Expense.`;
        voiceMessage.style.color = "#286b50";
    };

    recognition.onerror = event => {
        if (
            event.error === "not-allowed" ||
            event.error === "service-not-allowed"
        ) {
            voiceMessage.textContent =
                "Microphone access was blocked. Allow microphone access in your browser settings.";
        } else if (event.error === "no-speech") {
            voiceMessage.textContent =
                "I didn't hear anything. Click the microphone and try again.";
        } else {
            voiceMessage.textContent =
                `Voice recognition issue: ${event.error}. Please try again.`;
        }

        voiceMessage.style.color = "#b45309";
    };

    recognition.onend = () => {
        isListening = false;
        voiceButton.disabled = false;
    };
})();

// START THE DASHBOARD

loadExpensesFromStorage();
renderDashboard();
