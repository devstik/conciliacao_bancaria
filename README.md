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

## Configuração TopManager
Antes de rodar, configure as variáveis de ambiente para autenticação:

```bash
export TOPMANAGER_APP_IDENTIFIER=ForcaDeVendas
export TOPMANAGER_EXTERNAL_APP_KEY='SUA_CHAVE_EXTERNA'
export TOPMANAGER_RETURN_URL='http://qualquer'
export TOPMANAGER_AUTH_URL='https://visions.topmanager.com.br/auth/api/usuarios/entrar'
export TOPMANAGER_API_BASE='https://visions.topmanager.com.br/Servidor_2.8.0_api'
```

A tela de login da plataforma é mockada (não usa TopManager diretamente).
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
- Usuário: `jpsilva`
- Senha: `871125`

Observação:
- O login da plataforma é local/mockado e não valida a API TopManager.
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

## OFX de teste
Use o arquivo `sample.ofx` para testar o upload.
