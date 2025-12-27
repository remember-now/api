import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { GetUser } from '@/auth/decorator';
import { LoggedInGuard } from '@/auth/guard';

import { ChatRequestDto, GetMessagesQueryDto } from './dto';
import { MessagesService } from './messages.service';

@ApiTags('Messages')
@Controller('messages')
@UseGuards(LoggedInGuard)
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(private readonly messagesService: MessagesService) {}

  @Get('history')
  @ApiOperation({ summary: 'Get message history' })
  getMessages(
    @GetUser('id') userId: number,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.messagesService.getMessages(query, userId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a message to the agent' })
  sendMessage(@Body() dto: ChatRequestDto, @GetUser('id') userId: number) {
    return this.messagesService.sendMessage(dto, userId);
  }

  @Post('stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a message and stream the response' })
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
      const stream = await this.messagesService.sendMessageStream(dto, userId);

      for await (const chunk of stream) {
        switch (chunk.message_type) {
          case 'assistant_message':
            if ('content' in chunk && chunk.content) {
              const content =
                typeof chunk.content === 'string' ? chunk.content : '';
              res.write(content);
            }
            break;
          case 'reasoning_message':
            if ('reasoning' in chunk && chunk.reasoning) {
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
}
