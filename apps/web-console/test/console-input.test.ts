// Console input handling (no bridge): bad numbers must be refused with a clear message BEFORE anything is prepared or sent. A fake transport
// that fails the test if it is ever asked to change state stands in for the contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineError } from '../../../packages/mvp1-sdk/src/amount.ts';
import { TobinClient } from '../../../packages/mvp1-sdk/src/sdk/index.ts';
import type { InvocationResult, PreparedCall, Transport } from '../../../packages/mvp1-sdk/src/sdk/index.ts';
import { ConsoleController } from '../lib/console/controller.ts';
import { addr } from '../../../packages/mvp1-sdk/test/helpers.ts';

const A = addr(11, 'contract');
const B = addr(12, 'contract');
const TOKEN = addr(201, 'contract');

class ReadOnly implements Transport {
  readonly description = 'fake read-only transport';
  writes: string[] = [];
  invoke(call: PreparedCall): Promise<InvocationResult> {
    if (call.fn === 'balance') return Promise.resolve({ ok: true, value: '0' });
    if (call.fn === 'get_session') return Promise.resolve({ ok: false, errorType: 'Contract', code: 1 });
    if (call.fn === 'minter') return Promise.resolve({ ok: true, value: A });
    this.writes.push(call.fn);
    return Promise.resolve({ ok: true, value: null });
  }
}

async function controller(): Promise<{ c: ConsoleController; t: ReadOnly }> {
  const t = new ReadOnly();
  const c = new ConsoleController(new TobinClient({ transport: t, clearing: addr(200, 'contract') }), {
    personas: [{ name: 'Alice', address: A }, { name: 'Bob', address: B }],
    tokens: [{ name: 'TTT-A', address: TOKEN, cap: '1000' }],
  });
  await c.selectSession('x');
  return { c, t };
}

const refused = (e: unknown): boolean => e instanceof EngineError;

test('capacities must be whole numbers in range: blank, fractional, negative, huge and non-numeric values are refused', async () => {
  const { c, t } = await controller();
  for (const bad of ['', ' ', '2.5', '-1', 'abc', '1e2', '4294967296', NaN, 2.5, -3, Infinity]) {
    assert.throws(() => c.prepareCreate({ creator: 'Alice', token: 'TTT-A', maxParticipants: bad as number, maxObligations: 16 }), refused, `participants ${String(bad)}`);
    assert.throws(() => c.prepareCreate({ creator: 'Alice', token: 'TTT-A', maxParticipants: 4, maxObligations: bad as number }), refused, `obligations ${String(bad)}`);
  }
  assert.equal(c.model.pending as unknown, null, 'nothing was prepared');
  assert.deepEqual(t.writes, [], 'nothing reached the transport');
  // ordinary values, as numbers or as the strings a form produces, are accepted
  c.prepareCreate({ creator: 'Alice', token: 'TTT-A', maxParticipants: ' 4 ', maxObligations: '16' });
  assert.deepEqual(c.model.pending?.call.args.slice(3), [{ t: 'u32', v: 4 }, { t: 'u32', v: 16 }]);
  c.prepareCreate({ creator: 'Alice', token: 'TTT-A', maxParticipants: 2, maxObligations: 1 });
  assert.deepEqual(c.model.pending?.call.args.slice(3), [{ t: 'u32', v: 2 }, { t: 'u32', v: 1 }]);
});

test('amounts: only positive whole numbers; surrounding spaces are tolerated, everything else is refused', async () => {
  const { c, t } = await controller();
  for (const bad of ['0', '-5', '1.5', '1e3', 'abc', '', '0x10', '5 5', '+5', '٣', String(2n ** 127n)]) {
    assert.throws(() => c.prepareObligation({ debtor: 'Alice', creditor: 'Bob', amount: bad, key: 'k' }), refused, `obligation ${bad}`);
    await assert.rejects(c.prepareMint({ to: 'Alice', token: 'TTT-A', amount: bad }), refused, `mint ${bad}`);
  }
  assert.equal(c.model.pending as unknown, null);
  assert.deepEqual(t.writes, []);
  c.prepareObligation({ debtor: 'Alice', creditor: 'Bob', amount: '  42 ', key: 'k' });
  assert.deepEqual(c.model.pending?.call.args[1], { t: 'obligation', v: { id: c.model.pending?.call.args[1] && (c.model.pending.call.args[1] as { v: { id: string } }).v.id, debtor: A, creditor: B, amount: '42' } });
  assert.throws(() => c.prepareObligation({ debtor: 'Alice', creditor: 'Alice', amount: '5', key: 'k' }), refused, 'same debtor and creditor is refused before sending');
  assert.throws(() => c.prepareObligation({ debtor: 'Alice', creditor: 'Nobody', amount: '5', key: 'k' }), refused);
});
