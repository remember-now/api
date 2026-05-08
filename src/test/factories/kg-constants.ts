import { randomUUID } from 'node:crypto';

import {
  GroupIdSchema,
  UuidSchema,
} from '@/knowledge-graph/neo4j/neo4j.schemas';

export const KG_TEST_GROUP_ID = GroupIdSchema.parse('test-group');
export const KG_TEST_USER_ID = 42;
export const KG_REFERENCE_TIME = new Date('2024-01-01T00:00:00.000Z');

export const KG_HIGH_SIM_EMBEDDING = [1, 0, 0];
export const KG_DIFF_EMBEDDING = [0, 1, 0];
export const KG_NEAR_SAME_EMBEDDING = [0.9999, 0.001, 0];

export const KG_TEST_UUID_CURSOR = UuidSchema.parse(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
);
export const KG_TEST_SAGA_UUID = UuidSchema.parse(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
);

/** Helper for tests that need a fresh branded UUID. */
export const kgUuid = () => UuidSchema.parse(randomUUID());
