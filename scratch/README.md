# scratch/ — NetCodec reverse-engineering tooling (dev only, not shipped)

- `deobf.mjs` — evaluates the obfuscated `static init()` bodies from
  `docs/captures/netcodec_deobfuscated.js` / `netcodec2_deobfuscated.js`
  (string-array rotation 263 + RC4 decoder reimplemented) with recording
  stubs to dump the REAL struct/table schemas (je/qe field lists, all enum
  tables). Output: `deobf_out.json`. This is how every enum table in
  `src/net/structures.ts` was confirmed.
- `validate.ts` — quick capture decoder smoke run.
