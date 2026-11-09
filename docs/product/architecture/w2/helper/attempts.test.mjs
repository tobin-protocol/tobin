import test from 'node:test';
import assert from 'node:assert/strict';
const b = 'http://127.0.0.1:8799';
const prep = (op) => fetch(b + '/api/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op }) });
test('preparation attempts are limited to three per operation; read_session is not counted', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await prep('join_C')).status, 200);
  assert.equal((await prep('join_C')).status, 429);
  assert.equal((await prep('create')).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await prep('read_session')).status, 200);
});
