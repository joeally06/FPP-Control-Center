import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { migrateDatabase } from './database-migrations';
import { replaceFppModels, ModelImportError, type ModelImportRow } from '../lib/model-import';

function print(msg: string) {
  console.log('[test-model-import] ' + msg);
}

const tmp = path.resolve('tmp');
fs.mkdirSync(tmp, { recursive: true });
const dir = fs.mkdtempSync(path.join(tmp, 'test-model-import-'));
const db = new Database(path.join(dir, 'test.db'));
migrateDatabase(db);

const names = () => (db.prepare('SELECT model_name FROM fpp_models ORDER BY id').all() as { model_name: string }[]).map((r) => r.model_name);
const row = (rowNumber: number, values: Record<string, unknown>): ModelImportRow => ({ rowNumber, values });

db.prepare("INSERT INTO fpp_models (model_name) VALUES ('Old roof'), ('Old tree')").run();

print('Test 1: good rows replace what was there');
const result = replaceFppModels(db, [
  row(2, { 'Model Name': 'Mega tree', 'String Count': 16, 'Controller Name': 'F16V4' }),
  row(3, { 'Model Name': 'Arches', 'Channel Count': 300 }),
]);
assert.deepStrictEqual(result, { imported: 2 });
assert.deepStrictEqual(names(), ['Mega tree', 'Arches']);
const tree = db.prepare("SELECT string_count, controller_name FROM fpp_models WHERE model_name = 'Mega tree'").get() as { string_count: number; controller_name: string };
assert.deepStrictEqual(tree, { string_count: 16, controller_name: 'F16V4' }, 'columns are mapped from the sheet headers');

print('Test 2: one bad row cancels the import and the old models stay');
const before = names();
assert.throws(
  () => replaceFppModels(db, [
    row(2, { 'Model Name': 'Fine' }),
    row(3, { 'Model Name': 'Broken', 'Est Current (Amps)': { formula: 'A1*2', result: 4 } }), // an object cell can't be stored
    row(4, { 'Model Name': 'Also fine' }),
  ]),
  (error: unknown) => {
    assert.ok(error instanceof ModelImportError);
    assert.ok(error.problems.length === 1 && /^Row 3:/.test(error.problems[0]), `names the spreadsheet row: ${error.problems.join('; ')}`);
    assert.match(error.message, /existing models kept/i);
    return true;
  }
);
assert.deepStrictEqual(names(), before, 'nothing was deleted or added');

print('Test 3: a sheet with no Model Name column is rejected before anything is deleted');
assert.throws(
  () => replaceFppModels(db, [row(2, { 'Display As': 'x' }), row(3, { Description: 'y' })]),
  (error: unknown) => error instanceof ModelImportError && /Model Name/.test(error.message)
);
assert.deepStrictEqual(names(), before);

print('Test 4: a row with a blank name keeps today\'s "Unknown" name');
replaceFppModels(db, [row(2, { 'Model Name': 'Real' }), row(3, { 'Display As': 'Nameless' })]);
assert.deepStrictEqual(names(), ['Real', 'Unknown']);

print('Test 5: several bad rows are all reported, in order, and capped');
const many = Array.from({ length: 12 }, (_, i) => row(i + 2, { 'Model Name': `M${i}`, 'Light Count': { bad: true } }));
assert.throws(
  () => replaceFppModels(db, many),
  (error: unknown) => {
    assert.ok(error instanceof ModelImportError);
    assert.ok(error.problems[0].startsWith('Row 2:') && error.problems[1].startsWith('Row 3:'));
    assert.ok(error.problems.length <= 5, 'only the first few are shown');
    return true;
  }
);
assert.deepStrictEqual(names(), ['Real', 'Unknown']);

print('Test 6: the route uses the helper instead of deleting first');
const route = fs.readFileSync(path.join(process.cwd(), 'app', 'api', 'models', 'import', 'route.ts'), 'utf-8');
assert.ok(route.includes('replaceFppModels('), 'the route calls replaceFppModels');
assert.ok(!route.includes('DELETE FROM fpp_models'), 'the route no longer deletes on its own');

db.close();
print('All tests passed');
