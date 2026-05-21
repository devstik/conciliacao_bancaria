const state = {
  token: null,
  tokenExpiresAt: null,
  user: null,
  receber: [],
  pagar: [],
  overviewReceber: [],
  overviewPagar: [],
  overviewError: "",
  overviewFilter: getCurrentWeekRange(),
  pagarError: "",
  receberError: "",
  fichaCliente: [],
  fichaClienteError: "",
  fichaClienteSelected: null,
  fichaClienteSaving: false,
  fichaClienteFilter: {
    dataInicial: "",
    dataFinal: "",
    tipo: "",
    search: "",
    vendedorId: "",
    limit: "50"
  },
  receberFilter: getDefaultReceberFilter(),
  pagarFilter: getDefaultDateRange(),
  conciliationBankFilter: "ALL",
  ofxResult: null,
  ofxAccumulated: [],
  selectedConciliationKeys: new Set(),
  reconciliationCatalogs: {
    fonteDeRecursos: [],
    depositarios: [],
    tiposDeOperacao: [],
    meiosDePagamento: []
  },
  reconciliationCatalogError: "",
  reconciliationForm: {
    organizacaoId: "2",
    depositarioId: "",
    tipoOperacaoReceberId: "",
    tipoOperacaoPagarId: "",
    meioPagamentoId: "",
    fonteDeRecursosId: ""
  },
  reconciliationJobs: [],
  notifications: [],
  tablePrefs: {
    receber: {
      page: 1,
      pageSize: 20,
      search: "",
      sortBy: "vencimento",
      sortDir: "asc",
      bank: "",
      owner: "",
      minValue: "",
      maxValue: "",
      vencidosOnly: false
    },
    pagar: {
      page: 1,
      pageSize: 20,
      search: "",
      sortBy: "vencimento",
      sortDir: "asc",
      bank: "",
      owner: "",
      minValue: "",
      maxValue: "",
      vencidosOnly: false
    }
  },
  overviewComparison: {
    prevReceberTotal: 0,
    prevPagarTotal: 0
  },
  activeScreen: "overview",
  sidebarCollapsed: false,
  mobileSidebarOpen: false
};

const menuItems = [
  {
    id: "overview",
    label: "Overview",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h7V4H4v9zm9 7h7v-7h-7v7zM4 20h7v-5H4v5zm9-9h7V4h-7v7z"/></svg>'
  },
  {
    id: "receber",
    label: "Contas a Receber",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3V6zm2 2v8h14V8H5zm6 1h2v2h2v2h-2v2h-2v-2H9v-2h2V9z"/></svg>'
  },
  {
    id: "boletos",
    label: "Geração de Boletos",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4V6zm2 2v8h12V8H6zm2 2h8v2H8v-2zm0 3h5v2H8v-2z"/></svg>'
  },
  {
    id: "pagar",
    label: "Contas a Pagar",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3V6zm2 2v8h14V8H5zm4 3h6v2H9v-2z"/></svg>'
  },
  {
    id: "conciliacao",
    label: "Conciliação Bancária",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l-4-4 1.4-1.4 2.6 2.6 6.6-6.6L18 9l-8 8zM4 4h16v2H4V4zm0 14h5v2H4v-2zm11 0h5v2h-5v-2z"/></svg>'
  },
  {
    id: "ficha-cliente",
    label: "Ficha de Cliente",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm2 1h5v2H8V8zm0 3h8v2H8v-2zm0 3h8v2H8v-2z"/></svg>'
  },
];

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const SESSION_STORAGE_KEY = "financeiro.session";
const RECEBER_SITUACAO_LABELS = {
  1: "Em aberto",
  2: "Vencido",
  3: "A Vencer",
  4: "Pagos",
  5: "Substituidos",
  6: "Todos",
  7: "Anulados"
};

function byId(id) {
  return document.getElementById(id);
}

function getUserPrefKey() {
  const userId = state.user?.usuario || "anon";
  return `financeiro.preferences.${userId}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toComparable(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && String(value).trim() !== "") return numeric;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.getTime();
  return String(value).toLowerCase();
}

function savePreferences() {
  if (!state.user) return;
  const payload = {
    receberFilter: state.receberFilter,
    pagarFilter: state.pagarFilter,
    fichaClienteFilter: state.fichaClienteFilter,
    overviewFilter: state.overviewFilter,
    reconciliationForm: state.reconciliationForm,
    tablePrefs: state.tablePrefs
  };
  localStorage.setItem(getUserPrefKey(), JSON.stringify(payload));
}

function loadPreferences() {
  if (!state.user) return;
  try {
    const raw = localStorage.getItem(getUserPrefKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.receberFilter = { ...state.receberFilter, ...(parsed.receberFilter || {}) };
    state.pagarFilter = { ...state.pagarFilter, ...(parsed.pagarFilter || {}) };
    state.fichaClienteFilter = { ...state.fichaClienteFilter, ...(parsed.fichaClienteFilter || {}) };
    state.overviewFilter = parsed.overviewFilter || state.overviewFilter;
    state.reconciliationForm = { ...state.reconciliationForm, ...(parsed.reconciliationForm || {}) };
    if (parsed.tablePrefs) {
      state.tablePrefs = {
        ...state.tablePrefs,
        receber: { ...state.tablePrefs.receber, ...(parsed.tablePrefs.receber || {}) },
        pagar: { ...state.tablePrefs.pagar, ...(parsed.tablePrefs.pagar || {}) }
      };
    }
  } catch (_error) {
    // noop
  }
}

function saveSession() {
  if (!state.user || !state.token) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      token: state.token,
      tokenExpiresAt: state.tokenExpiresAt,
      user: state.user
    })
  );
}

function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function resetSessionState() {
  state.token = null;
  state.tokenExpiresAt = null;
  state.user = null;
  state.receber = [];
  state.pagar = [];
  state.overviewReceber = [];
  state.overviewPagar = [];
  state.fichaCliente = [];
  state.ofxResult = null;
  state.ofxAccumulated = [];
  state.reconciliationJobs = [];
  state.reconciliationCatalogs = {
    fonteDeRecursos: [],
    depositarios: [],
    tiposDeOperacao: [],
    meiosDePagamento: []
  };
  state.reconciliationCatalogError = "";
  state.selectedConciliationKeys = new Set();
  state.conciliationBankFilter = "ALL";
  state.mobileSidebarOpen = false;
  state.notifications = [];
  clearSession();
}

function returnToLogin(message = "Sua sessão expirou. Faça login novamente.") {
  resetSessionState();
  byId("app-view").classList.add("hidden");
  byId("login-view").classList.remove("hidden");
  byId("login-message").textContent = message;
  applySidebarState();
}

function maybeRestoreSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user) return false;
    if (parsed.tokenExpiresAt && new Date(parsed.tokenExpiresAt).getTime() <= Date.now()) return false;
    state.token = parsed.token;
    state.tokenExpiresAt = parsed.tokenExpiresAt || null;
    state.user = parsed.user;
    byId("user-name").textContent = state.user.usuario || state.user.nome || "usuario";
    loadPreferences();
    return true;
  } catch (_error) {
    return false;
  }
}

function buildPreviousPeriodRange(filter) {
  const normalized = normalizeOverviewFilter(filter);
  const start = new Date(`${normalized.dataInicial}T00:00:00`);
  const end = new Date(`${normalized.dataFinal}T00:00:00`);
  const days = Math.max(Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1, 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { dataInicial: toYmd(prevStart), dataFinal: toYmd(prevEnd) };
}

function formatChange(current, previous) {
  if (previous === 0) return current === 0 ? "0%" : "n/a";
  const diff = ((current - previous) / Math.abs(previous)) * 100;
  return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
}

function computeNotifications() {
  const notifications = [];
  const today = getTodayYmd();
  const overdueReceber = state.receber.filter((row) => isReceberOverdue(row, today)).length;
  const overduePagar = state.pagar.filter((row) => row.vencimento && row.vencimento.slice(0, 10) < today).length;
  if (overdueReceber > 0) notifications.push({ level: "warn", text: `${overdueReceber} títulos a receber vencidos.` });
  if (overduePagar > 0) notifications.push({ level: "bad", text: `${overduePagar} títulos a pagar vencidos.` });
  if (state.ofxResult?.totals?.review > 0) notifications.push({ level: "warn", text: `${state.ofxResult.totals.review} lançamentos OFX para revisar.` });
  if (state.ofxResult?.totals?.divergent > 0) notifications.push({ level: "bad", text: `${state.ofxResult.totals.divergent} lançamentos OFX divergentes.` });
  const saldoPrevisto = state.overviewReceber.reduce((s, r) => s + r.valor, 0) - state.overviewPagar.reduce((s, r) => s + r.valor, 0);
  if (saldoPrevisto < 0) notifications.push({ level: "bad", text: `Fluxo projetado negativo: ${currency.format(saldoPrevisto)}.` });
  state.notifications = notifications.slice(0, 8);
  const btn = byId("notifications-btn");
  if (btn) {
    btn.textContent = state.notifications.length ? `N${state.notifications.length}` : "N";
  }
}

function renderNotificationsPanel() {
  const panel = byId("notifications-panel");
  panel.innerHTML = `
    <article class="table-wrap">
      <h3>Notificações</h3>
      ${
        state.notifications.length
          ? `<div class="notification-list">${state.notifications
              .map((n) => `<p><span class="tag ${n.level === "bad" ? "bad" : n.level === "warn" ? "warn" : "ok"}">${escapeHtml(n.level)}</span> ${escapeHtml(n.text)}</p>`)
              .join("")}</div>`
          : "<p>Sem notificações no momento.</p>"
      }
    </article>
  `;
}

function toggleNotifications() {
  const panel = byId("notifications-panel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    renderNotificationsPanel();
  }
}

async function ensureSessionFresh() {
  if (!state.token || !state.tokenExpiresAt) return;
  const expiresIn = new Date(state.tokenExpiresAt).getTime() - Date.now();
  if (expiresIn > 10 * 60 * 1000) return;
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify({ token: state.token })
    });
    if (response.status === 401) {
      returnToLogin();
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    if (data.tokenPreview) {
      state.token = data.tokenPreview;
      state.tokenExpiresAt = data.expiresAt;
      saveSession();
    }
  } catch (_error) {
    // fallback: keep fluxo atual sem interromper usuário
  }
}

function getTodayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { dataInicial: toYmd(weekStart), dataFinal: toYmd(weekEnd) };
}

function normalizeOverviewFilter(filter) {
  const fallback = getCurrentWeekRange();
  const initial = filter?.dataInicial || fallback.dataInicial;
  const final = filter?.dataFinal || fallback.dataFinal;
  if (initial > final) {
    return { dataInicial: final, dataFinal: initial };
  }
  return { dataInicial: initial, dataFinal: final };
}

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toYmd = (date) => date.toISOString().slice(0, 10);
  return { dataInicial: toYmd(start), dataFinal: toYmd(end) };
}

function getDefaultReceberFilter() {
  return { ...getDefaultDateRange(), situacao: "6" };
}

function normalizeReceberSituacao(value) {
  const numeric = Number.parseInt(String(value ?? "").trim(), 10);
  if (Number.isInteger(numeric) && RECEBER_SITUACAO_LABELS[numeric]) {
    return { codigo: numeric, descricao: RECEBER_SITUACAO_LABELS[numeric] };
  }

  const descricao = String(value || "").trim();
  if (!descricao) {
    return { codigo: 1, descricao: RECEBER_SITUACAO_LABELS[1] };
  }

  return { codigo: null, descricao };
}

function isReceberOverdue(row, today = getTodayYmd()) {
  if (row.situacaoCodigo !== null && row.situacaoCodigo !== undefined) {
    return row.situacaoCodigo === 2;
  }
  const due = String(row.vencimento || "").slice(0, 10);
  return Boolean(due) && due < today;
}

function pick(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function parseDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mapReceberRow(row, index) {
  const saldo = toNumber(pick(row, ["saldo", "valor", "valorDoDocumento", "valorEmAberto"], 0));
  const situacao = normalizeReceberSituacao(pick(row, ["situacao", "statusCodigo", "situacaoCodigo", "status", "statusDescricao"], 1));
  return {
    id: pick(row, ["id", "tituloID", "movimentoDeDepositarioID"], index + 1),
    documentoID: pick(row, ["documentoID"], ""),
    numeroDocumento: pick(row, ["numeroDocumento"], ""),
    cliente: pick(row, ["cliente", "clienteNome", "nomeCliente", "entidadeNome"], "Sem cliente"),
    titulo: pick(row, ["titulo"], ""),
    agenteCobrador: pick(row, ["agenteCobrador"], ""),
    descricao: pick(row, ["titulo", "descricao", "descricaoDoMovimento", "historico", "documento"], "Sem descrição"),
    vencimento: pick(row, ["vencimento", "dataDeVencimento", "dtVencimento", "dataVencimento"], ""),
    saldo,
    valor: saldo,
    situacaoCodigo: situacao.codigo,
    situacao: situacao.descricao,
    status: situacao.descricao
  };
}

function mapPagarRow(row, index) {
  const saldo = toNumber(pick(row, ["saldo", "valor", "valorDoDocumento", "valorEmAberto"], 0));
  return {
    id: pick(row, ["id", "tituloID", "movimentoDeDepositarioID"], index + 1),
    documentoID: pick(row, ["documentoID"], ""),
    numeroDocumento: pick(row, ["numeroDocumento"], ""),
    fornecedor: pick(row, ["fornecedor", "fornecedorNome", "nomeFornecedor", "entidadeNome"], "Sem fornecedor"),
    titulo: pick(row, ["titulo"], ""),
    agenteCobrador: pick(row, ["agenteCobrador"], ""),
    descricao: pick(row, ["titulo", "descricao", "descricaoDoMovimento", "historico", "documento"], "Sem descrição"),
    vencimento: pick(row, ["vencimento", "dataDeVencimento", "dtVencimento", "dataVencimento"], ""),
    saldo,
    valor: saldo,
    status: String(pick(row, ["status", "situacao", "statusDescricao"], "A pagar"))
  };
}

function mapFichaClienteRow(row, index) {
  return {
    id: pick(row, ["id"], index + 1),
    data: pick(row, ["data"], ""),
    tipo: pick(row, ["tipo"], ""),
    vendedorId: pick(row, ["vendedorId"], ""),
    vendedor: pick(row, ["vendedor"], ""),
    razaoSocial: pick(row, ["razaoSocial"], ""),
    nomeFantasia: pick(row, ["nomeFantasia"], ""),
    cnpJouCPF: pick(row, ["cnpJouCPF"], ""),
    inscricaoEstadual: pick(row, ["inscricaoEstadual"], ""),
    contatoNome: pick(row, ["contatoNome"], row?.contato?.nome || ""),
    contatoTelefone: pick(row, ["contatoTelefone"], row?.contato?.telefone || ""),
    emailCliente: pick(row, ["emailCliente"], row?.emails?.cliente || ""),
    parecer: pick(row, ["parecer"], ""),
    endereco: row?.endereco && typeof row.endereco === "object" ? row.endereco : {},
    contato: row?.contato && typeof row.contato === "object" ? row.contato : {},
    emails: row?.emails && typeof row.emails === "object" ? row.emails : {},
    referenciasComerciais: row?.referenciasComerciais && typeof row.referenciasComerciais === "object" ? row.referenciasComerciais : {},
    pagamento: row?.pagamento && typeof row.pagamento === "object" ? row.pagamento : {},
    pagamentoAnalise: row?.pagamentoAnalise && typeof row.pagamentoAnalise === "object" ? row.pagamentoAnalise : {},
    statusAnalise: pick(row, ["statusAnalise"], "pendente"),
    observacaoAnalise: pick(row, ["observacaoAnalise"], ""),
    analisadoPor: pick(row, ["analisadoPor"], ""),
    analisadoEm: pick(row, ["analisadoEm"], ""),
    arquivosAnexados: Array.isArray(row?.arquivosAnexados) ? row.arquivosAnexados : []
  };
}

async function setActiveScreen(screen) {
  state.activeScreen = screen;
  byId("screen-title").textContent = menuItems.find((item) => item.id === screen)?.label || "Overview";

  document.querySelectorAll(".screen").forEach((screenEl) => screenEl.classList.add("hidden"));
  byId(`${screen}-screen`).classList.remove("hidden");

  document.querySelectorAll(".menu button").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screen);
  });

  if (!state.user) {
    if (screen === "boletos") {
      renderBoletos();
    }
    if (screen === "conciliacao") {
      renderConciliacao();
    }
    if (screen === "ficha-cliente") {
      renderFichaCliente();
    }
    return;
  }

  if (screen === "receber") {
    renderReceber();
  }

  if (screen === "pagar") {
    renderPagar();
  }

  if (screen === "boletos") {
    renderBoletos();
  }

  if (screen === "overview") {
    await loadOverviewData(state.overviewFilter);
  }

  if (screen === "conciliacao") {
    await loadReconciliationJobs();
    await loadAccumulatedOfx();
    await loadReconciliationCatalogs();
    renderConciliacao();
  }

  if (screen === "ficha-cliente") {
    await loadFichaClienteData(state.fichaClienteFilter);
  }

}

function mountMenu() {
  const menu = byId("menu");
  menu.innerHTML = "";

  for (const item of menuItems) {
    const button = document.createElement("button");
    button.innerHTML = `<span class="menu-icon">${item.icon}</span><span class="menu-text">${item.label}</span>`;
    button.dataset.screen = item.id;
    button.title = item.label;
    button.classList.toggle("active", item.id === state.activeScreen);
    button.addEventListener("click", () => {
      void setActiveScreen(item.id);
      if (isMobileViewport()) {
        state.mobileSidebarOpen = false;
        applySidebarState();
      }
    });
    menu.appendChild(button);
  }
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 1080px)").matches;
}

function applySidebarState() {
  const appView = byId("app-view");
  const mobile = isMobileViewport();

  if (mobile) {
    appView.classList.remove("sidebar-collapsed");
    appView.classList.toggle("mobile-sidebar-open", state.mobileSidebarOpen);
  } else {
    appView.classList.remove("mobile-sidebar-open");
    appView.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    state.mobileSidebarOpen = false;
  }

  const logoutBtn = byId("logout-btn");
  if (logoutBtn) {
    logoutBtn.textContent = "Logoff";
    logoutBtn.title = "Logoff";
  }

  const mobileMenuBtn = byId("mobile-menu-btn");
  if (mobileMenuBtn) {
    mobileMenuBtn.setAttribute("aria-expanded", String(mobile && state.mobileSidebarOpen));
  }
}

function parseDateObject(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShortDateLabel(date) {
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function buildWeeklyFlow(receberRows, pagarRows, rangeFilter = state.overviewFilter) {
  const normalized = normalizeOverviewFilter(rangeFilter);
  const start = new Date(`${normalized.dataInicial}T00:00:00`);
  const end = new Date(`${normalized.dataFinal}T00:00:00`);

  const days = [];
  const dayMap = new Map();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const current = new Date(d);
    current.setHours(0, 0, 0, 0);
    const key = toYmd(current);
    const slot = { key, date: current, inflow: 0, outflow: 0, net: 0, cumulative: 0 };
    dayMap.set(key, slot);
    days.push(slot);
  }

  if (!days.length) {
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    const key = toYmd(current);
    const slot = { key, date: current, inflow: 0, outflow: 0, net: 0, cumulative: 0 };
    dayMap.set(key, slot);
    days.push(slot);
  }

  for (const row of receberRows) {
    const d = parseDateObject(row.vencimento);
    if (!d) continue;
    const key = toYmd(d);
    if (!dayMap.has(key)) continue;
    dayMap.get(key).inflow += Number(row.saldo || row.valor || 0);
  }

  for (const row of pagarRows) {
    const d = parseDateObject(row.vencimento);
    if (!d) continue;
    const key = toYmd(d);
    if (!dayMap.has(key)) continue;
    dayMap.get(key).outflow += Math.abs(Number(row.saldo || row.valor || 0));
  }

  let cumulative = 0;
  for (const slot of days) {
    slot.net = slot.inflow - slot.outflow;
    cumulative += slot.net;
    slot.cumulative = cumulative;
  }

  return days;
}

function buildCumulativeLineSvg(weeklyFlow) {
  const values = weeklyFlow.map((d) => d.cumulative);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = Math.max(max - min, 1);
  const width = 640;
  const height = 170;
  const paddingX = 26;
  const paddingY = 26;
  const step = (width - paddingX * 2) / Math.max(weeklyFlow.length - 1, 1);

  const points = weeklyFlow
    .map((day, index) => {
      const x = paddingX + index * step;
      const y = height - paddingY - ((day.cumulative - min) / range) * (height - paddingY * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const first = points.split(" ")[0] || `${paddingX},${height - paddingY}`;
  const areaPoints = `${first} ${points} ${paddingX + (weeklyFlow.length - 1) * step},${height - paddingY} ${paddingX},${height - paddingY}`;
  const baselineY = height - paddingY - ((0 - min) / range) * (height - paddingY * 2);

  return `
    <svg viewBox="0 0 ${width} ${height}" class="cumulative-svg" preserveAspectRatio="none">
      <line x1="${paddingX}" y1="${baselineY}" x2="${width - paddingX}" y2="${baselineY}" class="cum-baseline"></line>
      <polyline points="${areaPoints}" class="cum-area"></polyline>
      <polyline points="${points}" class="cum-line"></polyline>
      ${points
        .split(" ")
        .map((point) => {
          const [x, y] = point.split(",");
          return `<circle cx="${x}" cy="${y}" r="3.2" class="cum-dot"></circle>`;
        })
        .join("")}
    </svg>
  `;
}

function buildWeeklyTable(weeklyFlow) {
  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Entradas</th>
            <th>Saídas</th>
            <th>Fluxo Líquido</th>
            <th>Saldo Acumulado</th>
          </tr>
        </thead>
        <tbody>
          ${weeklyFlow
            .map((day) => {
              const netClass = day.net >= 0 ? "tag ok" : "tag bad";
              return `
                <tr>
                  <td>${formatShortDateLabel(day.date)}</td>
                  <td>${currency.format(day.inflow)}</td>
                  <td>${currency.format(day.outflow)}</td>
                  <td><span class="${netClass}">${currency.format(day.net)}</span></td>
                  <td>${currency.format(day.cumulative)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOverview() {
  const totalReceber = state.overviewReceber.reduce((sum, row) => sum + row.valor, 0);
  const totalPagar = state.overviewPagar.reduce((sum, row) => sum + row.valor, 0);
  const saldoPrevisto = totalReceber - totalPagar;
  const overviewRange = normalizeOverviewFilter(state.overviewFilter);
  const weeklyFlow = buildWeeklyFlow(state.overviewReceber, state.overviewPagar, overviewRange);
  const netValues = weeklyFlow.map((d) => d.net);
  const maxAbsNet = Math.max(...netValues.map((n) => Math.abs(n)), 1);
  const bestDay = [...weeklyFlow].sort((a, b) => b.net - a.net)[0];
  const worstDay = [...weeklyFlow].sort((a, b) => a.net - b.net)[0];
  const cumulativeEnd = weeklyFlow[weeklyFlow.length - 1]?.cumulative || 0;
  const prevSaldo = state.overviewComparison.prevReceberTotal - state.overviewComparison.prevPagarTotal;
  const saldoDeltaLabel = formatChange(saldoPrevisto, prevSaldo);
  const hasData = state.overviewReceber.length > 0 || state.overviewPagar.length > 0;
  const riskAlerts = [
    saldoPrevisto < 0 ? `Saldo projetado negativo (${currency.format(saldoPrevisto)}).` : "",
    weeklyFlow.some((d) => d.net < 0) ? "Há dias com fluxo líquido negativo." : ""
  ].filter(Boolean);
  const overviewErrorBlock = state.overviewError ? `<p class="overview-error">${state.overviewError}</p>` : "";

  byId("overview-screen").innerHTML = `
    <div class="overview-head">
      <div class="overview-meta">
        <small>Período: ${overviewRange.dataInicial} até ${overviewRange.dataFinal}</small>
      </div>
      <div class="overview-date-filter">
        <label for="overview-data-inicial">Inicial</label>
        <input id="overview-data-inicial" type="date" class="upload-input" value="${overviewRange.dataInicial}" />
        <label for="overview-data-final">Final</label>
        <input id="overview-data-final" type="date" class="upload-input" value="${overviewRange.dataFinal}" />
        <button id="overview-apply-btn" class="ghost-btn">Aplicar</button>
      </div>
    </div>
    ${overviewErrorBlock}
    <section class="kpi-grid">
      <article class="kpi-card">
        <small>Entradas Projetadas (Período)</small>
        <strong>${currency.format(weeklyFlow.reduce((sum, d) => sum + d.inflow, 0))}</strong>
        <p>${state.overviewReceber.length} títulos em receber</p>
      </article>
      <article class="kpi-card">
        <small>Saídas Projetadas (Período)</small>
        <strong>${currency.format(weeklyFlow.reduce((sum, d) => sum + d.outflow, 0))}</strong>
        <p>${state.overviewPagar.length} títulos em pagar</p>
      </article>
      <article class="kpi-card">
        <small>Saldo Acumulado no Período</small>
        <strong>${currency.format(cumulativeEnd)}</strong>
        <p>Baseado em vencimentos previstos</p>
      </article>
      <article class="kpi-card">
        <small>Saldo Geral (Receber - Pagar)</small>
        <strong>${currency.format(saldoPrevisto)}</strong>
        <p>Receber ${currency.format(totalReceber)} vs Pagar ${currency.format(totalPagar)} | vs período anterior ${saldoDeltaLabel}</p>
      </article>
    </section>
    <section class="table-wrap">
      <h3>Alertas de Caixa</h3>
      ${
        riskAlerts.length
          ? `<div class="notification-list">${riskAlerts.map((text) => `<p><span class="tag bad">Risco</span> ${escapeHtml(text)}</p>`).join("")}</div>`
          : "<p>Sem alertas críticos para o período.</p>"
      }
    </section>

    <section class="overview-analytics">
      <article class="analytics-card">
        <div class="analytics-head">
          <h3>Fluxo de Caixa do Período</h3>
          <p>Entradas e saídas previstas por dia</p>
        </div>
        ${hasData ? `
          <div class="flow-bars">
            ${weeklyFlow
              .map((day) => {
                const net = day.net;
                const height = Math.max((Math.abs(net) / maxAbsNet) * 100, 6);
                const barClass = net >= 0 ? "bar-positive" : "bar-negative";
                return `
                  <div class="flow-day">
                    <div class="flow-track">
                      <span class="flow-bar ${barClass}" style="height:${height}%"></span>
                    </div>
                    <small>${formatShortDateLabel(day.date)}</small>
                  </div>
                `;
              })
              .join("")}
          </div>
          <div class="cumulative-wrap">
            <h4>Curva de Saldo Acumulado</h4>
            ${buildCumulativeLineSvg(weeklyFlow)}
          </div>
        ` : `<p class="empty-analytics">Consulte Contas a Receber e Contas a Pagar para gerar o fluxo analítico.</p>`}
      </article>
      <article class="insight-card">
        <h3>Insights do Período</h3>
        <p><span class="tag ok">Melhor dia</span> ${bestDay ? `${formatShortDateLabel(bestDay.date)} (${currency.format(bestDay.net)})` : "-"}</p>
        <p><span class="tag bad">Pior dia</span> ${worstDay ? `${formatShortDateLabel(worstDay.date)} (${currency.format(worstDay.net)})` : "-"}</p>
        <p><span class="tag warn">A pagar</span> ${state.overviewPagar.length} títulos</p>
        <p><span class="tag ok">A receber</span> ${state.overviewReceber.length} títulos</p>
      </article>
    </section>

    <section class="table-wrap">
      <h3>Tabela de Fluxo Diário</h3>
      ${hasData ? buildWeeklyTable(weeklyFlow) : `<p class="empty-analytics">Sem dados suficientes para a tabela de fluxo.</p>`}
    </section>
    
    <div class="panel-grid">
      <article class="table-wrap">
        <h3>Amostra de Recebimentos</h3>
        ${buildTable(state.overviewReceber.slice(0, 12), "cliente")}
      </article>
      <article class="table-wrap">
        <h3>Amostra de Pagamentos</h3>
        ${buildTable(state.overviewPagar.slice(0, 12), "fornecedor")}
      </article>
    </div>
  `;

  byId("overview-data-inicial").addEventListener("change", (event) => {
    state.overviewFilter.dataInicial = event.target.value;
    savePreferences();
  });
  byId("overview-data-final").addEventListener("change", (event) => {
    state.overviewFilter.dataFinal = event.target.value;
    savePreferences();
  });
  byId("overview-apply-btn").addEventListener("click", () => {
    loadOverviewData(state.overviewFilter).catch((error) => {
      alert(error.message);
    });
  });
}

function buildTable(rows, ownerKey) {
  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>${ownerKey === "cliente" ? "Cliente" : "Fornecedor"}</th>
            <th>Descrição</th>
            <th>Vencimento</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const statusClass = row.status.includes("Atras") || row.status.includes("Venc") ? "bad" : row.status.includes("Pago") ? "ok" : "warn";
              return `
                <tr>
                  <td>${row[ownerKey]}</td>
                  <td>${row.descricao}</td>
                  <td>${parseDate(row.vencimento)}</td>
                  <td>${currency.format(row.valor)}</td>
                  <td><span class="tag ${statusClass}">${row.status}</span></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function applyTableView(rows, tableType) {
  const prefs = state.tablePrefs[tableType];
  const ownerKey = tableType === "receber" ? "cliente" : "fornecedor";
  const today = getTodayYmd();
  const filtered = rows.filter((row) => {
    if (prefs.search) {
      const searchSpace = `${row.documentoID} ${row.numeroDocumento} ${row[ownerKey]} ${row.titulo} ${row.agenteCobrador} ${row.status || ""}`.toLowerCase();
      if (!searchSpace.includes(prefs.search.toLowerCase())) return false;
    }
    if (prefs.bank && !String(row.agenteCobrador || "").toLowerCase().includes(prefs.bank.toLowerCase())) return false;
    if (prefs.owner && !String(row[ownerKey] || "").toLowerCase().includes(prefs.owner.toLowerCase())) return false;
    const value = Number(row.saldo || 0);
    if (prefs.minValue !== "" && value < Number(prefs.minValue)) return false;
    if (prefs.maxValue !== "" && value > Number(prefs.maxValue)) return false;
    if (prefs.vencidosOnly) {
      if (tableType === "receber") {
        if (!isReceberOverdue(row, today)) return false;
      } else {
        const due = String(row.vencimento || "").slice(0, 10);
        if (!due || due >= today) return false;
      }
    }
    return true;
  });

  const sorted = filtered.sort((a, b) => {
    const av = toComparable(a[prefs.sortBy]);
    const bv = toComparable(b[prefs.sortBy]);
    if (av === bv) return 0;
    const cmp = av > bv ? 1 : -1;
    return prefs.sortDir === "asc" ? cmp : -cmp;
  });

  const total = sorted.length;
  const pageSize = Number(prefs.pageSize) || 20;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(Number(prefs.page) || 1, 1), totalPages);
  prefs.page = page;
  const start = (page - 1) * pageSize;
  const paged = sorted.slice(start, start + pageSize);
  return { filtered, paged, total, page, totalPages, pageSize };
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(";");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const raw = c.value(row);
        const value = String(raw ?? "").replace(/"/g, '""');
        return `"${value}"`;
      })
      .join(";")
  );
  return [header, ...lines].join("\n");
}

function exportRows(tableType, rows, format) {
  const ownerKey = tableType === "receber" ? "cliente" : "fornecedor";
  const columns = [
    { label: "DOC", value: (r) => r.documentoID },
    { label: "Nota", value: (r) => r.numeroDocumento },
    { label: ownerKey === "cliente" ? "Cliente" : "Fornecedor", value: (r) => r[ownerKey] },
    { label: "Titulo", value: (r) => r.titulo },
    { label: "Vencimento", value: (r) => parseDate(r.vencimento) },
    { label: "Banco", value: (r) => r.agenteCobrador },
    { label: "Valor", value: (r) => currency.format(r.saldo || 0) },
    { label: "Situação", value: (r) => r.status || "" }
  ];
  const baseName = `${tableType}-${getTodayYmd()}`;
  if (format === "csv") {
    const csv = toCsv(rows, columns);
    downloadFile(`${baseName}.csv`, csv, "text/csv;charset=utf-8;");
  } else if (format === "xlsx") {
    const tableRows = rows
      .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(c.value(row))}</td>`).join("")}</tr>`)
      .join("");
    const html = `<table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table>`;
    downloadFile(`${baseName}.xls`, html, "application/vnd.ms-excel");
  } else if (format === "pdf") {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const html = `
      <html>
        <head><title>${baseName}</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:12px}</style></head>
        <body>
          <h2>${tableType === "receber" ? "Contas a Receber" : "Contas a Pagar"}</h2>
          <table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(c.value(row))}</td>`).join("")}</tr>`).join("")}</tbody></table>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }
  void fetchJson("/api/audit", {
    method: "POST",
    body: JSON.stringify({
      actor: state.user?.usuario || "usuario",
      action: "table.export",
      details: { tableType, format, count: rows.length }
    })
  }).catch(() => undefined);
}

function renderReceber() {
  const view = applyTableView(state.receber, "receber");
  const prefs = state.tablePrefs.receber;
  const errorBlock = state.receberError ? `<p style="color:#dc2626;font-weight:600;">${state.receberError}</p>` : "";
  const situacaoOptions = Object.entries(RECEBER_SITUACAO_LABELS)
    .map(([value, label]) => `<option value="${value}" ${String(state.receberFilter.situacao) === value ? "selected" : ""}>${label}</option>`)
    .join("");
  byId("receber-screen").innerHTML = `
    <article class="table-wrap list-full-height">
      <h3>Contas a Receber</h3>
      <div class="toolbar">
        <label>Data inicial <input type="date" id="receber-data-inicial" class="upload-input" value="${state.receberFilter.dataInicial}" /></label>
        <label>Data final <input type="date" id="receber-data-final" class="upload-input" value="${state.receberFilter.dataFinal}" /></label>
        <label>Situação <select id="receber-situacao" class="upload-input">${situacaoOptions}</select></label>
        <input id="receber-search" class="upload-input" placeholder="Buscar..." value="${escapeHtml(prefs.search)}" />
        <input id="receber-bank" class="upload-input" placeholder="Banco" value="${escapeHtml(prefs.bank)}" />
        <input id="receber-owner" class="upload-input" placeholder="Cliente" value="${escapeHtml(prefs.owner)}" />
        <input id="receber-min" class="upload-input" type="number" step="0.01" placeholder="Valor mín." value="${escapeHtml(prefs.minValue)}" />
        <input id="receber-max" class="upload-input" type="number" step="0.01" placeholder="Valor máx." value="${escapeHtml(prefs.maxValue)}" />
        <label><input id="receber-overdue" type="checkbox" ${prefs.vencidosOnly ? "checked" : ""} /> Vencidos</label>
        <select id="receber-page-size" class="upload-input">
          <option value="10" ${view.pageSize === 10 ? "selected" : ""}>10</option>
          <option value="20" ${view.pageSize === 20 ? "selected" : ""}>20</option>
          <option value="50" ${view.pageSize === 50 ? "selected" : ""}>50</option>
        </select>
        <button id="receber-consultar-btn" class="primary-btn">Consultar</button>
        <button id="receber-export-csv" class="ghost-btn">CSV</button>
        <button id="receber-export-xlsx" class="ghost-btn">XLSX</button>
        <button id="receber-export-pdf" class="ghost-btn">PDF</button>
      </div>
      ${errorBlock}
      ${buildReceberTable(view.paged, "receber")}
      <div class="table-pagination">
        <button id="receber-prev" class="ghost-btn" ${view.page <= 1 ? "disabled" : ""}>Anterior</button>
        <small>Página ${view.page} de ${view.totalPages} | ${view.total} registros</small>
        <button id="receber-next" class="ghost-btn" ${view.page >= view.totalPages ? "disabled" : ""}>Próxima</button>
      </div>
    </article>
  `;

  byId("receber-data-inicial").addEventListener("change", (event) => {
    state.receberFilter.dataInicial = event.target.value;
    savePreferences();
  });
  byId("receber-data-final").addEventListener("change", (event) => {
    state.receberFilter.dataFinal = event.target.value;
    savePreferences();
  });
  byId("receber-situacao").addEventListener("change", (event) => {
    state.receberFilter.situacao = event.target.value;
    savePreferences();
  });
  byId("receber-consultar-btn").addEventListener("click", () => {
    loadReceberData(state.receberFilter).catch((error) => {
      alert(error.message);
    });
  });

  byId("receber-search").addEventListener("input", (event) => {
    state.tablePrefs.receber.search = event.target.value;
    state.tablePrefs.receber.page = 1;
    savePreferences();
    renderReceber();
  });
  byId("receber-bank").addEventListener("input", (event) => {
    state.tablePrefs.receber.bank = event.target.value;
    state.tablePrefs.receber.page = 1;
    savePreferences();
    renderReceber();
  });
  byId("receber-owner").addEventListener("input", (event) => {
    state.tablePrefs.receber.owner = event.target.value;
    state.tablePrefs.receber.page = 1;
    savePreferences();
    renderReceber();
  });
  byId("receber-min").addEventListener("input", (event) => {
    state.tablePrefs.receber.minValue = event.target.value;
    savePreferences();
    renderReceber();
  });
  byId("receber-max").addEventListener("input", (event) => {
    state.tablePrefs.receber.maxValue = event.target.value;
    savePreferences();
    renderReceber();
  });
  byId("receber-overdue").addEventListener("change", (event) => {
    state.tablePrefs.receber.vencidosOnly = event.target.checked;
    savePreferences();
    renderReceber();
  });
  byId("receber-page-size").addEventListener("change", (event) => {
    state.tablePrefs.receber.pageSize = Number(event.target.value);
    state.tablePrefs.receber.page = 1;
    savePreferences();
    renderReceber();
  });
  byId("receber-prev").addEventListener("click", () => {
    state.tablePrefs.receber.page = Math.max(state.tablePrefs.receber.page - 1, 1);
    renderReceber();
  });
  byId("receber-next").addEventListener("click", () => {
    state.tablePrefs.receber.page += 1;
    renderReceber();
  });
  byId("receber-export-csv").addEventListener("click", () => exportRows("receber", view.filtered, "csv"));
  byId("receber-export-xlsx").addEventListener("click", () => exportRows("receber", view.filtered, "xlsx"));
  byId("receber-export-pdf").addEventListener("click", () => exportRows("receber", view.filtered, "pdf"));
}

function buildReceberTable(rows, tableType = "receber") {
  const prefs = state.tablePrefs[tableType];
  const sortable = (label, key) =>
    `<button class="th-sort ${prefs.sortBy === key ? "active" : ""}" data-table="${tableType}" data-sort="${key}">
      ${label} ${prefs.sortBy === key ? (prefs.sortDir === "asc" ? "▲" : "▼") : ""}
    </button>`;
  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>${sortable("DOC", "documentoID")}</th>
            <th>${sortable("Nota", "numeroDocumento")}</th>
            <th>${sortable("Cliente", "cliente")}</th>
            <th>${sortable("Titulo", "titulo")}</th>
            <th>${sortable("Vencimento", "vencimento")}</th>
            <th>${sortable("Banco", "agenteCobrador")}</th>
            <th>${sortable("Valor", "saldo")}</th>
            <th>${sortable("Situação", "status")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${row.documentoID}</td>
                  <td>${row.numeroDocumento}</td>
                  <td>${row.cliente}</td>
                  <td>${row.titulo}</td>
                  <td>${parseDate(row.vencimento)}</td>
                  <td>${row.agenteCobrador}</td>
                  <td>${currency.format(row.saldo || 0)}</td>
                  <td>${row.status}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBoletos() {
  byId("boletos-screen").innerHTML = `
    <article class="table-wrap">
      <h3>Geração de Boletos</h3>
      <p>Módulo em desenvolvimento do backend.</p>
    </article>
  `;
}

function renderPagar() {
  const view = applyTableView(state.pagar, "pagar");
  const prefs = state.tablePrefs.pagar;
  const errorBlock = state.pagarError ? `<p style="color:#dc2626;font-weight:600;">${state.pagarError}</p>` : "";
  byId("pagar-screen").innerHTML = `
    <article class="table-wrap list-full-height">
      <h3>Contas a Pagar</h3>
      <div class="toolbar">
        <label>Data inicial <input type="date" id="pagar-data-inicial" class="upload-input" value="${state.pagarFilter.dataInicial}" /></label>
        <label>Data final <input type="date" id="pagar-data-final" class="upload-input" value="${state.pagarFilter.dataFinal}" /></label>
        <input id="pagar-search" class="upload-input" placeholder="Buscar..." value="${escapeHtml(prefs.search)}" />
        <input id="pagar-bank" class="upload-input" placeholder="Banco" value="${escapeHtml(prefs.bank)}" />
        <input id="pagar-owner" class="upload-input" placeholder="Fornecedor" value="${escapeHtml(prefs.owner)}" />
        <input id="pagar-min" class="upload-input" type="number" step="0.01" placeholder="Valor mín." value="${escapeHtml(prefs.minValue)}" />
        <input id="pagar-max" class="upload-input" type="number" step="0.01" placeholder="Valor máx." value="${escapeHtml(prefs.maxValue)}" />
        <label><input id="pagar-overdue" type="checkbox" ${prefs.vencidosOnly ? "checked" : ""} /> Vencidos</label>
        <select id="pagar-page-size" class="upload-input">
          <option value="10" ${view.pageSize === 10 ? "selected" : ""}>10</option>
          <option value="20" ${view.pageSize === 20 ? "selected" : ""}>20</option>
          <option value="50" ${view.pageSize === 50 ? "selected" : ""}>50</option>
        </select>
        <button id="pagar-consultar-btn" class="primary-btn">Consultar</button>
        <button id="pagar-export-csv" class="ghost-btn">CSV</button>
        <button id="pagar-export-xlsx" class="ghost-btn">XLSX</button>
        <button id="pagar-export-pdf" class="ghost-btn">PDF</button>
      </div>
      ${errorBlock}
      ${buildPagarTable(view.paged, "pagar")}
      <div class="table-pagination">
        <button id="pagar-prev" class="ghost-btn" ${view.page <= 1 ? "disabled" : ""}>Anterior</button>
        <small>Página ${view.page} de ${view.totalPages} | ${view.total} registros</small>
        <button id="pagar-next" class="ghost-btn" ${view.page >= view.totalPages ? "disabled" : ""}>Próxima</button>
      </div>
    </article>
  `;

  byId("pagar-data-inicial").addEventListener("change", (event) => {
    state.pagarFilter.dataInicial = event.target.value;
    savePreferences();
  });
  byId("pagar-data-final").addEventListener("change", (event) => {
    state.pagarFilter.dataFinal = event.target.value;
    savePreferences();
  });
  byId("pagar-consultar-btn").addEventListener("click", () => {
    loadPagarData(state.pagarFilter).catch((error) => {
      alert(error.message);
    });
  });

  byId("pagar-search").addEventListener("input", (event) => {
    state.tablePrefs.pagar.search = event.target.value;
    state.tablePrefs.pagar.page = 1;
    savePreferences();
    renderPagar();
  });
  byId("pagar-bank").addEventListener("input", (event) => {
    state.tablePrefs.pagar.bank = event.target.value;
    state.tablePrefs.pagar.page = 1;
    savePreferences();
    renderPagar();
  });
  byId("pagar-owner").addEventListener("input", (event) => {
    state.tablePrefs.pagar.owner = event.target.value;
    state.tablePrefs.pagar.page = 1;
    savePreferences();
    renderPagar();
  });
  byId("pagar-min").addEventListener("input", (event) => {
    state.tablePrefs.pagar.minValue = event.target.value;
    savePreferences();
    renderPagar();
  });
  byId("pagar-max").addEventListener("input", (event) => {
    state.tablePrefs.pagar.maxValue = event.target.value;
    savePreferences();
    renderPagar();
  });
  byId("pagar-overdue").addEventListener("change", (event) => {
    state.tablePrefs.pagar.vencidosOnly = event.target.checked;
    savePreferences();
    renderPagar();
  });
  byId("pagar-page-size").addEventListener("change", (event) => {
    state.tablePrefs.pagar.pageSize = Number(event.target.value);
    state.tablePrefs.pagar.page = 1;
    savePreferences();
    renderPagar();
  });
  byId("pagar-prev").addEventListener("click", () => {
    state.tablePrefs.pagar.page = Math.max(state.tablePrefs.pagar.page - 1, 1);
    renderPagar();
  });
  byId("pagar-next").addEventListener("click", () => {
    state.tablePrefs.pagar.page += 1;
    renderPagar();
  });
  byId("pagar-export-csv").addEventListener("click", () => exportRows("pagar", view.filtered, "csv"));
  byId("pagar-export-xlsx").addEventListener("click", () => exportRows("pagar", view.filtered, "xlsx"));
  byId("pagar-export-pdf").addEventListener("click", () => exportRows("pagar", view.filtered, "pdf"));
}

function buildPagarTable(rows, tableType = "pagar") {
  const prefs = state.tablePrefs[tableType];
  const sortable = (label, key) =>
    `<button class="th-sort ${prefs.sortBy === key ? "active" : ""}" data-table="${tableType}" data-sort="${key}">
      ${label} ${prefs.sortBy === key ? (prefs.sortDir === "asc" ? "▲" : "▼") : ""}
    </button>`;
  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>${sortable("DOC", "documentoID")}</th>
            <th>${sortable("Nota", "numeroDocumento")}</th>
            <th>${sortable("Fornecedor", "fornecedor")}</th>
            <th>${sortable("Titulo", "titulo")}</th>
            <th>${sortable("Vencimento", "vencimento")}</th>
            <th>${sortable("Banco", "agenteCobrador")}</th>
            <th>${sortable("Valor", "saldo")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${row.documentoID}</td>
                  <td>${row.numeroDocumento}</td>
                  <td>${row.fornecedor}</td>
                  <td>${row.titulo}</td>
                  <td>${parseDate(row.vencimento)}</td>
                  <td>${row.agenteCobrador}</td>
                  <td>${currency.format(row.saldo || 0)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function getConciliationTxKey(tx) {
  return [tx.fitId || "", tx.postedAt || "", Number(tx.amount || 0).toFixed(2), tx.documentNumber || "", tx.name || ""].join("|");
}

function isConciliationSettled(tx) {
  return tx?.settlement?.status === "success";
}

function getSelectableConciliationTransactions(transactions) {
  return (transactions || []).filter((tx) => !isConciliationSettled(tx));
}

function getSelectedConciliationTransactions(transactions) {
  return (transactions || []).filter((tx) => state.selectedConciliationKeys.has(getConciliationTxKey(tx)));
}

function buildCatalogOptions(options, selectedValue, placeholder) {
  return [`<option value="">${placeholder}</option>`]
    .concat(
      (options || []).map(
        (item) => `<option value="${item.id}" ${String(selectedValue) === String(item.id) ? "selected" : ""}>${escapeHtml(item.label)}</option>`
      )
    )
    .join("");
}

function txCard(tx, options = {}) {
  const { selectable = false, checked = false, disabled = false, key = "" } = options;
  const valueClass = tx.amount >= 0 ? "ok" : "warn";
  const amount = currency.format(Math.abs(tx.amount));
  const direction = tx.amount >= 0 ? "Crédito" : "Débito";
  const nameHasAmount = /r\$\s*\d/i.test(String(tx.name || ""));
  let matchedBlock = "";
  if (tx.matched) {
    if (tx.matched.isGroup) {
      const docs = (tx.matched.items || [])
        .map((item) => item.numeroDocumento || item.documentoID)
        .filter(Boolean)
        .slice(0, 5)
        .join(", ");
      matchedBlock = `<p><strong>Match em lote ${tx.matched.entityType.toUpperCase()}:</strong> ${tx.matched.itemCount || 0} títulos | Total ${currency.format(
        tx.matched.totalSaldo || 0
      )}${docs ? ` | Docs ${docs}` : ""}</p>`;
    } else {
      matchedBlock = `<p><strong>Match ${tx.matched.entityType.toUpperCase()}:</strong> ${tx.matched.titulo || "-"} | Doc ${tx.matched.numeroDocumento || "-"}</p>`;
    }
  }
  let settlementBlock = "";
  if (tx.settlement) {
    const statusClass = tx.settlement.status === "success" ? "ok" : tx.settlement.status === "error" ? "bad" : "warn";
    const statusLabel = tx.settlement.status === "success" ? "Baixado" : tx.settlement.status === "error" ? "Erro na baixa" : "Pendente";
    const processedAt = tx.settlement.processedAt ? new Date(tx.settlement.processedAt).toLocaleString("pt-BR") : "";
    settlementBlock = `
      <p><strong>Status:</strong> <span class="tag ${statusClass}">${statusLabel}</span></p>
      ${tx.settlement.message ? `<p>${escapeHtml(tx.settlement.message)}</p>` : ""}
      ${processedAt ? `<p><strong>Processado em:</strong> ${processedAt}</p>` : ""}
    `;
  }
  const reasonBlock = tx.reason ? `<p><strong>Motivo:</strong> ${tx.reason}</p>` : "";
  const selectBlock = selectable
    ? `<label class="tx-select"><input type="checkbox" class="conc-item-check" data-key="${escapeHtml(key)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} /> Selecionar para baixa</label>`
    : "";
  return `
    <article class="tx">
      ${selectBlock}
      <small class="tag ${valueClass}">${direction}</small>
      <strong>${tx.name || "Sem descrição"}${nameHasAmount ? "" : ` - ${amount}`}</strong>
      <p>${tx.memo || "Sem memo"}</p>
      ${matchedBlock}
      ${settlementBlock}
      ${reasonBlock}
      <p>${tx.postedAt ? new Date(tx.postedAt).toLocaleDateString("pt-BR") : "Data não encontrada"}</p>
    </article>
  `;
}

function getConciliationBanks(result) {
  if (!result) return [];
  const all = [
    ...(result.groups?.conciliated || []),
    ...(result.groups?.review || []),
    ...(result.groups?.divergent || [])
  ];
  return [...new Set(all.map((tx) => tx.bankName).filter(Boolean))];
}

function filterTransactionsByBank(list, bankFilter) {
  if (!Array.isArray(list)) return [];
  if (!bankFilter || bankFilter === "ALL") return list;
  return list.filter((tx) => tx.bankName === bankFilter);
}

function getAllConciliationTransactions(result) {
  if (!result?.groups) return [];
  return [...(result.groups.conciliated || []), ...(result.groups.review || []), ...(result.groups.divergent || [])];
}

function summarizeByBank(transactions) {
  const map = new Map();
  for (const tx of transactions || []) {
    const bank = tx.bankName || "Banco não identificado";
    if (!map.has(bank)) {
      map.set(bank, { bankName: bank, credits: 0, debits: 0, creditAmount: 0, debitAmount: 0, total: 0, count: 0 });
    }
    const item = map.get(bank);
    const amount = Number(tx.amount || 0);
    item.count += 1;
    item.total += amount;
    if (amount >= 0) {
      item.credits += 1;
      item.creditAmount += amount;
    } else {
      item.debits += 1;
      item.debitAmount += Math.abs(amount);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function renderBankSummaryTable(rows) {
  if (!rows.length) return "<p>Sem lançamentos.</p>";
  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Banco</th>
            <th>Lançamentos</th>
            <th>Créditos</th>
            <th>Débitos</th>
            <th>Valor créditos</th>
            <th>Valor débitos</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              <td>${escapeHtml(row.bankName)}</td>
              <td>${row.count}</td>
              <td>${row.credits}</td>
              <td>${row.debits}</td>
              <td>${currency.format(row.creditAmount || 0)}</td>
              <td>${currency.format(row.debitAmount || 0)}</td>
              <td>${currency.format(row.total || 0)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderConciliacao() {
  const result = state.ofxResult;
  const banks = getConciliationBanks(result);
  if (state.conciliationBankFilter !== "ALL" && !banks.includes(state.conciliationBankFilter)) {
    state.conciliationBankFilter = "ALL";
  }

  const catalogs = state.reconciliationCatalogs;
  const conciliatedAll = result ? result.groups.conciliated || [] : [];
  const conciliatedList = result ? filterTransactionsByBank(conciliatedAll, state.conciliationBankFilter) : [];
  const reviewList = result ? filterTransactionsByBank(result.groups.review, state.conciliationBankFilter) : [];
  const divergentList = result ? filterTransactionsByBank(result.groups.divergent, state.conciliationBankFilter) : [];
  const selectableAll = getSelectableConciliationTransactions(conciliatedAll);
  const selectableKeys = new Set(selectableAll.map((tx) => getConciliationTxKey(tx)));
  state.selectedConciliationKeys = new Set([...state.selectedConciliationKeys].filter((key) => selectableKeys.has(key)));
  const selectableVisible = getSelectableConciliationTransactions(conciliatedList);
  const selectedVisibleCount = selectableVisible.reduce((acc, tx) => {
    const key = getConciliationTxKey(tx);
    return acc + (state.selectedConciliationKeys.has(key) ? 1 : 0);
  }, 0);
  const allVisibleSelected = selectableVisible.length > 0 && selectedVisibleCount === selectableVisible.length;
  const selectedTransactions = getSelectedConciliationTransactions(selectableAll);
  const selectedTotalCount = selectedTransactions.length;
  const selectedReceberCount = selectedTransactions.filter((tx) => tx?.matched?.entityType === "receber").length;
  const selectedPagarCount = selectedTransactions.filter((tx) => tx?.matched?.entityType === "pagar").length;
  const selectedAmountTotal = selectedTransactions.reduce((acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0);

  const stats = result
    ? `Arquivos ${result.totals.files} | Total ${result.totals.total} | Conciliado ${result.totals.conciliated} | Revisar ${result.totals.review} | Divergente ${result.totals.divergent}`
    : "Nenhum OFX processado";
  const fileSummary =
    result && Array.isArray(result.filesSummary)
      ? result.filesSummary
          .map((item) => `${item.fileName} | ${item.bankName} | conta ${item.accountId || "-"} | ${item.transactions} lançamentos`)
          .join("<br/>")
      : "";
  const matchingSummary =
    result && result.matchingSummary
      ? `Base consultada: ${result.matchingSummary.receberLoaded} receber | ${result.matchingSummary.pagarLoaded} pagar | período ${result.matchingSummary.rangeStart} até ${result.matchingSummary.rangeEnd}`
      : "";
  const dedupeSummary = result && Number(result.duplicatesRemoved || 0) > 0 ? `Duplicados removidos no OFX: ${result.duplicatesRemoved}` : "";
  const currentSummary = summarizeByBank(getAllConciliationTransactions(result));
  const accumulatedSummary = summarizeByBank(state.ofxAccumulated);
  const config = state.reconciliationForm;
  const catalogsLoaded = Object.values(catalogs).some((items) => Array.isArray(items) && items.length);
  const catalogStatus = state.reconciliationCatalogError
    ? `<p class="conc-config-note error">${escapeHtml(state.reconciliationCatalogError)}</p>`
    : catalogsLoaded
      ? `<p class="conc-config-note">Os catálogos abaixo vêm da NodeAPI. A baixa só é enviada após sua confirmação.</p>`
      : `<p class="conc-config-note">Carregando catálogos financeiros da NodeAPI...</p>`;

  byId("conciliacao-screen").innerHTML = `
    <h3>Conciliação Bancária</h3>
    <p>Importe OFX, revise os matches sugeridos e confirme manualmente as baixas que devem seguir para o TopManager.</p>

    <div class="toolbar">
      <input type="file" id="ofx-file" accept=".ofx,.txt" multiple class="upload-input" />
      <button id="process-ofx-btn" class="primary-btn">Processar OFX</button>
      <button id="process-folder-ofx-btn" class="ghost-btn">Processar pasta /ofx</button>
      <button id="accumulate-ofx-btn" class="ghost-btn" ${result ? "" : "disabled"}>Acumular resultado atual</button>
      <button id="clear-accum-ofx-btn" class="ghost-btn" ${state.ofxAccumulated.length ? "" : "disabled"}>Limpar acumulado</button>
      <button id="conc-export-csv" class="ghost-btn" ${result ? "" : "disabled"}>Exportar CSV</button>
      <button id="conc-export-pdf" class="ghost-btn" ${result ? "" : "disabled"}>Exportar PDF</button>
      <select id="bank-filter" class="upload-input">
        <option value="ALL">Todos os bancos</option>
        ${banks.map((bank) => `<option value="${bank}" ${state.conciliationBankFilter === bank ? "selected" : ""}>${bank}</option>`).join("")}
      </select>
      <strong>${stats}</strong>
    </div>
    ${fileSummary ? `<p>${fileSummary}</p>` : ""}
    ${matchingSummary ? `<p>${matchingSummary}</p>` : ""}
    ${dedupeSummary ? `<p>${dedupeSummary}</p>` : ""}
    <section class="table-wrap" style="margin-bottom:12px;">
      <h3>Resumo por banco (resultado atual)</h3>
      ${renderBankSummaryTable(currentSummary)}
    </section>
    <section class="table-wrap" style="margin-bottom:12px;">
      <h3>Resumo por banco (acumulado)</h3>
      ${renderBankSummaryTable(accumulatedSummary)}
    </section>
    <section class="conc-config-card">
      <div class="conc-config-header">
        <div>
          <h3>Baixa Manual</h3>
          ${catalogStatus}
        </div>
        <div class="conc-config-metrics">
          <span class="tag ok">Receber ${selectedReceberCount}</span>
          <span class="tag warn">Pagar ${selectedPagarCount}</span>
          <span class="tag neutral">${currency.format(selectedAmountTotal)}</span>
        </div>
      </div>
      <div class="conc-config-grid">
        <label class="conc-config-field">
          <span>Organização ID</span>
          <input id="conc-organizacao-id" class="upload-input" type="number" min="1" value="${escapeHtml(config.organizacaoId)}" />
        </label>
        <label class="conc-config-field">
          <span>Depositário</span>
          <select id="conc-depositario-id" class="upload-input">
            ${buildCatalogOptions(catalogs.depositarios, config.depositarioId, "Selecione o depositário")}
          </select>
        </label>
        <label class="conc-config-field">
          <span>Tipo operação receber</span>
          <select id="conc-tipo-operacao-receber-id" class="upload-input">
            ${buildCatalogOptions(catalogs.tiposDeOperacao, config.tipoOperacaoReceberId, "Selecione para receber")}
          </select>
        </label>
        <label class="conc-config-field">
          <span>Tipo operação pagar</span>
          <select id="conc-tipo-operacao-pagar-id" class="upload-input">
            ${buildCatalogOptions(catalogs.tiposDeOperacao, config.tipoOperacaoPagarId, "Selecione para pagar")}
          </select>
        </label>
        <label class="conc-config-field">
          <span>Meio de pagamento</span>
          <select id="conc-meio-pagamento-id" class="upload-input">
            ${buildCatalogOptions(catalogs.meiosDePagamento, config.meioPagamentoId, "Selecione o meio")}
          </select>
        </label>
        <label class="conc-config-field">
          <span>Fonte de recursos</span>
          <select id="conc-fonte-recursos-id" class="upload-input">
            ${buildCatalogOptions(catalogs.fonteDeRecursos, config.fonteDeRecursosId, "Selecione a fonte")}
          </select>
        </label>
      </div>
    </section>

    <div class="conc-grid">
      <section class="conc-column">
        <div class="conc-header">
          <h4>Sugestões de match</h4>
          <div class="conc-actions">
            <label class="conc-select-all"><input type="checkbox" id="conc-select-all" ${allVisibleSelected ? "checked" : ""} ${selectableVisible.length ? "" : "disabled"} /> Selecionar todos</label>
            <button id="conc-submit-selected" class="ghost-btn" ${selectedTotalCount ? "" : "disabled"}>Confirmar baixa manual (${selectedTotalCount})</button>
          </div>
        </div>
        <div class="column-list">${
          result
            ? conciliatedList
                .map((tx) => {
                  const key = getConciliationTxKey(tx);
                  return txCard(tx, {
                    selectable: !isConciliationSettled(tx),
                    checked: state.selectedConciliationKeys.has(key),
                    disabled: isConciliationSettled(tx),
                    key
                  });
                })
                .join("") || "<p>Sem itens</p>"
            : "<p>Aguardando OFX</p>"
        }</div>
      </section>
      <section class="conc-column">
        <h4>A revisar</h4>
        <div class="column-list">${result ? reviewList.map(txCard).join("") || "<p>Sem itens</p>" : "<p>Aguardando OFX</p>"}</div>
      </section>
      <section class="conc-column">
        <h4>Divergente</h4>
        <div class="column-list">${result ? divergentList.map(txCard).join("") || "<p>Sem itens</p>" : "<p>Aguardando OFX</p>"}</div>
      </section>
    </div>
    <section class="table-wrap" style="margin-top:12px;">
      <h3>Histórico de Processamentos OFX</h3>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Status</th>
              <th>Criado em</th>
              <th>Total</th>
              <th>Conciliado</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${
              state.reconciliationJobs.length
                ? state.reconciliationJobs
                    .map(
                      (job) => `
                <tr>
                  <td>${job.id}</td>
                  <td><span class="tag ${job.status === "completed" ? "ok" : job.status === "failed" ? "bad" : "warn"}">${job.status}</span></td>
                  <td>${parseDate(job.createdAt)}</td>
                  <td>${job.result?.totals?.total ?? "-"}</td>
                  <td>${job.result?.totals?.conciliated ?? "-"}</td>
                  <td><button class="ghost-btn reprocess-btn" data-job="${job.id}">Reprocessar</button></td>
                </tr>
              `
                    )
                    .join("")
                : `<tr><td colspan="6">Sem histórico ainda.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  byId("process-ofx-btn").addEventListener("click", processOfx);
  byId("process-folder-ofx-btn").addEventListener("click", processFolderOfx);
  byId("accumulate-ofx-btn").addEventListener("click", async () => {
    try {
      const added = accumulateCurrentOfx();
      if (!added.length) return;
      await addAccumulatedOfxRemote(added);
      renderConciliacao();
    } catch (error) {
      alert(error.message);
    }
  });
  byId("clear-accum-ofx-btn").addEventListener("click", async () => {
    try {
      await clearAccumulatedOfxRemote();
      state.ofxResult = null;
      state.selectedConciliationKeys = new Set();
      state.conciliationBankFilter = "ALL";
      renderConciliacao();
    } catch (error) {
      alert(error.message);
    }
  });
  byId("conc-export-csv").addEventListener("click", () => exportConciliation("csv"));
  byId("conc-export-pdf").addEventListener("click", () => exportConciliation("pdf"));
  byId("conc-select-all").addEventListener("change", (event) => {
    const shouldSelect = Boolean(event.target.checked);
    for (const tx of selectableVisible) {
      const key = getConciliationTxKey(tx);
      if (shouldSelect) state.selectedConciliationKeys.add(key);
      else state.selectedConciliationKeys.delete(key);
    }
    renderConciliacao();
  });
  byId("conc-submit-selected").addEventListener("click", settleSelectedConciliated);
  document.querySelectorAll(".conc-item-check").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.key;
      if (!key) return;
      if (input.checked) state.selectedConciliationKeys.add(key);
      else state.selectedConciliationKeys.delete(key);
      renderConciliacao();
    });
  });
  byId("bank-filter").addEventListener("change", (event) => {
    state.conciliationBankFilter = event.target.value;
    renderConciliacao();
  });
  byId("conc-organizacao-id").addEventListener("input", (event) => {
    state.reconciliationForm.organizacaoId = event.target.value;
    savePreferences();
  });
  byId("conc-depositario-id").addEventListener("change", (event) => {
    state.reconciliationForm.depositarioId = event.target.value;
    savePreferences();
  });
  byId("conc-tipo-operacao-receber-id").addEventListener("change", (event) => {
    state.reconciliationForm.tipoOperacaoReceberId = event.target.value;
    savePreferences();
  });
  byId("conc-tipo-operacao-pagar-id").addEventListener("change", (event) => {
    state.reconciliationForm.tipoOperacaoPagarId = event.target.value;
    savePreferences();
  });
  byId("conc-meio-pagamento-id").addEventListener("change", (event) => {
    state.reconciliationForm.meioPagamentoId = event.target.value;
    savePreferences();
  });
  byId("conc-fonte-recursos-id").addEventListener("change", (event) => {
    state.reconciliationForm.fonteDeRecursosId = event.target.value;
    savePreferences();
  });
  document.querySelectorAll(".reprocess-btn").forEach((button) => {
    button.addEventListener("click", () => {
      reprocessJob(button.dataset.job);
    });
  });
}

function accumulateCurrentOfx() {
  const current = getAllConciliationTransactions(state.ofxResult);
  if (!current.length) return [];
  return current;
}

function exportConciliation(format) {
  if (!state.ofxResult) return;
  const rows = ["conciliated", "review", "divergent"].flatMap((group) =>
    (state.ofxResult.groups[group] || []).map((tx) => ({
      grupo: group,
      banco: tx.bankName || "",
      data: tx.postedAt ? new Date(tx.postedAt).toLocaleDateString("pt-BR") : "",
      descricao: tx.name || "",
      memo: tx.memo || "",
      valor: Number(tx.amount || 0),
      match: tx.matched ? `${tx.matched.entityType}:${tx.matched.numeroDocumento || ""}` : tx.reason || ""
    }))
  );
  const cols = [
    { label: "Grupo", value: (r) => r.grupo },
    { label: "Banco", value: (r) => r.banco },
    { label: "Data", value: (r) => r.data },
    { label: "Descricao", value: (r) => r.descricao },
    { label: "Memo", value: (r) => r.memo },
    { label: "Valor", value: (r) => currency.format(r.valor) },
    { label: "Match", value: (r) => r.match }
  ];
  if (format === "csv") {
    downloadFile(`conciliacao-${getTodayYmd()}.csv`, toCsv(rows, cols), "text/csv;charset=utf-8;");
  } else {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Conciliação</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;font-size:12px;text-align:left}</style></head>
      <body><h2>Conciliação Bancária</h2><table><thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead><tbody>
      ${rows.map((row) => `<tr>${cols.map((c) => `<td>${escapeHtml(c.value(row))}</td>`).join("")}</tr>`).join("")}
      </tbody></table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }
}

function buildFichaClienteTable(rows) {
  if (!rows.length) {
    return "<p>Nenhuma ficha encontrada.</p>";
  }

  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Data</th>
            <th>Tipo</th>
            <th>Vendedor</th>
            <th>Razão Social</th>
            <th>Nome Fantasia</th>
            <th>CNPJ/CPF</th>
            <th>Status Análise</th>
            <th>Contato</th>
            <th>E-mail</th>
            <th>Anexos</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => {
                const status = row.statusAnalise || "pendente";
                const isFinal = ["aprovada", "reprovada", "aprovada_com_ressalvas"].includes(status);
                const statusLabelMap = {
                  pendente: "Pendente",
                  em_analise: "Em análise",
                  aprovada: "Aprovada",
                  reprovada: "Reprovada",
                  aprovada_com_ressalvas: "Aprovada com ressalvas"
                };
                const statusToneMap = {
                  pendente: "background:#f1f5f9;border:1px solid #d1dce8;color:#64748b;",
                  em_analise: "background:rgba(1,69,242,0.10);border:1px solid rgba(1,69,242,0.22);color:#0145F2;",
                  aprovada: "background:rgba(22,163,74,0.10);border:1px solid rgba(22,163,74,0.22);color:#16a34a;",
                  reprovada: "background:rgba(220,38,38,0.10);border:1px solid rgba(220,38,38,0.22);color:#dc2626;",
                  aprovada_com_ressalvas: "background:rgba(217,119,6,0.10);border:1px solid rgba(217,119,6,0.22);color:#d97706;"
                };
                const actionLabel = isFinal ? "Ver resultado" : "Analisar";
                const actionStyle = isFinal
                  ? "background:#f1f5f9;border-color:#d1dce8;color:#475569;"
                  : "background:#0145F2;border-color:#0145F2;color:#ffffff;";
                return `
                <tr>
                  <td>${row.id}</td>
                  <td>${parseDate(row.data)}</td>
                  <td>${escapeHtml(row.tipo || "-")}</td>
                  <td>${escapeHtml(row.vendedor || "-")}</td>
                  <td>${escapeHtml(row.razaoSocial || "-")}</td>
                  <td>${escapeHtml(row.nomeFantasia || "-")}</td>
                  <td>${escapeHtml(row.cnpJouCPF || "-")}</td>
                  <td><span style="display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:0.03em;text-transform:uppercase;white-space:nowrap;${statusToneMap[status] || statusToneMap.pendente}">${escapeHtml(statusLabelMap[status] || "Pendente")}</span></td>
                  <td>${escapeHtml([row.contatoNome, row.contatoTelefone].filter(Boolean).join(" / ") || "-")}</td>
                  <td>${escapeHtml(row.emailCliente || "-")}</td>
                  <td>${row.arquivosAnexados.length}</td>
                  <td><button class="ghost-btn ficha-open-btn" data-id="${row.id}" style="border-radius:12px;padding:10px 14px;font-weight:800;${actionStyle}">${actionLabel}</button></td>
                </tr>
              `;
              }
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildFichaClienteDetailSection(title, items) {
  return `
    <section style="margin-bottom:18px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:8px;height:8px;border-radius:999px;background:#0145F2;box-shadow:0 0 0 6px rgba(1,69,242,0.12);"></div>
        <h4 style="margin:0;font-size:15px;letter-spacing:0.01em;">${title}</h4>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
        ${items
          .map(
            (item) => `
              <div style="padding:14px 14px 13px;border:1px solid #e2eaf0;border-radius:16px;background:#f8fafc;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                <small style="display:block;color:var(--text-soft);margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(item.label)}</small>
                <div style="font-size:14px;font-weight:700;color:var(--text-strong);line-height:1.45;">${escapeHtml(item.value || "-")}</div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function buildFichaClienteDetailPanel(ficha) {
  if (!ficha) return "";
  const anexos = ficha.arquivosAnexados || [];
  const referenciasContato = ficha.referenciasComerciais?.contato || {};
  const pagamentoAnalise = ficha.pagamentoAnalise || {};
  const isFinal = ["aprovada", "reprovada", "aprovada_com_ressalvas"].includes(ficha.statusAnalise);
  const statusLabelMap = {
    em_analise: "Em análise",
    aprovada: "Aprovada",
    reprovada: "Reprovada",
    aprovada_com_ressalvas: "Aprovada com ressalvas"
  };
  const statusToneMap = {
    em_analise: {
      bg: "rgba(1,69,242,0.10)",
      border: "rgba(1,69,242,0.22)",
      text: "#0145F2"
    },
    aprovada: {
      bg: "rgba(22,163,74,0.10)",
      border: "rgba(22,163,74,0.22)",
      text: "#16a34a"
    },
    reprovada: {
      bg: "rgba(220,38,38,0.10)",
      border: "rgba(220,38,38,0.22)",
      text: "#dc2626"
    },
    aprovada_com_ressalvas: {
      bg: "rgba(217,119,6,0.10)",
      border: "rgba(217,119,6,0.22)",
      text: "#d97706"
    }
  };
  const currentStatus = ficha.statusAnalise || "em_analise";
  const statusTone = statusToneMap[currentStatus] || statusToneMap.em_analise;
  const analysisOptions = [
    { value: "em_analise", label: "Em análise" },
    { value: "aprovada", label: "Aprovada" },
    { value: "reprovada", label: "Reprovada" },
    { value: "aprovada_com_ressalvas", label: "Aprovada com ressalvas" }
  ];

  return `
    <article class="table-wrap" style="margin-top:16px;padding:22px;border-radius:24px;background:#ffffff;border:1px solid #d1dce8;box-shadow:0 4px 20px rgba(1,69,242,0.06);">
      <div style="display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <h3 style="margin:0;font-size:24px;letter-spacing:-0.02em;">Análise da Ficha #${ficha.id}</h3>
            <span style="display:inline-flex;align-items:center;padding:8px 12px;border-radius:999px;background:${statusTone.bg};border:1px solid ${statusTone.border};color:${statusTone.text};font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(statusLabelMap[currentStatus] || "Em análise")}</span>
          </div>
          <p style="margin:0;color:var(--text-soft);font-size:15px;max-width:720px;">${escapeHtml(ficha.razaoSocial || ficha.nomeFantasia || "Sem razão social")}</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <div style="padding:10px 14px;border-radius:14px;background:#f8fafc;border:1px solid #e2eaf0;">
              <small style="display:block;color:var(--text-soft);font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">Vendedor</small>
              <strong style="font-size:13px;">${escapeHtml(ficha.vendedor || "-")}</strong>
            </div>
            <div style="padding:10px 14px;border-radius:14px;background:#f8fafc;border:1px solid #e2eaf0;">
              <small style="display:block;color:var(--text-soft);font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">Data da ficha</small>
              <strong style="font-size:13px;">${escapeHtml(parseDate(ficha.data) || "-")}</strong>
            </div>
            <div style="padding:10px 14px;border-radius:14px;background:#f8fafc;border:1px solid #e2eaf0;">
              <small style="display:block;color:var(--text-soft);font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">Tipo</small>
              <strong style="font-size:13px;">${escapeHtml(ficha.tipo || "-")}</strong>
            </div>
          </div>
        </div>
        <button id="ficha-close-detail" class="ghost-btn" style="border-radius:14px;padding:10px 14px;">Fechar</button>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,0.9fr);gap:18px;align-items:start;">
        <div style="min-width:0;">
      ${buildFichaClienteDetailSection("Dados Gerais", [
        { label: "Data", value: parseDate(ficha.data) },
        { label: "Tipo", value: ficha.tipo },
        { label: "Vendedor", value: ficha.vendedor },
        { label: "Vendedor ID", value: ficha.vendedorId },
        { label: "Razão Social", value: ficha.razaoSocial },
        { label: "Nome Fantasia", value: ficha.nomeFantasia },
        { label: "CNPJ/CPF", value: ficha.cnpJouCPF },
        { label: "Inscrição Estadual", value: ficha.inscricaoEstadual }
      ])}
      ${buildFichaClienteDetailSection("Endereço", [
        { label: "Endereço", value: ficha.endereco?.enderecoCompleto || "" },
        { label: "Bairro", value: ficha.endereco?.bairro || "" },
        { label: "Complemento", value: ficha.endereco?.complemento || "" },
        { label: "CEP", value: ficha.endereco?.cep || "" },
        { label: "Cidade", value: ficha.endereco?.cidade || "" },
        { label: "Estado", value: ficha.endereco?.estado || "" }
      ])}
      ${buildFichaClienteDetailSection("Contato", [
        { label: "Nome", value: ficha.contato?.nome || "" },
        { label: "Telefone", value: ficha.contato?.telefone || "" }
      ])}
      ${buildFichaClienteDetailSection("E-mails", [
        { label: "Cliente", value: ficha.emails?.cliente || "" },
        { label: "Assistente Comercial", value: ficha.emails?.assistenteComercial || "" },
        { label: "Representante Comercial", value: ficha.emails?.representanteComercial || "" },
        { label: "Gestor Financeiro", value: ficha.emails?.gestorFinanceiro || "" },
        { label: "Gestor Comercial", value: ficha.emails?.gestorComercial || "" }
      ])}
      ${buildFichaClienteDetailSection("Referências Comerciais", [
        { label: "Razão Social", value: ficha.referenciasComerciais?.razaoSocial || "" },
        { label: "Contato", value: referenciasContato.nome || "" },
        { label: "Telefone", value: referenciasContato.telefone || "" }
      ])}
      ${buildFichaClienteDetailSection("Pagamento", [
        { label: "Valor Pedido", value: ficha.pagamento?.valorPedido || "" },
        { label: "Forma de Pagamento", value: ficha.pagamento?.formaPagamento || "" },
        { label: "Prazo Estimado", value: ficha.pagamento?.prazoEstimado || "" }
      ])}
      <div style="margin-bottom:16px;">
        <h4 style="margin:0 0 8px 0;">Parecer do Representante</h4>
        <div style="padding:16px;border:1px solid #e2eaf0;border-radius:16px;background:#f8fafc;white-space:pre-wrap;line-height:1.6;">${escapeHtml(ficha.parecer || "-")}</div>
      </div>
      <div style="margin-bottom:16px;">
        <h4 style="margin:0 0 8px 0;">Anexos</h4>
        ${
          anexos.length
            ? `<div style="display:grid;gap:8px;">${anexos
                .map(
                  (item) => `
                    <div style="padding:14px;border:1px solid #e2eaf0;border-radius:16px;background:#f8fafc;">
                      <strong>${escapeHtml(item.nome || "Anexo")}</strong>
                      <div style="color:var(--text-soft);font-size:12px;">${escapeHtml(item.assetPath || "")}</div>
                    </div>
                  `
                )
                .join("")}</div>`
            : "<p>Nenhum anexo enviado.</p>"
        }
      </div>
        </div>
        <aside style="min-width:0;position:sticky;top:0;">
      <div style="padding:18px;border:1px solid #d1dce8;border-radius:22px;background:#f8fafc;box-shadow:0 4px 16px rgba(1,69,242,0.07);">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:14px;">
          <div>
            <small style="display:block;color:#0145F2;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Resultado da análise</small>
            <h4 style="margin:0;font-size:20px;letter-spacing:-0.02em;">Análise Financeira</h4>
          </div>
          <span style="display:inline-flex;align-items:center;padding:8px 12px;border-radius:999px;background:${statusTone.bg};border:1px solid ${statusTone.border};color:${statusTone.text};font-size:11px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(statusLabelMap[currentStatus] || "Em análise")}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px;">
          <div style="padding:12px;border-radius:16px;background:#ffffff;border:1px solid #e2eaf0;">
            <small style="display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Valor</small>
            <strong style="font-size:13px;">${escapeHtml(pagamentoAnalise.valorPedido || "-")}</strong>
          </div>
          <div style="padding:12px;border-radius:16px;background:#ffffff;border:1px solid #e2eaf0;">
            <small style="display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Pagamento</small>
            <strong style="font-size:13px;">${escapeHtml(pagamentoAnalise.formaPagamento || "-")}</strong>
          </div>
          <div style="padding:12px;border-radius:16px;background:#ffffff;border:1px solid #e2eaf0;">
            <small style="display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Prazo</small>
            <strong style="font-size:13px;">${escapeHtml(pagamentoAnalise.prazoEstimado || "-")}</strong>
          </div>
        </div>
        <div class="toolbar" style="padding:0;">
          <label style="width:100%;">Status da análise
            <select id="ficha-analise-status" class="upload-input" ${isFinal ? "disabled" : ""}>
              ${analysisOptions
                .map((option) => `<option value="${option.value}" ${ficha.statusAnalise === option.value ? "selected" : ""}>${option.label}</option>`)
                .join("")}
            </select>
          </label>
        </div>
        <label style="display:block;margin-top:12px;">
          <span style="display:block;margin-bottom:6px;">Observação da análise</span>
          <textarea id="ficha-analise-observacao" class="upload-input" style="min-height:132px;width:100%;border-radius:16px;" ${isFinal ? "disabled" : ""}>${escapeHtml(ficha.observacaoAnalise || "")}</textarea>
        </label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px;">
          <label>Valor do pedido aprovado
            <input id="ficha-analise-valor-pedido" class="upload-input" value="${escapeHtml(pagamentoAnalise.valorPedido || "")}" ${isFinal ? "disabled" : ""} />
          </label>
          <label>Forma de pagamento aprovada
            <input id="ficha-analise-forma-pagamento" class="upload-input" value="${escapeHtml(pagamentoAnalise.formaPagamento || "")}" ${isFinal ? "disabled" : ""} />
          </label>
          <label>Prazo estimado aprovado
            <input id="ficha-analise-prazo-estimado" class="upload-input" value="${escapeHtml(pagamentoAnalise.prazoEstimado || "")}" ${isFinal ? "disabled" : ""} />
          </label>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px;">
          <div>
            <small style="display:block;color:var(--text-soft);">Analisado por</small>
            <div>${escapeHtml(ficha.analisadoPor || "-")}</div>
          </div>
          <div>
            <small style="display:block;color:var(--text-soft);">Analisado em</small>
            <div>${escapeHtml(ficha.analisadoEm ? new Date(ficha.analisadoEm).toLocaleString("pt-BR") : "-")}</div>
          </div>
        </div>
        <div style="margin-top:14px;">
          ${
            isFinal
              ? `<div style="padding:14px 16px;border-radius:16px;background:#f1f5f9;border:1px solid #e2eaf0;text-align:center;font-weight:700;color:var(--text-soft);">Análise concluída. Esta ficha não pode mais ser alterada.</div>`
              : `<button id="ficha-save-analise" class="primary-btn" style="width:100%;padding:14px 18px;border-radius:16px;" ${state.fichaClienteSaving ? "disabled" : ""}>${state.fichaClienteSaving ? "Salvando..." : "Salvar análise"}</button>`
          }
        </div>
      </div>
        </aside>
      </div>
    </article>
  `;
}

function renderFichaCliente() {
  const filter = state.fichaClienteFilter;
  const errorBlock = state.fichaClienteError ? `<p style="color:#dc2626;font-weight:600;">${state.fichaClienteError}</p>` : "";
  byId("ficha-cliente-screen").innerHTML = `
    <article class="table-wrap list-full-height">
      <h3>Ficha de Cliente</h3>
      <div class="toolbar">
        <label>Data inicial <input type="date" id="ficha-data-inicial" class="upload-input" value="${filter.dataInicial}" /></label>
        <label>Data final <input type="date" id="ficha-data-final" class="upload-input" value="${filter.dataFinal}" /></label>
        <input id="ficha-tipo" class="upload-input" placeholder="Tipo" value="${escapeHtml(filter.tipo)}" />
        <input id="ficha-vendedor-id" class="upload-input" placeholder="Vendedor ID" value="${escapeHtml(filter.vendedorId)}" />
        <input id="ficha-search" class="upload-input" placeholder="Buscar razão social, fantasia ou CNPJ/CPF" value="${escapeHtml(filter.search)}" />
        <select id="ficha-limit" class="upload-input">
          <option value="20" ${filter.limit === "20" ? "selected" : ""}>20</option>
          <option value="50" ${filter.limit === "50" ? "selected" : ""}>50</option>
          <option value="100" ${filter.limit === "100" ? "selected" : ""}>100</option>
          <option value="200" ${filter.limit === "200" ? "selected" : ""}>200</option>
        </select>
        <button id="ficha-consultar-btn" class="primary-btn">Consultar</button>
      </div>
      ${errorBlock}
      <p><strong>${state.fichaCliente.length}</strong> ficha(s) encontrada(s).</p>
      ${buildFichaClienteTable(state.fichaCliente)}
      ${buildFichaClienteDetailPanel(state.fichaClienteSelected)}
    </article>
  `;

  byId("ficha-data-inicial").addEventListener("change", (event) => {
    state.fichaClienteFilter.dataInicial = event.target.value;
    savePreferences();
  });
  byId("ficha-data-final").addEventListener("change", (event) => {
    state.fichaClienteFilter.dataFinal = event.target.value;
    savePreferences();
  });
  byId("ficha-tipo").addEventListener("input", (event) => {
    state.fichaClienteFilter.tipo = event.target.value;
    savePreferences();
  });
  byId("ficha-vendedor-id").addEventListener("input", (event) => {
    state.fichaClienteFilter.vendedorId = event.target.value;
    savePreferences();
  });
  byId("ficha-search").addEventListener("input", (event) => {
    state.fichaClienteFilter.search = event.target.value;
    savePreferences();
  });
  byId("ficha-limit").addEventListener("change", (event) => {
    state.fichaClienteFilter.limit = event.target.value;
    savePreferences();
  });
  byId("ficha-consultar-btn").addEventListener("click", () => {
    loadFichaClienteData(state.fichaClienteFilter).catch((error) => {
      alert(error.message);
    });
  });
  document.querySelectorAll(".ficha-open-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-id");
      if (!id) return;
      loadFichaClienteDetail(id).catch((error) => {
        alert(error.message);
      });
    });
  });
  if (state.fichaClienteSelected) {
    byId("ficha-close-detail").addEventListener("click", () => {
      state.fichaClienteSelected = null;
      renderFichaCliente();
    });
    const saveAnaliseButton = byId("ficha-save-analise");
    if (saveAnaliseButton) {
      saveAnaliseButton.addEventListener("click", () => {
        saveFichaClienteAnalise({
          id: state.fichaClienteSelected.id,
          statusAnalise: byId("ficha-analise-status").value,
          observacaoAnalise: byId("ficha-analise-observacao").value,
          pagamentoAnalise: {
            valorPedido: byId("ficha-analise-valor-pedido").value,
            formaPagamento: byId("ficha-analise-forma-pagamento").value,
            prazoEstimado: byId("ficha-analise-prazo-estimado").value
          }
        }).catch((error) => {
          alert(error.message);
        });
      });
    }
  }
}

async function fetchJson(url, options = {}) {
  await ensureSessionFresh();
  const headers = {
    "Content-Type": "application/json",
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json();
  if (response.status === 401) {
    returnToLogin(data.message || "Sua sessão expirou. Faça login novamente.");
    throw new Error(data.message || "Sessão inválida.");
  }
  if (!response.ok) throw new Error(data.message || "Erro na requisição");
  return data;
}

async function processOfx() {
  await ensureSessionFresh();
  const input = byId("ofx-file");
  const files = Array.from(input.files || []);

  if (!files.length) {
    alert("Selecione ao menos um arquivo OFX.");
    return;
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append("ofxFiles", file);
  }
  formData.append("usuario", state.user?.usuario || "usuario");

  const response = await fetch("/api/reconciliation/ofx", {
    method: "POST",
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
    body: formData
  });

  const payload = await response.json();

  if (response.status === 401) {
    returnToLogin(payload.message || "Sua sessão expirou. Faça login novamente.");
    return;
  }
  if (!response.ok) {
    alert(payload.message || "Falha ao processar OFX");
    return;
  }

  state.ofxResult = payload;
  state.selectedConciliationKeys = new Set();
  state.conciliationBankFilter = "ALL";
  await loadReconciliationJobs();
  computeNotifications();
  renderConciliacao();
}

async function processFolderOfx() {
  try {
    const payload = await fetchJson("/api/reconciliation/ofx/folder", {
      method: "POST",
      body: JSON.stringify({ usuario: state.user?.usuario || "usuario" })
    });
    state.ofxResult = payload;
    state.selectedConciliationKeys = new Set();
    state.conciliationBankFilter = "ALL";
    await loadReconciliationJobs();
    computeNotifications();
    renderConciliacao();
  } catch (error) {
    alert(error.message);
  }
}

async function loadReconciliationCatalogs() {
  try {
    const payload = await fetchJson("/api/reconciliation/catalogs");
    state.reconciliationCatalogs = {
      fonteDeRecursos: Array.isArray(payload.fonteDeRecursos) ? payload.fonteDeRecursos : [],
      depositarios: Array.isArray(payload.depositarios) ? payload.depositarios : [],
      tiposDeOperacao: Array.isArray(payload.tiposDeOperacao) ? payload.tiposDeOperacao : [],
      meiosDePagamento: Array.isArray(payload.meiosDePagamento) ? payload.meiosDePagamento : []
    };
    state.reconciliationCatalogError = "";
  } catch (error) {
    state.reconciliationCatalogs = {
      fonteDeRecursos: [],
      depositarios: [],
      tiposDeOperacao: [],
      meiosDePagamento: []
    };
    state.reconciliationCatalogError = error.message;
  }
}

function mergeSettlementResults(results) {
  if (!state.ofxResult?.groups?.conciliated || !Array.isArray(results) || !results.length) return;
  const map = new Map(results.map((item) => [item.clientKey, item]));
  state.ofxResult.groups.conciliated = state.ofxResult.groups.conciliated.map((tx) => {
    const key = getConciliationTxKey(tx);
    const result = map.get(key);
    if (!result) return tx;
    return {
      ...tx,
      settlement: {
        status: result.status,
        message: result.message,
        processedAt: result.processedAt,
        endpoint: result.endpoint,
        itemCount: result.itemCount
      }
    };
  });
}

async function settleSelectedConciliated() {
  if (!state.ofxResult) return;

  const conciliated = state.ofxResult.groups.conciliated || [];
  const selected = getSelectedConciliationTransactions(getSelectableConciliationTransactions(conciliated));
  if (!selected.length) {
    alert("Selecione pelo menos um item em 'Sugestões de match'.");
    return;
  }

  const selectedReceberCount = selected.filter((tx) => tx?.matched?.entityType === "receber").length;
  const selectedPagarCount = selected.filter((tx) => tx?.matched?.entityType === "pagar").length;
  const selectedAmountTotal = selected.reduce((acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0);
  const summary = [
    `Confirmar baixa manual de ${selected.length} item(ns)?`,
    `Receber: ${selectedReceberCount}`,
    `Pagar: ${selectedPagarCount}`,
    `Total selecionado: ${currency.format(selectedAmountTotal)}`
  ].join("\n");

  if (!window.confirm(summary)) {
    return;
  }

  const payload = await fetchJson("/api/reconciliation/settle", {
    method: "POST",
    body: JSON.stringify({
      usuario: state.user?.usuario || "usuario",
      config: state.reconciliationForm,
      transactions: selected
    })
  });

  mergeSettlementResults(payload.results || []);
  state.selectedConciliationKeys = new Set();
  renderConciliacao();
  alert(payload.message || "Baixa manual processada.");
}

async function loadReconciliationJobs() {
  try {
    state.reconciliationJobs = await fetchJson("/api/reconciliation/jobs?limit=40");
  } catch (_error) {
    state.reconciliationJobs = [];
  }
}

async function loadAccumulatedOfx() {
  try {
    const data = await fetchJson("/api/reconciliation/accumulated");
    state.ofxAccumulated = Array.isArray(data) ? data : [];
  } catch (_error) {
    state.ofxAccumulated = [];
  }
}

async function addAccumulatedOfxRemote(transactions) {
  const payload = await fetchJson("/api/reconciliation/accumulated", {
    method: "POST",
    body: JSON.stringify({
      usuario: state.user?.usuario || "usuario",
      transactions
    })
  });
  state.ofxAccumulated = Array.isArray(payload.items) ? payload.items : state.ofxAccumulated;
}

async function clearAccumulatedOfxRemote() {
  const payload = await fetchJson("/api/reconciliation/accumulated", {
    method: "DELETE"
  });
  state.ofxAccumulated = Array.isArray(payload.items) ? payload.items : [];
}

async function reprocessJob(jobId) {
  try {
    const payload = await fetchJson(`/api/reconciliation/jobs/${jobId}/reprocess`, {
      method: "POST",
      body: JSON.stringify({ usuario: state.user?.usuario || "usuario" })
    });
    state.ofxResult = payload;
    state.selectedConciliationKeys = new Set();
    await loadReconciliationJobs();
    computeNotifications();
    renderConciliacao();
  } catch (error) {
    alert(error.message);
  }
}

async function loadDashboardData() {
  renderOverview();
}

async function loadOverviewData(filter = state.overviewFilter) {
  const normalizedFilter = normalizeOverviewFilter(filter);
  const previousFilter = buildPreviousPeriodRange(normalizedFilter);
  state.overviewFilter = normalizedFilter;
  try {
    const currentQuery = new URLSearchParams({
      dataInicial: normalizedFilter.dataInicial,
      dataFinal: normalizedFilter.dataFinal
    }).toString();
    const previousQuery = new URLSearchParams({
      dataInicial: previousFilter.dataInicial,
      dataFinal: previousFilter.dataFinal
    }).toString();
    const [receberResp, pagarResp, prevReceberResp, prevPagarResp] = await Promise.all([
      fetchJson(`/api/receber?${currentQuery}`),
      fetchJson(`/api/pagar?${currentQuery}`),
      fetchJson(`/api/receber?${previousQuery}`),
      fetchJson(`/api/pagar?${previousQuery}`)
    ]);
    state.overviewReceber = (receberResp.rows || []).map(mapReceberRow);
    state.overviewPagar = (pagarResp.rows || []).map(mapPagarRow);
    const prevReceber = (prevReceberResp.rows || []).map(mapReceberRow);
    const prevPagar = (prevPagarResp.rows || []).map(mapPagarRow);
    state.overviewComparison = {
      prevReceberTotal: prevReceber.reduce((s, r) => s + r.valor, 0),
      prevPagarTotal: prevPagar.reduce((s, r) => s + r.valor, 0)
    };
    state.overviewError = "";
    savePreferences();
  } catch (error) {
    state.overviewError = error.message;
    state.overviewReceber = [];
    state.overviewPagar = [];
    throw error;
  } finally {
    computeNotifications();
    if (state.activeScreen === "overview") {
      renderOverview();
    }
  }
}

async function loadReceberData(filter = state.receberFilter) {
  try {
    const query = new URLSearchParams({
      dataInicial: filter.dataInicial,
      dataFinal: filter.dataFinal,
      situacao: filter.situacao || "6",
      usuario: state.user?.usuario || ""
    }).toString();
    const receberResp = await fetchJson(`/api/receber?${query}`);
    state.receber = (receberResp.rows || []).map(mapReceberRow);
    state.receberError = "";
    savePreferences();
    computeNotifications();
    renderReceber();
    renderOverview();
  } catch (error) {
    state.receberError = error.message;
    state.receber = [];
    renderReceber();
    throw error;
  }
}

async function loadFichaClienteData(filter = state.fichaClienteFilter) {
  try {
    const query = new URLSearchParams({
      dataInicial: filter.dataInicial,
      dataFinal: filter.dataFinal,
      tipo: filter.tipo,
      vendedorId: filter.vendedorId,
      search: filter.search,
      limit: filter.limit || "50"
    }).toString();
    const response = await fetchJson(`/api/ficha-cliente?${query}`);
    state.fichaCliente = (response.rows || []).map(mapFichaClienteRow);
    state.fichaClienteError = "";
    if (state.fichaClienteSelected) {
      const updatedSelection = state.fichaCliente.find((item) => item.id === state.fichaClienteSelected.id);
      if (updatedSelection) {
        state.fichaClienteSelected = { ...state.fichaClienteSelected, ...updatedSelection };
      }
    }
    savePreferences();
    renderFichaCliente();
  } catch (error) {
    state.fichaClienteError = error.message;
    state.fichaCliente = [];
    renderFichaCliente();
    throw error;
  }
}

async function loadFichaClienteDetail(id) {
  const response = await fetchJson(`/api/ficha-cliente/${id}`);
  state.fichaClienteSelected = mapFichaClienteRow(response.row || {}, 0);
  renderFichaCliente();
}

async function saveFichaClienteAnalise({ id, statusAnalise, observacaoAnalise, pagamentoAnalise }) {
  state.fichaClienteSaving = true;
  renderFichaCliente();
  try {
    const response = await fetchJson(`/api/ficha-cliente/${id}/analise`, {
      method: "PATCH",
      body: JSON.stringify({
        statusAnalise,
        observacaoAnalise,
        pagamentoAnalise
      })
    });
    const updatedRow = mapFichaClienteRow(response.row || {}, 0);
    state.fichaClienteSelected = updatedRow;
    state.fichaCliente = state.fichaCliente.map((item) => (item.id === updatedRow.id ? { ...item, ...updatedRow } : item));
    renderFichaCliente();
  } finally {
    state.fichaClienteSaving = false;
    renderFichaCliente();
  }
}

async function loadPagarData(filter = state.pagarFilter) {
  try {
    const query = new URLSearchParams({
      dataInicial: filter.dataInicial,
      dataFinal: filter.dataFinal,
      usuario: state.user?.usuario || ""
    }).toString();
    const pagarResp = await fetchJson(`/api/pagar?${query}`);
    state.pagar = (pagarResp.rows || []).map(mapPagarRow);
    state.pagarError = "";
    savePreferences();
    computeNotifications();
    renderPagar();
    renderOverview();
  } catch (error) {
    state.pagarError = error.message;
    state.pagar = [];
    renderPagar();
    throw error;
  }
}

async function login(usuario, senha) {
  const data = await fetchJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ usuario, senha })
  });

  state.token = data.tokenPreview;
  state.tokenExpiresAt = data.expiresAt || null;
  state.user = data.user;
  byId("user-name").textContent = data.user.usuario || data.user.nome || "usuario";
  loadPreferences();
  state.overviewError = "";
  state.overviewReceber = [];
  state.overviewPagar = [];
  state.receberError = "";
  state.pagarError = "";
  state.receber = [];
  state.pagar = [];
  saveSession();
  renderOverview();
  renderReceber();
  renderPagar();
  renderConciliacao();
  await loadReconciliationJobs();
  await loadAccumulatedOfx();
  computeNotifications();

  byId("login-view").classList.add("hidden");
  byId("app-view").classList.remove("hidden");
  await setActiveScreen("overview");
}

function bindEvents() {
  byId("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const usuario = byId("usuario").value.trim();
    const senha = byId("senha").value.trim();

    try {
      await login(usuario, senha);
      byId("login-message").textContent = "Login realizado com sucesso.";
    } catch (error) {
      byId("login-message").textContent = error.message;
    }
  });

  byId("refresh-btn").addEventListener("click", async () => {
    try {
      if (state.activeScreen === "receber") {
        await loadReceberData(state.receberFilter);
        return;
      }
      if (state.activeScreen === "pagar") {
        await loadPagarData();
        return;
      }
      if (state.activeScreen === "overview") {
        await loadOverviewData(state.overviewFilter);
        return;
      }
      if (state.activeScreen === "conciliacao") {
        const confirmed = window.confirm("Deseja realmente limpar a tela de Conciliação e o acumulado?");
        if (!confirmed) return;
        await clearAccumulatedOfxRemote();
        state.ofxResult = null;
        state.selectedConciliationKeys = new Set();
        state.conciliationBankFilter = "ALL";
        await loadReconciliationJobs();
        renderConciliacao();
        return;
      }
      await setActiveScreen(state.activeScreen);
    } catch (error) {
      alert(error.message);
    }
  });

  byId("notifications-btn").addEventListener("click", () => {
    toggleNotifications();
  });

  byId("logout-btn").addEventListener("click", () => {
    resetSessionState();
    byId("app-view").classList.add("hidden");
    byId("login-view").classList.remove("hidden");
    byId("login-form").reset();
    byId("login-message").textContent = "";
  });

  byId("sidebar-toggle").addEventListener("click", () => {
    if (isMobileViewport()) {
      state.mobileSidebarOpen = !state.mobileSidebarOpen;
    } else {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    }
    applySidebarState();
  });

  byId("mobile-menu-btn").addEventListener("click", () => {
    state.mobileSidebarOpen = !state.mobileSidebarOpen;
    applySidebarState();
  });

  byId("sidebar-overlay").addEventListener("click", () => {
    state.mobileSidebarOpen = false;
    applySidebarState();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const sortBtn = target.closest(".th-sort");
    if (sortBtn) {
      const tableType = sortBtn.getAttribute("data-table");
      const sortKey = sortBtn.getAttribute("data-sort");
      if (!tableType || !sortKey || !state.tablePrefs[tableType]) return;
      if (state.tablePrefs[tableType].sortBy === sortKey) {
        state.tablePrefs[tableType].sortDir = state.tablePrefs[tableType].sortDir === "asc" ? "desc" : "asc";
      } else {
        state.tablePrefs[tableType].sortBy = sortKey;
        state.tablePrefs[tableType].sortDir = "asc";
      }
      savePreferences();
      if (tableType === "receber") renderReceber();
      if (tableType === "pagar") renderPagar();
    }
  });

  window.addEventListener("resize", applySidebarState);
}

mountMenu();
bindEvents();
applySidebarState();
if (maybeRestoreSession()) {
  byId("login-view").classList.add("hidden");
  byId("app-view").classList.remove("hidden");
  void Promise.all([loadReconciliationJobs(), loadAccumulatedOfx()]).then(() => setActiveScreen("overview"));
} else {
  void setActiveScreen("overview");
}
