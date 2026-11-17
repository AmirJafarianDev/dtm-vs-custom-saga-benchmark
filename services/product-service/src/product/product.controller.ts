import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { DeductStockDto, CompensateStockDto } from './dto/product.dto';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get product details, price, and current stock' })
  @ApiParam({ name: 'id', description: 'Product identifier', example: '1' })
  @ApiResponse({ status: 200, description: 'Product returned successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProduct(@Param('id') id: string) {
    return this.productService.getProduct(id);
  }

  @Post('deduct')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atomically deduct product stock for an order' })
  @ApiBody({ type: DeductStockDto })
  @ApiResponse({ status: 200, description: 'Stock deducted successfully' })
  @ApiResponse({ status: 409, description: 'Insufficient stock or conflict' })
  async deductStock(
    @Body() body: DeductStockDto,
    @Query() query: { orderId?: string; productId?: string; quantity?: string },
  ) {
    const orderId = body?.orderId || query?.orderId;
    const productId = body?.productId || query?.productId;
    const quantity = Number(body?.quantity ?? query?.quantity ?? 1);

    return this.productService.deductStock(orderId, productId, quantity);
  }

  @Post('compensate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compensate (restore) deducted product stock upon Saga rollback' })
  @ApiBody({ type: CompensateStockDto })
  @ApiResponse({ status: 200, description: 'Stock restored successfully' })
  async compensateStock(
    @Body() body: CompensateStockDto,
    @Query() query: { orderId?: string; productId?: string; quantity?: string },
  ) {
    const orderId = body?.orderId || query?.orderId;
    const productId = body?.productId || query?.productId;
    const quantity = Number(body?.quantity ?? query?.quantity ?? 1);

    return this.productService.compensateStock(orderId, productId, quantity);
  }
}
