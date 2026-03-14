import { randomUUID } from 'node:crypto';

import { createNodeDefaults, EpisodeType, NodeBaseSchema } from './node.types';

describe('node.types', () => {
  describe('createNodeDefaults', () => {
    it('should create defaults with a valid uuid', () => {
      const defaults = createNodeDefaults();
      expect(defaults.uuid).toBeDefined();
      expect(defaults.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should create defaults with empty name and groupId', () => {
      const defaults = createNodeDefaults();
      expect(defaults.name).toBe('');
      expect(defaults.groupId).toBe('');
    });

    it('should create defaults with a Date for createdAt', () => {
      const defaults = createNodeDefaults();
      expect(defaults.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('NodeBaseSchema', () => {
    it('should accept a valid node base', () => {
      const node = {
        uuid: randomUUID(),
        name: 'Test',
        groupId: 'group-1',
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).not.toThrow();
    });

    it('should reject empty name', () => {
      const node = {
        uuid: randomUUID(),
        name: '',
        groupId: 'group-1',
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).toThrow();
    });

    it('should reject invalid uuid', () => {
      const node = {
        uuid: 'not-a-uuid',
        name: 'Test',
        groupId: 'group-1',
        createdAt: new Date(),
      };
      expect(() => NodeBaseSchema.parse(node)).toThrow();
    });
  });

  describe('EpisodeType', () => {
    it('should have message, json, and text values', () => {
      expect(EpisodeType.message).toBe('message');
      expect(EpisodeType.json).toBe('json');
      expect(EpisodeType.text).toBe('text');
    });
  });
});
