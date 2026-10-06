// Prints the index cursor and token count: npx tsx --env-file=.env.local scripts/stats.ts
import { getStore } from '../lib/store.js'
console.log(await getStore().stats())
