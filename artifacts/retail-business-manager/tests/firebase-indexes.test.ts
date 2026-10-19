import { describe, expect, it } from 'vitest';
import config from '../firebase.json';
import indexes from '../firestore.indexes.json';

describe('daily closing Firestore index deployment', () => {
  it('bounds invitation scans to live pending workspace invitations',()=>{
    expect(indexes.indexes).toContainEqual({collectionGroup:'spaceInvitations',queryScope:'COLLECTION',fields:[
      {fieldPath:'spaceId',order:'ASCENDING'},{fieldPath:'status',order:'ASCENDING'},{fieldPath:'expiresAt',order:'ASCENDING'},
    ]});
  });
  it('connects the existing index manifest to the Firebase deployment', () => {
    expect(config.firestore.indexes).toBe('firestore.indexes.json');
  });

  it.each([
    ['transactions', 'createdAt'],
    ['debts', 'createdAt'],
    ['payments', 'paidAt'],
    ['dailyArchives', 'date'],
  ])('includes the store-scoped %s closing query index', (collectionGroup, dateField) => {
    expect(indexes.indexes).toContainEqual({
      collectionGroup,
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'storeId', order: 'ASCENDING' },
        { fieldPath: dateField, order: 'ASCENDING' },
      ],
    });
  });
});
