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
- backup dos dados em JSON;
- conta opcional com sincronização entre dispositivos.

Sem conta, os dados ficam somente no **LocalStorage** do navegador. Com uma conta, o app usa a API própria para guardar uma cópia no **TiDB Cloud**.

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
- Cadastro e login com e-mail e senha.
- Sincronização automática das alterações com a API e o TiDB Cloud.
- Escolha explícita em conflitos: usar os dados da nuvem ou manter os deste dispositivo.
- Sincronização manual pelo botão **Sincronizar agora**.
- Sessão validada ao abrir o app e a cada 60 segundos quando não há alterações pendentes.
- Logout mantém os dados locais; apagar tudo também remove a cópia da conta na nuvem.
- O app continua funcionando offline; as alterações são enviadas quando a conexão volta.

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

- **Frontend:** HTML, CSS e JavaScript clássicos, sem build. LocalStorage como fonte local e cache offline.
- **API:** Node.js + Express em `server/`, com autenticação JWT, bcrypt, rate limit e CORS.
- **Banco:** TiDB Cloud (compatível com MySQL), com as tabelas `users` e `user_states`.
- **Hospedagem:** Render serve o app e a API na mesma origem, o que dispensa configurar CORS no uso normal.
- **Sincronização:** o estado completo é salvo como JSON por usuário, com revisão incremental e concorrência otimista.

### 1. Criar o banco no TiDB Cloud

1. Crie um cluster **TiDB Cloud Serverless** em [tidbcloud.com](https://tidbcloud.com).
2. Abra o painel do cluster e clique em **Connect** para copiar host, porta, usuário e senha.
3. Em **Network Access / Allowed IP Addresses**, libere a saída do Render. Como o plano gratuito usa IPs dinâmicos, a opção prática é `0.0.0.0/0`, mantendo uma senha forte e TLS obrigatório.
4. (Opcional) Crie o banco pelo SQL Editor: `CREATE DATABASE fluxo;`. O script `npm run db:init` também faz isso, desde que o usuário tenha permissão.
5. Guarde a senha apenas no `.env` local e nas variáveis do Render. Ela não deve ser commitada.

Se a conexão falhar por certificado, baixe a CA do cluster no painel do TiDB e informe o conteúdo em `DB_SSL_CA` (com `\n` nas quebras de linha). Não desative a verificação TLS em produção.

### 2. Rodar a API localmente

```bash
npm install
copy .env.example .env
# edite o .env com os dados do TiDB Cloud e um JWT_SECRET forte
npm run db:init
npm start
```

Abra `http://localhost:3000`. A API fica em `http://localhost:3000/api` e o app é servido pela mesma origem.

Para usar o `index.html` aberto via `file://` com a API local, informe `http://localhost:3000` em **Ajustes → Conta e sincronização → Servidor da API**.

### 3. Publicar no Render

1. No Render, escolha **New → Blueprint** e conecte este repositório. O arquivo `render.yaml` já descreve o serviço.
2. Preencha as variáveis `DB_HOST`, `DB_USER` e `DB_PASSWORD` com os dados do TiDB Cloud. `DB_NAME` já vem como `fluxo`; `JWT_SECRET` é gerado automaticamente.
3. Rode `npm run db:init` localmente apontando para o mesmo banco (ou crie as tabelas pelo SQL Editor do TiDB).
4. Após o deploy, abra a URL do Render. Cadastre-se em **Ajustes → Conta e sincronização**.

O plano gratuito do Render suspende o serviço após um período sem acesso; a primeira requisição pode demorar para acordar. O schema é verificado automaticamente na inicialização da API.

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DB_HOST` | Sim | Host do cluster TiDB Cloud |
| `DB_USER` | Sim | Usuário do banco |
| `DB_PASSWORD` | Sim | Senha do banco |
| `DB_NAME` | Sim | Nome do banco (`fluxo`) |
| `DB_PORT` | Não | Porta do TiDB (padrão `4000`) |
| `DB_SSL` | Não | TLS habilitado por padrão; use `false` só em ambiente local |
| `DB_SSL_CA` | Não | CA em PEM, com `\n` escapado, se o cluster exigir |
| `JWT_SECRET` | Sim | Segredo com pelo menos 32 caracteres |
| `CORS_ORIGIN` | Não | Origens permitidas, separadas por vírgula; vazio aceita a mesma origem |
| `PORT` | Não | Porta HTTP (o Render define automaticamente) |

Gere um segredo local com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Endpoints da API

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/health` | Verifica a API e a conexão com o banco |
| `POST` | `/api/auth/register` | Cria conta e devolve JWT |
| `POST` | `/api/auth/login` | Autentica e devolve JWT |
| `GET` | `/api/me` | Dados públicos do usuário autenticado |
| `GET` | `/api/state` | Estado sincronizado e revisão atual |
| `PUT` | `/api/state` | Salva o estado usando `baseRevision` |
| `DELETE` | `/api/state` | Remove o estado da conta (usado em “Apagar tudo”) |

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

- Senhas com bcrypt; nunca são devolvidas pela API nem gravadas em texto.
- JWT com validade de 30 dias, emissor e público fixos.
- Rate limit nas rotas de autenticação e nas rotas gerais.
- Consultas SQL com parâmetros preparados.
- Limite de 1 MB para o estado sincronizado.
- Cabeçalhos de segurança com Helmet e CORS configurável.
- Dados de importação sanitizados no cliente antes de renderizar.
- Use sempre HTTPS em produção (o Render fornece TLS).

## Privacidade

- Sem conta, nada sai do navegador: não há analytics nem requisições externas.
- Com conta, o estado do app (hábitos, tarefas, foco, sessões e preferências) é enviado por HTTPS para a API e gravado no TiDB Cloud. A senha é armazenada apenas como hash bcrypt; o texto da senha nunca é salvo.
- A API não usa cookies: a sessão é um token JWT guardado no LocalStorage. Use o app em um computador confiável e faça logout em dispositivos compartilhados.
- Limpar os dados do site, usar outro navegador ou outro perfil significa começar do zero localmente. Com conta, os dados podem ser recuperados ao entrar novamente.
- O app funciona offline depois de baixado; a sincronização acontece quando houver conexão.

### Chaves usadas no LocalStorage

| Chave | Conteúdo |
| --- | --- |
| `fluxo:v1` | Hábitos, tarefas, Foco do Dia, sessões e preferências |
| `fluxo:timer:v1` | Estado do timer Pomodoro (modo, tempo restante e ciclo) |
| `fluxo:auth:v1` | Token JWT e dados públicos do usuário conectado |
| `fluxo:sync:v1` | Revisão sincronizada e indicação de alterações pendentes |
| `fluxo:api:v1` | URL personalizada da API (opcional) |

## Estrutura do projeto

```text
Sistema de Hábitos + Produtividade/
├── index.html              # Estrutura da interface, diálogos e sprite de ícones
├── README.md
├── package.json            # Dependências e scripts da API
├── render.yaml             # Deploy do app + API no Render
├── .env.example            # Modelo das variáveis de ambiente
├── css/
│   ├── styles.css          # Base, variáveis, tipografia, layout e tema
│   ├── components.css      # Botões, formulários, cards, toasts e diálogos
│   ├── views.css           # Estilos específicos das telas
│   └── responsive.css      # Adaptações para tablet e celular
├── js/
│   ├── utils.js            # Datas locais, formatação e helpers
│   ├── storage.js          # LocalStorage, versionamento e normalização
│   ├── state.js            # Estado central, atualização e persistência
│   ├── ui.js               # Toasts, diálogos, tooltip e ícones
│   ├── api.js              # Cliente HTTP da API
│   ├── sync.js             # Login, sincronização e conflitos
│   ├── habits.js           # Regras de hábitos, sequências e renderização
│   ├── tasks.js            # Tarefas, filtros e Foco do Dia
│   ├── pomodoro.js         # Timer, ciclos, som e persistência
│   ├── dashboard.js        # Visão geral, calendário e modal do dia
│   ├── stats.js            # Cards e gráficos com Chart.js
│   └── app.js              # Rotas, tema, eventos, ajustes e backup
├── server/
│   ├── index.js            # Inicialização e encerramento gracioso
│   ├── app.js              # Rotas, autenticação e arquivos estáticos
│   ├── db.js               # Pool MySQL/TiDB e schema
│   ├── store.js            # Consultas preparadas e concorrência otimista
│   ├── schema.sql          # Tabelas users e user_states
│   ├── init-db.js          # Criação do banco e das tabelas
│   └── test/app.test.js    # Testes de integração da API
└── vendor/
    └── chart.umd.min.js    # Chart.js 4.4.7 local
```

## Detalhes técnicos

- HTML5, CSS3 e JavaScript ES6+ em scripts clássicos com `defer`.
- Sem framework, bundler ou etapa de build no frontend.
- Sem ES Modules no frontend, para funcionar diretamente via `file://`.
- Datas tratadas no fuso local, com chaves no formato `AAAA-MM-DD`, evitando deslocamentos de UTC.
- Estado versionado e normalizado na leitura e na importação.
- Chart.js 4.4.7 incluído localmente.
- Layout construído com CSS Grid e Flexbox; diálogos nativos com `<dialog>`.
- Respeito a `prefers-reduced-motion` nas animações de interface.
- API em Node.js 20+ com Express, mysql2, JWT, bcrypt e testes com `node:test`.
- Sincronização com revisão incremental e concorrência otimista; conflitos nunca são resolvidos em silêncio.

## Chart.js

O gráfico é desenhado pelo [Chart.js](https://www.chartjs.org/), versão **4.4.7**, distribuído sob a licença MIT. O arquivo local está em `vendor/chart.umd.min.js`; o aviso de licença original está preservado no próprio arquivo.

## Limitações

- Sem conta, os dados não são sincronizados entre dispositivos ou navegadores.
- Com conta, a sincronização não é em tempo real: o app verifica novidades a cada 60 segundos, ao voltar para a aba, ao reconectar ou pelo botão **Sincronizar agora**.
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
