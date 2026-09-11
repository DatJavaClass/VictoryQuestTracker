/* Settings, button, keybinding, refresh, module API. */
import { MODULE_ID, L, STATUS, quests, mutate, blank, clean, gated, importJournal } from './store.js';
import { QuestTrackerApp } from './app.js';

let app = null;
const open = () => (app ??= new QuestTrackerApp()).render(true);
const close = () => app?.rendered && app.close();
const toggle = () => (app?.rendered ? close() : open());

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'quests', { scope: 'world', config: false, type: Array, default: [] });
  game.settings.register(MODULE_ID, 'legacy', { scope: 'world', config: false, type: String, default: '' });
  game.settings.register(MODULE_ID, 'gate', { name: 'VQT.Settings.Gate.Name', hint: 'VQT.Settings.Gate.Hint', scope: 'world', config: true, type: Boolean, default: true, onChange: () => ui.players.render() });
  game.settings.register(MODULE_ID, 'gateItem', { name: 'VQT.Settings.GateItem.Name', hint: 'VQT.Settings.GateItem.Hint', scope: 'world', config: true, type: String, default: 'Pocket Guide to Threshold', onChange: () => ui.players.render() });
  game.settings.register(MODULE_ID, 'autoOpen', { name: 'VQT.Settings.AutoOpen.Name', hint: 'VQT.Settings.AutoOpen.Hint', scope: 'client', config: true, type: Boolean, default: true });
  game.keybindings.register(MODULE_ID, 'toggle', { name: 'VQT.Toggle', editable: [], onDown: () => { if (gated()) toggle(); return true; } });
});

/* Quest Log button atop the player list. */
Hooks.on('renderPlayerList', (list, html) => {
  const el = html instanceof HTMLElement ? html : html[0]; /* v12 jQuery, v13 element */
  if (el.querySelector('.vqt-open') || !gated()) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'vqt-open'; b.innerHTML = `<i class="fas fa-scroll"></i> ${L('Open')}`;
  b.addEventListener('click', toggle);
  el.prepend(b);
});

/* Gate follows the item changing hands. */
const mine = (item) => !!item.parent && item.parent === game.user.character;
Hooks.on('createItem', (i) => mine(i) && ui.players.render());
Hooks.on('deleteItem', (i) => mine(i) && ui.players.render());

/* Setting change reaches every client; skip mid edit. */
Hooks.on('updateSetting', (s) => { if (s.key === `${MODULE_ID}.quests` && app?.rendered && !app.editing && !app.draft) app.render(); });

/* Module API. */
Hooks.once('ready', () => {
  if (!game.user.isGM && game.settings.get(MODULE_ID, 'autoOpen') && gated()) open();
  game.modules.get(MODULE_ID).api = { open, close, toggle, quests, STATUS, importJournal,
    add: (q) => mutate((l) => l.unshift(clean({ ...blank(), ...q }))),
    set: (id, patch) => mutate((l) => { const q = l.find((q) => q.id === id); if (q) Object.assign(q, clean({ ...q, ...patch })); }),
    remove: (id) => mutate((l) => l.findSplice((q) => q.id === id)) };
  Hooks.callAll('vqt.ready', game.modules.get(MODULE_ID).api);
});
