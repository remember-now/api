/**
 * Ported from `nestjs-otel` on 2026-05-16
 * (https://github.com/pragmaticivan/nestjs-otel - Apache 2.0). The
 * `asLangfuseTrace` option is a local extension, and the generic types were
 * tightened (`Constructor` / `AnyDescriptor` instead of `any`) to satisfy
 * `@typescript-eslint`'s no-unsafe-* rules without suppressions. Everything
 * else is verbatim apart from adapting imports.
 */
import type { ExtendedSpanOptions } from '../types';
import { Span } from './span.decorator';

type Constructor = new (...args: unknown[]) => unknown;

type AnyDescriptor = TypedPropertyDescriptor<(...args: unknown[]) => unknown>;

/**
 * Decorator that applies the @Span decorator to all methods of a class.
 *
 * @param options ExtendedSpanOptions to be applied to all methods
 */
export function Traceable(options?: ExtendedSpanOptions) {
  return (target: Constructor): void => {
    const prototype = target.prototype as Record<PropertyKey, unknown>;
    for (const propertyKey of Object.getOwnPropertyNames(prototype)) {
      if (propertyKey === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyKey);
      if (!descriptor || typeof descriptor.value !== 'function') continue;

      const typed = descriptor as AnyDescriptor;
      Span(options)(prototype, propertyKey, typed);
      Object.defineProperty(prototype, propertyKey, typed);
    }
  };
}
