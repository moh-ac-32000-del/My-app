export function matchesPushScope(data: Record<string, unknown>, scope: { uid: string | null; spaceId: string | null; storeId: string }) {
  return Boolean(scope.uid && scope.spaceId && scope.storeId && data.uid === scope.uid
    && data.spaceId === scope.spaceId && data.storeId === scope.storeId && data.route === '/notifications');
}
