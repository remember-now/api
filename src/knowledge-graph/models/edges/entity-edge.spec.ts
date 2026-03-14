import { randomUUID } from 'node:crypto';

import { createEntityEdge, EntityEdgeSchema } from './entity-edge';

describe('EntityEdge', () => {
  const sourceNodeUuid = randomUUID();
  const targetNodeUuid = randomUUID();

  describe('createEntityEdge', () => {
    it('should create with correct defaults', () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(edge.name).toBe('KNOWS');
      expect(edge.sourceNodeUuid).toBe(sourceNodeUuid);
      expect(edge.targetNodeUuid).toBe(targetNodeUuid);
      expect(edge.fact).toBe('');
      expect(edge.factEmbedding).toBeNull();
      expect(edge.episodes).toEqual([]);
      expect(edge.expiredAt).toBeNull();
      expect(edge.validAt).toBeNull();
      expect(edge.invalidAt).toBeNull();
      expect(edge.attributes).toEqual({});
      expect(edge.uuid).toBeDefined();
      expect(edge.createdAt).toBeInstanceOf(Date);
    });

    it('should allow overriding fact', () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
        fact: 'Person A knows Person B',
      });
      expect(edge.fact).toBe('Person A knows Person B');
    });

    it('should allow setting factEmbedding', () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
        factEmbedding: [0.1, 0.2, 0.3],
      });
      expect(edge.factEmbedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should allow setting dates', () => {
      const date = new Date('2024-01-01');
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
        validAt: date,
        expiredAt: date,
        invalidAt: date,
      });
      expect(edge.validAt).toBe(date);
      expect(edge.expiredAt).toBe(date);
      expect(edge.invalidAt).toBe(date);
    });
  });

  describe('EntityEdgeSchema', () => {
    it('should accept valid entity edge', () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => EntityEdgeSchema.parse(edge)).not.toThrow();
    });

    it('should reject empty name', () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
      });
      expect(() => EntityEdgeSchema.parse({ ...edge, name: '' })).toThrow();
    });

    it('should accept null dates', () => {
      const edge = createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid,
        targetNodeUuid,
        validAt: null,
        expiredAt: null,
        invalidAt: null,
      });
      expect(() => EntityEdgeSchema.parse(edge)).not.toThrow();
    });
  });
});
