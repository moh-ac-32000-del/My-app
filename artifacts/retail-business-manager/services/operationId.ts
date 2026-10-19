import { collection, doc, getFirestore } from 'firebase/firestore';
import { getFirebaseApp } from '@/services/firebase';

/** Transport identity only. Constructing this SDK reference does not read or write Firestore. */
export function createOperationId(): string {
  return doc(collection(getFirestore(getFirebaseApp()), 'unused-id-generation')).id;
}
