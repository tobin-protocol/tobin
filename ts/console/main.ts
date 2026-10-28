// DOM wiring for the Console: renders the model, forwards form submissions and clicks to the controller. All behaviour lives in controller.ts and
// view.ts (tested in Node); this file only connects them to the page. It has no automated test beyond type-checking and being served; see README.
import { fromHex } from '../src/amount.ts';
import { TobinClient } from '../src/sdk/index.ts';
import { ConsoleController } from './controller.ts';
import { HttpTransport } from './http-transport.ts';
import { parsePlan, renderApp } from './view.ts';

interface Boot {
  description: string;
  clearing: string;
  networkId: string;
  personas: { name: string; address: string }[];
  tokens: { name: string; address: string; cap: string }[];
}

const root = document.getElementById('app') as HTMLElement;
const errorBox = document.getElementById('error') as HTMLElement;

function showError(e: unknown): void {
  errorBox.textContent = e instanceof Error ? e.message : String(e);
  errorBox.hidden = false;
}

async function start(): Promise<void> {
  const boot = (await (await fetch('/api/bootstrap')).json()) as Boot;
  const client = new TobinClient({ transport: new HttpTransport('/api/rpc', boot.description), clearing: boot.clearing, networkId: fromHex(boot.networkId) });
  const c = new ConsoleController(client, { personas: boot.personas, tokens: boot.tokens });
  const paint = (): void => {
    root.innerHTML = renderApp(c.model);
  };
  c.subscribe(paint);
  await c.refresh();

  const run = async (f: () => Promise<unknown> | unknown): Promise<void> => {
    errorBox.hidden = true;
    try {
      await f();
    } catch (e) {
      showError(e);
    }
  };

  root.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = ev.target as HTMLFormElement;
    const v = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    void run(async () => {
      switch (form.dataset['action']) {
        case 'select': await c.selectSession((v['label'] ?? '').trim()); break;
        case 'create': c.prepareCreate({ creator: v['creator'] as string, token: v['token'] as string, maxParticipants: v['maxParticipants'] as string, maxObligations: v['maxObligations'] as string }); break;
        case 'join': await c.prepareJoin({ participant: v['participant'] as string }); break;
        case 'obligation': c.prepareObligation({ debtor: v['debtor'] as string, creditor: v['creditor'] as string, amount: v['amount'] as string, key: crypto.randomUUID() }); break;
        case 'finalize': c.prepareFinalize({ caller: v['caller'] as string }); break;
        case 'useDefault': await c.useDefaultProposal(); break;
        case 'setDraft': c.setDraft(parsePlan(v['plan'] ?? '', c.model.personas)); break;
        case 'propose': c.prepareProposal({ proposer: v['proposer'] as string }); break;
        case 'approve': c.prepareApproval({ participant: v['participant'] as string }); break;
        case 'settle': await c.prepareSettlement(); break;
        case 'mint': await c.prepareMint({ to: v['to'] as string, token: v['token'] as string, amount: v['amount'] as string }); break;
      }
    });
  });

  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!el || el.tagName === 'FORM') return;
    if (el.dataset['action'] === 'confirm') void run(() => c.confirmPending());
    if (el.dataset['action'] === 'cancel') c.cancelPending();
  });

  root.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.dataset['grant']) c.setGrant(el.dataset['grant'], el.checked);
  });
}

start().catch(showError);
