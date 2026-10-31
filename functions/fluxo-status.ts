/* Neon Function: status do Fluxo, executado ao lado do Postgres.
 * A URL é pública; por isso a rota exige o segredo compartilhado do app.
 */
import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  application_name: "fluxo-function"
});

attachDatabasePool(pool);

const SHARED_KEY = process.env.FLUXO_FUNCTION_KEY || "";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/" && url.pathname !== "/health") {
      return json({ ok: false, error: "Rota não encontrada." }, 404);
    }

    if (!SHARED_KEY || request.headers.get("x-fluxo-function-key") !== SHARED_KEY) {
      return json({ ok: false, error: "Não autorizado." }, 401);
    }

    try {
      const { rows } = await pool.query(
        `SELECT now() AS db_time,
                (SELECT count(*) FROM user_states)::int AS state_count`
      );

      return json({
        ok: true,
        service: "fluxo-function",
        branch: process.env.NEON_BRANCH || null,
        dbTime: rows[0].db_time,
        stateCount: rows[0].state_count
      });
    } catch (error) {
      console.error("[Fluxo Function] Falha ao consultar o Postgres:", error);
      return json({ ok: false, error: "Banco de dados indisponível." }, 503);
    }
  }
};
