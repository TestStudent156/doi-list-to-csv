// Run the "Crossref DOI Metadata – Clean JSON and CSV" Apify Actor on a DOI list
// and save OUTPUT.csv and REPORT.json in the current directory.
//
// Usage (Node.js 18 or newer, no dependencies):
//   APIFY_TOKEN=<your token> node run-actor.mjs input.json
//
// The token is read from the environment and is never printed.
// MAX_CHARGE_USD caps what one run may charge (default 0.50 USD, enough for 500 results).
// The Actor returns at most maxItems rows (default 100); set "maxItems" up to 500 in the input.

import { readFile, writeFile } from 'node:fs/promises';

const ACTOR = 'wavy_toucanet~crossref-metadata-pilot';
const API = 'https://api.apify.com/v2';
const token = process.env.APIFY_TOKEN;
const maxChargeUsd = process.env.MAX_CHARGE_USD ?? '0.50';
const inputPath = process.argv[2] ?? 'input.json';

if (!token) {
  console.error('Set APIFY_TOKEN (Apify Console > Settings > API & Integrations).');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}` };

async function api(path, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} failed: HTTP ${response.status}`);
  return response;
}

const input = await readFile(inputPath, 'utf8');
const started = await api(`/acts/${ACTOR}/runs?waitForFinish=60&maxTotalChargeUsd=${maxChargeUsd}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: input,
});
let run = (await started.json()).data;
console.log(`Run ${run.id} started`);

while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
  run = (await (await api(`/actor-runs/${run.id}?waitForFinish=60`)).json()).data;
  console.log(`Status: ${run.status}`);
}

const store = `/key-value-stores/${run.defaultKeyValueStoreId}/records`;
let report;
try {
  report = await (await api(`${store}/REPORT`)).json();
} catch (error) {
  console.error(`Run ended with status ${run.status} and no readable REPORT (${error.message}).`);
  process.exit(1);
}
await writeFile('REPORT.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Run status: ${run.status}. Unique rows: ${report.emittedCount ?? 0}, duplicates: ${report.duplicateCount ?? 0}, errors: ${report.errors?.length ?? 0}, stop reason: ${report.stopReason ?? 'unknown'}`);

if (report.emittedCount > 0) {
  await writeFile('OUTPUT.csv', await (await api(`${store}/OUTPUT.csv`)).text());
  console.log('Saved OUTPUT.csv and REPORT.json');
} else {
  console.log('No successful rows; saved REPORT.json');
}
if (run.status !== 'SUCCEEDED') process.exitCode = 1;
