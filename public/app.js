const state = {
  token: null,
  tokenExpiresAt: null,
  user: null,
  receber: [],
  pagar: [],
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
  fichaClienteView: "scroll",
  fichaClienteLoading: false,
  receberFilter: getDefaultReceberFilter(),
  pagarFilter: getDefaultDateRange(),
  conciliationBankFilter: "ALL",
  conciliationFilters: {
    search: "",
    group: "ALL",
    direction: "ALL",
    minValue: "",
    maxValue: ""
  },
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
    },
    fichaCliente: {
      sortBy: "data",
      sortDir: "desc"
    }
  },
  activeScreen: "receber",
  sidebarCollapsed: false,
  mobileSidebarOpen: false
};

const menuItems = [
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
    state.reconciliationForm = { ...state.reconciliationForm, ...(parsed.reconciliationForm || {}) };
    if (parsed.tablePrefs) {
      state.tablePrefs = {
        ...state.tablePrefs,
        receber: { ...state.tablePrefs.receber, ...(parsed.tablePrefs.receber || {}) },
        pagar: { ...state.tablePrefs.pagar, ...(parsed.tablePrefs.pagar || {}) },
        fichaCliente: { ...state.tablePrefs.fichaCliente, ...(parsed.tablePrefs.fichaCliente || {}) }
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
    byId("user-name").textContent = state.user.nome || state.user.usuario || "usuario";
    byId("user-avatar").textContent = (state.user.nome || state.user.usuario || "U")[0].toUpperCase();
    loadPreferences();
    return true;
  } catch (_error) {
    return false;
  }
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
  state.notifications = notifications.slice(0, 8);
}

function renderNotificationsPanel() {
  const panel = byId("notifications-panel");
  panel.innerHTML = `
    <article class="table-wrap">
      <h3>Notificações</h3>
      ${
        state.notifications.length
          ?`<div class="notification-list">${state.notifications
              .map((n) => `<p><span class="tag ${n.level === "bad" ?"bad" : n.level === "warn" ?"warn" : "ok"}">${escapeHtml(n.level)}</span> ${escapeHtml(n.text)}</p>`)
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
  const mondayOffset = day === 0 ?-6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { dataInicial: toYmd(weekStart), dataFinal: toYmd(weekEnd) };
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
    return Number.isFinite(parsed) ?parsed : 0;
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
    endereco: row?.endereco && typeof row.endereco === "object" ?row.endereco : {},
    contato: row?.contato && typeof row.contato === "object" ?row.contato : {},
    emails: row?.emails && typeof row.emails === "object" ?row.emails : {},
    referenciasComerciais: row?.referenciasComerciais && typeof row.referenciasComerciais === "object" ?row.referenciasComerciais : {},
    pagamento: row?.pagamento && typeof row.pagamento === "object" ?row.pagamento : {},
    pagamentoAnalise: row?.pagamentoAnalise && typeof row.pagamentoAnalise === "object" ?row.pagamentoAnalise : {},
    statusAnalise: pick(row, ["statusAnalise"], "pendente"),
    observacaoAnalise: pick(row, ["observacaoAnalise"], ""),
    analisadoPor: pick(row, ["analisadoPor"], ""),
    analisadoEm: pick(row, ["analisadoEm"], ""),
    arquivosAnexados: Array.isArray(row?.arquivosAnexados) ?row.arquivosAnexados.map(mapFichaClienteAnexo) : []
  };
}

function mapFichaClienteAnexo(item) {
  if (!item || typeof item !== "object") {
    return { nome: "Anexo", assetPath: "" };
  }

  const assetPath = pick(item, ["assetPath", "path", "url", "assetUrl", "arquivoUrl", "caminho", "link"], "");
  return {
    ...item,
    nome: pick(item, ["nome", "name", "filename", "fileName", "arquivoNome", "originalName"], "Anexo"),
    assetPath
  };
}

async function setActiveScreen(screen) {
  state.activeScreen = screen;
  byId("screen-title").textContent = menuItems.find((item) => item.id === screen)?.label || "";

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
    logoutBtn.title = "Sair";
  }

  const mobileMenuBtn = byId("mobile-menu-btn");
  if (mobileMenuBtn) {
    mobileMenuBtn.setAttribute("aria-expanded", String(mobile && state.mobileSidebarOpen));
  }
}

function parseDateObject(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ?null : date;
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
function buildTable(rows, ownerKey) {
  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>${ownerKey === "cliente" ?"Cliente" : "Fornecedor"}</th>
            <th>Descrição</th>
            <th>Vencimento</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const statusClass = row.status.includes("Atras") || row.status.includes("Venc") ?"bad" : row.status.includes("Pago") ?"ok" : "warn";
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
  const ownerKey = tableType === "receber" ?"cliente" : "fornecedor";
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
    const cmp = av > bv ?1 : -1;
    return prefs.sortDir === "asc" ?cmp : -cmp;
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

async function downloadAnexo(assetPath, nome) {
  try {
    await ensureSessionFresh();
    const response = await fetch(`/api/ficha-cliente/anexo?path=${encodeURIComponent(assetPath)}`, {
      headers: state.token ?{ Authorization: `Bearer ${state.token}` } : {}
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Erro ao baixar arquivo.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome || assetPath.split("/").pop() || "anexo";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.message);
  }
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
  const ownerKey = tableType === "receber" ?"cliente" : "fornecedor";
  const columns = [
    { label: "DOC", value: (r) => r.documentoID },
    { label: "Nota", value: (r) => r.numeroDocumento },
    { label: ownerKey === "cliente" ?"Cliente" : "Fornecedor", value: (r) => r[ownerKey] },
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
          <h2>${tableType === "receber" ?"Contas a Receber" : "Contas a Pagar"}</h2>
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

function summarizeReceberView(view) {
  const rows = view.filtered || [];
  const today = getTodayYmd();
  const overdue = rows.filter((row) => isReceberOverdue(row, today)).length;
  const totalValue = rows.reduce((acc, row) => acc + Number(row.saldo || 0), 0);
  return {
    total: rows.length,
    totalValue,
    overdue,
    open: Math.max(rows.length - overdue, 0)
  };
}

function getReceberStatusTone(row) {
  if (isReceberOverdue(row)) return "bad";
  const status = String(row.status || row.situacao || "").toLowerCase();
  if (status.includes("pag")) return "ok";
  if (status.includes("venc")) return "bad";
  if (status.includes("a vencer")) return "warn";
  return "neutral";
}

function renderReceberStatusBadge(row) {
  const tone = getReceberStatusTone(row);
  const label = row.status || row.situacao || "Em aberto";
  return `<span class="receber-status-badge ${tone}">${escapeHtml(label)}</span>`;
}

function renderReceberKpis(summary) {
  return `
    <div class="receber-summary-grid">
      <div class="receber-kpi-card">
        <span class="receber-kpi-label">Registros filtrados</span>
        <strong class="receber-kpi-value">${summary.total}</strong>
        <small class="receber-kpi-sub">Títulos na visão atual</small>
      </div>
      <div class="receber-kpi-card">
        <span class="receber-kpi-label">Valor total</span>
        <strong class="receber-kpi-value">${currency.format(summary.totalValue)}</strong>
        <small class="receber-kpi-sub">Soma dos títulos filtrados</small>
      </div>
      <div class="receber-kpi-card bad">
        <span class="receber-kpi-label">Vencidos</span>
        <strong class="receber-kpi-value">${summary.overdue}</strong>
        <small class="receber-kpi-sub">Requerem atenção</small>
      </div>
      <div class="receber-kpi-card warn">
        <span class="receber-kpi-label">Em aberto / a vencer</span>
        <strong class="receber-kpi-value">${summary.open}</strong>
        <small class="receber-kpi-sub">Dentro da carteira filtrada</small>
      </div>
    </div>
  `;
}

function renderReceberEmptyState() {
  return `
    <div class="receber-empty-state">
      <strong>Nenhum título encontrado</strong>
      <span>Ajuste os filtros ou consulte outro período para atualizar a carteira.</span>
    </div>
  `;
}
function renderReceber() {
  const view = applyTableView(state.receber, "receber");
  const prefs = state.tablePrefs.receber;
  const summary = summarizeReceberView(view);
  const errorBlock = state.receberError ?`<p style="color:#dc2626;font-weight:600;">${state.receberError}</p>` : "";
  const situacaoOptions = Object.entries(RECEBER_SITUACAO_LABELS)
    .map(([value, label]) => `<option value="${value}" ${String(state.receberFilter.situacao) === value ?"selected" : ""}>${label}</option>`)
    .join("");
  byId("receber-screen").innerHTML = `
    <article class="table-wrap list-full-height receber-page">
      <div class="receber-header">
        <div class="receber-header-copy">
          <small>Carteira financeira</small>
          <h3>Contas a Receber</h3>
          <p>Monitore vencimentos, valores em aberto e títulos filtrados sem sair da operação.</p>
        </div>
      </div>
      ${renderReceberKpis(summary)}
      <div class="toolbar data-grid-toolbar receber-toolbar">
        <div class="receber-filter-group">
          <label>Data inicial <input type="date" id="receber-data-inicial" class="upload-input" value="${state.receberFilter.dataInicial}" /></label>
          <label>Data final <input type="date" id="receber-data-final" class="upload-input" value="${state.receberFilter.dataFinal}" /></label>
          <label>Situação <select id="receber-situacao" class="upload-input">${situacaoOptions}</select></label>
          <input id="receber-search" class="upload-input receber-search-input" placeholder="Buscar..." value="${escapeHtml(prefs.search)}" />
          <input id="receber-bank" class="upload-input" placeholder="Banco" value="${escapeHtml(prefs.bank)}" />
          <input id="receber-owner" class="upload-input" placeholder="Cliente" value="${escapeHtml(prefs.owner)}" />
          <input id="receber-min" class="upload-input" type="number" step="0.01" placeholder="Valor mín." value="${escapeHtml(prefs.minValue)}" />
          <input id="receber-max" class="upload-input" type="number" step="0.01" placeholder="Valor máx." value="${escapeHtml(prefs.maxValue)}" />
          <label class="receber-filter-check"><input id="receber-overdue" type="checkbox" ${prefs.vencidosOnly ?"checked" : ""} /> Vencidos</label>
          <select id="receber-page-size" class="upload-input" title="Registros por página">
            <option value="10" ${view.pageSize === 10 ?"selected" : ""}>10</option>
            <option value="20" ${view.pageSize === 20 ?"selected" : ""}>20</option>
            <option value="50" ${view.pageSize === 50 ?"selected" : ""}>50</option>
          </select>
        </div>
        <div class="receber-toolbar-actions">
          <button id="receber-consultar-btn" class="primary-btn">Consultar</button>
          <div class="receber-export-group" aria-label="Exportações">
            <button id="receber-export-csv" class="ghost-btn">CSV</button>
            <button id="receber-export-xlsx" class="ghost-btn">XLSX</button>
            <button id="receber-export-pdf" class="ghost-btn">PDF</button>
          </div>
        </div>
      </div>
      ${errorBlock}
      ${buildReceberTable(view.paged, "receber")}
      <div class="table-pagination data-grid-pagination receber-pagination">
        <button id="receber-prev" class="ghost-btn" ${view.page <= 1 ?"disabled" : ""}>Anterior</button>
        <small>Página ${view.page} de ${view.totalPages} | ${view.total} registros</small>
        <button id="receber-next" class="ghost-btn" ${view.page >= view.totalPages ?"disabled" : ""}>Próxima</button>
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
    `<button class="th-sort data-grid-sort ${prefs.sortBy === key ?"active" : ""}" data-table="${tableType}" data-sort="${key}">
      ${label} ${prefs.sortBy === key ?(prefs.sortDir === "asc" ?"&uarr;" : "&darr;") : ""}
    </button>`;

  if (!rows.length) {
    return renderReceberEmptyState();
  }

  return `
    <div class="table-scroll data-grid-scroll receber-table-scroll">
      <table class="data-grid receber-table">
        <thead>
          <tr>
            <th>${sortable("DOC", "documentoID")}</th>
            <th>${sortable("Cliente", "cliente")}</th>
            <th>${sortable("Título / Nota", "titulo")}</th>
            <th>${sortable("Vencimento", "vencimento")}</th>
            <th>${sortable("Banco", "agenteCobrador")}</th>
            <th>${sortable("Valor", "saldo")}</th>
            <th>${sortable("Situação", "status")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const dueTone = isReceberOverdue(row) ?"bad" : "neutral";
              return `
                <tr class="data-grid-row receber-row ${isReceberOverdue(row) ?"is-overdue" : ""}">
                  <td class="receber-doc-id">${escapeHtml(row.documentoID || "-")}</td>
                  <td>
                    <div class="receber-client-cell">
                      <strong class="receber-client-name">${escapeHtml(row.cliente || "Sem cliente")}</strong>
                      <span class="receber-client-sub">Nota ${escapeHtml(row.numeroDocumento || "-")}</span>
                    </div>
                  </td>
                  <td>
                    <div class="receber-title-cell">
                      <strong>${escapeHtml(row.titulo || row.descricao || "-")}</strong>
                      <span>${escapeHtml(row.descricao && row.descricao !== row.titulo ?row.descricao : row.numeroDocumento || "-")}</span>
                    </div>
                  </td>
                  <td>
                    <div class="receber-date-cell ${dueTone}">
                      <strong>${escapeHtml(parseDate(row.vencimento))}</strong>
                      <span>${isReceberOverdue(row) ?"Vencido" : "Carteira"}</span>
                    </div>
                  </td>
                  <td class="receber-bank-cell">${escapeHtml(row.agenteCobrador || "-")}</td>
                  <td class="receber-money-cell">${currency.format(row.saldo || 0)}</td>
                  <td>${renderReceberStatusBadge(row)}</td>
                </tr>
              `;
            })
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

function summarizePagarView(view) {
  const rows = view.filtered || [];
  const today = getTodayYmd();
  const overdue = rows.filter((row) => {
    const due = String(row.vencimento || "").slice(0, 10);
    return Boolean(due) && due < today;
  }).length;
  const totalValue = rows.reduce((acc, row) => acc + Number(row.saldo || 0), 0);
  return {
    total: rows.length,
    totalValue,
    overdue,
    open: Math.max(rows.length - overdue, 0)
  };
}

function isPagarOverdue(row, today = getTodayYmd()) {
  const due = String(row.vencimento || "").slice(0, 10);
  return Boolean(due) && due < today;
}

function getPagarStatusTone(row) {
  if (isPagarOverdue(row)) return "bad";
  const status = String(row.status || "").toLowerCase();
  if (status.includes("pag") || status.includes("baix")) return "ok";
  if (status.includes("venc") || status.includes("atras")) return "bad";
  if (status.includes("aberto") || status.includes("vencer") || status.includes("pagar")) return "warn";
  return "neutral";
}

function renderPagarStatusBadge(row) {
  const tone = getPagarStatusTone(row);
  const label = row.status || (isPagarOverdue(row) ?"Vencido" : "A pagar");
  return `<span class="pagar-status-badge ${tone}">${escapeHtml(label)}</span>`;
}

function renderPagarKpis(summary) {
  return `
    <div class="pagar-summary-grid">
      <div class="pagar-kpi-card">
        <span class="pagar-kpi-label">Obrigações filtradas</span>
        <strong class="pagar-kpi-value">${summary.total}</strong>
        <small class="pagar-kpi-sub">Compromissos na visão atual</small>
      </div>
      <div class="pagar-kpi-card total">
        <span class="pagar-kpi-label">Valor total a pagar</span>
        <strong class="pagar-kpi-value">${currency.format(summary.totalValue)}</strong>
        <small class="pagar-kpi-sub">Soma das obrigações filtradas</small>
      </div>
      <div class="pagar-kpi-card bad">
        <span class="pagar-kpi-label">Vencidos</span>
        <strong class="pagar-kpi-value">${summary.overdue}</strong>
        <small class="pagar-kpi-sub">Demandam priorização</small>
      </div>
      <div class="pagar-kpi-card warn">
        <span class="pagar-kpi-label">A vencer / em aberto</span>
        <strong class="pagar-kpi-value">${summary.open}</strong>
        <small class="pagar-kpi-sub">Obrigações em acompanhamento</small>
      </div>
    </div>
  `;
}

function renderPagarEmptyState() {
  return `
    <div class="pagar-empty-state">
      <strong>Nenhuma obrigação encontrada</strong>
      <span>Ajuste os filtros ou consulte outro período para revisar a agenda de pagamentos.</span>
    </div>
  `;
}
function renderPagar() {
  const view = applyTableView(state.pagar, "pagar");
  const prefs = state.tablePrefs.pagar;
  const summary = summarizePagarView(view);
  const errorBlock = state.pagarError ?`<p style="color:#dc2626;font-weight:600;">${state.pagarError}</p>` : "";
  byId("pagar-screen").innerHTML = `
    <article class="table-wrap list-full-height pagar-page">
      <div class="pagar-header">
        <div class="pagar-header-copy">
          <small>Agenda de obrigações</small>
          <h3>Contas a Pagar</h3>
          <p>Acompanhe fornecedores, vencimentos e compromissos financeiros da operação.</p>
        </div>
      </div>
      ${renderPagarKpis(summary)}
      <div class="toolbar data-grid-toolbar pagar-toolbar">
        <div class="pagar-filter-group">
          <label>Data inicial <input type="date" id="pagar-data-inicial" class="upload-input" value="${state.pagarFilter.dataInicial}" /></label>
          <label>Data final <input type="date" id="pagar-data-final" class="upload-input" value="${state.pagarFilter.dataFinal}" /></label>
          <input id="pagar-search" class="upload-input pagar-search-input" placeholder="Buscar..." value="${escapeHtml(prefs.search)}" />
          <input id="pagar-bank" class="upload-input" placeholder="Banco" value="${escapeHtml(prefs.bank)}" />
          <input id="pagar-owner" class="upload-input" placeholder="Fornecedor" value="${escapeHtml(prefs.owner)}" />
          <input id="pagar-min" class="upload-input" type="number" step="0.01" placeholder="Valor mín." value="${escapeHtml(prefs.minValue)}" />
          <input id="pagar-max" class="upload-input" type="number" step="0.01" placeholder="Valor máx." value="${escapeHtml(prefs.maxValue)}" />
          <label class="pagar-filter-check"><input id="pagar-overdue" type="checkbox" ${prefs.vencidosOnly ?"checked" : ""} /> Vencidos</label>
          <select id="pagar-page-size" class="upload-input" title="Registros por página">
            <option value="10" ${view.pageSize === 10 ?"selected" : ""}>10</option>
            <option value="20" ${view.pageSize === 20 ?"selected" : ""}>20</option>
            <option value="50" ${view.pageSize === 50 ?"selected" : ""}>50</option>
          </select>
        </div>
        <div class="pagar-toolbar-actions">
          <button id="pagar-consultar-btn" class="primary-btn">Consultar</button>
          <div class="pagar-export-group" aria-label="Exportações">
            <button id="pagar-export-csv" class="ghost-btn">CSV</button>
            <button id="pagar-export-xlsx" class="ghost-btn">XLSX</button>
            <button id="pagar-export-pdf" class="ghost-btn">PDF</button>
          </div>
        </div>
      </div>
      ${errorBlock}
      ${buildPagarTable(view.paged, "pagar")}
      <div class="table-pagination data-grid-pagination pagar-pagination">
        <button id="pagar-prev" class="ghost-btn" ${view.page <= 1 ?"disabled" : ""}>Anterior</button>
        <small>Página ${view.page} de ${view.totalPages} | ${view.total} registros</small>
        <button id="pagar-next" class="ghost-btn" ${view.page >= view.totalPages ?"disabled" : ""}>Próxima</button>
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
    `<button class="th-sort data-grid-sort ${prefs.sortBy === key ?"active" : ""}" data-table="${tableType}" data-sort="${key}">
      ${label} ${prefs.sortBy === key ?(prefs.sortDir === "asc" ?"&uarr;" : "&darr;") : ""}
    </button>`;

  if (!rows.length) {
    return renderPagarEmptyState();
  }

  return `
    <div class="table-scroll data-grid-scroll pagar-table-scroll">
      <table class="data-grid pagar-table">
        <thead>
          <tr>
            <th>${sortable("DOC", "documentoID")}</th>
            <th>${sortable("Fornecedor", "fornecedor")}</th>
            <th>${sortable("Título / Nota", "titulo")}</th>
            <th>${sortable("Vencimento", "vencimento")}</th>
            <th>${sortable("Banco", "agenteCobrador")}</th>
            <th>${sortable("Valor", "saldo")}</th>
            <th>${sortable("Status", "status")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const dueTone = isPagarOverdue(row) ?"bad" : "neutral";
              return `
                <tr class="data-grid-row pagar-row ${isPagarOverdue(row) ?"is-overdue" : ""}">
                  <td class="pagar-doc-id">${escapeHtml(row.documentoID || "-")}</td>
                  <td>
                    <div class="pagar-supplier-cell">
                      <strong class="pagar-supplier-name">${escapeHtml(row.fornecedor || "Sem fornecedor")}</strong>
                      <span class="pagar-supplier-sub">Nota ${escapeHtml(row.numeroDocumento || "-")}</span>
                    </div>
                  </td>
                  <td>
                    <div class="pagar-title-cell">
                      <strong>${escapeHtml(row.titulo || row.descricao || "-")}</strong>
                      <span>${escapeHtml(row.descricao && row.descricao !== row.titulo ?row.descricao : row.numeroDocumento || "-")}</span>
                    </div>
                  </td>
                  <td>
                    <div class="pagar-date-cell ${dueTone}">
                      <strong>${escapeHtml(parseDate(row.vencimento))}</strong>
                      <span>${isPagarOverdue(row) ?"Vencido" : "Agenda"}</span>
                    </div>
                  </td>
                  <td class="pagar-bank-cell">${escapeHtml(row.agenteCobrador || "-")}</td>
                  <td class="pagar-money-cell">${currency.format(row.saldo || 0)}</td>
                  <td>${renderPagarStatusBadge(row)}</td>
                </tr>
              `;
            })
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
        (item) => `<option value="${item.id}" ${String(selectedValue) === String(item.id) ?"selected" : ""}>${escapeHtml(item.label)}</option>`
      )
    )
    .join("");
}

function getConciliacaoPipelineTone(group) {
  if (group === "conciliated") return "match";
  if (group === "review") return "review";
  if (group === "divergent") return "divergent";
  return "neutral";
}

function getConciliacaoMatchScore(tx, group = "conciliated") {
  if (tx?.settlement?.status === "success") return { label: "Baixado", tone: "success", percent: 100 };
  if (tx?.matched?.isGroup) return { label: "Match em lote", tone: "success", percent: 92 };
  if (group === "conciliated") return { label: "Match forte", tone: "success", percent: 88 };
  if (group === "review") return { label: "Revisão necessária", tone: "warning", percent: 54 };
  if (group === "divergent") return { label: "Divergente", tone: "danger", percent: 18 };
  return { label: "Em análise", tone: "neutral", percent: 40 };
}

function renderConciliacaoBadge(label, tone = "neutral") {
  return `<span class="conciliacao-badge ${tone}">${escapeHtml(label)}</span>`;
}

function renderConciliacaoScore(score) {
  const width = Math.min(Math.max(Number(score.percent || 0), 0), 100);
  return `
    <div class="conciliacao-score ${score.tone}">
      <div class="conciliacao-score-copy">
        <span>${escapeHtml(score.label)}</span>
        <strong>${width}%</strong>
      </div>
      <div class="conciliacao-score-track"><span style="width:${width}%"></span></div>
    </div>
  `;
}

function renderConciliacaoPipelineEmptyState(title, text, tone = "neutral", actionLabel = "") {
  return `
    <div class="conciliacao-pipeline-empty ${tone}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
      ${actionLabel ?`<button type="button" class="conciliacao-pipeline-empty-action" data-pipeline-clear-filters>${escapeHtml(actionLabel)}</button>` : ""}
    </div>
  `;
}

function getConciliacaoPipelineEmptyState({ group, hasResult, originalCount = 0, bankCount = 0, filteredCount = 0, filters, bankFilter }) {
  const tone = getConciliacaoPipelineTone(group);
  const defaults = {
    conciliated: {
      noResultTitle: "Processe um OFX para iniciar",
      noResultText: "As sugestões de match serão listadas após a importação.",
      emptyTitle: "Nenhum match sugerido",
      emptyText: "Quando houver correspondências confiáveis, elas aparecerão aqui."
    },
    review: {
      noResultTitle: "Aguardando processamento",
      noResultText: "Processe um arquivo OFX para identificar lançamentos que exigem revisão.",
      emptyTitle: "Nada pendente de revisão",
      emptyText: "Lançamentos com baixa confiança serão enviados para esta etapa."
    },
    divergent: {
      noResultTitle: "Nenhum lançamento encontrado",
      noResultText: "As divergências serão calculadas após a importação do OFX.",
      emptyTitle: "Nenhuma divergência encontrada",
      emptyText: "Diferenças financeiras ou ausência de match serão destacadas aqui."
    }
  };
  const copy = defaults[group] || defaults.conciliated;
  if (!hasResult) {
    return { title: copy.noResultTitle, text: copy.noResultText, tone };
  }
  if (!originalCount) {
    return { title: copy.emptyTitle, text: copy.emptyText, tone };
  }
  if (bankFilter && bankFilter !== "ALL" && !bankCount) {
    return {
      title: "Banco sem lançamentos nesta etapa",
      text: "Altere o banco selecionado ou limpe os filtros.",
      tone,
      actionLabel: getConciliationActiveFilterCount() ? "Limpar filtros" : ""
    };
  }
  if (!filteredCount) {
    if (String(filters.search || "").trim()) {
      return {
        title: "Busca sem resultado",
        text: "Tente buscar por outro termo, banco, documento ou descrição.",
        tone,
        actionLabel: "Limpar filtros"
      };
    }
    if (filters.minValue !== "" || filters.maxValue !== "") {
      return {
        title: "Nenhum valor na faixa informada",
        text: "Revise o valor mínimo e máximo ou limpe os filtros.",
        tone,
        actionLabel: "Limpar filtros"
      };
    }
    if (filters.direction !== "ALL") {
      return {
        title: filters.direction === "credit" ?"Nenhum crédito exibido" : "Nenhum débito exibido",
        text: "O filtro de movimento ocultou todos os lançamentos desta coluna.",
        tone,
        actionLabel: "Limpar filtros"
      };
    }
    return {
      title: "Nenhum lançamento encontrado",
      text: "Os filtros atuais ocultaram todos os lançamentos desta coluna.",
      tone,
      actionLabel: getConciliationActiveFilterCount() ? "Limpar filtros" : ""
    };
  }
  return { title: copy.emptyTitle, text: copy.emptyText, tone };
}

function renderConciliacaoPipelineCard(tx, options = {}) {
  const { selectable = false, checked = false, disabled = false, key = "", group = "conciliated" } = options || {};
  const tone = getConciliacaoPipelineTone(group);
  const score = getConciliacaoMatchScore(tx, group);
  const settlementTone = tx?.settlement?.status === "success" ?"is-settled" : tx?.settlement?.status === "error" ?"has-error" : "";
  const amount = Number(tx.amount || 0);
  const direction = amount >= 0 ?"Crédito" : "Débito";
  const directionTone = amount >= 0 ?"success" : "warning";
  const date = tx.postedAt ?new Date(tx.postedAt).toLocaleDateString("pt-BR") : "Data não encontrada";
  const matchType = tx?.matched?.entityType ?String(tx.matched.entityType).toUpperCase() : "";
  const matchTitle = tx?.matched?.titulo || tx?.matched?.numeroDocumento || "";
  const matchDoc = tx?.matched?.numeroDocumento || tx?.matched?.documentoID || "";
  const groupCount = tx?.matched?.isGroup ?Number(tx.matched.itemCount || tx.matched.items?.length || 0) : 0;
  const docs = tx?.matched?.isGroup
    ?(tx.matched.items || [])
        .map((item) => item.numeroDocumento || item.documentoID)
        .filter(Boolean)
        .slice(0, 4)
        .join(", ")
    : "";
  const selectBlock = selectable
    ?`<label class="tx-select conciliacao-card-select"><input type="checkbox" class="conc-item-check" data-key="${escapeHtml(key)}" ${checked ?"checked" : ""} ${disabled ?"disabled" : ""} /> Selecionar para baixa</label>`
    : "";
  const matchBlock = tx.matched
    ?`
      <div class="conciliacao-card-match-box">
        <span>${escapeHtml(tx.matched.isGroup ?`Match em lote ${matchType}` : `Match ${matchType}`)}</span>
        <strong>${escapeHtml(tx.matched.isGroup ?`${groupCount} título(s) | ${currency.format(tx.matched.totalSaldo || 0)}` : matchTitle || "-")}</strong>
        ${matchDoc || docs ?`<small>${escapeHtml(docs ?`Docs ${docs}` : `Doc ${matchDoc}`)}</small>` : ""}
      </div>
    `
    : "";
  const reasonBlock = tx.reason ?`<div class="conciliacao-card-reason"><span>Motivo</span><strong>${escapeHtml(tx.reason)}</strong></div>` : "";
  const settlementBlock = tx.settlement
    ?`
      <div class="conciliacao-card-status">
        ${renderConciliacaoBadge(
          tx.settlement.status === "success" ?"Baixado" : tx.settlement.status === "error" ?"Erro na baixa" : "Pendente",
          tx.settlement.status === "success" ?"success" : tx.settlement.status === "error" ?"danger" : "warning"
        )}
        ${tx.settlement.processedAt ?`<small>${escapeHtml(new Date(tx.settlement.processedAt).toLocaleString("pt-BR"))}</small>` : ""}
        ${tx.settlement.message ?`<p>${escapeHtml(tx.settlement.message)}</p>` : ""}
      </div>
    `
    : "";

  return `
    <article class="tx conciliacao-card ${tone} ${settlementTone}">
      ${selectBlock}
      <div class="conciliacao-card-top">
        <div class="conciliacao-card-bank">
          <span>Banco</span>
          <strong>${escapeHtml(tx.bankName || "Banco não identificado")}</strong>
        </div>
        <div class="conciliacao-card-value ${amount >= 0 ?"positive" : "negative"}">
          <span>${escapeHtml(direction)}</span>
          <strong>${currency.format(Math.abs(amount))}</strong>
        </div>
      </div>
      <div class="conciliacao-card-main">
        <strong>${escapeHtml(tx.name || "Sem descrição")}</strong>
        <span>${escapeHtml(tx.memo || "Sem memo")}</span>
      </div>
      <div class="conciliacao-card-tags">
        ${renderConciliacaoBadge(direction, directionTone)}
        ${matchType ?renderConciliacaoBadge(matchType, "neutral") : ""}
      </div>
      ${renderConciliacaoScore(score)}
      ${matchBlock}
      ${reasonBlock}
      ${settlementBlock}
      <div class="conciliacao-card-footer">
        <span>${escapeHtml(date)}</span>
        ${renderConciliacaoBadge(tone === "match" ?"Operacional" : tone === "review" ?"Revisar" : tone === "divergent" ?"Atenção" : "Monitorar", score.tone)}
      </div>
    </article>
  `;
}

function txCard(tx, options = {}) {
  return renderConciliacaoPipelineCard(tx, options);
}

function renderConciliacaoPipelineColumn({ title, subtitle, group, transactions, emptyState, actions = "", renderItem }) {
  const tone = getConciliacaoPipelineTone(group);
  const empty = emptyState || { title: "Nenhum lançamento encontrado", text: "Ajuste os filtros e tente novamente.", tone };
  return `
    <section class="conciliacao-pipeline-column ${tone}">
      <div class="conciliacao-pipeline-header">
        <div class="conciliacao-pipeline-title">
          <span>${escapeHtml(subtitle)}</span>
          <h4>${escapeHtml(title)}</h4>
        </div>
        <strong class="conciliacao-pipeline-count">${transactions.length}</strong>
      </div>
      ${actions ?`<div class="conciliacao-pipeline-actions">${actions}</div>` : ""}
      <div class="conciliacao-pipeline-list">
        ${
          transactions.length
            ?transactions.map(renderItem).join("")
            : renderConciliacaoPipelineEmptyState(empty.title, empty.text, empty.tone || tone, empty.actionLabel || "")
        }
      </div>
    </section>
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

function getConciliationFilterMatch(tx, filters, group) {
  const filterGroup = filters.group || "ALL";
  if (filterGroup === "conciliated" && group !== "conciliated") return false;
  if (filterGroup === "review" && group !== "review") return false;
  if (filterGroup === "divergent" && group !== "divergent") return false;
  if (filterGroup === "settled" && !isConciliationSettled(tx)) return false;

  const amount = Number(tx.amount || 0);
  if (filters.direction === "credit" && amount < 0) return false;
  if (filters.direction === "debit" && amount >= 0) return false;

  const absoluteAmount = Math.abs(amount);
  if (filters.minValue !== "" && absoluteAmount < Number(filters.minValue)) return false;
  if (filters.maxValue !== "" && absoluteAmount > Number(filters.maxValue)) return false;

  const query = String(filters.search || "").trim().toLowerCase();
  if (query) {
    const matched = tx.matched || {};
    const itemsText = Array.isArray(matched.items)
      ?matched.items
          .map((item) => `${item.titulo || ""} ${item.numeroDocumento || ""} ${item.documentoID || ""} ${item.cliente || ""} ${item.fornecedor || ""}`)
          .join(" ")
      : "";
    const searchSpace = [
      tx.name,
      tx.memo,
      tx.bankName,
      tx.documentNumber,
      tx.fitId,
      tx.reason,
      matched.titulo,
      matched.numeroDocumento,
      matched.documentoID,
      matched.entityType,
      matched.cliente,
      matched.fornecedor,
      itemsText
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!searchSpace.includes(query)) return false;
  }

  return true;
}

function filterConciliationTransactions(transactions, group) {
  const filters = state.conciliationFilters;
  return (transactions || []).filter((tx) => getConciliationFilterMatch(tx, filters, group));
}

function getConciliationActiveFilterCount() {
  const filters = state.conciliationFilters;
  return [
    filters.search,
    filters.group !== "ALL" ?filters.group : "",
    filters.direction !== "ALL" ?filters.direction : "",
    filters.minValue,
    filters.maxValue
  ].filter((value) => String(value || "").trim() !== "").length;
}

function clearConciliacaoFilters() {
  state.conciliationFilters = {
    search: "",
    group: "ALL",
    direction: "ALL",
    minValue: "",
    maxValue: ""
  };
  renderConciliacao();
}

function applyConciliacaoQuickAction(action) {
  if (action.group) state.conciliationFilters.group = action.group;
  if (action.direction) state.conciliationFilters.direction = action.direction;
  renderConciliacao();
}

function renderConciliacaoKeepingFilterFocus(inputId) {
  renderConciliacao();
  const input = byId(inputId);
  if (!input) return;
  input.focus();
  const cursor = String(input.value || "").length;
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(cursor, cursor);
  }
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
  if (!rows.length) {
    return renderConciliacaoEmptyState(
      "Nenhum lançamento encontrado",
      "Assim que um OFX for processado, os bancos e saldos aparecem neste resumo.",
      "neutral"
    );
  }
  return `
    <div class="table-scroll conciliacao-bank-summary-scroll">
      <table class="conciliacao-bank-summary-table">
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
            .map((row) => {
              const saldoTone = Number(row.total || 0) >= 0 ?"positive" : "negative";
              return `
            <tr>
              <td>
                <div class="conciliacao-bank-name">
                  <strong>${escapeHtml(row.bankName)}</strong>
                  <span>Resumo operacional</span>
                </div>
              </td>
              <td><span class="conciliacao-bank-count">${row.count}</span></td>
              <td><span class="conciliacao-bank-chip credit">${row.credits}</span></td>
              <td><span class="conciliacao-bank-chip debit">${row.debits}</span></td>
              <td class="conciliacao-bank-money credit">${currency.format(row.creditAmount || 0)}</td>
              <td class="conciliacao-bank-money debit">${currency.format(row.debitAmount || 0)}</td>
              <td class="conciliacao-bank-balance ${saldoTone}">${currency.format(row.total || 0)}</td>
            </tr>
          `;
            })
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
  const conciliatedAll = result ?result.groups.conciliated || [] : [];
  const conciliatedBankList = result ?filterTransactionsByBank(conciliatedAll, state.conciliationBankFilter) : [];
  const reviewBankList = result ?filterTransactionsByBank(result.groups.review, state.conciliationBankFilter) : [];
  const divergentBankList = result ?filterTransactionsByBank(result.groups.divergent, state.conciliationBankFilter) : [];
  const conciliatedList = result ?filterConciliationTransactions(conciliatedBankList, "conciliated") : [];
  const reviewList = result ?filterConciliationTransactions(reviewBankList, "review") : [];
  const divergentList = result ?filterConciliationTransactions(divergentBankList, "divergent") : [];
  const conciliationEmptyStates = {
    conciliated: getConciliacaoPipelineEmptyState({
      group: "conciliated",
      hasResult: Boolean(result),
      originalCount: conciliatedAll.length,
      bankCount: conciliatedBankList.length,
      filteredCount: conciliatedList.length,
      filters: state.conciliationFilters,
      bankFilter: state.conciliationBankFilter
    }),
    review: getConciliacaoPipelineEmptyState({
      group: "review",
      hasResult: Boolean(result),
      originalCount: result ?(result.groups.review || []).length : 0,
      bankCount: reviewBankList.length,
      filteredCount: reviewList.length,
      filters: state.conciliationFilters,
      bankFilter: state.conciliationBankFilter
    }),
    divergent: getConciliacaoPipelineEmptyState({
      group: "divergent",
      hasResult: Boolean(result),
      originalCount: result ?(result.groups.divergent || []).length : 0,
      bankCount: divergentBankList.length,
      filteredCount: divergentList.length,
      filters: state.conciliationFilters,
      bankFilter: state.conciliationBankFilter
    })
  };
  const allBankFilteredTransactions = [...conciliatedBankList, ...reviewBankList, ...divergentBankList];
  const visibleTransactions = [...conciliatedList, ...reviewList, ...divergentList];
  const filterSummary = {
    total: allBankFilteredTransactions.length,
    visible: visibleTransactions.length
  };
  const selectableAll = getSelectableConciliationTransactions(conciliatedAll);
  const selectableKeys = new Set(selectableAll.map((tx) => getConciliationTxKey(tx)));
  state.selectedConciliationKeys = new Set([...state.selectedConciliationKeys].filter((key) => selectableKeys.has(key)));
  const selectableVisible = getSelectableConciliationTransactions(conciliatedList);
  const selectedVisibleCount = selectableVisible.reduce((acc, tx) => {
    const key = getConciliationTxKey(tx);
    return acc + (state.selectedConciliationKeys.has(key) ?1 : 0);
  }, 0);
  const allVisibleSelected = selectableVisible.length > 0 && selectedVisibleCount === selectableVisible.length;
  const selectedTransactions = getSelectedConciliationTransactions(selectableAll);
  const selectedTotalCount = selectedTransactions.length;
  const selectedReceberCount = selectedTransactions.filter((tx) => tx?.matched?.entityType === "receber").length;
  const selectedPagarCount = selectedTransactions.filter((tx) => tx?.matched?.entityType === "pagar").length;
  const selectedAmountTotal = selectedTransactions.reduce((acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0);
  const filteredViewSummary = summarizeConciliationFilteredView({
    allTransactions: allBankFilteredTransactions,
    visibleTransactions,
    selectedTransactions
  });
  const conciliationSummary = summarizeConciliacao(result);
  const operationalState = getConciliacaoOperationalState({
    result,
    selectedTotalCount,
    bankFilter: state.conciliationBankFilter
  });

  const stats = result
    ?`Arquivos ${result.totals.files} | Total ${result.totals.total} | Conciliado ${result.totals.conciliated} | Revisar ${result.totals.review} | Divergente ${result.totals.divergent}`
    : "Nenhum OFX processado";
  const fileSummary =
    result && Array.isArray(result.filesSummary)
      ?result.filesSummary
          .map(
            (item) =>
              `${escapeHtml(item.fileName)} | ${escapeHtml(item.bankName)} | conta ${escapeHtml(item.accountId || "-")} | ${escapeHtml(
                item.transactions
              )} lançamentos`
          )
          .join("<br/>")
      : "";
  const matchingSummary =
    result && result.matchingSummary
      ?`Base consultada: ${result.matchingSummary.receberLoaded} receber | ${result.matchingSummary.pagarLoaded} pagar | período ${result.matchingSummary.rangeStart} até ${result.matchingSummary.rangeEnd}`
      : "";
  const dedupeSummary = result && Number(result.duplicatesRemoved || 0) > 0 ?`Duplicados removidos no OFX: ${result.duplicatesRemoved}` : "";
  const currentSummary = summarizeByBank(getAllConciliationTransactions(result));
  const accumulatedSummary = summarizeByBank(state.ofxAccumulated);
  const config = state.reconciliationForm;
  const catalogsLoaded = Object.values(catalogs).some((items) => Array.isArray(items) && items.length);
  const catalogStatus = state.reconciliationCatalogError
    ?`<p class="conc-config-note error">${escapeHtml(state.reconciliationCatalogError)}</p>`
    : catalogsLoaded
      ?`<p class="conc-config-note">Os catálogos abaixo vêm da NodeAPI. A baixa só é enviada após sua confirmação.</p>`
      : `<p class="conc-config-note">Carregando catálogos financeiros da NodeAPI...</p>`;

  byId("conciliacao-screen").innerHTML = `
    <div class="conciliacao-page">
    <section class="conciliacao-hero">
      <div class="conciliacao-hero-copy">
        <span>Central operacional</span>
        <h3>Central de Conciliação Bancária</h3>
        <p>Importe OFX, revise matches e acompanhe divergências em um fluxo operacional financeiro.</p>
        <div class="conciliacao-hero-state ${operationalState.tone}">
          <strong>${escapeHtml(operationalState.label)}</strong>
          <span>${escapeHtml(operationalState.text)}</span>
        </div>
      </div>
      <div class="conciliacao-hero-status">
        <strong>${conciliationSummary.imported}</strong>
        <span>lançamentos importados</span>
        <small>${escapeHtml(operationalState.detail)}</small>
      </div>
    </section>

    ${renderConciliacaoProcessingPanel({ banks, result, stats, fileSummary, matchingSummary, dedupeSummary })}
    ${renderConciliacaoKpis(conciliationSummary)}

    <section class="table-wrap conciliacao-summary-card">
      <h3>Resumo por banco (resultado atual)</h3>
      ${renderBankSummaryTable(currentSummary)}
    </section>
    <section class="table-wrap conciliacao-summary-card">
      <h3>Resumo por banco (acumulado)</h3>
      ${renderBankSummaryTable(accumulatedSummary)}
    </section>
    ${renderConciliacaoManualPanel({
      catalogStatus,
      config,
      catalogs,
      selectedReceberCount,
      selectedPagarCount,
      selectedAmountTotal
    })}
    ${renderConciliacaoFiltersPanel(filterSummary)}
    ${renderConciliacaoFilterSummary(filteredViewSummary)}

    <div class="conciliacao-pipeline">
      ${renderConciliacaoPipelineColumn({
        title: "Sugestões de match",
        subtitle: "Match automático",
        group: "conciliated",
        transactions: result ?conciliatedList : [],
        emptyState: conciliationEmptyStates.conciliated,
        actions: `
          <label class="conc-select-all"><input type="checkbox" id="conc-select-all" ${allVisibleSelected ?"checked" : ""} ${selectableVisible.length ?"" : "disabled"} /> Selecionar todos</label>
          <button id="conc-submit-selected" class="ghost-btn" ${selectedTotalCount ?"" : "disabled"}>Confirmar baixa manual (${selectedTotalCount})</button>
        `,
        renderItem: (tx) => {
          const key = getConciliationTxKey(tx);
          return txCard(tx, {
            group: "conciliated",
            selectable: !isConciliationSettled(tx),
            checked: state.selectedConciliationKeys.has(key),
            disabled: isConciliationSettled(tx),
            key
          });
        }
      })}
      ${renderConciliacaoPipelineColumn({
        title: "A revisar",
        subtitle: "Revisão humana",
        group: "review",
        transactions: result ?reviewList : [],
        emptyState: conciliationEmptyStates.review,
        renderItem: (tx) => txCard(tx, { group: "review" })
      })}
      ${renderConciliacaoPipelineColumn({
        title: "Divergente",
        subtitle: "Atenção crítica",
        group: "divergent",
        transactions: result ?divergentList : [],
        emptyState: conciliationEmptyStates.divergent,
        renderItem: (tx) => txCard(tx, { group: "divergent" })
      })}
    </div>
    ${renderConciliacaoHistory(state.reconciliationJobs)}
    </div>
  `;

  byId("process-ofx-btn").addEventListener("click", processOfx);
  setupConciliacaoFilePicker();
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
  byId("conc-filter-search").addEventListener("input", (event) => {
    state.conciliationFilters.search = event.target.value;
    renderConciliacaoKeepingFilterFocus("conc-filter-search");
  });
  byId("conc-filter-group").addEventListener("change", (event) => {
    state.conciliationFilters.group = event.target.value;
    renderConciliacao();
  });
  byId("conc-filter-direction").addEventListener("change", (event) => {
    state.conciliationFilters.direction = event.target.value;
    renderConciliacao();
  });
  byId("conc-filter-min-value").addEventListener("input", (event) => {
    state.conciliationFilters.minValue = event.target.value;
    renderConciliacaoKeepingFilterFocus("conc-filter-min-value");
  });
  byId("conc-filter-max-value").addEventListener("input", (event) => {
    state.conciliationFilters.maxValue = event.target.value;
    renderConciliacaoKeepingFilterFocus("conc-filter-max-value");
  });
  byId("conc-filter-clear").addEventListener("click", clearConciliacaoFilters);
  document.querySelectorAll("[data-quick-group]").forEach((button) => {
    button.addEventListener("click", () => applyConciliacaoQuickAction({ group: button.dataset.quickGroup }));
  });
  document.querySelectorAll("[data-quick-direction]").forEach((button) => {
    button.addEventListener("click", () => applyConciliacaoQuickAction({ direction: button.dataset.quickDirection }));
  });
  document.querySelectorAll("[data-quick-clear]").forEach((button) => {
    button.addEventListener("click", clearConciliacaoFilters);
  });
  document.querySelectorAll("[data-pipeline-clear-filters]").forEach((button) => {
    button.addEventListener("click", clearConciliacaoFilters);
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
      data: tx.postedAt ?new Date(tx.postedAt).toLocaleDateString("pt-BR") : "",
      descricao: tx.name || "",
      memo: tx.memo || "",
      valor: Number(tx.amount || 0),
      match: tx.matched ?`${tx.matched.entityType}:${tx.matched.numeroDocumento || ""}` : tx.reason || ""
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

const FICHA_STATUS_LABELS = {
  pendente: "Pendente",
  em_analise: "Em análise",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
  aprovada_com_ressalvas: "Aprovada c/ ressalvas"
};
const FICHA_STATUS_STYLE = {
  pendente: "background:#f1f5f9;border:1px solid #d1dce8;color:#64748b;",
  em_analise: "background:rgba(1,69,242,0.10);border:1px solid rgba(1,69,242,0.22);color:#0145F2;",
  aprovada: "background:rgba(22,163,74,0.10);border:1px solid rgba(22,163,74,0.22);color:#16a34a;",
  reprovada: "background:rgba(220,38,38,0.10);border:1px solid rgba(220,38,38,0.22);color:#dc2626;",
  aprovada_com_ressalvas: "background:rgba(217,119,6,0.10);border:1px solid rgba(217,119,6,0.22);color:#d97706;"
};
const FORMAS_PAGAMENTO_APROVADAS = [
  { id: 1, nome: "Dinheiro" },
  { id: 2, nome: "Cheque" },
  { id: 3, nome: "Crédito em Conta" },
  { id: 4, nome: "Débito em Conta" },
  { id: 6, nome: "TED" },
  { id: 8, nome: "Transferência" },
  { id: 11, nome: "Gerenciador" },
  { id: 12, nome: "Depósito em Conta" },
  { id: 13, nome: "Cartão" },
  { id: 14, nome: "Pix" },
  { id: 15, nome: "Arquivo" }
];
const PRAZOS_APROVADOS = window.PRAZOS_APROVADOS || [];
function normalizeOptionName(value) {
  return String(value || "").trim().toLowerCase();
}

function hasOptionByName(options, value) {
  const normalized = normalizeOptionName(value);
  return options.some((item) => normalizeOptionName(item.nome) === normalized);
}

function renderFormaPagamentoOptions(selectedValue) {
  const selected = String(selectedValue || "").trim();
  const selectedNormalized = normalizeOptionName(selected);

  const legacyOption =
    selected && !hasOptionByName(FORMAS_PAGAMENTO_APROVADAS, selected)
      ?`<option value="${escapeHtml(selected)}" selected>Valor atual - ${escapeHtml(selected)}</option>`
      : "";

  return `
    <option value="">Selecione...</option>
    ${legacyOption}
    ${FORMAS_PAGAMENTO_APROVADAS.map((item) => {
      const isSelected = normalizeOptionName(item.nome) === selectedNormalized ?"selected" : "";
      return `<option value="${escapeHtml(item.nome)}" ${isSelected}>${item.id} - ${escapeHtml(item.nome)}</option>`;
    }).join("")}
  `;
}
function renderPrazoDatalistOptions() {
  return PRAZOS_APROVADOS.map((item) => {
    const label = item.prazoMedio ?`${item.id} - ${item.nome} (${item.prazoMedio} dias)` : `${item.id} - ${item.nome}`;
    return `<option value="${escapeHtml(item.nome)}" label="${escapeHtml(label)}"></option>`;
  }).join("");
}

let prazoAutocompleteCleanup = null;
let formaPagamentoAutocompleteCleanup = null;

function normalizePrazoSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function filterPrazosAprovados(query) {
  const normalizedQuery = normalizePrazoSearch(query);
  const matches = PRAZOS_APROVADOS.filter((item) => {
    if (!normalizedQuery) return true;
    const searchSpace = normalizePrazoSearch(`${item.id} ${item.nome} ${item.prazoMedio ?? ""}`);
    return searchSpace.includes(normalizedQuery);
  });
  return {
    total: matches.length,
    results: matches.slice(0, 20)
  };
}

function renderPrazoAutocompleteOptions(results, total, activeIndex = 0) {
  if (!results.length) {
    return `
      <div class="fc-prazo-autocomplete-empty">
        Nenhum prazo encontrado. Você ainda pode digitar manualmente.
      </div>
    `;
  }

  const optionsHtml = results
    .map((item, index) => {
      const meta = [`ID ${item.id}`];
      if (item.prazoMedio !== undefined && item.prazoMedio !== null) {
        meta.push(`Prazo médio ${item.prazoMedio} dias`);
      }
      return `
        <button
          type="button"
          class="fc-prazo-autocomplete-option ${index === activeIndex ? "fc-prazo-autocomplete-active" : ""}"
          data-index="${index}"
          role="option"
          aria-selected="${index === activeIndex ? "true" : "false"}"
        >
          <span class="fc-prazo-autocomplete-title">${escapeHtml(item.nome)}</span>
          <span class="fc-prazo-autocomplete-meta">${escapeHtml(meta.join(" · "))}</span>
        </button>
      `;
    })
    .join("");

  const footer =
    total > results.length
      ?`<div class="fc-prazo-autocomplete-footer">Mostrando ${results.length} de ${total} resultados</div>`
      : "";

  return `${optionsHtml}${footer}`;
}

function selectPrazoAprovado(input, item) {
  if (!input || !item) return;
  input.value = item.nome;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function filterFormasPagamento(query) {
  const normalizedQuery = normalizePrazoSearch(query);
  const matches = FORMAS_PAGAMENTO_APROVADAS.filter((item) => {
    if (!normalizedQuery) return true;
    const searchSpace = normalizePrazoSearch(`${item.id} ${item.nome}`);
    return searchSpace.includes(normalizedQuery);
  });
  return {
    total: matches.length,
    results: matches.slice(0, 20)
  };
}

function renderFormaPagamentoAutocompleteOptions(results, total, activeIndex = 0) {
  if (!results.length) {
    return `
      <div class="fc-prazo-autocomplete-empty">
        Nenhuma forma de pagamento encontrada. Você ainda pode digitar manualmente.
      </div>
    `;
  }

  const optionsHtml = results
    .map(
      (item, index) => `
        <button
          type="button"
          class="fc-prazo-autocomplete-option ${index === activeIndex ? "fc-prazo-autocomplete-active" : ""}"
          data-index="${index}"
          role="option"
          aria-selected="${index === activeIndex ? "true" : "false"}"
        >
          <span class="fc-prazo-autocomplete-title">${escapeHtml(item.nome)}</span>
          <span class="fc-prazo-autocomplete-meta">ID ${escapeHtml(item.id)}</span>
        </button>
      `
    )
    .join("");

  const footer =
    total > results.length
      ?`<div class="fc-prazo-autocomplete-footer">Mostrando ${results.length} de ${total} resultados</div>`
      : "";

  return `${optionsHtml}${footer}`;
}

function selectFormaPagamento(input, item) {
  if (!input || !item) return;
  input.value = item.nome;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setupPrazoAutocomplete() {
  if (prazoAutocompleteCleanup) {
    prazoAutocompleteCleanup();
    prazoAutocompleteCleanup = null;
  }

  const input = byId("ficha-analise-prazo-estimado");
  if (!input || input.disabled) return;

  input.removeAttribute("list");
  input.setAttribute("autocomplete", "off");

  const wrapper = document.createElement("div");
  wrapper.className = "fc-prazo-autocomplete";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const menu = document.createElement("div");
  menu.className = "fc-prazo-autocomplete-menu hidden";
  menu.setAttribute("role", "listbox");
  wrapper.appendChild(menu);

  let currentResults = [];
  let currentTotal = 0;
  let activeIndex = 0;

  const closeMenu = () => {
    menu.classList.add("hidden");
  };

  const openMenu = () => {
    menu.classList.remove("hidden");
  };

  const renderMenu = () => {
    const filtered = filterPrazosAprovados(input.value);
    currentResults = filtered.results;
    currentTotal = filtered.total;
    activeIndex = currentResults.length ?Math.min(activeIndex, currentResults.length - 1) : 0;
    menu.innerHTML = renderPrazoAutocompleteOptions(currentResults, currentTotal, activeIndex);
    openMenu();
  };

  const updateActive = (nextIndex) => {
    if (!currentResults.length) return;
    activeIndex = (nextIndex + currentResults.length) % currentResults.length;
    menu.innerHTML = renderPrazoAutocompleteOptions(currentResults, currentTotal, activeIndex);
    const activeOption = menu.querySelector(`[data-index="${activeIndex}"]`);
    if (activeOption) {
      activeOption.scrollIntoView({ block: "nearest" });
    }
  };

  const handleInput = () => {
    activeIndex = 0;
    renderMenu();
  };

  const handleFocus = () => {
    activeIndex = 0;
    renderMenu();
  };

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (menu.classList.contains("hidden")) renderMenu();
      updateActive(activeIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (menu.classList.contains("hidden")) renderMenu();
      updateActive(activeIndex - 1);
      return;
    }

    if (event.key === "Enter" && !menu.classList.contains("hidden") && currentResults[activeIndex]) {
      event.preventDefault();
      selectPrazoAprovado(input, currentResults[activeIndex]);
      closeMenu();
    }
  };

  const handleMenuMouseDown = (event) => {
    const option = event.target.closest(".fc-prazo-autocomplete-option");
    if (!option) return;
    event.preventDefault();
    const index = Number(option.dataset.index);
    const item = currentResults[index];
    selectPrazoAprovado(input, item);
    closeMenu();
  };

  const handleDocumentClick = (event) => {
    if (!wrapper.contains(event.target)) {
      closeMenu();
    }
  };

  input.addEventListener("input", handleInput);
  input.addEventListener("focus", handleFocus);
  input.addEventListener("keydown", handleKeydown);
  menu.addEventListener("mousedown", handleMenuMouseDown);
  document.addEventListener("click", handleDocumentClick);

  prazoAutocompleteCleanup = () => {
    input.removeEventListener("input", handleInput);
    input.removeEventListener("focus", handleFocus);
    input.removeEventListener("keydown", handleKeydown);
    menu.removeEventListener("mousedown", handleMenuMouseDown);
    document.removeEventListener("click", handleDocumentClick);
    if (wrapper.parentNode) {
      wrapper.parentNode.insertBefore(input, wrapper);
      wrapper.remove();
    }
  };
}

function setupFormaPagamentoAutocomplete() {
  if (formaPagamentoAutocompleteCleanup) {
    formaPagamentoAutocompleteCleanup();
    formaPagamentoAutocompleteCleanup = null;
  }

  const input = byId("ficha-analise-forma-pagamento");
  if (!input || input.disabled) return;

  input.setAttribute("autocomplete", "off");

  const wrapper = document.createElement("div");
  wrapper.className = "fc-prazo-autocomplete";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const menu = document.createElement("div");
  menu.className = "fc-prazo-autocomplete-menu hidden";
  menu.setAttribute("role", "listbox");
  wrapper.appendChild(menu);

  let currentResults = [];
  let currentTotal = 0;
  let activeIndex = 0;

  const closeMenu = () => {
    menu.classList.add("hidden");
  };

  const openMenu = () => {
    menu.classList.remove("hidden");
  };

  const renderMenu = () => {
    const filtered = filterFormasPagamento(input.value);
    currentResults = filtered.results;
    currentTotal = filtered.total;
    activeIndex = currentResults.length ?Math.min(activeIndex, currentResults.length - 1) : 0;
    menu.innerHTML = renderFormaPagamentoAutocompleteOptions(currentResults, currentTotal, activeIndex);
    openMenu();
  };

  const updateActive = (nextIndex) => {
    if (!currentResults.length) return;
    activeIndex = (nextIndex + currentResults.length) % currentResults.length;
    menu.innerHTML = renderFormaPagamentoAutocompleteOptions(currentResults, currentTotal, activeIndex);
    const activeOption = menu.querySelector(`[data-index="${activeIndex}"]`);
    if (activeOption) {
      activeOption.scrollIntoView({ block: "nearest" });
    }
  };

  const handleInput = () => {
    activeIndex = 0;
    renderMenu();
  };

  const handleFocus = () => {
    activeIndex = 0;
    renderMenu();
  };

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (menu.classList.contains("hidden")) renderMenu();
      updateActive(activeIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (menu.classList.contains("hidden")) renderMenu();
      updateActive(activeIndex - 1);
      return;
    }

    if (event.key === "Enter" && !menu.classList.contains("hidden") && currentResults[activeIndex]) {
      event.preventDefault();
      selectFormaPagamento(input, currentResults[activeIndex]);
      closeMenu();
    }
  };

  const handleMenuMouseDown = (event) => {
    const option = event.target.closest(".fc-prazo-autocomplete-option");
    if (!option) return;
    event.preventDefault();
    const index = Number(option.dataset.index);
    const item = currentResults[index];
    selectFormaPagamento(input, item);
    closeMenu();
  };

  const handleDocumentClick = (event) => {
    if (!wrapper.contains(event.target)) {
      closeMenu();
    }
  };

  input.addEventListener("input", handleInput);
  input.addEventListener("focus", handleFocus);
  input.addEventListener("keydown", handleKeydown);
  menu.addEventListener("mousedown", handleMenuMouseDown);
  document.addEventListener("click", handleDocumentClick);

  formaPagamentoAutocompleteCleanup = () => {
    input.removeEventListener("input", handleInput);
    input.removeEventListener("focus", handleFocus);
    input.removeEventListener("keydown", handleKeydown);
    menu.removeEventListener("mousedown", handleMenuMouseDown);
    document.removeEventListener("click", handleDocumentClick);
    if (wrapper.parentNode) {
      wrapper.parentNode.insertBefore(input, wrapper);
      wrapper.remove();
    }
  };
}
function buildFichaClienteSkeleton() {
  return `
    <div class="fc-skeleton">
      ${[0, 1, 2, 3, 4, 5]
        .map(
          (i) => `
        <div class="fc-skel-row">
          <div class="skel skel-icon" style="--delay:${i * 0.07}s"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:7px;">
            <div class="skel skel-text" style="width:${140 + (i % 3) * 40}px;--delay:${i * 0.07 + 0.03}s"></div>
            <div class="skel skel-text" style="width:${80 + (i % 2) * 30}px;--delay:${i * 0.07 + 0.05}s"></div>
          </div>
          <div class="skel skel-pill" style="width:${70 + (i % 3) * 15}px;--delay:${i * 0.07 + 0.04}s"></div>
          <div class="skel skel-text" style="width:64px;--delay:${i * 0.07 + 0.06}s"></div>
        </div>`
        )
        .join("")}
    </div>
  `;
}

function getFichaClienteDisplayName(row) {
  return row.razaoSocial || row.nomeFantasia || "Cliente sem nome";
}

function getFichaClienteInitials(row) {
  return (
    getFichaClienteDisplayName(row)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function renderFichaStatusBadge(status) {
  const normalizedStatus = status || "pendente";
  const label = FICHA_STATUS_LABELS[normalizedStatus] || "Pendente";
  return `<span class="fc-status-badge ${escapeHtml(normalizedStatus)}">${escapeHtml(label)}</span>`;
}

function renderFichaTableEmptyState() {
  return `
    <div class="fc-empty-state">
      <strong>Nenhuma ficha encontrada</strong>
      <span>Ajuste os filtros e tente novamente.</span>
    </div>
  `;
}

function getConciliacaoAmountTotal(transactions) {
  return (transactions || []).reduce((acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0);
}

function summarizeConciliationFilteredView({ allTransactions = [], visibleTransactions = [], selectedTransactions = [] }) {
  const summary = {
    totalAll: allTransactions.length,
    totalVisible: visibleTransactions.length,
    visibleAmount: 0,
    creditCount: 0,
    creditAmount: 0,
    debitCount: 0,
    debitAmount: 0,
    selectedCount: selectedTransactions.length,
    selectedAmount: getConciliacaoAmountTotal(selectedTransactions)
  };

  for (const tx of visibleTransactions) {
    const amount = Number(tx.amount || 0);
    const absoluteAmount = Math.abs(amount);
    summary.visibleAmount += absoluteAmount;
    if (amount >= 0) {
      summary.creditCount += 1;
      summary.creditAmount += absoluteAmount;
    } else {
      summary.debitCount += 1;
      summary.debitAmount += absoluteAmount;
    }
  }

  return summary;
}

function summarizeConciliacao(result) {
  const groups = result?.groups || {};
  const conciliated = groups.conciliated || [];
  const all = getAllConciliationTransactions(result);
  return {
    files: Number(result?.totals?.files || 0),
    imported: Number(result?.totals?.total || all.length || 0),
    conciliated: Number(result?.totals?.conciliated || conciliated.length || 0),
    review: Number(result?.totals?.review || (groups.review || []).length || 0),
    divergent: Number(result?.totals?.divergent || (groups.divergent || []).length || 0),
    conciliatedAmount: getConciliacaoAmountTotal(conciliated),
    duplicatesRemoved: Number(result?.duplicatesRemoved || 0)
  };
}

function renderConciliacaoKpis(summary) {
  const items = [
    { label: "Importados", value: summary.imported, hint: `${summary.files} arquivo(s)`, tone: "neutral" },
    { label: "Conciliados", value: summary.conciliated, hint: "Matches sugeridos", tone: "success" },
    { label: "A revisar", value: summary.review, hint: "Revisão humana", tone: "warning" },
    { label: "Divergentes", value: summary.divergent, hint: "Exigem atenção", tone: "danger" },
    { label: "Valor conciliado", value: currency.format(summary.conciliatedAmount), hint: "Soma absoluta", tone: "money" }
  ];

  return `
    <section class="conciliacao-kpi-grid" aria-label="Indicadores operacionais da conciliação">
      ${items
        .map(
          (item) => `
            <article class="conciliacao-kpi-card ${item.tone}">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
              <small>${escapeHtml(item.hint)}</small>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderConciliacaoFiltersPanel(summary) {
  const filters = state.conciliationFilters;
  const activeCount = getConciliationActiveFilterCount();
  return `
    <section class="conciliacao-filters-panel">
      <div class="conciliacao-filters-header">
        <div>
          <span>Filtros operacionais</span>
          <h4>Refinar pipeline</h4>
        </div>
        <div class="conciliacao-filter-summary">
          <strong>${summary.visible}</strong>
          <span>de ${summary.total} lançamento(s)</span>
          ${activeCount ?`<em>${activeCount} filtro(s) ativo(s)</em>` : `<em>Visualização completa</em>`}
        </div>
      </div>
      ${renderConciliacaoQuickActions()}
      <div class="conciliacao-filters-grid">
        <label class="conciliacao-filter-field search">
          <span>Busca</span>
          <input id="conc-filter-search" class="upload-input" type="search" placeholder="Descrição, memo, banco, documento ou match" value="${escapeHtml(filters.search)}" />
        </label>
        <label class="conciliacao-filter-field">
          <span>Status</span>
          <select id="conc-filter-group" class="upload-input">
            <option value="ALL" ${filters.group === "ALL" ?"selected" : ""}>Todos</option>
            <option value="conciliated" ${filters.group === "conciliated" ?"selected" : ""}>Sugestões de match</option>
            <option value="review" ${filters.group === "review" ?"selected" : ""}>A revisar</option>
            <option value="divergent" ${filters.group === "divergent" ?"selected" : ""}>Divergente</option>
            <option value="settled" ${filters.group === "settled" ?"selected" : ""}>Baixados</option>
          </select>
        </label>
        <label class="conciliacao-filter-field">
          <span>Movimento</span>
          <select id="conc-filter-direction" class="upload-input">
            <option value="ALL" ${filters.direction === "ALL" ?"selected" : ""}>Todos</option>
            <option value="credit" ${filters.direction === "credit" ?"selected" : ""}>Créditos</option>
            <option value="debit" ${filters.direction === "debit" ?"selected" : ""}>Débitos</option>
          </select>
        </label>
        <label class="conciliacao-filter-field compact">
          <span>Valor mínimo</span>
          <input id="conc-filter-min-value" class="upload-input" type="number" min="0" step="0.01" placeholder="R$ mín." value="${escapeHtml(filters.minValue)}" />
        </label>
        <label class="conciliacao-filter-field compact">
          <span>Valor máximo</span>
          <input id="conc-filter-max-value" class="upload-input" type="number" min="0" step="0.01" placeholder="R$ máx." value="${escapeHtml(filters.maxValue)}" />
        </label>
        <div class="conciliacao-filter-actions">
          <button id="conc-filter-clear" class="ghost-btn" type="button" ${activeCount ?"" : "disabled"}>Limpar filtros</button>
        </div>
      </div>
      <div class="conciliacao-filter-chip">
        Banco: ${escapeHtml(state.conciliationBankFilter === "ALL" ?"Todos os bancos" : state.conciliationBankFilter)}
      </div>
    </section>
  `;
}

function renderConciliacaoQuickActions() {
  const filters = state.conciliationFilters;
  const groupChips = [
    { label: "Todos", value: "ALL" },
    { label: "Sugestões", value: "conciliated" },
    { label: "A revisar", value: "review" },
    { label: "Divergentes", value: "divergent" },
    { label: "Baixados", value: "settled" }
  ];
  const directionChips = [
    { label: "Todos movimentos", value: "ALL" },
    { label: "Créditos", value: "credit" },
    { label: "Débitos", value: "debit" }
  ];
  const activeCount = getConciliationActiveFilterCount();

  return `
    <div class="conciliacao-quick-actions">
      <div class="conciliacao-quick-group">
        <span class="conciliacao-quick-label">Status</span>
        <div>
          ${groupChips
            .map(
              (chip) => `
                <button type="button" class="conciliacao-quick-chip ${filters.group === chip.value ?"active" : ""}" data-quick-group="${chip.value}">
                  ${escapeHtml(chip.label)}
                </button>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="conciliacao-quick-group">
        <span class="conciliacao-quick-label">Movimento</span>
        <div>
          ${directionChips
            .map(
              (chip) => `
                <button type="button" class="conciliacao-quick-chip ${filters.direction === chip.value ?"active" : ""}" data-quick-direction="${chip.value}">
                  ${escapeHtml(chip.label)}
                </button>
              `
            )
            .join("")}
        </div>
      </div>
      <button type="button" class="conciliacao-quick-chip danger" data-quick-clear ${activeCount ?"" : "disabled"}>Limpar filtros</button>
    </div>
  `;
}

function renderConciliacaoFilterSummary(summary) {
  const cards = [
    {
      label: "Exibindo",
      value: `${summary.totalVisible} de ${summary.totalAll}`,
      sub: "lançamento(s)"
    },
    {
      label: "Total filtrado",
      value: currency.format(summary.visibleAmount),
      sub: "soma absoluta"
    },
    {
      label: "Créditos",
      value: `${summary.creditCount}`,
      sub: currency.format(summary.creditAmount),
      tone: "success"
    },
    {
      label: "Débitos",
      value: `${summary.debitCount}`,
      sub: currency.format(summary.debitAmount),
      tone: "warning"
    },
    {
      label: "Selecionados",
      value: `${summary.selectedCount}`,
      sub: currency.format(summary.selectedAmount),
      tone: summary.selectedCount ? "money" : "neutral"
    }
  ];

  return `
    <section class="conciliacao-filter-summary-panel">
      ${cards
        .map(
          (card) => `
            <article class="conciliacao-filter-summary-card ${card.tone || "neutral"}">
              <span class="conciliacao-filter-summary-label">${escapeHtml(card.label)}</span>
              <strong class="conciliacao-filter-summary-value">${escapeHtml(card.value)}</strong>
              <small class="conciliacao-filter-summary-sub">${escapeHtml(card.sub)}</small>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderConciliacaoEmptyState(title, text, tone = "neutral") {
  return `
    <div class="conciliacao-empty-state ${tone}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function getConciliacaoOperationalState({ result, selectedTotalCount = 0, bankFilter = "ALL" }) {
  if (!result) {
    return {
      tone: "neutral",
      label: "Aguardando OFX",
      text: "Processe um arquivo para iniciar o fluxo operacional.",
      detail: "Sem itens carregados"
    };
  }
  if (selectedTotalCount > 0) {
    return {
      tone: "success",
      label: `${selectedTotalCount} selecionado(s)`,
      text: "Itens prontos para confirmação de baixa manual.",
      detail: "Seleção ativa"
    };
  }
  if (bankFilter && bankFilter !== "ALL") {
    return {
      tone: "warning",
      label: "Filtro por banco",
      text: `Visualizando somente ${bankFilter}.`,
      detail: "Filtro ativo"
    };
  }
  return {
    tone: "success",
    label: "OFX processado",
    text: "Pipeline pronto para revisão e conciliação.",
    detail: "Operação carregada"
  };
}

function renderConciliacaoProcessingPanel({ banks, result, stats, fileSummary, matchingSummary, dedupeSummary }) {
  const statusTone = result ?"success" : "neutral";
  return `
    <section class="conciliacao-processing-panel">
      <div class="conciliacao-processing-copy">
        <span>Processamento OFX</span>
        <h4>Importação e leitura bancária</h4>
        <p>Carregue arquivos, processe a pasta operacional e acompanhe o status da conciliação em tempo real.</p>
      </div>
      <div class="conciliacao-processing-controls">
        <div class="conciliacao-file-row">
          <div class="conciliacao-file-picker">
            <input type="file" id="ofx-file" accept=".ofx,.txt" multiple class="upload-input conciliacao-file-input" />
            <button type="button" class="conciliacao-file-trigger">Selecionar arquivo OFX</button>
            <span class="conciliacao-file-info conciliacao-file-empty">Nenhum arquivo selecionado</span>
          </div>
          <button id="process-ofx-btn" class="primary-btn conciliacao-primary-action">Processar OFX</button>
        </div>
        <div class="conciliacao-action-row">
          <div class="conciliacao-action-cluster">
            <button id="process-folder-ofx-btn" class="ghost-btn conciliacao-secondary-action">Processar pasta /ofx</button>
            <button id="accumulate-ofx-btn" class="ghost-btn conciliacao-secondary-action" ${result ?"" : "disabled"}>Acumular resultado atual</button>
            <button id="clear-accum-ofx-btn" class="ghost-btn conciliacao-danger-action" ${state.ofxAccumulated.length ?"" : "disabled"}>Limpar acumulado</button>
          </div>
          <div class="conciliacao-action-cluster">
            <button id="conc-export-csv" class="ghost-btn conciliacao-export-action" ${result ?"" : "disabled"}>Exportar CSV</button>
            <button id="conc-export-pdf" class="ghost-btn conciliacao-export-action" ${result ?"" : "disabled"}>Exportar PDF</button>
            <select id="bank-filter" class="upload-input conciliacao-bank-filter">
              <option value="ALL">Todos os bancos</option>
              ${banks.map((bank) => `<option value="${escapeHtml(bank)}" ${state.conciliationBankFilter === bank ?"selected" : ""}>${escapeHtml(bank)}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      <div class="conciliacao-processing-status ${statusTone}">
        <strong>${escapeHtml(stats)}</strong>
        ${fileSummary ?`<p>${fileSummary}</p>` : ""}
        ${matchingSummary ?`<p>${escapeHtml(matchingSummary)}</p>` : ""}
        ${dedupeSummary ?`<p>${escapeHtml(dedupeSummary)}</p>` : ""}
      </div>
    </section>
  `;
}

function getConciliacaoFilePickerLabel(files) {
  if (!files || !files.length) return "Nenhum arquivo selecionado";
  if (files.length === 1) return files[0].name;
  return `${files.length} arquivos selecionados`;
}

function updateConciliacaoFilePicker() {
  const input = byId("ofx-file");
  const info = document.querySelector(".conciliacao-file-info");
  if (!input || !info) return;
  const files = Array.from(input.files || []);
  info.textContent = getConciliacaoFilePickerLabel(files);
  info.classList.toggle("conciliacao-file-empty", !files.length);
  info.classList.toggle("conciliacao-file-selected", files.length > 0);
}

function setupConciliacaoFilePicker() {
  const input = byId("ofx-file");
  const trigger = document.querySelector(".conciliacao-file-trigger");
  if (!input || !trigger) return;
  trigger.addEventListener("click", () => input.click());
  input.addEventListener("change", updateConciliacaoFilePicker);
  updateConciliacaoFilePicker();
}


function renderConciliacaoMetricChip(label, value, tone = "neutral") {
  return `
    <span class="conciliacao-manual-chip ${tone}">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value)}</strong>
    </span>
  `;
}

function renderConciliacaoManualPanel({ catalogStatus, config, catalogs, selectedReceberCount, selectedPagarCount, selectedAmountTotal }) {
  return `
    <section class="conc-config-card conciliacao-manual-panel">
      <div class="conc-config-header conciliacao-manual-header">
        <div>
          <span class="conciliacao-manual-eyebrow">Parametrização operacional</span>
          <h3>Baixa Manual</h3>
          ${catalogStatus}
        </div>
        <div class="conc-config-metrics conciliacao-manual-metrics">
          ${renderConciliacaoMetricChip("Receber", selectedReceberCount, "success")}
          ${renderConciliacaoMetricChip("Pagar", selectedPagarCount, "warning")}
          ${renderConciliacaoMetricChip("Selecionado", currency.format(selectedAmountTotal), "money")}
        </div>
      </div>
      <div class="conciliacao-manual-grid">
        <fieldset class="conciliacao-manual-group context">
          <legend>Contexto operacional</legend>
          <label class="conc-config-field conciliacao-manual-field">
            <span>Organização ID</span>
            <input id="conc-organizacao-id" class="upload-input" type="number" min="1" value="${escapeHtml(config.organizacaoId)}" />
          </label>
        </fieldset>
        <fieldset class="conciliacao-manual-group receber">
          <legend>Recebimento</legend>
          <label class="conc-config-field conciliacao-manual-field">
            <span>Depositário</span>
            <select id="conc-depositario-id" class="upload-input">
              ${buildCatalogOptions(catalogs.depositarios, config.depositarioId, "Selecione o depositário")}
            </select>
          </label>
          <label class="conc-config-field conciliacao-manual-field">
            <span>Tipo operação receber</span>
            <select id="conc-tipo-operacao-receber-id" class="upload-input">
              ${buildCatalogOptions(catalogs.tiposDeOperacao, config.tipoOperacaoReceberId, "Selecione para receber")}
            </select>
          </label>
        </fieldset>
        <fieldset class="conciliacao-manual-group pagar">
          <legend>Pagamento</legend>
          <label class="conc-config-field conciliacao-manual-field">
            <span>Tipo operação pagar</span>
            <select id="conc-tipo-operacao-pagar-id" class="upload-input">
              ${buildCatalogOptions(catalogs.tiposDeOperacao, config.tipoOperacaoPagarId, "Selecione para pagar")}
            </select>
          </label>
          <label class="conc-config-field conciliacao-manual-field">
            <span>Meio de pagamento</span>
            <select id="conc-meio-pagamento-id" class="upload-input">
              ${buildCatalogOptions(catalogs.meiosDePagamento, config.meioPagamentoId, "Selecione o meio")}
            </select>
          </label>
          <label class="conc-config-field conciliacao-manual-field">
            <span>Fonte de recursos</span>
            <select id="conc-fonte-recursos-id" class="upload-input">
              ${buildCatalogOptions(catalogs.fonteDeRecursos, config.fonteDeRecursosId, "Selecione a fonte")}
            </select>
          </label>
        </fieldset>
      </div>
    </section>
  `;
}

function getConciliacaoJobStatus(job) {
  const status = String(job?.status || "").toLowerCase();
  if (["completed", "complete", "success", "done"].includes(status)) return { label: "Concluído", tone: "success" };
  if (["failed", "error", "erro"].includes(status)) return { label: "Erro", tone: "danger" };
  if (["processing", "running", "pending", "queued"].includes(status)) return { label: "Processando", tone: "warning" };
  if (status.includes("reprocess")) return { label: "Reprocessado", tone: "neutral" };
  return { label: job?.status || "Pendente", tone: "neutral" };
}

function renderConciliacaoHistory(jobs) {
  return `
    <section class="conciliacao-history-panel">
      <div class="conciliacao-history-header">
        <div>
          <span>Auditoria OFX</span>
          <h3>Histórico de Processamentos OFX</h3>
          <p>Acompanhe os processamentos recentes e reexecute leituras quando necessário.</p>
        </div>
        <strong>${jobs.length}</strong>
      </div>
      <div class="conciliacao-history-list">
        ${
          jobs.length
            ? jobs
                .map((job) => {
                  const status = getConciliacaoJobStatus(job);
                  return `
                    <article class="conciliacao-history-item ${status.tone}">
                      <div class="conciliacao-history-main">
                        <span class="conciliacao-history-job">Job ${escapeHtml(job.id)}</span>
                        <strong>${escapeHtml(status.label)}</strong>
                        <small>Criado em ${escapeHtml(parseDate(job.createdAt))}</small>
                      </div>
                      <div class="conciliacao-history-stats">
                        <span><small>Total</small><strong>${escapeHtml(job.result?.totals?.total ?? "-")}</strong></span>
                        <span><small>Conciliado</small><strong>${escapeHtml(job.result?.totals?.conciliated ?? "-")}</strong></span>
                      </div>
                      <div class="conciliacao-history-actions">
                        ${renderConciliacaoBadge(status.label, status.tone)}
                        <button class="ghost-btn reprocess-btn conciliacao-history-action" data-job="${escapeHtml(job.id)}">Reprocessar</button>
                      </div>
                    </article>
                  `;
                })
                .join("")
            : renderConciliacaoEmptyState("Nenhum processamento disponível", "O histórico será preenchido após o primeiro processamento OFX.", "neutral")
        }
      </div>
    </section>
  `;
}

function getFichaClienteSortValue(row, sortBy) {
  if (sortBy === "id") return Number(row.id) || 0;
  if (sortBy === "razaoSocial") return getFichaClienteDisplayName(row);
  if (sortBy === "tipo") return `${row.tipo || ""} ${row.vendedor || ""}`;
  if (sortBy === "statusAnalise") return row.statusAnalise || "";
  if (sortBy === "vendedor") return row.vendedor || "";
  if (sortBy === "data") {
    const value = String(row.data || "").trim();
    const brDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brDate) return new Date(`${brDate[3]}-${brDate[2]}-${brDate[1]}T00:00:00`).getTime();
    return toComparable(value);
  }
  return toComparable(row[sortBy]);
}

function applyFichaClienteSort(rows) {
  const prefs = state.tablePrefs.fichaCliente || { sortBy: "data", sortDir: "desc" };
  const sortBy = prefs.sortBy || "data";
  const sortDir = prefs.sortDir === "asc" ?"asc" : "desc";
  return [...rows].sort((a, b) => {
    const av = toComparable(getFichaClienteSortValue(a, sortBy));
    const bv = toComparable(getFichaClienteSortValue(b, sortBy));
    if (av === bv) {
      const aid = Number(a.id) || 0;
      const bid = Number(b.id) || 0;
      return sortDir === "asc" ?aid - bid : bid - aid;
    }
    const cmp = av > bv ?1 : -1;
    return sortDir === "asc" ?cmp : -cmp;
  });
}

function buildFichaScrollView(rows) {
  if (!rows.length) {
    return renderFichaTableEmptyState();
  }
  const prefs = state.tablePrefs.fichaCliente;
  const sortedRows = applyFichaClienteSort(rows);
  const sortable = (label, key) =>
    `<button class="th-sort data-grid-sort ${prefs.sortBy === key ?"active" : ""}" data-table="fichaCliente" data-sort="${key}">
      ${label} ${prefs.sortBy === key ?(prefs.sortDir === "asc" ?"&uarr;" : "&darr;") : ""}
    </button>`;

  return `
    <div class="fc-table-shell data-grid-shell ficha-delivery-table-shell">
      <div class="fc-table-scroll data-grid-scroll ficha-delivery-table-scroll">
        <table class="data-grid fc-premium-table ficha-delivery-table">
          <thead>
            <tr>
              <th>${sortable("#", "id")}</th>
              <th>${sortable("Cliente", "razaoSocial")}</th>
              <th>${sortable("Documento / Tipo", "tipo")}</th>
              <th>${sortable("Data da ficha", "data")}</th>
              <th>${sortable("Status", "statusAnalise")}</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${sortedRows
              .map((row) => {
                const status = row.statusAnalise || "pendente";
                const displayName = getFichaClienteDisplayName(row);
                const initials = getFichaClienteInitials(row);

                return `
                  <tr class="data-grid-row fc-premium-row">
                    <td class="fc-id-cell">#${escapeHtml(row.id)}</td>
                    <td>
                      <div class="fc-client-cell">
                        <div class="fc-client-avatar">${escapeHtml(initials)}</div>
                        <div class="fc-client-copy">
                          <strong class="fc-client-name">${escapeHtml(displayName)}</strong>
                          <span class="fc-client-doc">${escapeHtml(row.cnpJouCPF || "-")}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div class="fc-doc-type">${escapeHtml(row.tipo || "-")}</div>
                      <div class="fc-doc-vendor">${escapeHtml(row.vendedor || "-")}</div>
                    </td>
                    <td class="fc-date-cell">${escapeHtml(parseDate(row.data))}</td>
                    <td>${renderFichaStatusBadge(status)}</td>
                    <td>
                      <div class="fc-row-actions">
                        <button class="data-grid-action fc-table-action ficha-open-btn" data-id="${escapeHtml(row.id)}" type="button">Ver análise</button>
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>

      ${state.fichaClienteSelected ?buildFichaClienteDetailPanel(state.fichaClienteSelected, { context: "table-split" }) : ""}
    </div>
  `;
}

function buildFichaCardsView(rows) {
  return `
    <div class="fc-cards-grid">
      ${rows
        .map((row) => {
          const status = row.statusAnalise || "pendente";
          const displayName = getFichaClienteDisplayName(row);
          const initials = getFichaClienteInitials(row);
          return `
          <article class="fc-card-item ficha-open-btn" data-id="${escapeHtml(row.id)}" tabindex="0" role="button">
            <div class="fc-card-top">
              <div class="fc-card-avatar">${escapeHtml(initials)}</div>
              ${renderFichaStatusBadge(status)}
            </div>
            <div class="fc-card-body">
              <strong class="fc-card-name">${escapeHtml(displayName)}</strong>
              <span class="fc-card-sub">${escapeHtml(row.cnpJouCPF || "-")}</span>
            </div>
            <div class="fc-card-meta">
              <div class="fc-card-meta-item">
                <span>Tipo</span>
                <strong>${escapeHtml(row.tipo || "-")}</strong>
              </div>
              <div class="fc-card-meta-item">
                <span>Vendedor</span>
                <strong>${escapeHtml(row.vendedor || "-")}</strong>
              </div>
              <div class="fc-card-meta-item">
                <span>Data</span>
                <strong>${escapeHtml(parseDate(row.data))}</strong>
              </div>
            </div>
          </article>`;
        })
        .join("")}
    </div>
  `;
}

function renderFichaClienteCardsModal(ficha) {
  if (!ficha) return "";
  const displayName = getFichaClienteDisplayName(ficha);
  return `
    <div class="fc-modal-overlay">
      <section class="fc-modal-shell" role="dialog" aria-modal="true" aria-label="Análise da ficha">
        <header class="fc-modal-header">
          <div>
            <strong>Análise da ficha #${escapeHtml(ficha.id)}</strong>
            <span>${escapeHtml(displayName)}</span>
          </div>
          <button class="fc-modal-close ficha-modal-close" type="button" aria-label="Fechar modal">×</button>
        </header>
        <div class="fc-modal-body fc-modal-body-split">
          ${buildFichaClienteDetailPanel(ficha, { context: "modal-split" })}
        </div>
      </section>
    </div>
  `;
}

function buildFichaStackView(rows) {
  return `
    <div class="fc-stack">
      ${rows
        .map(
          (row, i) => {
            const status = row.statusAnalise || "pendente";
            const displayName = getFichaClienteDisplayName(row);
            const initials = getFichaClienteInitials(row);
            const isSelected =
              state.fichaClienteSelected != null && String(state.fichaClienteSelected.id) === String(row.id);
            return `
          <div class="fc-stack-row ficha-open-btn${isSelected ?" active" : ""}" data-id="${escapeHtml(row.id)}" tabindex="0" role="button">
            <span class="fc-stack-num">#${i + 1}</span>
            <div class="fc-stack-avatar">${escapeHtml(initials)}</div>
            <div class="fc-stack-main">
              <div class="fc-stack-name">${escapeHtml(displayName)}</div>
              <div class="fc-stack-doc">${escapeHtml(row.cnpJouCPF || "-")}</div>
              <div class="fc-stack-context">
                <span>${escapeHtml(row.tipo || "-")}</span>
                <span>${escapeHtml(row.vendedor || "-")}</span>
              </div>
            </div>
            <div class="fc-stack-meta">
              <span class="fc-stack-date">${escapeHtml(parseDate(row.data))}</span>
              ${renderFichaStatusBadge(status)}
            </div>
          </div>`;
          }
        )
        .join("")}
    </div>
  `;
}
function buildFichaClienteTable(rows) {
  if (!rows.length) {
    return `<p style="padding:24px 0;color:var(--text-soft);">Nenhuma ficha encontrada. Use os filtros acima e clique em Consultar.</p>`;
  }
  const view = state.fichaClienteView || "scroll";
  if (view === "cards") {
    return `
      ${buildFichaCardsView(rows)}
      ${state.fichaClienteSelected ?renderFichaClienteCardsModal(state.fichaClienteSelected) : ""}
    `;
  }
  if (view === "stack") {
    return `
      <div class="fc-stack-drawer-layout">
        <div class="fc-stack-drawer-list">
          ${buildFichaStackView(rows)}
        </div>
        <div class="fc-stack-drawer-detail">
          ${
            state.fichaClienteSelected
              ?buildFichaClienteDetailPanel(state.fichaClienteSelected, { context: "stack" })
              : `<div class="fc-empty-detail">
                  <h3>Selecione uma ficha</h3>
                  <p>Clique em um cliente da lista para visualizar a análise financeira.</p>
                 </div>`
          } 
        </div>
      </div>
    `;
  } 
  return buildFichaScrollView(rows);
}

function buildFichaClienteDetailSection(title, items) {
  return `
    <section class="fc-detail-section" style="margin-bottom:18px;">
      <div class="fc-detail-section-header" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
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

function buildFichaClienteAnexos(anexos) {
  if (!anexos.length) return "<p>Nenhum anexo enviado.</p>";

  return `<div style="display:grid;gap:8px;">${anexos
    .map(
      (item) => `
        <div style="padding:14px;border:1px solid #e2eaf0;border-radius:16px;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="min-width:0;">
            <strong style="display:block;word-break:break-word;">${escapeHtml(item.nome || "Anexo")}</strong>
            ${item.assetPath ?`<div style="color:var(--text-soft);font-size:11px;word-break:break-all;margin-top:2px;">${escapeHtml(item.assetPath)}</div>` : ""}
          </div>
          ${item.assetPath ?`<button class="ficha-download-btn" data-asset-path="${escapeHtml(item.assetPath)}" data-nome="${escapeHtml(item.nome || "anexo")}" style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:12px;background:#0145F2;color:#fff;font-size:12px;font-weight:700;border:none;cursor:pointer;">&#8595; Baixar</button>` : ""}
        </div>
      `
    )
    .join("")}</div>`;
}

function buildFichaClienteDetailPanel(ficha, options = {}) {
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
  const context = options.context || "default";
  const isSplitContext = context === "split";
  const detailPanelClass = isSplitContext ? "fc-detail-panel-split" : "fc-detail-panel-stack";
  const analysisPaneStyle = isSplitContext ? "min-width:0;" : "min-width:0;position:sticky;top:0;margin-top:30px;";


  const headerHtml = `
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
  `;
  const dataPaneHtml = `
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
        ${buildFichaClienteAnexos(anexos)}
      </div>
  `;
  const analysisPaneHtml = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:14px;">
          <div>
            <small style="display:block;color:#0145F2;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Resultado da análise</small>
            <h4 style="margin:0;font-size:20px;letter-spacing:-0.02em;">Análise Financeira</h4>
          </div>
          <span style="display:inline-flex;align-items:center;padding:8px 12px;border-radius:999px;background:${statusTone.bg};border:1px solid ${statusTone.border};color:${statusTone.text};font-size:11px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(statusLabelMap[currentStatus] || "Em análise")}</span>
        </div>
        <div class="fc-analysis-summary-stack" style="display:grid;gap:10px;margin-bottom:14px;">
          <div class="fc-analysis-summary-item" style="padding:12px;border-radius:16px;background:#ffffff;border:1px solid #e2eaf0;">
            <small style="display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Valor</small>
            <strong style="font-size:13px;">${escapeHtml(pagamentoAnalise.valorPedido || "-")}</strong>
          </div>
          <div class="fc-analysis-summary-item" style="padding:12px;border-radius:16px;background:#ffffff;border:1px solid #e2eaf0;">
            <small style="display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Pagamento</small>
            <strong style="font-size:13px;">${escapeHtml(pagamentoAnalise.formaPagamento || "-")}</strong>
          </div>
          <div class="fc-analysis-summary-item" style="padding:12px;border-radius:16px;background:#ffffff;border:1px solid #e2eaf0;">
            <small style="display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Prazo</small>
            <strong style="font-size:13px;">${escapeHtml(pagamentoAnalise.prazoEstimado || "-")}</strong>
          </div>
        </div>
        <div class="toolbar" style="padding:0;">
          <label style="width:100%;">Status da análise
            <select id="ficha-analise-status" class="upload-input" ${isFinal ?"disabled" : ""}>
              ${analysisOptions
                .map((option) => `<option value="${option.value}" ${ficha.statusAnalise === option.value ?"selected" : ""}>${option.label}</option>`)
                .join("")}
            </select>
          </label>
        </div>
        <label style="display:block;margin-top:12px;">
          <span style="display:block;margin-bottom:6px;">Observação da análise</span>
          <textarea id="ficha-analise-observacao" class="upload-input" style="min-height:132px;width:100%;border-radius:16px;" ${isFinal ?"disabled" : ""}>${escapeHtml(ficha.observacaoAnalise || "")}</textarea>
        </label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px;">
          <label>Valor do pedido aprovado
            <input id="ficha-analise-valor-pedido" class="upload-input" value="${escapeHtml(pagamentoAnalise.valorPedido || "")}" ${isFinal ?"disabled" : ""} />
          </label>
          <label>Forma de pagamento aprovada
            <input
              id="ficha-analise-forma-pagamento"
              class="upload-input"
              value="${escapeHtml(pagamentoAnalise.formaPagamento || "")}"
              ${isFinal ?"disabled" : ""}
            />
          </label>
          <label>Prazo estimado aprovado
            <input
              id="ficha-analise-prazo-estimado"
              class="upload-input"
              value="${escapeHtml(pagamentoAnalise.prazoEstimado || "")}"
              ${isFinal ?"disabled" : ""}
            />
          </label>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px;">
          <div>
            <small style="display:block;color:var(--text-soft);">Analisado por</small>
            <div>${escapeHtml(ficha.analisadoPor || "-")}</div>
          </div>
          <div>
            <small style="display:block;color:var(--text-soft);">Analisado em</small>
            <div>${escapeHtml(ficha.analisadoEm ?new Date(ficha.analisadoEm).toLocaleString("pt-BR") : "-")}</div>
          </div>
        </div>
        <div style="margin-top:14px;">
          ${
            isFinal
              ?`<div style="padding:14px 16px;border-radius:16px;background:#f1f5f9;border:1px solid #e2eaf0;text-align:center;font-weight:700;color:var(--text-soft);">Análise concluída. Esta ficha não pode mais ser alterada.</div>`
              : `<button id="ficha-save-analise" class="primary-btn" style="width:100%;padding:14px 18px;border-radius:16px;" ${state.fichaClienteSaving ?"disabled" : ""}>${state.fichaClienteSaving ?"Salvando..." : "Salvar análise"}</button>`
          }
        </div>
  `;

  if (context === "table-split" || context === "modal-split") {
    const splitWrapperClass = context === "modal-split" ? "fc-detail-wrapper-modal-split" : "fc-detail-wrapper-split";
    const splitPanelClass = context === "modal-split" ? "fc-detail-panel-modal-split" : "fc-detail-panel-table-split";
    return `
    <article class="table-wrap fc-detail-wrapper ${splitWrapperClass}" data-detail-context="${escapeHtml(context)}" style="margin-top:16px;padding:22px;border-radius:24px;background:#ffffff;border:1px solid #d1dce8;box-shadow:0 4px 20px rgba(1,69,242,0.06);">
      ${headerHtml}
      <div class="fc-detail-panel fc-detail-panel-split ${splitPanelClass}">
        <div class="fc-detail-data-pane fc-detail-scroll-pane">
          <div class="fc-detail-pane-card fc-detail-data-card">
            ${dataPaneHtml}
          </div>
        </div>
        <aside class="fc-detail-analysis-pane fc-detail-scroll-pane">
          <div class="fc-detail-pane-card fc-detail-analysis-card">
            ${analysisPaneHtml}
          </div>
        </aside>
      </div>
    </article>
  `;
  }

  return `
    <article class="table-wrap fc-detail-wrapper ${detailPanelClass}" data-detail-context="${escapeHtml(context)}" style="margin-top:16px;padding:22px;border-radius:24px;background:#ffffff;border:1px solid #d1dce8;box-shadow:0 4px 20px rgba(1,69,242,0.06);">
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
      <div class="fc-detail-panel ${detailPanelClass}">
        <div class="fc-detail-data-pane fc-detail-scroll-pane">
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
        ${buildFichaClienteAnexos(anexos)}
      </div>
        </div>
        <aside class="fc-detail-analysis-pane fc-detail-scroll-pane" style="${analysisPaneStyle}">
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
            <select id="ficha-analise-status" class="upload-input" ${isFinal ?"disabled" : ""}>
              ${analysisOptions
                .map((option) => `<option value="${option.value}" ${ficha.statusAnalise === option.value ?"selected" : ""}>${option.label}</option>`)
                .join("")}
            </select>
          </label>
        </div>
        <label style="display:block;margin-top:12px;">
          <span style="display:block;margin-bottom:6px;">Observação da análise</span>
          <textarea id="ficha-analise-observacao" class="upload-input" style="min-height:132px;width:100%;border-radius:16px;" ${isFinal ?"disabled" : ""}>${escapeHtml(ficha.observacaoAnalise || "")}</textarea>
        </label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px;">
          <label>Valor do pedido aprovado
            <input id="ficha-analise-valor-pedido" class="upload-input" value="${escapeHtml(pagamentoAnalise.valorPedido || "")}" ${isFinal ?"disabled" : ""} />
          </label>
          <label>Forma de pagamento aprovada
            <input
              id="ficha-analise-forma-pagamento"
              class="upload-input"
              value="${escapeHtml(pagamentoAnalise.formaPagamento || "")}"
              ${isFinal ?"disabled" : ""}
            />
          </label>
          <label>Prazo estimado aprovado
            <input
              id="ficha-analise-prazo-estimado"
              class="upload-input"
              value="${escapeHtml(pagamentoAnalise.prazoEstimado || "")}"
              ${isFinal ?"disabled" : ""}
            />
          </label>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px;">
          <div>
            <small style="display:block;color:var(--text-soft);">Analisado por</small>
            <div>${escapeHtml(ficha.analisadoPor || "-")}</div>
          </div>
          <div>
            <small style="display:block;color:var(--text-soft);">Analisado em</small>
            <div>${escapeHtml(ficha.analisadoEm ?new Date(ficha.analisadoEm).toLocaleString("pt-BR") : "-")}</div>
          </div>
        </div>
        <div style="margin-top:14px;">
          ${
            isFinal
              ?`<div style="padding:14px 16px;border-radius:16px;background:#f1f5f9;border:1px solid #e2eaf0;text-align:center;font-weight:700;color:var(--text-soft);">Análise concluída. Esta ficha não pode mais ser alterada.</div>`
              : `<button id="ficha-save-analise" class="primary-btn" style="width:100%;padding:14px 18px;border-radius:16px;" ${state.fichaClienteSaving ?"disabled" : ""}>${state.fichaClienteSaving ?"Salvando..." : "Salvar análise"}</button>`
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
  const view = state.fichaClienteView || "scroll";
  const errorBlock = state.fichaClienteError
    ?`<p style="color:#dc2626;font-weight:600;margin:0 0 14px;">${state.fichaClienteError}</p>`
    : "";

  byId("ficha-cliente-screen").innerHTML = `
    <article class="table-wrap list-full-height ficha-delivery-page">
      <div class="fc-header ficha-delivery-header">
        <h3 style="margin:0;">Ficha de Cliente</h3>
        <div class="fc-mode-switcher">
          ${[
            { v: "scroll", label: "Tabela" },
            { v: "cards", label: "Cards" },
            { v: "stack", label: "Lista" }
          ]
            .map(({ v, label }) => `<button class="fc-view-btn${view === v ?" active" : ""}" data-view="${v}">${label}</button>`)
            .join("")}
        </div>
      </div>
      <div class="fc-toolbar ficha-delivery-toolbar">
        <div class="fc-search-wrap">
          <input id="ficha-search" type="search" placeholder="Buscar razão social, fantasia ou CNPJ/CPF..." value="${escapeHtml(filter.search)}" />
          <kbd>⌘K</kbd>
        </div>
        <input type="date" id="ficha-data-inicial" class="upload-input" style="height:40px;" value="${filter.dataInicial}" title="Data inicial" />
        <input type="date" id="ficha-data-final" class="upload-input" style="height:40px;" value="${filter.dataFinal}" title="Data final" />
        <input id="ficha-tipo" class="upload-input" style="height:40px;max-width:120px;" placeholder="Tipo" value="${escapeHtml(filter.tipo)}" />
        <input id="ficha-vendedor-id" class="upload-input" style="height:40px;max-width:130px;" placeholder="Vendedor ID" value="${escapeHtml(filter.vendedorId)}" />
        <select id="ficha-limit" class="upload-input" style="height:40px;">
          ${["20", "50", "100", "200"].map((v) => `<option value="${v}"${filter.limit === v ?" selected" : ""}>${v}</option>`).join("")}
        </select>
        <button id="ficha-consultar-btn" class="primary-btn" style="height:40px;">Consultar</button>
      </div>
      ${errorBlock}
      ${
        state.fichaClienteLoading
          ?buildFichaClienteSkeleton()
          : `<p style="margin:0 0 14px;font-size:13px;color:var(--text-soft);"><strong style="color:var(--text-strong);">${state.fichaCliente.length}</strong> ficha(s) encontrada(s).</p>
             ${buildFichaClienteTable(state.fichaCliente)}`
      }
    </article>
  `;

  document.querySelectorAll(".fc-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.fichaClienteView = btn.getAttribute("data-view");
      renderFichaCliente();
    });
  });

  const accordion = document.querySelector(".fc-accordion");
  if (accordion) {
    accordion.addEventListener("click", (e) => {
      const head = e.target.closest(".fc-acc-head");
      if (!head) return;
      const item = head.closest(".fc-acc-item");
      const isOpen = item.classList.contains("open");
      if (isOpen && state.fichaClienteSelected && String(item.dataset.id) === String(state.fichaClienteSelected.id)) {
        state.fichaClienteSelected = null;
        renderFichaCliente();
        return;
      }
      item.classList.toggle("open");
    });
  }

  byId("ficha-search").addEventListener("input", (e) => {
    state.fichaClienteFilter.search = e.target.value;
    savePreferences();
  });
  byId("ficha-data-inicial").addEventListener("change", (e) => {
    state.fichaClienteFilter.dataInicial = e.target.value;
    savePreferences();
  });
  byId("ficha-data-final").addEventListener("change", (e) => {
    state.fichaClienteFilter.dataFinal = e.target.value;
    savePreferences();
  });
  byId("ficha-tipo").addEventListener("input", (e) => {
    state.fichaClienteFilter.tipo = e.target.value;
    savePreferences();
  });
  byId("ficha-vendedor-id").addEventListener("input", (e) => {
    state.fichaClienteFilter.vendedorId = e.target.value;
    savePreferences();
  });
  byId("ficha-limit").addEventListener("change", (e) => {
    state.fichaClienteFilter.limit = e.target.value;
    savePreferences();
  });
  byId("ficha-consultar-btn").addEventListener("click", () => {
    loadFichaClienteData(state.fichaClienteFilter).catch((error) => alert(error.message));
  });

  document.querySelectorAll(".ficha-open-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;
      loadFichaClienteDetail(id).catch((error) => alert(error.message));
    });
  });

  if (state.fichaClienteSelected) {
    const closeDetailButton = byId("ficha-close-detail");
    if (closeDetailButton) {
      closeDetailButton.addEventListener("click", () => {
        state.fichaClienteSelected = null;
        renderFichaCliente();
      });
    }
    document.querySelectorAll(".ficha-modal-close").forEach((button) => {
      button.addEventListener("click", () => {
        state.fichaClienteSelected = null;
        renderFichaCliente();
      });
    });
    document.querySelectorAll(".ficha-download-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        downloadAnexo(btn.dataset.assetPath, btn.dataset.nome).catch((e) => alert(e.message));
      });
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
        }).catch((error) => alert(error.message));
      });
    }
  }
  setupFormaPagamentoAutocomplete();
  setupPrazoAutocomplete();
}

async function fetchJson(url, options = {}) {
  await ensureSessionFresh();
  const headers = {
    "Content-Type": "application/json",
    ...(state.token ?{ Authorization: `Bearer ${state.token}` } : {}),
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
    headers: state.token ?{ Authorization: `Bearer ${state.token}` } : {},
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
      fonteDeRecursos: Array.isArray(payload.fonteDeRecursos) ?payload.fonteDeRecursos : [],
      depositarios: Array.isArray(payload.depositarios) ?payload.depositarios : [],
      tiposDeOperacao: Array.isArray(payload.tiposDeOperacao) ?payload.tiposDeOperacao : [],
      meiosDePagamento: Array.isArray(payload.meiosDePagamento) ?payload.meiosDePagamento : []
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
    state.ofxAccumulated = Array.isArray(data) ?data : [];
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
  state.ofxAccumulated = Array.isArray(payload.items) ?payload.items : state.ofxAccumulated;
}

async function clearAccumulatedOfxRemote() {
  const payload = await fetchJson("/api/reconciliation/accumulated", {
    method: "DELETE"
  });
  state.ofxAccumulated = Array.isArray(payload.items) ?payload.items : [];
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

  } catch (error) {
    state.receberError = error.message;
    state.receber = [];
    renderReceber();
    throw error;
  }
}

async function loadFichaClienteData(filter = state.fichaClienteFilter) {
  state.fichaClienteLoading = true;
  state.fichaClienteError = "";
  renderFichaCliente();
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
    state.fichaClienteLoading = false;
    renderFichaCliente();
  } catch (error) {
    state.fichaClienteLoading = false;
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
    state.fichaCliente = state.fichaCliente.map((item) => (item.id === updatedRow.id ?{ ...item, ...updatedRow } : item));
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
  byId("user-name").textContent = data.user.nome || data.user.usuario || "usuario";
  byId("user-avatar").textContent = (data.user.nome || data.user.usuario || "U")[0].toUpperCase();
  loadPreferences();
  state.receberError = "";
  state.pagarError = "";
  state.receber = [];
  state.pagar = [];
  saveSession();
  renderReceber();
  renderPagar();
  renderConciliacao();
  await loadReconciliationJobs();
  await loadAccumulatedOfx();
  computeNotifications();

  byId("login-view").classList.add("hidden");
  byId("app-view").classList.remove("hidden");
  await setActiveScreen("receber");
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
        state.tablePrefs[tableType].sortDir = state.tablePrefs[tableType].sortDir === "asc" ?"desc" : "asc";
      } else {
        state.tablePrefs[tableType].sortBy = sortKey;
        state.tablePrefs[tableType].sortDir = "asc";
      }
      savePreferences();
      if (tableType === "receber") renderReceber();
      if (tableType === "pagar") renderPagar();
      if (tableType === "fichaCliente") renderFichaCliente();
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
  void Promise.all([loadReconciliationJobs(), loadAccumulatedOfx()]).then(() => setActiveScreen("receber"));
} else {
  void setActiveScreen("receber");
}
