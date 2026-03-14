import { randomUUID } from 'node:crypto';

import { createEdgeDefaults, EdgeBaseSchema } from './edge.types';

describe('edge.types', () => {
  describe('createEdgeDefaults', () => {
    it('should create defaults with a valid uuid', () => {
      const defaults = createEdgeDefaults();
      expect(defaults.uuid).toBeDefined();
      expect(defaults.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should create defaults with empty groupId and node uuids', () => {
      const defaults = createEdgeDefaults();
      expect(defaults.groupId).toBe('');
      expect(defaults.sourceNodeUuid).toBe('');
      expect(defaults.targetNodeUuid).toBe('');
    });

    it('should create defaults with a Date for createdAt', () => {
      const defaults = createEdgeDefaults();
      expect(defaults.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('EdgeBaseSchema', () => {
    it('should accept a valid edge base', () => {
      const edge = {
        uuid: randomUUID(),
        groupId: 'group-1',
        sourceNodeUuid: randomUUID(),
        targetNodeUuid: randomUUID(),
        createdAt: new Date(),
      };
      expect(() => EdgeBaseSchema.parse(edge)).not.toThrow();
    });

    it('should reject invalid source uuid', () => {
      const edge = {
        uuid: randomUUID(),
        groupId: 'group-1',
        sourceNodeUuid: 'not-a-uuid',
        targetNodeUuid: randomUUID(),
        createdAt: new Date(),
      };
      expect(() => EdgeBaseSchema.parse(edge)).toThrow();
    });

    it('should reject invalid target uuid', () => {
      const edge = {
        uuid: randomUUID(),
        groupId: 'group-1',
        sourceNodeUuid: randomUUID(),
        targetNodeUuid: 'not-a-uuid',
        createdAt: new Date(),
      };
      expect(() => EdgeBaseSchema.parse(edge)).toThrow();
    });
  });
});
