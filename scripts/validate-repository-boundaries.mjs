import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const schedulerStore = read('src/hooks/useSchedulerStore.js');

assert(!schedulerStore.includes('../firebase/'), 'useSchedulerStore.js must not import Firebase services directly.');
assert(!schedulerStore.includes('firebase/firestore'), 'useSchedulerStore.js must not import firebase/firestore.');
assert(!schedulerStore.includes('firebase/auth'), 'useSchedulerStore.js must not import firebase/auth.');
assert(schedulerStore.includes("from '../repositories'"), 'useSchedulerStore.js must import neutral repositories.');

console.log('Repository boundary checks passed');
