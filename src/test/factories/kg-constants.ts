import { randomUUID } from 'node:crypto';

import { UuidSchema } from '@/common/schemas';
import { Episode, EpisodeSchema } from '@/knowledge-graph/episode';
import { EpisodeType, GroupIdSchema } from '@/knowledge-graph/neo4j/types';

export const KG_TEST_GROUP_ID = GroupIdSchema.parse('test-group');
export const KG_TEST_USER_ID = UuidSchema.parse('00000000-0000-4000-8000-000000000042');
export const KG_REFERENCE_TIME = new Date('2024-01-01T00:00:00.000Z');

export const KG_HIGH_SIM_EMBEDDING = [1, 0, 0];
export const KG_DIFF_EMBEDDING = [0, 1, 0];
export const KG_NEAR_SAME_EMBEDDING = [0.9999, 0.001, 0];

export const KG_TEST_UUID_CURSOR = UuidSchema.parse(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
);
export const KG_TEST_SAGA_UUID = UuidSchema.parse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

/** Helper for tests that need a fresh branded UUID. */
export const kgUuid = () => UuidSchema.parse(randomUUID());

export function makeEpisode(name: string): Episode {
  return EpisodeSchema.parse({
    name: name,
    content: `Content: ${name}`,
    source: EpisodeType.text,
    sourceDescription: 'test',
    referenceTime: KG_REFERENCE_TIME,
    groupId: KG_TEST_GROUP_ID,
  });
}
