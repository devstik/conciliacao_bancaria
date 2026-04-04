# Plataforma Financeira (JavaScript)

Plataforma web com:
- Login
- Home em layout inspirado no modelo enviado
- Consulta de Contas a Receber
- Consulta de Contas a Pagar
- Tela de Conciliação Bancária com upload OFX
- Processamento dos dados e inserção via POST

## Tecnologias
- Node.js
- Express
- JavaScript puro no frontend (HTML/CSS/JS)

## Configuração inicial
Copie `.env.example` para `.env` e preencha as credenciais obrigatórias antes de subir a aplicação.

## Configuração TopManager
Antes de rodar, configure as variáveis de ambiente para autenticação:

```bash
export TOPMANAGER_APP_IDENTIFIER=ForcaDeVendas
export TOPMANAGER_EXTERNAL_APP_KEY='SUA_CHAVE_EXTERNA'
export TOPMANAGER_RETURN_URL='http://qualquer'
export TOPMANAGER_AUTH_URL='https://visions.topmanager.com.br/auth/api/usuarios/entrar'
export TOPMANAGER_API_BASE='https://visions.topmanager.com.br/Servidor_2.8.0_api'
```

A tela de login da plataforma é local e independente do TopManager.
Para consultar contas a receber/pagar, o backend usa credenciais técnicas do TopManager via variáveis de ambiente:

```bash
export TOPMANAGER_EMAIL='SEU_EMAIL_TECNICO'
export TOPMANAGER_SENHA='SUA_SENHA_TECNICA'
export TOPMANAGER_USUARIO_ID='SEU_USUARIO_ID_TECNICO'
```

## Como executar

1. Instale as dependências:
```bash
npm install
```

2. Rode o projeto:
```bash
npm run dev
```

3. Acesse:
- `http://localhost:3000`
- Se a `3000` estiver ocupada, o servidor tenta automaticamente `3001`, `3002`...
- Para fixar porta manualmente:
```bash
PORT=3005 npm run dev
```

## Login
- Defina `APP_USERNAME` e `APP_PASSWORD` no ambiente.

Observação:
- O login da plataforma é local e protege as rotas internas da API.
- A consulta TopManager acontece ao abrir as telas `Contas a Receber` e `Contas a Pagar`.

## Endpoints usados
- Login/token: `POST https://visions.topmanager.com.br/auth/api/usuarios/entrar`
- Contas a receber: `/Servidor_2.8.0_api/financeiro/movimentosdedepositario/contasareceber`
- Contas a pagar: `/Servidor_2.8.0_api/financeiro/movimentosdedepositario/contasapagar`

## Integração com banco via POST
A rota `POST /api/reconciliation/insert` envia os dados conciliados para:
- `DB_POST_URL` (se configurada)
- fallback local em `data/store.json` (quando `DB_POST_URL` não existe)

Exemplo de configuração:
```bash
DB_POST_URL=https://seu-endpoint.com/api/transacoes npm run dev
```

## Integração com NodeAPI
Para a tela `Ficha de Cliente`, configure a conexão com sua API Node:

```bash
export NODE_API_BASE_URL='https://mediumpurple-loris-159660.hostingersite.com'
export NODE_API_USERNAME='joao'
export NODE_API_PASSWORD='SUA_SENHA_NODE_API'
export NODE_API_APP_ID='StikVendas'
```

Observações:
- Esses são os mesmos padrões usados no projeto `ForcaDeVendas`.
- Se sua NodeAPI aceitar token fixo, você pode usar `NODE_API_TOKEN` no lugar de usuário/senha.
- A tela consome internamente `GET /api/ficha-cliente`, que por sua vez consulta `GET /api/fichas-cadastro-clientes` na NodeAPI.

## OFX de teste
Use o arquivo `sample.ofx` para testar o upload.
