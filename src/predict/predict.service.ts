import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, formatUnits, Wallet } from 'ethers';
import { OrderBuilder, ChainId } from '@predictdotfun/sdk';

@Injectable()
export class PredictService implements OnModuleInit {
  private readonly logger = new Logger(PredictService.name);
  private orderBuilder: OrderBuilder | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log('Initializing predict bot...');
    await this.initialize();
  }

  private async initialize() {
    try {
      // Validate environment variable
      const walletPrivateKey = this.configService.get<string>('WALLET_PRIVATE_KEY');
      if (!walletPrivateKey) {
        this.logger.warn('WALLET_PRIVATE_KEY environment variable is not set. Predict bot will not be initialized.');
        return;
      }

      // Initialize the wallet with your private key
      const signer = new Wallet(walletPrivateKey);
      this.logger.log(`Wallet address: ${signer.address}`);

      // Create a new instance of the OrderBuilder class. Note: This should only be done once per signer
      this.logger.log('Connecting to BSC network...');
      this.orderBuilder = await OrderBuilder.make(ChainId.BnbMainnet, signer);
      this.logger.log('OrderBuilder initialized successfully');

      const usdtBalance = await this.checkBalance();
      this.logger.log(`Current balance: ${formatUnits(usdtBalance, 6)} USDT`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Error message:', error.message);
      } else {
        this.logger.error('Failed to initialize predict bot', error);
      }
      // Don't throw - allow the app to start even if bot initialization fails
    }
  }

  async checkBalance(): Promise<bigint> {
    if (!this.orderBuilder) {
      throw new Error('OrderBuilder not initialized');
    }

    // Fetch the current account/wallet balance in wei
    const balanceWei = await this.orderBuilder.balanceOf();
    return balanceWei;
  }

  /**
   * Get the OrderBuilder instance
   * Use this method to access OrderBuilder in other methods or inject this service elsewhere
   */
  getOrderBuilder(): OrderBuilder {
    if (!this.orderBuilder) {
      throw new Error('OrderBuilder not initialized');
    }
    return this.orderBuilder;
  }
}

