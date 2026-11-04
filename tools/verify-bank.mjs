#!/usr/bin/env node
// Reconcile a bank statement against what the importer makes of it.
//
//   node tools/verify-bank.mjs <file.xlsx|xls|csv> [...]
//
// Reads the sheet twice: once as raw cells straight off the file, once through the importer,
// and checks that every transaction survived with the same numbers. Then prints the group
// totals, because a wrong *label* loses no data and so passes every row-level check — that is
// exactly how «حواله ... و کارمزد» sat in the fee group with 11.9 billion rials in it.
//
// Nothing is written and no file is modified.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readWorkbook, SheetError } from '../src/js/bank/sheet-read.js';
import { parseStatement, findHeaderRow, mapColumns } from '../src/js/bank/bank-table.js';
import { parseAmount, parseBankDate, cleanText } from '../src/js/bank/normalize.js';
import { groupTotals, GROUPS } from '../src/js/bank/kinds.js';
import { faAmount } from '../src/js/bank/normalize.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/verify-bank.mjs <statement> [...]');
  process.exit(2);
}

const money = (n) => faAmount(n, { digits: 'latin' }).padStart(16);
let problems = 0;

for (const file of files) {
  const label = path.basename(file);
  console.log('\n' + '═'.repeat(78));
  console.log(label);

  let wb;
  try {
    wb = readWorkbook(new Uint8Array(readFileSync(file)), file);
  } catch (e) {
    console.log('  ✖ unreadable:', e instanceof SheetError ? e.message : e.message);
    problems++;
    continue;
  }
  const rows = wb.sheets[0].rows;
  const st = parseStatement(rows);
  if (!st.ok) {
    console.log('  ✖ no statement table found');
    problems++;
    continue;
  }

  // ---- 1. every money row in the file is in the report, unchanged ----
  const header = findHeaderRow(rows);
  const { map } = mapColumns(rows[header.index] || []);
  const at = (row, field) => (map[field] === undefined ? null : row[map[field]]);
  const keyOf = (d, t, dep, wit, bal) => [d, t, dep, wit, bal].join('|');

  const source = new Map();
  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const date = parseBankDate(at(row, 'date'));
    const dep = parseAmount(at(row, 'deposit')) || 0;
    const wit = parseAmount(at(row, 'withdraw')) || 0;
    const bal = parseAmount(at(row, 'balance'));
    if (!date && !dep && !wit) continue; // not a transaction line
    if (!dep && !wit && bal === 0) continue; // the placeholder line the importer drops
    if (/جمع|مجموع|total/i.test(cleanText(at(row, 'desc')) + cleanText(row[0]) + cleanText(row[1]))) continue;
    const k = keyOf(date?.text ?? '', cleanText(at(row, 'time')), dep, wit, bal);
    source.set(k, (source.get(k) || 0) + 1);
  }

  const got = new Map();
  for (const r of st.records) {
    const k = keyOf(r.date?.text ?? '', r.time, r.deposit, r.withdraw, r.balance);
    got.set(k, (got.get(k) || 0) + 1);
  }

  const missing = [];
  const extra = [];
  for (const [k, n] of source) if ((got.get(k) || 0) !== n) missing.push(`${k}  (file ×${n}, report ×${got.get(k) || 0})`);
  for (const [k, n] of got) if (!source.has(k)) extra.push(`${k} ×${n}`);

  const srcTotal = [...source.entries()].reduce((s, [k, n]) => s + n, 0);
  console.log(`  rows: file ${srcTotal}  ·  report ${st.records.length}`);
  if (missing.length || extra.length) {
    problems++;
    console.log(`  ✖ ${missing.length} row(s) changed or lost, ${extra.length} invented`);
    [...missing.slice(0, 5), ...extra.slice(0, 5)].forEach((m) => console.log('      ' + m));
  } else {
    console.log('  ✔ every transaction survived with the same date, time and amounts');
  }

  // ---- 2. the running balance reconciles ----
  let breaks = 0;
  for (let i = 1; i < st.records.length; i++) {
    const a = st.records[i - 1];
    const b = st.records[i];
    if (a.balance === null || b.balance === null) continue;
    if (Math.abs(a.balance + b.deposit - b.withdraw - b.balance) > 0.5) breaks++;
  }
  console.log(`  ${breaks ? '✖' : '✔'} running balance: ${breaks} break(s) in ${Math.max(0, st.records.length - 1)}`);
  if (breaks) problems++;

  // ---- 3. the labels, which no row-level check can catch ----
  const totals = groupTotals(st.records);
  const moved = st.records.reduce((s, r) => s + r.deposit + r.withdraw, 0);
  console.log('  groups:');
  for (const [g, t] of [...totals].sort((a, b) => Math.max(b[1].in, b[1].out) - Math.max(a[1].in, a[1].out))) {
    console.log(`    ${GROUPS[g].label.padEnd(14)} ${String(t.count).padStart(4)}   +${money(t.in)}  -${money(t.out)}`);
  }
  const fee = totals.get('fee');
  const feeShare = fee && moved ? (fee.in + fee.out) / moved : 0;
  if (feeShare > 0.02) {
    problems++;
    console.log(`  ✖ fees are ${(feeShare * 100).toFixed(1)}% of everything that moved — bank fees are tiny, so a`);
    console.log('      transfer is almost certainly sitting in the fee group (check «… و کارمزد» labels)');
  } else {
    console.log(`  ✔ fees are ${(feeShare * 100).toFixed(3)}% of all movement, which is the right order of magnitude`);
  }
}

console.log('\n' + (problems ? `✖ ${problems} problem(s)` : '✔ all files reconcile'));
process.exit(problems ? 1 : 0);
