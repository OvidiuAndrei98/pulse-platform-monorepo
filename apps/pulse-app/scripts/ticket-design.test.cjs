const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const design = require('../../../api/internal/email/ticket-design.json');
const source = fs.readFileSync(path.join(__dirname,'../src/components/tickets/ticketDesign.ts'),'utf8');
const exportsUnderTest = {};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports:exportsUnderTest,require:()=>design});
const { renderTicketPass, formatTicketDate } = exportsUnderTest;
const ticket = {id:'ticket-1',eventTitle:'Night <script>alert(1)</script> {{id}}',ticketTypeName:'VIP "test"',locationName:'A&B',startTime:'2026-09-29T18:30:00Z',validationHash:'private-hash'};

test('the shared card escapes user text once and never prints the access hash',()=>{
  const result = renderTicketPass(ticket,'data:image/png;base64,YQ==',key=>key);
  assert.ok(result.includes('Night &lt;script&gt;alert(1)&lt;/script&gt; {{id}}'));
  assert.ok(result.includes('A&amp;B'));
  assert.ok(result.includes('VIP &quot;test&quot;'));
  assert.ok(result.includes('ticket-1'));
  assert.ok(!result.includes('private-hash'));
  assert.ok(!result.includes('<script>'));
});
test('only generated PNG data is accepted as a QR image',()=>{
  for (const image of ['javascript:alert(1)','https://example.com/tracker','data:image/svg+xml,<svg onload="bad"/>']) {
    assert.throws(()=>renderTicketPass(ticket,image,key=>key),/INVALID_TICKET_QR_IMAGE/);
  }
});
test('ticket dates match email in Bucharest time, including DST and invalid dates',()=>{
  assert.equal(formatTicketDate('2026-09-29T18:30:00Z','Unknown'),'29.09.2026 · 21:30');
  assert.equal(formatTicketDate('2026-12-01T18:30:00Z','Unknown'),'01.12.2026 · 20:30');
  assert.equal(formatTicketDate('','Unknown'),'Unknown');
});
