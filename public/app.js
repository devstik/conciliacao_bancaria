const state = {
  token: null,
  user: null,
  receber: [],
  pagar: [],
  pagarError: "",
  receberError: "",
  receberFilter: getDefaultDateRange(),
  pagarFilter: getDefaultDateRange(),
  ofxResult: null,
  activeScreen: "overview",
  sidebarCollapsed: false
};

const menuItems = [
  { id: "overview", label: "Overview", icon: "OV" },
  { id: "receber", label: "Contas a Receber", icon: "CR" },
  { id: "pagar", label: "Contas a Pagar", icon: "CP" },
  { id: "conciliacao", label: "Conciliação Bancária", icon: "CB" }
];

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function byId(id) {
  return document.getElementById(id);
}

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toYmd = (date) => date.toISOString().slice(0, 10);
  return { dataInicial: toYmd(start), dataFinal: toYmd(end) };
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
    status: String(pick(row, ["status", "situacao", "statusDescricao"], "Em aberto"))
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

async function setActiveScreen(screen) {
  state.activeScreen = screen;
  byId("screen-title").textContent = menuItems.find((item) => item.id === screen)?.label || "Overview";

  document.querySelectorAll(".screen").forEach((screenEl) => screenEl.classList.add("hidden"));
  byId(`${screen}-screen`).classList.remove("hidden");

  document.querySelectorAll(".menu button").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screen);
  });

  if (!state.user) {
    if (screen === "conciliacao") {
      renderConciliacao();
    }
    return;
  }

  if (screen === "receber") {
    renderReceber();
  }

  if (screen === "pagar") {
    renderPagar();
  }

  if (screen === "overview") {
    renderOverview();
  }

  if (screen === "conciliacao") {
    renderConciliacao();
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
    });
    menu.appendChild(button);
  }
}

function applySidebarState() {
  const appView = byId("app-view");
  appView.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
}

function renderOverview() {
  const totalReceber = state.receber.reduce((sum, row) => sum + row.valor, 0);
  const totalPagar = state.pagar.reduce((sum, row) => sum + row.valor, 0);
  const saldoPrevisto = totalReceber - totalPagar;

  byId("overview-screen").innerHTML = `
    <div class="cards-row">
      <article class="card">
        <small>Contas a Receber</small>
        <strong>${currency.format(totalReceber)}</strong>
        <p>${state.receber.length} títulos</p>
      </article>
      <article class="card">
        <small>Contas a Pagar</small>
        <strong>${currency.format(totalPagar)}</strong>
        <p>${state.pagar.length} títulos</p>
      </article>
      <article class="card">
        <small>Saldo Previsto</small>
        <strong>${currency.format(saldoPrevisto)}</strong>
        <p>Receber - Pagar</p>
      </article>
    </div>

    <div class="panel-grid">
      <article class="table-wrap">
        <h3>Próximos recebimentos</h3>
        ${buildTable(state.receber, "cliente")}
      </article>
      <article class="status-board">
        <h3>Status do dia</h3>
        <p><span class="tag ok">${state.receber.filter((r) => r.status.includes("aberto") || r.status.includes("Aberto")).length} em aberto</span></p>
        <p><span class="tag warn">${state.pagar.filter((r) => !r.status.includes("Pago")).length} a pagar</span></p>
        <p><span class="tag bad">${state.receber.filter((r) => r.status.includes("Atras") || r.status.includes("Venc")).length} atrasados/vencidos</span></p>
      </article>
    </div>
  `;
}

function buildTable(rows, ownerKey) {
  return `
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
  `;
}

function renderReceber() {
  const errorBlock = state.receberError ? `<p style="color:#a33434;font-weight:600;">${state.receberError}</p>` : "";
  byId("receber-screen").innerHTML = `
    <article class="table-wrap">
      <h3>Contas a Receber</h3>
      <div class="toolbar">
        <label>Data inicial <input type="date" id="receber-data-inicial" class="upload-input" value="${state.receberFilter.dataInicial}" /></label>
        <label>Data final <input type="date" id="receber-data-final" class="upload-input" value="${state.receberFilter.dataFinal}" /></label>
        <button id="receber-consultar-btn" class="primary-btn">Consultar</button>
      </div>
      ${errorBlock}
      ${buildReceberTable(state.receber)}
    </article>
  `;

  byId("receber-data-inicial").addEventListener("change", (event) => {
    state.receberFilter.dataInicial = event.target.value;
  });
  byId("receber-data-final").addEventListener("change", (event) => {
    state.receberFilter.dataFinal = event.target.value;
  });
  byId("receber-consultar-btn").addEventListener("click", () => {
    loadReceberData(state.receberFilter).catch((error) => {
      alert(error.message);
    });
  });
}

function buildReceberTable(rows) {
  return `
    <table>
      <thead>
        <tr>
          <th>DOC</th>
          <th>Nota</th>
          <th>Cliente</th>
          <th>Titulo</th>
          <th>Vencimento</th>
          <th>Banco</th>
          <th>Valor</th>
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
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderPagar() {
  const errorBlock = state.pagarError ? `<p style="color:#a33434;font-weight:600;">${state.pagarError}</p>` : "";
  byId("pagar-screen").innerHTML = `
    <article class="table-wrap">
      <h3>Contas a Pagar</h3>
      <div class="toolbar">
        <label>Data inicial <input type="date" id="pagar-data-inicial" class="upload-input" value="${state.pagarFilter.dataInicial}" /></label>
        <label>Data final <input type="date" id="pagar-data-final" class="upload-input" value="${state.pagarFilter.dataFinal}" /></label>
        <button id="pagar-consultar-btn" class="primary-btn">Consultar</button>
      </div>
      ${errorBlock}
      ${buildPagarTable(state.pagar)}
    </article>
  `;

  byId("pagar-data-inicial").addEventListener("change", (event) => {
    state.pagarFilter.dataInicial = event.target.value;
  });
  byId("pagar-data-final").addEventListener("change", (event) => {
    state.pagarFilter.dataFinal = event.target.value;
  });
  byId("pagar-consultar-btn").addEventListener("click", () => {
    loadPagarData(state.pagarFilter).catch((error) => {
      alert(error.message);
    });
  });
}

function buildPagarTable(rows) {
  return `
    <table>
      <thead>
        <tr>
          <th>DOC</th>
          <th>Nota</th>
          <th>Fornecedor</th>
          <th>Titulo</th>
          <th>Vencimento</th>
          <th>Banco</th>
          <th>Valor</th>
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
  `;
}

function txCard(tx) {
  const valueClass = tx.amount >= 0 ? "ok" : "warn";
  const amount = currency.format(Math.abs(tx.amount));
  const direction = tx.amount >= 0 ? "Crédito" : "Débito";
  return `
    <article class="tx">
      <small class="tag ${valueClass}">${direction}</small>
      <strong>${tx.name || "Sem descrição"} - ${amount}</strong>
      <p>${tx.memo || "Sem memo"}</p>
      <p>${tx.postedAt ? new Date(tx.postedAt).toLocaleDateString("pt-BR") : "Data não encontrada"}</p>
    </article>
  `;
}

function renderConciliacao() {
  const result = state.ofxResult;
  const stats = result
    ? `Total ${result.totals.total} | Conciliado ${result.totals.conciliated} | Revisar ${result.totals.review} | Divergente ${result.totals.divergent}`
    : "Nenhum OFX processado";

  byId("conciliacao-screen").innerHTML = `
    <h3>Conciliação Bancária</h3>
    <p>Importe o OFX e processe para classificar os lançamentos.</p>

    <div class="toolbar">
      <input type="file" id="ofx-file" accept=".ofx,.txt" class="upload-input" />
      <button id="process-ofx-btn" class="primary-btn">Processar OFX</button>
      <button id="insert-btn" class="ghost-btn" ${result ? "" : "disabled"}>Inserir no banco via POST</button>
      <strong>${stats}</strong>
    </div>

    <div class="conc-grid">
      <section class="conc-column">
        <h4>Conciliado</h4>
        <div class="column-list">${result ? result.groups.conciliated.map(txCard).join("") || "<p>Sem itens</p>" : "<p>Aguardando OFX</p>"}</div>
      </section>
      <section class="conc-column">
        <h4>A revisar</h4>
        <div class="column-list">${result ? result.groups.review.map(txCard).join("") || "<p>Sem itens</p>" : "<p>Aguardando OFX</p>"}</div>
      </section>
      <section class="conc-column">
        <h4>Divergente</h4>
        <div class="column-list">${result ? result.groups.divergent.map(txCard).join("") || "<p>Sem itens</p>" : "<p>Aguardando OFX</p>"}</div>
      </section>
    </div>
  `;

  byId("process-ofx-btn").addEventListener("click", processOfx);
  byId("insert-btn").addEventListener("click", insertConciliated);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Erro na requisição");
  return data;
}

async function processOfx() {
  const input = byId("ofx-file");
  const file = input.files[0];

  if (!file) {
    alert("Selecione um arquivo OFX primeiro.");
    return;
  }

  const formData = new FormData();
  formData.append("ofxFile", file);

  const response = await fetch("/api/reconciliation/ofx", {
    method: "POST",
    body: formData
  });

  const payload = await response.json();

  if (!response.ok) {
    alert(payload.message || "Falha ao processar OFX");
    return;
  }

  state.ofxResult = payload;
  renderConciliacao();
}

async function insertConciliated() {
  if (!state.ofxResult) return;

  const conciliated = state.ofxResult.groups.conciliated;
  if (!conciliated.length) {
    alert("Não há transações conciliadas para inserir.");
    return;
  }

  const payload = await fetchJson("/api/reconciliation/insert", {
    method: "POST",
    body: JSON.stringify({ transactions: conciliated })
  });

  alert(payload.message);
}

async function loadDashboardData() {
  renderOverview();
}

async function loadReceberData(filter = state.receberFilter) {
  try {
    const query = new URLSearchParams({
      dataInicial: filter.dataInicial,
      dataFinal: filter.dataFinal
    }).toString();
    const receberResp = await fetchJson(`/api/receber?${query}`);
    state.receber = (receberResp.rows || []).map(mapReceberRow);
    state.receberError = "";
    renderReceber();
    renderOverview();
  } catch (error) {
    state.receberError = error.message;
    state.receber = [];
    renderReceber();
    throw error;
  }
}

async function loadPagarData(filter = state.pagarFilter) {
  try {
    const query = new URLSearchParams({
      dataInicial: filter.dataInicial,
      dataFinal: filter.dataFinal
    }).toString();
    const pagarResp = await fetchJson(`/api/pagar?${query}`);
    state.pagar = (pagarResp.rows || []).map(mapPagarRow);
    state.pagarError = "";
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
  state.user = data.user;
  byId("user-name").textContent = data.user.nome;

  state.receberFilter = getDefaultDateRange();
  state.pagarFilter = getDefaultDateRange();
  state.receberError = "";
  state.pagarError = "";
  state.receber = [];
  state.pagar = [];
  renderOverview();
  renderReceber();
  renderPagar();
  renderConciliacao();

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
      await setActiveScreen(state.activeScreen);
    } catch (error) {
      alert(error.message);
    }
  });

  byId("logout-btn").addEventListener("click", () => {
    state.token = null;
    state.user = null;
    state.ofxResult = null;
    byId("app-view").classList.add("hidden");
    byId("login-view").classList.remove("hidden");
    byId("login-form").reset();
    byId("login-message").textContent = "";
  });

  byId("sidebar-toggle").addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    applySidebarState();
  });
}

mountMenu();
bindEvents();
applySidebarState();
void setActiveScreen("overview");
