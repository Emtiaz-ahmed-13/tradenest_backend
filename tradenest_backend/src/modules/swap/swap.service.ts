import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  ProductStatus,
  SwapRequestStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { ensureSeller } from '../../common/helpers/role-check.helper';
import { PrismaService } from '../../prisma/prisma.service';
import { CounterSwapOfferDto } from './dto/counter-swap-offer.dto';
import { CreateSwapRequestDto } from './dto/create-swap-request.dto';

@Injectable()
export class SwapService {
  private readonly swapInclude: Prisma.SwapRequestInclude = {
    initiator: { select: { id: true, name: true, email: true } },
    receiver: { select: { id: true, name: true, email: true } },
    product: {
      include: {
        images: {
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
        },
        seller: {
          select: {
            id: true,
            name: true,
            sellerProfile: { select: { shopName: true, slug: true } },
          },
        },
      },
    },
    offers: {
      include: {
        offerer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async createRequest(userId: string, dto: CreateSwapRequestDto) {
    await ensureSeller(this.prisma, userId);
    const requestedProduct = await this.ensureActiveProduct(dto.productId);

    if (requestedProduct.sellerId === userId) {
      throw new BadRequestException('You cannot swap for your own product');
    }

    if (!dto.offeredProductId && dto.cashAmount === undefined) {
      throw new BadRequestException(
        'Provide an offered product or a cash amount',
      );
    }

    if (dto.offeredProductId) {
      await this.ensureOwnedActiveProduct(userId, dto.offeredProductId);
    }

    const swapRequest = await this.prisma.$transaction(async (tx) => {
      const request = await tx.swapRequest.create({
        data: {
          initiatorId: userId,
          receiverId: requestedProduct.sellerId,
          productId: requestedProduct.id,
          message: dto.message,
        },
      });

      await tx.swapOffer.create({
        data: {
          swapRequestId: request.id,
          offererId: userId,
          productId: dto.offeredProductId,
          cashAmount: dto.cashAmount,
          message: dto.message,
        },
      });

      return tx.swapRequest.findUnique({
        where: { id: request.id },
        include: this.swapInclude,
      });
    });

    return {
      message: 'Swap request created',
      data: swapRequest,
    };
  }

  async listMine(userId: string) {
    const requests = await this.prisma.swapRequest.findMany({
      where: {
        OR: [{ initiatorId: userId }, { receiverId: userId }],
      },
      include: this.swapInclude,
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Swap requests retrieved',
      data: requests,
    };
  }

  async findOne(userId: string, swapRequestId: string) {
    const swapRequest = await this.getAccessibleRequest(userId, swapRequestId);

    return {
      message: 'Swap request retrieved',
      data: swapRequest,
    };
  }

  async counterOffer(
    userId: string,
    swapRequestId: string,
    dto: CounterSwapOfferDto,
  ) {
    await ensureSeller(this.prisma, userId);
    const swapRequest = await this.getAccessibleRequest(userId, swapRequestId);

    if (
      swapRequest.status !== SwapRequestStatus.PENDING &&
      swapRequest.status !== SwapRequestStatus.COUNTERED
    ) {
      throw new BadRequestException('Swap request cannot be countered');
    }

    if (!dto.productId && dto.cashAmount === undefined) {
      throw new BadRequestException('Provide a product or cash amount');
    }

    if (dto.productId) {
      await this.ensureOwnedActiveProduct(userId, dto.productId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.swapOffer.create({
        data: {
          swapRequestId,
          offererId: userId,
          productId: dto.productId,
          cashAmount: dto.cashAmount,
          message: dto.message,
        },
      });

      return tx.swapRequest.update({
        where: { id: swapRequestId },
        data: { status: SwapRequestStatus.COUNTERED },
        include: this.swapInclude,
      });
    });

    return {
      message: 'Swap counter offer created',
      data: updated,
    };
  }

  async acceptOffer(userId: string, swapRequestId: string, offerId: string) {
    const swapRequest = await this.getAccessibleRequest(userId, swapRequestId);

    if (
      swapRequest.status !== SwapRequestStatus.PENDING &&
      swapRequest.status !== SwapRequestStatus.COUNTERED
    ) {
      throw new BadRequestException('Swap request cannot be accepted');
    }

    const offer = swapRequest.offers.find((item) => item.id === offerId);

    if (!offer) {
      throw new NotFoundException('Swap offer not found');
    }

    if (offer.offererId === userId) {
      throw new ForbiddenException('Offerers cannot accept their own offer');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.swapOffer.updateMany({
        where: { swapRequestId },
        data: { isAccepted: false },
      });

      await tx.swapOffer.update({
        where: { id: offerId },
        data: { isAccepted: true },
      });

      return tx.swapRequest.update({
        where: { id: swapRequestId },
        data: {
          status: SwapRequestStatus.AGREED,
          agreedAt: new Date(),
        },
        include: this.swapInclude,
      });
    });

    return {
      message: 'Swap offer accepted',
      data: updated,
    };
  }

  async reject(userId: string, swapRequestId: string) {
    const swapRequest = await this.getAccessibleRequest(userId, swapRequestId);

    if (swapRequest.receiverId !== userId) {
      throw new ForbiddenException('Only the receiver can reject this swap');
    }

    if (
      swapRequest.status !== SwapRequestStatus.PENDING &&
      swapRequest.status !== SwapRequestStatus.COUNTERED
    ) {
      throw new BadRequestException('Swap request cannot be rejected');
    }

    const updated = await this.prisma.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: SwapRequestStatus.REJECTED },
      include: this.swapInclude,
    });

    return {
      message: 'Swap request rejected',
      data: updated,
    };
  }

  async cancel(userId: string, swapRequestId: string) {
    const swapRequest = await this.getAccessibleRequest(userId, swapRequestId);

    if (swapRequest.initiatorId !== userId) {
      throw new ForbiddenException('Only the initiator can cancel this swap');
    }

    if (
      swapRequest.status === SwapRequestStatus.COMPLETED ||
      swapRequest.status === SwapRequestStatus.CANCELLED
    ) {
      throw new BadRequestException('Swap request cannot be cancelled');
    }

    const updated = await this.prisma.swapRequest.update({
      where: { id: swapRequestId },
      data: {
        status: SwapRequestStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: this.swapInclude,
    });

    return {
      message: 'Swap request cancelled',
      data: updated,
    };
  }

  async complete(userId: string, swapRequestId: string) {
    const swapRequest = await this.getAccessibleRequest(userId, swapRequestId);

    if (swapRequest.status !== SwapRequestStatus.AGREED) {
      throw new BadRequestException('Only agreed swaps can be completed');
    }

    const role = await this.getUserRole(userId);

    if (role !== UserRole.ADMIN && swapRequest.receiverId !== userId) {
      throw new ForbiddenException('Only the receiver can complete this swap');
    }

    const acceptedOffer = swapRequest.offers.find((offer) => offer.isAccepted);

    if (!acceptedOffer) {
      throw new BadRequestException('No accepted offer found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: swapRequest.productId },
        data: { status: ProductStatus.RESERVED },
      });

      if (acceptedOffer.productId) {
        await tx.product.update({
          where: { id: acceptedOffer.productId },
          data: { status: ProductStatus.RESERVED },
        });
      }

      return tx.swapRequest.update({
        where: { id: swapRequestId },
        data: { status: SwapRequestStatus.COMPLETED },
        include: this.swapInclude,
      });
    });

    return {
      message: 'Swap request completed',
      data: updated,
    };
  }

  private async getAccessibleRequest(userId: string, swapRequestId: string) {
    const role = await this.getUserRole(userId);
    const swapRequest = await this.prisma.swapRequest.findUnique({
      where: { id: swapRequestId },
      include: this.swapInclude,
    });

    if (!swapRequest) {
      throw new NotFoundException('Swap request not found');
    }

    if (
      role !== UserRole.ADMIN &&
      swapRequest.initiatorId !== userId &&
      swapRequest.receiverId !== userId
    ) {
      throw new ForbiddenException('You cannot access this swap request');
    }

    return swapRequest;
  }

  private async ensureActiveProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Product is not available for swap');
    }

    return product;
  }

  private async ensureOwnedActiveProduct(userId: string, productId: string) {
    const product = await this.ensureActiveProduct(productId);

    if (product.sellerId !== userId) {
      throw new ForbiddenException('You can only offer your own products');
    }

    return product;
  }

  private async getUserRole(userId: string): Promise<UserRole> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is suspended');
    }

    return user.role;
  }
}
