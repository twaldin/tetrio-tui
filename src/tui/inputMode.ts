/**
 * Input mode singleton — whether the terminal speaks the kitty keyboard protocol
 * (real key release events). Set by the driver at runtime; read by screens.
 *
 * When active: keydown/keyup are exact (DAS/ARR feel = engine config, period).
 * When inactive (legacy terminals): hold keys rely on OS key-repeat refresh with
 * an idle-timeout release — the initial DAS window can be cut by slow OS repeat.
 */

let _kitty = false;

export function setKittyKeyboard(v: boolean): void { _kitty = v; }
export function kittyKeyboard(): boolean { return _kitty; }
