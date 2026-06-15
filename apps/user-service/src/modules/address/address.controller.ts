import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { JwtAuthGuard, JwtUser, ResponseMessage } from '@cube/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users/addresses')
@UseGuards(JwtAuthGuard)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Addresses retrieved successfully')
  findAll(@CurrentUser() user: JwtUser) {
    return this.addressService.findAll(user.sub);
  }

  @Post()
  @Version('1')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Address created successfully')
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAddressDto) {
    return this.addressService.create(user.sub, dto);
  }

  @Patch(':id')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Address updated successfully')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Address deleted successfully')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.addressService.remove(user.sub, id);
  }
}
