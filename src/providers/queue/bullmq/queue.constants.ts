// Central registry of BullMQ queue names. Per-queue modules derive their queue
// constant from these members so the name lives in exactly one place.
export enum QueueNames {
  CommunityUpdate = 'community-update',
  CommunityRebuild = 'community-rebuild',
}
