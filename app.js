// Global state
window.carsList = [];
window.chatHistory = [];

const API_BASE = ""; // Relative path as backend serves static files

// Helper: Format numbers as Indian Rupees (INR)
function formatINR(number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(number);
}

// Fetch all cars on app startup
async function fetchCarsList() {
  try {
    const response = await fetch(`${API_BASE}/api/cars`);
    if (!response.ok) throw new Error("Failed to load cars specs.");
    window.carsList = await response.json();
    return window.carsList;
  } catch (error) {
    console.error("Error loading cars database:", error);
    return [];
  }
}

// ==========================================
// 1. DASHBOARD LOGIC (index.html)
// ==========================================
async function initDashboard() {
  const carsGrid = document.getElementById("cars-grid");
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("search-btn");
  const filtersContainer = document.getElementById("category-filters");

  let cars = await fetchCarsList();
  
  if (cars.length === 0) {
    carsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">
        <i data-lucide="alert-circle" style="width: 32px; height: 32px; margin-bottom: 12px;"></i>
        <p>Failed to load database. Is the backend server running?</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  function renderGrid(filteredCars) {
    if (filteredCars.length === 0) {
      carsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <i data-lucide="compass" style="width: 32px; height: 32px; margin-bottom: 12px;"></i>
          <p>No matching vehicles found. Try searching electric, SUV, or sports models.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    carsGrid.innerHTML = filteredCars.map(car => `
      <div class="card">
        <div class="card-img-wrapper">
          <img src="${car.image_url}" alt="${car.brand} ${car.name}" onerror="this.src='/assets/electric.jpg'">
          <span class="card-badge">${car.type}</span>
        </div>
        <div class="card-body">
          <div class="card-header-row">
            <div>
              <div class="card-brand">${car.brand}</div>
              <h3 class="card-title">${car.name}</h3>
            </div>
            <div class="card-price">${car.price}</div>
          </div>
          
          <div class="card-specs">
            <div class="spec-item">
              <span class="spec-label">Power</span>
              <span class="spec-value">${car.horsepower} hp</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Engine/Battery</span>
              <span class="spec-value">${car.engine_battery.split('(')[0]}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Acceleration</span>
              <span class="spec-value">${car.acceleration}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Range/Efficiency</span>
              <span class="spec-value">${car.efficiency_range}</span>
            </div>
          </div>

          <div class="card-actions">
            <button class="secondary" onclick="window.location.href='compare.html?car1=${car.id}'">
              <i data-lucide="git-compare" style="width:14px; height:14px;"></i> Compare
            </button>
            <button onclick="window.location.href='chat.html?message=Tell me about the ${car.brand} ${car.name}'">
              <i data-lucide="message-square" style="width:14px; height:14px;"></i> Inquire
            </button>
          </div>
        </div>
      </div>
    `).join("");
    lucide.createIcons();
  }

  // Initial Grid Render
  renderGrid(cars);

  // Search logic
  function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    const activeCategory = filtersContainer.querySelector(".tag-btn.active").dataset.category;
    
    let filtered = cars;
    if (activeCategory !== "All") {
      filtered = filtered.filter(c => c.type === activeCategory);
    }
    if (query !== "") {
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.brand.toLowerCase().includes(query) || 
        c.type.toLowerCase().includes(query) ||
        c.engine_battery.toLowerCase().includes(query)
      );
    }
    renderGrid(filtered);
  }

  searchBtn.addEventListener("click", handleSearch);
  searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") handleSearch();
  });

  // Filter tag buttons
  filtersContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("tag-btn")) {
      filtersContainer.querySelectorAll(".tag-btn").forEach(btn => btn.classList.remove("active"));
      e.target.classList.add("active");
      handleSearch(); // trigger refilter
    }
  });
}

// ==========================================
// 2. COMPARE LOGIC (compare.html)
// ==========================================
async function initCompare() {
  const car1Select = document.getElementById("car1-select");
  const car2Select = document.getElementById("car2-select");
  
  const car1Img = document.getElementById("car1-img");
  const car2Img = document.getElementById("car2-img");
  
  const car1Title = document.getElementById("car1-title-display");
  const car2Title = document.getElementById("car2-title-display");
  
  const car1Price = document.getElementById("car1-price-display");
  const car2Price = document.getElementById("car2-price-display");

  const tableHeaderCar1 = document.getElementById("table-car1-header");
  const tableHeaderCar2 = document.getElementById("table-car2-header");
  const tableBody = document.getElementById("comparison-table-body");
  const compareChatBtn = document.getElementById("compare-chat-btn");

  let cars = await fetchCarsList();

  if (cars.length === 0) return;

  // Populate selectors
  const dropdownHtml = cars.map(c => `<option value="${c.id}">${c.brand} ${c.name}</option>`).join("");
  car1Select.innerHTML = dropdownHtml;
  car2Select.innerHTML = dropdownHtml;

  // Read URL parameters if any
  const urlParams = new URLSearchParams(window.location.search);
  let car1Id = urlParams.get("car1") || "tesla-model-y";
  let car2Id = urlParams.get("car2") || "bmw-x5";

  // Ensure default selects match
  car1Select.value = car1Id;
  car2Select.value = car2Id;

  // Render spec comparison
  function updateComparison() {
    const c1 = cars.find(c => c.id === car1Select.value);
    const c2 = cars.find(c => c.id === car2Select.value);

    if (!c1 || !c2) return;

    // Update Visual Cards
    car1Img.src = c1.image_url;
    car2Img.src = c2.image_url;
    car1Title.innerText = `${c1.brand} ${c1.name}`;
    car2Title.innerText = `${c2.brand} ${c2.name}`;
    car1Price.innerText = c1.price;
    car2Price.innerText = c2.price;

    tableHeaderCar1.innerText = `${c1.brand} ${c1.name}`;
    tableHeaderCar2.innerText = `${c2.brand} ${c2.name}`;

    // Build specification table
    const specs = [
      { name: "Brand & Model", val1: `<strong>${c1.brand} ${c1.name}</strong>`, val2: `<strong>${c2.brand} ${c2.name}</strong>` },
      { name: "Vehicle Segment", val1: c1.type, val2: c2.type },
      { name: "Price (Ex-Showroom)", val1: `<strong>${c1.price}</strong>`, val2: `<strong>${c2.price}</strong>` },
      { name: "Power Train/Battery", val1: c1.engine_battery, val2: c2.engine_battery },
      { name: "Horsepower Output", val1: `${c1.horsepower} HP`, val2: `${c2.horsepower} HP` },
      { name: "Mileage/Range", val1: c1.efficiency_range, val2: c2.efficiency_range },
      { name: "Acceleration (0-100 km/h)", val1: c1.acceleration, val2: c2.acceleration },
      { name: "Top Speed", val1: c1.topSpeed, val2: c2.topSpeed },
      { 
        name: "Key Pros", 
        val1: `<ul class="pros-list">${c1.pros.map(p => `<li>${p}</li>`).join("")}</ul>`,
        val2: `<ul class="pros-list">${c2.pros.map(p => `<li>${p}</li>`).join("")}</ul>`
      },
      { 
        name: "Critical Cons", 
        val1: `<ul class="cons-list">${c1.cons.map(c => `<li>${c}</li>`).join("")}</ul>`,
        val2: `<ul class="cons-list">${c2.cons.map(c => `<li>${c}</li>`).join("")}</ul>`
      }
    ];

    tableBody.innerHTML = specs.map(spec => `
      <tr>
        <td class="feature-name">${spec.name}</td>
        <td class="car-val">${spec.val1}</td>
        <td class="car-val">${spec.val2}</td>
      </tr>
    `).join("");
  }

  // Event Listeners
  car1Select.addEventListener("change", updateComparison);
  car2Select.addEventListener("change", updateComparison);

  compareChatBtn.addEventListener("click", () => {
    const c1 = cars.find(c => c.id === car1Select.value);
    const c2 = cars.find(c => c.id === car2Select.value);
    const queryMsg = `Compare the ${c1.brand} ${c1.name} versus the ${c2.brand} ${c2.name} in detail.`;
    window.location.href = `chat.html?message=${encodeURIComponent(queryMsg)}`;
  });

  // Initial Run
  updateComparison();
}

// ==========================================
// 3. AI CHATBOT LOGIC (chat.html)
// ==========================================
async function initChat() {
  const chatWindow = document.getElementById("chat-window");
  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const clearBtn = document.getElementById("clear-chat-btn");
  const suggestedContainer = document.getElementById("suggested-prompts");

  // Fetch cars first to build local widget logic
  await fetchCarsList();

  // Scroll to bottom helper
  function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  // Markdown parsing helper
  function parseMarkdown(text) {
    let html = text;
    // Replace Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    // Replace Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    // Replace Lists
    html = html.replace(/^\s*-\s*(.*$)/gim, '<li>$1</li>');
    // Wrap lists in ul
    html = html.replace(/(<li>.*<\/li>)/sim, '<ul>$1</ul>');
    return html;
  }

  // Render chatbot message bubbles
  function renderMessage(role, content, widget = null) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.innerHTML = role === "bot" ? parseMarkdown(content) : content;
    msgDiv.appendChild(bubble);

    if (widget) {
      const widgetDiv = document.createElement("div");
      widgetDiv.className = "widget-container";
      
      if (widget.type === "recommendation" && widget.data && widget.data.carIds) {
        widgetDiv.innerHTML = renderRecommendationWidget(widget.data.carIds);
      } else if (widget.type === "comparison" && widget.data) {
        widgetDiv.innerHTML = renderInlineComparisonWidget(widget.data.car1, widget.data.car2);
      } else if (widget.type === "loan" && widget.data) {
        widgetDiv.innerHTML = renderLoanWidget(widget.data.carId, widget.data.name, widget.data.price);
        // Setup instant dynamic loan math triggers
        setTimeout(() => setupLoanCalculatorListeners(widgetDiv), 100);
      }
      
      msgDiv.appendChild(widgetDiv);
    }

    const timeDiv = document.createElement("div");
    timeDiv.className = "message-time";
    const now = new Date();
    timeDiv.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    msgDiv.appendChild(timeDiv);

    chatWindow.appendChild(msgDiv);
    scrollToBottom();
  }

  // Recommendation widget HTML
  function renderRecommendationWidget(carIds) {
    const matches = window.carsList.filter(c => carIds.includes(c.id));
    if (matches.length === 0) return "";

    return `
      <div class="widget-rec-list">
        ${matches.map(c => `
          <div class="widget-rec-card">
            <img src="${c.image_url}" alt="${c.name}" class="widget-rec-img" onerror="this.src='/assets/electric.jpg'">
            <div class="widget-rec-body">
              <span class="widget-rec-name">${c.brand} ${c.name}</span>
              <span class="widget-rec-price">${c.price}</span>
              <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">${c.horsepower} HP | ${c.type}</div>
              <button class="widget-rec-btn" onclick="window.location.href='compare.html?car1=${c.id}'">
                Compare Specs
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // Inline comparison grid
  function renderInlineComparisonWidget(car1Id, car2Id) {
    const c1 = window.carsList.find(c => c.id === car1Id);
    const c2 = window.carsList.find(c => c.id === car2Id);

    if (!c1 || !c2) return "";

    return `
      <div style="background: rgba(17,24,39,0.9); border:1px solid var(--border-color); border-radius:12px; padding:16px;">
        <h4 style="font-family:var(--font-display); margin-bottom:12px; color:var(--accent-cyan);">Specs Battle Grid</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
          <div style="text-align:center; padding:10px; border-right:1px solid rgba(255,255,255,0.05);">
            <div style="font-weight:600; font-size:14px; margin-bottom:4px;">${c1.brand} ${c1.name}</div>
            <div style="color:var(--accent-cyan); font-weight:700; margin-bottom:8px;">${c1.price}</div>
            <div style="font-size:12.5px; color:var(--text-secondary); line-height:1.4;">
              ${c1.horsepower} HP<br>
              ${c1.engine_battery.split('(')[0]}<br>
              ${c1.efficiency_range}<br>
              0-100: ${c1.acceleration}
            </div>
          </div>
          <div style="text-align:center; padding:10px;">
            <div style="font-weight:600; font-size:14px; margin-bottom:4px;">${c2.brand} ${c2.name}</div>
            <div style="color:var(--accent-cyan); font-weight:700; margin-bottom:8px;">${c2.price}</div>
            <div style="font-size:12.5px; color:var(--text-secondary); line-height:1.4;">
              ${c2.horsepower} HP<br>
              ${c2.engine_battery.split('(')[0]}<br>
              ${c2.efficiency_range}<br>
              0-100: ${c2.acceleration}
            </div>
          </div>
        </div>
        <button style="width:100%; font-size:12px; padding:8px; margin-top:12px;" onclick="window.location.href='compare.html?car1=${c1.id}&car2=${c2.id}'">
          Open Full Interactive Sheet
        </button>
      </div>
    `;
  }

  // Loan calculator widget structure
  function renderLoanWidget(carId, name, price) {
    const defaultDown = Math.round(price * 0.20);
    return `
      <div class="widget-loan-calculator">
        <div class="widget-loan-header">
          <i data-lucide="calculator" style="width:16px; height:16px; vertical-align:middle; margin-right:6px; color:var(--accent-cyan);"></i>
          EMI Estimator: ${name}
        </div>
        
        <div class="loan-input-group">
          <label>Car Price (INR)</label>
          <input type="number" class="loan-price-input" value="${price}" disabled>
        </div>
        
        <div class="loan-input-group">
          <label>Down Payment (INR)</label>
          <input type="number" class="loan-down-input" value="${defaultDown}">
        </div>

        <div class="loan-input-group">
          <label>Interest Rate (% P.A.)</label>
          <input type="number" step="0.1" class="loan-rate-input" value="9.5">
        </div>

        <div class="loan-input-group">
          <label>Tenure (Years)</label>
          <input type="number" class="loan-years-input" value="5" min="1" max="10">
        </div>

        <div class="loan-results">
          <div class="loan-result-row">
            <span>Loan Amount:</span>
            <strong class="display-loan-amt">${formatINR(price - defaultDown)}</strong>
          </div>
          <div class="loan-result-row">
            <span>Total Interest Payable:</span>
            <strong class="display-total-interest">Calculated...</strong>
          </div>
          <div class="loan-result-row emi-highlight">
            <span>Monthly EMI:</span>
            <strong class="display-emi">Calculating...</strong>
          </div>
        </div>
      </div>
    `;
  }

  // Handle client-side loan calculations inside the bubble widget
  function setupLoanCalculatorListeners(container) {
    const priceInput = container.querySelector(".loan-price-input");
    const downInput = container.querySelector(".loan-down-input");
    const rateInput = container.querySelector(".loan-rate-input");
    const yearsInput = container.querySelector(".loan-years-input");

    const displayLoanAmt = container.querySelector(".display-loan-amt");
    const displayInterest = container.querySelector(".display-total-interest");
    const displayEmi = container.querySelector(".display-emi");

    function calculate() {
      const price = parseFloat(priceInput.value) || 0;
      let down = parseFloat(downInput.value) || 0;
      
      if (down > price) {
        down = price;
        downInput.value = price;
      }
      
      const rate = parseFloat(rateInput.value) || 0;
      const years = parseInt(yearsInput.value) || 5;

      const principal = price - down;
      displayLoanAmt.innerText = formatINR(principal);

      if (principal <= 0) {
        displayInterest.innerText = formatINR(0);
        displayEmi.innerText = formatINR(0);
        return;
      }

      const monthlyRate = (rate / 100) / 12;
      const totalMonths = years * 12;

      let emi = 0;
      if (monthlyRate === 0) {
        emi = principal / totalMonths;
      } else {
        emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
      }

      const totalPayout = emi * totalMonths;
      const totalInterest = totalPayout - principal;

      displayEmi.innerText = formatINR(emi);
      displayInterest.innerText = formatINR(totalInterest);
    }

    // Bind inputs to recalc
    downInput.addEventListener("input", calculate);
    rateInput.addEventListener("input", calculate);
    yearsInput.addEventListener("input", calculate);

    calculate(); // first run
  }

  // Display typing indicator
  function renderTypingIndicator() {
    const indicatorDiv = document.createElement("div");
    indicatorDiv.className = "message bot";
    indicatorDiv.id = "typing-indicator-node";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.style.padding = "10px 14px";
    bubble.innerHTML = `
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
    indicatorDiv.appendChild(bubble);
    chatWindow.appendChild(indicatorDiv);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById("typing-indicator-node");
    if (indicator) indicator.remove();
  }

  // Handle message submit flow
  async function handleSendMessage(text) {
    if (!text || text.trim() === "") return;

    // Render user message bubble
    renderMessage("user", text);
    chatInput.value = "";

    // Show typing state
    renderTypingIndicator();

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          chatHistory: window.chatHistory
        })
      });

      if (!response.ok) throw new Error("Backend chat service failed.");

      const result = await response.json();
      
      removeTypingIndicator();

      // Render bot message with widgets if applicable
      renderMessage("bot", result.reply, result.widget);

      // Save to chat history
      window.chatHistory.push({ role: "user", content: text });
      window.chatHistory.push({ role: "assistant", content: result });

    } catch (error) {
      console.error(error);
      removeTypingIndicator();
      renderMessage("bot", "⚠️ Sorry, I ran into an error processing your query. Please make sure the backend is active.");
    }
  }

  // Send trigger
  sendBtn.addEventListener("click", () => handleSendMessage(chatInput.value));
  chatInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") handleSendMessage(chatInput.value);
  });

  // Clear chat trigger
  clearBtn.addEventListener("click", () => {
    chatWindow.innerHTML = `
      <div class="message bot">
        <div class="message-bubble">
          <h3>Chat History Cleared</h3>
          How can I help you kickstart your automotive search?
        </div>
      </div>
    `;
    window.chatHistory = [];
  });

  // suggested prompts clicks
  suggestedContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".prompt-chip");
    if (btn) {
      handleSendMessage(btn.dataset.prompt);
    }
  });

  // Check URL parameter for pre-filled chat triggers
  const urlParams = new URLSearchParams(window.location.search);
  const startMsg = urlParams.get("message");
  if (startMsg) {
    setTimeout(() => handleSendMessage(startMsg), 500);
  }
}
