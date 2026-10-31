# Fluxo — Hábitos e Produtividade

Um aplicativo web para acompanhar hábitos, organizar tarefas e proteger o seu foco. Funciona localmente com um duplo clique no `index.html` e, opcionalmente, sincroniza os dados entre dispositivos com uma conta na nuvem.

## Visão geral

O **Fluxo** reúne, em uma única interface:

- acompanhamento diário e semanal de hábitos;
- sequências (streaks) e calendário de contribuições;
- tarefas com prioridade, prazo e filtros;
- Foco do Dia com até três tarefas;
- timer Pomodoro com ciclos de foco e pausa;
- estatísticas e gráficos;
- tema claro, escuro ou automático;
- backup dos dados em JSON e no Neon Object Storage;
- conta opcional com sincronização entre dispositivos;
- atualizações em tempo real com Neon Realtime;
- diagnóstico dos serviços de nuvem e sugestões de hábitos com AI Gateway.

Sem conta, os dados ficam somente no **LocalStorage** do navegador. Com uma conta, o app usa a API própria para guardar uma cópia no **Neon Postgres**, com cadastro e login gerenciados pelo **Neon Auth**. Backups manuais usam o **Neon Object Storage**, o status da nuvem usa uma **Neon Function** e as alterações chegam ao vivo pelo **Neon Realtime**. O **Neon AI Gateway** está implementado, mas fica desabilitado no `neon.ts` enquanto a conta estiver no plano Free.

## Repositório

Código-fonte: [Pedro-Henrique-Pereira-Ribas/Sistema-de-H-bitos-Produtividade](https://github.com/Pedro-Henrique-Pereira-Ribas/Sistema-de-H-bitos-Produtividade).

## Funcionalidades

### Hábitos
- Criar, editar, arquivar, reativar e excluir hábitos.
- Escolher ícone, cor e dias da semana em que o hábito deve ser feito.
- Concluir o hábito de hoje ou registrar dias anteriores.
- Sequência atual e melhor sequência calculadas apenas nos dias agendados.
- Tolerância para o dia de hoje ainda pendente: a sequência de ontem não é perdida.
- Histórico preservado ao arquivar um hábito; arquivados ficam fora das estatísticas e do calendário.

### Visão geral
- Saudação e anel de progresso do dia.
- Resumo de sequência, tarefas pendentes, sessões de foco e aderência semanal.
- Lista de hábitos de hoje.
- Foco do Dia com a tarefa ativa.
- Calendário de contribuições dos últimos 12 meses, com registro retroativo ao clicar em um dia.
- Gráfico de ritmo dos últimos sete dias.

### Tarefas
- Inclusão rápida ou por formulário completo.
- Prioridades alta, média e baixa.
- Prazo opcional, com destaque para atrasadas e para o dia de hoje.
- Filtros: todas, pendentes e concluídas.
- Edição, exclusão e reabertura de tarefas.
- Foco do Dia limitado a três tarefas; ao concluir uma tarefa, ela sai do foco automaticamente.

### Pomodoro
- Modos de foco, pausa curta e pausa longa.
- Rodadas configuráveis (de 2 a 12).
- Início automático da pausa ao terminar o foco; o foco não reinicia sozinho.
- Tarefa ativa vinculada ao timer.
- Timer persistente: se a página for recarregada, o tempo restante é retomado.
- Sessões concluídas contabilizadas por dia.
- Aviso visual e um bipe curto gerado pelo Web Audio. **Não são usadas notificações do navegador.**

### Estatísticas
- Maior sequência, aderência em 30 dias, tarefas concluídas e sessões de foco.
- Gráfico dos últimos 7 dias.
- Evolução da aderência nos últimos 30 dias.
- Aderência por hábito, considerando somente os dias agendados.
- Chart.js incluído localmente em `vendor/`, sem CDN e sem necessidade de internet.

### Conta e sincronização (opcional)
- Cadastro e login com e-mail e senha pelo Neon Auth (Managed Better Auth).
- Sincronização automática das alterações com a API e o Neon Postgres.
- Escolha explícita em conflitos: usar os dados da nuvem ou manter os deste dispositivo.
- Sincronização manual pelo botão **Sincronizar agora**.
- Sessão validada ao abrir o app e a cada 60 segundos quando não há alterações pendentes.
- Logout mantém os dados locais; apagar tudo também remove a cópia da conta na nuvem.
- O app continua funcionando offline; as alterações são enviadas quando a conexão volta.
- **Tempo real:** o Neon Realtime assina uma query selada de `user_states`; se o WebSocket cair, a sincronização periódica de 60 segundos continua como fallback.
- **Backups na nuvem:** Ajustes → Nuvem Neon salva e lista backups privados no bucket `fluxo-backups`, com URL pré-assinada para download.
- **Diagnóstico:** o botão **Verificar serviços** chama a API, a Neon Function, o Object Storage, o Realtime e o AI Gateway.
- **IA:** o campo de sugestão usa o AI Gateway quando `NEON_AI_GATEWAY_*` estiver configurado; no plano Free ele responde com uma mensagem explicando o bloqueio.

### Preferências e dados
- Tema claro, escuro ou seguindo o sistema.
- Durações do Pomodoro e número de rodadas.
- Exportação de backup em JSON.
- Importação de backup com validação e normalização.
- Dados de exemplo para explorar o app.
- Opção de apagar todos os dados.
- Layout responsivo para desktop, tablet e celular, com navegação inferior no celular.

## Como abrir

1. Mantenha a pasta do projeto completa, incluindo `css/`, `js/` e `vendor/`.
2. Dê **duplo clique em `index.html`**.
3. O app abre direto no navegador, sem instalação.

Para usar apenas localmente, não é necessário instalar nada, rodar um servidor ou estar conectado à internet.

Para usar conta e sincronização, siga a seção [API e banco de dados](#api-e-banco-de-dados). Nesse caso, abra o app pela URL do servidor (Render) ou informe a URL da API em **Ajustes → Conta e sincronização → Servidor da API**.

### Navegadores suportados

Navegadores modernos com suporte a `<dialog>`, CSS moderno e LocalStorage:

- Chrome ou Edge recentes;
- Firefox recente;
- Safari recente.

## Como usar

- Na primeira abertura, crie um hábito em **Novo hábito**.
- Use o menu lateral (ou a barra inferior no celular) para navegar entre Visão geral, Hábitos, Tarefas, Foco e Estatísticas.
- Em **Tarefas**, clique na estrela para levar uma tarefa ao **Foco do Dia**.
- Em **Foco**, escolha a tarefa ativa e inicie o Pomodoro.
- Em **Ajustes** (ícone de controles no topo), altere o tema, os tempos do Pomodoro e gerencie seus dados.
- Em **Ajustes → Conta e sincronização**, crie uma conta ou entre para sincronizar. O primeiro acesso com dados nos dois lados pede que você escolha qual cópia deve prevalecer.
- Para conhecer o app com conteúdo, use **Dados de exemplo** em Ajustes. Se já houver dados, o app pedirá confirmação antes de substituí-los.

## Backup e restauração

- **Exportar JSON** baixa um arquivo `fluxo-backup-AAAA-MM-DD.json` com hábitos, tarefas, foco, sessões do Pomodoro e preferências.
- **Importar JSON** aceita um backup gerado pelo app. O conteúdo é validado e normalizado antes de substituir os dados atuais.
- A importação pede confirmação e valida a estrutura do arquivo antes de substituir os dados atuais; JSON inválido é rejeitado.
- **Apagar tudo** remove os dados deste navegador. Exporte um backup antes se quiser guardar o histórico.

## API e banco de dados

A sincronização é opcional. O app continua sendo um site estático quando usado sem conta; a API e o banco entram apenas para quem quiser acessar os dados em mais de um dispositivo.

### Arquitetura

- **Frontend:** HTML, CSS e JavaScript clássicos, sem framework. LocalStorage como fonte local e cache offline. O build gera `vendor/neon-auth.js` e `vendor/neon-realtime.js`, SDKs empacotados com esbuild para funcionar também via `file://`.
- **API:** Node.js + Express em `server/`, com Neon Auth (Managed Better Auth) no mesmo domínio, rate limit e CORS.
- **Banco:** Neon Postgres (Lakebase). O estado sincronizado fica em `user_states`; usuários e sessões ficam no schema `neon_auth`, gerenciado pelo Neon Auth.
- **Object Storage:** bucket privado `fluxo-backups`, acessado pela API com AWS SDK v3 no modo S3 compatível.
- **Functions:** `functions/fluxo-status.ts` roda ao lado do Postgres e exige o segredo compartilhado `x-fluxo-function-key`.
- **Realtime:** o servidor emite capabilities seladas para `user_states`; o navegador assina via WebSocket e renova a capability antes de expirar.
- **Hospedagem:** Render serve o app e a API na mesma origem, o que dispensa configurar CORS no uso normal.
- **Sincronização:** o estado completo é salvo como JSONB por usuário, com revisão incremental e concorrência otimista; o Realtime acelera a propagação e o polling permanece como fallback.

### 1. Provisionar Neon (cinco serviços no Free, seis após upgrade)

O projeto já está vinculado a uma organização e a um projeto Neon. Para reproduzir no plano Free:

```bash
npm i -g neon@latest
neon login
neon init -y --org-id <org-id> --project-id <project-id> \
  --branch production \
  --services postgres --services auth \
  --services object-storage --services functions --services realtime
neon deploy
```

> Use `--services` repetido para cada serviço. A forma com vírgula (`--services postgres,auth,...`) é rejeitada pela CLI 8.x com `Unknown service`. Para reproduzir a tentativa completa com AI Gateway, acrescente `--services ai-gateway`; no plano Free o `neon deploy` recusa o conjunto, como explicado abaixo.

O `neon deploy` provisiona o Postgres, o Neon Auth, o bucket privado `fluxo-backups`, a função `fluxostatus` e o Realtime no branch `production`, e grava as variáveis em `.env` (ou `.env.local`, se esse arquivo existir). Em seguida, aplique o schema com a conexão direta:

```bash
npm run db:init
```

#### AI Gateway no plano Free

A tentativa com os seis serviços e `aiGateway: true` no `neon.ts` respondeu:

```text
ERROR: This neon.ts enables the AI Gateway, which isn't available on the Free plan — the gateway won't serve model requests. Upgrade to a paid plan and re-run, or remove `aiGateway` from neon.ts.
```

Por isso o `neon.ts` versionado mantém `aiGateway` comentado e provisiona os outros cinco serviços. Depois de fazer upgrade para Launch/Scale e adicionar créditos, descomente a linha e rode:

```bash
neon deploy --env .env --update-existing
```

O código do AI Gateway (`server/ai.js`, `GET /api/cloud/ai/status` e `POST /api/cloud/ai/suggest`) já está pronto e passa a funcionar assim que `NEON_AI_GATEWAY_BASE_URL` e `NEON_AI_GATEWAY_TOKEN` existirem.

> Em Windows, esta versão da CLI não carregou o valor de `FLUXO_FUNCTION_KEY` a partir de `--env .env` ao avaliar o `neon.ts`; o deploy foi feito com `$env:FLUXO_FUNCTION_KEY` definido na sessão. O `neon deploy` ainda gravou as demais variáveis no `.env`. Se ocorrer o mesmo erro, defina a variável na sessão antes do comando.

O Neon Auth fica disponível em `NEON_AUTH_BASE_URL`. Em produção, autorize o domínio do app no Neon Auth:

```bash
neon neon-auth domain add https://<app-domain>
```

Para desenvolvimento, as origens `http://localhost:*` já são aceitas pelo Neon Auth. As origens do Realtime ficam em `NEON_REALTIME_ALLOWED_ORIGINS`, avaliado pelo `neon.ts` durante o deploy; o valor padrão cobre `localhost:3000`, `3210` e `3212`.

> **Migração do TiDB:** contas antigas não podem ser importadas para o Neon Auth, porque o hash bcrypt da senha não é transferível entre provedores. É necessário criar a conta novamente no app; os dados locais deste dispositivo são enviados para a nuvem no primeiro login.

### 2. Rodar a API localmente

```bash
npm install
copy .env.example .env
# preencha as variáveis do Neon Postgres/Auth, Object Storage, Functions e Realtime
# (o `neon deploy` preenche a maioria delas automaticamente)
npm run build
npm run db:init
npm start
```

Abra `http://localhost:3000`. A API fica em `http://localhost:3000/api`, o Neon Auth é proxiado em `http://localhost:3000/api/auth` e o app é servido pela mesma origem.

Scripts úteis:

```bash
npm run dev          # servidor com --watch
npm test             # testes de integração da API
npm run test:e2e     # API + Auth + Postgres + Storage + Functions + Realtime
npm run test:e2e:ui  # cadastro, Realtime, backup, IA bloqueada, reload e logout
```

Para usar o `index.html` aberto via `file://`, o modo local funciona sem servidor. Para conta e sincronização, prefira abrir o app pela URL do servidor; alternativamente, informe a URL da API em **Ajustes → Conta e sincronização → Servidor da API**.

### 3. Publicar no Render

1. No Render, escolha **New → Blueprint** e conecte este repositório. O arquivo `render.yaml` já descreve o serviço.
2. Preencha `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, as variáveis `AWS_*`, `NEON_FUNCTION_FLUXOSTATUS_BASE_URL`, `FLUXO_FUNCTION_KEY`, `NEON_REALTIME_URL` e `NEON_REALTIME_SECRET` com os valores do projeto Neon. O `render.yaml` já lista todas elas.
3. O `buildCommand` roda `npm install && npm run build` (gera os bundles do Neon Auth e do Realtime e valida a sintaxe do servidor). O schema é verificado automaticamente na inicialização da API; também é possível rodar `npm run db:init` localmente apontando para o mesmo banco.
4. Após o deploy, rode `neon neon-auth domain add https://<app-domain>` e abra a URL do Render. Cadastre-se em **Ajustes → Conta e sincronização**. Em **Ajustes → Nuvem Neon**, use **Verificar serviços** e **Salvar backup na nuvem**.

O plano gratuito do Render suspende o serviço após um período sem acesso; a primeira requisição pode demorar para acordar.

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | Sim | URL **pooled** do Neon Postgres, usada pela API |
| `DATABASE_URL_UNPOOLED` | Sim | URL **direta** do Neon Postgres, usada para schema/DDL |
| `NEON_AUTH_BASE_URL` | Sim | URL base do Neon Auth no branch |
| `NEON_AUTH_JWKS_URL` | Não | JWKS público do Neon Auth, para validação de JWT fora do proxy |
| `NEON_BRANCH` | Não | Nome do branch Neon (informativo, gerado pela CLI) |
| `AWS_ACCESS_KEY_ID` | Sim* | Credencial do Neon Object Storage |
| `AWS_SECRET_ACCESS_KEY` | Sim* | Segredo do Neon Object Storage |
| `AWS_ENDPOINT_URL_S3` | Sim* | Endpoint S3 compatível do branch |
| `AWS_REGION` | Sim* | Região do bucket (`aws-us-east-2` neste projeto) |
| `FLUXO_BACKUP_BUCKET` | Não | Nome do bucket (padrão `fluxo-backups`) |
| `NEON_FUNCTION_FLUXOSTATUS_BASE_URL` | Sim* | URL pública da função `fluxostatus` |
| `FLUXO_FUNCTION_KEY` | Sim* | Segredo compartilhado entre API e Function |
| `NEON_REALTIME_URL` | Sim* | URL `wss://` do proxy Realtime |
| `NEON_REALTIME_SECRET` | Sim* | Segredo usado pelo servidor para selar queries |
| `NEON_REALTIME_ALLOWED_ORIGINS` | Não | Origens permitidas no deploy do Realtime, separadas por vírgula |
| `NEON_AI_GATEWAY_BASE_URL` | Não | URL do AI Gateway (exige plano pago) |
| `NEON_AI_GATEWAY_TOKEN` | Não | Token do AI Gateway (exige plano pago) |
| `NEON_AI_MODEL` | Não | Modelo usado nas sugestões (padrão `gpt-5-mini`) |
| `CORS_ORIGIN` | Não | Origens permitidas, separadas por vírgula; vazio aceita a mesma origem |
| `DB_POOL_SIZE` | Não | Tamanho do pool Postgres (padrão `5`) |
| `PORT` | Não | Porta HTTP (o Render define automaticamente) |
| `NODE_ENV` | Não | `development`, `production` ou `test` |

\* Obrigatória para o serviço correspondente; o app continua no modo local se as variáveis de nuvem não existirem. O AI Gateway é opcional e permanece bloqueado no plano Free.

As variáveis do Neon podem ser obtidas com `neon env pull` ou copiadas do painel do projeto. O arquivo `.env` é ignorado pelo Git; nunca faça commit de credenciais.

### Endpoints da API

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/health` | Verifica a API e a conexão com o Postgres |
| `GET` | `/api/config` | URL pública do Realtime e disponibilidade dos serviços |
| `POST` | `/api/auth/sign-up/email` | Cria conta no Neon Auth (proxy) |
| `POST` | `/api/auth/sign-in/email` | Autentica no Neon Auth (proxy) |
| `POST` | `/api/auth/sign-out` | Encerra a sessão no Neon Auth (proxy) |
| `GET` | `/api/auth/get-session` | Sessão atual do Neon Auth (proxy) |
| `GET` | `/api/me` | Dados públicos do usuário autenticado |
| `GET` | `/api/state` | Estado sincronizado e revisão atual |
| `PUT` | `/api/state` | Salva o estado usando `baseRevision` |
| `DELETE` | `/api/state` | Remove o estado da conta (usado em “Apagar tudo”) |
| `POST` | `/api/state/live` | Emite uma query selada do Realtime para o usuário |
| `GET` | `/api/cloud/status` | Verifica Postgres, Auth, Storage, Functions, Realtime e AI |
| `GET` | `/api/cloud/storage/health` | Faz put/get/delete de verificação no bucket |
| `POST` | `/api/cloud/backup` | Salva um backup do estado no Object Storage |
| `GET` | `/api/cloud/backups` | Lista backups do usuário |
| `GET` | `/api/cloud/backups/url?key=...` | Gera URL pré-assinada (5 minutos) |
| `DELETE` | `/api/cloud/backups?key=...` | Remove um backup do usuário |
| `GET` | `/api/cloud/function/health` | Chama a Neon Function com o segredo compartilhado |
| `GET` | `/api/cloud/ai/status` | Lista modelos ou explica o bloqueio do plano Free |
| `POST` | `/api/cloud/ai/suggest` | Pede uma sugestão de hábito ao AI Gateway |

Todas as rotas acima exigem sessão, exceto `/api/health` e `/api/config`.

Todas as rotas `/api/auth/*` são proxiadas para o Neon Auth, que concentra cadastro, login, logout e sessão. A API do Fluxo valida a sessão pelo cookie `neon-auth.session_token` em cada requisição autenticada.

Exemplo de envio:

```json
{
  "baseRevision": 3,
  "data": {
    "version": 1,
    "settings": { "theme": "system" },
    "habits": [],
    "tasks": [],
    "focus": {},
    "pomodoro": { "sessions": {} }
  }
}
```

Se a revisão enviada não for a atual, a API responde `409` com a cópia mais recente. O app então mostra o diálogo de conflito para você escolher qual lado prevalece.

### Segurança

- Senhas são gerenciadas pelo Neon Auth; a API do Fluxo nunca recebe nem armazena o hash da senha.
- Sessão em cookie `HttpOnly` emitido pelo Neon Auth. O proxy reescreve o cookie para first-party (`SameSite=Lax`, `Path=/` e `Secure` em HTTPS), necessário para o funcionamento em `localhost`.
- O proxy de autenticação valida a origem das requisições e encaminha somente cabeçalhos necessários.
- Rate limit nas rotas de autenticação e nas rotas gerais.
- Consultas SQL com parâmetros preparados.
- Limite de 1 MB para o estado sincronizado.
- Cabeçalhos de segurança com Helmet e CORS configurável.
- Dados de importação sanitizados no cliente antes de renderizar.
- O bucket é privado; downloads usam URL pré-assinada de 5 minutos e cada chave é validada contra o prefixo do usuário.
- A URL da Neon Function é pública, mas exige o header `x-fluxo-function-key`; o segredo fica no servidor e no ambiente da função.
- O segredo do Realtime nunca chega ao navegador: a API emite apenas capabilities seladas e de curta duração.
- O token do AI Gateway fica somente no servidor; o navegador chama a API do Fluxo.
- Use sempre HTTPS em produção (o Render fornece TLS).

## Privacidade

- Sem conta, nada sai do navegador: não há analytics nem requisições externas.
- Com conta, o estado do app (hábitos, tarefas, foco, sessões e preferências) é enviado por HTTPS para a API e gravado no Neon Postgres. A senha é gerenciada pelo Neon Auth e nunca é gravada pela API do Fluxo.
- Backups manuais são gravados no bucket privado `fluxo-backups`; o download usa uma URL pré-assinada temporária.
- A Neon Function recebe apenas a chamada de status da API; o segredo compartilhado não é exposto ao navegador.
- O Realtime recebe uma query selada restrita ao `user_id` da sessão; o segredo do canal fica no servidor.
- Se o AI Gateway estiver habilitado, o texto do objetivo digitado é enviado ao gateway do Neon para gerar a sugestão; sem as variáveis `NEON_AI_GATEWAY_*`, nenhuma chamada externa é feita.
- A sessão é um cookie `HttpOnly` do Neon Auth, proxiado pelo mesmo domínio do app. O LocalStorage guarda apenas os dados públicos do usuário conectado, não o token. Faça logout em dispositivos compartilhados.
- Limpar os dados do site, usar outro navegador ou outro perfil significa começar do zero localmente. Com conta, os dados podem ser recuperados ao entrar novamente.
- O app funciona offline depois de baixado; a sincronização acontece quando houver conexão.

### Chaves usadas no LocalStorage

| Chave | Conteúdo |
| --- | --- |
| `fluxo:v1` | Hábitos, tarefas, Foco do Dia, sessões e preferências |
| `fluxo:timer:v1` | Estado do timer Pomodoro (modo, tempo restante e ciclo) |
| `fluxo:auth:v1` | Dados públicos do usuário conectado (a sessão fica no cookie do Neon Auth) |
| `fluxo:sync:v1` | Revisão sincronizada e indicação de alterações pendentes |
| `fluxo:api:v1` | URL personalizada da API (opcional) |

## Estrutura do projeto

```text
Sistema de Hábitos + Produtividade/
├── index.html              # Estrutura da interface, diálogos e sprite de ícones
├── README.md
├── package.json            # Dependências e scripts da API
├── render.yaml             # Deploy do app + API no Render
├── neon.ts                 # Política do Neon: Auth, bucket, Function e Realtime
├── .env.example            # Modelo das variáveis de ambiente
├── client/
│   ├── neon-auth.js        # Entrada do SDK do Neon Auth para o bundle
│   └── realtime.js         # Entrada do SDK do Neon Realtime para o bundle
├── css/
│   ├── styles.css          # Base, variáveis, tipografia, layout e tema
│   ├── components.css      # Botões, formulários, cards, toasts e diálogos
│   ├── views.css           # Estilos específicos das telas
│   └── responsive.css      # Adaptações para tablet e celular
├── functions/
│   └── fluxo-status.ts     # Neon Function com consulta ao Postgres
├── js/
│   ├── utils.js            # Datas locais, formatação e helpers
│   ├── storage.js          # LocalStorage, versionamento e normalização
│   ├── state.js            # Estado central, atualização e persistência
│   ├── ui.js               # Toasts, diálogos, tooltip e ícones
│   ├── api.js              # Cliente HTTP da API e do Neon Auth
│   ├── sync.js             # Login, sincronização e conflitos
│   ├── cloud.js            # Backups, status da nuvem e sugestões com IA
│   ├── realtime.js         # Assinatura e renovação da query selada
│   ├── habits.js           # Regras de hábitos, sequências e renderização
│   ├── tasks.js            # Tarefas, filtros e Foco do Dia
│   ├── pomodoro.js         # Timer, ciclos, som e persistência
│   ├── dashboard.js        # Visão geral, calendário e modal do dia
│   ├── stats.js            # Cards e gráficos com Chart.js
│   └── app.js              # Rotas, tema, eventos, ajustes e backup
├── scripts/
│   ├── build-client.mjs    # Gera os bundles do Neon Auth e Realtime
│   ├── e2e.mjs             # Prova API + Auth + Postgres + Storage + Functions + Realtime
│   └── e2e-ui.mjs          # Prova do fluxo no Chromium (Playwright)
├── server/
│   ├── index.js            # Inicialização e encerramento gracioso
│   ├── app.js              # Rotas, autenticação e arquivos estáticos
│   ├── auth.js             # Proxy e verificação de sessão do Neon Auth
│   ├── db.js               # Pool Postgres e schema
│   ├── store.js            # Consultas preparadas e concorrência otimista
│   ├── cloud-error.js      # Erros de nuvem expostos com segurança
│   ├── storage.js          # Object Storage: health, backup, listagem e URL
│   ├── cloud-functions.js  # Chamada server-to-server à Neon Function
│   ├── realtime.js         # Emissão de capabilities seladas
│   ├── ai.js               # Cliente do Neon AI Gateway
│   ├── schema.sql          # Tabela user_states
│   ├── init-db.js          # Aplicação do schema
│   └── test/app.test.js    # Testes de integração da API
└── vendor/
    ├── chart.umd.min.js    # Chart.js 4.4.7 local
    ├── neon-auth.js        # SDK do Neon Auth empacotado (gerado no build)
    └── neon-realtime.js    # SDK do Neon Realtime empacotado (gerado no build)
```

## Detalhes técnicos

- HTML5, CSS3 e JavaScript ES6+ em scripts clássicos com `defer`.
- Sem framework no frontend. O build gera os bundles `vendor/neon-auth.js` e `vendor/neon-realtime.js` com esbuild.
- Sem ES Modules no frontend, para funcionar diretamente via `file://`.
- Datas tratadas no fuso local, com chaves no formato `AAAA-MM-DD`, evitando deslocamentos de UTC.
- Estado versionado e normalizado na leitura e na importação.
- Chart.js 4.4.7 incluído localmente.
- Layout construído com CSS Grid e Flexbox; diálogos nativos com `<dialog>`.
- Respeito a `prefers-reduced-motion` nas animações de interface.
- API em Node.js 20+ com Express, `pg`, Neon Auth, AWS SDK v3, `@neon/realtime`, `@neon/functions` e testes com `node:test` + Playwright.
- Sincronização com revisão incremental e concorrência otimista; conflitos nunca são resolvidos em silêncio.
- Conexões Postgres: URL pooled para a API e URL direta para schema/DDL, conforme a recomendação do Neon.

## Chart.js

O gráfico é desenhado pelo [Chart.js](https://www.chartjs.org/), versão **4.4.7**, distribuído sob a licença MIT. O arquivo local está em `vendor/chart.umd.min.js`; o aviso de licença original está preservado no próprio arquivo.

## Limitações

- Sem conta, os dados não são sincronizados entre dispositivos ou navegadores.
- Com conta, o Neon Realtime propaga alterações ao vivo; se o WebSocket não estiver disponível, o app verifica novidades a cada 60 segundos, ao voltar para a aba, ao reconectar ou pelo botão **Sincronizar agora**.
- O Neon Realtime ainda é beta e depende de o domínio do app estar em `NEON_REALTIME_ALLOWED_ORIGINS`.
- O AI Gateway está bloqueado no plano Free desta conta; as rotas de IA respondem `503` até o upgrade e a configuração de `NEON_AI_GATEWAY_*`.
- Os backups no Object Storage são manuais; a sincronização principal continua no Postgres.
- O LocalStorage tem limite de espaço e pode ser apagado ao limpar os dados do navegador.
- O estado sincronizado tem limite de 1 MB por conta.
- Ainda não há verificação de e-mail, recuperação de senha nem exclusão de conta pela interface.
- O plano gratuito do Render pode suspender a API por inatividade, tornando a primeira requisição mais lenta.
- O Pomodoro não usa notificações do sistema; o aviso é visual e sonoro, conforme o escopo do projeto.
- O bipe depende do suporte do navegador a Web Audio e pode ser bloqueado por políticas de áudio até a primeira interação.
- O app precisa de um navegador moderno; versões muito antigas podem não exibir diálogos ou cores corretamente.

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](./LICENSE).

---

Feito para transformar intenção em constância, um dia de cada vez.
