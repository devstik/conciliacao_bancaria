window.ComissaoScreens = window.ComissaoScreens || {};

/*
 * Tela "Tabelas de Preço" (Comissão 2.0) — só apresentação.
 * Toda chamada ao backend passa por window.tabelaPrecoApi (comissao/tabelaPrecoApi.js).
 * Nenhuma regra de comissão aqui: situação, "pode excluir", erros e avisos da
 * planilha vêm prontos da API. Valores monetários e percentuais só são formatados.
 */
(function () {
  const SCREEN_ID = "comissao-tabelas-preco";
  const REGIOES = ["CE", "NE", "V3"];
  const ITENS_POR_PAGINA_PROBLEMAS = 50;
  const ITENS_POR_PAGINA_FAIXAS = 100;

  const SITUACAO = {
    vigente: { label: "Vigente", tone: "ok" },
    futura: { label: "Futura", tone: "warn" },
    substituida: { label: "Substituída", tone: "neutral" }
  };

  const api = () => window.tabelaPrecoApi;

  /* ───────────────────────── Formatação (só exibição) ───────────────────────── */

  function fmtData(iso) {
    if (!iso) return "—";
    return String(iso).slice(0, 10).split("-").reverse().join("/");
  }

  function fmtDataHora(iso) {
    if (!iso) return "—";
    const s = String(iso);
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        return d
          .toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
          .replace(",", "");
      }
    }
    const hora = s.slice(11, 16);
    return `${fmtData(s)}${hora ? ` ${hora}` : ""}`;
  }

  // "0.3805" -> "0,3805" (4 casas). Manipula o texto; nenhuma conta.
  function fmtPreco(texto) {
    if (texto === null || texto === undefined || texto === "") return "—";
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(texto));
    if (!m) return String(texto);
    return `${m[1]}${m[2]},${(m[3] || "").padEnd(4, "0")}`;
  }

  // Fração em texto -> percentual pt-BR deslocando a vírgula: "0.0150" -> "1,5%".
  function fmtPercentual(texto) {
    if (texto === null || texto === undefined || texto === "") return "—";
    const m = /^(\d+)(?:\.(\d+))?$/.exec(String(texto));
    if (!m) return String(texto);
    const frac = (m[2] || "").padEnd(2, "0");
    const inteiro = (m[1] + frac.slice(0, 2)).replace(/^0+(?=\d)/, "");
    const resto = frac.slice(2).replace(/0+$/, "");
    return `${inteiro}${resto ? `,${resto}` : ""}%`;
  }

  function fmtTamanho(bytes) {
    const kb = bytes / 1024;
    return kb < 1024
      ? `${kb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`
      : `${(kb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  }

  function fmtInteiro(n) {
    return Number(n || 0).toLocaleString("pt-BR");
  }

  function normalizarBusca(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  }

  function badgeSituacao(situacao) {
    const st = SITUACAO[situacao] || { label: situacao || "—", tone: "neutral" };
    return `<span class="receber-status-badge ${st.tone}">${escapeHtml(st.label)}</span>`;
  }

  function mensagemErro(error) {
    return error?.message || "Erro inesperado. Tente de novo.";
  }

  /* ───────────────────────── Estados reutilizáveis ───────────────────────── */

  function htmlCarregando(rotulo) {
    return `<div class="fxc-skeleton" aria-busy="true" aria-label="${escapeHtml(rotulo)}">
      ${'<div class="fxc-skel-row"></div>'.repeat(4)}
    </div>`;
  }

  function htmlPendente(detalhe) {
    return `<div class="receber-empty-state tp-pendente" role="status">
      <strong>Aguardando integração com o backend</strong>
      <span>${escapeHtml(detalhe)}</span>
    </div>`;
  }

  function htmlErro(titulo, mensagem, acao) {
    return `<div class="receber-empty-state" role="alert">
      <strong>${escapeHtml(titulo)}</strong>
      <span>${escapeHtml(mensagem)}</span>
      ${acao ? `<button type="button" class="ghost-btn" ${acao}>Tentar de novo</button>` : ""}
    </div>`;
  }

  function htmlVazio(titulo, texto) {
    return `<div class="receber-empty-state"><strong>${escapeHtml(titulo)}</strong>${texto ? `<span>${escapeHtml(texto)}</span>` : ""}</div>`;
  }

  // Alerta dentro de modal: pendente de integração ou erro comum.
  function htmlAlertaErro(erro) {
    if (!erro) return "";
    if (erro.pendente) {
      return `<p class="tp-alerta warn" role="alert"><strong>Aguardando integração com o backend.</strong><br />${escapeHtml(erro.mensagem)}</p>`;
    }
    return `<p class="tp-alerta bad" role="alert">${escapeHtml(erro.mensagem)}</p>`;
  }

  function lerErro(error) {
    return { pendente: api().ehIntegracaoPendente(error), mensagem: mensagemErro(error) };
  }

  /* ───────────────────────── Estado e lista ───────────────────────── */

  const local = {
    regiao: "CE",
    importacoes: [],
    estado: "carregando", // carregando | ok | erro | pendente
    erro: "",
    aviso: ""
  };
  let requisicaoLista = 0;
  let timerAviso = null;
  let telaLigada = false;

  function mostrarAviso(texto, tom = "ok") {
    local.aviso = texto;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => {
      local.aviso = "";
      const el = byId("tp-aviso");
      if (el) el.textContent = "";
    }, 7000);
    const el = byId("tp-aviso");
    if (el) {
      el.className = `tp-aviso ${tom}`;
      el.textContent = texto;
    }
  }

  async function carregarImportacoes() {
    const minha = ++requisicaoLista;
    local.estado = "carregando";
    local.erro = "";
    atualizarLista();
    try {
      const lista = await api().listarImportacoes(local.regiao);
      if (minha !== requisicaoLista) return;
      local.importacoes = lista;
      local.estado = "ok";
    } catch (error) {
      if (minha !== requisicaoLista || isSessionInvalidError(error)) return;
      local.importacoes = [];
      local.estado = api().ehIntegracaoPendente(error) ? "pendente" : "erro";
      local.erro = mensagemErro(error);
    }
    atualizarLista();
  }

  function htmlLista() {
    if (local.estado === "carregando") return htmlCarregando("Carregando importações");
    if (local.estado === "pendente") return htmlPendente("A listagem de importações ainda não foi disponibilizada pelo backend.");
    if (local.estado === "erro") return htmlErro("Não foi possível carregar as importações", local.erro, 'data-acao="recarregar"');
    if (!local.importacoes.length) {
      return htmlVazio(`Nenhuma importação para ${local.regiao}.`, "Use Importar planilha para enviar a primeira tabela desta região.");
    }
    const linhas = local.importacoes
      .map(
        (imp) => `<tr>
          <td><strong>v${escapeHtml(imp.versao)}</strong></td>
          <td>${fmtData(imp.vigenciaInicio)}</td>
          <td>${badgeSituacao(imp.situacao)}</td>
          <td>${escapeHtml(fmtDataHora(imp.importadoEm))}</td>
          <td>${escapeHtml(imp.importadoPor || "—")}</td>
          <td class="tp-num">${fmtInteiro(imp.qtdArtigos)}</td>
          <td><div class="tp-acoes">
            <button type="button" class="ghost-btn tp-btn-sm" data-acao="detalhe" data-id="${escapeHtml(imp.id)}">Ver faixas</button>
            ${
              imp.podeExcluir
                ? `<button type="button" class="ghost-btn tp-btn-sm tp-btn-danger-ghost" data-acao="excluir" data-id="${escapeHtml(imp.id)}">Excluir</button>`
                : ""
            }
          </div></td>
        </tr>`
      )
      .join("");
    return `<div class="table-scroll"><table class="tp-table">
      <caption class="tp-sr-only">Importações de tabela de preço de ${escapeHtml(local.regiao)}</caption>
      <thead><tr>
        <th scope="col">Versão</th><th scope="col">Início de vigência</th><th scope="col">Situação</th>
        <th scope="col">Importada em</th><th scope="col">Usuário</th><th scope="col" class="tp-num">Artigos</th>
        <th scope="col"><span class="tp-sr-only">Ações</span></th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
  }

  function atualizarLista() {
    const el = byId("tp-lista");
    if (el) el.innerHTML = htmlLista();
  }

  function draw() {
    const el = byId(`${SCREEN_ID}-screen`);
    if (!el) return;
    const opcoes = REGIOES.map((r) => `<option value="${r}"${r === local.regiao ? " selected" : ""}>${r}</option>`).join("");
    el.innerHTML = `
      <article class="table-wrap receber-page tp-page">
        <div class="receber-header tp-header">
          <div class="receber-header-copy">
            <small>Comissões</small>
            <h3>Tabelas de Preço</h3>
            <p>Importações da tabela de preço por região e as faixas de comissão de cada uma.</p>
          </div>
          <div class="tp-header-acoes">
            <div class="receber-filter-group">
              <label>Região <select id="tp-regiao" class="upload-input">${opcoes}</select></label>
            </div>
            <button type="button" class="primary-btn" data-acao="importar">Importar planilha</button>
          </div>
        </div>
        ${api().usandoMock ? `<p class="tp-mock">Dados fictícios (modo de demonstração). Nada aqui vem do banco.</p>` : ""}
        <p id="tp-aviso" class="tp-aviso" role="status" aria-live="polite">${escapeHtml(local.aviso)}</p>
        <div id="tp-lista">${htmlLista()}</div>
      </article>`;
  }

  function ligarTela(el) {
    if (telaLigada) return;
    telaLigada = true;
    el.addEventListener("click", (e) => {
      const alvo = e.target.closest("[data-acao]");
      if (!alvo || !el.contains(alvo)) return;
      const acao = alvo.dataset.acao;
      if (acao === "recarregar") void carregarImportacoes();
      else if (acao === "importar") abrirImportacao();
      else if (acao === "detalhe") abrirDetalhe(alvo.dataset.id);
      else if (acao === "excluir") abrirExclusao(alvo.dataset.id);
    });
    el.addEventListener("change", (e) => {
      if (e.target.id !== "tp-regiao") return;
      local.regiao = e.target.value;
      void carregarImportacoes();
    });
  }

  /* ───────────────────────── Modal genérico ───────────────────────── */

  let modal = null;

  function focaveis(raiz) {
    return Array.from(
      raiz.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
    ).filter((n) => n.offsetParent !== null || n.classList.contains("tp-sr-only"));
  }

  // opcoes: { titulo, subtitulo, lateral, tamanho: "sm"|"md"|"lg", aoFechar }
  function abrirModal(opcoes) {
    fecharModal(true);
    const overlay = document.createElement("div");
    overlay.className = `fc-modal-overlay tp-overlay${opcoes.lateral ? " tp-overlay-lateral" : ""}`;
    overlay.innerHTML = `
      <section class="fc-modal-shell tp-modal tp-modal-${opcoes.tamanho || "md"}" role="dialog" aria-modal="true"
               aria-labelledby="tp-modal-titulo" tabindex="-1">
        <header class="fc-modal-header">
          <div><strong id="tp-modal-titulo"></strong><span id="tp-modal-subtitulo"></span></div>
          <button type="button" class="fc-modal-close" data-modal="fechar" aria-label="Fechar">×</button>
        </header>
        <div class="fc-modal-body tp-modal-body" id="tp-modal-corpo"></div>
        <footer class="tp-modal-footer" id="tp-modal-rodape"></footer>
      </section>`;
    modal = { overlay, origem: document.activeElement, ocupado: false, aoFechar: opcoes.aoFechar };
    overlay.querySelector("#tp-modal-titulo").textContent = opcoes.titulo || "";
    overlay.querySelector("#tp-modal-subtitulo").textContent = opcoes.subtitulo || "";
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) fecharModal();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target.closest('[data-modal="fechar"]')) fecharModal();
    });
    overlay.addEventListener("keydown", tratarTecladoModal);
    document.body.appendChild(overlay);
    return overlay;
  }

  function tratarTecladoModal(e) {
    if (!modal) return;
    if (e.key === "Escape") {
      e.preventDefault();
      fecharModal();
      return;
    }
    if (e.key !== "Tab") return;
    const lista = focaveis(modal.overlay);
    if (!lista.length) return;
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  function focarModal(seletor) {
    if (!modal) return;
    const alvo = (seletor && modal.overlay.querySelector(seletor)) || focaveis(modal.overlay.querySelector("#tp-modal-corpo"))[0];
    (alvo || modal.overlay.querySelector(".tp-modal")).focus();
  }

  function definirModal({ subtitulo, corpo, rodape }) {
    if (!modal) return;
    if (subtitulo !== undefined) modal.overlay.querySelector("#tp-modal-subtitulo").textContent = subtitulo;
    if (corpo !== undefined) modal.overlay.querySelector("#tp-modal-corpo").innerHTML = corpo;
    if (rodape !== undefined) modal.overlay.querySelector("#tp-modal-rodape").innerHTML = rodape;
  }

  // forcar=true ignora "ocupado" (troca de modal); Esc e "fechar" respeitam operação em andamento.
  function fecharModal(forcar) {
    if (!modal) return;
    if (modal.ocupado && !forcar) return;
    const { overlay, origem, aoFechar } = modal;
    modal = null;
    overlay.remove();
    if (aoFechar) aoFechar();
    if (origem && document.contains(origem)) origem.focus();
  }

  function modalAberto(overlay) {
    return modal && modal.overlay === overlay;
  }

  function htmlPaginacao(total, pagina, porPagina, atributo) {
    const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
    if (total <= porPagina) return "";
    const inicio = (pagina - 1) * porPagina;
    return `<div class="tp-paginacao">
      <span>${fmtInteiro(inicio + 1)}–${fmtInteiro(Math.min(total, inicio + porPagina))} de ${fmtInteiro(total)}</span>
      <button type="button" class="ghost-btn tp-btn-sm" ${atributo}="-1"${pagina <= 1 ? " disabled" : ""}>Anterior</button>
      <span>Página ${pagina} de ${totalPaginas}</span>
      <button type="button" class="ghost-btn tp-btn-sm" ${atributo}="1"${pagina >= totalPaginas ? " disabled" : ""}>Próxima</button>
    </div>`;
  }

  /* ───────────────────────── Detalhe da importação ───────────────────────── */

  function abrirDetalhe(id) {
    const imp = local.importacoes.find((i) => i.id === id);
    const overlay = abrirModal({
      titulo: imp ? `Faixas da versão v${imp.versao} · ${imp.regiao}` : "Faixas da importação",
      subtitulo: imp ? `Vigência a partir de ${fmtData(imp.vigenciaInicio)}` : "",
      lateral: true
    });
    const ctx = { faixas: [], busca: "", pagina: 1 };

    const carregar = async () => {
      definirModal({ corpo: htmlCarregando("Carregando faixas"), rodape: "" });
      focarModal();
      try {
        const detalhe = await api().detalharImportacao(id);
        if (!modalAberto(overlay)) return;
        ctx.faixas = detalhe.faixas;
        definirModal({
          corpo: `<label class="tp-campo">Buscar artigo
              <input type="search" id="tp-detalhe-busca" class="receber-search-input" placeholder="Nome do artigo" autocomplete="off" />
            </label>
            <p class="tp-contagem" id="tp-detalhe-contagem" aria-live="polite"></p>
            <div id="tp-detalhe-tabela"></div>`
        });
        atualizarDetalhe(ctx);
        focarModal("#tp-detalhe-busca");
      } catch (error) {
        if (!modalAberto(overlay) || isSessionInvalidError(error)) return;
        definirModal({
          corpo: api().ehIntegracaoPendente(error)
            ? htmlPendente("O detalhe das importações ainda não foi disponibilizado pelo backend.")
            : htmlErro("Não foi possível carregar as faixas", mensagemErro(error), 'data-detalhe="recarregar"')
        });
        focarModal('[data-detalhe="recarregar"]');
      }
    };

    overlay.addEventListener("input", (e) => {
      if (e.target.id !== "tp-detalhe-busca") return;
      ctx.busca = e.target.value;
      ctx.pagina = 1;
      atualizarDetalhe(ctx);
    });
    overlay.addEventListener("click", (e) => {
      if (e.target.closest('[data-detalhe="recarregar"]')) void carregar();
      const pag = e.target.closest("[data-pagina-faixas]");
      if (pag) {
        ctx.pagina += Number(pag.dataset.paginaFaixas);
        atualizarDetalhe(ctx);
      }
    });
    void carregar();
  }

  function atualizarDetalhe(ctx) {
    const termo = normalizarBusca(ctx.busca);
    const filtradas = termo ? ctx.faixas.filter((f) => normalizarBusca(f.artigo).includes(termo)) : ctx.faixas;
    const qtdArtigos = new Set(filtradas.map((f) => f.artigo)).size;
    byId("tp-detalhe-contagem").textContent = `${fmtInteiro(qtdArtigos)} artigo(s), ${fmtInteiro(filtradas.length)} faixa(s)`;
    const alvo = byId("tp-detalhe-tabela");
    if (!ctx.faixas.length) {
      alvo.innerHTML = htmlVazio("Esta importação não tem faixas.");
      return;
    }
    if (!filtradas.length) {
      alvo.innerHTML = htmlVazio("Nenhum artigo encontrado.", "Confira o nome digitado.");
      return;
    }
    const totalPaginas = Math.ceil(filtradas.length / ITENS_POR_PAGINA_FAIXAS);
    ctx.pagina = Math.min(Math.max(1, ctx.pagina), totalPaginas);
    const inicio = (ctx.pagina - 1) * ITENS_POR_PAGINA_FAIXAS;
    const linhas = filtradas
      .slice(inicio, inicio + ITENS_POR_PAGINA_FAIXAS)
      .map(
        (f) => `<tr>
          <td>${escapeHtml(f.artigo)}</td>
          <td class="tp-num">${fmtPreco(f.min)}</td>
          <td class="tp-num">${f.max === null ? "em diante" : fmtPreco(f.max)}</td>
          <td class="tp-num"><strong>${fmtPercentual(f.percentual)}</strong></td>
        </tr>`
      )
      .join("");
    alvo.innerHTML = `<div class="table-scroll tp-detalhe-scroll"><table class="tp-table tp-table-compacta">
        <thead><tr><th scope="col">Artigo</th><th scope="col" class="tp-num">Mínimo</th><th scope="col" class="tp-num">Máximo</th><th scope="col" class="tp-num">Percentual</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
      ${htmlPaginacao(filtradas.length, ctx.pagina, ITENS_POR_PAGINA_FAIXAS, "data-pagina-faixas")}`;
  }

  /* ───────────────────────── Importar planilha ───────────────────────── */

  function abrirImportacao() {
    const ctx = {
      etapa: "formulario", // formulario | previa | confirmar
      regiao: local.regiao,
      vigencia: "",
      arquivo: null,
      erroCampos: "",
      enviando: false,
      publicando: false,
      erro: null,
      previa: null,
      aba: "erros",
      pagina: 1
    };
    const overlay = abrirModal({
      titulo: "Importar planilha de tabela de preço",
      tamanho: "lg",
      // Fechar com uma prévia aberta descarta a prévia no backend.
      aoFechar: () => {
        if (ctx.previa) void descartarPrevia(ctx.previa.idPrevia);
      }
    });

    const render = (foco) => {
      if (!modalAberto(overlay)) return;
      if (ctx.etapa === "formulario") renderFormulario(ctx);
      else renderPrevia(ctx);
      focarModal(foco);
    };

    const enviar = async () => {
      if (!ctx.vigencia || !ctx.arquivo) {
        ctx.erroCampos = "Preencha a data de início de vigência e escolha o arquivo .xlsx.";
        render(!ctx.vigencia ? "#tp-imp-vigencia" : "#tp-imp-arquivo");
        return;
      }
      ctx.enviando = true;
      ctx.erro = null;
      ctx.erroCampos = "";
      modal.ocupado = true;
      render();
      try {
        ctx.previa = await api().enviarPlanilha(ctx.regiao, ctx.vigencia, ctx.arquivo);
        if (!modalAberto(overlay)) return;
        ctx.etapa = "previa";
        ctx.aba = ctx.previa.erros.length ? "erros" : ctx.previa.avisos.length ? "avisos" : "semCasamento";
        ctx.pagina = 1;
      } catch (error) {
        if (isSessionInvalidError(error)) return;
        ctx.erro = lerErro(error);
      } finally {
        if (modal) modal.ocupado = false;
        ctx.enviando = false;
      }
      render();
    };

    const publicar = async () => {
      ctx.publicando = true;
      ctx.erro = null;
      modal.ocupado = true;
      render();
      try {
        const nova = await api().publicarImportacao(ctx.previa.idPrevia);
        ctx.previa = null; // publicada: não descartar ao fechar
        modal.ocupado = false;
        fecharModal();
        local.regiao = nova.regiao || local.regiao;
        draw();
        mostrarAviso(`Versão v${nova.versao} de ${local.regiao} publicada, com vigência a partir de ${fmtData(nova.vigenciaInicio)}.`);
        void carregarImportacoes();
        return;
      } catch (error) {
        if (modal) modal.ocupado = false;
        if (isSessionInvalidError(error)) return;
        ctx.erro = lerErro(error);
        ctx.publicando = false;
        ctx.etapa = "previa";
      }
      render('[data-imp="publicar"]');
    };

    overlay.addEventListener("click", (e) => {
      const alvo = e.target.closest("[data-imp]");
      if (!alvo) return;
      const acao = alvo.dataset.imp;
      if (acao === "enviar") void enviar();
      else if (acao === "aba") {
        ctx.aba = alvo.dataset.valor;
        ctx.pagina = 1;
        atualizarProblemas(ctx);
      } else if (acao === "publicar") {
        ctx.etapa = "confirmar";
        ctx.erro = null;
        render('[data-imp="voltar"]');
      } else if (acao === "voltar") {
        ctx.etapa = "previa";
        render('[data-imp="publicar"]');
      } else if (acao === "confirmar") void publicar();
    });

    overlay.addEventListener("click", (e) => {
      const pag = e.target.closest("[data-pagina-problemas]");
      if (!pag) return;
      ctx.pagina += Number(pag.dataset.paginaProblemas);
      atualizarProblemas(ctx);
    });

    overlay.addEventListener("change", (e) => {
      if (e.target.id === "tp-imp-regiao") ctx.regiao = e.target.value;
      else if (e.target.id === "tp-imp-vigencia") ctx.vigencia = e.target.value;
      else if (e.target.id === "tp-imp-arquivo") {
        const arquivo = e.target.files[0] || null;
        // Só a extensão: o conteúdo da planilha é validado no backend.
        if (arquivo && !/\.xlsx$/i.test(arquivo.name)) {
          ctx.arquivo = null;
          ctx.erroCampos = `"${arquivo.name}" não é um arquivo .xlsx.`;
        } else {
          ctx.arquivo = arquivo;
          ctx.erroCampos = "";
        }
        render("#tp-imp-arquivo");
      }
    });
    overlay.addEventListener("input", (e) => {
      if (e.target.id === "tp-imp-vigencia") ctx.vigencia = e.target.value;
    });

    render("#tp-imp-regiao");
  }

  async function descartarPrevia(idPrevia) {
    try {
      await api().cancelarPrevia(idPrevia);
    } catch (error) {
      if (isSessionInvalidError(error)) return;
      // A prévia não publicada não vira importação; avisar sem bloquear o usuário.
      mostrarAviso(`A prévia foi fechada, mas o servidor não confirmou o descarte: ${mensagemErro(error)}`, "warn");
    }
  }

  function renderFormulario(ctx) {
    const opcoes = REGIOES.map((r) => `<option value="${r}"${r === ctx.regiao ? " selected" : ""}>${r}</option>`).join("");
    const desab = ctx.enviando ? " disabled" : "";
    definirModal({
      subtitulo: "Envie a planilha; o servidor valida e devolve uma prévia antes de publicar.",
      corpo: `<div class="tp-form-grid">
          <label class="tp-campo">Região
            <select id="tp-imp-regiao"${desab}>${opcoes}</select>
          </label>
          <label class="tp-campo">Data de início de vigência
            <input type="date" id="tp-imp-vigencia" value="${escapeHtml(ctx.vigencia)}" required${desab} />
          </label>
        </div>
        <label class="tp-dropzone${ctx.arquivo ? " com-arquivo" : ""}" for="tp-imp-arquivo">
          <input type="file" id="tp-imp-arquivo" class="tp-sr-only"
                 accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${desab} />
          <strong>${ctx.arquivo ? escapeHtml(ctx.arquivo.name) : "Clique para escolher a planilha (.xlsx)"}</strong>
          <span>${ctx.arquivo ? `${fmtTamanho(ctx.arquivo.size)} · clique para trocar` : "Somente arquivos .xlsx"}</span>
        </label>
        ${ctx.erroCampos ? `<p class="tp-alerta bad" role="alert">${escapeHtml(ctx.erroCampos)}</p>` : ""}
        ${htmlAlertaErro(ctx.erro)}`,
      rodape: `<button type="button" class="ghost-btn" data-modal="fechar"${desab}>Cancelar</button>
        <button type="button" class="primary-btn" data-imp="enviar"${desab}>${ctx.enviando ? "Enviando e validando..." : "Enviar planilha"}</button>`
    });
  }

  function renderPrevia(ctx) {
    const p = ctx.previa;
    const card = (rotulo, valor, tom) =>
      `<div class="tp-resumo-card${tom ? ` ${tom}` : ""}"><span>${rotulo}</span><strong>${fmtInteiro(valor)}</strong></div>`;
    const qtdErros = p.erros.length;
    const aba = (valor, rotulo, qtd) =>
      `<button type="button" data-imp="aba" data-valor="${valor}" aria-pressed="${ctx.aba === valor}">${rotulo} (${fmtInteiro(qtd)})</button>`;
    const confirmando = ctx.etapa === "confirmar";
    const rodape = confirmando
      ? `<p class="tp-confirmar-texto">Publicar a tabela de <strong>${escapeHtml(p.regiao)}</strong> com vigência a partir de
           <strong>${fmtData(p.vigenciaInicio)}</strong>? Ela passa a valer para o cálculo da comissão.</p>
         <button type="button" class="ghost-btn" data-imp="voltar"${ctx.publicando ? " disabled" : ""}>Voltar</button>
         <button type="button" class="primary-btn" data-imp="confirmar"${ctx.publicando ? " disabled" : ""}>${ctx.publicando ? "Publicando..." : "Confirmar publicação"}</button>`
      : `<button type="button" class="ghost-btn" data-modal="fechar">Cancelar</button>
         <button type="button" class="primary-btn" data-imp="publicar"${p.podePublicar ? "" : ' disabled aria-describedby="tp-publicar-ajuda"'}>Publicar</button>
         ${p.podePublicar ? "" : '<span id="tp-publicar-ajuda" class="tp-sr-only">Desabilitado: a prévia tem erros.</span>'}`;
    definirModal({
      subtitulo: `Prévia de ${p.nomeArquivo} · ${p.regiao} · vigência a partir de ${fmtData(p.vigenciaInicio)}`,
      corpo: `<div class="tp-resumo tp-resumo-5">
          ${card("Artigos", p.resumo.qtdArtigos)}
          ${card("Faixas", p.resumo.qtdFaixas)}
          ${card("Erros", qtdErros, qtdErros ? "bad" : "")}
          ${card("Avisos", p.avisos.length, p.avisos.length ? "warn" : "")}
          ${card("Sem casamento", p.semCasamento.length, p.semCasamento.length ? "warn" : "")}
        </div>
        ${
          qtdErros
            ? `<p class="tp-alerta bad" role="alert">A planilha tem ${fmtInteiro(qtdErros)} erro(s). Corrija o arquivo e envie de novo — não é possível publicar com erros.</p>`
            : p.podePublicar
              ? `<p class="tp-alerta ok">Nenhum erro encontrado.${p.avisos.length || p.semCasamento.length ? " Confira os avisos e os artigos sem casamento antes de publicar." : ""}</p>`
              : `<p class="tp-alerta bad" role="alert">O servidor não liberou a publicação desta prévia.</p>`
        }
        ${htmlAlertaErro(ctx.erro)}
        <section class="tp-problemas" aria-label="Erros, avisos e artigos sem casamento">
          <div class="tp-segmentado" role="group" aria-label="Mostrar">
            ${aba("erros", "Erros", qtdErros)}${aba("avisos", "Avisos", p.avisos.length)}${aba("semCasamento", "Sem casamento", p.semCasamento.length)}
          </div>
          <div id="tp-problemas"></div>
        </section>`,
      rodape
    });
    atualizarProblemas(ctx);
  }

  function atualizarProblemas(ctx) {
    const p = ctx.previa;
    const alvo = byId("tp-problemas");
    if (!alvo) return;
    document.querySelectorAll('[data-imp="aba"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.valor === ctx.aba)));
    const ehCasamento = ctx.aba === "semCasamento";
    const itens = ehCasamento ? p.semCasamento : p[ctx.aba];
    if (!itens.length) {
      const vazio = { erros: "Nenhum erro.", avisos: "Nenhum aviso.", semCasamento: "Todos os artigos casaram com o cadastro." };
      alvo.innerHTML = `<p class="tp-nota tp-problemas-vazio">${vazio[ctx.aba]}</p>`;
      return;
    }
    const totalPaginas = Math.ceil(itens.length / ITENS_POR_PAGINA_PROBLEMAS);
    ctx.pagina = Math.min(Math.max(1, ctx.pagina), totalPaginas);
    const inicio = (ctx.pagina - 1) * ITENS_POR_PAGINA_PROBLEMAS;
    const pagina = itens.slice(inicio, inicio + ITENS_POR_PAGINA_PROBLEMAS);
    const linhas = ehCasamento
      ? pagina.map((a) => `<tr><td class="tp-num">${a.linha ?? "—"}</td><td>${escapeHtml(a.artigo)}</td></tr>`).join("")
      : pagina
          .map((x) => `<tr><td class="tp-num">${x.linha ?? "—"}</td><td>${escapeHtml(x.coluna || "—")}</td><td>${escapeHtml(x.mensagem)}</td></tr>`)
          .join("");
    const cabecalho = ehCasamento
      ? `<th scope="col" class="tp-num">Linha</th><th scope="col">Artigo da planilha</th>`
      : `<th scope="col" class="tp-num">Linha</th><th scope="col">Coluna</th><th scope="col">Mensagem</th>`;
    const tom = ctx.aba === "erros" ? "bad" : "warn";
    alvo.innerHTML = `<div class="table-scroll tp-problemas-scroll ${tom}"><table class="tp-table tp-table-compacta">
        <thead><tr>${cabecalho}</tr></thead><tbody>${linhas}</tbody>
      </table></div>
      ${htmlPaginacao(itens.length, ctx.pagina, ITENS_POR_PAGINA_PROBLEMAS, "data-pagina-problemas")}`;
  }

  /* ───────────────────────── Excluir ───────────────────────── */

  function abrirExclusao(id) {
    const imp = local.importacoes.find((i) => i.id === id);
    if (!imp) return;
    const overlay = abrirModal({ titulo: `Excluir versão v${imp.versao} · ${imp.regiao}`, subtitulo: `Vigência a partir de ${fmtData(imp.vigenciaInicio)}`, tamanho: "sm" });
    const ctx = { excluindo: false, erro: null };

    const render = (foco) => {
      if (!modalAberto(overlay)) return;
      definirModal({
        corpo: `<p class="tp-texto">A importação <strong>v${escapeHtml(imp.versao)}</strong> de ${escapeHtml(imp.regiao)}
            (${fmtInteiro(imp.qtdArtigos)} artigos, vigência a partir de ${fmtData(imp.vigenciaInicio)}) será excluída.
            <strong>Esta ação não pode ser desfeita.</strong></p>
          ${htmlAlertaErro(ctx.erro)}`,
        rodape: `<button type="button" class="ghost-btn" data-modal="fechar"${ctx.excluindo ? " disabled" : ""}>Cancelar</button>
          <button type="button" class="tp-btn-danger" data-excluir="confirmar"${ctx.excluindo ? " disabled" : ""}>${ctx.excluindo ? "Excluindo..." : "Excluir importação"}</button>`
      });
      focarModal(foco);
    };

    overlay.addEventListener("click", async (e) => {
      if (!e.target.closest('[data-excluir="confirmar"]') || ctx.excluindo) return;
      ctx.excluindo = true;
      ctx.erro = null;
      modal.ocupado = true;
      render();
      try {
        await api().excluirImportacao(id);
        modal.ocupado = false;
        fecharModal();
        mostrarAviso(`Versão v${imp.versao} de ${imp.regiao} excluída.`);
        void carregarImportacoes();
        return;
      } catch (error) {
        if (modal) modal.ocupado = false;
        if (isSessionInvalidError(error)) return;
        ctx.erro = lerErro(error);
      }
      ctx.excluindo = false;
      render('.tp-modal-footer [data-modal="fechar"]');
    });

    // Foco inicial em "Cancelar": a ação destrutiva nunca é o padrão.
    render('.tp-modal-footer [data-modal="fechar"]');
  }

  /* ───────────────────────── Registro da tela ───────────────────────── */

  window.ComissaoScreens[SCREEN_ID] = {
    render() {
      const el = byId(`${SCREEN_ID}-screen`);
      if (!el) return;
      ligarTela(el);
      draw();
      void carregarImportacoes();
    }
  };
})();
