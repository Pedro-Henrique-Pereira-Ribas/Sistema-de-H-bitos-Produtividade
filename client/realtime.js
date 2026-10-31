/* Expõe o SDK browser do Neon Realtime para o app vanilla. */
import { createRealtimeClient, QueryRefreshController } from '@neon/realtime/client';

window.NeonRealtime = {
  createRealtimeClient,
  QueryRefreshController
};
