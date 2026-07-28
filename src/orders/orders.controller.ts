import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  @Get()
  findAll(@Query() query: ListOrdersQueryDto) {
    return this.orders.findByEmail(query.email);
  }

  @Get('by-token/:token')
  async findByToken(@Param('token') token: string) {
    const order = await this.orders.findByToken(token);
    if (!order) {
      throw new NotFoundException(`No order found for payment token ${token}`);
    }
    return order;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Post(':id/checkout')
  checkout(@Param('id') id: string) {
    return this.orders.checkout(id);
  }

  @Post(':id/refresh-status')
  refreshStatus(@Param('id') id: string) {
    return this.orders.refreshStatus(id);
  }
}
