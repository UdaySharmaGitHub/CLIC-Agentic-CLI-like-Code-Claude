// ─────────────────────────────────────────────────────────────────────────────
//  Tool: list_sap_deployments
//
//  Lists all model deployments in the SAP AI Core service.
//  Uses @sap-ai-sdk/ai-api (AiDeploymentApi) which handles OAuth internally
//  via AICORE_SERVICE_KEY.  The getAccessToken() helper below is a direct
//  TypeScript translation of the Python manual-token snippet for reference.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import chalk from 'chalk';
import { DeploymentApi } from '@sap-ai-sdk/ai-api';
import {
  printToolHeader, printToolSuccess, printToolError,
  printDimOutput, printSeparator,
} from '../ui.js';
import type { ConfirmFn, ToolResult, ToolDefinition } from './types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AiCoreServiceKey {
  clientid: string;
  clientsecret: string;
  /** OAuth token URL (the `url` field in the service key) */
  url: string;
  serviceurls: {
    AI_API_URL: string;
  };
}

// ── Tool definition ───────────────────────────────────────────────────────────

export const definition: ToolDefinition = {
  name: 'list_sap_deployments',
  description:
    'List all model deployments available in the SAP AI Core service. ' +
    'Returns deployment IDs, model names, status, scenario info, and a ' +
    'deduplicated model catalogue. Optionally filter by keyword.',
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description:
          'Keyword to filter results by model name, e.g. "embedding", "gpt", "claude". ' +
          'Leave empty to return all deployments.',
      },
      resource_group: {
        type: 'string',
        description: 'AI-Resource-Group header value (default: "default").',
      },
    },
    required: [],
  },
};

// ── Manual OAuth token helper (translated from Python snippet) ────────────────
//
//  Equivalent of:
//    resp = requests.post(f"{aicore_auth_url}/oauth/token",
//                         auth=(clientid, clientsecret),
//                         params={"grant_type": "client_credentials"})
//    access_token = resp.json()["access_token"]

export async function getAccessToken(key: AiCoreServiceKey): Promise<string> {
  const resp = await axios.post<{ access_token: string }>(
    `${key.url}/oauth/token`,
    new URLSearchParams({ grant_type: 'client_credentials' }),
    {
      auth: { username: key.clientid, password: key.clientsecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );
  return resp.data.access_token;
}

// ── Model name extraction ─────────────────────────────────────────────────────
//  The field path varies across scenario types, so try several locations.

function extractModelName(dep: Record<string, any>): string {
  return (
    dep?.details?.resources?.backend_details?.model?.name ??
    dep?.details?.resources?.backend_details?.predictor?.model_name ??
    dep?.details?.resources?.backend_details?.model_name ??
    dep?.configurationName ??
    'N/A'
  );
}

// ── Startup helper — fetch models for interactive selection ──────────────────

export interface ModelOption {
  value: string;  // model name passed to OrchestrationClient
  label: string;  // display text in the terminal picker
  hint: string;   // deployment ID + status shown as a hint
}

/**
 * Fetches all RUNNING LLM deployments and returns them as picker-ready options.
 * Embedding models are excluded — they cannot be used for chat completions.
 * Called during the CLIC startup wizard before the REPL starts.
 */
export async function fetchDeployedModelOptions(
  resourceGroup = 'default',
): Promise<ModelOption[]> {
  const response = await DeploymentApi
    .deploymentQuery({ status: 'RUNNING' }, { 'AI-Resource-Group': resourceGroup })
    .execute();

  const deployments: Record<string, any>[] = (response as any).resources ?? [];

  const seen = new Set<string>();
  const options: ModelOption[] = [];

  for (const dep of deployments) {
    const modelName = extractModelName(dep);
    if (modelName === 'N/A' || seen.has(modelName)) continue;
    if (/embed/i.test(modelName)) continue; // not usable for chat
    seen.add(modelName);
    options.push({
      value: modelName,
      label: modelName,
      hint: `id: ${dep.id ?? 'n/a'} · ${dep.status ?? ''}`,
    });
  }

  return options;
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(
  input: { filter?: string; resource_group?: string },
  _confirm: ConfirmFn,
): Promise<ToolResult> {
  const resourceGroup = input.resource_group ?? 'default';
  printToolHeader('list_sap_deployments', `Resource group: ${resourceGroup}`);

  try {
    console.log(`  ${chalk.dim('Fetching deployments via SAP AI SDK...')}`);

    // AiDeploymentApi reads AICORE_SERVICE_KEY and handles OAuth automatically.
    const response = await DeploymentApi
      .deploymentQuery({}, { 'AI-Resource-Group': resourceGroup })
      .execute();

    const all: Record<string, any>[] = (response as any).resources ?? [];
    console.log(`  ${chalk.green(`✓ Found ${all.length} deployments`)}\n`);

    const deployments = input.filter
      ? all.filter(d =>
          extractModelName(d).toLowerCase().includes(input.filter!.toLowerCase()),
        )
      : all;

    // ── Build formatted output (mirrors Python print structure) ──────────────

    const sep = '='.repeat(80);
    const dash = '-'.repeat(80);

    const lines: string[] = [
      sep,
      'ALL AVAILABLE DEPLOYMENTS',
      sep,
      `Total deployments: ${all.length}` +
        (input.filter ? `  (showing ${deployments.length} matching "${input.filter}")` : ''),
      '',
    ];

    for (const [i, dep] of deployments.entries()) {
      lines.push(dash, `Deployment #${i + 1}`, dash);
      lines.push(`Model Name:       ${extractModelName(dep)}`);
      lines.push(`Deployment ID:    ${dep.id ?? 'N/A'}`);
      lines.push(`Status:           ${dep.status ?? 'N/A'}`);
      lines.push(`Scenario ID:      ${dep.scenarioId ?? 'N/A'}`);
      lines.push(`Configuration ID: ${dep.configurationId ?? 'N/A'}`);
      lines.push(`Created:          ${dep.createdAt ?? 'N/A'}`);
      lines.push('');
    }

    // Deduplicated model catalogue
    const uniqueModels = [
      ...new Set(all.map(extractModelName).filter(n => n !== 'N/A')),
    ].sort();

    lines.push(sep, 'ALL AVAILABLE MODEL NAMES:', sep, '');
    for (const [i, name] of uniqueModels.entries()) {
      const isEmbedding = /embed/i.test(name);
      lines.push(`${i + 1}. ${name}${isEmbedding ? '  ⭐ [EMBEDDING]' : ''}`);
    }
    lines.push(sep);

    // Embedding-only summary
    const embeddingModels = uniqueModels.filter(n => /embed/i.test(n));
    lines.push('', 'EMBEDDING MODELS ONLY:', '');
    if (embeddingModels.length > 0) {
      embeddingModels.forEach((m, i) => lines.push(`${i + 1}. ✓ ${m}`));
    } else {
      lines.push('⚠️  No embedding models found!');
    }
    lines.push(sep);

    // Print first 60 lines to terminal
    printDimOutput(lines.slice(0, 60), 60);
    if (lines.length > 60) {
      console.log(
        `  ${chalk.dim(`... (${lines.length} lines total — full text returned to agent)`)}`,
      );
    }
    console.log();

    printToolSuccess(
      `${all.length} deployments · ${uniqueModels.length} unique models · ` +
      `${embeddingModels.length} embedding model(s).`,
    );
    printSeparator();

    return { output: lines.join('\n'), isError: false };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    printToolError(`Failed to list deployments: ${msg}`);
    printSeparator();
    return { output: `ERROR — ${msg}`, isError: true };
  }
}
