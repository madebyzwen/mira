/** Öffentliche Bausteine des MIRA-Agents – genutzt von den Integrationstests im MIRA-Backend. */
export { buildServer, normalizeAddress, type ServerOptions } from './server.ts';
export { Host, type HostDeps } from './host.ts';
export { parseConfig, type AgentConfig } from './config.ts';
