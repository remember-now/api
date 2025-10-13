import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Delete,
  Res,
  UseGuards,
  Logger,
  Param,
  Query,
} from '@nestjs/common';
import { Response } from 'express';

import { AgentService } from './agent.service';
import {
  ChatRequestDto,
  CreateMemoryBlockDto,
  UpdateMemoryBlockDto,
  GetMemoryBlockParamsDto,
  GetMessagesQueryDto,
} from './dto';
import { LoggedInGuard } from 'src/auth/guard';
import { GetUser } from 'src/auth/decorator';

@Controller('agent')
@UseGuards(LoggedInGuard)
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agentService: AgentService) {}

  @Get()
  getAgentInfo(@GetUser('id') userId: number) {
    return this.agentService.getAgentInfo(userId);
  }

  @Get('messages')
  getMessages(
    @GetUser('id') userId: number,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.agentService.getMessages(query, userId);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  sendMessage(@Body() dto: ChatRequestDto, @GetUser('id') userId: number) {
    return this.agentService.sendMessage(dto, userId);
  }

  @Post('chat/stream')
  @HttpCode(HttpStatus.OK)
  async sendMessageStream(
    @Body() dto: ChatRequestDto,
    @Res() res: Response,
    @GetUser('id') userId: number,
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    try {
      const stream = await this.agentService.sendMessageStream(dto, userId);

      for await (const chunk of stream) {
        switch (chunk.messageType) {
          case 'assistant_message':
            if (chunk.content) {
              const content =
                typeof chunk.content === 'string' ? chunk.content : '';
              res.write(content);
            }
            break;
          case 'reasoning_message':
            if (chunk.reasoning) {
              this.logger.debug(`Agent reasoning: ${chunk.reasoning}`);
            }
            break;
          case 'usage_statistics':
            this.logger.log(`Usage: ${JSON.stringify(chunk)}`);
            break;
        }
      }
      res.end();
    } catch (error) {
      this.logger.error('Streaming failed', error);
      res.status(500).json({ error: 'Streaming failed' });
    }
  }

  @Get('blocks')
  listMemoryBlocks(@GetUser('id') userId: number) {
    return this.agentService.listMemoryBlocks(userId);
  }

  @Get('blocks/:blockLabel')
  getMemoryBlock(
    @Param() params: GetMemoryBlockParamsDto,
    @GetUser('id') userId: number,
  ) {
    return this.agentService.getMemoryBlock(userId, params.blockLabel);
  }

  @Post('blocks')
  createMemoryBlock(
    @Body() dto: CreateMemoryBlockDto,
    @GetUser('id') userId: number,
  ) {
    return this.agentService.createMemoryBlock(userId, dto);
  }

  @Put('blocks/:blockLabel')
  updateMemoryBlock(
    @Param() params: GetMemoryBlockParamsDto,
    @Body() dto: UpdateMemoryBlockDto,
    @GetUser('id') userId: number,
  ) {
    return this.agentService.updateMemoryBlock(userId, params.blockLabel, dto);
  }

  @Delete('blocks/:blockLabel')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMemoryBlock(
    @Param() params: GetMemoryBlockParamsDto,
    @GetUser('id') userId: number,
  ) {
    return this.agentService.deleteMemoryBlock(userId, params.blockLabel);
  }
}
