/* Cliente do Neon Auth para o navegador (sem bundler no runtime). */
import { createAuthClient } from '@neondatabase/auth';

window.NeonAuth = { createAuthClient };
