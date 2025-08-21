import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from './agent.controller';
import { createMock } from '@golevelup/ts-jest';

describe('AgentController', () => {
  let controller: AgentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
    })
      .useMocker(createMock)
      .compile();

    controller = module.get<AgentController>(AgentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
