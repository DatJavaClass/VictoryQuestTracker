/* Shared constants, settings access, legacy journal import. */
export const MODULE_ID = 'victory-quest-tracker';
export const L = (k) => game.i18n.localize(`VQT.${k}`);
export const STATUS = { green: { color: '#66ff66', live: true }, yellow: { color: '#ffcc33', live: true }, orange: { color: '#ff9933', live: true }, gold: { color: '#66ff66' }, red: { color: '#ff6666' } }; /* gold draws as a green star */
export const LIVE = Object.keys(STATUS).filter((k) => STATUS[k].live), DONE = ['gold', 'red'], TABS = [...LIVE, 'all', 'done'], TYPES = ['story', 'interlude', 'objective'];

export const quests = () => foundry.utils.deepClone(game.settings.get(MODULE_ID, 'quests'));
export const save = (list) => game.settings.set(MODULE_ID, 'quests', list);
export const gated = (user = game.user) => user.isGM || !game.settings.get(MODULE_ID, 'gate') || !!user.character?.items.some((i) => i.name === game.settings.get(MODULE_ID, 'gateItem'));
export const blank = (status = 'green') => ({ id: foundry.utils.randomID(8), name: '', note: '', type: 'story', status, created: Date.now() });
export const clean = (q) => ({ ...q, name: String(q.name ?? '').trim().slice(0, 60), note: String(q.note ?? '').trim().slice(0, 256), type: TYPES.includes(q.type) ? q.type : 'story', status: STATUS[q.status] ? q.status : 'green' });

/* One write per mutation, edits in place. */
export async function mutate(fn) { const list = quests(); fn(list); await save(list); return list; }

/* Legacy "Color/Type/Name/Note/" lines. >> finished, [Failed] red. */
const LEGACY = /(red|yellow|green)\/(story|interlude|objective)\/([^\/\n\r]+)\/?([^\/\n\r]*)?/i, COLOR = { red: 'orange', yellow: 'yellow', green: 'green' };
export function parseLegacy(html) {
  const div = document.createElement('div'), out = [];
  div.innerHTML = html.replace(/<\/(p|h\d|li|div|br)>/gi, '\n');
  for (let line of div.textContent.split(/[\n\r]+/)) {
    line = line.trim();
    if (!line || /^(\/\/|\/\*|\*)/.test(line)) continue; /* guide block and parked lines */
    const done = line.startsWith('>>'), m = (done ? line.slice(2) : line).match(LEGACY);
    if (!m) continue;
    const failed = /^\s*\[failed\]/i.test(m[3]), name = m[3].replace(/^\s*\[failed\]\s*/i, '');
    out.push(clean({ ...blank(done ? (failed ? 'red' : 'gold') : COLOR[m[1].toLowerCase()]), name, note: m[4] ?? '', type: m[2].toLowerCase() }));
  }
  return out;
}

/* Import one journal page, skip names already tracked. */
export async function importJournal(uuid, pageName) {
  const journal = await fromUuid(uuid), page = journal?.pages?.find((p) => p.name === pageName) ?? journal?.pages?.contents[0];
  if (!page) throw new Error(`VQT: page "${pageName}" not found in ${uuid}`);
  const have = new Set(quests().map((q) => q.name.toLowerCase())), add = parseLegacy(page.text?.content ?? '').filter((q) => !have.has(q.name.toLowerCase()));
  if (add.length) await mutate((list) => list.push(...add));
  return add.length;
}
