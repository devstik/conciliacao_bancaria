const DEFAULT_AUTH_URL =
  "https://visions.topmanager.com.br/auth/api/usuarios/entrar?identificadorDaAplicacao=Financeiro&chaveDaAplicacaoExterna=oZ3k39BXUsWVAPIzTPkjsbrnpzg34RKNnIvCr2DguTQCtI9tc6zQRYYDmruTg1oO8kpEr1qxJI2wCb3zf9czvA%3D%3D&enderecoDeRetorno=http%3A%2F%2Fqualquer";
const DEFAULT_API_BASE = "https://visions.topmanager.com.br/Servidor_2.8.0_api";

class TopManagerService {
  constructor() {
    this.authUrl = process.env.TOPMANAGER_AUTH_URL || DEFAULT_AUTH_URL;
    this.appIdentifier = process.env.TOPMANAGER_APP_IDENTIFIER || "Financeiro";
    this.returnUrl = process.env.TOPMANAGER_RETURN_URL || "http://qualquer";
    this.externalAppKey = process.env.TOPMANAGER_EXTERNAL_APP_KEY || "";
    this.apiBase = process.env.TOPMANAGER_API_BASE || DEFAULT_API_BASE;

    this.token = "";
    this.currentCredentials = {
      email: process.env.TOPMANAGER_EMAIL || "suporte.financeiro",
      senha: process.env.TOPMANAGER_SENHA || "123456",
      usuarioID: Number(process.env.TOPMANAGER_USUARIO_ID || "21960")
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

  async authenticate() {
    this._assertCredentials();
    const authUrl = this._buildAuthUrl();
    console.log("[TopManager][AUTH] Endpoint:", authUrl.toString());
    console.log("[TopManager][AUTH] Body:", JSON.stringify(this.currentCredentials));

    const response = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.currentCredentials)
    });

    const body = await response.text();
    console.log("[TopManager][AUTH] Status:", response.status);
    console.log("[TopManager][AUTH] Response:", body);

    if (!response.ok) {
      throw new Error(`Falha no login TopManager (${response.status}): ${body}`);
    }

    this.token = this._extractToken(body);
    console.log("[TopManager][AUTH] Token extraido:", this.token);
    return this.token;
  }

  async getToken({ forceRefresh = false } = {}) {
    if (forceRefresh || !this.token) {
      await this.authenticate();
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
    console.log("[TopManager][GET] Endpoint:", url.toString());
    console.log("[TopManager][GET] Token:", token);

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
        payload: JSON.parse(rawBody),
        debug: {
          authEndpoint: this.authUrl,
          endpoint: url.toString(),
          token
        }
      };
    } catch (_error) {
      return {
        payload: rawBody,
        debug: {
          authEndpoint: this.authUrl,
          endpoint: url.toString(),
          token
        }
      };
    }
  }
}

module.exports = { TopManagerService };
