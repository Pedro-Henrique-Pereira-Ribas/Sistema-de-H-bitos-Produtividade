# Fluxo — Hábitos e Produtividade

Um aplicativo web local para acompanhar hábitos, organizar tarefas e proteger o seu foco. Sem conta, sem servidor e sem dependências externas: tudo funciona com um duplo clique no `index.html`.

## Visão geral

O **Fluxo** reúne, em uma única interface:

- acompanhamento diário e semanal de hábitos;
- sequências (streaks) e calendário de contribuições;
- tarefas com prioridade, prazo e filtros;
- Foco do Dia com até três tarefas;
- timer Pomodoro com ciclos de foco e pausa;
- estatísticas e gráficos;
- tema claro, escuro ou automático;
- backup dos dados em JSON.

Os dados ficam no **LocalStorage** do navegador. Nada é enviado para a internet.

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

Não é necessário instalar nada, rodar um servidor ou estar conectado à internet.

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
- Para conhecer o app com conteúdo, use **Dados de exemplo** em Ajustes. Se já houver dados, o app pedirá confirmação antes de substituí-los.

## Backup e restauração

- **Exportar JSON** baixa um arquivo `fluxo-backup-AAAA-MM-DD.json` com hábitos, tarefas, foco, sessões do Pomodoro e preferências.
- **Importar JSON** aceita um backup gerado pelo app. O conteúdo é validado e normalizado antes de substituir os dados atuais.
- A importação pede confirmação e valida a estrutura do arquivo antes de substituir os dados atuais; JSON inválido é rejeitado.
- **Apagar tudo** remove os dados deste navegador. Exporte um backup antes se quiser guardar o histórico.

## Privacidade

- Não há login, servidor, analytics ou requisições externas.
- Hábitos, tarefas, sequências, sessões e preferências ficam apenas no LocalStorage do navegador usado.
- Limpar os dados do site, usar outro navegador ou outro perfil significa começar do zero. Por isso, faça backups periodicamente.
- O app funciona offline depois de baixado.

### Chaves usadas no LocalStorage

| Chave | Conteúdo |
| --- | --- |
| `fluxo:v1` | Hábitos, tarefas, Foco do Dia, sessões e preferências |
| `fluxo:timer:v1` | Estado do timer Pomodoro (modo, tempo restante e ciclo) |

## Estrutura do projeto

```text
Sistema de Hábitos + Produtividade/
├── index.html              # Estrutura da interface, diálogos e sprite de ícones
├── README.md
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
│   ├── habits.js           # Regras de hábitos, sequências e renderização
│   ├── tasks.js            # Tarefas, filtros e Foco do Dia
│   ├── pomodoro.js         # Timer, ciclos, som e persistência
│   ├── dashboard.js        # Visão geral, calendário e modal do dia
│   ├── stats.js            # Cards e gráficos com Chart.js
│   └── app.js              # Rotas, tema, eventos, ajustes e backup
└── vendor/
    └── chart.umd.min.js    # Chart.js 4.4.7 local
```

## Detalhes técnicos

- HTML5, CSS3 e JavaScript ES6+ em scripts clássicos com `defer`.
- Sem framework, bundler ou etapa de build.
- Sem ES Modules, para funcionar diretamente via `file://`.
- Datas tratadas no fuso local, com chaves no formato `AAAA-MM-DD`, evitando deslocamentos de UTC.
- Estado versionado e normalizado na leitura e na importação.
- Chart.js 4.4.7 incluído localmente.
- Layout construído com CSS Grid e Flexbox; diálogos nativos com `<dialog>`.
- Respeito a `prefers-reduced-motion` nas animações de interface.

## Chart.js

O gráfico é desenhado pelo [Chart.js](https://www.chartjs.org/), versão **4.4.7**, distribuído sob a licença MIT. O arquivo local está em `vendor/chart.umd.min.js`; o aviso de licença original está preservado no próprio arquivo.

## Limitações

- Os dados não são sincronizados entre dispositivos ou navegadores.
- O LocalStorage tem limite de espaço e pode ser apagado ao limpar os dados do navegador.
- O Pomodoro não usa notificações do sistema; o aviso é visual e sonoro, conforme o escopo do projeto.
- O bipe depende do suporte do navegador a Web Audio e pode ser bloqueado por políticas de áudio até a primeira interação.
- O app precisa de um navegador moderno; versões muito antigas podem não exibir diálogos ou cores corretamente.

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](./LICENSE).

---

Feito para transformar intenção em constância, um dia de cada vez.
