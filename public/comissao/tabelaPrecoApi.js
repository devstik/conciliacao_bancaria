/*
 * Ponto ÚNICO de integração da tela "Tabelas de Preço" com o backend.
 * Só este arquivo conhece URLs e formato da API. Quando o formato real chegar,
 * mude ROTAS e as funções mapear*; a tela não muda.
 *
 * O front NÃO calcula comissão, faixa, vigência nem lê/valida a planilha:
 * só envia o arquivo e exibe o que o backend devolver.
 *
 * Modelo que a tela consome (saída das funções mapear*):
 *   Importacao  { id, versao, regiao, vigenciaInicio "AAAA-MM-DD", situacao "vigente"|"futura"|"substituida",
 *                 importadoEm (ISO), importadoPor, qtdArtigos, podeExcluir (bool, decidido pelo backend) }
 *   Detalhe     { importacao: Importacao, faixas: [{ cdObjMae, artigo, min, max|null, percentual }] }
 *   Previa      { idPrevia, regiao, vigenciaInicio, nomeArquivo, resumo: { qtdArtigos, qtdFaixas },
 *                 erros: [Problema], avisos: [Problema], semCasamento: [{ linha, artigo }], podePublicar }
 *   Problema    { linha|null, coluna|null, mensagem }
 * Preço e percentual chegam e seguem como TEXTO decimal ("0.3805"; percentual em fração "0.0150").
 */
(function () {
  // true = dados fictícios. O mock só roda em localhost; em outro host vale como false,
  // para nunca exibir dado inventado em produção.
  const USAR_MOCK = true;

  // {regiao}, {id} e {idPrevia} são substituídos (com encodeURIComponent).
  const ROTAS = {
    listarImportacoes: "", // A DEFINIR PELO GESTOR — ex.: GET    /api/comissao/tabelas-preco/{regiao}/importacoes
    detalharImportacao: "", // A DEFINIR PELO GESTOR — ex.: GET    /api/comissao/tabelas-preco/importacoes/{id}
    enviarPlanilha: "", // A DEFINIR PELO GESTOR — ex.: POST   /api/comissao/tabelas-preco/{regiao}/previas (multipart)
    publicarImportacao: "", // A DEFINIR PELO GESTOR — ex.: POST   /api/comissao/tabelas-preco/previas/{idPrevia}/publicar
    cancelarPrevia: "", // A DEFINIR PELO GESTOR — ex.: DELETE /api/comissao/tabelas-preco/previas/{idPrevia}
    excluirImportacao: "" // A DEFINIR PELO GESTOR — ex.: DELETE /api/comissao/tabelas-preco/importacoes/{id}
  };

  const MOCK_ATIVO = USAR_MOCK && ["localhost", "127.0.0.1", ""].includes(window.location.hostname);

  /* ───────────── Erro identificável: rota ainda não existe ───────────── */

  const NOME_ERRO_PENDENTE = "IntegracaoPendente";

  function erroIntegracaoPendente(rota) {
    const erro = new Error(`A rota "${rota}" ainda não foi disponibilizada pelo backend.`);
    erro.name = NOME_ERRO_PENDENTE;
    erro.rota = rota;
    return erro;
  }

  function ehIntegracaoPendente(erro) {
    return erro?.name === NOME_ERRO_PENDENTE;
  }

  /* ───────────── Mapeamento (único lugar que conhece o formato da API) ───────────── */

  function texto(valor) {
    return valor === null || valor === undefined || valor === "" ? null : String(valor);
  }

  function mapearImportacao(r) {
    return {
      id: String(r.id),
      versao: r.versao,
      regiao: r.regiao,
      vigenciaInicio: texto(r.vigenciaInicio),
      situacao: r.situacao,
      importadoEm: texto(r.importadoEm),
      importadoPor: texto(r.importadoPor),
      qtdArtigos: Number(r.qtdArtigos) || 0,
      podeExcluir: r.podeExcluir === true
    };
  }

  function mapearFaixa(r) {
    return {
      cdObjMae: texto(r.cdObjMae),
      artigo: texto(r.artigo) || "",
      min: texto(r.min),
      max: texto(r.max),
      percentual: texto(r.percentual)
    };
  }

  function mapearDetalhe(r) {
    return {
      importacao: mapearImportacao(r.importacao),
      faixas: (r.faixas || []).map(mapearFaixa)
    };
  }

  function mapearProblema(r) {
    return { linha: r.linha ?? null, coluna: texto(r.coluna), mensagem: texto(r.mensagem) || "" };
  }

  function mapearPrevia(r) {
    const erros = (r.erros || []).map(mapearProblema);
    return {
      idPrevia: String(r.idPrevia),
      regiao: r.regiao,
      vigenciaInicio: texto(r.vigenciaInicio),
      nomeArquivo: texto(r.nomeArquivo) || "",
      resumo: { qtdArtigos: Number(r.resumo?.qtdArtigos) || 0, qtdFaixas: Number(r.resumo?.qtdFaixas) || 0 },
      erros,
      avisos: (r.avisos || []).map(mapearProblema),
      semCasamento: (r.semCasamento || []).map((a) => ({ linha: a.linha ?? null, artigo: texto(a.artigo) || "" })),
      // Se o backend não informar, publicar só sem erros.
      podePublicar: typeof r.podePublicar === "boolean" ? r.podePublicar : erros.length === 0
    };
  }

  /* ───────────── HTTP real (mesma sessão das outras telas: cookie HttpOnly) ───────────── */

  function montarUrl(rota, params) {
    const modelo = ROTAS[rota];
    if (!modelo) throw erroIntegracaoPendente(rota);
    return modelo.replace(/\{(\w+)\}/g, (_, chave) => encodeURIComponent(params?.[chave] ?? ""));
  }

  async function requisitar(rota, params, opcoes = {}) {
    const url = montarUrl(rota, params);
    await ensureSessionFresh();
    const init = { method: opcoes.method || "GET", credentials: "same-origin" };
    if (opcoes.formulario) init.body = opcoes.formulario;
    else if (opcoes.json !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(opcoes.json);
    }
    const resposta = await fetch(url, init);
    if (resposta.status === 204) return null;

    const ehJson = (resposta.headers.get("content-type") || "").includes("application/json");
    if (!ehJson) {
      // Rota inexistente: o servidor devolve index.html com 200 (GET) ou 404 em HTML.
      if (resposta.status === 404 || resposta.ok) throw erroIntegracaoPendente(rota);
      throw new Error(`Erro ${resposta.status} ao falar com o servidor.`);
    }
    const dados = await resposta.json();
    if (resposta.status === 401) {
      const mensagem = dados.message || "Sua sessão expirou. Faça login novamente.";
      returnToLogin(mensagem);
      throw createSessionInvalidError(mensagem);
    }
    if (!resposta.ok) throw new Error(dados.message || dados.error || `Erro ${resposta.status} ao falar com o servidor.`);
    return dados;
  }

  const apiReal = {
    async listarImportacoes(regiao) {
      const dados = await requisitar("listarImportacoes", { regiao });
      return (dados.importacoes || []).map(mapearImportacao);
    },
    async detalharImportacao(id) {
      return mapearDetalhe(await requisitar("detalharImportacao", { id }));
    },
    async enviarPlanilha(regiao, vigenciaInicio, arquivo) {
      const formulario = new FormData();
      formulario.append("regiao", regiao);
      formulario.append("vigenciaInicio", vigenciaInicio);
      formulario.append("arquivo", arquivo);
      return mapearPrevia(await requisitar("enviarPlanilha", { regiao }, { method: "POST", formulario }));
    },
    async publicarImportacao(idPrevia) {
      const dados = await requisitar("publicarImportacao", { idPrevia }, { method: "POST", json: {} });
      return mapearImportacao(dados.importacao);
    },
    async cancelarPrevia(idPrevia) {
      await requisitar("cancelarPrevia", { idPrevia }, { method: "DELETE" });
    },
    async excluirImportacao(id) {
      await requisitar("excluirImportacao", { id }, { method: "DELETE" });
    }
  };

  /* ───────────── Mock (dados INVENTADOS; nunca usar dados das planilhas reais) ─────────────
   * Cenários:
   *   Região CE -> lista com importações;  NE -> lista vazia;  V3 -> falha do servidor.
   *   Arquivo com "erro" no nome  -> prévia com erros;
   *   Arquivo com "aviso" no nome -> prévia só com avisos;  outro nome -> prévia limpa.
   * As situações e o "podeExcluir" abaixo são fixos/fingidos: a regra real é do backend.
   */

  function criarMock() {
    const ATRASO_MS = 500;
    const ARTIGOS = [
      ["9001", "Fita Alfa 06"], ["9002", "Fita Alfa 08"], ["9003", "Fita Beta 10"], ["9004", "Fita Beta 12 UP"],
      ["9005", "Elástico Gama 15"], ["9006", "Elástico Gama 20"], ["9007", "Viés Delta 05"], ["9008", "Viés Delta 07"],
      ["9009", "Alça Ômega 10"], ["9010", "Alça Ômega 12"], ["9011", "Renda Sigma 30"], ["9012", "Renda Sigma 45"]
    ];
    const importacoes = {
      CE: [
        { id: "CE-3", versao: 3, regiao: "CE", vigenciaInicio: "2099-01-01", situacao: "futura", importadoEm: "2026-10-05T14:32:00", importadoPor: "comercial.teste", qtdArtigos: 12, podeExcluir: true },
        { id: "CE-2", versao: 2, regiao: "CE", vigenciaInicio: "2026-09-01", situacao: "vigente", importadoEm: "2026-08-28T09:10:00", importadoPor: "comercial.teste", qtdArtigos: 12, podeExcluir: false },
        { id: "CE-1", versao: 1, regiao: "CE", vigenciaInicio: "2026-04-01", situacao: "substituida", importadoEm: "2026-03-30T16:45:00", importadoPor: "admin.teste", qtdArtigos: 10, podeExcluir: false }
      ],
      NE: [],
      V3: null
    };
    const previas = new Map();
    let proximaPrevia = 1;

    const esperar = (valor) => new Promise((ok) => setTimeout(() => ok(JSON.parse(JSON.stringify(valor))), ATRASO_MS));
    const falhar = (mensagem) => new Promise((_, nao) => setTimeout(() => nao(new Error(mensagem)), ATRASO_MS));

    // Faixas fictícias com valores fixos (nenhuma conta).
    const FAIXAS_MODELO = [
      ["0.2100", "0.2399", "0.0100"],
      ["0.2400", "0.2699", "0.0150"],
      ["0.2700", "0.2999", "0.0200"],
      ["0.3000", "0.3299", "0.0300"],
      ["0.3300", null, "0.0400"]
    ];

    function faixasFicticias(qtdArtigos) {
      return ARTIGOS.slice(0, qtdArtigos).flatMap(([cdObjMae, artigo]) =>
        FAIXAS_MODELO.map(([min, max, percentual]) => ({ cdObjMae, artigo, min, max, percentual }))
      );
    }

    function previaFicticia(regiao, vigenciaInicio, arquivo) {
      const nome = arquivo.name.toLowerCase();
      const comErros = nome.includes("erro");
      const soAvisos = !comErros && nome.includes("aviso");
      const erros = comErros
        ? [
            { linha: 7, coluna: "H", mensagem: 'Valor "abc" não é um número.' },
            { linha: 12, coluna: "E", mensagem: "Fita Beta 10: MIN 0,2400 repetido em duas faixas." },
            { linha: 18, coluna: "K", mensagem: "MIN (0,3300) maior que MAX (0,3100) em \"Tabela 3\"." }
          ]
        : [];
      const avisos =
        comErros || soAvisos
          ? [
              { linha: 9, coluna: "B", mensagem: 'Valor "R$1100" sem casas decimais. Confira se não falta a vírgula.' },
              { linha: 15, coluna: null, mensagem: "Viés Delta 07: lacuna entre 0,2699 e 0,2710." },
              { linha: null, coluna: null, mensagem: "37 valores com mais de 4 casas foram arredondados." }
            ]
          : [];
      const semCasamento = comErros || soAvisos ? [{ linha: 21, artigo: "Fita Zeta 99" }, { linha: 22, artigo: "Elástico Kapa 03" }] : [];
      const idPrevia = `mock-${proximaPrevia++}`;
      const previa = {
        idPrevia,
        regiao,
        vigenciaInicio,
        nomeArquivo: arquivo.name,
        resumo: { qtdArtigos: 12, qtdFaixas: 60 },
        erros,
        avisos,
        semCasamento,
        podePublicar: erros.length === 0
      };
      previas.set(idPrevia, previa);
      return previa;
    }

    return {
      listarImportacoes(regiao) {
        const lista = importacoes[regiao];
        if (lista === null) return falhar(`Falha ao consultar as importações de ${regiao} (erro simulado do servidor).`);
        if (!lista) return falhar(`Região ${regiao} desconhecida.`);
        return esperar({ importacoes: lista }).then((d) => d.importacoes.map(mapearImportacao));
      },
      detalharImportacao(id) {
        const imp = Object.values(importacoes).flat().filter(Boolean).find((i) => i.id === String(id));
        if (!imp) return falhar("Importação não encontrada.");
        return esperar({ importacao: imp, faixas: faixasFicticias(imp.qtdArtigos) }).then(mapearDetalhe);
      },
      enviarPlanilha(regiao, vigenciaInicio, arquivo) {
        return esperar(previaFicticia(regiao, vigenciaInicio, arquivo)).then(mapearPrevia);
      },
      publicarImportacao(idPrevia) {
        const previa = previas.get(idPrevia);
        if (!previa) return falhar("Prévia não encontrada ou expirada. Envie a planilha de novo.");
        if (!previa.podePublicar) return falhar("A prévia tem erros e não pode ser publicada.");
        previas.delete(idPrevia);
        const lista = importacoes[previa.regiao] || (importacoes[previa.regiao] = []);
        const versao = lista.reduce((max, i) => Math.max(max, i.versao), 0) + 1;
        const nova = {
          id: `${previa.regiao}-${versao}`,
          versao,
          regiao: previa.regiao,
          vigenciaInicio: previa.vigenciaInicio,
          situacao: "futura", // fingido: no backend real a situação é calculada lá
          importadoEm: new Date().toISOString(),
          importadoPor: "usuario.mock",
          qtdArtigos: previa.resumo.qtdArtigos,
          podeExcluir: true
        };
        lista.unshift(nova);
        return esperar({ importacao: nova }).then((d) => mapearImportacao(d.importacao));
      },
      cancelarPrevia(idPrevia) {
        previas.delete(idPrevia);
        return esperar(null);
      },
      excluirImportacao(id) {
        for (const lista of Object.values(importacoes)) {
          const idx = (lista || []).findIndex((i) => i.id === String(id));
          if (idx >= 0) {
            if (!lista[idx].podeExcluir) return falhar("Esta importação não pode ser excluída.");
            lista.splice(idx, 1);
            return esperar(null);
          }
        }
        return falhar("Importação não encontrada.");
      }
    };
  }

  window.tabelaPrecoApi = {
    ...(MOCK_ATIVO ? criarMock() : apiReal),
    ehIntegracaoPendente,
    usandoMock: MOCK_ATIVO
  };
})();
