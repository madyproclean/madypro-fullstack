import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { RecordInvoicePaymentDto } from './dto/record-invoice-payment.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(@Query('siteId') siteId?: string) {
    return this.invoicesService.findAll(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.invoicesService.buildPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${id}.pdf"`);
    res.send(buffer);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto, @Req() req: any) {
    return this.invoicesService.create(dto, req.user.sub);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @Req() req: any) {
    return this.invoicesService.send(id, req.user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @Req() req: any) {
    return this.invoicesService.update(id, dto, req.user.sub);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateInvoiceStatusDto, @Req() req: any) {
    return this.invoicesService.setStatus(id, dto.status, req.user.sub);
  }

  @Patch(':id/payment')
  recordPayment(@Param('id') id: string, @Body() dto: RecordInvoicePaymentDto, @Req() req: any) {
    return this.invoicesService.recordPayment(id, dto, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.invoicesService.remove(id, req.user.sub);
  }
}
