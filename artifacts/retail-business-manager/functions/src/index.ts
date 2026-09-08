import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { bootstrapPrimarySpaceHandler, createDefaultBootstrapRuntime } from './bootstrapPrimarySpace.js';

initializeApp();

const firestore = getFirestore();
const runtime = createDefaultBootstrapRuntime(firestore);

export const bootstrapPrimarySpace = onCall({ invoker: 'public' }, async (request) => (
  bootstrapPrimarySpaceHandler(request, runtime)
));