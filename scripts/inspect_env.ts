import { TetrioApi } from '../src/net/api.js';
const api = new TetrioApi();
const env = await api.getEnvironment();
console.log(JSON.stringify(env, null, 1).slice(0, 2500));
