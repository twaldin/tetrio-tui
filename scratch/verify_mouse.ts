
import { TerminalDriver } from '../src/tui/driver.js';
import type { KeyEvent, MouseEvent } from '../src/tui/app.js';

const d = new TerminalDriver();
const keys: KeyEvent[] = [];
const mice: MouseEvent[] = [];
d.onKey((ev) => keys.push(ev));
d.onMouse((ev) => mice.push(ev));
const parse = (s: string) => (d as any).parseInput(s);

// left press at col 10, row 5 (1-based) -> 0-based (9,4)
parse('\x1b[<0;10;5M');
// left release
parse('\x1b[<0;10;5m');
// right press
parse('\x1b[<2;3;2M');
// middle press
parse('\x1b[<1;3;2M');
// scroll up / down
parse('\x1b[<64;7;8M');
parse('\x1b[<65;7;8M');
// motion (any-event, no button) cb=35
parse('\x1b[<35;20;12M');
// drag with left held cb=32
parse('\x1b[<32;21;12M');
// keyboard still works interleaved with mouse in one chunk
parse('a\x1b[A\x1b[<0;1;1Mz');

console.log(JSON.stringify({ keys, mice }, null, 1));

const assert = (c: boolean, msg: string) => { if (!c) { console.error('FAIL: ' + msg); process.exit(1); } };
assert(mice.length === 9, `expected 9 mouse events, got ${mice.length}`);
assert(mice[8].action === 'down' && mice[8].button === 'left' && mice[8].x === 0 && mice[8].y === 0, 'interleaved click');
assert(mice[0].action === 'down' && mice[0].button === 'left' && mice[0].x === 9 && mice[0].y === 4, 'left press decode');
assert(mice[1].action === 'up' && mice[1].button === 'left', 'left release decode');
assert(mice[2].action === 'down' && mice[2].button === 'right', 'right press');
assert(mice[3].action === 'down' && mice[3].button === 'middle', 'middle press');
assert(mice[4].action === 'scroll-up' && mice[4].x === 6 && mice[4].y === 7, 'scroll up');
assert(mice[5].action === 'scroll-down', 'scroll down');
assert(mice[6].action === 'move' && mice[6].x === 19 && mice[6].y === 11, 'hover move');
assert(mice[7].action === 'move', 'drag move');
assert(keys.length === 3 && keys[0].key === 'a' && keys[1].key === 'up' && keys[2].key === 'z', 'keys interleaved: ' + JSON.stringify(keys));
console.log('ALL DRIVER ASSERTIONS PASSED');
