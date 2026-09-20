import { Response } from 'express';

export interface Filters {
  userId: string;
  type?: string;
  env?: string;
  appName?: string;
  search?: string;
}

export interface SSEClient {
  res: Response;
  filters: Filters;
}
const clients: SSEClient[] = [];
export function addClient(res: Response, filters: Filters) {
  clients.push({ res, filters });

  return () => {
    const index = clients.findIndex((client) => client.res === res);
    if (index !== -1) clients.splice(index, 1);
  };
}

export function broadcastLogs(newLogs: any[]) {
  const CHUNK_SIZE = 50;

  for (const { res, filters } of [...clients]) {
    const matched = [...newLogs].reverse().filter((log) => {
      if (log.userId !== filters.userId) return false;
      if (filters.type && log.type !== filters.type) return false;
      if (filters.env && log.environment !== filters.env) return false;
      if (filters.appName && log.appName !== filters.appName) return false;
      if (filters.search && !log.message?.includes(filters.search))
        return false;
      return true;
    });
    if (matched.length === 0) continue;
    for (let i = 0; i < matched.length; i += CHUNK_SIZE) {
      const slice = matched.slice(i, i + CHUNK_SIZE);
      // SSE events are dispatched only after a blank line terminates the event.
      try {
        res.write(`data: ${JSON.stringify({ type: 'live', logs: slice })}\n\n`);
      } catch {
        const index = clients.findIndex((client) => client.res === res);
        if (index !== -1) clients.splice(index, 1);
      }
    }
  }
}
