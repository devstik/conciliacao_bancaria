const DEFAULT_AUTH_URL = "https://visions.topmanager.com.br/auth/api/usuarios/entrar";
const DEFAULT_API_BASE = "https://visions.topmanager.com.br/Servidor_2.8.0_api";

class TopManagerService {
  constructor() {
    this.authUrl = process.env.TOPMANAGER_AUTH_URL || DEFAULT_AUTH_URL;
    this.appIdentifier = process.env.TOPMANAGER_APP_IDENTIFIER || "Financeiro";
    this.returnUrl = process.env.TOPMANAGER_RETURN_URL || "http://qualquer";
    this.externalAppKey = process.env.TOPMANAGER_EXTERNAL_APP_KEY || "";
    this.apiBase = process.env.TOPMANAGER_API_BASE || DEFAULT_API_BASE;

    this.token = "";
    this.authPromise = null;
    this.maxAuthRetries = Number(process.env.TOPMANAGER_AUTH_RETRIES || 3);
    this.authRetryBaseMs = Number(process.env.TOPMANAGER_AUTH_RETRY_BASE_MS || 400);
    this.currentCredentials = {
      email: process.env.TOPMANAGER_EMAIL || "",
      senha: process.env.TOPMANAGER_SENHA || "",
      usuarioID: Number(process.env.TOPMANAGER_USUARIO_ID || "0")
    };
  }

  setCredentials({ email, senha, usuarioID }) {
    this.currentCredentials = {
      email: email || this.currentCredentials.email,
      senha: senha || this.currentCredentials.senha,
      usuarioID: usuarioID || this.currentCredentials.usuarioID
    };
  }

  _assertCredentials() {
    const { email, senha, usuarioID } = this.currentCredentials;
    if (!email || !senha || !usuarioID) {
      throw new Error("Credenciais incompletas: informe email, senha e usuarioID do TopManager.");
    }
  }

  _extractToken(responseBody) {
    const redirectTokenMatch = responseBody.match(/=(.+)"/);
    if (redirectTokenMatch?.[1]) {
      return redirectTokenMatch[1];
    }

    throw new Error("Token não encontrado na resposta do TopManager.");
  }

  _buildAuthUrl() {
    const url = new URL(this.authUrl);
    url.searchParams.set("identificadorDaAplicacao", this.appIdentifier);
    url.searchParams.set("enderecoDeRetorno", this.returnUrl);
    if (this.externalAppKey) {
      url.searchParams.set("chaveDaAplicacaoExterna", this.externalAppKey);
    }
    return url;
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _isRetriableAuthFailure(status, body) {
    if (status >= 500) return true;
    const text = String(body || "").toLowerCase();
    return text.includes("isolamento de instantaneo") || text.includes("snapshot");
  }

  async _authenticateWithRetry() {
    this._assertCredentials();
    const authUrl = this._buildAuthUrl();
    console.log("[TopManager][AUTH] Iniciando autenticação no endpoint configurado.");

    let lastError = null;
    for (let attempt = 1; attempt <= this.maxAuthRetries; attempt += 1) {
      const response = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.currentCredentials)
      });

      const body = await response.text();
      console.log("[TopManager][AUTH] Status:", response.status);

      if (response.ok) {
        this.token = this._extractToken(body);
        return this.token;
      }

      lastError = new Error(`Falha no login TopManager (${response.status}): ${body}`);
      const retryable = this._isRetriableAuthFailure(response.status, body);
      const isLastAttempt = attempt >= this.maxAuthRetries;
      if (!retryable || isLastAttempt) {
        throw lastError;
      }

      const backoffMs = this.authRetryBaseMs * attempt;
      console.warn(`[TopManager][AUTH] tentativa ${attempt} falhou, retry em ${backoffMs}ms...`);
      await this._sleep(backoffMs);
    }

    throw lastError || new Error("Falha desconhecida ao autenticar no TopManager.");
  }

  async authenticate() {
    if (!this.authPromise) {
      this.authPromise = this._authenticateWithRetry().finally(() => {
        this.authPromise = null;
      });
    }
    return this.authPromise;
  }

  async getToken({ forceRefresh = false } = {}) {
    if (!(forceRefresh || !this.token)) {
      return this.token;
    }

    try {
      await this.authenticate();
    } catch (error) {
      if (this.token) {
        console.warn("[TopManager][AUTH] usando token em cache após falha de autenticação.");
        return this.token;
      }
      throw error;
    }

    return this.token;
  }

  _buildApiUrl(pathname, query) {
    const url = new URL(pathname, `${this.apiBase}/`);

    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    return url;
  }

  async get(pathname, query, { retryOnUnauthorized = true, forceRefresh = false } = {}) {
    const token = await this.getToken({ forceRefresh });
    const url = this._buildApiUrl(pathname, query);
    console.log("[TopManager][GET] Consultando recurso remoto.");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401 && retryOnUnauthorized) {
      await this.getToken({ forceRefresh: true });
      return this.get(pathname, query, { retryOnUnauthorized: false, forceRefresh: false });
    }

    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(`Erro TopManager (${response.status}) em ${pathname}: ${rawBody}`);
    }

    try {
      return {
        payload: JSON.parse(rawBody)
      };
    } catch (_error) {
      return {
        payload: rawBody
      };
    }
  }
}

module.exports = { TopManagerService };
