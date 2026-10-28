'use client';
// DOM wiring for the Console: renders the model, forwards form submissions and clicks to the controller. All behaviour lives in lib/console/controller.ts
// and lib/console/view.ts (tested in Node); this component only connects them to the page, exactly as the earlier main.ts did. The panel contents are the
// controller's HTML strings, written into the `#app` element by the effect below; React never re-renders them (this component has no state), and the
// effect removes its listeners when the component unmounts, so a remount (React Strict Mode in development) cannot leave duplicate handlers.
import { useEffect, useRef } from 'react';
import { fromHex } from 'tobin-mvp1-sdk/amount';
import { TobinClient } from 'tobin-mvp1-sdk/sdk';
import { ConsoleController } from '../lib/console/controller.ts';
import { HttpTransport } from '../lib/console/http-transport.ts';
import { parsePlan, renderApp } from '../lib/console/view.ts';

interface Boot {
  description: string;
  clearing: string;
  networkId: string;
  personas: { name: string; address: string }[];
  tokens: { name: string; address: string; cap: string }[];
}

export function ConsoleApp() {
  const rootRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current as HTMLElement;
    const errorBox = errorRef.current as HTMLElement;
    let active = true;

    const showError = (e: unknown): void => {
      if (!active) return;
      errorBox.textContent = e instanceof Error ? e.message : String(e);
      errorBox.hidden = false;
    };

    const onSubmit = (c: ConsoleController) => (ev: Event): void => {
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
    };

    const run = async (f: () => Promise<unknown> | unknown): Promise<void> => {
      errorBox.hidden = true;
      try {
        await f();
      } catch (e) {
        showError(e);
      }
    };

    const onClick = (c: ConsoleController) => (ev: Event): void => {
      const el = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!el || el.tagName === 'FORM') return;
      if (el.dataset['action'] === 'confirm') void run(() => c.confirmPending());
      if (el.dataset['action'] === 'cancel') c.cancelPending();
    };

    const onChange = (c: ConsoleController) => (ev: Event): void => {
      const el = ev.target as HTMLInputElement;
      if (el.dataset['grant']) c.setGrant(el.dataset['grant'], el.checked);
    };

    let detach = (): void => {};

    async function start(): Promise<void> {
      const boot = (await (await fetch('/api/bootstrap')).json()) as Boot;
      if (!active) return;
      const client = new TobinClient({ transport: new HttpTransport('/api/rpc', boot.description), clearing: boot.clearing, networkId: fromHex(boot.networkId) });
      const c = new ConsoleController(client, { personas: boot.personas, tokens: boot.tokens });
      c.subscribe(() => {
        if (active) root.innerHTML = renderApp(c.model);
      });
      await c.refresh();
      if (!active) return;

      const submit = onSubmit(c);
      const click = onClick(c);
      const change = onChange(c);
      root.addEventListener('submit', submit);
      root.addEventListener('click', click);
      root.addEventListener('change', change);
      detach = () => {
        root.removeEventListener('submit', submit);
        root.removeEventListener('click', click);
        root.removeEventListener('change', change);
      };
    }

    start().catch(showError);
    return () => {
      active = false;
      detach();
    };
  }, []);

  return (
    <>
      <div id="error" className="error" role="alert" hidden ref={errorRef} />
      <main id="app" ref={rootRef} suppressHydrationWarning>
        Loading the local sandbox...
      </main>
    </>
  );
}
