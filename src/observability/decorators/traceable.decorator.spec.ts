/**
 * Ported from `nestjs-otel` on 2026-05-16
 * (https://github.com/pragmaticivan/nestjs-otel - Apache 2.0). The
 * `asLangfuseTrace` case is a local addition; everything else is verbatim
 * apart from style adjustments for this repo.
 */
import { SetMetadata } from '@nestjs/common';
import { SpanKind } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import 'reflect-metadata';

import { Traceable } from './traceable.decorator';

const TestDecoratorThatSetsMetadata = (): MethodDecorator =>
  SetMetadata('some-metadata', true);

@Traceable()
class TestTraceable {
  methodOne() {}

  methodTwo() {
    return this.methodOne();
  }

  @TestDecoratorThatSetsMetadata()
  methodWithMetadata() {}

  async asyncMethod() {
    return new Promise((resolve) => setTimeout(resolve, 10));
  }
}

@Traceable({ kind: SpanKind.PRODUCER })
class TestTraceableWithOptions {
  methodOne() {}
}

@Traceable({ asLangfuseTrace: true })
class TestTraceableAsLangfuseTrace {
  methodOne() {}
  methodTwo() {}
}

describe('Traceable', () => {
  let instance: TestTraceable;
  let instanceWithOptions: TestTraceableWithOptions;
  let instanceAsLangfuseTrace: TestTraceableAsLangfuseTrace;
  let traceExporter: InMemorySpanExporter;
  let spanProcessor: SimpleSpanProcessor;
  let provider: NodeTracerProvider;

  beforeAll(() => {
    instance = new TestTraceable();
    instanceWithOptions = new TestTraceableWithOptions();
    instanceAsLangfuseTrace = new TestTraceableAsLangfuseTrace();
    traceExporter = new InMemorySpanExporter();
    spanProcessor = new SimpleSpanProcessor(traceExporter);
    provider = new NodeTracerProvider({
      spanProcessors: [spanProcessor],
    });
    provider.register();
  });

  afterEach(async () => {
    await spanProcessor.forceFlush();
    traceExporter.reset();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  it('should trace all methods in the class', () => {
    instance.methodOne();
    const spans = traceExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toEqual('TestTraceable.methodOne');
  });

  it('should trace nested calls within the class', () => {
    instance.methodTwo();
    const spans = traceExporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.name)).toEqual([
      'TestTraceable.methodOne',
      'TestTraceable.methodTwo',
    ]);
  });

  it('should maintain reflect metadata', () => {
    expect(Reflect.getMetadata('some-metadata', instance.methodWithMetadata)).toEqual(
      true,
    );
  });

  it('should apply options to all methods', () => {
    instanceWithOptions.methodOne();
    const spans = traceExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toEqual('TestTraceableWithOptions.methodOne');
    expect(spans[0].kind).toEqual(SpanKind.PRODUCER);
  });

  it('should preserve the original method name', () => {
    expect(instance.methodOne.name).toEqual('methodOne');
  });

  it('should trace async methods', async () => {
    await instance.asyncMethod();
    const spans = traceExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toEqual('TestTraceable.asyncMethod');
  });

  it('propagates asLangfuseTrace to every method', () => {
    instanceAsLangfuseTrace.methodOne();
    instanceAsLangfuseTrace.methodTwo();
    const spans = traceExporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    expect(spans[0].attributes['langfuse.trace.name']).toBe(
      'TestTraceableAsLangfuseTrace.methodOne',
    );
    expect(spans[1].attributes['langfuse.trace.name']).toBe(
      'TestTraceableAsLangfuseTrace.methodTwo',
    );
  });
});
