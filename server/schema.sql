/* Schema do Fluxo no Neon Postgres.
 * Os usuários e as sessões ficam no schema neon_auth, gerenciado pelo Neon Auth.
 * Aqui guardamos apenas o estado sincronizado de cada usuário.
 */
CREATE TABLE IF NOT EXISTS user_states (
  user_id UUID NOT NULL,
  data JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id)
);

COMMENT ON TABLE user_states IS 'Estado JSON sincronizado do Fluxo por usuário do Neon Auth.';
COMMENT ON COLUMN user_states.data IS 'Hábitos, tarefas, foco, sessões e preferências do app.';
COMMENT ON COLUMN user_states.revision IS 'Revisão incremental usada para concorrência otimista.';
COMMENT ON COLUMN user_states.updated_at IS 'Timestamp em milissegundos da última gravação.';
