import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { createMock } from '@golevelup/ts-jest';

describe('AgentService', () => {
  let service: AgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentService],
    })
      .useMocker(createMock)
      .compile();

    service = module.get<AgentService>(AgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
