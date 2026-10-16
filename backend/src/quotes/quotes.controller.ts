import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { QuotesService } from './quotes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  findAll(@Query('siteId') siteId?: string) {
    return this.quotesService.findAll(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotesService.findOne(id);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.quotesService.buildPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${id}.pdf"`);
    res.send(buffer);
  }

  @Post()
  create(@Body() dto: CreateQuoteDto, @Req() req: any) {
    return this.quotesService.create(dto, req.user.sub);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @Req() req: any) {
    return this.quotesService.send(id, req.user.sub);
  }

  @Post(':id/convert-to-invoice')
  convertToInvoice(@Param('id') id: string, @Req() req: any) {
    return this.quotesService.convertToInvoice(id, req.user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuoteDto, @Req() req: any) {
    return this.quotesService.update(id, dto, req.user.sub);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateQuoteStatusDto, @Req() req: any) {
    return this.quotesService.setStatus(id, dto.status, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.quotesService.remove(id, req.user.sub);
  }
}
